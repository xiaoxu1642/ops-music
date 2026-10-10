import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ErrorCode } from "@shared/types/errors";
import { bilibiliItemToTrack, pickBilibiliPlayUrl } from "./bilibili";
import type { BilibiliSearchItem } from "@/types/bilibili";

const item: BilibiliSearchItem = {
  bvid: "BV1xx411c7mD",
  title: "测试视频",
  artist: "测试UP主",
  mid: "12345",
  cover: "https://i0.hdslb.com/bfs/archive/cover.jpg",
  duration: 245_000,
};

describe("bilibili 搜索条目 → Track", () => {
  it("id 原样回传 bvid，source 与时长按主进程结果落位", () => {
    const track = bilibiliItemToTrack(item);

    assert.equal(track.id, "BV1xx411c7mD");
    assert.equal(track.source, "bilibili");
    assert.equal(track.title, "测试视频");
    assert.equal(track.duration, 245_000);
    assert.equal(track.cover, "https://i0.hdslb.com/bfs/archive/cover.jpg");
    assert.deepEqual(track.artists, [{ id: "12345", name: "测试UP主" }]);
  });

  it("不携带 album / fee / cloud 等 B 站没有的字段", () => {
    const track = bilibiliItemToTrack(item);

    assert.equal(track.album, undefined);
    assert.equal(track.fee, undefined);
    assert.equal(track.cloud, undefined);
  });

  it("无 mid 时歌手不带 id", () => {
    const track = bilibiliItemToTrack({ ...item, mid: undefined });

    assert.equal(track.artists[0]?.id, undefined);
    assert.equal(track.artists[0]?.name, "测试UP主");
  });
});

describe("bilibili 取流地址选择", () => {
  it("优先使用本地代理地址，而不是站方裸地址", () => {
    const result = pickBilibiliPlayUrl({
      url: "https://xy.upoicrt.com/1.m4s?sign=x",
      proxyUrl: "http://127.0.0.1:9/bili-stream/abc",
    });

    assert.deepEqual(result, { available: true, url: "http://127.0.0.1:9/bili-stream/abc" });
  });

  it("缺代理地址时显式失败，不回落裸地址", () => {
    const result = pickBilibiliPlayUrl({ url: "https://xy.upoicrt.com/1.m4s?sign=x" });

    assert.equal(result.available, false);
    if (result.available) return;
    assert.equal(result.errorCode, ErrorCode.BILIBILI_PROXY_MISSING);
  });

  it("空代理串与空响应同样失败", () => {
    assert.equal(pickBilibiliPlayUrl({ url: "", proxyUrl: " " }).available, false);
    assert.equal(pickBilibiliPlayUrl(undefined).available, false);
    assert.equal(pickBilibiliPlayUrl(null).available, false);
  });
});
