import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldDestroyIdleMainWindow } from "./idleDestroy";

describe("主窗口隐藏后的闲置销毁判定", () => {
  it("仍隐藏且没在播放才销毁", () => {
    assert.equal(shouldDestroyIdleMainWindow(true, false), true);
  });

  it("恢复显示或仍在播放都重新计时", () => {
    assert.equal(shouldDestroyIdleMainWindow(true, true), false);
    assert.equal(shouldDestroyIdleMainWindow(false, false), false);
    assert.equal(shouldDestroyIdleMainWindow(false, true), false);
  });
});
