/**
 * B 站歌词匹配
 *
 * 两个入口：
 *  - getByPlatformId(bvid)   按 bvid 直取视频字幕（模块层已转行级 LRC）
 *  - getByQuery(track)       搜索视频 → pickBestCandidate → getByPlatformId
 *
 * 与 netease 歌词桥同构：DB 缓存 + fuzzy 匹配映射缓存，返回原始文本交给渲染端解析。
 * B 站只有行级字幕，主格式恒为 lrc，没有翻译与罗马音。
 */

import { callBilibili } from "@main/apis/bilibili";
import { getCachedLyric, setCachedLyric } from "@main/database/lyricCache";
import { buildFingerprint, getMatchedId, setMatchedId } from "@main/database/lyricMatchCache";
import { coreLog } from "@main/utils/logger";
import type { BilibiliLyricResult, BilibiliSearchResult } from "@main/apis/bilibili/core/types";
import type { LyricMatchResult } from "@shared/types/lyrics";
import type { Track } from "@shared/types/player";
import { buildLyricSearchKeyword, pickBestCandidate, type LyricCandidate } from "./utils";

/** 候选搜索条数，与 netease 歌词桥一致 */
const SEARCH_LIMIT = 20;

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

/**
 * 按 Track 元数据模糊搜索：search → 挑最佳 → 按 bvid 取歌词
 * @param track 歌曲信息
 */
export const getByQuery = async (track: Track): Promise<LyricMatchResult | null> => {
  const fingerprint = buildFingerprint(track);
  const cached = getMatchedId(fingerprint, "bilibili");
  if (cached) return getByPlatformId(cached.platformId);

  const keyword = buildLyricSearchKeyword(track);
  if (!keyword) return null;

  const candidates: LyricCandidate<{ bvid: string }>[] = [];
  try {
    const { body } = await callBilibili("search", { keywords: keyword, limit: SEARCH_LIMIT });
    for (const item of (body as BilibiliSearchResult | null)?.items ?? []) {
      candidates.push({
        name: item.title,
        artist: item.artist,
        duration: item.duration,
        extra: { bvid: item.bvid },
      });
    }
  } catch (err) {
    coreLog.warn(`[lyric:bilibili] search("${keyword}") failed:`, err);
    return null;
  }
  const best = pickBestCandidate(candidates, track);
  coreLog.info(
    `[lyric:bilibili] fuzzy "${keyword}" → ${candidates.length} hits, best=${best?.name ?? "none"}`,
  );
  if (!best) return null;
  setMatchedId(fingerprint, "bilibili", best.extra.bvid);
  return getByPlatformId(best.extra.bvid);
};
