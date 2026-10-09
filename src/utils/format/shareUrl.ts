import type { Track, TrackSource } from "@shared/types/player";
import type { Collection, CollectionType } from "@/types/collection";

/**
 * 取在线平台的歌曲分享链接
 * @param track - 当前歌曲，本地曲目返回 null
 */
export const getTrackShareUrl = (track: Track | null | undefined): string | null => {
  if (!track?.id) return null;
  return track.source === "netease" ? `https://music.163.com/#/song?id=${track.id}` : null;
};

/**
 * 取在线平台的歌曲合集分享链接
 * @param collection - 当前歌曲合集，本地或无对应站点的合集返回 null
 */
export const getCollectionShareUrl = (collection: Collection | null | undefined): string | null => {
  if (!collection?.id) return null;
  const urls: Partial<Record<CollectionType, Partial<Record<TrackSource, string>>>> = {
    album: { netease: `https://music.163.com/#/album?id=${collection.id}` },
    playlist: { netease: `https://music.163.com/#/playlist?id=${collection.id}` },
    radio: { netease: `https://music.163.com/#/djradio?id=${collection.id}` },
  };
  return urls[collection.type]?.[collection.source] ?? null;
};
