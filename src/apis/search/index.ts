/**
 * 在线搜索入口
 * 对外暴露 searchSongs / searchAlbums / searchArtists / searchPlaylists
 * platform 为当前选中平台，调用方按来源分发后无需改签名
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

/** 搜索标签页展示的平台，与 fetcher 的实现范围一致 */
export const SEARCHABLE_PLATFORMS: Platform[] = ["netease"];

/** 搜索单曲 */
export const searchSongs = async (
  _platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<Track>> => {
  return netease.songs(keyword, offset, limit);
};

/** 搜索专辑 */
export const searchAlbums = async (
  _platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  return netease.albums(keyword, offset, limit);
};

/** 搜索歌手 */
export const searchArtists = async (
  _platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  return netease.artists(keyword, offset, limit);
};

/** 搜索歌单 */
export const searchPlaylists = async (
  _platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  return netease.playlists(keyword, offset, limit);
};
