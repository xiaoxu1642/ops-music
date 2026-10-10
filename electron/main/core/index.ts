import { app, BrowserWindow } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import {
  createMainWindow,
  restoreLyricWindows,
  getMainWindow,
  focusMainWindow,
  getTaskbarLyricWindow,
} from "@main/window";
import { registerIpcHandlers } from "@main/ipc";
import { init as initMedia, shutdown as shutdownMedia } from "@main/services/media";
import { initGlobalHotkey } from "@main/services/globalHotkey";
import { initDatabase, closeDatabase } from "@main/database";
import { init as initSongCache } from "@main/services/songCache";
import { init as initDownload } from "@main/services/downloadManager";
import { registerCacheScheme, handleCacheProtocol } from "@main/utils/protocol";
import { coreLog, initLogger } from "@main/utils/logger";

/**
 * 配置 Chromium 启动参数以优化内存占用
 */
const configureMemoryOptimizations = (): void => {
  // 禁止预热备用渲染进程
  app.commandLine.appendSwitch("disable-features", "SpareRendererForSitePerProcess");
};

/** 内存指标采样间隔 */
const MEMORY_LOG_INTERVAL_MS = 10 * 60 * 1000;
/** 启动后首次采样延迟，避开启动期波动 */
const MEMORY_LOG_FIRST_DELAY_MS = 60 * 1000;

/** 记录各进程内存工作集，用于量化内存表现与防劣化对比 */
const logProcessMemory = (): void => {
  // pid → 窗口名，让 Tab 进程能区分主窗口与各歌词窗口
  const windowPids = new Map<number, string>();
  const namedWindows: Array<[string, Electron.BrowserWindow | null]> = [
    ["main", getMainWindow()],
    ["taskbar-lyric", getTaskbarLyricWindow()],
  ];
  for (const [name, win] of namedWindows) {
    if (win && !win.isDestroyed()) windowPids.set(win.webContents.getOSProcessId(), name);
  }
  const parts = app.getAppMetrics().map((metric) => {
    const mb = Math.round(metric.memory.workingSetSize / 1024);
    const detail = windowPids.get(metric.pid) ?? metric.name ?? metric.serviceName;
    const label = detail ? `${metric.type}(${detail})` : metric.type;
    return `${label} ${mb}MB`;
  });
  coreLog.info(`内存占用: ${parts.join(" | ")}`);
};

/**
 * 初始化应用
 */
export const initApp = (): void => {
  configureMemoryOptimizations();
  // 初始化日志
  initLogger();
  // 单例锁
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  // 已有实例运行时再次启动：聚焦主窗口
  app.on("second-instance", () => {
    focusMainWindow();
  });
  // 注册缓存协议方案
  registerCacheScheme();
  // 其他初始化
  app.whenReady().then(() => {
    electronApp.setAppUserModelId("com.ops.music");
    // 注册 cache:// 协议处理
    handleCacheProtocol();
    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });
    // 注册 IPC
    registerIpcHandlers();
    // 初始化数据库
    initDatabase();
    // 创建主窗口
    createMainWindow();
    // 启动歌曲缓存
    void initSongCache();
    // 启动下载服务
    void initDownload();
    initMedia();
    // 恢复歌词相关窗口
    restoreLyricWindows();
    // 注册全局快捷键
    initGlobalHotkey();
    // 周期记录各进程内存
    setTimeout(logProcessMemory, MEMORY_LOG_FIRST_DELAY_MS);
    setInterval(logProcessMemory, MEMORY_LOG_INTERVAL_MS);
    // 最后一个窗口消失（含主窗口被闲置销毁）不触发退出：Electron 在没有监听者时会默认结束进程，
    // 这里用空监听保住常驻托盘，退出只由托盘菜单与渲染端的 app.quit() 发起
    app.on("window-all-closed", () => {});
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
    coreLog.info("应用初始化完成");
  });
  // 退出前清理
  app.on("before-quit", () => {
    coreLog.info("应用即将退出，清理资源");
    shutdownMedia();
    closeDatabase();
  });
};
