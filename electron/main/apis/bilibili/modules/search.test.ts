import assert from "node:assert/strict";
import { describe, it } from "node:test";
import search, {
  buildBilibiliSearchPath,
  normalizeBilibiliText,
  parseBilibiliDuration,
} from "./search";
import type { BilibiliHttp, BilibiliRequestResponse } from "../core/types";

/** 记录调用顺序的假请求层，替换掉真实网络 */
const createHttp = (
  responses: Array<BilibiliRequestResponse | Error>,
): { http: BilibiliHttp; calls: string[] } => {
  const calls: string[] = [];
  let index = 0;
  const http: BilibiliHttp = {
    get: async (path) => {
      calls.push(path);
      const next = responses[Math.min(index, responses.length - 1)];
      index++;
      if (next instanceof Error) throw next;
      return next;
    },
    wbi: async (endpoint, params) => await http.get(`${endpoint}?${JSON.stringify(params)}`),
  };
  return { http, calls };
};

const okBody = (result: unknown[], numResults = 3): BilibiliRequestResponse => ({
  status: 200,
  body: { code: 0, data: { numResults, result } },
  cookie: {},
});

describe("B 站搜索", () => {
  it("按站方口径拼出搜索 query", () => {
    const path = buildBilibiliSearchPath("星象导航", 2, 20);
    assert.ok(path.startsWith("/x/web-interface/search/type?"));
    assert.ok(path.includes("__refresh__=true"));
    assert.ok(path.includes("page=2"));
    assert.ok(path.includes("page_size=20"));
    assert.ok(path.includes("platform=pc"));
    assert.ok(path.includes("search_type=video"));
    assert.ok(path.includes("keyword=%E6%98%9F%E8%B1%A1%E5%AF%BC%E8%88%AA"));
  });

  it("去掉高亮标签、解码实体并把时长换算成毫秒", async () => {
    const { http, calls } = createHttp([
      okBody([
        {
          type: "video",
          bvid: "BV1xx411c7mD",
          title: '<em class="keyword">星象</em>&amp;导航',
          author: "<em>UP</em>主",
          mid: 12345,
          pic: "//i0.hdslb.com/bfs/archive/cover.jpg",
          duration: "3:07",
        },
        { type: "bili_user", mid: 999 },
      ]),
    ]);

    const res = await search({ keywords: "星象", page: 1, limit: 20 }, http);
    const body = res.body as {
      items: Array<Record<string, unknown>>;
      total: number;
      hasMore: boolean;
    };

    assert.equal(calls.length, 1);
    assert.equal(body.items.length, 1);
    assert.deepEqual(body.items[0], {
      id: "bilibili_BV1xx411c7mD",
      bvid: "BV1xx411c7mD",
      title: "星象&导航",
      artist: "UP主",
      mid: "12345",
      cover: "https://i0.hdslb.com/bfs/archive/cover.jpg",
      duration: 187000,
      source: "bilibili",
    });
    assert.equal(body.total, 3);
    assert.equal(body.hasMore, false);
  });

  it("首页未填满也按站方总数判定 hasMore", async () => {
    const videos = Array.from({ length: 20 }, (_, i) => ({
      type: "video",
      bvid: `BV${i}`,
      title: "t",
    }));
    const { http } = createHttp([okBody(videos, 200)]);
    const res = await search({ keywords: "k", page: 1, limit: 20 }, http);
    assert.equal((res.body as { hasMore: boolean }).hasMore, true);
  });

  it("命中风控后重试一次并复用同一路径", async () => {
    const first: Error = Object.assign(new Error("bilibili 412"), { response: { status: 412 } });
    const { http, calls } = createHttp([
      first,
      okBody([{ type: "video", bvid: "BV1", title: "a" }]),
    ]);

    const res = await search({ keywords: "a", page: 1, limit: 20 }, http);

    assert.equal(calls.length, 2);
    assert.equal(calls[0], calls[1]);
    assert.equal((res.body as { items: unknown[] }).items.length, 1);
  });

  it("标题缺失时回落占位文案", () => {
    assert.equal(normalizeBilibiliText(undefined), "未知标题");
  });

  it("解析小时制与非法时长串", () => {
    assert.equal(parseBilibiliDuration("1:02:03"), 3723000);
    assert.equal(parseBilibiliDuration("45"), 0);
    assert.equal(parseBilibiliDuration(undefined), 0);
  });
});
