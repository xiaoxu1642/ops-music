import type { LifecycleMode, LifecycleState } from "@shared/types/window";

type ModeListener = (mode: LifecycleMode, previous: LifecycleMode) => void;

interface LegacyLifecycleBridge {
  getCurrentMode?: () => unknown;
  onModeChanged?: (callback: (payload: unknown) => void) => () => void;
}

interface RendererLifecycleWindowBridge {
  onLifecycleModeChange?: (callback: (payload: LifecycleState) => void) => () => void;
  getLifecycleState?: () => Promise<LifecycleState>;
}

let currentMode: LifecycleMode = "full";
let initialized = false;
let unsubscribeLifecycle: (() => void) | null = null;
let initialQuerySeq = 0;
const listeners = new Set<ModeListener>();

const MODES = new Set<LifecycleMode>([
  "full",
  "minimizedWithLyric",
  "minimizedWithoutLyric",
  "tray",
]);

/** 从主进程负载中归一化生命周期模式 */
const readMode = (value: unknown): LifecycleMode | null => {
  if (typeof value === "string")
    return MODES.has(value as LifecycleMode) ? (value as LifecycleMode) : null;
  if (!value || typeof value !== "object") return null;
  const mode = (value as Partial<LifecycleState>).mode;
  return typeof mode === "string" && MODES.has(mode as LifecycleMode)
    ? (mode as LifecycleMode)
    : null;
};

/** 判断当前模式是否允许智能过渡与歌词等完整播放能力 */
export const isSmartTransitionEnabled = (): boolean =>
  currentMode === "full" || currentMode === "minimizedWithLyric";

/** 判断当前模式是否属于只保留基础播放的受限态 */
export const isPlaybackRestrictedMode = (): boolean => !isSmartTransitionEnabled();

/** 判断完整 UI 是否处于挂载态 */
export const isFullUiMode = (): boolean => currentMode === "full";

/** 获取当前渲染进程使用的生命周期模式 */
export const getPlaybackLifecycleMode = (): LifecycleMode => currentMode;

/** 纯函数版能力判定，供测试与不依赖单例状态的调用方使用 */
export const isSmartTransitionEnabledForMode = (mode: LifecycleMode): boolean =>
  mode === "full" || mode === "minimizedWithLyric";

const setMode = (mode: LifecycleMode): void => {
  if (mode === currentMode) return;
  const previous = currentMode;
  currentMode = mode;
  for (const listener of listeners) listener(mode, previous);
};

/**
 * 初始化生命周期桥接；兼容 window.api.window 与旧版 window.api.lifecycle
 * @returns 初始化后的当前模式
 */
export const initPlaybackModeBridge = (): LifecycleMode => {
  if (initialized) return currentMode;
  initialized = true;
  if (typeof window === "undefined") return currentMode;

  const querySeq = ++initialQuerySeq;
  const api = (window.api ?? {}) as {
    lifecycle?: LegacyLifecycleBridge;
    window?: RendererLifecycleWindowBridge;
  };

  const unsubscribeLegacy = api.lifecycle?.onModeChanged?.((payload) => {
    const mode = readMode(payload);
    if (!mode) return;
    initialQuerySeq += 1;
    setMode(mode);
  });
  const unsubscribeWindow = api.window?.onLifecycleModeChange?.((payload) => {
    const mode = readMode(payload);
    if (!mode) return;
    initialQuerySeq += 1;
    setMode(mode);
  });
  unsubscribeLifecycle = () => {
    unsubscribeLegacy?.();
    unsubscribeWindow?.();
  };

  const syncInitial = readMode(api.lifecycle?.getCurrentMode?.());
  if (syncInitial) setMode(syncInitial);

  void api.window?.getLifecycleState?.().then(
    (state) => {
      if (querySeq !== initialQuerySeq) return;
      const mode = readMode(state);
      if (mode) setMode(mode);
    },
    () => {},
  );

  return currentMode;
};

/**
 * 订阅播放模式变化
 * @param listener - 接收新模式与旧模式
 * @returns 解绑函数
 */
export const onPlaybackModeChange = (listener: ModeListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** 向主进程上报可选的启动里程碑，接口缺失时静默跳过 */
export const reportPlaybackStartupMilestone = (milestone: string): void => {
  if (typeof window === "undefined") return;
  window.api.startup?.reportMilestone?.(
    milestone as "playbackRuntimeReady" | "playbackReady" | "fullUiReady",
  );
};

/** 重置模块状态，仅供测试隔离 */
export const resetPlaybackModeForTests = (): void => {
  unsubscribeLifecycle?.();
  unsubscribeLifecycle = null;
  listeners.clear();
  currentMode = "full";
  initialized = false;
  initialQuerySeq = 0;
};

/** 测试用模式注入 */
export const setPlaybackModeForTests = (mode: LifecycleMode): void => {
  initialized = true;
  setMode(mode);
};
