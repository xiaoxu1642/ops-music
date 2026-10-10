use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

/// 环形缓冲区最大样本数
const MAX_BUFFER_SIZE: usize = 8192;

/// 频谱采集输入缓冲骨架
///
/// 频谱可视化已退役，FFT 分析、推送定时器与 NAPI 接口同步移除；本结构只剩
/// 采集侧骨架，供播放输出链路（transition_source）继续引用，避免改动播放路径。
/// 分析开关恒为关闭且不再有 setter，采样只进缓冲区、不会被解读。
pub struct FftAnalyzer {
    /// 双声道样本环形缓冲区（由播放线程写入）
    sample_buffer: Mutex<StereoSampleBuffer>,
    /// 是否启用频谱分析（恒为 false）
    enabled: AtomicBool,
}

struct StereoSampleBuffer {
    left: Vec<f32>,
    right: Vec<f32>,
    write_pos: usize,
    len: usize,
}

impl FftAnalyzer {
    pub fn new() -> Self {
        Self {
            sample_buffer: Mutex::new(StereoSampleBuffer {
                left: vec![0.0; MAX_BUFFER_SIZE],
                right: vec![0.0; MAX_BUFFER_SIZE],
                write_pos: 0,
                len: 0,
            }),
            enabled: AtomicBool::new(false),
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

    /// 是否启用频谱分析（恒为 false）
    pub fn is_enabled(&self) -> bool {
        self.enabled.load(Ordering::Relaxed)
    }

    /// 重置样本缓冲区（例如 seek 时）
    pub fn reset(&self) {
        let mut buffer = self.sample_buffer.lock();
        buffer.write_pos = 0;
        buffer.len = 0;
    }
}

#[cfg(test)]
#[path = "tests/fft.rs"]
mod tests;
