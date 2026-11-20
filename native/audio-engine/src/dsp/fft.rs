use parking_lot::Mutex;
use rustfft::{num_complex::Complex, Fft, FftPlanner};
use std::sync::atomic::{AtomicU32, AtomicUsize, Ordering};
use std::sync::Arc;

/// 每次 FFT 的样本数
const FFT_SIZE: usize = 2048;
/// 输出柱数（与渲染端 SpectrumCanvas 的柱数对齐）
pub const SPECTRUM_BARS: usize = 34;
/// 分析频率范围（Hz），柱按对数间距划分
const MIN_FREQ: f32 = 80.0;
const MAX_FREQ: f32 = 2000.0;
/// 环形缓冲区最大样本数
const MAX_BUFFER_SIZE: usize = 8192;

/// 频谱分析器，接收播放输出链路的交织双声道样本并聚合出可视化柱数据。
/// 播放暂停后缓冲区不再增长，analyze 输出全零，平滑衰减交给渲染端。
pub struct FftAnalyzer {
    sample_rate: AtomicU32,
    /// 双声道样本环形缓冲区（由播放线程写入）
    sample_buffer: Mutex<StereoSampleBuffer>,
    /// 缓存的 FFT 计划（避免每次分析时重建）
    fft_plan: Arc<dyn Fft<f32>>,
    /// 预计算的 Hamming 窗，避免每次分析重复计算三角函数
    window: Vec<f32>,
    /// 预分配的 FFT 工作缓冲区（避免每次分析分配）
    work: Mutex<FftWorkBuffers>,
    /// 上次分析时的缓冲写入位置，用于静默检测（暂停后 write_pos 不再滚动；
    /// 不能用 len 判断——环形缓冲写满后 len 恒为 MAX_BUFFER_SIZE）
    last_seen_pos: AtomicUsize,
}

struct StereoSampleBuffer {
    left: Vec<f32>,
    right: Vec<f32>,
    write_pos: usize,
    len: usize,
}

/// 预分配的 FFT 工作缓冲区
struct FftWorkBuffers {
    windowed_l: Vec<Complex<f32>>,
    windowed_r: Vec<Complex<f32>>,
}

impl FftAnalyzer {
    pub fn new() -> Self {
        let mut planner = FftPlanner::<f32>::new();
        let fft_plan = planner.plan_fft_forward(FFT_SIZE);
        let window = (0..FFT_SIZE)
            .map(|i| {
                0.54 - 0.46
                    * (2.0 * std::f32::consts::PI * i as f32 / (FFT_SIZE as f32 - 1.0)).cos()
            })
            .collect();

        Self {
            sample_rate: AtomicU32::new(48_000),
            sample_buffer: Mutex::new(StereoSampleBuffer {
                left: vec![0.0; MAX_BUFFER_SIZE],
                right: vec![0.0; MAX_BUFFER_SIZE],
                write_pos: 0,
                len: 0,
            }),
            fft_plan,
            window,
            work: Mutex::new(FftWorkBuffers {
                windowed_l: vec![Complex::new(0.0, 0.0); FFT_SIZE],
                windowed_r: vec![Complex::new(0.0, 0.0); FFT_SIZE],
            }),
            last_seen_pos: AtomicUsize::new(0),
        }
    }

    /// 直接从交织立体声样本推入（由播放线程调用），一次遍历无需中间分配
    pub fn push_interleaved_samples(&self, interleaved: &[f32]) {
        // 频谱允许丢弃一次更新，音频回调不能等待分析线程。
        let Some(mut buffer) = self.sample_buffer.try_lock() else {
            return;
        };
        for pair in interleaved.chunks_exact(2) {
            let write_pos = buffer.write_pos;
            buffer.left[write_pos] = pair[0];
            buffer.right[write_pos] = pair[1];
            buffer.write_pos = (write_pos + 1) % MAX_BUFFER_SIZE;
            buffer.len = (buffer.len + 1).min(MAX_BUFFER_SIZE);
        }
    }

    /// 使用实际混音输出的采样率解释频谱，不在音频回调中重采样
    pub fn set_sample_rate(&self, sample_rate: u32) {
        self.sample_rate.store(sample_rate, Ordering::Relaxed);
    }

    /// 重置样本缓冲区（例如 seek 时）
    pub fn reset(&self) {
        let mut buffer = self.sample_buffer.lock();
        buffer.write_pos = 0;
        buffer.len = 0;
        self.last_seen_pos.store(0, Ordering::Relaxed);
    }

    /// 应用预计算的 Hamming 窗
    fn apply_window(&self, samples: &[f32], start: usize, windowed: &mut [Complex<f32>]) {
        for (i, output) in windowed.iter_mut().enumerate() {
            let sample = samples[(start + i) % MAX_BUFFER_SIZE];
            *output = Complex::new(sample * self.window[i], 0.0);
        }
    }

    /// 转化为 dB 并归一化到 [0, 1]
    fn to_normalized_db(&self, avg: f32) -> f32 {
        let db = 20.0 * (avg + 1e-10).log10();
        ((db + 60.0) / 60.0).clamp(0.0, 1.0)
    }

    /// 计算频谱柱，返回 SPECTRUM_BARS 个值，范围 [0.0, 1.0]，左右声道平均。
    /// 缓冲样本不足或写入位置未滚动（暂停/静默）时输出全零。
    pub fn analyze(&self) -> Vec<f32> {
        let buffer = self.sample_buffer.lock();
        let len = buffer.len;
        // 静默检测：写入位置与上次一致说明输出回调已停（暂停/停止），直接归零
        if len < FFT_SIZE
            || buffer.write_pos == self.last_seen_pos.swap(buffer.write_pos, Ordering::Relaxed)
        {
            drop(buffer);
            return vec![0.0; SPECTRUM_BARS];
        }

        // 取最新的 FFT_SIZE 个样本
        let start = (buffer.write_pos + MAX_BUFFER_SIZE - FFT_SIZE) % MAX_BUFFER_SIZE;

        let mut work = self.work.lock();

        // 应用 Hamming 窗（复用预分配的 windowed 缓冲区）
        self.apply_window(&buffer.left, start, &mut work.windowed_l);
        self.apply_window(&buffer.right, start, &mut work.windowed_r);

        // 释放 sample_buffer 锁（后续计算不需要它）
        drop(buffer);

        // 执行 FFT（使用缓存的计划，原地处理）
        self.fft_plan.process(&mut work.windowed_l);
        self.fft_plan.process(&mut work.windowed_r);

        // 将频率段按对数间距映射到输出柱
        let freq_per_bin = self.sample_rate.load(Ordering::Relaxed) as f32 / FFT_SIZE as f32;
        let min_bin = (MIN_FREQ / freq_per_bin).floor() as usize;
        let max_bin = ((MAX_FREQ / freq_per_bin).ceil() as usize).min(FFT_SIZE / 2);

        let mut bars = vec![0.0; SPECTRUM_BARS];
        if min_bin >= max_bin {
            return bars;
        }

        let log_min = MIN_FREQ.ln();
        let log_max = MAX_FREQ.ln();

        for (i, bar) in bars.iter_mut().enumerate() {
            let freq_lo = (log_min + (log_max - log_min) * i as f32 / SPECTRUM_BARS as f32).exp();
            let freq_hi =
                (log_min + (log_max - log_min) * (i + 1) as f32 / SPECTRUM_BARS as f32).exp();

            let bin_lo = ((freq_lo / freq_per_bin).floor() as usize).max(min_bin);
            let bin_hi = ((freq_hi / freq_per_bin).ceil() as usize).min(max_bin);

            if bin_lo >= bin_hi {
                continue;
            }

            // 左右声道在该频段内的平均幅度合并，转为 dB 归一化
            let mut sum = 0.0;
            for j in bin_lo..bin_hi {
                sum += (work.windowed_l[j].norm() + work.windowed_r[j].norm())
                    / (2.0 * FFT_SIZE as f32);
            }
            let avg = sum / (bin_hi - bin_lo) as f32;
            *bar = self.to_normalized_db(avg);
        }

        bars
    }
}

#[cfg(test)]
#[path = "tests/fft.rs"]
mod tests;
