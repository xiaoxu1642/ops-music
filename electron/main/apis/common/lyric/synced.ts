/**
 * 在线兜底歌词的中间结构与序列化
 *
 * lrcmux 的 JSON 与 LRCLIB 的 Lyricsfile 都直接给毫秒级词时间戳，但 `lyric-kit` 的
 * `LyricFormat` 里没有这两种载体，因此主进程先归一到 `SyncedLine`，再序列化成 TTML
 * （逐字）或 LRC（行级）交给渲染层解析。逐字资格判定集中在这里，两个兜底源共用同一口径。
 */

import { toLRC, toTTML } from "lyric-kit";
import type { LyricLine, LyricWord } from "lyric-kit";

/** 歌词行归一化后的词片段 */
export interface SyncedWord {
  /** 词文本，源侧的行尾空格原样保留 */
  text: string;
  /** 起始毫秒 */
  startTime: number;
  /** 结束毫秒，省略时由下一个词的起始时间推出 */
  endTime?: number;
}

/** 归一化后的歌词行 */
export interface SyncedLine {
  /** 行起始毫秒 */
  startTime: number;
  /** 行结束毫秒 */
  endTime: number;
  /** 逐字词序列；行级来源填整行单词 */
  words: SyncedWord[];
}

/** lrcmux 的词项，站方偶发缺时间字段 */
interface LrcmuxWord {
  text?: string;
  start?: number;
  end?: number;
}

/** lrcmux 的行项 */
export interface LrcmuxLine {
  text?: string;
  start?: number;
  end?: number;
  words?: LrcmuxWord[];
}

/** 毫秒整数校验，站方偶发字符串或缺字段 */
const toMs = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;

/**
 * 把 lrcmux 行项归一化成中间结构
 * @param lines - 站方行项
 * @returns 有有效时间轴的行，缺起始时间的行直接丢弃
 */
export const lrcmuxToSyncedLines = (lines: readonly LrcmuxLine[]): SyncedLine[] => {
  const result: SyncedLine[] = [];
  for (const line of lines) {
    const startTime = toMs(line.start);
    if (!Number.isFinite(startTime)) continue;
    const endTime = toMs(line.end);
    const words = (line.words ?? [])
      .map((word) => ({
        text: word.text ?? "",
        startTime: toMs(word.start),
        endTime: toMs(word.end),
      }))
      .filter((word) => word.text.length > 0 && Number.isFinite(word.startTime));
    // 没有逐字序列时整行文本当一个词，保持行级可用
    const usable =
      words.length > 0 ? words : [{ text: (line.text ?? "").trim(), startTime, endTime }];
    if (usable.every((word) => word.text.length === 0)) continue;
    result.push({
      startTime,
      endTime: Number.isFinite(endTime) ? endTime : startTime,
      words: usable,
    });
  }
  return result;
};

/** 参与逐字判定的最少行数，样本过少不足以判断整体质量 */
const WORD_GATE_MIN_LINES = 5;
/** 多词行占比下限：低于它说明多数行整行成词，标成逐字属于虚标 */
const WORD_GATE_MULTI_WORD_RATIO = 0.3;

/**
 * 判定行序列够不够格当逐字歌词
 * @param lines - 归一化后的歌词行
 * @returns 值得按逐字（TTML）提交则返回 true，否则按行级处理
 */
export const isWordSynced = (lines: readonly SyncedLine[]): boolean => {
  const worded = lines.filter((line) => line.words.length > 0);
  if (worded.length < WORD_GATE_MIN_LINES) return false;
  const multiWord = worded.filter((line) => line.words.length > 1).length;
  return multiWord / worded.length >= WORD_GATE_MULTI_WORD_RATIO;
};

/** 补齐词尾时间：源侧只给词首时，用下一个词的起始时间，末词用行尾 */
const toLyricWords = (line: SyncedLine): LyricWord[] =>
  line.words.map((word, index) => {
    const endTime = Number.isFinite(word.endTime)
      ? (word.endTime as number)
      : (line.words[index + 1]?.startTime ?? line.endTime);
    return { word: word.text, startTime: word.startTime, endTime };
  });

/** 归一化行转 `lyric-kit` 的歌词行，兜底源没有翻译与音译，字段留空 */
const toLyricLine = (line: SyncedLine, index: number): LyricLine => ({
  id: `L${index + 1}`,
  words: toLyricWords(line),
  translatedLyric: "",
  romanLyric: "",
  startTime: line.startTime,
  endTime: line.endTime,
  isBG: false,
  isDuet: false,
});

/** 没有带词的行就拼不出任何内容，两个序列化入口共用这条判定 */
const usableLines = (lines: readonly SyncedLine[]): SyncedLine[] =>
  lines.filter((line) => line.words.length > 0);

/**
 * 序列化为 TTML，渲染层按逐字解析
 * @param lines - 归一化后的歌词行
 * @returns TTML 原文，没有有效行时返回空串
 */
export const serializeToTtml = (lines: readonly SyncedLine[]): string => {
  const valid = usableLines(lines);
  if (valid.length === 0) return "";
  return toTTML({ lines: valid.map(toLyricLine), metadata: {} });
};

/**
 * 序列化为行级 LRC
 * @param lines - 归一化后的歌词行
 * @returns LRC 原文，没有有效行时返回空串
 */
export const serializeToLrc = (lines: readonly SyncedLine[]): string => {
  const valid = usableLines(lines);
  if (valid.length === 0) return "";
  return toLRC(valid.map(toLyricLine));
};
