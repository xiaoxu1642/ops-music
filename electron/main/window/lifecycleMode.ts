export type LifecycleMode = "full" | "minimizedWithLyric" | "minimizedWithoutLyric" | "tray";

export type LifecycleEvent = "minimize" | "closeToTray" | "restore" | "taskbarLyricChanged";

export interface LifecycleState {
  mode: LifecycleMode;
  taskbarLyricEnabled: boolean;
}

interface LifecycleModeHooks {
  onModeChanged?: (state: LifecycleState) => void;
  onEnterTray?: () => void;
  onExitTray?: () => void;
}

const createState = (taskbarLyricEnabled = false): LifecycleState => ({
  mode: "full",
  taskbarLyricEnabled,
});

let state = createState();
let hooks: LifecycleModeHooks = {};

/**
 * 计算生命周期迁移结果，无变化时返回原对象
 * @param current - 当前状态
 * @param event - 生命周期事件
 * @param enabled - 任务栏歌词开关，仅 taskbarLyricChanged 使用
 * @returns 迁移后的状态
 */
export const transitionLifecycleState = (
  current: LifecycleState,
  event: LifecycleEvent,
  enabled?: boolean,
): LifecycleState => {
  if (event === "taskbarLyricChanged") {
    if (current.mode === "tray" || typeof enabled !== "boolean") return current;
    if (enabled === current.taskbarLyricEnabled) return current;
    return {
      mode:
        current.mode === "full" ? "full" : enabled ? "minimizedWithLyric" : "minimizedWithoutLyric",
      taskbarLyricEnabled: enabled,
    };
  }

  if (event === "closeToTray") {
    if (current.mode === "tray") return current;
    return { mode: "tray", taskbarLyricEnabled: false };
  }

  if (event === "restore") {
    if (current.mode === "full") return current;
    return { mode: "full", taskbarLyricEnabled: current.taskbarLyricEnabled };
  }

  if (current.mode === "tray") return current;
  const mode = current.taskbarLyricEnabled ? "minimizedWithLyric" : "minimizedWithoutLyric";
  return current.mode === mode ? current : { ...current, mode };
};

/**
 * 注册生命周期副作用
 * @param next - 模式变化与进入托盘的回调
 */
export const configureLifecycleModeHooks = (next: LifecycleModeHooks): void => {
  hooks = next;
};

/**
 * 初始化任务栏歌词开关并回到完整态
 * @param taskbarLyricEnabled - 启动时持久化的任务栏歌词开关
 */
export const initializeLifecycleMode = (taskbarLyricEnabled: boolean): void => {
  state = createState(taskbarLyricEnabled);
};

/** 获取当前生命周期状态快照 */
export const getLifecycleState = (): LifecycleState => ({ ...state });

/** 获取当前生命周期模式 */
export const getCurrentLifecycleMode = (): LifecycleMode => state.mode;

/**
 * 应用生命周期事件并触发副作用
 * @param event - 生命周期事件
 * @param enabled - 任务栏歌词开关，仅 taskbarLyricChanged 使用
 * @returns 迁移后的生命周期模式
 */
export const applyLifecycleEvent = (event: LifecycleEvent, enabled?: boolean): LifecycleMode => {
  const previous = state;
  const next = transitionLifecycleState(state, event, enabled);
  if (next === previous) return state.mode;

  state = next;
  if (previous.mode !== "tray" && next.mode === "tray") hooks.onEnterTray?.();
  if (previous.mode === "tray" && next.mode !== "tray") hooks.onExitTray?.();
  hooks.onModeChanged?.(getLifecycleState());
  return state.mode;
};

/** 重置模块状态，仅供测试隔离使用 */
export const resetLifecycleModeForTests = (): void => {
  state = createState();
  hooks = {};
};
