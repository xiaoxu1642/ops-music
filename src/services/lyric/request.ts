import type { Track } from "@shared/types/player";
import type { LyricMatchResult } from "@shared/types/lyrics";
import type { Platform } from "@shared/types/platform";

/**
 * 向指定平台请求歌词
 * @param platform - 目标平台
 * @param track - 歌曲信息
 * @returns 在线歌词，不存在则返回 null
 */
export const requestPlatformLyric = async (
  platform: Platform,
  track: Track,
): Promise<LyricMatchResult | null> => {
  const byId = track.source === platform;
  const resp = byId
    ? await window.api.lyrics.matchById(platform, track.id)
    : await window.api.lyrics.matchByQuery(platform, track);
  return resp.ok && resp.data ? resp.data : null;
};

/**
 * 请求 AMLL TTML DB 的网易云 TTML 覆盖歌词
 * @param track - 歌曲信息
 * @returns IPC 请求结果
 */
export const requestTTMLOverlay = (track: Track) => window.api.lyrics.fetchTTMLOverlay(track);
