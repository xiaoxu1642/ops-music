/**
 * 下载歌词解析
 *
 * 取歌曲歌词文本（用于内嵌到标签 / 写 .lrc）。来源在渲染层，因此在入队前解析好带给主进程。
 */

import type { Track } from "@shared/types/player";
import type { LyricFormat, LyricInput } from "@shared/types/lyrics";
import { isPlatform } from "@shared/types/platform";
import { buildDownloadLyric } from "@/utils/lyric/serialize";
import {
  isBetterFormat,
  isPluginLyricPreferred,
  resolveLocalRepoLyric,
  resolveOnlineByPreference,
  resolvePluginLyric,
  type ResolvedLyric,
} from "@/services/lyric/resolve";

/** 下载用歌词 */
export interface DownloadLyric extends LyricInput {
  format: LyricFormat;
}

/** 转为下载歌词结构 */
const toDownloadLyric = (lyric: ResolvedLyric): DownloadLyric => ({
  format: lyric.source.format,
  ...lyric.input,
});

/** 判断候选歌词是否能被下载序列化使用 */
const toUsableDownloadLyric = (lyric: ResolvedLyric | null): DownloadLyric | null => {
  if (!lyric) return null;
  const downloadLyric = toDownloadLyric(lyric);
  return buildDownloadLyric(downloadLyric, downloadLyric.format, "lrc") ? downloadLyric : null;
};

/**
 * 取歌曲歌词文本
 * @param track - 歌曲
 * @returns 歌词文本与格式；无歌词返回 null
 */
export const resolveDownloadLyric = async (track: Track): Promise<DownloadLyric | null> => {
  const local = toUsableDownloadLyric(await resolveLocalRepoLyric(track));
  if (local) return local;

  // 在线平台
  if (isPlatform(track.source)) {
    // 插件优选：请求先行发出，与正常来源并发
    const pluginTask = isPluginLyricPreferred() ? resolvePluginLyric(track) : null;
    const online = await resolveOnlineByPreference(track, { hasLocal: false, localFormat: null });
    const onlineLyric = toUsableDownloadLyric(online);
    if (pluginTask) {
      const plugin = toUsableDownloadLyric(await pluginTask);
      if (plugin && isBetterFormat(plugin.format, onlineLyric?.format ?? null)) return plugin;
      return onlineLyric ?? plugin ?? null;
    }
    return onlineLyric ?? toUsableDownloadLyric(await resolvePluginLyric(track));
  }

  return null;
};
