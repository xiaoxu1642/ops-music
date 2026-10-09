/** 主窗口隐藏后到允许销毁的空闲时长 */
export const MAIN_WINDOW_IDLE_DESTROY_MS = 10 * 60 * 1000;

/**
 * 判定隐藏中的主窗口此刻可否销毁
 * 销毁只回收渲染进程（播放、任务栏歌词、下载等都在主进程），故只需确认
 * 窗口没被重新唤起、音频没在播放；任一条件不成立就重新计时而不是放弃
 * @param hidden - 计时到期时窗口是否仍处于隐藏态
 * @param playing - 音频是否正在播放
 * @returns true 立即销毁，false 重新计时
 */
export const shouldDestroyIdleMainWindow = (hidden: boolean, playing: boolean): boolean =>
  hidden && !playing;
