import type { TaskbarLyricSettings } from "./settings";

/** 窗口管理 API */
export interface WindowApi {
  /** 切换任务栏歌词窗口 */
  toggleTaskbarLyric: () => Promise<boolean>;
  /** 关闭任务栏歌词窗口 */
  closeTaskbarLyric: () => Promise<void>;
  /** 查询任务栏歌词窗口是否处于打开状态 */
  isTaskbarLyricOpen: () => Promise<boolean>;
  /** 订阅任务栏歌词窗口开关状态变化 */
  onTaskbarLyricVisibilityChange: (callback: (open: boolean) => void) => () => void;
  /** 最小化主窗口 */
  minimize: () => void;
  /** 切换最大化 / 还原 */
  toggleMaximize: () => void;
  /** 查询主窗口是否最大化 */
  isMaximized: () => Promise<boolean>;
  /** 订阅主窗口最大化状态变化 */
  onMaximizeChange: (callback: (maximized: boolean) => void) => () => void;
  /** 切换全屏 */
  toggleFullscreen: () => void;
  /** 查询主窗口是否全屏 */
  isFullscreen: () => Promise<boolean>;
  /** 订阅主窗口全屏状态变化 */
  onFullscreenChange: (callback: (fullscreen: boolean) => void) => () => void;
  /** 隐藏主窗口到托盘 */
  hide: () => void;
  /** 退出应用 */
  quit: () => void;
}

/** 任务栏歌词布局事件 */
export interface TaskbarLyricLayoutEvent {
  isCentered: boolean;
  systemType: string;
  /** 任务栏是否浅色主题 */
  isLight: boolean;
  anchor: "left" | "right";
  /** 当前任务栏区域允许的最大窗口宽度 */
  maxWidth: number;
}

/** 任务栏歌词 API */
export interface TaskbarLyricApi {
  /** 订阅布局变化（锚定方向、居中与否、系统类型、任务栏主题） */
  onLayout: (callback: (data: TaskbarLyricLayoutEvent) => void) => () => void;
  /** 订阅配置变化 */
  onConfigChange: (callback: (config: TaskbarLyricSettings) => void) => () => void;
  /** 订阅悬停态变化（主进程按光标位置轮询判定，渲染端据此展开/收起） */
  onHoverChange: (callback: (hovered: boolean) => void) => () => void;
  /** 订阅暂停 30s 折叠态变化（true = 仅封面，渲染端据此隐藏/恢复歌词区） */
  onCollapseChange: (callback: (collapsed: boolean) => void) => () => void;
  /** 上报内容需要的实际窗口宽度 */
  setContentWidth: (width: number) => void;
}
