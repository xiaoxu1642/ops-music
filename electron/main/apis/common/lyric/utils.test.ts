import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Track } from "@shared/types/player";
import { buildLyricSearchKeyword, pickBestCandidate, type LyricCandidate } from "./utils";

const track = (partial: Partial<Track>): Track => ({
  id: "local:1",
  source: "local",
  title: "同名歌曲",
  artists: [{ name: "目标歌手" }],
  duration: 180_000,
  ...partial,
});

describe("pickBestCandidate", () => {
  it("拒绝同名但歌手不匹配的歌词候选", () => {
    const candidates: LyricCandidate<{ id: string }>[] = [
      {
        name: "同名歌曲",
        artist: "其他歌手",
        duration: 180_000,
        extra: { id: "wrong" },
      },
    ];

    assert.equal(pickBestCandidate(candidates, track({})), null);
  });

  it("允许多歌手曲目命中候选中的任一歌手", () => {
    const candidates: LyricCandidate<{ id: string }>[] = [
      {
        name: "同名歌曲",
        artist: "合作者",
        duration: 180_000,
        extra: { id: "hit" },
      },
    ];

    const best = pickBestCandidate(
      candidates,
      track({ artists: [{ name: "目标歌手" }, { name: "合作者" }] }),
    );

    assert.equal(best?.extra.id, "hit");
  });

  it("没有歌手元数据时仍可用歌名和时长匹配", () => {
    const candidates: LyricCandidate<{ id: string }>[] = [
      {
        name: "同名歌曲",
        artist: "平台歌手",
        duration: 181_000,
        extra: { id: "fallback" },
      },
    ];

    const best = pickBestCandidate(candidates, track({ artists: [] }));

    assert.equal(best?.extra.id, "fallback");
  });
});

describe("buildLyricSearchKeyword", () => {
  it("搜索关键词包含全部歌手", () => {
    assert.equal(
      buildLyricSearchKeyword(
        track({ title: "歌名", artists: [{ name: "歌手 A" }, { name: "歌手 B" }] }),
      ),
      "歌名 歌手 A 歌手 B",
    );
  });
});

// LRCLIB 兜底只有单条结果，接受判定走同一打分器，时长口径即 durationClose / durationFar
describe("单候选时长闸门", () => {
  const pickSingle = (candidate: Omit<LyricCandidate<null>, "extra">, target: Track): boolean =>
    pickBestCandidate([{ ...candidate, extra: null }], target) !== null;

  const synced = { name: "同名歌曲", artist: "目标歌手" };

  it("相差 30s 视为不同曲目，歌名歌手全等也拒绝", () => {
    assert.equal(pickSingle({ ...synced, duration: 210_000 }, track({})), false);
  });

  it("相差 8s 但歌名歌手全等时接受，不做二值硬卡", () => {
    assert.equal(pickSingle({ ...synced, duration: 188_000 }, track({})), true);
  });

  it("相差 8s 且只靠歌名子串命中、又无歌手佐证时拒绝", () => {
    assert.equal(
      pickSingle({ name: "同名歌曲 Live", artist: "", duration: 188_000 }, track({ artists: [] })),
      false,
    );
  });

  it("相差 3s 的歌名子串命中有时长佐证，接受", () => {
    assert.equal(
      pickSingle({ name: "同名歌曲 Live", artist: "", duration: 183_000 }, track({ artists: [] })),
      true,
    );
  });

  it("候选没报时长时不因时长否决", () => {
    assert.equal(pickSingle({ ...synced }, track({})), true);
  });
});
