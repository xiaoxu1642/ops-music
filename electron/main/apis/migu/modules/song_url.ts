/**
 * 咪咕取流地址（pc/listen/v1.0 + 客户端改档）
 *
 * listen 接口上游固定返回 PQ 档直链；改档是对返回 URL 做路径片段字符串替换
 * （竞品 quality.ts 口径，盲改不校验存在性 ⇒ 每档改写后用 Range 探测，失败逐级回退，
 * PQ 原链是上游直接给的，作为最终保底）。
 *
 * 播放链路必须用签发的本地代理地址：咪咕部分档位与接口依赖特定 UA，
 * `ffmpeg_audio` 的 HTTP 源无法自定义请求头，统一经 streamProxy 转发。
 */

import { ENDPOINT, MIGU_TONES, QUALITY_TO_TONES, STREAM_HEADERS, TONE_LABEL } from "../core/config";
import type { MiguToneSpec } from "../core/config";
import { probeMiguUrl } from "../core/request";
import type { MiguListenUrlResponse, MiguModule } from "../core/types";
import { createProxiedStreamUrl } from "@main/services/streamProxy";

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

const song_url: MiguModule = async (query, http) => {
  const contentId = String(query.id ?? "");
  const copyrightId = String(query.copyrightId ?? "");
  const toneKey = String(query.tone ?? "sq");
  if (!contentId) throw new Error("migu song_url 缺少 id");

  const res = await http.get(
    `${ENDPOINT.listenUrl}?contentId=${encodeURIComponent(contentId)}&copyrightId=${encodeURIComponent(
      copyrightId,
    )}&resourceType=2&toneFlag=PQ`,
  );
  const pqUrl = (res.body as MiguListenUrlResponse)?.data?.url;
  if (!pqUrl) throw new Error(`migu 未取到播放地址：${contentId}`);

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
  const proxyUrl = await createProxiedStreamUrl({ url: target.url, headers: STREAM_HEADERS });

  return {
    status: 200,
    body: {
      proxyUrl,
      tone: target.tone.tone,
      toneLabel: TONE_LABEL[target.tone.tone],
      format: formatFromExt(target.tone.ext),
      size: 0,
      fallbackFrom: chosen ? undefined : toneKey,
    },
    cookie: res.cookie,
  };
};

export default song_url;
