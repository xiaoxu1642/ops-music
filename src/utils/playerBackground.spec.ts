import { describe, expect, it } from "vitest";
import { PLAYER_BG_MAX_FPS, clampPlayerBgFps } from "./playerBackground";

describe("playerBackground", () => {
  it("低于上限的帧率保持不变", () => {
    expect(clampPlayerBgFps(24)).toBe(24);
    expect(clampPlayerBgFps(30)).toBe(30);
  });

  it("历史配置中超过上限的帧率被压到 30", () => {
    expect(clampPlayerBgFps(60)).toBe(PLAYER_BG_MAX_FPS);
    expect(clampPlayerBgFps(120)).toBe(PLAYER_BG_MAX_FPS);
  });
});
