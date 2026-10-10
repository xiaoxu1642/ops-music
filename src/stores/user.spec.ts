import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock("localforage", () => ({
  default: { createInstance: () => storage },
}));

const api = vi.hoisted(() => ({
  playlist_detail: vi.fn(),
  playlist_subscribe: vi.fn(),
  user_subcount: vi.fn(),
  user_playlist: vi.fn(),
  likelist: vi.fn(),
  album_sublist: vi.fn(),
  artist_sublist: vi.fn(),
  user_level: vi.fn(),
}));

vi.mock("@/apis/netease", () => ({
  netease: api,
  NeteaseApiError: class NeteaseApiError extends Error {},
  clearNeteaseSession: vi.fn(() => Promise.resolve()),
  onNeteaseAuthFailure: vi.fn(),
}));

import { useUserStore } from "./user";

const rawPlaylist = (id: string, name: string) => ({ id, name, trackCount: 0 });

/** 登录并拉取首页歌单，构造「我喜欢 + 自建 + 收藏」的已加载前缀 */
const setupStore = async () => {
  const store = useUserStore();
  store.profile = { userId: 7, nickname: "tester" };
  await store.loadContent(7);
  return store;
};

describe("user store 订阅判定", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    storage.getItem.mockReset().mockResolvedValue(null);
    storage.setItem.mockReset().mockResolvedValue(undefined);
    api.playlist_detail.mockReset();
    api.playlist_subscribe.mockReset().mockResolvedValue({ code: 200 });
    api.user_subcount
      .mockReset()
      .mockResolvedValue({ createdPlaylistCount: 2, subPlaylistCount: 1, artistCount: 0 });
    api.user_playlist.mockReset().mockResolvedValue({
      playlist: [
        rawPlaylist("liked", "我喜欢的音乐"),
        rawPlaylist("created", "自建歌单"),
        rawPlaylist("sub", "收藏歌单"),
      ],
    });
    api.likelist.mockReset().mockResolvedValue({ ids: [] });
    api.album_sublist.mockReset().mockResolvedValue({ data: [], hasMore: false });
    api.artist_sublist.mockReset().mockResolvedValue({ data: [], hasMore: false });
    api.user_level.mockReset().mockResolvedValue({ data: { level: 9 } });
  });

  it("已加载分页内按位置判定，不请求详情", async () => {
    const store = await setupStore();

    expect(store.resolveLoadedPlaylistSubscribe("sub")).toBe(true);
    expect(store.resolveLoadedPlaylistSubscribe("created")).toBe(false);
    expect(store.resolveLoadedPlaylistSubscribe("unknown")).toBeUndefined();

    await expect(store.resolvePlaylistSubscribe("sub")).resolves.toBe(true);
    await expect(store.resolvePlaylistSubscribe("created")).resolves.toBe(false);
    expect(api.playlist_detail).not.toHaveBeenCalled();
  });

  it("分页外歌单走详情接口并按值缓存（true / false 均缓存）", async () => {
    const store = await setupStore();
    api.playlist_detail.mockImplementation((params: { id: string }) =>
      Promise.resolve({ code: 200, playlist: { id: params.id, subscribed: params.id === "9" } }),
    );

    await expect(store.resolvePlaylistSubscribe("9")).resolves.toBe(true);
    await expect(store.resolvePlaylistSubscribe("9")).resolves.toBe(true);
    await expect(store.resolvePlaylistSubscribe("10")).resolves.toBe(false);
    await expect(store.resolvePlaylistSubscribe("10")).resolves.toBe(false);
    expect(api.playlist_detail).toHaveBeenCalledTimes(2);
  });

  it("清空账号内容时丢弃缓存", async () => {
    const store = await setupStore();
    api.playlist_detail.mockResolvedValue({ code: 200, playlist: { subscribed: true } });

    await store.resolvePlaylistSubscribe("9");
    store.clearContent();
    await store.resolvePlaylistSubscribe("9");
    expect(api.playlist_detail).toHaveBeenCalledTimes(2);
  });

  it("缓存超过上限时丢弃最早条目", async () => {
    const store = await setupStore();
    api.playlist_detail.mockResolvedValue({ code: 200, playlist: { subscribed: false } });

    for (let i = 0; i < 65; i += 1) await store.resolvePlaylistSubscribe(`x${i}`);
    await store.resolvePlaylistSubscribe("x64");
    expect(api.playlist_detail).toHaveBeenCalledTimes(65);

    await store.resolvePlaylistSubscribe("x0");
    expect(api.playlist_detail).toHaveBeenCalledTimes(66);
  });

  it("订阅切换后解析走缓存，不再请求详情", async () => {
    const store = await setupStore();

    await store.togglePlaylistSubscribe("9", true);
    expect(api.playlist_subscribe).toHaveBeenCalledWith({ id: "9", t: 1 });

    await expect(store.resolvePlaylistSubscribe("9")).resolves.toBe(true);
    expect(api.playlist_detail).not.toHaveBeenCalled();
  });
});
