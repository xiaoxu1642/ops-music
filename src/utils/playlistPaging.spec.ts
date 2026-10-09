import { describe, expect, it } from "vitest";
import type { Playlist } from "@shared/types/player";
import { emptyPlaylistPage, reducePlaylistPages } from "./playlistPaging";

const playlist = (id: string): Playlist => ({ id, name: `歌单 ${id}` });
const page = (...ids: string[]): Playlist[] => ids.map(playlist);

describe("用户歌单分页归约", () => {
  it("续拉下一页时按顺序追加，并按 id 丢弃重复行", () => {
    const first = reducePlaylistPages(emptyPlaylistPage, {
      type: "replace",
      page: page("1", "2"),
      hasMore: true,
    });
    const next = reducePlaylistPages(first, {
      type: "append",
      page: page("2", "3"),
      hasMore: false,
    });
    expect(next.items).toEqual([playlist("1"), playlist("2"), playlist("3")]);
    expect(next.hasMore).toBe(false);
  });

  it("空页结束分页且不重新生成已加载数组", () => {
    const loaded = reducePlaylistPages(emptyPlaylistPage, {
      type: "replace",
      page: page("1", "2"),
      hasMore: true,
    });
    const ended = reducePlaylistPages(loaded, { type: "append", page: [], hasMore: false });
    expect(ended.items).toBe(loaded.items);
    expect(ended.hasMore).toBe(false);
  });

  it("刷新与账号切换用首页替换，不会追加到旧数据上", () => {
    const stale = reducePlaylistPages(emptyPlaylistPage, {
      type: "replace",
      page: page("1", "2"),
      hasMore: false,
    });
    const switched = reducePlaylistPages(stale, { type: "reset" });
    expect(switched).toEqual({ items: [], hasMore: false });
    const reloaded = reducePlaylistPages(switched, {
      type: "replace",
      page: page("9"),
      hasMore: false,
    });
    expect(reloaded.items).toEqual([playlist("9")]);
  });
});
