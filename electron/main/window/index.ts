import { store } from "@main/store";
import { isWin } from "@main/utils/config";
import { createTaskbarLyricWindow } from "./taskbarLyric";

export { createWindow } from "./create";
export {
  createMainWindow,
  getMainWindow,
  focusMainWindow,
  setTaskbarProgress,
  minimizeMainWindow,
  toggleMaximizeMainWindow,
  isMainWindowMaximized,
  toggleFullscreenMainWindow,
  isMainWindowFullscreen,
  hideMainWindow,
} from "./main";
export {
  createTaskbarLyricWindow,
  closeTaskbarLyricWindow,
  toggleTaskbarLyricWindow,
  getTaskbarLyricWindow,
  isTaskbarLyricPresented,
  applyTaskbarLyricLayout,
  updateTaskbarLyricContentWidth,
  consumeTaskbarLyricAutoCloseNotice,
} from "./taskbarLyric";

/** 恢复歌词相关窗口 */
export const restoreLyricWindows = (): void => {
  if (isWin && store.get("windowStates.taskbarLyric.visible")) {
    createTaskbarLyricWindow();
  }
};
