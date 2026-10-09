/**
 * 歌词接口返回缓存
 *
 * 表：lyric_cache(platform, platform_id PK, data JSON, fetched_at)
 * - data 存整个 LyricMatchResult 序列化后字符串（含主歌词 + 翻译 + 罗马音的 raw 文本）
 * - 解析交给渲染端的 parseLyric，主进程只做"按平台主键 key-value"的透明缓存
 * - LRCLIB 兜底源同表存 LRC 原文，platform 列用 "lrclib" 区分
 *
 * 清理策略：暂不做 TTL，依赖"设置→存储管理"里的"清空歌词缓存"按钮手动触发
 */

import type { LyricMatchResult } from "@shared/types/lyrics";
import type { Platform } from "@shared/types/platform";
import { getDb } from "./index";

/** 按 (platform, platformId) 命中原始接口返回，未命中返回 null */
export const getCachedLyric = (platform: Platform, platformId: string): LyricMatchResult | null => {
  const row = getDb()
    .prepare("SELECT data FROM lyric_cache WHERE platform = ? AND platform_id = ?")
    .get(platform, platformId) as { data: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as LyricMatchResult;
  } catch {
    return null;
  }
};

/** upsert 原始接口返回；fetched_at 每次写入都刷新 */
export const setCachedLyric = (
  platform: Platform,
  platformId: string,
  result: LyricMatchResult,
): void => {
  getDb()
    .prepare(
      `INSERT INTO lyric_cache (platform, platform_id, data, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(platform, platform_id) DO UPDATE SET
         data = excluded.data,
         fetched_at = excluded.fetched_at`,
    )
    .run(platform, platformId, JSON.stringify(result), Date.now());
};

/** 清空全部歌词缓存（给"存储管理"按钮用） */
export const clearLyricCache = (): void => {
  getDb().prepare("DELETE FROM lyric_cache").run();
};

/**
 * LRCLIB 在表里的 platform 列取值：不是音源平台，只作键区分，
 * 让兜底歌词与其它在线源共用同一张缓存表
 */
const LRCLIB_PLATFORM = "lrclib";

/**
 * 读取 LRCLIB 兜底歌词原文
 * @param key - track 指纹（buildFingerprint）
 * @returns 缓存的 LRC 原文，未命中返回 null
 */
export const getCachedLrclibLyric = (key: string): string | null => {
  const row = getDb()
    .prepare("SELECT data FROM lyric_cache WHERE platform = ? AND platform_id = ?")
    .get(LRCLIB_PLATFORM, key) as { data: string } | undefined;
  return row?.data ?? null;
};

/**
 * 写入 LRCLIB 兜底歌词原文；存未解析的 LRC 文本，解析规则升级后旧缓存不作废
 * @param key - track 指纹（buildFingerprint）
 * @param content - LRC 原文
 */
export const setCachedLrclibLyric = (key: string, content: string): void => {
  getDb()
    .prepare(
      `INSERT INTO lyric_cache (platform, platform_id, data, fetched_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(platform, platform_id) DO UPDATE SET
         data = excluded.data,
         fetched_at = excluded.fetched_at`,
    )
    .run(LRCLIB_PLATFORM, key, content, Date.now());
};
