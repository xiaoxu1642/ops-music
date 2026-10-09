import type { Platform } from "./platform";
import type { Track } from "./player";
import type {
  LyricFormat,
  LyricInput,
  LyricLine,
  LyricMetadata,
  LyricResult,
  LyricSpan,
  LyricWord,
} from "lyric-kit";

export type {
  LyricFormat,
  LyricInput,
  LyricLine,
  LyricMetadata,
  LyricResult,
  LyricSpan,
  LyricWord,
};

/** 默认格式优先级 */
export const DEFAULT_LYRIC_FORMAT_ORDER: readonly LyricFormat[] = [
  "ttml",
  "lys",
  "qrc",
  "krc",
  "yrc",
  "lrc",
  "ass",
  "srt",
];

/** 歌词来源 */
export type LyricSource = "external" | "embedded" | "online";

/** 歌词数据 */
export type LyricData = {
  source: LyricSource;
  format: LyricFormat;
  /** 在线歌词所属平台，仅 source=online 时有值 */
  platform?: Platform;
} | null;

/** 歌词匹配结果 */
export interface LyricMatchResult extends LyricInput {
  platform: Platform;
  /** 主歌词格式 */
  format: LyricFormat;
}

/** 歌词匹配 IPC 响应 */
export type LyricMatchResponse =
  { ok: true; data: LyricMatchResult | null } | { ok: false; error: string };

/** 歌词原文 IPC 响应（TTML / LRC 等未解析文本） */
export type LyricTextResponse = { ok: true; data: string | null } | { ok: false; error: string };

/** 渲染端歌词匹配入口 */
export interface LyricsApi {
  /** 按 id 直取某平台歌词 */
  matchById: (platform: Platform, id: string) => Promise<LyricMatchResponse>;
  /** 按 Track 元数据在某平台模糊搜索歌词 */
  matchByQuery: (platform: Platform, track: Track) => Promise<LyricMatchResponse>;
  /** 抓取 AMLL TTML DB 的网易云 TTML 歌词 */
  fetchTTMLOverlay: (track: Track) => Promise<LyricTextResponse>;
  /** 在本地歌词库（.ttml / .lrc / .txt）中按元信息匹配，命中返回原文 */
  matchLocalLyric: (track: Track) => Promise<LyricTextResponse>;
  /** LRCLIB 最后兜底：其它来源都没有歌词时取行级时间戳 LRC */
  matchLrclib: (track: Track) => Promise<LyricTextResponse>;
  /** 弹出目录选择器，返回所选本地歌词库目录 */
  pickLyricRepoDir: () => Promise<string | null>;
}
