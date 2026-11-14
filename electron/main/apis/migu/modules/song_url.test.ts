import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import songUrl from "./song_url";
import { ENDPOINT, MIGU_TONES, TONE_LABEL } from "../core/config";
import type { MiguHttp } from "../core/types";

const CONTENT_ID = "600902000006889366";
const V2_SECURE = "Jk8qzuePiJ1qE3mDYhLQ3T73DtDoAhLP";

/** 构造 listen v2.0 的混淆响应字节：4 字节头 + 逐字节偏移（解密逻辑的逆变换） */
const encryptV2 = (body: Record<string, unknown>): ArrayBuffer => {
  const plain = new TextEncoder().encode(JSON.stringify(body));
  const key = new TextEncoder().encode(V2_SECURE);
  const shift = 37;
  const out = new Uint8Array(plain.length + 4);
  out[0] = 171;
  out[1] = 205;
  out[2] = 1;
  out[3] = shift;
  for (let i = 0; i < plain.length; i++) out[i + 4] = plain[i] + key[i % key.length] - shift;
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
};

interface Calls {
  paths: string[];
  v2Headers: Array<Record<string, string>>;
}

/**
 * 假请求层：raw 请求返回 v2 混淆体，其余返回 JSON
 * @param v2 - v2.0 混淆响应体；null 时模拟站方拒绝（4xx）
 * @param v1 - v1.0 匿名响应体
 */
const createHttp = (
  v2: Record<string, unknown> | null,
  v1: Record<string, unknown>,
): { http: MiguHttp; calls: Calls } => {
  const calls: Calls = { paths: [], v2Headers: [] };
  return {
    calls,
    http: {
      get: async (path, options) => {
        calls.paths.push(path);
        if (path.startsWith(ENDPOINT.listenUrlV2)) {
          calls.v2Headers.push(options?.headers ?? {});
          if (!v2) throw new Error("migu 403");
          return { status: 200, body: {}, cookie: {}, raw: encryptV2(v2) };
        }
        return { status: 200, body: v1, cookie: {} };
      },
      post: async () => {
        throw new Error("song_url 不应发 POST");
      },
    },
  };
};

const PQ_URL =
  "https://freetyst.nf.migu.cn/public/product9th/标清高清/MP3_128_16_Stero/60054701923.mp3";
const SQ_URL = "https://freetyst.nf.migu.cn/public/product9th/歌曲下载/flac/60054701923.flac";

/** 调用路径剥离 query，便于断言端点顺序 */
const endpointOf = (path: string): string => path.split("?")[0];

/** 改档探测走全局 fetch，测试用桩替换保证离线确定性 */
const stubProbe = (reachable: boolean): void => {
  globalThis.fetch = (async () => {
    if (!reachable) throw new TypeError("stub unreachable");
    return new Response(null, {
      status: 206,
      headers: { "content-range": "bytes 0-63/4317311" },
    });
  }) as typeof fetch;
};

afterEach(() => {
  // 还原全局 fetch，避免污染其他用例的网络行为
  delete (globalThis as { fetch?: typeof fetch }).fetch;
});

describe("咪咕取流", () => {
  it("登录用户走 v2.0 鉴权端点，VIP 歌曲拿到全曲直链且 pacmtoken 在请求头", async () => {
    stubProbe(true);
    const { http, calls } = createHttp(
      { code: "000000", data: { url: PQ_URL, audioFormatType: "PQ" } },
      { code: "000000", data: { auditionsLength: 60 } },
    );
    const res = await songUrl(
      {
        id: CONTENT_ID,
        copyrightId: "60054701923",
        tone: "lossless",
        cookie: { pacmtoken: "tok" },
      },
      http,
    );
    assert.deepEqual(calls.paths.map(endpointOf), [ENDPOINT.listenUrlV2]);
    assert.equal(calls.v2Headers[0]?.pacmtoken, "tok");
    assert.equal(res.body.url, SQ_URL);
    assert.equal(res.body.tone, "SQ");
    assert.equal(res.body.toneLabel, TONE_LABEL.SQ);
  });

  it("v2.0 失败时回落 v1.0，VIP 歌曲仍按试听信息报错", async () => {
    const { http, calls } = createHttp(null, { code: "000000", data: { auditionsLength: 60 } });
    await assert.rejects(
      songUrl({ id: CONTENT_ID, cookie: { pacmtoken: "tok" } }, http),
      /migu vip required/,
    );
    assert.deepEqual(calls.paths.map(endpointOf), [ENDPOINT.listenUrlV2, ENDPOINT.listenUrl]);
  });

  it("游客按 v1.0 匿名取流，改档不可达时兜底 PQ 直链", async () => {
    stubProbe(false);
    const { http, calls } = createHttp(
      { code: "000000" },
      { code: "000000", data: { url: PQ_URL } },
    );
    const res = await songUrl({ id: CONTENT_ID, tone: "hi-res" }, http);
    assert.deepEqual(calls.paths.map(endpointOf), [ENDPOINT.listenUrl]);
    assert.equal(res.body.url, PQ_URL);
    assert.equal(res.body.tone, MIGU_TONES.PQ.tone);
    assert.equal(res.body.fallbackFrom, "hi-res");
  });

  it("v1.0 匿名遇到只回试听信息的 VIP 歌曲报 vip required", async () => {
    const { http } = createHttp(
      { code: "000000" },
      { code: "000000", data: { auditionsLength: 60, dialogInfo: {} } },
    );
    await assert.rejects(songUrl({ id: CONTENT_ID }, http), /migu vip required/);
  });
});
