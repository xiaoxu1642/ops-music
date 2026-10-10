import { describe, expect, it } from "vitest";
import type { NeteaseSong } from "@/types/netease";
import { songToTrack } from "./netease";

describe("网易云歌曲歌手格式化", () => {
  it.each(["ar", "artists"])("过滤 %s 中的空名称，保留有效歌手", (field) => {
    const song = {
      id: 325,
      name: "示例歌曲",
      [field]: [{ id: 0, name: null }, { id: 1 }, { id: 2, name: " " }, { id: 3, name: " 歌手 " }],
    } as unknown as NeteaseSong;

    expect(songToTrack(song).artists).toEqual([{ id: "3", name: "歌手" }]);
  });
});
