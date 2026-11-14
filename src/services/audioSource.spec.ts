import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@shared/types/player";
import { ErrorCode } from "@shared/types/errors";

const mocks = vi.hoisted(() => ({
  netease: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({ player: { songLevel: "hq", allowTrialPlay: false }, system: {} }),
}));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({ isLoggedIn: false }) }));
vi.mock("@/apis/song/netease", () => ({ resolveNeteaseUrl: mocks.netease }));
vi.mock("@/utils/errors", () => ({ handleError: mocks.error }));
import { resolveTrackSource } from "./audioSource";

describe("音源解析失败原因", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(mocks.warn);
  });
  it("netease API 异常不会被空音源覆盖", async () => {
    mocks.netease.mockRejectedValueOnce(new Error("fetch failed"));
    const onError = vi.fn();
    const track: Track = { id: "1", title: "test", source: "netease", artists: [], duration: 1000 };
    expect(await resolveTrackSource(track, { silent: true, onError })).toBeNull();
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      ErrorCode.NETWORK_ERROR,
      expect.objectContaining({
        platform: "netease",
        trackId: "1",
        provider: "official",
        errorCode: ErrorCode.NETWORK_ERROR,
        phase: "resolve",
      }),
    );
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith(
      "[audio-source] official URL resolve failed:",
      expect.objectContaining({
        platform: "netease",
        trackId: "1",
        provider: "official",
        errorCode: ErrorCode.NETWORK_ERROR,
        phase: "resolve",
      }),
    );
  });
  it("歌曲无版权仍保留单曲错误", async () => {
    mocks.netease.mockResolvedValueOnce({
      available: false,
      errorCode: ErrorCode.NETEASE_UNAVAILABLE,
    });
    await resolveTrackSource({
      id: "1",
      title: "test",
      source: "netease",
      artists: [],
      duration: 1000,
    });
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith(ErrorCode.NETEASE_UNAVAILABLE);
  });

  it("单曲无音源保留可跳曲错误码", async () => {
    mocks.netease.mockResolvedValueOnce({
      available: false,
      errorCode: ErrorCode.NETEASE_UNAVAILABLE,
    });
    const onError = vi.fn();
    await resolveTrackSource(
      {
        id: "1",
        title: "test",
        source: "netease",
        artists: [],
        duration: 1000,
      },
      { silent: true, onError },
    );
    expect(onError).toHaveBeenCalledExactlyOnceWith(
      ErrorCode.NETEASE_UNAVAILABLE,
      expect.objectContaining({
        platform: "netease",
        trackId: "1",
        provider: "official",
        errorCode: ErrorCode.NETEASE_UNAVAILABLE,
        phase: "resolve",
      }),
    );
  });
});
