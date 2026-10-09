import { callNetease } from "@main/apis/netease";
import type { Track, TrackFee } from "@shared/types/player";
import type { Platform } from "@shared/types/platform";
import { cacheTracks } from "./cache";

interface RawArtist {
  id?: number | string;
  name?: string;
}

interface NeteaseSong {
  id: number | string;
  name: string;
  ar?: RawArtist[];
  artists?: RawArtist[];
  al?: { id?: number | string; name?: string; picUrl?: string };
  album?: { id?: number | string; name?: string; picUrl?: string };
  dt?: number;
  duration?: number;
  fee?: TrackFee;
  alia?: string[];
  alias?: string[];
}

export interface OnlineSearchResult {
  platform: Platform;
  page: number;
  total: number;
  hasMore: boolean;
  tracks: Track[];
}

const sizedNeteaseCover = (url: string | undefined, size: number): string | undefined =>
  url ? `${url}${url.includes("?param=") ? "" : `?param=${size}y${size}`}` : undefined;

const neteaseToTrack = (song: NeteaseSong): Track => {
  const album = song.al ?? song.album;
  const artists = song.ar ?? song.artists ?? [];
  const cover = sizedNeteaseCover(album?.picUrl, 300);
  return {
    id: String(song.id),
    source: "netease",
    title: song.name,
    comment: (song.alia ?? song.alias)?.find((item) => item.trim()) || undefined,
    artists: artists.map((artist) => ({
      id: artist.id == null ? undefined : String(artist.id),
      name: artist.name ?? "",
    })),
    album: album?.name
      ? { id: album.id == null ? undefined : String(album.id), name: album.name, cover }
      : undefined,
    duration: song.dt ?? song.duration ?? 0,
    cover,
    coverOriginal: sizedNeteaseCover(album?.picUrl, 1024),
    fee: song.fee,
  };
};

const result = (
  platform: Platform,
  page: number,
  limit: number,
  total: number,
  tracks: Track[],
): OnlineSearchResult => {
  cacheTracks(tracks);
  return {
    platform,
    page,
    total,
    hasMore: (page - 1) * limit + tracks.length < total,
    tracks,
  };
};

/**
 * 搜索在线平台单曲并转换为可直接播放的 Track
 * @param platform - 在线音乐平台
 * @param query - 搜索关键词
 * @param page - 从 1 开始的页码
 * @param limit - 每页数量
 * @returns 统一搜索结果
 */
export const searchOnlineTracks = async (
  platform: Platform,
  query: string,
  page: number,
  limit: number,
): Promise<OnlineSearchResult> => {
  const { body } = await callNetease("cloudsearch", {
    keywords: query,
    type: 1,
    offset: (page - 1) * limit,
    limit,
  });
  if (body?.code !== 200) throw new Error(body?.message ?? body?.msg ?? "Netease search failed");
  const songs = (body?.result?.songs ?? []) as NeteaseSong[];
  return result(
    platform,
    page,
    limit,
    body?.result?.songCount ?? songs.length,
    songs.map(neteaseToTrack),
  );
};
