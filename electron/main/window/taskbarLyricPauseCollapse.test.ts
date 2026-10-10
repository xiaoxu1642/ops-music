import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HOVER_HIT_PADDING,
  PAUSE_COLLAPSE_MS,
  createPauseCollapseState,
  isPointInsideRect,
  reducePauseCollapse,
  shouldCollapseNow,
} from "./taskbarLyricPauseCollapse";
import type { PauseCollapseEvent, PauseCollapseState } from "./taskbarLyricPauseCollapse";

/** 播放中：窗口在屏 */
const playingShown = (): PauseCollapseState => ({
  ...createPauseCollapseState(true),
  displayed: true,
});

/** 暂停中：窗口在屏 */
const pausedShown = (): PauseCollapseState => ({
  ...createPauseCollapseState(false),
  displayed: true,
});

/** 暂停满 30s 的仅封面折叠态 */
const collapsedShown = (): PauseCollapseState =>
  reducePauseCollapse(pausedShown(), { type: "collapse" }).state;

const apply = (state: PauseCollapseState, ...events: PauseCollapseEvent[]): PauseCollapseState =>
  events.reduce((acc, event) => reducePauseCollapse(acc, event).state, state);

describe("任务栏歌词暂停折叠", () => {
  it("30 秒等待为固定模块常量", () => {
    assert.equal(PAUSE_COLLAPSE_MS, 30_000);
  });

  it("暂停且窗口在屏、未被悬停时起计时；悬停进入取消，悬停离开重新起计时", () => {
    const paused = reducePauseCollapse(playingShown(), { type: "pause" });
    assert.equal(paused.armTimer, true);
    assert.equal(paused.cancelTimer, true);
    assert.equal(paused.collapse, false);

    const entered = reducePauseCollapse(paused.state, { type: "hover-enter" });
    assert.equal(entered.armTimer, false);
    assert.equal(entered.cancelTimer, true);
    assert.equal(entered.state.hovered, true);

    const left = reducePauseCollapse(entered.state, { type: "hover-leave" });
    assert.equal(left.armTimer, true);
  });

  it("暂停时窗口已被悬停则不起计时，等光标离开再起", () => {
    const hovered = apply(pausedShown(), { type: "hover-enter" });
    const paused = reducePauseCollapse(hovered, { type: "pause" });
    assert.equal(paused.armTimer, false);
    assert.equal(paused.state.playing, false);

    const left = reducePauseCollapse(paused.state, { type: "hover-leave" });
    assert.equal(left.armTimer, true);
  });

  it("30s 超时只在「暂停 + 未悬停 + 应呈现」时折叠为仅封面，绝不隐藏窗口", () => {
    const collapsed = reducePauseCollapse(pausedShown(), { type: "collapse" });
    assert.equal(collapsed.collapse, true);
    assert.equal(collapsed.state.collapsed, true);
    // 折叠只是让渲染端隐藏歌词区，窗口保持可见（displayed 账本不变）
    assert.equal(collapsed.state.displayed, true);

    // 播放中不折叠
    const playingTimeout = reducePauseCollapse(playingShown(), { type: "collapse" });
    assert.equal(playingTimeout.collapse, false);
    assert.deepEqual(playingTimeout.state, playingShown());

    // 悬停中不折叠
    const hoveredTimeout = reducePauseCollapse(apply(pausedShown(), { type: "hover-enter" }), {
      type: "collapse",
    });
    assert.equal(hoveredTimeout.collapse, false);
    assert.equal(hoveredTimeout.state.collapsed, false);

    // 已被空间不足隐藏时超时是空操作
    const spaceHidden = reducePauseCollapse(pausedShown(), { type: "window-hidden" });
    assert.equal(reducePauseCollapse(spaceHidden.state, { type: "collapse" }).collapse, false);

    // 已折叠时重复超时是空操作
    const again = reducePauseCollapse(collapsed.state, { type: "collapse" });
    assert.equal(again.collapse, false);
    assert.equal(again.state, collapsed.state);
  });

  it("恢复播放会取消计时；从折叠态恢复播放请求展开", () => {
    const collapsed = collapsedShown();
    const resumed = reducePauseCollapse(collapsed, { type: "play" });
    assert.equal(resumed.cancelTimer, true);
    assert.equal(resumed.expand, true);
    assert.equal(resumed.state.collapsed, false);
    assert.equal(resumed.state.playing, true);

    // 普通暂停→播放（窗口从未折叠）不触发展开
    const plain = reducePauseCollapse(pausedShown(), { type: "play" });
    assert.equal(plain.expand, false);
    assert.equal(plain.state.collapsed, false);
  });

  it("折叠态悬停只切换悬停标记：进入不改折叠，离开不重新起计时", () => {
    const collapsed = collapsedShown();

    const entered = reducePauseCollapse(collapsed, { type: "hover-enter" });
    assert.equal(entered.state.hovered, true);
    assert.equal(entered.state.collapsed, true);
    assert.equal(entered.armTimer, false);
    assert.equal(entered.collapse, false);
    assert.equal(entered.expand, false);

    const left = reducePauseCollapse(entered.state, { type: "hover-leave" });
    assert.equal(left.state.hovered, false);
    assert.equal(left.state.collapsed, true);
    assert.equal(left.armTimer, false);
    assert.equal(left.expand, false);
  });

  it("折叠态悬停期间恢复播放同样展开", () => {
    const hovered = apply(collapsedShown(), { type: "hover-enter" });
    const resumed = reducePauseCollapse(hovered, { type: "play" });
    assert.equal(resumed.expand, true);
    assert.equal(resumed.state.collapsed, false);
    assert.equal(resumed.state.hovered, true);
  });

  it("空间不足隐藏取消计时并清掉悬停；空间回升重新显示时按播放态决定是否起计时", () => {
    const hovering = apply(pausedShown(), { type: "hover-enter" });
    assert.equal(hovering.hovered, true);

    const spaceHidden = reducePauseCollapse(hovering, { type: "window-hidden" });
    assert.equal(spaceHidden.cancelTimer, true);
    assert.equal(spaceHidden.state.hovered, false);
    assert.equal(spaceHidden.state.displayed, false);

    // 暂停态恢复显示 → 重新起计时
    const shownPaused = reducePauseCollapse(spaceHidden.state, { type: "window-shown" });
    assert.equal(shownPaused.armTimer, true);

    // 播放态恢复显示 → 不起计时
    const playing = reducePauseCollapse(spaceHidden.state, { type: "play" });
    const shownPlaying = reducePauseCollapse(playing.state, { type: "window-shown" });
    assert.equal(shownPlaying.armTimer, false);
  });

  it("折叠态跨空间不足隐藏保留，回升后按折叠态恢复且不重新起计时", () => {
    const hiddenWhileCollapsed = reducePauseCollapse(collapsedShown(), {
      type: "window-hidden",
    });
    assert.equal(hiddenWhileCollapsed.state.collapsed, true);
    assert.equal(hiddenWhileCollapsed.state.displayed, false);

    const shownAgain = reducePauseCollapse(hiddenWhileCollapsed.state, { type: "window-shown" });
    assert.equal(shownAgain.state.collapsed, true);
    assert.equal(shownAgain.armTimer, false);
  });

  it("重复事件与重复显示派发是幂等空操作", () => {
    const shown = pausedShown();
    const again = reducePauseCollapse(shown, { type: "window-shown" });
    assert.equal(again.armTimer, false);
    assert.equal(again.cancelTimer, false);
    assert.equal(again.state, shown);

    const hovered = apply(shown, { type: "hover-enter" });
    const enterAgain = reducePauseCollapse(hovered, { type: "hover-enter" });
    assert.equal(enterAgain.state, hovered);

    const leaveNoop = reducePauseCollapse(shown, { type: "hover-leave" });
    assert.equal(leaveNoop.state, shown);

    const playing = playingShown();
    assert.equal(reducePauseCollapse(playing, { type: "play" }).state, playing);

    // 已暂停时再次收到 pause 是无副作用的空操作
    const paused = reducePauseCollapse(playing, { type: "pause" }).state;
    const pauseAgain = reducePauseCollapse(paused, { type: "pause" });
    assert.equal(pauseAgain.state, paused);
    assert.equal(pauseAgain.armTimer, false);
    assert.equal(pauseAgain.cancelTimer, false);
  });

  it("shouldCollapseNow 与状态一致", () => {
    assert.equal(shouldCollapseNow(pausedShown()), true);
    assert.equal(shouldCollapseNow(playingShown()), false);
    assert.equal(shouldCollapseNow(apply(pausedShown(), { type: "hover-enter" })), false);
    assert.equal(shouldCollapseNow(createPauseCollapseState(false)), false);
    assert.equal(shouldCollapseNow(collapsedShown()), false);
  });
});

describe("悬停命中判定", () => {
  const rect = { x: 100, y: 200, width: 400, height: 48 };

  it("矩形内与热区容差内算命中", () => {
    assert.equal(isPointInsideRect({ x: 300, y: 224 }, rect), true);
    assert.equal(isPointInsideRect({ x: 100, y: 200 }, rect), true);
    assert.equal(
      isPointInsideRect({ x: 100 - HOVER_HIT_PADDING, y: 200 - HOVER_HIT_PADDING }, rect),
      true,
    );
  });

  it("超出容差即未命中", () => {
    assert.equal(isPointInsideRect({ x: 96, y: 224 }, rect), false);
    assert.equal(isPointInsideRect({ x: 300, y: 196 }, rect), false);
    assert.equal(isPointInsideRect({ x: 503, y: 224 }, rect), false);
    assert.equal(isPointInsideRect({ x: 300, y: 251 }, rect), false);
  });

  it("自定义容差生效", () => {
    assert.equal(isPointInsideRect({ x: 99, y: 224 }, rect, 0), false);
    assert.equal(isPointInsideRect({ x: 99, y: 224 }, rect, 1), true);
  });
});
