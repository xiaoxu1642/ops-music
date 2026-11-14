/**
 * lrcmux 逐字歌词兜底源
 *
 * 单个无鉴权 GET 换回 JSON：`meta.level` 标同步精度，`lines[].words` 给毫秒级逐字，
 * 词尾时间戳齐全，因此逐字资格直接由 `isWordSynced` 判定，不按 `meta.level` 自证。
 * 站点按曲目就近取 Deezer / KuGou / YouTube Music，中文命中常落到同名 Live 版，
 * 候选接受判定复用 `pickBestCandidate`，时长差 20s 以上直接否决。
 *
 * 命中结果序列化成 TTML（逐字）或 LRC（行级）原文存进 lyric_cache，
 * 格式由渲染层 `detectFormat` 现判，主进程不额外携带格式字段。
 */

import { net } from "electron";
import { getCachedLastResortLyric, setCachedLastResortLyric } from "@main/database/lyricCache";
import { buildFingerprint } from "@main/database/lyricMatchCache";
import { coreLog } from "@main/utils/logger";
import { pickBestCandidate } from "./utils";
import {
  isWordSynced,
  lrcmuxToSyncedLines,
  serializeToLrc,
  serializeToTtml,
  type LrcmuxLine,
} from "./synced";
import type { Track } from "@shared/types/player";

const API_URL = "https://api.lrcmux.dev/get";
const REQUEST_TIMEOUT_MS = 8000;
/** 站方要求 UA 标明应用名 */
const USER_AGENT = "OpsMusic/1.0 (+https://github.com/xiaoxu1642/ops-music)";

/** /get 返回体中用到的字段 */
interface LrcmuxResponse {
  track?: { title?: string; artist?: string; album?: string; duration?: number };
  lines?: LrcmuxLine[];
}

/**
 * 拉取 lrcmux 歌词
 * @param track - 歌曲信息
 * @returns TTML 或 LRC 原文，未命中或校验不过返回 null
 */
export const fetchLrcmuxLyric = async (track: Track): Promise<string | null> => {
  const key = buildFingerprint(track);
  const cached = getCachedLastResortLyric("lrcmux", key);
  if (cached) return cached;

  const params = new URLSearchParams({ title: track.title, format: "json" });
  const artist = track.artists[0]?.name;
  if (artist) params.set("artist", artist);

  let payload: LrcmuxResponse;
  try {
    const response = await net.fetch(`${API_URL}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // 404 就是站方没收录这首歌，属正常未命中
    if (!response.ok) {
      if (response.status !== 404) coreLog.warn(`[lrcmux] HTTP ${response.status}`);
      return null;
    }
    payload = (await response.json()) as LrcmuxResponse;
  } catch (err) {
    coreLog.warn("[lrcmux] 请求失败：", err);
    return null;
  }

  const info = payload.track ?? {};
  const accepted = pickBestCandidate(
    [
      {
        name: info.title ?? "",
        artist: info.artist ?? "",
        album: info.album,
        duration: info.duration ? info.duration * 1000 : undefined,
        extra: null,
      },
    ],
    track,
  );
  if (!accepted) {
    coreLog.warn(
      `[lrcmux] 候选与歌曲不符（${info.title ?? ""} - ${info.artist ?? ""}），拒绝：${track.title}`,
    );
    return null;
  }

  const lines = lrcmuxToSyncedLines(payload.lines ?? []);
  if (lines.length === 0) return null;
  const content = isWordSynced(lines) ? serializeToTtml(lines) : serializeToLrc(lines);
  if (!content) return null;

  setCachedLastResortLyric("lrcmux", key, content);
  coreLog.info(`[lrcmux] 兜底命中：${track.title} - ${info.artist ?? ""}`);
  return content;
};
