/**
 * 歌词匹配 IPC
 *
 * - lyrics:matchById(platform, id)         按 id 直取
 * - lyrics:matchByQuery(platform, track)   按 Track 元数据模糊搜索
 * - lyrics:fetchTTMLOverlay(track)         抓 AMLL TTML DB 的高质量 TTML
 * - lyrics:matchLocalLyric(track)          本地歌词库（.ttml / .lrc / .txt）匹配
 * - lyrics:matchLrclib(track)              LRCLIB 最后兜底
 *
 * 同 key 的并发请求会被 dedup：连按多次切歌只发一次网络。
 */

import { ipcMain, dialog } from "electron";
import * as netease from "@main/apis/common/lyric/netease";
import { fetchTTML } from "@main/apis/common/lyric/ttml";
import { fetchLrclibLyric } from "@main/apis/common/lyric/lrclib";
import { matchLocalLyric } from "@main/services/localLyricRepo";
import { buildFingerprint, getMatchedId } from "@main/database/lyricMatchCache";
import { coreLog } from "@main/utils/logger";
import type { LyricMatchResponse, LyricTextResponse } from "@shared/types/lyrics";
import type { Platform } from "@shared/types/platform";
import type { Track } from "@shared/types/player";

/** 进行中请求映射 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * 并发去重
 * @param key 唯一键，相同 key 的并发请求共用同一个 Promise
 * @param run 实际执行函数
 */
const dedup = <T>(key: string, run: () => Promise<T>): Promise<T> => {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = run().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
};

/**
 * 按 (platform, id) 直取
 * @param platform 平台
 * @param id 平台 id
 * @returns 歌词匹配结果
 */
const resolveById = async (platform: Platform, id: string): Promise<LyricMatchResponse> => {
  try {
    switch (platform) {
      case "netease":
        return { ok: true, data: await netease.getByPlatformId(id) };
      default:
        return { ok: false, error: `unsupported platform: ${platform}` };
    }
  } catch (err) {
    coreLog.warn(`[lyrics] matchById(${platform}, ${id}) failed:`, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/** 按 Track 元数据 fuzzy 匹配 */
const resolveByQuery = async (platform: Platform, track: Track): Promise<LyricMatchResponse> => {
  try {
    switch (platform) {
      case "netease":
        return { ok: true, data: await netease.getByQuery(track) };
      default:
        return { ok: false, error: `unsupported platform: ${platform}` };
    }
  } catch (err) {
    coreLog.warn(`[lyrics] matchByQuery(${platform}, ${track.title}) failed:`, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/**
 * 按 Track 解析出网易云的 TTML 候选 id，依次抓取直至命中。
 * - track.source=netease 时先用 track.id / track.extId
 * - 其它情况（本地歌曲）查 match cache 拿数字 id
 */
const resolveTTMLOverlay = async (track: Track): Promise<LyricTextResponse> => {
  try {
    const ids: string[] = [];
    const push = (v?: string) => {
      if (v && !ids.includes(v)) ids.push(v);
    };
    const cached = getMatchedId(buildFingerprint(track), "netease");
    if (track.source === "netease") {
      push(track.id);
      push(track.extId);
    }
    push(cached?.platformId);
    if (ids.length === 0) return { ok: true, data: null };
    return { ok: true, data: await fetchTTML(ids) };
  } catch (err) {
    coreLog.warn(`[lyrics] fetchTTMLOverlay(${track.title}) failed:`, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/**
 * LRCLIB 最后兜底：平台 API、本地歌词库、在线 TTML 与插件都没给歌词时才由渲染层调用
 * @param track - 歌曲信息
 * @returns 行级时间戳 LRC 原文响应
 */
const resolveLrclib = async (track: Track): Promise<LyricTextResponse> => {
  try {
    return { ok: true, data: await fetchLrclibLyric(track) };
  } catch (err) {
    coreLog.warn(`[lyrics] matchLrclib(${track.title}) failed:`, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

export const registerLyricsIpc = (): void => {
  ipcMain.handle("lyrics:matchById", (_evt, platform: Platform, id: string) =>
    dedup(`byId:${platform}:${id}`, () => resolveById(platform, id)),
  );
  ipcMain.handle("lyrics:matchByQuery", (_evt, platform: Platform, track: Track) =>
    dedup(`byQuery:${platform}:${track.id}`, () => resolveByQuery(platform, track)),
  );
  ipcMain.handle("lyrics:fetchTTMLOverlay", (_evt, track: Track) =>
    dedup(`ttml:${track.id}`, () => resolveTTMLOverlay(track)),
  );
  ipcMain.handle(
    "lyrics:matchLocalLyric",
    async (_evt, track: Track): Promise<LyricTextResponse> => {
      try {
        return { ok: true, data: await matchLocalLyric(track) };
      } catch (err) {
        coreLog.warn(`[lyrics] matchLocalLyric(${track.title}) failed:`, err);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
  ipcMain.handle("lyrics:matchLrclib", (_evt, track: Track) =>
    dedup(`lrclib:${track.id}`, () => resolveLrclib(track)),
  );
  ipcMain.handle("lyrics:pickLyricRepoDir", async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: "选择本地歌词库目录",
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
};
