import type { LifecycleState } from "@shared/types/window";

/** 渲染层可识别的生命周期模式 */
export type RendererLifecycleMode = LifecycleState["mode"];

/** 生命周期模式变化负载 */
export type RendererLifecyclePayload = LifecycleState;

/** 完整 UI 只在完整态挂载；最小化但有歌词时播放与歌词在独立窗口继续运行 */
export const shouldMountFullUi = (mode: RendererLifecycleMode): boolean => mode === "full";

const MODE_VALUES = new Set<RendererLifecycleMode>([
  "full",
  "minimizedWithLyric",
  "minimizedWithoutLyric",
  "tray",
]);

/** 把主进程广播的负载归一化为渲染层模式，非法值保持原状态 */
export const normalizeLifecyclePayload = (
  value: unknown,
  current: RendererLifecycleMode,
): RendererLifecycleMode => {
  if (typeof value === "string")
    return MODE_VALUES.has(value as RendererLifecycleMode)
      ? (value as RendererLifecycleMode)
      : current;
  if (!value || typeof value !== "object") return current;
  const { mode } = value as Partial<RendererLifecyclePayload>;
  return mode && MODE_VALUES.has(mode) ? mode : current;
};
