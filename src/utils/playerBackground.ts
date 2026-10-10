/** 流体背景动画帧率上限（fps） */
export const PLAYER_BG_MAX_FPS = 30;

/** 流体背景渲染缩放默认值 */
export const PLAYER_BG_DEFAULT_RENDER_SCALE = 0.35;

/**
 * 钳制流体背景帧率
 * @param fps - 设置中的帧率
 * @returns 不超过上限的帧率（历史配置可能保存更大的值）
 */
export const clampPlayerBgFps = (fps: number): number => Math.min(fps, PLAYER_BG_MAX_FPS);
