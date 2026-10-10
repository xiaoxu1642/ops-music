import { BrowserWindow, screen } from "electron";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { createWindow } from "./create";
import { isTaskbarLyricPresentationShown } from "./taskbarLyricPresentation";
import { loadNativeModule } from "@main/utils/nativeLoader";
import { broadcast } from "@main/utils/broadcast";
import { setTrayTaskbarLyric } from "@main/services/tray";
import { store } from "@main/store";
import { isAppQuitting } from "@main/utils/lifecycle";
import * as nowPlaying from "@main/services/nowPlaying";
import type { TaskbarLyricPosition } from "@shared/types/settings";
import type {
  JsRect,
  JsTaskbarLayout,
  RegistryWatcher,
  TaskbarCreatedWatcher,
  TaskbarService,
  TrayWatcher,
  UiaWatcher,
} from "@splayer/taskbar-lyric";
import { taskbarLog } from "@main/utils/logger";
import {
  PAUSE_AUTO_HIDE_MS,
  createPauseHideState,
  isPointInsideRect,
  reducePauseHide,
  shouldAutoHideNow,
} from "./taskbarLyricPauseHide";
import type { PauseHideEvent, PauseHideState } from "./taskbarLyricPauseHide";

type TaskbarLyricNative = typeof import("@splayer/taskbar-lyric");

const REG_SUBKEY_EXPLORER_ADVANCED =
  "Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced";
const REG_SUBKEY_PERSONALIZE = "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";

type AnchorSide = "left" | "right";

interface PickedSpace {
  rect: JsRect;
  anchor: AnchorSide;
}

let taskbarLyricWindow: BrowserWindow | null = null;
let nativeModule: TaskbarLyricNative | null = null;
let service: TaskbarService | null = null;
let advancedRegWatcher: RegistryWatcher | null = null;
let themeRegWatcher: RegistryWatcher | null = null;
let uiaWatcher: UiaWatcher | null = null;
let trayWatcher: TrayWatcher | null = null;
let taskbarCreatedWatcher: TaskbarCreatedWatcher | null = null;

/** 悬停轮询间隔（毫秒）：对齐参考实现的 100ms 光标热区检查 */
const HOVER_POLL_MS = 100;

/**
 * 暂停自动隐藏状态机。
 * displayed 同时充当「模块是否已把窗口显示出来」的账本——窗口嵌进任务栏后
 * Electron 的 isVisible() 对其恒为真，显隐只能由这里的 show/hide 调用记账
 */
let pauseHide: PauseHideState = createPauseHideState(false);
/** 暂停自动隐藏 30s 计时器 */
let pauseHideTimer: NodeJS.Timeout | null = null;
/** 光标悬停轮询计时器（窗口存在期间运行） */
let hoverPollTimer: NodeJS.Timeout | null = null;
/** nowPlaying 播放态订阅取消函数 */
let unsubscribeNowPlaying: (() => void) | null = null;

interface ActiveWindowRegion {
  x: number;
  y: number;
  maxWidth: number;
  height: number;
  anchor: AnchorSide;
}

let activeWindowRegion: ActiveWindowRegion | null = null;
let contentWidth: number | null = null;

/** 从设置读取当前歌词宽度（Win10 据此从 tasklist 划空间，Win11 忽略） */
const resolveLyricWidth = (): number => {
  const width = store.get("taskbarLyric.maxWidth");
  return typeof width === "number" && width > 0 ? width : 400;
};

/**
 * 初始窗口尺寸——故意设大，覆盖任何可能的任务栏宽度/高度
 * 关键原因：Electron BrowserWindow 在 `transparent:true`+SetParent 到任务栏后，
 * Chromium 视口（layered window 的 compositor surface）不会随 setBounds 扩大，
 * 只会收缩初始尺寸小于后续 setBounds 目标时，超出初始尺寸的区域像素 alpha=0，
 * 按像素 alpha 命中测试会吞掉鼠标事件——即表现为"只有前面一点点可以操作"
 * 解决方法：初始尺寸开到足够大，后续 setBounds 只做缩小，视口永远覆盖整个 HWND
 */
const INITIAL_WIDTH = 3000;
const INITIAL_HEIGHT = 200;

/**
 * 可显示的最小宽度（DIP）任务栏挤满 / 居中且两侧仅余几十像素时，强行塞会变成挤压的几个字符
 * 视觉很糟，直接隐藏窗口；空间回升后再 show
 */
const MIN_LYRIC_WIDTH_DIP = 120;

/** 获取任务栏歌词窗口实例（未创建或已销毁时返回 null） */
export const getTaskbarLyricWindow = (): BrowserWindow | null =>
  taskbarLyricWindow && !taskbarLyricWindow.isDestroyed() ? taskbarLyricWindow : null;

/**
 * 任务栏歌词此刻是否真的呈现在屏幕上，高频推送用它代替 isVisible 过滤
 * 暂停 30s 自动隐藏同样写入 displayed=false，位置推送随之停止；恢复播放后重新拉起
 * @returns 用户开关开启、窗口存在、未最小化且未被空间不足/暂停隐藏时返回 true
 */
export const isTaskbarLyricPresented = (): boolean => {
  const win = getTaskbarLyricWindow();
  return isTaskbarLyricPresentationShown({
    enabled: store.get("windowStates.taskbarLyric.visible"),
    windowExists: win !== null,
    minimized: !!win?.isMinimized(),
    shownByModule: pauseHide.displayed,
  });
};

/** 向任务栏歌词窗口发送悬停态变化（渲染端据此展开/收起控件） */
const sendHover = (win: BrowserWindow | null, hovered: boolean): void => {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("taskbarLyric:hoverChange", hovered);
};

/** 取消暂停自动隐藏计时器 */
const clearPauseHideTimer = (): void => {
  if (pauseHideTimer) {
    clearTimeout(pauseHideTimer);
    pauseHideTimer = null;
  }
};

/** 启动（或重排）30s 暂停自动隐藏计时器 */
const startPauseHideTimer = (): void => {
  clearPauseHideTimer();
  pauseHideTimer = setTimeout(() => onPauseHideTimer(), PAUSE_AUTO_HIDE_MS);
};

/**
 * 30s 计时器到点：先以光标真实位置复核悬停态，再派发 timeout 决策
 * 复核让正确性不依赖 100ms 轮询的相位，光标停在窗口上时不会被误隐藏
 */
const onPauseHideTimer = (): void => {
  pauseHideTimer = null;
  const win = getTaskbarLyricWindow();
  if (!win) return;
  const inside = isPointInsideRect(screen.getCursorScreenPoint(), win.getBounds());
  if (inside !== pauseHide.hovered) {
    dispatchPauseHideEvent({ type: inside ? "hover-enter" : "hover-leave" });
  }
  if (shouldAutoHideNow(pauseHide)) {
    dispatchPauseHideEvent({ type: "timeout" });
  }
};

/** 启动悬停轮询：窗口在屏期间按光标几何位置驱动悬停/展开与暂停隐藏 */
const startHoverPoll = (): void => {
  if (hoverPollTimer) return;
  hoverPollTimer = setInterval(() => {
    const win = getTaskbarLyricWindow();
    if (!win || !pauseHide.displayed) return;
    const inside = isPointInsideRect(screen.getCursorScreenPoint(), win.getBounds());
    if (inside === pauseHide.hovered) return;
    dispatchPauseHideEvent({ type: inside ? "hover-enter" : "hover-leave" });
  }, HOVER_POLL_MS);
};

/** 停止悬停轮询 */
const stopHoverPoll = (): void => {
  if (hoverPollTimer) {
    clearInterval(hoverPollTimer);
    hoverPollTimer = null;
  }
};

/** 订阅播放态变化（onPositionSync 覆盖 onPosition 与 onPlayStateChange 两个发射点） */
const startNowPlayingWatch = (): void => {
  stopNowPlayingWatch();
  pauseHide = createPauseHideState(nowPlaying.snapshot().playing);
  unsubscribeNowPlaying = nowPlaying.onPositionSync((data) => {
    if (data.playing === pauseHide.playing) return;
    dispatchPauseHideEvent({ type: data.playing ? "play" : "pause" });
  });
};

/** 取消播放态订阅 */
const stopNowPlayingWatch = (): void => {
  unsubscribeNowPlaying?.();
  unsubscribeNowPlaying = null;
};

/** 派发状态机事件并执行副作用（计时器、整窗隐藏、回显、悬停广播） */
const dispatchPauseHideEvent = (event: PauseHideEvent): void => {
  const win = getTaskbarLyricWindow();
  const previous = pauseHide;
  const result = reducePauseHide(previous, event);
  pauseHide = result.state;

  if (result.cancelTimer) clearPauseHideTimer();
  if (result.armTimer) startPauseHideTimer();

  if (result.state.hovered !== previous.hovered) sendHover(win, result.state.hovered);

  if (result.hide && win) {
    if (win.isVisible()) win.hide();
    taskbarLog.info("暂停 30 秒且未悬停，整窗隐藏任务栏歌词");
  }
  if (result.show) {
    taskbarLog.info("播放恢复，重新显示任务栏歌词窗口");
    applyTaskbarLyricLayout();
    // 高频位置推送在隐藏期间被门控丢弃，回显时补发一帧完整快照让渲染端立即接续
    const shown = getTaskbarLyricWindow();
    if (shown) shown.webContents.send("nowPlaying:lyric-change", nowPlaying.snapshot());
  }
};

/**
 * 根据内容宽度裁切窗口有效区域
 *
 * 窗口本体始终保持 region 全宽，只在 applyLayout 布局真变时 setBounds——维持
 * "初始宽于一切后续尺寸、setBounds 只做缩小"的嵌入约束（见 INITIAL_WIDTH 注释）
 * 内容收缩改用 setShape 区域裁切：区域外不渲染也不参与命中测试，空白区点击直接
 * 落到任务栏，命中效果等同当初的 HWND 物理收缩；但没有 move/resize，右锚定不再
 * 随每行歌词移动窗口——那正是切行跳变与 hover 扩张后旧帧错位的根源
 */
const applyContentShape = (): void => {
  const win = getTaskbarLyricWindow();
  const region = activeWindowRegion;
  if (!win || !region) return;
  const adjustOccupiedSpace =
    (store.get("taskbarLyric.autoMaxWidth") ?? true) &&
    (store.get("taskbarLyric.autoAdjustOccupiedSpace") ?? false);
  const shapeWidth = Math.min(
    region.maxWidth,
    Math.max(
      MIN_LYRIC_WIDTH_DIP,
      Math.round(adjustOccupiedSpace ? (contentWidth ?? region.maxWidth) : region.maxWidth),
    ),
  );
  if (shapeWidth >= region.maxWidth) {
    win.setShape([]);
    return;
  }
  const x = region.anchor === "right" ? region.maxWidth - shapeWidth : 0;
  win.setShape([{ x, y: 0, width: shapeWidth, height: region.height }]);
};

/**
 * 接收渲染端测得的内容目标宽度
 * @param width - 内容宽度（DIP）
 */
export const updateTaskbarLyricContentWidth = (width: number): void => {
  if (!Number.isFinite(width) || width <= 0) return;
  contentWidth = width;
  applyContentShape();
};

/** 根据设置和任务栏对齐方式选择使用哪侧空间以及锚定方向 */
const pickSpace = (layout: JsTaskbarLayout): PickedSpace | null => {
  const position: TaskbarLyricPosition = store.get("taskbarLyric.position") ?? "auto";
  const { left, right } = layout.space;
  const isCentered = layout.extra.isCentered;

  if (position === "left" && left.width > 0) return { rect: left, anchor: "left" };
  if (position === "right" && right.width > 0) return { rect: right, anchor: "right" };

  if (position === "auto") {
    if (isCentered) {
      if (left.width >= right.width) return { rect: left, anchor: "left" };
      return { rect: right, anchor: "right" };
    }
    return right.width > 0 ? { rect: right, anchor: "right" } : { rect: left, anchor: "left" };
  }

  if (right.width > 0) return { rect: right, anchor: "right" };
  if (left.width > 0) return { rect: left, anchor: "left" };
  return null;
};

/** 空间不足时安静隐藏窗口，避免残留旧位置的歌词残影 */
const hideIfVisible = (win: BrowserWindow): void => {
  if (win.isVisible()) win.hide();
  dispatchPauseHideEvent({ type: "window-hidden" });
};

/** Rust 布局回调：把物理像素空间转为 DIP，<阈值则隐藏，≥阈值则 setBounds 并 show */
const applyLayout = (layout: JsTaskbarLayout): void => {
  const win = getTaskbarLyricWindow();
  if (!win) return;

  const picked = pickSpace(layout);
  if (!picked) {
    hideIfVisible(win);
    return;
  }
  const { rect, anchor } = picked;
  if (rect.width <= 0 || rect.height <= 0) {
    hideIfVisible(win);
    return;
  }

  // Rust 返回物理像素，setBounds 用 DIP，需按 scaleFactor 转换
  // 副屏暂未支持：Rust 端只找主屏 Shell_TrayWnd，歌词窗口永远在主屏，主屏 scaleFactor 即所需
  const dpi = screen.getPrimaryDisplay().scaleFactor;
  // 用户自定义左右边距（DIP）：从可用空间两侧扣除
  const leftMargin = store.get("taskbarLyric.leftMargin") ?? 0;
  const rightMargin = store.get("taskbarLyric.rightMargin") ?? 0;
  const availX = Math.round(rect.x / dpi) + leftMargin;
  const availY = Math.round(rect.y / dpi);
  const availWidth = Math.round(rect.width / dpi) - leftMargin - rightMargin;
  const availHeight = Math.round(rect.height / dpi);

  if (availWidth < MIN_LYRIC_WIDTH_DIP) {
    hideIfVisible(win);
    return;
  }

  const autoMaxWidth = store.get("taskbarLyric.autoMaxWidth") ?? true;
  const maxWidth = store.get("taskbarLyric.maxWidth") ?? 400;
  const windowWidth = autoMaxWidth ? availWidth : Math.min(maxWidth, availWidth);
  const windowX = anchor === "right" ? availX + availWidth - windowWidth : availX;

  activeWindowRegion = {
    x: windowX,
    y: availY,
    maxWidth: windowWidth,
    height: availHeight,
    anchor,
  };
  win.setBounds({ x: windowX, y: availY, width: windowWidth, height: availHeight });
  applyContentShape();

  // 暂停自动隐藏期间布局变化不得回显（恢复播放由状态机的 show 分支重跑布局）
  if (!pauseHide.hiddenByPause && (!pauseHide.displayed || !win.isVisible())) {
    if (!win.isVisible()) win.showInactive();
    dispatchPauseHideEvent({ type: "window-shown" });
  }

  win.webContents.send("taskbarLyric:layout", {
    isCentered: layout.extra.isCentered,
    systemType: layout.extra.systemType,
    isLight: layout.extra.isLight,
    anchor,
    maxWidth: windowWidth,
  });
};

/** Watcher 回调——任何任务栏相关变化都回到这里重算布局 */
const onLayoutChange = (): void => {
  service?.update(resolveLyricWidth());
};

/** 安全创建原生 watcher，失败只 warn 不中断启动 */
const tryStart = <T>(name: string, factory: () => T): T | null => {
  try {
    return factory();
  } catch (error) {
    taskbarLog.warn(`${name} 启动失败`, error);
    return null;
  }
};

/** 启动布局相关的四个 watcher（UIA / Tray / 两个注册表） */
const startWatchers = (mod: TaskbarLyricNative): void => {
  advancedRegWatcher = tryStart(
    "RegistryWatcher(Advanced)",
    () => new mod.RegistryWatcher(REG_SUBKEY_EXPLORER_ADVANCED, onLayoutChange),
  );
  themeRegWatcher = tryStart(
    "RegistryWatcher(Personalize)",
    () => new mod.RegistryWatcher(REG_SUBKEY_PERSONALIZE, onLayoutChange),
  );
  uiaWatcher = tryStart("UiaWatcher", () => new mod.UiaWatcher(onLayoutChange));
  trayWatcher = tryStart("TrayWatcher", () => new mod.TrayWatcher(onLayoutChange));
};

/** 停止布局相关的四个 watcher（不包含 TaskbarCreatedWatcher） */
const stopLayoutWatchers = (): void => {
  advancedRegWatcher?.stop();
  advancedRegWatcher = null;
  themeRegWatcher?.stop();
  themeRegWatcher = null;
  uiaWatcher?.stop();
  uiaWatcher = null;
  trayWatcher?.stop();
  trayWatcher = null;
};

/**
 * explorer.exe 重启后调用：
 * 1. UIA / Tray watcher 绑定在旧 explorer 进程，必须整体重建
 * 2. 注册表 watcher 不绑定进程，但一并重建以简化状态
 * 3. service.reinit() 让 Rust 端重建策略并用记忆的 hwnd/width 恢复嵌入
 */
const onExplorerRestart = (): void => {
  taskbarLog.info("探测到 explorer 重启，重建 watcher 与嵌入");
  stopLayoutWatchers();
  service?.reinit();
  if (nativeModule) startWatchers(nativeModule);
};

/** 创建任务栏歌词窗口：加载原生模块、嵌入任务栏 HWND 并启动 watcher */
export const createTaskbarLyricWindow = (): BrowserWindow | null => {
  if (process.platform !== "win32") {
    taskbarLog.warn("任务栏歌词仅支持 Windows");
    return null;
  }

  if (taskbarLyricWindow && !taskbarLyricWindow.isDestroyed()) {
    // 已存在时视为「确保呈现」：清掉暂停隐藏并按需显示
    if (!taskbarLyricWindow.isVisible()) taskbarLyricWindow.show();
    dispatchPauseHideEvent({ type: "window-shown" });
    return taskbarLyricWindow;
  }

  if (!nativeModule) {
    nativeModule = loadNativeModule<TaskbarLyricNative>("taskbar-lyric.node", "taskbar-lyric");
    if (!nativeModule) {
      taskbarLog.error("原生模块加载失败");
      return null;
    }
  }

  service = new nativeModule.TaskbarService(applyLayout);

  taskbarLyricWindow = createWindow({
    width: INITIAL_WIDTH,
    height: INITIAL_HEIGHT,
    // 覆盖默认 minWidth/minHeight（800/600），允许 setBounds 缩小到很小
    minWidth: 0,
    minHeight: 0,
    type: "toolbar",
    title: "Taskbar Lyric",
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      disableDialogs: true,
      zoomFactor: 1.0,
    },
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    taskbarLyricWindow.loadURL(
      `${process.env["ELECTRON_RENDERER_URL"]}/windows/taskbar-lyric/index.html`,
    );
  } else {
    taskbarLyricWindow.loadFile(join(__dirname, "../renderer/windows/taskbar-lyric/index.html"));
  }

  // 创建即接管：播种播放态、订阅播放变化并开始悬停轮询
  startNowPlayingWatch();
  startHoverPoll();

  taskbarLyricWindow.once("ready-to-show", () => {
    const win = taskbarLyricWindow;
    const svc = service;
    const mod = nativeModule;
    if (!win || !svc || !mod) return;

    // Windows 上 HWND 可能是 64 位值，先保留为 BigInt，避免直接转成 number 产生静默精度丢失
    const hwndPtrBigInt = win.getNativeWindowHandle().readBigUInt64LE(0);
    if (hwndPtrBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
      taskbarLog.error(
        `嵌入窗口失败：hwnd=${hwndPtrBigInt.toString()} 超出 JS Number 安全整数范围`,
      );
      return;
    }
    const hwndPtr = Number(hwndPtrBigInt);
    taskbarLog.info(`嵌入窗口 hwnd=${hwndPtr}`);
    svc.embedWindowByPtr(hwndPtr);
    svc.update(resolveLyricWidth());
    startWatchers(mod);
    taskbarCreatedWatcher = tryStart(
      "TaskbarCreatedWatcher",
      () => new mod.TaskbarCreatedWatcher(onExplorerRestart),
    );
  });

  taskbarLyricWindow.on("closed", () => {
    taskbarLyricWindow = null;
    activeWindowRegion = null;
    contentWidth = null;
    // 生命周期随窗口终了：停止轮询/计时与新播放订阅，清空状态机
    stopHoverPoll();
    stopNowPlayingWatch();
    clearPauseHideTimer();
    pauseHide = createPauseHideState(false);
    cleanupWatchers();
    setTrayTaskbarLyric(false);
    broadcast("taskbarLyric:visibilityChange", false);
    if (!isAppQuitting()) {
      store.set("windowStates.taskbarLyric.visible", false);
    }
  });

  setTrayTaskbarLyric(true);
  broadcast("taskbarLyric:visibilityChange", true);
  store.set("windowStates.taskbarLyric.visible", true);
  return taskbarLyricWindow;
};

/** 停止并清空所有 watcher 与 service */
const cleanupWatchers = (): void => {
  stopLayoutWatchers();
  taskbarCreatedWatcher?.stop();
  taskbarCreatedWatcher = null;
  service?.stop();
  service = null;
};

/** 请求关闭任务栏歌词窗口，实际清理由 "closed" 事件统一处理 */
export const closeTaskbarLyricWindow = (): void => {
  if (taskbarLyricWindow && !taskbarLyricWindow.isDestroyed()) {
    taskbarLyricWindow.close();
  }
};

/** 切换任务栏歌词窗口显隐，返回切换后是否打开（非 Windows 平台或创建失败返回 false） */
export const toggleTaskbarLyricWindow = (): boolean => {
  if (taskbarLyricWindow && !taskbarLyricWindow.isDestroyed()) {
    closeTaskbarLyricWindow();
    return false;
  }
  return createTaskbarLyricWindow() !== null;
};

/** 触发一次布局重算（配置变更后调用） */
export const applyTaskbarLyricLayout = (): void => {
  service?.update(resolveLyricWidth());
};
