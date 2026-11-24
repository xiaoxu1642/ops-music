import { describe, expect, it } from "vitest";
import { canApplyInitialLifecycle } from "./lifecycleRace";

describe("bootstrap lifecycle race", () => {
  it("广播先到时不再应用旧初态", () => {
    expect(canApplyInitialLifecycle(0, 1)).toBe(false);
  });

  it("无广播时仍应用初态", () => {
    expect(canApplyInitialLifecycle(0, 0)).toBe(true);
  });
});
