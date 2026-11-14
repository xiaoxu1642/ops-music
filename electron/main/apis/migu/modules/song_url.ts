/**
 * 咪咕取流地址（pc/listen/v2.0 会员鉴权 + v1.0 匿名保底 + 客户端改档）
 *
 * 登录用户走 v2.0 鉴权端点（pacmtoken 放请求头，竞品 url_v2 口径）：VIP 歌曲返回
 * 全曲直链；响应体是 4 字节头 + 逐字节偏移的混淆 JSON，需解密。未登录或 v2.0
 * 失败时回落 v1.0 匿名端点（上游固定返回 PQ 档直链；VIP 歌曲只回试听信息）。
 * 改档是对返回 URL 做路径片段字符串替换（竞品 quality.ts 口径，盲改不校验存在性
 * ⇒ 每档改写后用 Range 探测，失败逐级回退，PQ 原链是上游直接给的，作为最终保底）。
 *
 * 实测（2026-11）：freetyst 直链无 Referer/UA 校验，去 query 后可长期复用，
 * 直接返回裸地址给 audio-engine 拉流，不走本地代理。
 */

import { randomUUID } from "node:crypto";
import { ENDPOINT, MIGU_TONES, PC_CHANNEL, QUALITY_TO_TONES, TONE_LABEL } from "../core/config";
import type { MiguToneSpec } from "../core/config";
import type { MiguHttp, MiguListenUrlResponse, MiguModule } from "../core/types";

/** listen v2.0 混淆响应的解密密钥（站方固定值） */
const LISTEN_V2_SECURE = "Jk8qzuePiJ1qE3mDYhLQ3T73DtDoAhLP";

/**
 * 解密 listen v2.0 的混淆响应体
 * @param buf - 原始响应字节
 * @returns 解密出的 JSON；混淆头不符或解密失败时返回 null
 */
const decryptListenV2 = (buf: ArrayBuffer): MiguListenUrlResponse | null => {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 4 || bytes[0] !== 171 || bytes[1] !== 205 || bytes[2] !== 1) return null;
  const key = new TextEncoder().encode(LISTEN_V2_SECURE);
  const out = new Uint8Array(bytes.length - 4);
  for (let c = 4, s = 0; c < bytes.length; c++, s++) {
    out[s] = bytes[c] + bytes[3] - key[s % key.length];
  }
  try {
    return JSON.parse(new TextDecoder("utf-8").decode(out)) as MiguListenUrlResponse;
  } catch {
    return null;
  }
};

/**
 * 会员鉴权取流：pacmtoken 放请求头，登录用户的 VIP 歌曲返回全曲直链。
 * 响应是混淆字节流，走 raw 通道；请求或解密失败由调用方回落 v1.0
 * @param http - 请求层能力
 * @param pacmtoken - 会话登录凭证
 * @param contentId - 歌曲 contentId
 * @param copyrightId - 版权 ID
 * @returns PQ 档 CDN 直链；失败时返回 null
 */
const listenV2 = async (
  http: MiguHttp,
  pacmtoken: string,
  contentId: string,
  copyrightId: string,
): Promise<string | null> => {
  try {
    const res = await http.get(
      `${ENDPOINT.listenUrlV2}?contentId=${encodeURIComponent(
        contentId,
      )}&copyrightId=${encodeURIComponent(copyrightId)}&scene=&netType=01&resourceType=2&toneFlag=PQ`,
      {
        raw: true,
        headers: {
          channel: PC_CHANNEL,
          subchannel: PC_CHANNEL,
          pacmtoken,
          deviceId: randomUUID(),
          ua: "Android_migu",
          version: "6.8.8",
          activityId: "MUSIC-WWW",
          birth: "h5page",
          signature: "1",
          timestamp: Date.now().toString(),
          referer: "https://music.migu.cn/",
        },
      },
    );
    return (res.raw ? decryptListenV2(res.raw) : null)?.data?.url || null;
  } catch {
    return null;
  }
};

/**
 * 把 PQ 直链改写成目标档位地址
 * @param url - listen 接口返回的 PQ 直链
 * @param target - 目标档位
 * @returns 改写后的地址；URL 不含 PQ 路径片段时返回 null（结构不符合改档前提）
 */
const rewriteToneUrl = (url: string, target: MiguToneSpec): string | null => {
  const pq = MIGU_TONES.PQ;
  const withoutQuery = url.split("?")[0];
  if (!withoutQuery.includes(pq.pathSegment)) return null;
  return withoutQuery.replace(pq.pathSegment, target.pathSegment).replace(/\.mp3$/i, target.ext);
};

/** 扩展名 → 音频格式名 */
const formatFromExt = (ext: string): string => ext.replace(/^\./, "").toLowerCase() || "mp3";

/**
 * 改档后的 CDN 直链可达性探测：拉前 64 字节即取消，200/206 均视为可用
 * @param url - 咪咕音频 CDN 直链
 * @returns 是否可用
 */
const probeMiguUrl = async (url: string): Promise<boolean> => {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-63" },
      signal: AbortSignal.timeout(5000),
    });
    // 只探测不消费：取消 body 立即释放连接
    await res.body?.cancel();
    return res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
};

const song_url: MiguModule = async (query, http) => {
  const contentId = String(query.id ?? "");
  const copyrightId = String(query.copyrightId ?? "");
  const toneKey = String(query.tone ?? "sq");
  if (!contentId) throw new Error("migu song_url 缺少 id");

  const pacmtoken = (query.cookie as Record<string, string> | undefined)?.pacmtoken ?? "";
  let pqUrl = pacmtoken ? await listenV2(http, pacmtoken, contentId, copyrightId) : null;
  let resCookie: Record<string, string> = {};
  if (!pqUrl) {
    const res = await http.get(
      `${ENDPOINT.listenUrl}?contentId=${encodeURIComponent(contentId)}&copyrightId=${encodeURIComponent(
        copyrightId,
      )}&resourceType=2&toneFlag=PQ`,
    );
    const body = res.body as MiguListenUrlResponse;
    const data = body?.data as
      { url?: string; oriUrl?: string; auditionsLength?: number; dialogInfo?: unknown } | undefined;
    pqUrl = data?.url ?? null;
    resCookie = res.cookie;
    if (!pqUrl) {
      // VIP / 版权受限歌曲：code 000000 但只回试听信息不下发 URL
      if (data?.auditionsLength || data?.dialogInfo) {
        throw new Error(`migu vip required: ${contentId}`);
      }
      throw new Error(`migu 未取到播放地址：${contentId}`);
    }
  }

  const tones = QUALITY_TO_TONES[toneKey] ?? [MIGU_TONES.PQ];
  let chosen: { url: string; tone: MiguToneSpec } | null = null;
  for (const spec of tones) {
    // PQ 原链最后兜底，不走改档
    if (spec.tone === "PQ") continue;
    const rewritten = rewriteToneUrl(pqUrl, spec);
    if (!rewritten) continue;
    if (await probeMiguUrl(rewritten)) {
      chosen = { url: rewritten, tone: spec };
      break;
    }
  }

  const target = chosen ?? { url: pqUrl, tone: MIGU_TONES.PQ };
  // 实测（2026-11）：freetyst 直链无 Referer/UA 校验、去 query 后可长期复用，
  // audio-engine 直接拉裸地址，无需本地代理转发
  const url = target.url.split("?")[0];

  return {
    status: 200,
    body: {
      url,
      tone: target.tone.tone,
      toneLabel: TONE_LABEL[target.tone.tone],
      format: formatFromExt(target.tone.ext),
      size: 0,
      fallbackFrom: chosen ? undefined : toneKey,
    },
    cookie: resCookie,
  };
};

export default song_url;
