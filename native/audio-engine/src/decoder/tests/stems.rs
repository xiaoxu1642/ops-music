use crate::decoder::stems::StemWindow;
use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const MIN_STEM_FRAMES: u32 = 88_200;
const MAX_STEM_FRAMES: u32 = 1_058_444;
const BYTES_PER_FRAME: u64 = 24;

static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

struct TempFile {
    path: String,
}

impl TempFile {
    fn new() -> Self {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        for _ in 0..8 {
            let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "ops-music-stem-window-{}-{}-{}.bin",
                std::process::id(),
                timestamp,
                sequence
            ));
            match OpenOptions::new().write(true).create_new(true).open(&path) {
                Ok(_) => {
                    return Self {
                        path: path.to_string_lossy().into_owned(),
                    };
                }
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(error) => panic!("创建声部窗口临时文件失败: {error}"),
            }
        }
        panic!("创建声部窗口临时文件失败: 唯一文件名重试次数用尽");
    }

    fn write_zero_len(&self, len: u64) {
        let file = OpenOptions::new().write(true).open(&self.path).unwrap();
        file.set_len(len).unwrap();
    }

    fn write_samples(&self, values: impl IntoIterator<Item = f32>) {
        let file = File::create(&self.path).unwrap();
        let mut writer = BufWriter::new(file);
        for value in values {
            writer.write_all(&value.to_le_bytes()).unwrap();
        }
        writer.flush().unwrap();
    }
}

impl Drop for TempFile {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn assert_invalid_window(path: &str, start: f64, frames: u32) {
    let error = StemWindow::load(path, start, frames)
        .err()
        .expect("声部窗口应校验失败");
    assert!(error.to_string().contains("无效的声部窗口"));
}

#[test]
fn min_legal_window_loads() {
    let file = TempFile::new();
    file.write_zero_len(u64::from(MIN_STEM_FRAMES) * BYTES_PER_FRAME);

    let window = StemWindow::load(&file.path, 0.0, MIN_STEM_FRAMES).unwrap();

    assert_eq!(std::sync::Arc::strong_count(&window), 1);
}

#[test]
fn max_legal_window_loads() {
    let file = TempFile::new();
    file.write_zero_len(u64::from(MAX_STEM_FRAMES) * BYTES_PER_FRAME);

    let window = StemWindow::load(&file.path, 0.0, MAX_STEM_FRAMES).unwrap();

    assert_eq!(std::sync::Arc::strong_count(&window), 1);
}

#[test]
fn file_one_byte_short_is_rejected() {
    let file = TempFile::new();
    let expected_len = u64::from(MIN_STEM_FRAMES) * BYTES_PER_FRAME - 1;
    file.write_zero_len(expected_len);

    let error = StemWindow::load(&file.path, 0.0, MIN_STEM_FRAMES)
        .err()
        .expect("声部文件长度校验应失败");

    assert!(error.to_string().contains("声部文件长度不匹配"));
}

#[test]
fn file_one_byte_extra_is_rejected() {
    let file = TempFile::new();
    let expected_len = u64::from(MIN_STEM_FRAMES) * BYTES_PER_FRAME + 1;
    file.write_zero_len(expected_len);

    let error = StemWindow::load(&file.path, 0.0, MIN_STEM_FRAMES)
        .err()
        .expect("声部文件长度校验应失败");

    assert!(error.to_string().contains("声部文件长度不匹配"));
}

#[test]
fn out_of_range_frames_are_rejected() {
    let file = TempFile::new();
    file.write_zero_len(u64::from(MIN_STEM_FRAMES) * BYTES_PER_FRAME);

    assert_invalid_window(&file.path, 0.0, MIN_STEM_FRAMES - 1);
    assert_invalid_window(&file.path, 0.0, MAX_STEM_FRAMES + 1);
}

#[test]
fn non_finite_start_is_rejected() {
    let file = TempFile::new();
    file.write_zero_len(u64::from(MIN_STEM_FRAMES) * BYTES_PER_FRAME);

    assert_invalid_window(&file.path, f64::NAN, MIN_STEM_FRAMES);
    assert_invalid_window(&file.path, f64::INFINITY, MIN_STEM_FRAMES);
    assert_invalid_window(&file.path, f64::NEG_INFINITY, MIN_STEM_FRAMES);
}

#[test]
fn invalid_samples_are_rejected() {
    let total_samples = MIN_STEM_FRAMES as usize * 6;
    for invalid_sample in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
        let file = TempFile::new();
        let values = std::iter::repeat(0.0)
            .take(total_samples - 1)
            .chain([invalid_sample]);
        file.write_samples(values);

        let error = StemWindow::load(&file.path, 0.0, MIN_STEM_FRAMES)
            .err()
            .expect("无效采样应校验失败");

        assert!(error.to_string().contains("声部文件含无效采样"));
    }
}

#[test]
fn fixed_pattern_data_has_consistent_read_output() {
    let file = TempFile::new();
    let stem_values = [0.25, -0.5, 0.75];
    let values = std::iter::repeat(stem_values.iter().copied().chain(stem_values))
        .flatten()
        .take(MIN_STEM_FRAMES as usize * 6);
    file.write_samples(values);
    let window = StemWindow::load(&file.path, 0.0, MIN_STEM_FRAMES).unwrap();

    let first_output = window.read(10_000, 8, 44_100, 2).unwrap();
    let second_output = window.read(10_000, 8, 44_100, 2).unwrap();

    assert_eq!(first_output, second_output);
}

#[test]
fn temporary_file_is_deletable_after_load() {
    let file = TempFile::new();
    file.write_zero_len(u64::from(MIN_STEM_FRAMES) * BYTES_PER_FRAME);
    let window = StemWindow::load(&file.path, 0.0, MIN_STEM_FRAMES).unwrap();

    fs::remove_file(&file.path).unwrap();
    drop(window);
}

#[test]
fn arc_drop_releases_temporary_file_handle() {
    let file = TempFile::new();
    file.write_zero_len(u64::from(MIN_STEM_FRAMES) * BYTES_PER_FRAME);
    let window = StemWindow::load(&file.path, 0.0, MIN_STEM_FRAMES).unwrap();
    drop(window);

    fs::remove_file(&file.path).unwrap();
}
