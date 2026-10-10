/**
 * 任务栏歌词暂停自动隐藏——纯决策层
 *
 * 语义（对齐 TaskBarLyrics 参考实现的 pause_hide / hover 轮询）：
 * - 播放暂停（含空闲）且光标不在窗口几何范围内，持续 30 秒后整窗隐藏；
 * - 期间恢复播放、或光标移入窗口热区，都会取消隐藏；
 * - 隐藏由暂停触发时，只有恢复播放会重新显示（悬停不触发回显）；
 * - 空间不足造成的隐藏与暂停隐藏互不覆盖：空间回升恢复显示，暂停隐藏仍按播放态恢复。
 *
 * 本模块只做状态推导（决策表），计时器与真实显隐由 taskbarLyric.ts 执行，便于单测。
 */

/** 暂停后自动隐藏的等待时长（毫秒）；固定模块常量，不开放为设置项 */
export const PAUSE_AUTO_HIDE_MS = 30_000;

/** 悬停命中判定的外扩边距（DIP）：与参考实现 hover 热区 ±3px 一致 */
export const HOVER_HIT_PADDING = 3;

/** 暂停自动隐藏的判定状态 */
export interface PauseHideState {
  /** 播放中（由 nowPlaying 服务驱动；暂停与空闲均视为非播放） */
  playing: boolean;
  /** 光标是否悬停在窗口几何范围内 */
  hovered: boolean;
  /** 模块账本里的呈现态（未显示或空间不足隐藏时为 false） */
  displayed: boolean;
  /** 当前隐藏是否由暂停自动隐藏造成（恢复播放时据此回显） */
  hiddenByPause: boolean;
}

/** 驱动状态机的事件 */
export type PauseHideEvent =
  | { type: "play" }
  | { type: "pause" }
  | { type: "hover-enter" }
  | { type: "hover-leave" }
  | { type: "window-shown" }
  | { type: "window-hidden" }
  | { type: "timeout" };

/** 状态迁移结果：下一状态 + 需要执行的副作用标记 */
export interface PauseHideResult {
  state: PauseHideState;
  /** 需要（重新）启动 30s 计时器 */
  armTimer: boolean;
  /** 需要取消现有计时器 */
  cancelTimer: boolean;
  /** 需要执行整窗隐藏（win.hide() 并把呈现账本置 false） */
  hide: boolean;
  /** 需要从暂停隐藏中恢复显示（重跑布局） */
  show: boolean;
}

/** 创建初始状态；playing 建议从 nowPlaying 快照播种，避免创建瞬间误起计时 */
export const createPauseHideState = (playing: boolean): PauseHideState => ({
  playing,
  hovered: false,
  displayed: false,
  hiddenByPause: false,
});

/** 此刻是否满足「暂停、未被悬停、应当呈现」的自动隐藏条件 */
export const shouldAutoHideNow = (state: PauseHideState): boolean =>
  !state.playing && !state.hovered && state.displayed;

/** 光标点是否落在窗口矩形内（padding 外扩作为热区容差） */
export const isPointInsideRect = (
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number },
  padding: number = HOVER_HIT_PADDING,
): boolean =>
  point.x >= rect.x - padding &&
  point.x < rect.x + rect.width + padding &&
  point.y >= rect.y - padding &&
  point.y < rect.y + rect.height + padding;

/** 无副作用的结果包装（事件在现状态下不产生任何动作） */
const idle = (state: PauseHideState): PauseHideResult => ({
  state,
  armTimer: false,
  cancelTimer: false,
  hide: false,
  show: false,
});

/**
 * 纯决策：输入当前状态与事件，输出下一状态与副作用标记
 * 各事件对同一状态重复触发均为幂等空操作，调用方可以放心广播式派发
 * @param state - 当前状态
 * @param event - 触发事件
 * @returns 迁移结果
 */
export const reducePauseHide = (state: PauseHideState, event: PauseHideEvent): PauseHideResult => {
  switch (event.type) {
    case "play": {
      if (state.playing) return idle(state);
      return {
        state: { ...state, playing: true, hiddenByPause: false },
        armTimer: false,
        cancelTimer: true,
        hide: false,
        // 被暂停隐藏时恢复播放要回显；否则窗口本就还在屏幕上
        show: state.hiddenByPause,
      };
    }
    case "pause": {
      if (!state.playing) return idle(state);
      const next = { ...state, playing: false };
      // 窗口在屏且未被悬停 → 起 30s 倒计时；被悬停则等 hover-leave 再起
      if (state.displayed && !state.hovered) {
        return { state: next, armTimer: true, cancelTimer: true, hide: false, show: false };
      }
      return { state: next, armTimer: false, cancelTimer: true, hide: false, show: false };
    }
    case "hover-enter": {
      if (state.hovered) return idle(state);
      return {
        state: { ...state, hovered: true },
        armTimer: false,
        cancelTimer: true,
        hide: false,
        show: false,
      };
    }
    case "hover-leave": {
      if (!state.hovered) return idle(state);
      const next = { ...state, hovered: false };
      if (!state.playing && state.displayed) {
        return { state: next, armTimer: true, cancelTimer: true, hide: false, show: false };
      }
      return { state: next, armTimer: false, cancelTimer: true, hide: false, show: false };
    }
    case "window-shown": {
      if (state.displayed) return idle(state);
      return {
        state: { ...state, displayed: true, hiddenByPause: false },
        armTimer: !state.playing && !state.hovered,
        cancelTimer: true,
        hide: false,
        show: false,
      };
    }
    case "window-hidden": {
      if (!state.displayed && !state.hovered) return idle(state);
      return {
        state: { ...state, displayed: false, hovered: false, hiddenByPause: false },
        armTimer: false,
        cancelTimer: true,
        hide: false,
        show: false,
      };
    }
    case "timeout": {
      if (!shouldAutoHideNow(state)) return idle(state);
      return {
        state: { ...state, displayed: false, hiddenByPause: true },
        armTimer: false,
        cancelTimer: true,
        hide: true,
        show: false,
      };
    }
  }
};
