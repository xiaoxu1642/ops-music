import { coreLog } from "@main/utils/logger";

type Milestone = "trayReady" | "playbackRuntimeReady" | "playbackReady" | "fullUiReady";

const reachedAt = new Map<Milestone, number>();

/** 记录启动里程碑，重复上报忽略，时间统一以主进程 uptime 为准 */
export const markStartupMilestone = (milestone: Milestone): void => {
  if (reachedAt.has(milestone)) return;
  const elapsed = Math.round(process.uptime() * 1000);
  reachedAt.set(milestone, elapsed);
  coreLog.info(`启动耗时｜${milestone} ${elapsed}ms`);
};

/** 返回可播放与托盘就绪两者中较晚的时间，尚未达成时返回 null */
export const playbackAcceptanceMs = (): number | null => {
  const playback = reachedAt.get("playbackReady");
  const tray = reachedAt.get("trayReady");
  if (playback == null || tray == null) return null;
  return Math.max(playback, tray);
};
