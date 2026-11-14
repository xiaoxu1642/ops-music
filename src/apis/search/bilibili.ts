import type { Track } from "@shared/types/player";
import { bilibiliCall } from "@/apis/bilibili";
import { bilibiliItemToTrack } from "@/utils/format/bilibili";
import type { BilibiliSearchBody } from "@/types/bilibili";
import type { SearchResult } from "./index";

/**
 * offset 换算成站方页码（page 从 1 开始）
 * @param offset - 调用方已加载条数
 * @param limit - 每页条数
 * @returns 页码
 */
const toPage = (offset: number, limit: number): number =>
  Math.floor(Math.max(0, offset) / Math.max(1, limit)) + 1;

/**
 * 搜索视频
 * @param keyword - 关键词
 * @param offset - 起始偏移
 * @param limit - 每页条数
 */
export const songs = async (
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<Track>> => {
  const body = await bilibiliCall<BilibiliSearchBody>("search", {
    keywords: keyword,
    page: toPage(offset, limit),
    limit,
  });
  const items = (body?.items ?? []).map(bilibiliItemToTrack);
  const total = body?.total ?? items.length;
  return { items, total, hasMore: body?.hasMore ?? false };
};
