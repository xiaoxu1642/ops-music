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
