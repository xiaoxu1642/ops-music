/**
 * 本地歌词库的文件名 / 元信息打分（纯函数，无 IO）
 *
 * 两段判定沿用 TaskBarLyrics 的算法语义（只借语义不搬代码）：
 * 先按文件名模糊匹配，未过门槛再用文件头 `[ti:]` / `[ar:]` 声明的元信息判定，
 * 两段各有接受阈值。
 *
 * 归一化复用 `@main/apis/common/lyric/utils` 的 normalize，只额外处理文件名特有的
 * 括号段与杂字符；相似度用下面的 similarity 自行实现（仓内没有同类打分器）。
 */

import { normalize } from "@main/apis/common/lyric/utils";
import type { Track } from "@shared/types/player";

/** 文件名模糊匹配的接受阈值（打分上限约 3.8，与参考实现同口径） */
const FILENAME_MATCH_THRESHOLD = 0.62;
/** 文件头元信息打分的接受阈值（歌名全等 2.0，加歌手佐证才够 1.2） */
const TAG_MATCH_THRESHOLD = 1.2;
/** 读取文件头多少行来找 [ti:] / [ar:]，超出即视为没有声明 */
const HEAD_SCAN_LINES = 120;
/** 文件名里出现歌手名时，除子串命中外的相似度下限 */
const ARTIST_FUZZY_RATIO = 0.6;

/** 括号整段：半角/全角开括到任意闭括，如 `(Live)`、`【翻唱】`、`[伴奏]` */
const BRACKET_SEGMENT_RE = /[([（【][^)\]）】]*[)\]）】]/g;
/** 只保留单词字符与汉字，去掉全角标点等 normalize 未覆盖的杂字符 */
const NON_MATCH_CHAR_RE = /[^\w\u4e00-\u9fff]+/g;
/** 行级时间戳：`[mm:ss]` / `[mm:ss.xx]` / `[mm:ss,xxx]`（分隔符在不同导出工具里点逗号混用） */
const TIMESTAMP_RE = /\[\d{1,2}:\d{2}(?:[.,:]\d{1,3})?\]/;
const TITLE_TAG_RE = /^\s*\[ti:\s*(.*?)\s*\]/i;
const ARTIST_TAG_RE = /^\s*\[ar:\s*(.*?)\s*\]/i;

/** 进入打分的本地歌词文件条目，三个文本字段都已 normalizeMatchText 归一化 */
export interface LocalLyricFile {
  /** 文件绝对路径 */
  file: string;
  /** 归一化文件名（不含扩展名） */
  stem: string;
  /** 归一化文件内声明的歌名，缺失为空串 */
  title: string;
  /** 归一化文件内声明的首艺术家，缺失为空串 */
  artist: string;
}

/**
 * 匹配用强归一化：小写、丢括号整段、只留单词字符与汉字
 * @param text - 文件名干、歌名或艺术家名
 * @returns 可直接比对的归一化串
 */
export const normalizeMatchText = (text: string): string =>
  normalize(text.replace(BRACKET_SEGMENT_RE, "")).replace(NON_MATCH_CHAR_RE, "");

/** 在两个区间里找最长公共子串；长度并列时取先出现的，保证打分确定性 */
const longestCommonBlock = (
  a: string,
  aStart: number,
  aEnd: number,
  b: string,
  bStart: number,
  bEnd: number,
): { aStart: number; bStart: number; length: number } | null => {
  const width = bEnd - bStart;
  if (aEnd - aStart <= 0 || width <= 0) return null;
  let best: { aStart: number; bStart: number; length: number } | null = null;
  let prev = new Array<number>(width).fill(0);
  for (let i = aStart; i < aEnd; i++) {
    const cur = new Array<number>(width).fill(0);
    for (let j = bStart; j < bEnd; j++) {
      if (a[i] !== b[j]) continue;
      const carry = i > aStart && j > bStart ? prev[j - bStart - 1] : 0;
      const length = carry + 1;
      cur[j - bStart] = length;
      if (!best || length > best.length) {
        best = { aStart: i - length + 1, bStart: j - length + 1, length };
      }
    }
    prev = cur;
  }
  return best;
};

/**
 * Ratcliff–Obershelp 相似度，等价于竞品所用 difflib.SequenceMatcher().ratio()
 * 递归取两侧最长公共子串累加匹配字符数，返回 2×匹配数 / 两侧长度和
 * @param a - 归一化左串
 * @param b - 归一化右串
 * @returns 0~1 的相似度，任一为空返回 0
 */
const similarity = (a: string, b: string): number => {
  if (!a || !b) return 0;
  const countMatched = (leftA: number, rightA: number, leftB: number, rightB: number): number => {
    const block = longestCommonBlock(a, leftA, rightA, b, leftB, rightB);
    if (!block) return 0;
    return (
      block.length +
      countMatched(leftA, block.aStart, leftB, block.bStart) +
      countMatched(block.aStart + block.length, rightA, block.bStart + block.length, rightB)
    );
  };
  return (2 * countMatched(0, a.length, 0, b.length)) / (a.length + b.length);
};

/**
 * 文件名打分：歌名相似度为主，歌名子串命中与歌手信息再加权
 * @param stem - 归一化文件名
 * @param title - 归一化歌曲名
 * @param artist - 归一化首艺术家
 * @returns 打分，歌名在文件名里零对应时 0
 */
const filenameScore = (stem: string, title: string, artist: string): number => {
  if (!stem || !title) return 0;
  let score = similarity(title, stem) * 2;
  if (stem.includes(title)) score += 1;
  // 歌手子串单独就能凑到 0.8，越过 0.62 门槛会把同歌手的别的歌误判成命中，
  // 所以歌名毫无对应时整条判负
  if (!score) return 0;
  if (artist) {
    if (stem.includes(artist)) score += 0.8;
    else if (similarity(artist, stem) > ARTIST_FUZZY_RATIO) score += 0.4;
  }
  return score;
};

/**
 * 文件头元信息打分：歌名相似度加权，歌手相似度补分
 * @param title - 归一化歌曲名
 * @param artist - 归一化首艺术家
 * @param fileTitle - 归一化 `[ti:]` 值
 * @param fileArtist - 归一化 `[ar:]` 值
 * @returns 打分，歌名零相似时 0
 */
const tagScore = (title: string, artist: string, fileTitle: string, fileArtist: string): number => {
  const titlePart = similarity(title, fileTitle) * 2;
  // 与文件名阶段同理：歌名毫无对应时，只靠 [ar:] 对上歌手不能算同一首
  if (!titlePart) return 0;
  let score = titlePart;
  if (artist && fileArtist) score += similarity(artist, fileArtist);
  return score;
};

/**
 * 取文件头 120 行里的 `[ti:]` / `[ar:]` 声明
 * @param text - 歌词文件原文
 * @returns 声明的歌名与艺术家，缺失为空串
 */
export const extractHeadTags = (text: string): { title: string; artist: string } => {
  const tags = { title: "", artist: "" };
  for (const line of text.split(/\r?\n/, HEAD_SCAN_LINES)) {
    if (!tags.title) tags.title = line.match(TITLE_TAG_RE)?.[1] ?? "";
    if (!tags.artist) tags.artist = line.match(ARTIST_TAG_RE)?.[1] ?? "";
    if (tags.title && tags.artist) break;
  }
  return tags;
};

/**
 * 是否含行级时间戳：纯文本（歌词译文、专辑文案等）没有时间轴，不进索引
 * @param text - 歌词文件原文
 * @returns 是否可当同步歌词用
 */
export const hasTimedLyricLine = (text: string): boolean => TIMESTAMP_RE.test(text);

/**
 * 两段判定挑出与歌曲匹配的本地歌词文件
 * 同分保留先出现的条目（目录扫描顺序稳定），避免同一仓库每次命中不同文件
 * @param files - 已扫描的歌词文件条目
 * @param track - 当前歌曲
 * @returns 命中文件路径，两段都没过门槛返回 null
 */
export const pickMatchedLyricFile = (
  files: readonly LocalLyricFile[],
  track: Track,
): string | null => {
  const title = normalizeMatchText(track.title);
  if (!title) return null;
  const artist = normalizeMatchText(track.artists[0]?.name ?? "");

  let winner: LocalLyricFile | null = null;
  let best = 0;
  for (const file of files) {
    const score = filenameScore(file.stem, title, artist);
    if (score > best) {
      best = score;
      winner = file;
    }
  }
  if (winner && best >= FILENAME_MATCH_THRESHOLD) return winner.file;

  winner = null;
  best = 0;
  for (const file of files) {
    if (!file.title) continue;
    const score = tagScore(title, artist, file.title, file.artist);
    if (score > best) {
      best = score;
      winner = file;
    }
  }
  return winner && best >= TAG_MATCH_THRESHOLD ? winner.file : null;
};
