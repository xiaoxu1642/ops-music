import { ipcMain } from "electron";
import { markStartupMilestone } from "@main/utils/startupMetrics";

type RendererMilestone = "playbackRuntimeReady" | "playbackReady" | "fullUiReady";

const milestones: RendererMilestone[] = ["playbackRuntimeReady", "playbackReady", "fullUiReady"];

/** 注册渲染进程里程碑上报，时间由主进程接管，不信任渲染端时间戳 */
export const registerStartupMetricsIpc = (): void => {
  ipcMain.on("startup:reportMilestone", (_event, milestone: RendererMilestone) => {
    if (!milestones.includes(milestone)) return;
    markStartupMilestone(milestone);
  });
};
