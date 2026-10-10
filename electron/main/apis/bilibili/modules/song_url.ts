/**
 * B 站取流地址（playurl）
 *
 * 与 Otter 同口径：先 `fnval=16` 拿 DASH，按 bandwidth 取最高一档音频；
 * DASH 拿不到再降级 `fnval=0` 的 durl 分段。
 *
 * 返回站方裸地址 + 取流必需头，并附上本地代理签发的 `proxyUrl`。
 * **播放链路必须用 `proxyUrl`**：`ffmpeg_audio` 的 HTTP 源不把 Referer/UA 带出站，
 * B 站对无 Referer 的取流一律 403/-352，裸地址只有配合 headers 经代理转发才可用。
 */

import {
  AUDIO_QUALITY_LABEL,
  ENDPOINT,
  FNVAL_DASH,
  FNVAL_DURL,
  UNKNOWN_QUALITY_LABEL,
  USER_AGENT,
} from "../core/config";
import { normalizeResourceUrl } from "../core/url";
import { createProxiedStreamUrl } from "@main/services/bilibiliProxy";
import type {
  BilibiliDashAudioEntry,
  BilibiliModule,
  BilibiliPlayUrlResponse,
  BilibiliStream,
} from "../core/types";
import { videoReferer, loadView } from "./video_detail";

/** 站方字段名不统一，按优先级取第一个非空地址（同 Otter） */
const AUDIO_URL_FIELDS = ["baseUrl", "base_url", "backupUrl", "backup_url", "url"] as const;

const pickAudioUrl = (entry: BilibiliDashAudioEntry): string => {
  for (const field of AUDIO_URL_FIELDS) {
    const value = entry[field];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
};

/** DASH 音频一般是 m4s；FLV 只在部分老资源上出现 */
const formatFromMime = (mimeType?: string): BilibiliStream["format"] => {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("flv")) return "flv";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4s";
  return "m4a";
};

/** durl 降级只能从地址后缀判格式 */
const formatFromUrl = (url: string): BilibiliStream["format"] => {
  const path = url.toLowerCase().split("?")[0] ?? "";
  if (path.endsWith(".flv")) return "flv";
  if (path.endsWith(".m4s") || path.endsWith(".m4a") || path.endsWith(".mp4")) return "m4s";
  return "m4a";
};

const selectDash = (response: BilibiliPlayUrlResponse, referer: string): BilibiliStream | null => {
  const audio = response.data?.dash?.audio ?? [];
  const selected = [...audio].sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0))[0];
  if (!selected) return null;
  const url = normalizeResourceUrl(pickAudioUrl(selected));
  if (!url) return null;

  return {
    url,
    format: formatFromMime(selected.mimeType),
    quality: selected.id ?? 0,
    qualityLabel: AUDIO_QUALITY_LABEL[selected.id ?? 0] ?? UNKNOWN_QUALITY_LABEL,
    size: selected.size ?? 0,
    bandwidth: selected.bandwidth ?? 0,
    mimeType: selected.mimeType ?? "",
    headers: { Referer: referer, "User-Agent": USER_AGENT },
    via: "dash",
  };
};

const selectDurl = (response: BilibiliPlayUrlResponse, referer: string): BilibiliStream | null => {
  const first = response.data?.durl?.[0];
  const url = normalizeResourceUrl(first?.url);
  if (!url) return null;
  return {
    url,
    format: formatFromUrl(url),
    // durl 是站方按 qn 给的整段文件，没有档位码，只能用标签占位
    quality: 0,
    qualityLabel: UNKNOWN_QUALITY_LABEL,
    size: first?.size ?? 0,
    bandwidth: 0,
    mimeType: "",
    headers: { Referer: referer, "User-Agent": USER_AGENT },
    via: "durl",
  };
};

/** 给选出的流签发本地代理地址；代理不可用时保持裸地址，播放侧会显式失败而不是静默播放 403 页 */
const attachProxyUrl = async (stream: BilibiliStream): Promise<BilibiliStream> => {
  const proxyUrl = await createProxiedStreamUrl(stream);
  return { ...stream, proxyUrl };
};

const song_url: BilibiliModule = async (query, http) => {
  const bvid = String(query.bvid ?? "");
  const cookie = query.cookie as Record<string, string> | undefined;
  const referer = videoReferer(bvid);
  const cid = Number(query.cid ?? (await loadView(bvid, http, cookie)).cid);
  if (!cid) throw new Error(`bilibili 未解析到 cid：${bvid}`);

  const options = { referer, cookie };
  const params = { fnval: FNVAL_DASH, bvid, cid };

  let dashError: unknown = null;
  try {
    const res = await http.wbi(ENDPOINT.playurl, params, options);
    const stream = selectDash(res.body as BilibiliPlayUrlResponse, referer);
    if (stream) return { status: 200, body: await attachProxyUrl(stream), cookie: res.cookie };
  } catch (err) {
    dashError = err;
  }

  // DASH 失败或响应结构不含音频时才走 durl，避免把风控错误藏进降级路径
  const durlRes = await http.get(
    `${ENDPOINT.playurlDurl}?fnval=${FNVAL_DURL}&bvid=${encodeURIComponent(bvid)}&cid=${cid}`,
    options,
  );
  const stream = selectDurl(durlRes.body as BilibiliPlayUrlResponse, referer);
  if (!stream) {
    const dashMsg = dashError instanceof Error ? dashError.message : "DASH 响应无音频条目";
    throw new Error(`bilibili 未取到音频地址：${bvid}/${cid}（${dashMsg}）`);
  }

  return { status: 200, body: await attachProxyUrl(stream), cookie: durlRes.cookie };
};

export default song_url;
