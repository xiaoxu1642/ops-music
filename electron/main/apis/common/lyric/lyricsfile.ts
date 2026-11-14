/**
 * LRCLIB Lyricsfile（YAML）解析
 *
 * 只覆盖兜底链路需要的子集：顶层 `lines:` 序列里的 `text` / `start_ms` / `end_ms`，
 * 以及可选的 `words:` 子序列（词项只给起始毫秒，结束时间交给序列化层按下一词补齐）。
 * `metadata:` 与序列之后的 `plain:` 块一律忽略；逐字与否由调用方按 `hasWordSync` 决定，
 * 这里不做判断，`words: []` 与整行成词都照实解析成行级数据。
 *
 * 序列项缩进随导出工具变化（`- text:` 顶格或缩进两格），因此行级键与词级键按
 * 「行项缩进 + 2」这一分界区分，两种缩进风格都能解。
 */

import type { SyncedLine } from "./synced";

/** 键行：`key: value`，序列项额外记录 `- ` 前缀 */
const KEY_RE = /^(?:-\s+)?(?<key>[\w-]+):\s*(?<value>.*)$/;

/**
 * 还原标量：单引号内 `''` 是转义的单引号，双引号处理 `\"` 与 `\\`，明文原样保留
 * @param value - 冒号后的原始文本
 * @returns 去引号后的字符串
 */
const unquoteScalar = (value: string): string => {
  const text = value.trim();
  if (text.length > 1 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text.length > 1 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return text;
};

/** 解析毫秒整数，非数字返回 NaN 由调用方按缺省处理 */
const parseMs = (value: string): number => {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

/** 解析中的行 */
interface PendingLine {
  startTime: number;
  endTime: number;
  words: { text: string; startTime: number }[];
}

/** 只保留有文本且有时间轴的行 */
const isUsable = (line: PendingLine): boolean =>
  Number.isFinite(line.startTime) && line.words.some((word) => word.text.length > 0);

/**
 * 解析 Lyricsfile 的歌词行序列
 * @param text - Lyricsfile YAML 原文
 * @returns 归一化歌词行，无法定位 `lines:` 时返回空数组
 */
export const parseLyricsfile = (text: string): SyncedLine[] => {
  const result: SyncedLine[] = [];
  const pending: PendingLine[] = [];
  let current: PendingLine | null = null;
  let currentWord: { text: string; startTime: number } | null = null;
  let inLines = false;
  let inWords = false;
  let lineItemIndent = -1;

  /** 收束当前词项 */
  const closeWord = (): void => {
    if (current && currentWord && currentWord.text.length > 0) current.words.push(currentWord);
    currentWord = null;
  };

  /** 收束当前行项 */
  const closeLine = (): void => {
    closeWord();
    if (current && isUsable(current)) pending.push(current);
    current = null;
    inWords = false;
  };

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = raw.length - trimmed.length;

    if (!inLines) {
      if (indent === 0 && trimmed === "lines:") inLines = true;
      continue;
    }
    // 顶层出现别的键（例如末尾的 plain: 纯文本块）即视为序列结束
    if (indent === 0 && !trimmed.startsWith("- ")) break;

    const isItem = trimmed.startsWith("- ");
    if (isItem && lineItemIndent === -1) lineItemIndent = indent;

    const matched = KEY_RE.exec(trimmed);
    if (!matched) continue;
    const key = matched.groups?.key ?? "";
    const value = matched.groups?.value ?? "";

    if (isItem && indent === lineItemIndent) {
      closeLine();
      current = { startTime: Number.NaN, endTime: Number.NaN, words: [] };
      // 行项自带的 text 先当作整行单词落下，后续出现 words 序列时整行文本作废
      if (key === "text") current.words.push({ text: unquoteScalar(value), startTime: Number.NaN });
      inWords = false;
      continue;
    }

    if (isItem && indent > lineItemIndent) {
      if (!current) continue;
      closeWord();
      currentWord = { text: unquoteScalar(value), startTime: Number.NaN };
      continue;
    }

    // 行级键与词级键的分界：行级键缩进 = 行项缩进 + 2，词级键更深
    const wordLevel = indent > lineItemIndent + 2;
    if (wordLevel && !inWords) continue;

    switch (key) {
      case "start_ms": {
        const ms = parseMs(value);
        if (wordLevel && currentWord) currentWord.startTime = ms;
        else if (!wordLevel && current && !inWords) current.startTime = ms;
        break;
      }
      case "end_ms": {
        if (!wordLevel && current) current.endTime = parseMs(value);
        break;
      }
      case "words": {
        closeWord();
        // `words: []` 是空数组写法，没有逐字序列
        inWords = value.trim() !== "[]";
        if (inWords && current) current.words.length = 0;
        break;
      }
      default:
        break;
    }
  }
  closeLine();

  for (const line of pending) {
    result.push({
      startTime: line.startTime,
      endTime: Number.isFinite(line.endTime) ? line.endTime : line.startTime,
      words: line.words.map((word) => ({
        text: word.text,
        startTime: Number.isFinite(word.startTime) ? word.startTime : line.startTime,
      })),
    });
  }
  return result;
};
