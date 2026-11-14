import type { Track } from "@shared/types/player";
import { miguCall } from "@/apis/migu";
import { miguSongToTrack, type MiguSearchBody } from "@/utils/format/migu";
import type { SearchResult } from "./index";

/**
 * 搜索歌曲
 * @param keyword - 关键词
 * @param offset - 起始偏移（换算成 pageNo，咪咕每页条数由服务端决定）
 * @param limit - 每页条数
 */
export const songs = async (
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<Track>> => {
  const page = Math.floor(Math.max(0, offset) / Math.max(1, limit)) + 1;
  const body = await miguCall<MiguSearchBody>("search", { keywords: keyword, page, limit });
  const items = (body?.items ?? []).map(miguSongToTrack);
  const total = body?.total ?? items.length;
  return { items, total, hasMore: body?.hasMore ?? false };
};
