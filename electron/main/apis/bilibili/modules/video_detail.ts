/**
 * B 站视频详情（view）
 *
 * 分 P 列表、UP 主、合集信息都出自这一个接口。取流与取歌词要先靠它把 cid 定下来，
 * 因此 `loadView` 按 bvid 缓存 24h（同 Otter）：音频与字幕必须解析到同一个分 P，
 * 否则会出现「声音是 P1、歌词是 P2」的串台。
 */

import { API_REFERER, ENDPOINT, VIDEO_PAGE_DOMAIN, VIEW_CACHE_TTL_MS } from "../core/config";
import { buildCacheKey, cacheGet, cacheSet } from "../core/cache";
import { normalizeResourceUrl } from "../core/url";
import { normalizeBilibiliText } from "./search";
import type {
  BilibiliHttp,
  BilibiliModule,
  BilibiliVideoDetail,
  BilibiliViewResponse,
} from "../core/types";

/**
 * 视频页地址，仅用于本地代理发往 CDN 的取流请求头。
 * 接口请求不要用它——带路径的 Referer 会被 Chromium 网络栈拦掉，接口侧用 API_REFERER。
 * @param bvid - BV 号
 * @returns 视频页 URL
 */
export const videoReferer = (bvid: string): string =>
  `${VIDEO_PAGE_DOMAIN}/video/${encodeURIComponent(bvid)}`;

/**
 * 取默认分 P 的 cid：优先 pages[0]，回落详情里的 cid
 * @param data - view 响应体
 * @returns cid，拿不到返回 0
 */
export const selectDefaultCid = (data: BilibiliViewResponse["data"]): number =>
  data?.pages?.[0]?.cid || data?.cid || 0;

/**
 * 拉取并缓存视频详情
 * @param bvid - BV 号
 * @param http - 请求层
 * @param cookie - 会话 cookie
 * @returns 归一化后的详情，接口未返回 data 时抛错
 */
export const loadView = async (
  bvid: string,
  http: BilibiliHttp,
  cookie?: Record<string, string>,
): Promise<BilibiliVideoDetail> => {
  const key = buildCacheKey("view", { bvid });
  const hit = cacheGet(key);
  if (hit) return hit.body as BilibiliVideoDetail;

  const res = await http.get(`${ENDPOINT.view}?bvid=${encodeURIComponent(bvid)}`, {
    referer: API_REFERER,
    cookie,
  });
  const data = res.body as BilibiliViewResponse;
  if (!data.data) {
    throw new Error(`bilibili view 未返回数据：${bvid}`);
  }

  const detail: BilibiliVideoDetail = {
    bvid,
    aid: data.data.aid,
    cid: selectDefaultCid(data.data),
    title: normalizeBilibiliText(data.data.title),
    cover: normalizeResourceUrl(data.data.pic),
    owner: { mid: data.data.owner?.mid, name: data.data.owner?.name ?? "" },
    pages: (data.data.pages ?? []).map((page) => ({
      cid: page.cid ?? 0,
      page: page.page ?? 0,
      part: normalizeBilibiliText(page.part),
      duration: page.duration ?? 0,
    })),
    season: data.data.ugc_season?.id
      ? {
          id: data.data.ugc_season.id,
          title: normalizeBilibiliText(data.data.ugc_season.title),
          cover: normalizeResourceUrl(data.data.ugc_season.cover),
        }
      : undefined,
  };

  cacheSet(key, { status: 200, body: detail }, VIEW_CACHE_TTL_MS);
  return detail;
};

const video_detail: BilibiliModule = async (query, http) => {
  const bvid = String(query.bvid ?? "");
  const detail = await loadView(bvid, http, query.cookie as Record<string, string> | undefined);
  return { status: 200, body: detail, cookie: {} };
};

export default video_detail;
