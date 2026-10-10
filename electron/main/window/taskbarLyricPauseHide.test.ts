import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HOVER_HIT_PADDING,
  PAUSE_AUTO_HIDE_MS,
  createPauseHideState,
  isPointInsideRect,
  reducePauseHide,
  shouldAutoHideNow,
} from "./taskbarLyricPauseHide";
import type { PauseHideEvent, PauseHideState } from "./taskbarLyricPauseHide";

/** 播放中：窗口在屏 */
const playingShown = (): PauseHideState => ({
  ...createPauseHideState(true),
  displayed: true,
});

/** 暂停中：窗口在屏 */
const pausedShown = (): PauseHideState => ({
  ...createPauseHideState(false),
  displayed: true,
});

const apply = (state: PauseHideState, ...events: PauseHideEvent[]): PauseHideState =>
  events.reduce((acc, event) => reducePauseHide(acc, event).state, state);

describe("任务栏歌词暂停自动隐藏", () => {
  it("30 秒等待为固定模块常量", () => {
    assert.equal(PAUSE_AUTO_HIDE_MS, 30_000);
  });

  it("暂停且窗口在屏、未被悬停时起计时；悬停进入取消，悬停离开重新起计时", () => {
    const paused = reducePauseHide(playingShown(), { type: "pause" });
    assert.equal(paused.armTimer, true);
    assert.equal(paused.cancelTimer, true);

    const entered = reducePauseHide(paused.state, { type: "hover-enter" });
    assert.equal(entered.armTimer, false);
    assert.equal(entered.cancelTimer, true);
    assert.equal(entered.state.hovered, true);

    const left = reducePauseHide(entered.state, { type: "hover-leave" });
    assert.equal(left.armTimer, true);
  });

  it("暂停时窗口已被悬停则不起计时，等光标离开再起", () => {
    const hovered = apply(pausedShown(), { type: "hover-enter" });
    const paused = reducePauseHide(hovered, { type: "pause" });
    assert.equal(paused.armTimer, false);
    assert.equal(paused.state.playing, false);

    const left = reducePauseHide(paused.state, { type: "hover-leave" });
    assert.equal(left.armTimer, true);
  });

  it("30s 超时只在「暂停 + 未悬停 + 应呈现」时隐藏整窗", () => {
    const hidden = reducePauseHide(pausedShown(), { type: "timeout" });
    assert.equal(hidden.hide, true);
    assert.equal(hidden.state.displayed, false);
    assert.equal(hidden.state.hiddenByPause, true);

    // 播放中不隐藏
    const playingTimeout = reducePauseHide(playingShown(), { type: "timeout" });
    assert.equal(playingTimeout.hide, false);
    assert.deepEqual(playingTimeout.state, playingShown());

    // 悬停中不隐藏
    const hoveredTimeout = reducePauseHide(apply(pausedShown(), { type: "hover-enter" }), {
      type: "timeout",
    });
    assert.equal(hoveredTimeout.hide, false);

    // 已被空间不足隐藏时超时是空操作，不覆盖 hiddenByPause 语义
    const spaceHidden = reducePauseHide(pausedShown(), { type: "window-hidden" });
    assert.equal(reducePauseHide(spaceHidden.state, { type: "timeout" }).hide, false);
  });

  it("恢复播放会取消计时；被暂停隐藏时恢复播放请求回显", () => {
    const hidden = reducePauseHide(pausedShown(), { type: "timeout" });
    const resumed = reducePauseHide(hidden.state, { type: "play" });
    assert.equal(resumed.cancelTimer, true);
    assert.equal(resumed.show, true);
    assert.equal(resumed.state.hiddenByPause, false);
    assert.equal(resumed.state.playing, true);

    // 普通暂停→播放（窗口始终在屏）不触发回显
    const plain = reducePauseHide(pausedShown(), { type: "play" });
    assert.equal(plain.show, false);
  });

  it("隐藏后悬停不影响回显判定，仅恢复播放会回显", () => {
    const hidden = reducePauseHide(pausedShown(), { type: "timeout" });
    const hoveredWhileHidden = reducePauseHide(hidden.state, { type: "hover-enter" });
    assert.equal(hoveredWhileHidden.state.hiddenByPause, true);
    assert.equal(hoveredWhileHidden.state.displayed, false);
  });

  it("空间不足隐藏取消计时并清掉悬停；空间回升重新显示时按播放态决定是否起计时", () => {
    const hovering = apply(pausedShown(), { type: "hover-enter" });
    assert.equal(hovering.hovered, true);

    const spaceHidden = reducePauseHide(hovering, { type: "window-hidden" });
    assert.equal(spaceHidden.cancelTimer, true);
    assert.equal(spaceHidden.state.hovered, false);
    assert.equal(spaceHidden.state.displayed, false);

    // 暂停态恢复显示 → 重新起计时
    const shownPaused = reducePauseHide(spaceHidden.state, { type: "window-shown" });
    assert.equal(shownPaused.armTimer, true);

    // 播放态恢复显示 → 不起计时
    const playing = reducePauseHide(spaceHidden.state, { type: "play" });
    const shownPlaying = reducePauseHide(playing.state, { type: "window-shown" });
    assert.equal(shownPlaying.armTimer, false);
  });

  it("重复事件与重复显示派发是幂等空操作", () => {
    const shown = pausedShown();
    const again = reducePauseHide(shown, { type: "window-shown" });
    assert.equal(again.armTimer, false);
    assert.equal(again.cancelTimer, false);
    assert.equal(again.state, shown);

    const hovered = apply(shown, { type: "hover-enter" });
    const enterAgain = reducePauseHide(hovered, { type: "hover-enter" });
    assert.equal(enterAgain.state, hovered);

    const leaveNoop = reducePauseHide(shown, { type: "hover-leave" });
    assert.equal(leaveNoop.state, shown);

    const playing = playingShown();
    assert.equal(reducePauseHide(playing, { type: "play" }).state, playing);

    // 已暂停时再次收到 pause 是无副作用的空操作
    const paused = reducePauseHide(playing, { type: "pause" }).state;
    const pauseAgain = reducePauseHide(paused, { type: "pause" });
    assert.equal(pauseAgain.state, paused);
    assert.equal(pauseAgain.armTimer, false);
    assert.equal(pauseAgain.cancelTimer, false);
  });

  it("shouldAutoHideNow 与状态一致", () => {
    assert.equal(shouldAutoHideNow(pausedShown()), true);
    assert.equal(shouldAutoHideNow(playingShown()), false);
    assert.equal(shouldAutoHideNow(apply(pausedShown(), { type: "hover-enter" })), false);
    assert.equal(shouldAutoHideNow(createPauseHideState(false)), false);
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
