/**
 * LRCLIB 兜底歌词源
 *
 * 公开无鉴权接口：单个 GET 用歌名 + 可选歌手 / 专辑 / 时长换回一条记录，
 * `syncedLyrics` 字段即行级时间戳 LRC。作为歌词链路的最后兜底，只有平台 API、
 * 本地歌词库、在线 TTML 与插件都没给出歌词时才调用（行级精度补不了逐字）。
 *
 * 站方新增的 `lyricsfile` 字段是 YAML，少数记录带逐字词序列，因此同一请求顺手解析它：
 * 解析出的行过 `isWordSynced` 质量闸门才当逐字用并序列化成 TTML，闸门不过一律回落
 * `syncedLyrics` 的 LRC 原文，与旧行为一致。
 *
 * 候选接受判定复用 `pickBestCandidate`，也就是其它在线源用的 durationClose /
 * durationFar 同一口径：时长相差超过 20s 直接否决，仅靠歌名子串命中时
 * 必须有歌手或 ±5s 时长佐证。
 * 命中原文按 track 指纹写进 lyric_cache，与在线源同表，重启后零网络开销。
 */

import { net } from "electron";
import { getCachedLastResortLyric, setCachedLastResortLyric } from "@main/database/lyricCache";
import { buildFingerprint } from "@main/database/lyricMatchCache";
import { coreLog } from "@main/utils/logger";
import { parseLyricsfile } from "./lyricsfile";
import { isWordSynced, serializeToTtml } from "./synced";
import { pickBestCandidate, type LyricCandidate } from "./utils";
import type { Track } from "@shared/types/player";

const API_URL = "https://lrclib.net/api/get";
const REQUEST_TIMEOUT_MS = 8000;
/** 站方要求 UA 标明应用名，否则会被限流 */
const USER_AGENT = "OpsMusic/1.0";

/** /api/get 返回记录中用到的字段 */
interface LrclibRecord {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  /** 站方时长单位为秒 */
  duration?: number;
  syncedLyrics?: string | null;
  /** Lyricsfile YAML 原文，站方保证每条记录都带；逐字数据只在这里 */
  lyricsfile?: string | null;
}

/** 查询串：歌曲时长换算成秒一起上报，帮站方在同名曲目里选对版本 */
const buildQuery = (track: Track): string => {
  const params = new URLSearchParams({ track_name: track.title });
  const artist = track.artists[0]?.name;
  if (artist) params.set("artist_name", artist);
  if (track.album?.name) params.set("album_name", track.album.name);
  if (track.duration) params.set("duration", String(Math.round(track.duration / 1000)));
  return params.toString();
};

/**
 * 把 Lyricsfile 转成 TTML，只有确带多词行才转
 * @param lyricsfile - Lyricsfile YAML 原文
 * @returns TTML 原文，没有逐字数据时返回 null
 */
const serializeWordSynced = (lyricsfile?: string | null): string | null => {
  if (!lyricsfile?.trim()) return null;
  const lines = parseLyricsfile(lyricsfile);
  if (!isWordSynced(lines)) return null;
  return serializeToTtml(lines) || null;
};

/**
 * 拉取 LRCLIB 同步歌词
 * @param track - 歌曲信息
 * @returns TTML 或行级时间戳 LRC 原文，未命中或校验不过返回 null
 */
export const fetchLrclibLyric = async (track: Track): Promise<string | null> => {
  const key = buildFingerprint(track);
  const cached = getCachedLastResortLyric("lrclib", key);
  if (cached) return cached;

  let record: LrclibRecord;
  try {
    const response = await net.fetch(`${API_URL}?${buildQuery(track)}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // 404 就是站方没收录这首歌，属正常未命中
    if (!response.ok) {
      if (response.status !== 404) coreLog.warn(`[lrclib] HTTP ${response.status}`);
      return null;
    }
    record = (await response.json()) as LrclibRecord;
  } catch (err) {
    coreLog.warn("[lrclib] 请求失败：", err);
    return null;
  }

  // 逐字优先，闸门不过时维持原有的 syncedLyrics 路径
  const content = serializeWordSynced(record.lyricsfile) ?? record.syncedLyrics?.trim();
  if (!content) return null;

  const candidate: LyricCandidate<null> = {
    name: record.trackName ?? "",
    artist: record.artistName ?? "",
    album: record.albumName,
    duration: record.duration ? record.duration * 1000 : undefined,
    extra: null,
  };
  if (!pickBestCandidate([candidate], track)) {
    coreLog.warn(
      `[lrclib] 候选与歌曲不符（${record.trackName} - ${record.artistName}），拒绝：${track.title}`,
    );
    return null;
  }

  setCachedLastResortLyric("lrclib", key, content);
  coreLog.info(`[lrclib] 兜底命中：${track.title} - ${record.artistName ?? ""}`);
  return content;
};
