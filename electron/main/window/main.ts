import { BrowserWindow, shell } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { createWindow } from "./create";
import { MAIN_WINDOW_IDLE_DESTROY_MS, shouldDestroyIdleMainWindow } from "./idleDestroy";
import { initThumbar } from "@main/services/thumbar";
import { enableTaskbarThumbnail } from "@main/services/thumbnail";
import { initTray } from "@main/services/tray";
import { lightSnapshot } from "@main/services/nowPlaying";
import { store } from "@main/store";
import { handleCacheProtocolOnPartition, MAIN_PARTITION } from "@main/utils/protocol";
import { isAppQuitting } from "@main/utils/lifecycle";
import { coreLog } from "@main/utils/logger";
import { broadcast } from "@main/utils/broadcast";
import { isWin } from "@main/utils/config";
import { CURRENT_AGREEMENT_VERSION } from "@shared/constants/agreement";

/** 判断是否应用内部导航 */
const isInternalNavigation = (url: string): boolean => {
  if (url.startsWith("file://")) return true;
  const devBase = process.env["ELECTRON_RENDERER_URL"];
  return !!devBase && url.startsWith(devBase);
};

let mainWindow: BrowserWindow | null = null;

/** 隐藏空闲销毁计时器，只在窗口处于隐藏态期间存在 */
let idleDestroyTimer: NodeJS.Timeout | null = null;

/** 取消隐藏空闲销毁计时 */
const cancelIdleDestroy = (): void => {
  if (idleDestroyTimer) clearTimeout(idleDestroyTimer);
  idleDestroyTimer = null;
};

/**
 * 主窗口隐藏后起闲置计时：到点仍隐藏且没在播放就销毁窗口，回收常驻的渲染进程；
 * 条件不成立则重新计时。窗口显示、关闭或销毁时由 cancelIdleDestroy 清除
 * @param win - 起计时的窗口，回调只操作它自己
 */
const armIdleDestroy = (win: BrowserWindow): void => {
  cancelIdleDestroy();
  idleDestroyTimer = setTimeout(() => {
    idleDestroyTimer = null;
    if (!shouldDestroyIdleMainWindow(!win.isVisible(), lightSnapshot().playing)) {
      armIdleDestroy(win);
      return;
    }
    coreLog.info("主窗口隐藏超时且未在播放，销毁窗口以释放常驻内存");
    win.destroy();
  }, MAIN_WINDOW_IDLE_DESTROY_MS);
};

/**
 * 创建主窗口
 */
export const createMainWindow = (): BrowserWindow => {
  const remember = store.get("system.rememberWindowState") ?? true;
  const saved = remember ? store.get("windowStates.main") : undefined;

  // 注册 cache:// 协议
  handleCacheProtocolOnPartition(MAIN_PARTITION);
  const borderlessWindow = store.get("system.borderlessWindow") ?? true;

  mainWindow = createWindow({
    width: saved?.width ?? 1280,
    height: saved?.height ?? 800,
    ...(saved?.x != null && saved?.y != null ? { x: saved.x, y: saved.y } : {}),
    frame: !borderlessWindow,
    webPreferences: {
      partition: MAIN_PARTITION,
      webgl: true,
    },
  });

  // Electron 43 在混合 DPI 下会先按主屏缩放创建窗口，定位到目标屏幕后需重新应用边界
  if (isWin && saved?.x != null && saved?.y != null) {
    mainWindow.setBounds({
      width: saved.width,
      height: saved.height,
      x: saved.x,
      y: saved.y,
    });
  }

  // 恢复最大化状态
  if (remember && saved?.maximized) {
    mainWindow.maximize();
  }

  // 窗口内容就绪
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // 初始化托盘
  initTray();

  // 自定义任务栏缩略图
  enableTaskbarThumbnail(mainWindow);

  // 缩略图工具栏
  mainWindow.once("show", () => {
    initThumbar(mainWindow!);
  });

  // F12 切换开发者工具：只留快捷键，不提供菜单入口
  mainWindow.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown" && input.key === "F12") {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  // 保存窗口状态
  const saveWindowState = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!(store.get("system.rememberWindowState") ?? true)) return;
    const maximized = mainWindow.isMaximized();
    const bounds = maximized
      ? (mainWindow.getNormalBounds?.() ?? mainWindow.getBounds())
      : mainWindow.getBounds();
    store.set("windowStates.main", {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized,
    });
  };

  // 防抖记录移动位置
  let saveStateTimer: NodeJS.Timeout | null = null;
  const scheduleSaveWindowState = (): void => {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    saveStateTimer = setTimeout(() => {
      saveStateTimer = null;
      saveWindowState();
    }, 400);
  };

  // 系统级关闭（alt+F4 / 任务栏右键"关闭窗口"）统一隐藏到托盘；
  // 退出由渲染端自定义按钮或托盘"退出"菜单走 app.quit() 触发 isAppQuitting=true 放行
  mainWindow.on("close", (event) => {
    if (isAppQuitting()) {
      saveWindowState();
      return;
    }
    event.preventDefault();
    mainWindow?.hide();
  });
  // 隐藏期间才允许闲置销毁；重新显示立即取消计时
  mainWindow.on("hide", () => armIdleDestroy(mainWindow!));
  mainWindow.on("show", cancelIdleDestroy);
  // 最大化
  mainWindow.on("maximize", () => {
    saveWindowState();
    broadcast("window:maximizeChange", true);
  });
  // 取消最大化
  mainWindow.on("unmaximize", () => {
    saveWindowState();
    broadcast("window:maximizeChange", false);
  });
  // 持久化窗口位置与尺寸
  mainWindow.on("moved", scheduleSaveWindowState);
  mainWindow.on("resized", scheduleSaveWindowState);
  // 全屏
  mainWindow.on("enter-full-screen", () => {
    broadcast("window:fullscreenChange", true);
  });
  // 退出全屏
  mainWindow.on("leave-full-screen", () => {
    broadcast("window:fullscreenChange", false);
  });
  // 外链协议白名单
  const openExternalSafe = (url: string): void => {
    if (/^https?:$/i.test(new URL(url).protocol)) {
      void shell.openExternal(url);
    }
  };
  // 设置窗口打开处理程序
  mainWindow.webContents.setWindowOpenHandler((details) => {
    openExternalSafe(details.url);
    return { action: "deny" };
  });
  // 拦截外站顶层导航（如 v-html 内的外链），交系统浏览器打开，防止主窗口被导航走
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isInternalNavigation(url)) return;
    event.preventDefault();
    openExternalSafe(url);
  });

  // 首启引导路径:未完成向导 → 向导;协议版本落后 → 仅协议更新页
  let initialHash = "";
  if (!store.get("system.onboardingCompleted")) {
    initialHash = "/onboarding";
  } else if ((store.get("system.agreedAgreementVersion") as number) < CURRENT_AGREEMENT_VERSION) {
    initialHash = "/agreement-update";
  }

  // 基于 electron-vite cli 的 HMR
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    const base = process.env["ELECTRON_RENDERER_URL"];
    mainWindow.loadURL(initialHash ? `${base}#${initialHash}` : base);
  } else {
    mainWindow.loadFile(
      join(__dirname, "../renderer/index.html"),
      initialHash ? { hash: initialHash } : undefined,
    );
  }

  mainWindow.on("closed", () => {
    if (saveStateTimer) clearTimeout(saveStateTimer);
    cancelIdleDestroy();
    mainWindow = null;
  });

  return mainWindow;
};

/**
 * 获取主窗口实例，窗口不存在时返回 null
 */
export const getMainWindow = (): BrowserWindow | null => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  return null;
};

/** 显示并聚焦主窗口（最小化时自动恢复，被闲置销毁后按创建流程重建） */
export const focusMainWindow = (): void => {
  const win = getMainWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
  // 重建时不提前 show()：交给 ready-to-show 显示，避免空白窗口闪烁
  const created = createMainWindow();
  created.once("ready-to-show", () => created.focus());
};

/** 最小化主窗口 */
export const minimizeMainWindow = (): void => {
  getMainWindow()?.minimize();
};

/** 切换最大化 */
export const toggleMaximizeMainWindow = (): void => {
  const win = getMainWindow();
  if (!win) return;
  if (win.isFullScreen()) {
    win.setFullScreen(false);
    if (!win.isMaximized()) win.maximize();
    return;
  }
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
};

/** 查询是否最大化 */
export const isMainWindowMaximized = (): boolean => !!getMainWindow()?.isMaximized();

/** 切换全屏 */
export const toggleFullscreenMainWindow = (): void => {
  const win = getMainWindow();
  if (!win) return;
  win.setFullScreen(!win.isFullScreen());
};

/** 查询是否全屏 */
export const isMainWindowFullscreen = (): boolean => !!getMainWindow()?.isFullScreen();

/** 隐藏主窗口 */
export const hideMainWindow = (): void => {
  getMainWindow()?.hide();
};

/**
 * 更新任务栏播放进度
 * @param progress - 进度 0~1，或 -1 清除
 * @param paused - 是否暂停状态（显示暂停样式）
 */
export const setTaskbarProgress = (progress: number, paused = false): void => {
  const win = getMainWindow();
  if (!win) return;
  if (progress < 0) {
    win.setProgressBar(-1);
  } else {
    win.setProgressBar(progress, { mode: paused ? "paused" : "normal" });
  }
};
