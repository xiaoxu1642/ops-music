//! 跨平台系统媒体控件（Windows SMTC / Linux MPRIS / macOS MPNowPlaying）。
//! 通过 NAPI-RS 暴露给 Node.js，作为 Electron 主进程的原生模块。

mod logger;
mod model;
mod sys_media;

use napi::{
    Result,
    bindgen_prelude::{Function, Unknown},
    threadsafe_function::UnknownReturnValue,
};
use napi_derive::napi;
use tracing::{error, info};

use model::{
    MediaEvent, MetadataParam, MetadataPayload, PlayModeParam, PlayStateParam, TimelineParam,
};

/// 初始化原生日志系统（主进程启动时调用一次）
#[napi]
pub fn init_logger(log_dir: String, is_dev: bool) {
    logger::init_logger(&log_dir, is_dev);
    info!(log_dir, is_dev, "media-ctrl 日志系统已初始化");
}

/// 初始化系统媒体控件
#[napi]
pub fn initialize() -> Result<()> {
    info!("初始化系统媒体控件");
    sys_media::get_platform_controls()
        .initialize()
        .map_err(|e| {
            error!(error = %e, "系统媒体控件初始化失败");
            napi::Error::from_reason(e.to_string())
        })?;
    Ok(())
}

/// 关闭并清理资源
#[napi]
pub fn shutdown() {
    info!("关闭媒体控件");
    let _ = sys_media::get_platform_controls().shutdown();
}

/// 启用系统媒体控件
#[napi]
pub fn enable() -> Result<()> {
    sys_media::get_platform_controls()
        .enable()
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 禁用系统媒体控件
#[napi]
pub fn disable() -> Result<()> {
    sys_media::get_platform_controls()
        .disable()
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 注册媒体事件回调（播放/暂停/上一首/下一首等）
#[napi(ts_args_type = "callback: (event: MediaEvent) => void")]
#[allow(clippy::needless_pass_by_value)]
pub fn on_event(callback: Function<Unknown<'static>, UnknownReturnValue>) -> Result<()> {
    let tsfn = callback
        .build_threadsafe_function::<MediaEvent>()
        .build_callback(|ctx| Ok(ctx.value))?;
    sys_media::get_platform_controls()
        .register_event_handler(tsfn)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 更新歌曲元数据（系统媒体控件）
#[napi]
pub fn set_metadata(param: MetadataParam) {
    let payload = MetadataPayload::from(param);
    sys_media::get_platform_controls().update_metadata(payload);
}

/// 更新播放状态
#[napi]
pub fn set_play_state(param: PlayStateParam) {
    sys_media::get_platform_controls().update_playback_status(param);
}

/// 更新播放速率
#[napi]
pub fn set_rate(rate: f64) {
    sys_media::get_platform_controls().update_playback_rate(rate);
}

/// 更新音量
#[napi]
pub fn set_volume(volume: f64) {
    sys_media::get_platform_controls().update_volume(volume);
}

/// 更新播放进度
#[napi]
pub fn set_timeline(param: TimelineParam) {
    sys_media::get_platform_controls().update_timeline(param);
}

/// 更新播放模式（随机/循环）
#[napi]
pub fn set_play_mode(param: PlayModeParam) {
    sys_media::get_platform_controls().update_play_mode(param);
}
