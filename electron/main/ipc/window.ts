import { app, ipcMain } from "electron";
import { isWin } from "@main/utils/config";
import {
  toggleTaskbarLyricWindow,
  closeTaskbarLyricWindow,
  getTaskbarLyricWindow,
  createTaskbarLyricWindow,
  consumeTaskbarLyricAutoCloseNotice,
  updateTaskbarLyricContentWidth,
  minimizeMainWindow,
  toggleMaximizeMainWindow,
  isMainWindowMaximized,
  toggleFullscreenMainWindow,
  isMainWindowFullscreen,
  hideMainWindow,
} from "@main/window";

/** 窗口管理 IPC */
export const registerWindowIpc = (): void => {
  // 任务栏歌词仅在 Windows 注册
  if (isWin) {
    // 切换任务栏歌词窗口
    ipcMain.handle("window:toggleTaskbarLyric", () => toggleTaskbarLyricWindow());
    // 关闭任务栏歌词窗口
    ipcMain.handle("window:closeTaskbarLyric", () => closeTaskbarLyricWindow());
    // 查询任务栏歌词窗口是否打开
    ipcMain.handle("window:isTaskbarLyricOpen", () => !!getTaskbarLyricWindow());
    // 自动关闭后用户确认重新打开（不重新武装暂停自动销毁计时）
    ipcMain.handle("window:reopenTaskbarLyric", () => createTaskbarLyricWindow(false) !== null);
    // 取回自动关闭提示（主窗口缺失期间暂存）
    ipcMain.handle("window:consumeTaskbarLyricAutoClose", () =>
      consumeTaskbarLyricAutoCloseNotice(),
    );
    ipcMain.on("taskbarLyric:setContentWidth", (_event, width: number) => {
      updateTaskbarLyricContentWidth(width);
    });
  } else {
    ipcMain.handle("window:toggleTaskbarLyric", () => false);
    ipcMain.handle("window:closeTaskbarLyric", () => undefined);
    ipcMain.handle("window:isTaskbarLyricOpen", () => false);
    ipcMain.handle("window:reopenTaskbarLyric", () => false);
    ipcMain.handle("window:consumeTaskbarLyricAutoClose", () => null);
  }

  // 主窗口控制
  ipcMain.on("window:minimize", () => minimizeMainWindow());
  ipcMain.on("window:toggleMaximize", () => toggleMaximizeMainWindow());
  ipcMain.handle("window:isMaximized", () => isMainWindowMaximized());
  ipcMain.on("window:toggleFullscreen", () => toggleFullscreenMainWindow());
  ipcMain.handle("window:isFullscreen", () => isMainWindowFullscreen());
  ipcMain.on("window:hide", () => hideMainWindow());
  ipcMain.on("window:quit", () => app.quit());
};
