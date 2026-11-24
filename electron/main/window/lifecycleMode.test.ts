import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyLifecycleEvent,
  configureLifecycleModeHooks,
  getLifecycleState,
  resetLifecycleModeForTests,
  transitionLifecycleState,
} from "./lifecycleMode";
import type { LifecycleEvent, LifecycleState } from "./lifecycleMode";

const state = (mode: LifecycleState["mode"], taskbarLyricEnabled = false): LifecycleState => ({
  mode,
  taskbarLyricEnabled,
});

describe("窗口生命周期三态迁移", () => {
  beforeEach(resetLifecycleModeForTests);

  it("最小化按任务栏歌词开关进入对应状态", () => {
    assert.deepEqual(
      transitionLifecycleState(state("full"), "minimize"),
      state("minimizedWithoutLyric"),
    );
    assert.deepEqual(
      transitionLifecycleState(state("full", true), "minimize"),
      state("minimizedWithLyric", true),
    );
  });

  it("最小化期间切换任务栏歌词只改变受限状态", () => {
    assert.deepEqual(
      transitionLifecycleState(state("minimizedWithoutLyric"), "taskbarLyricChanged", true),
      state("minimizedWithLyric", true),
    );
    assert.deepEqual(
      transitionLifecycleState(state("minimizedWithLyric", true), "taskbarLyricChanged", false),
      state("minimizedWithoutLyric"),
    );
  });

  it("完整态切换任务栏歌词不改变模式", () => {
    assert.deepEqual(
      transitionLifecycleState(state("full"), "taskbarLyricChanged", true),
      state("full", true),
    );
    assert.deepEqual(
      transitionLifecycleState(state("full", true), "taskbarLyricChanged", false),
      state("full"),
    );
  });

  it("进入托盘关闭并清空任务栏歌词状态", () => {
    assert.deepEqual(
      transitionLifecycleState(state("minimizedWithLyric", true), "closeToTray"),
      state("tray"),
    );
  });

  it("托盘态忽略任务栏歌词变化", () => {
    assert.deepEqual(
      transitionLifecycleState(state("tray"), "taskbarLyricChanged", true),
      state("tray"),
    );
    assert.deepEqual(
      transitionLifecycleState(state("tray"), "taskbarLyricChanged", false),
      state("tray"),
    );
  });

  it("恢复完整态保留已开启的任务栏歌词", () => {
    assert.deepEqual(
      transitionLifecycleState(state("minimizedWithLyric", true), "restore"),
      state("full", true),
    );
    assert.deepEqual(transitionLifecycleState(state("tray"), "restore"), state("full"));
  });

  it("重复事件返回原状态对象", () => {
    for (const current of [state("minimizedWithoutLyric"), state("minimizedWithLyric", true)]) {
      assert.equal(transitionLifecycleState(current, "minimize"), current);
    }
    const tray = state("tray");
    assert.equal(transitionLifecycleState(tray, "closeToTray"), tray);
    const full = state("full", true);
    assert.equal(transitionLifecycleState(full, "restore"), full);
  });

  it("托盘事件与模式广播只触发一次", () => {
    let enterTrayCount = 0;
    const changes: LifecycleState[] = [];
    configureLifecycleModeHooks({
      onEnterTray: () => enterTrayCount++,
      onModeChanged: (next) => changes.push(next),
    });

    assert.equal(applyLifecycleEvent("closeToTray"), "tray");
    assert.equal(applyLifecycleEvent("closeToTray"), "tray");
    assert.equal(enterTrayCount, 1);
    assert.deepEqual(changes, [state("tray")]);
  });

  it("任务栏歌词变化会同步广播状态", () => {
    const changes: LifecycleState[] = [];
    configureLifecycleModeHooks({ onModeChanged: (next) => changes.push(next) });

    assert.equal(applyLifecycleEvent("taskbarLyricChanged", true), "full");
    assert.deepEqual(getLifecycleState(), state("full", true));
    assert.deepEqual(changes, [state("full", true)]);
  });

  it("未知任务栏歌词值不改变状态", () => {
    const current = state("full");
    const event = "taskbarLyricChanged" as LifecycleEvent;
    assert.equal(transitionLifecycleState(current, event), current);
  });
});
