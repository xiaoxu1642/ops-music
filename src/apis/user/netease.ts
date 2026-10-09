import type { Album, Artist, Playlist } from "@shared/types/player";
import type { UserSubcount } from "@/types/user";
import { netease as neteaseApi } from "@/apis/netease";
import { ensureOk, toAlbum, toArtist, toPlaylist, toSubcount } from "@/utils/format/netease";

const PAGE_SIZE = 50;

/**
 * 通用分页直到拉完
 * @param fetcher 第 N 页拉取函数（offset/limit），返回 `{ data, hasMore }`
 * @param extract 单项 raw → Item
 */
const fetchAllPages = async <Item>(
  fetcher: (offset: number, limit: number) => Promise<{ data?: any[]; hasMore?: boolean }>,
  extract: (raw: any) => Item,
): Promise<Item[]> => {
  const all: Item[] = [];
  let offset = 0;
  while (true) {
    const resp = await fetcher(offset, PAGE_SIZE);
    const list = resp.data ?? [];
    all.push(...list.map(extract));
    if (!resp.hasMore || list.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
};

/** 用户歌单分页结果 */
export interface UserPlaylistPage {
  /** 该页歌单 */
  playlists: Playlist[];
  /** 该页已满，可能还有下一页 */
  hasMore: boolean;
}

/**
 * 分页拉取用户歌单
 * 接口把「我喜欢 + 自建 + 收藏」放在同一条连续列表里返回，offset 即已加载条数
 * @param uid 用户 ID
 * @param offset 已加载条数
 * @param createdCount 自建歌单数，首页把它整段覆盖，否则自建被截断后收藏段落没有触底入口
 * @returns 该页歌单与是否还有下一页
 */
export const fetchUserPlaylistPage = async (
  uid: number,
  offset = 0,
  createdCount = 0,
): Promise<UserPlaylistPage> => {
  const limit = PAGE_SIZE + Math.max(0, createdCount);
  const body = await neteaseApi.user_playlist({ uid, limit, offset });
  const playlists = (body?.playlist ?? []).map(toPlaylist);
  return { playlists, hasMore: playlists.length >= limit };
};

/** 用户订阅计数 */
export const fetchSubcount = async (): Promise<UserSubcount> => {
  const body = await neteaseApi.user_subcount();
  return toSubcount(body ?? {});
};

/** 用户喜欢歌曲 id 列表 */
export const fetchLikelist = async (uid: number): Promise<string[]> => {
  const body = await neteaseApi.likelist({ uid });
  return ((body?.ids as number[]) ?? []).map(String);
};

/** 用户收藏专辑 */
export const fetchUserAlbums = (): Promise<Album[]> =>
  fetchAllPages(async (offset, limit) => {
    const body = await neteaseApi.album_sublist({ limit, offset });
    return { data: body?.data, hasMore: body?.hasMore };
  }, toAlbum);

/** 用户收藏歌手 */
export const fetchUserArtists = (): Promise<Artist[]> =>
  fetchAllPages(async (offset, limit) => {
    const body = await neteaseApi.artist_sublist({ limit, offset });
    return { data: body?.data, hasMore: body?.hasMore };
  }, toArtist);

/**
 * 切换红心状态
 * 优先调用新版 like_v1，失败时自动降级到旧版 like
 * @param trackId - 歌曲 ID
 * @param like - true 为红心，false 为取消红心
 */
export const toggleLikeSong = async (trackId: string, like: boolean): Promise<void> => {
  try {
    const res = await neteaseApi.like_v1<{ code?: number }>({ id: trackId, like });
    if (res && (res.code === 200 || Number(res.code) === 200)) return;
  } catch {}
  ensureOk(await neteaseApi.like({ id: trackId, like }));
};

/** 用户等级 */
export const fetchUserLevel = async (): Promise<number | undefined> => {
  const body = await neteaseApi.user_level();
  const level = body?.data?.level;
  return typeof level === "number" ? level : undefined;
};
