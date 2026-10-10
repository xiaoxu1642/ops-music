/**
 * 任务栏歌词暂停折叠——纯决策层
 *
 * 语义（暂停不再隐藏整窗，只收缩展示范围）：
 * - 播放暂停且光标不在窗口几何范围内，持续 30 秒后折叠为仅封面（窗口保持可见）；
 * - 折叠期间恢复播放、或折叠前的悬停都会取消折叠计时；
 * - 折叠态只有恢复播放才会解除；折叠态悬停仅由渲染端展示紧凑控件，不影响状态机；
 * - 空间不足造成的隐藏不覆盖折叠态：空间回升后窗口按原折叠态恢复显示。
 *
 * 本模块只做状态推导（决策表），计时器、折叠广播与真实显隐由 taskbarLyric.ts 执行，便于单测。
 */

/** 暂停后折叠为仅封面的等待时长（毫秒）；固定模块常量，不开放为设置项 */
export const PAUSE_COLLAPSE_MS = 30_000;

/** 悬停命中判定的外扩边距（DIP）：与参考实现 hover 热区 ±3px 一致 */
export const HOVER_HIT_PADDING = 3;

/** 暂停折叠的判定状态 */
export interface PauseCollapseState {
  /** 播放中（由 nowPlaying 服务驱动；暂停与空闲均视为非播放） */
  playing: boolean;
  /** 光标是否悬停在窗口几何范围内 */
  hovered: boolean;
  /** 模块账本里的呈现态（空间不足隐藏时为 false；折叠态仍为 true） */
  displayed: boolean;
  /** 是否已折叠为仅封面：暂停满 30s 后置位，恢复播放时清除 */
  collapsed: boolean;
}

/** 驱动状态机的事件 */
export type PauseCollapseEvent =
  | { type: "play" }
  | { type: "pause" }
  | { type: "hover-enter" }
  | { type: "hover-leave" }
  | { type: "window-shown" }
  | { type: "window-hidden" }
  | { type: "collapse" };

/** 状态迁移结果：下一状态 + 需要执行的副作用标记 */
export interface PauseCollapseResult {
  state: PauseCollapseState;
  /** 需要（重新）启动 30s 折叠计时器 */
  armTimer: boolean;
  /** 需要取消现有计时器 */
  cancelTimer: boolean;
  /** 需要进入仅封面折叠态（通知渲染端隐藏歌词区） */
  collapse: boolean;
  /** 需要解除折叠态（通知渲染端恢复歌词区并补发快照） */
  expand: boolean;
}

/** 创建初始状态；playing 建议从 nowPlaying 快照播种，避免创建瞬间误起计时 */
export const createPauseCollapseState = (playing: boolean): PauseCollapseState => ({
  playing,
  hovered: false,
  displayed: false,
  collapsed: false,
});

/** 此刻是否满足「暂停、未被悬停、应当呈现且尚未折叠」的折叠条件 */
export const shouldCollapseNow = (state: PauseCollapseState): boolean =>
  !state.playing && !state.hovered && state.displayed && !state.collapsed;

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
const idle = (state: PauseCollapseState): PauseCollapseResult => ({
  state,
  armTimer: false,
  cancelTimer: false,
  collapse: false,
  expand: false,
});

/**
 * 纯决策：输入当前状态与事件，输出下一状态与副作用标记
 * 各事件对同一状态重复触发均为幂等空操作，调用方可以放心广播式派发
 * @param state - 当前状态
 * @param event - 触发事件
 * @returns 迁移结果
 */
export const reducePauseCollapse = (
  state: PauseCollapseState,
  event: PauseCollapseEvent,
): PauseCollapseResult => {
  switch (event.type) {
    case "play": {
      if (state.playing) return idle(state);
      return {
        state: { ...state, playing: true, collapsed: false },
        armTimer: false,
        cancelTimer: true,
        collapse: false,
        // 被折叠时恢复播放要展开；否则窗口本就不是折叠态
        expand: state.collapsed,
      };
    }
    case "pause": {
      if (!state.playing) return idle(state);
      const next = { ...state, playing: false };
      // 窗口在屏且未被悬停 → 起 30s 倒计时；被悬停则等 hover-leave 再起
      if (state.displayed && !state.hovered) {
        return { state: next, armTimer: true, cancelTimer: true, collapse: false, expand: false };
      }
      return { state: next, armTimer: false, cancelTimer: true, collapse: false, expand: false };
    }
    case "hover-enter": {
      if (state.hovered) return idle(state);
      return {
        state: { ...state, hovered: true },
        armTimer: false,
        cancelTimer: true,
        collapse: false,
        expand: false,
      };
    }
    case "hover-leave": {
      if (!state.hovered) return idle(state);
      const next = { ...state, hovered: false };
      // 折叠态悬停离开不重新起计时（已经折叠，无需再次触发）
      if (!state.playing && state.displayed && !state.collapsed) {
        return { state: next, armTimer: true, cancelTimer: true, collapse: false, expand: false };
      }
      return { state: next, armTimer: false, cancelTimer: true, collapse: false, expand: false };
    }
    case "window-shown": {
      if (state.displayed) return idle(state);
      return {
        state: { ...state, displayed: true },
        armTimer: !state.playing && !state.hovered && !state.collapsed,
        cancelTimer: true,
        collapse: false,
        expand: false,
      };
    }
    case "window-hidden": {
      if (!state.displayed && !state.hovered) return idle(state);
      // 折叠态跨空间不足隐藏保留，空间回升后按同一折叠态恢复显示
      return {
        state: { ...state, displayed: false, hovered: false },
        armTimer: false,
        cancelTimer: true,
        collapse: false,
        expand: false,
      };
    }
    case "collapse": {
      if (!shouldCollapseNow(state)) return idle(state);
      return {
        state: { ...state, collapsed: true },
        armTimer: false,
        cancelTimer: true,
        collapse: true,
        expand: false,
      };
    }
  }
};
