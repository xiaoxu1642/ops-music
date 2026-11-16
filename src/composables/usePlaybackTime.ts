import { getCurrentTime, getDuration, isPlaying } from "@/services/playback";

/**
 * 高频播放时间 composable
 *
 * 通过 RAF 循环读取非响应式时间源，不触发 Vue 响应式系统。
 * 支持显式 start/stop 控制；暂停时只保留 12 帧给动画收尾，随后自动停止 RAF。
 *
 * @param onTick 每帧回调，接收当前播放位置（毫秒，整数）和总时长（毫秒，整数）
 * @returns { start, stop } 手动控制 RAF 循环
 */
export const usePlaybackTime = (
  onTick: (currentMs: number, durationMs: number, playing: boolean) => void,
): { start: () => void; stop: () => void } => {
  const PAUSED_SETTLE_FRAMES = 12;
  let rafId: number | null = null;
  let settleRemaining = 0;

  const tick = (): void => {
    onTick(Math.round(getCurrentTime()), Math.round(getDuration()), isPlaying());
    if (!isPlaying() && settleRemaining > 0) {
      settleRemaining -= 1;
    }
    rafId = isPlaying() || settleRemaining > 0 ? requestAnimationFrame(tick) : null;
  };

  const start = (): void => {
    if (!isPlaying()) settleRemaining = PAUSED_SETTLE_FRAMES;
    if (rafId !== null) return;
    rafId = requestAnimationFrame(tick);
  };

  const stop = (): void => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  onUnmounted(stop);

  return { start, stop };
};
