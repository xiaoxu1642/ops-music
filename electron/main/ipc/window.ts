import { app, ipcMain } from "electron";
import { isWin } from "@main/utils/config";
import {
  toggleTaskbarLyricWindow,
  closeTaskbarLyricWindow,
  getTaskbarLyricWindow,
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
    ipcMain.on("taskbarLyric:setContentWidth", (_event, width: number) => {
      updateTaskbarLyricContentWidth(width);
    });
  } else {
    ipcMain.handle("window:toggleTaskbarLyric", () => false);
    ipcMain.handle("window:closeTaskbarLyric", () => undefined);
    ipcMain.handle("window:isTaskbarLyricOpen", () => false);
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
