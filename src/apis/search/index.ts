/**
 * 在线搜索入口
 * 对外暴露 searchSongs / searchAlbums / searchArtists / searchPlaylists
 * platform 参数当前恒为 netease，保留它是为了让调用方按来源分发、后续接入新音源时无需改签名
 */

import type { Track } from "@shared/types/player";
import type { CoverItem } from "@/types/artist";
import type { Platform } from "@shared/types/platform";
import * as netease from "./netease";

/** 搜索结果通用 */
export interface SearchResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

/**
 * 上面几个 fetcher 已实现分发的平台。搜索标签页只列这些：
 * `ALL_PLATFORMS` 里已有 B 站，但取流/解析还没接，混进标签会拿到网易云的结果。
 */
export const SEARCHABLE_PLATFORMS: Platform[] = ["netease"];

/** 搜索单曲 */
export const searchSongs = (
  _platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<Track>> => netease.songs(keyword, offset, limit);

/** 搜索专辑 */
export const searchAlbums = (
  _platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => netease.albums(keyword, offset, limit);

/** 搜索歌手 */
export const searchArtists = (
  _platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => netease.artists(keyword, offset, limit);

/** 搜索歌单 */
export const searchPlaylists = (
  _platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => netease.playlists(keyword, offset, limit);
