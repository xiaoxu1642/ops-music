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
 * 只在系统媒体控件启用时调用（各 setter 与 enable 都做配置门控），
 * 关闭态下 media-ctrl.node 不再进入主进程内存
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
    // initialize 内部把 SMTC 的 IsEnabled 置 false，必须再 enable 才会接管系统媒体会话
    mc.enable();
    mediaLog.info("系统媒体控件已初始化");
  } catch (error) {
    mediaLog.error("初始化失败:", error);
  }
  return mc;
};

/** 是否启用系统媒体控件；关闭时连原生模块都不加载 */
const isEnabled = (): boolean => !!store.get("media.systemMediaControls");

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
export const setMetadata = (param: MetadataParam): void => {
  if (!isEnabled()) return;
  safeCall(() => ensureLoaded()?.setMetadata(param));
};

/** 更新播放状态 */
export const setPlayState = (param: PlayStateParam): void => {
  if (!isEnabled()) return;
  safeCall(() => ensureLoaded()?.setPlayState(param));
};

/** 更新播放进度 */
export const setTimeline = (param: TimelineParam): void => {
  if (!isEnabled()) return;
  safeCall(() => ensureLoaded()?.setTimeline(param));
};

/** 更新播放速率 */
export const setRate = (rate: number): void => {
  if (!isEnabled()) return;
  safeCall(() => ensureLoaded()?.setRate(rate));
};

/** 更新音量 */
export const setVolume = (volume: number): void => {
  if (!isEnabled()) return;
  safeCall(() => ensureLoaded()?.setVolume(volume));
};
