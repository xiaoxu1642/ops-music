/**
 * 在线搜索入口
 * 对外暴露 searchSongs / searchAlbums / searchArtists / searchPlaylists
 * platform 为当前选中平台，调用方按来源分发后无需改签名
 */

import type { Track } from "@shared/types/player";
import type { CoverItem } from "@/types/artist";
import type { Platform } from "@shared/types/platform";
import * as netease from "./netease";
import * as bilibili from "./bilibili";

/** 搜索结果通用 */
export interface SearchResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

/** 搜索标签页展示的平台，与 fetcher 的实现范围一致 */
export const SEARCHABLE_PLATFORMS: Platform[] = ["netease", "bilibili"];

/** B 站没有专辑/歌手/歌单搜索，对应标签返回空集，不串回网易云的结果 */
const emptyResult = <T>(): SearchResult<T> => ({ items: [], total: 0, hasMore: false });

/** 搜索单曲 */
export const searchSongs = async (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<Track>> => {
  if (platform === "bilibili") return bilibili.songs(keyword, offset, limit);
  return netease.songs(keyword, offset, limit);
};

/** 搜索专辑 */
export const searchAlbums = async (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  if (platform === "bilibili") return emptyResult<CoverItem>();
  return netease.albums(keyword, offset, limit);
};

/** 搜索歌手 */
export const searchArtists = async (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  if (platform === "bilibili") return emptyResult<CoverItem>();
  return netease.artists(keyword, offset, limit);
};

/** 搜索歌单 */
export const searchPlaylists = async (
  platform: Platform,
  keyword: string,
  offset: number,
  limit: number,
): Promise<SearchResult<CoverItem>> => {
  if (platform === "bilibili") return emptyResult<CoverItem>();
  return netease.playlists(keyword, offset, limit);
};
