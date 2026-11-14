/**
 * Migu 歌词匹配
 *
 * 两个入口：
 *  - getByPlatformId(contentId)  按 contentId 直取（resourceinfo → lrcUrl / mrcUrl）
 *  - getByQuery(track)           search → pickBestCandidate → 直取
 *
 * 咪咕歌词两级：lrcUrl 是行级 LRC；mrcUrl 是逐字 MRC 密文，TEA 解密后转增强 LRC，
 * 逐字版本优先（喂 AMLL 逐字引擎）。
 */

import { net } from "electron";
import { USER_AGENT } from "@main/apis/migu/core/config";
import { resourceInfoUrl } from "@main/apis/migu/core/request";
import { callMigu } from "@main/apis/migu";
import { normalizeMiguSong } from "@main/apis/migu/core/song";
import { decryptMrc, formatMrc } from "./miguMrc";
import { getCachedLyric, setCachedLyric } from "@main/database/lyricCache";
import { buildFingerprint, getMatchedId, setMatchedId } from "@main/database/lyricMatchCache";
import { coreLog } from "@main/utils/logger";
import type { LyricMatchResult } from "@shared/types/lyrics";
import type { Track } from "@shared/types/player";
import { pickBestCandidate } from "./utils";

/** resourceinfo 响应条目（歌词地址所在） */
interface MiguResourceItem {
  contentId?: string;
  copyrightId?: string;
  lrcUrl?: string;
  mrcUrl?: string;
}

/**
 * 拉取歌词文本（lrcUrl 用 https + 站内 Referer，防止 http 混链与防盗链拒绝）
 * @param url - 歌词文件地址
 * @returns 原文；失败返回 null
 */
const fetchLyricText = async (url: string): Promise<string | null> => {
  try {
    const httpsUrl = url.replace(/^http:/, "https:");
    const res = await net.fetch(httpsUrl, {
      headers: { Referer: "https://y.migu.cn/", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    coreLog.warn(`[lyric:migu] 歌词文件拉取失败 ${url}`, err);
    return null;
  }
};

/**
 * 按 contentId 直取歌词：mrcUrl 逐字优先，lrcUrl 行级兜底
 * @param id - 咪咕 contentId
 */
export const getByPlatformId = async (id: string): Promise<LyricMatchResult | null> => {
  const cached = getCachedLyric("migu", id);
  if (cached) return cached;

  try {
    // 歌词地址只在 resourceinfo.do，by-contentids 详情不带 lrcUrl/mrcUrl
    const res = await net.fetch(resourceInfoUrl(id), {
      headers: { Referer: "https://music.migu.cn/" },
      signal: AbortSignal.timeout(8000),
    });
    const info = (await res.json()) as { resource?: MiguResourceItem[] };
    const item = info.resource?.[0];
    if (!item) return null;

    let content: string | null = null;
    if (item.mrcUrl) {
      const cipher = await fetchLyricText(item.mrcUrl);
      if (cipher) {
        const plain = formatMrc(decryptMrc(cipher.trim()));
        if (plain.trim()) content = plain;
      }
    }
    if (!content && item.lrcUrl) {
      content = await fetchLyricText(item.lrcUrl);
    }
    if (!content?.trim()) return null;

    const result: LyricMatchResult = { platform: "migu", format: "lrc", content };
    setCachedLyric("migu", id, result);
    return result;
  } catch (err) {
    coreLog.warn(`[lyric:migu] getByPlatformId(${id}) failed:`, err);
    return null;
  }
};

/**
 * 按 Track 元数据模糊搜索：search → 挑最佳 → 直取歌词
 * @param track 歌曲信息
 */
export const getByQuery = async (track: Track): Promise<LyricMatchResult | null> => {
  // 命中映射缓存：跳过 search → 直接走 byId
  const fingerprint = buildFingerprint(track);
  const cached = getMatchedId(fingerprint, "migu");
  if (cached) return getByPlatformId(cached.platformId);

  try {
    const { body } = await callMigu("search", {
      keywords: `${track.artists[0]?.name ?? ""} ${track.title}`,
      page: 1,
    });
    const items = ((body as { items?: Array<Record<string, unknown>> }).items ?? []) as Parameters<
      typeof normalizeMiguSong
    >[0][];
    const songs = items
      .map(normalizeMiguSong)
      .filter((song): song is NonNullable<typeof song> => song !== null);
    const best = pickBestCandidate(
      songs.map((song) => ({
        name: song.title,
        artist: song.artist,
        album: song.album,
        duration: song.duration,
        extra: { id: song.id },
      })),
      track,
    );
    if (!best) return null;
    setMatchedId(fingerprint, "migu", best.extra.id);
    return await getByPlatformId(best.extra.id);
  } catch (err) {
    coreLog.warn(`[lyric:migu] getByQuery(${track.title}) failed:`, err);
    return null;
  }
};
