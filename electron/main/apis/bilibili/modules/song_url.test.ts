import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import songUrl from "./song_url";
import { AUDIO_QUALITY_LABEL, ENDPOINT, FNVAL_DASH, UNKNOWN_QUALITY_LABEL } from "../core/config";
import type { BilibiliHttp, BilibiliRequestResponse, BilibiliStream } from "../core/types";
import { stopBilibiliProxy } from "../../../services/bilibiliProxy";

// 取流会签发本地代理地址并按需起服务，用例跑完必须收掉，否则测试进程不退出
after(() => {
  stopBilibiliProxy();
});

const res = (body: Record<string, unknown>): BilibiliRequestResponse => ({
  status: 200,
  body,
  cookie: {},
});

interface Calls {
  wbi: Array<{ endpoint: string; params: Record<string, string | number> }>;
  get: string[];
}

/**
 * 只返回取流所需数据的假请求层
 * @param playurl - DASH 响应体
 * @param durl - durl 降级响应体
 * @param dashThrows - 让 DASH 分支直接抛错，用于验证降级
 */
const createHttp = (
  playurl: Record<string, unknown>,
  durl: Record<string, unknown> = {},
  dashThrows = false,
): { http: BilibiliHttp; calls: Calls } => {
  const calls: Calls = { wbi: [], get: [] };
  return {
    calls,
    http: {
      get: async (path) => {
        calls.get.push(path);
        if (path.startsWith(ENDPOINT.view)) {
          return res({
            code: 0,
            data: { bvid: "BV1xx", pages: [{ cid: 62131, page: 1, part: "P1", duration: 200 }] },
          });
        }
        return res(durl);
      },
      wbi: async (endpoint, params) => {
        calls.wbi.push({ endpoint, params });
        if (dashThrows) throw new Error("bilibili -352");
        return res(playurl);
      },
    },
  };
};

const dashBody = (audio: Array<Record<string, unknown>>): Record<string, unknown> => ({
  code: 0,
  data: { dash: { audio } },
});

describe("B 站取流地址", () => {
  it("音质档位码映射为中文标签，未知档位回落占位", () => {
    assert.deepEqual(AUDIO_QUALITY_LABEL, {
      30216: "标准",
      30232: "高音质",
      30280: "无损",
      30250: "杜比全景声",
      30251: "Hi-Res 无损",
    });
    assert.equal(AUDIO_QUALITY_LABEL[30299] ?? UNKNOWN_QUALITY_LABEL, UNKNOWN_QUALITY_LABEL);
  });

  it("DASH 按带宽取最高一档，并带上网质与元数据", async () => {
    const { http, calls } = createHttp(
      dashBody([
        {
          id: 30216,
          bandwidth: 80000,
          size: 1000,
          mimeType: "audio/mp4",
          baseUrl: "//pos-h1.upoicrt.com/1.m4s?sign=x",
        },
        {
          id: 30280,
          bandwidth: 300000,
          size: 5000,
          mimeType: "audio/mp4",
          baseUrl: "http://pos-h1.upoicrt.com/2.m4s?sign=y",
          backupUrl: "https://pos-b.upoicrt.com/2-backup.m4s",
        },
      ]),
    );

    const out = await songUrl({ bvid: "BV1xx", cid: 62131 }, http);
    const stream = out.body as BilibiliStream;

    assert.equal(calls.wbi[0].endpoint, ENDPOINT.playurl);
    assert.deepEqual(calls.wbi[0].params, { fnval: FNVAL_DASH, bvid: "BV1xx", cid: 62131 });
    assert.equal(stream.url, "https://pos-h1.upoicrt.com/2.m4s?sign=y");
    assert.equal(stream.quality, 30280);
    assert.equal(stream.qualityLabel, "无损");
    assert.equal(stream.format, "m4s");
    assert.equal(stream.size, 5000);
    assert.equal(stream.via, "dash");
    assert.deepEqual(stream.headers, {
      Referer: "https://www.bilibili.com/video/BV1xx",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
  });

  it("DASH 无音频条目时降级 durl，地址后缀决定格式", async () => {
    const { http, calls } = createHttp(dashBody([]), {
      code: 0,
      data: { durl: [{ url: "https://xy.upoicrt.com/a.mp4?sign=z", size: 8888 }] },
    });

    const stream = (await songUrl({ bvid: "BV1xx", cid: 62131 }, http)).body as BilibiliStream;

    assert.equal(
      calls.get.some((p) => p.startsWith("/x/player/playurl?fnval=0")),
      true,
    );
    assert.equal(stream.via, "durl");
    assert.equal(stream.url, "https://xy.upoicrt.com/a.mp4?sign=z");
    assert.equal(stream.format, "m4s");
    assert.equal(stream.size, 8888);
  });

  it("DASH 请求失败也走降级，两条路都空则显式报错", async () => {
    const failing = createHttp({}, { code: 0, data: { durl: [] } }, true);
    await assert.rejects(
      () => songUrl({ bvid: "BV1xx", cid: 62131 }, failing.http),
      /未取到音频地址.*bilibili -352/,
    );
  });

  it("未传 cid 时用 view 的默认分 P", async () => {
    const { http, calls } = createHttp(
      dashBody([{ id: 30232, bandwidth: 1, baseUrl: "https://a/1.m4s" }]),
    );
    const stream = (await songUrl({ bvid: "BV1xx" }, http)).body as BilibiliStream;

    assert.equal(calls.wbi[0].params.cid, 62131);
    assert.equal(stream.qualityLabel, "高音质");
  });
});
