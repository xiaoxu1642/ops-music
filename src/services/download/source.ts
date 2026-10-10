import type { Track } from "@shared/types/player";
import type { QualityLevel } from "@/utils/quality";
import { resolveNeteaseDownloadUrl } from "@/apis/song/netease";

/** 下载源解析结果 */
export interface DownloadSource {
  url: string;
  /** 已知格式（flac/mp3 等），用于扩展名 */
  format?: string;
  /** 已知体积（字节） */
  size?: number;
}

/**
 * 按下载音质解析歌曲下载地址
 * @param track - 要下载的歌曲
 * @param level - 下载音质档位
 * @returns 下载源；无法下载（VIP/试听）返回 null
 */
export const resolveDownloadSource = async (
  track: Track,
  level: QualityLevel,
  usePlaybackForDownload: boolean,
): Promise<DownloadSource | null> => {
  if (track.source === "netease") {
    try {
      const resolved = await resolveNeteaseDownloadUrl(track, level, usePlaybackForDownload);
      if (resolved) return resolved;
    } catch {
      // 官方接口异常按无下载源处理
    }
  }
  return null;
};
