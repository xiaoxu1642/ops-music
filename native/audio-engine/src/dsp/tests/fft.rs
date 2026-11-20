use super::*;

#[test]
fn interleaved_samples_wrap_without_mixing_channels() {
    let analyzer = FftAnalyzer::new();
    let samples: Vec<f32> = (0..MAX_BUFFER_SIZE + 16)
        .flat_map(|i| [i as f32, -(i as f32)])
        .collect();

    analyzer.push_interleaved_samples(&samples);

    let buffer = analyzer.sample_buffer.lock();
    assert_eq!(buffer.len, MAX_BUFFER_SIZE);
    assert_eq!(buffer.write_pos, 16);
    let latest = (buffer.write_pos + MAX_BUFFER_SIZE - 1) % MAX_BUFFER_SIZE;
    assert_eq!(buffer.left[latest], (MAX_BUFFER_SIZE + 15) as f32);
    assert_eq!(buffer.right[latest], -((MAX_BUFFER_SIZE + 15) as f32));
}

#[test]
fn reset_discards_buffered_samples() {
    let analyzer = FftAnalyzer::new();
    analyzer.push_interleaved_samples(&[0.5, -0.5, 0.25, -0.25]);

    analyzer.reset();

    let buffer = analyzer.sample_buffer.lock();
    assert_eq!(buffer.len, 0);
    assert_eq!(buffer.write_pos, 0);
}

#[test]
fn audio_callback_does_not_wait_for_spectrum_analysis() {
    let analyzer = std::sync::Arc::new(FftAnalyzer::new());
    let guard = analyzer.sample_buffer.lock();
    let writer = std::sync::Arc::clone(&analyzer);
    let (tx, rx) = std::sync::mpsc::channel();
    let thread = std::thread::spawn(move || {
        writer.push_interleaved_samples(&[0.25, -0.25]);
        tx.send(()).unwrap();
    });
    let completed = rx.recv_timeout(std::time::Duration::from_secs(1));
    drop(guard);
    thread.join().unwrap();
    assert!(completed.is_ok());
}

#[test]
fn analyze_outputs_silent_bars_when_buffer_is_quiet() {
    let analyzer = FftAnalyzer::new();
    analyzer.set_sample_rate(48_000);
    // 静默：缓冲样本不足 FFT 窗口
    analyzer.push_interleaved_samples(&[0.5_f32, -0.5, 0.5, -0.5]);
    assert!(analyzer.analyze().iter().all(|v| *v == 0.0));
}

#[test]
fn analyze_outputs_zero_when_buffer_stops_growing() {
    let analyzer = FftAnalyzer::new();
    analyzer.set_sample_rate(48_000);
    // 500Hz 正弦波在 80–2000Hz 分析范围内，足够填满 FFT 窗口
    let samples: Vec<f32> = (0..4096)
        .flat_map(|i| {
            let v = (2.0 * std::f32::consts::PI * 500.0 * i as f32 / 48_000.0).sin() * 0.5;
            [v, -v]
        })
        .collect();
    analyzer.push_interleaved_samples(&samples);
    let first = analyzer.analyze();
    assert_eq!(first.len(), SPECTRUM_BARS);
    // 播放中：信号落在分析范围内，柱有能量
    assert!(first.iter().any(|v| *v > 0.05), "bars={first:?}");
    // 暂停（缓冲不再增长）：第二次 analyze 归零
    let second = analyzer.analyze();
    assert!(second.iter().all(|v| *v == 0.0));
}

#[test]
fn analyze_tracks_in_range_tone() {
    let analyzer = FftAnalyzer::new();
    analyzer.set_sample_rate(48_000);
    // 440Hz 正弦波位于对数分频的中间柱；样本数避开 8192 环形绕回点（write_pos 恰为 0 会撞静默检测）
    let samples: Vec<f32> = (0..8192 + 2048)
        .flat_map(|i| {
            let v = (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 48_000.0).sin() * 0.8;
            [v, v]
        })
        .collect();
    analyzer.push_interleaved_samples(&samples);
    let bars = analyzer.analyze();
    let peak = bars.iter().cloned().fold(0.0_f32, f32::max);
    assert!(peak > 0.3, "peak={peak} bars={bars:?}");
}
