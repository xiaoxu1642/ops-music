import type { Track } from "@shared/types/player";
import type { MiguSong } from "@shared/types/migu";

/**
 * 咪咕歌曲 → 应用层 Track
 *
 * id 直接落 contentId：取流（contentId + copyrightId）与歌词（resourceinfo）都以它为入口。
 * copyrightId 是 listen 接口必需参数，挂在 extId 上随 Track 流转。
 * @param song - 主进程归一化后的咪咕歌曲
 * @returns 应用层 Track
 */
export const miguSongToTrack = (song: MiguSong): Track => ({
  id: song.id,
  source: "migu",
  extId: song.copyrightId,
  title: song.title,
  artists: [{ id: song.artistId, name: song.artist }],
  album: song.album ? { id: song.albumId, name: song.album } : undefined,
  duration: song.duration,
  cover: song.cover,
  fee: song.isVip ? 1 : 0,
});

/** 搜索接口归一化响应体 */
export interface MiguSearchBody {
  items: MiguSong[];
  total: number;
  hasMore: boolean;
}
