/**
 * B 站歌词
 *
 * 只服务 B 站自己的视频：按 bvid 直取字幕（模块层已转行级 LRC）。
 * **不参与跨源兜底**：拿歌名去 B 站模糊搜视频、再把视频字幕当歌词的做法已退役
 * （命中率低且容易配上无关视频），兜底链路由 netease 与 LRCLIB 承担。
 *
 * DB 缓存与 netease 歌词桥同构，返回原始文本交给渲染端解析。
 * B 站只有行级字幕，主格式恒为 lrc，没有翻译与罗马音。
 */

import { callBilibili } from "@main/apis/bilibili";
import { getCachedLyric, setCachedLyric } from "@main/database/lyricCache";
import { coreLog } from "@main/utils/logger";
import type { BilibiliLyricResult } from "@main/apis/bilibili/core/types";
import type { LyricMatchResult } from "@shared/types/lyrics";

/**
 * 按 bvid 直取歌词
 * @param id bvid
 */
export const getByPlatformId = async (id: string): Promise<LyricMatchResult | null> => {
  const cached = getCachedLyric("bilibili", id);
  if (cached) return cached;
  try {
    const { body } = await callBilibili("lyric", { bvid: id });
    const content = (body as BilibiliLyricResult | null)?.lyric?.trim();
    if (!content) return null;
    const result: LyricMatchResult = { platform: "bilibili", format: "lrc", content };
    setCachedLyric("bilibili", id, result);
    return result;
  } catch (err) {
    coreLog.warn(`[lyric:bilibili] getByPlatformId(${id}) failed:`, err);
    return null;
  }
};
