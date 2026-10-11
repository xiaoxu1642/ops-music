import { loadNativeModule } from "@main/utils/nativeLoader";
import { mediaLog, nativeLogsDir } from "@main/utils/logger";
import { isDev } from "@main/utils/config";
import { store } from "@main/store";
import type { MediaEvent, MetadataParam, PlayStateParam, TimelineParam } from "@splayer/media-ctrl";

export type { MediaEvent, MetadataParam, PlayStateParam, TimelineParam };

type MediaCtrlModule = typeof import("@splayer/media-ctrl");

let mc: MediaCtrlModule | null = null;
let loaded = false;
let eventHandler: ((event: MediaEvent) => void) | null = null;

/** 安全调用原生方法 */
const safeCall = (fn: () => void): void => {
  try {
    fn();
  } catch (error) {
    mediaLog.error("media-ctrl 调用失败:", error);
  }
};

/**
 * 按需加载并初始化原生模块
 * 首次真正用到媒体集成（播放、启用、音量等）时才载入 .node，
 * 不用系统媒体控制的场景主进程不再常驻模块内存
 */
const ensureLoaded = (): MediaCtrlModule | null => {
  if (loaded) return mc;
  loaded = true;
  mc = loadNativeModule<MediaCtrlModule>("media-ctrl.node", "media-ctrl");
  if (!mc) {
    mediaLog.warn("media-ctrl 模块未找到，媒体集成不可用");
    return null;
  }

  try {
    mc.initLogger(nativeLogsDir, isDev);
    mc.initialize();
    mc.onEvent((event) => {
      eventHandler?.(event);
    });
    const mediaConfig = store.get("media");
    if (mediaConfig.systemMediaControls) {
      mc.enable();
    }
    mediaLog.info("系统媒体控件已初始化");
  } catch (error) {
    mediaLog.error("初始化失败:", error);
  }
  return mc;
};

/** 启用系统媒体控件 */
export const enable = (): void => safeCall(() => ensureLoaded()?.enable());

/** 禁用系统媒体控件 */
export const disable = (): void => safeCall(() => mc?.disable());

/** 关闭并清理资源 */
export const shutdown = (): void => safeCall(() => mc?.shutdown());

/** 注册系统媒体事件处理器（播放/暂停/上下首等） */
export const onEvent = (handler: (event: MediaEvent) => void): void => {
  eventHandler = handler;
};

/** 更新歌曲元数据 */
export const setMetadata = (param: MetadataParam): void =>
  safeCall(() => ensureLoaded()?.setMetadata(param));

/** 更新播放状态 */
export const setPlayState = (param: PlayStateParam): void =>
  safeCall(() => ensureLoaded()?.setPlayState(param));

/** 更新播放进度 */
export const setTimeline = (param: TimelineParam): void =>
  safeCall(() => ensureLoaded()?.setTimeline(param));

/** 更新播放速率 */
export const setRate = (rate: number): void => safeCall(() => ensureLoaded()?.setRate(rate));

/** 更新音量 */
export const setVolume = (volume: number): void =>
  safeCall(() => ensureLoaded()?.setVolume(volume));
