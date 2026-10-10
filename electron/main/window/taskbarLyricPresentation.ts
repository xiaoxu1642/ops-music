/** 任务栏歌词呈现判定所需的状态 */
export interface TaskbarLyricPresentationState {
  /** 用户是否开启任务栏歌词 */
  enabled: boolean;
  /** 歌词窗口是否存在 */
  windowExists: boolean;
  /** 歌词窗口是否被最小化 */
  minimized: boolean;
  /** 管理模块是否已把窗口显示出来（任务栏空间不足时会被隐藏） */
  shownByModule: boolean;
  /** 是否处于暂停 30s 后的仅封面折叠态（窗口在屏但歌词区已隐藏） */
  collapsed: boolean;
}

/**
 * 判定任务栏歌词此刻是否真的呈现在屏幕上
 * 窗口嵌在任务栏里，Electron 的 isVisible() 恒为真，不能用来过滤高频位置推送，
 * 必须由这五项共同决定；折叠态窗口虽在屏，渲染端已不消费位置推送，同样视为不呈现
 * @param state - 判定所需状态
 * @returns 真正呈现返回 true
 */
export const isTaskbarLyricPresentationShown = (state: TaskbarLyricPresentationState): boolean =>
  state.enabled &&
  state.windowExists &&
  !state.minimized &&
  state.shownByModule &&
  !state.collapsed;
