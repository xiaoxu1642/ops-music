import { loadNativeModule } from "@main/utils/nativeLoader";
import { taskbarLog } from "@main/utils/logger";
import * as nowPlaying from "@main/services/nowPlaying";
import type { TaskbarLyricAutoCloseReason } from "@shared/types/window";

type TaskbarLyricNative = typeof import("@splayer/taskbar-lyric");

/** 全屏应用检测轮询间隔（毫秒） */
const FULLSCREEN_POLL_MS = 2_000;
/** 暂停持续多久后自动销毁（毫秒） */
const PAUSE_AUTO_CLOSE_MS = 5 * 60 * 1000;

/** 启动自动销毁监听的选项 */
export interface TaskbarLyricAutoCloseOptions {
  /** 命中条件时回调（由调用方负责销毁窗口与提示用户） */
  onAutoClose: (reason: TaskbarLyricAutoCloseReason) => void;
}

let nativeModule: TaskbarLyricNative | null = null;
let fullscreenTimer: NodeJS.Timeout | null = null;
let pauseTimer: NodeJS.Timeout | null = null;
let unsubscribeNowPlaying: (() => void) | null = null;
let lastFullscreen = false;
let paused = false;
let onAutoClose: ((reason: TaskbarLyricAutoCloseReason) => void) | null = null;

/** 清除暂停计时 */
const clearPauseTimer = (): void => {
  if (pauseTimer) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
};

/** （重新）启动 5 分钟暂停计时 */
const armPauseTimer = (): void => {
  clearPauseTimer();
  pauseTimer = setTimeout(() => {
    pauseTimer = null;
    onAutoClose?.("paused");
  }, PAUSE_AUTO_CLOSE_MS);
};

/**
 * 开始自动销毁监听：全屏应用检测轮询 + 暂停时长计时
 * 窗口创建后调用；窗口销毁时必须调用 stopTaskbarLyricAutoClose
 * 暂停计时只在观察到「播放 → 暂停」转变后武装——创建时已处于暂停不立即计时，
 * 避免用户手动打开歌词后又被自动关闭形成循环烦扰
 * @param options - 回调配置
 */
export const startTaskbarLyricAutoClose = (options: TaskbarLyricAutoCloseOptions): void => {
  stopTaskbarLyricAutoClose();
  onAutoClose = options.onAutoClose;
  paused = nowPlaying.snapshot().state === "paused";

  // 全屏轮询：首帧只记状态，之后按「非全屏 → 全屏」的上升沿触发
  if (!nativeModule) {
    nativeModule = loadNativeModule<TaskbarLyricNative>("taskbar-lyric.node", "taskbar-lyric");
  }
  if (nativeModule) {
    lastFullscreen = nativeModule.isFullscreenAppRunning();
    fullscreenTimer = setInterval(() => {
      const current = nativeModule?.isFullscreenAppRunning() ?? false;
      if (current && !lastFullscreen) onAutoClose?.("fullscreen");
      lastFullscreen = current;
    }, FULLSCREEN_POLL_MS);
  } else {
    taskbarLog.warn("全屏检测不可用：原生模块未加载");
  }

  unsubscribeNowPlaying = nowPlaying.onPositionSync((data) => {
    if (data.state === "paused") {
      if (paused) return;
      paused = true;
      armPauseTimer();
      return;
    }
    if (!paused) return;
    paused = false;
    clearPauseTimer();
  });
};

/** 停止自动销毁监听并清理全部计时器与订阅 */
export const stopTaskbarLyricAutoClose = (): void => {
  if (fullscreenTimer) {
    clearInterval(fullscreenTimer);
    fullscreenTimer = null;
  }
  clearPauseTimer();
  unsubscribeNowPlaying?.();
  unsubscribeNowPlaying = null;
  onAutoClose = null;
  lastFullscreen = false;
  paused = false;
};
