import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track, TrackSource } from "@shared/types/player";
import { useSettingsStore } from "@/stores/settings";

const mockRequestPlatformLyric = vi.fn();

vi.mock("./request", () => ({
  requestPlatformLyric: (...args: unknown[]) => mockRequestPlatformLyric(...args),
  requestTTMLOverlay: vi.fn(),
  requestLrclibLyric: vi.fn(),
}));

const mockWindowApi = {
  taskbarLyric: { onConfigChange: vi.fn(() => () => {}) },
  window: {
    onTaskbarLyricVisibilityChange: vi.fn(() => () => {}),
    isTaskbarLyricOpen: vi.fn().mockResolvedValue(false),
  },
};

// @ts-expect-error test mock
window.api = mockWindowApi;

import { resolveOnlineByPreference } from "./resolve";

const createTrack = (id: string, source: TrackSource = "netease"): Track => ({
  id,
  source,
  title: `Song ${id}`,
  artists: [{ id: "a1", name: "Artist" }],
  duration: 180_000,
});

describe("resolveOnlineByPreference 单音源解析", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("智能选择：按音源顺序请求 NCM 并返回其歌词", async () => {
    const settings = useSettingsStore();
    settings.lyric.lyricSourcePreference = "auto";
    mockRequestPlatformLyric.mockResolvedValue({
      platform: "netease",
      format: "yrc",
      content: "[1000,1000]网易云YRC(1000,1000)",
    });

    const result = await resolveOnlineByPreference(createTrack("song_auto"), {
      hasLocal: false,
      localFormat: null,
    });

    expect(result?.source.platform).toBe("netease");
    expect(result?.source.format).toBe("yrc");
    expect(mockRequestPlatformLyric).toHaveBeenCalledTimes(1);
    expect(mockRequestPlatformLyric).toHaveBeenCalledWith("netease", expect.anything());
  });

  it("智能选择：全部音源查无此歌时返回 null", async () => {
    const settings = useSettingsStore();
    settings.lyric.lyricSourcePreference = "auto";
    mockRequestPlatformLyric.mockResolvedValue(null);

    const result = await resolveOnlineByPreference(createTrack("song_miss"), {
      hasLocal: false,
      localFormat: null,
    });

    expect(result).toBeNull();
    expect(mockRequestPlatformLyric).toHaveBeenCalledTimes(2);
    expect(mockRequestPlatformLyric).toHaveBeenCalledWith("bilibili", expect.anything());
  });

  it("显式偏好 NCM：查无此歌时回退其余音源，均未命中返回 null", async () => {
    const settings = useSettingsStore();
    settings.lyric.lyricSourcePreference = "netease";
    mockRequestPlatformLyric.mockResolvedValue(null);

    const result = await resolveOnlineByPreference(createTrack("song_explicit_miss"), {
      hasLocal: false,
      localFormat: null,
    });

    expect(result).toBeNull();
    expect(mockRequestPlatformLyric).toHaveBeenCalledTimes(2);
  });

  it("跟随自身：本地曲目没有对应平台，不发起在线请求", async () => {
    const settings = useSettingsStore();
    settings.lyric.lyricSourcePreference = "self";

    const result = await resolveOnlineByPreference(createTrack("song_local", "local"), {
      hasLocal: false,
      localFormat: null,
    });

    expect(result).toBeNull();
    expect(mockRequestPlatformLyric).not.toHaveBeenCalled();
  });

  it("跟随自身：在线曲目只查询自身来源 NCM", async () => {
    const settings = useSettingsStore();
    settings.lyric.lyricSourcePreference = "self";
    mockRequestPlatformLyric.mockResolvedValue({
      platform: "netease",
      format: "lrc",
      content: "[00:01.00]网易云LRC",
    });

    const result = await resolveOnlineByPreference(createTrack("song_self"), {
      hasLocal: false,
      localFormat: null,
    });

    expect(result?.source.platform).toBe("netease");
    expect(mockRequestPlatformLyric).toHaveBeenCalledTimes(1);
    expect(mockRequestPlatformLyric).toHaveBeenCalledWith("netease", expect.anything());
  });

  it("已有本地歌词且关闭智能优选：不请求在线歌词", async () => {
    const settings = useSettingsStore();
    settings.lyric.smartPreferOnline = false;

    const result = await resolveOnlineByPreference(createTrack("song_keep_local"), {
      hasLocal: true,
      localFormat: "lrc",
    });

    expect(result).toBeNull();
    expect(mockRequestPlatformLyric).not.toHaveBeenCalled();
  });

  it("智能优选：本地仅有 LRC 时只请求能升级到 YRC 的 NCM", async () => {
    const settings = useSettingsStore();
    settings.lyric.smartPreferOnline = true;
    mockRequestPlatformLyric.mockResolvedValue({
      platform: "netease",
      format: "yrc",
      content: "[1000,1000]网易云YRC(1000,1000)",
    });

    const result = await resolveOnlineByPreference(createTrack("song_upgrade"), {
      hasLocal: true,
      localFormat: "lrc",
    });

    expect(result?.source.format).toBe("yrc");
    // B 站主格式只有 lrc，无法比本地 lrc 更优，被 platformCanUpgrade 过滤
    expect(mockRequestPlatformLyric).toHaveBeenCalledTimes(1);
    expect(mockRequestPlatformLyric).toHaveBeenCalledWith("netease", expect.anything());
  });

  it("智能优选：本地已是 NCM 能打到的最高主格式时不请求", async () => {
    const settings = useSettingsStore();
    settings.lyric.smartPreferOnline = true;

    const result = await resolveOnlineByPreference(createTrack("song_no_upgrade"), {
      hasLocal: true,
      localFormat: "yrc",
    });

    expect(result).toBeNull();
    expect(mockRequestPlatformLyric).not.toHaveBeenCalled();
  });

  it("竞态中断：shouldContinue 判定已过期时丢弃结果", async () => {
    const settings = useSettingsStore();
    settings.lyric.lyricSourcePreference = "netease";
    mockRequestPlatformLyric.mockResolvedValue({
      platform: "netease",
      format: "yrc",
      content: "[1000,1000]网易云YRC(1000,1000)",
    });

    const result = await resolveOnlineByPreference(createTrack("song_stale"), {
      hasLocal: false,
      localFormat: null,
      shouldContinue: () => false,
    });

    expect(result).toBeNull();
  });
});
