import type { TransitionPreference } from "@shared/types/player";

/** 覆盖四十秒候选窗口，让已选中的乐句有足够时间提交到音频回调 */
export const AUTOMIX_LOOKAHEAD_MS = 45_000;
/** 只在实际入场前预热变速器，避免提前几十秒改变当前歌曲的速度 */
export const AUTOMIX_ARM_LEAD_MS = 2000;

/** 低于该墙钟余量或全屏播放时跳过声部分离，改用节拍与交叉过渡兜底。 */
export const AUTOMIX_DEMUX_MIN_REMAINING_MS = 30_000;

/** 分析队列仅允许最近两代，旧代次结果迟到时直接丢弃。 */
export const AUTOMIX_MAX_GENERATION_QUEUE = 2;

/** 高频游览变化合并到一次预载调度，避免队列反复重建。 */
export const NEXT_TRACK_WATCH_DEBOUNCE_MS = 150;

/** 按墙钟时间提前安排交接，包含原生检测窗口和提交余量。 */
export const TRANSITION_LOOKAHEAD_MS: Record<TransitionPreference, number> = {
  conservative: 5000,
  standard: 6000,
  eager: 9000,
};
