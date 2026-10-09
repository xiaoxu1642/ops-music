/**
 * B 站视频搜索
 *
 * 接口与 query 参数照抄 Otter：`/x/web-interface/search/type` + `search_type=video`，
 * 站方在该接口不要求 WBI 签名，但会间歇性返回 412 / HTML 风控页，
 * 所以保留「失败等 1.5s 重试一次」的解冻策略。
 */

import { ENDPOINT, RISK_CONTROL_RETRY_DELAY_MS } from "../core/config";
import { normalizeResourceUrl } from "../core/url";
import type { BilibiliModule, BilibiliSearchItem, BilibiliSearchResponse } from "../core/types";

/** 站方在标题里塞的高亮标签与实体 */
const HTML_TAG_RE = /<[^>]+>/g;
const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
};

/**
 * 去掉搜索高亮标签并解码常见实体
 * @param text - 站方原始文本，可能带 `<em class="keyword">`
 * @returns 纯文本
 */
export const normalizeBilibiliText = (text: string | undefined): string =>
  (text ?? "未知标题")
    .replace(HTML_TAG_RE, "")
    .replace(/&([^;]+);/g, (_, entity: string) => HTML_ENTITY_MAP[entity] || "")
    .trim();

/**
 * 站方时长串（`MM:SS`，超过一小时为 `HH:MM:SS`）换算成毫秒
 * @param duration - 原始时长串
 * @returns 毫秒，解析不出来返回 0
 */
export const parseBilibiliDuration = (duration: string | undefined): number => {
  if (!duration) return 0;
  const parts = duration.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  const seconds =
    parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
};

/**
 * 构造搜索接口路径
 * @param keyword - 关键词
 * @param page - 页码，从 1 开始
 * @param rows - 每页条数
 * @returns 带 query 的路径
 */
export const buildBilibiliSearchPath = (keyword: string, page: number, rows: number): string => {
  const params = new URLSearchParams({
    __refresh__: "true",
    page: String(page),
    page_size: String(rows),
    platform: "pc",
    keyword,
    search_type: "video",
  });
  return `${ENDPOINT.search}?${params.toString()}`;
};

const toItems = (response: BilibiliSearchResponse): BilibiliSearchItem[] =>
  (response.data?.result ?? [])
    .filter((item) => item.type === "video" && item.bvid)
    .map((item) => ({
      id: `bilibili_${item.bvid}`,
      bvid: item.bvid as string,
      title: normalizeBilibiliText(item.title),
      artist: normalizeBilibiliText(item.author || item.uname || ""),
      mid: item.mid === undefined || item.mid === null ? undefined : String(item.mid),
      cover: normalizeResourceUrl(item.pic),
      duration: parseBilibiliDuration(item.duration),
      source: "bilibili" as const,
    }));

const search: BilibiliModule = async (query, http) => {
  const keyword = String(query.keywords ?? "");
  const page = Number(query.page ?? 1);
  const rows = Number(query.limit ?? 20);
  const path = buildBilibiliSearchPath(keyword, page, rows);
  const options = { cookie: query.cookie as Record<string, string> | undefined };

  const res = await http.get(path, options).catch(async () => {
    // 命中风控（412 / HTML 页 / 非 JSON 响应）：等一秒半再试一次，避免偶发的「无结果」。
    // 模块层不打日志（同 netease modules，导入日志层会带进 electron 依赖），
    // 两次都失败时异常会冒到 IPC 层统一记录。
    await new Promise((resolve) => setTimeout(resolve, RISK_CONTROL_RETRY_DELAY_MS));
    return await http.get(path, options);
  });

  const data = res.body as BilibiliSearchResponse;
  const items = toItems(data);
  const total = data.data?.numResults ?? 0;

  return {
    status: 200,
    body: {
      items,
      total,
      hasMore: total > 0 ? page * rows < total : items.length >= rows,
    },
    cookie: res.cookie,
  };
};

export default search;
