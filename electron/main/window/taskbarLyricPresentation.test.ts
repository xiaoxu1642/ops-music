import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isTaskbarLyricPresentationShown } from "./taskbarLyricPresentation";
import type { TaskbarLyricPresentationState } from "./taskbarLyricPresentation";

const shown: TaskbarLyricPresentationState = {
  enabled: true,
  windowExists: true,
  minimized: false,
  shownByModule: true,
  collapsed: false,
};

describe("任务栏歌词呈现判定", () => {
  it("开关打开、窗口存在且已显示时才算呈现", () => {
    assert.equal(isTaskbarLyricPresentationShown(shown), true);
  });

  it("开关关闭、窗口不存在、最小化或被空间不足隐藏都不呈现", () => {
    assert.equal(isTaskbarLyricPresentationShown({ ...shown, enabled: false }), false);
    assert.equal(isTaskbarLyricPresentationShown({ ...shown, windowExists: false }), false);
    assert.equal(isTaskbarLyricPresentationShown({ ...shown, minimized: true }), false);
    assert.equal(isTaskbarLyricPresentationShown({ ...shown, shownByModule: false }), false);
  });

  it("暂停折叠态窗口仍在屏但视为不呈现（高频推送随门控停发）", () => {
    assert.equal(isTaskbarLyricPresentationShown({ ...shown, collapsed: true }), false);
  });
});
