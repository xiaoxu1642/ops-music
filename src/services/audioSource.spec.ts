import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@shared/types/player";
import { ErrorCode } from "@shared/types/errors";

const mocks = vi.hoisted(() => ({
  netease: vi.fn(),
  bilibili: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({ player: { songLevel: "hq", allowTrialPlay: false }, system: {} }),
}));
vi.mock("@/stores/plugins", () => ({ usePluginsStore: () => ({ list: [] }) }));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({ isLoggedIn: false }) }));
vi.mock("@/apis/song/netease", () => ({ resolveNeteaseUrl: mocks.netease }));
vi.mock("@/apis/song/bilibili", () => ({ resolveBilibiliUrl: mocks.bilibili }));
vi.mock("@/utils/errors", () => ({ handleError: mocks.error }));
import { resolveTrackSource } from "./audioSource";

describe("音源解析失败原因", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("netease API 异常不会被无插件覆盖", async () => {
    mocks.netease.mockRejectedValueOnce(new Error("fetch failed"));
    const onError = vi.fn();
    const track: Track = { id: "1", title: "test", source: "netease", artists: [], duration: 1000 };
    expect(await resolveTrackSource(track, { silent: true, onError })).toBeNull();
    expect(onError).toHaveBeenCalledExactlyOnceWith(ErrorCode.NETWORK_ERROR);
    expect(mocks.error).not.toHaveBeenCalled();
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
  it("bilibili 源走官方取流，返回主进程签发的代理地址", async () => {
    mocks.bilibili.mockResolvedValueOnce({
      available: true,
      url: "http://127.0.0.1:9/bili-stream/abc",
    });
    const resolved = await resolveTrackSource(
      { id: "BV1xx", title: "test", source: "bilibili", artists: [], duration: 1000 },
      { silent: true },
    );
    expect(resolved?.source).toBe("http://127.0.0.1:9/bili-stream/abc");
    expect(resolved?.provider).toBe("official");
  });
  it("bilibili 代理缺失时显式上报错误而不是回落裸地址", async () => {
    mocks.bilibili.mockResolvedValueOnce({
      available: false,
      errorCode: ErrorCode.BILIBILI_PROXY_MISSING,
    });
    const onError = vi.fn();
    const resolved = await resolveTrackSource(
      { id: "BV1xx", title: "test", source: "bilibili", artists: [], duration: 1000 },
      { silent: true, onError },
    );
    expect(resolved).toBeNull();
    expect(onError).toHaveBeenCalledExactlyOnceWith(ErrorCode.BILIBILI_PROXY_MISSING);
  });
});
