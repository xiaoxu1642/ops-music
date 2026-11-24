import { describe, expect, it } from "vitest";
import { normalizeLifecyclePayload, shouldMountFullUi } from "./rendererMode";

describe("rendererMode", () => {
  it("只在完整态挂载完整 UI", () => {
    expect(shouldMountFullUi("full")).toBe(true);
    expect(shouldMountFullUi("minimizedWithLyric")).toBe(false);
    expect(shouldMountFullUi("minimizedWithoutLyric")).toBe(false);
    expect(shouldMountFullUi("tray")).toBe(false);
  });

  it("识别四态广播负载", () => {
    expect(normalizeLifecyclePayload({ mode: "tray", taskbarLyricEnabled: false }, "full")).toBe(
      "tray",
    );
    expect(normalizeLifecyclePayload("minimizedWithLyric", "full")).toBe("minimizedWithLyric");
  });

  it("非法广播保持原模式", () => {
    expect(normalizeLifecyclePayload({ mode: "unknown" }, "full")).toBe("full");
    expect(normalizeLifecyclePayload(null, "tray")).toBe("tray");
  });
});
