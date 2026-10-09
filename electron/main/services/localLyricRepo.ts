/**
 * 本地歌词库
 *
 * 用户指定一个目录作为歌词仓库，按需扫描目录下 `.ttml` / `.lrc` / `.txt` 建立索引：
 * - 网易云歌曲 id → 文件路径（AMLL `<amll:meta>` 头，精确命中）
 * - 归一化标题 → 候选列表（精确命中，同名多条再用艺术家软性区分）
 * - 全量文件条目 → 文件名模糊 + 文件头 `[ti:]` / `[ar:]` 两段打分（见 localLyricMatch）
 * 命中返回文件原文，具体格式由渲染层 detectFormat 判定。
 *
 * 索引以（目录, 目录 mtime）为缓存边界：目录或其 mtime 变化（增删文件）时重建。
 * 仅保留路径与归一化小键，不驻留文件内容；命中时按需读盘。
 */

import { readdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { readFileAutoEncoding } from "@main/utils/encoding";
import { store } from "@main/store";
import { normalize } from "@main/apis/common/lyric/utils";
import { buildFingerprint, getMatchedId } from "@main/database/lyricMatchCache";
import { coreLog } from "@main/utils/logger";
import {
  extractHeadTags,
  hasTimedLyricLine,
  normalizeMatchText,
  pickMatchedLyricFile,
  type LocalLyricFile,
} from "./localLyricMatch";
import type { Track } from "@shared/types/player";

/** 仓库收录的歌词扩展名：TTML 逐字 + 行级 LRC / 纯文本歌词 */
const REPO_LYRIC_EXTS = [".ttml", ".lrc", ".txt"];
/**
 * 单次索引的文件上限：误把整个音乐库根目录指过来时，
 * 索引驻留的只是路径与归一化小键，但读盘扫描本身也要有界
 */
const MAX_INDEXED_FILES = 3000;

/** 同名候选：艺术家仅作区分，不作硬门槛 */
interface NameCandidate {
  /** 归一化首艺术家，缺失为空串 */
  artist: string;
  file: string;
}

interface RepoIndex {
  byNcm: Map<string, string>;
  /** 归一化标题 → 同名候选 */
  byTitle: Map<string, NameCandidate[]>;
  /** 全部文件条目，供文件名与元信息两段模糊判定 */
  files: LocalLyricFile[];
}

interface IndexCache {
  dir: string;
  mtimeMs: number;
  index: RepoIndex;
}

let cache: IndexCache | null = null;
let building: Promise<RepoIndex | null> | null = null;

/** 从 TTML 文本头部提取 AMLL 元信息 */
const extractMeta = (text: string): { name: string; artist: string; ncmId?: string } => {
  const bodyAt = text.indexOf("<body");
  const head = bodyAt > 0 ? text.slice(0, bodyAt) : text.slice(0, 8000);
  const meta: { name: string; artist: string; ncmId?: string } = { name: "", artist: "" };
  for (const tag of head.matchAll(/<amll:meta\b[^>]*>/gi)) {
    const key = tag[0].match(/\bkey="([^"]*)"/)?.[1];
    const value = tag[0].match(/\bvalue="([^"]*)"/)?.[1];
    if (!key || !value) continue;
    if (key === "musicName" && !meta.name) meta.name = value;
    else if (key === "artists" && !meta.artist) meta.artist = value;
    else if (key === "ncmMusicId" && !meta.ncmId) meta.ncmId = value;
  }
  return meta;
};

/** 递归收集目录下所有歌词文件，到 MAX_INDEXED_FILES 即停 */
const collectLyricFiles = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (current: string): Promise<void> => {
    if (out.length >= MAX_INDEXED_FILES) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && REPO_LYRIC_EXTS.includes(extname(entry.name).toLowerCase()))
        out.push(full);
      if (out.length >= MAX_INDEXED_FILES) return;
    }
  };
  await walk(dir);
  return out;
};

/** 取文件声明的歌名 / 艺术家 / 网易云 id：TTML 用 AMLL 头，LRC / TXT 用文件头 [ti:] [ar:] */
const declaredMeta = (
  ext: string,
  text: string,
): { name: string; artist: string; ncmId?: string } => {
  if (ext === ".ttml") return extractMeta(text);
  const tags = extractHeadTags(text);
  return { name: tags.title, artist: tags.artist };
};

/** 扫描目录建立索引 */
const buildIndex = async (dir: string): Promise<RepoIndex> => {
  const index: RepoIndex = { byNcm: new Map(), byTitle: new Map(), files: [] };
  const files = await collectLyricFiles(dir);
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    let text: string;
    try {
      text = await readFileAutoEncoding(file);
    } catch {
      continue;
    }
    // 没有时间戳的 txt/lrc 多半是歌词译文或专辑文案，收了也渲染不出滚动歌词
    if (ext !== ".ttml" && !hasTimedLyricLine(text)) continue;

    const { name, artist, ncmId } = declaredMeta(ext, text);
    if (ncmId && !index.byNcm.has(ncmId)) index.byNcm.set(ncmId, file);
    if (name) {
      const titleKey = normalize(name);
      const candidate: NameCandidate = { artist: normalize(artist), file };
      const list = index.byTitle.get(titleKey);
      // 同名候选里 TTML 的逐字精度高于行级 LRC，插到队首让它先被选中
      if (!list) index.byTitle.set(titleKey, [candidate]);
      else if (ext === ".ttml") list.unshift(candidate);
      else list.push(candidate);
    }
    const fullName = basename(file);
    index.files.push({
      file,
      stem: normalizeMatchText(fullName.slice(0, fullName.length - ext.length)),
      title: normalizeMatchText(name),
      artist: normalizeMatchText(artist),
    });
  }
  coreLog.info(`[localLyric] 索引完成：${index.files.length} 个文件 @ ${dir}`);
  return index;
};

/** 取当前生效索引；目录或 mtime 变化时懒重建 */
const getIndex = async (): Promise<RepoIndex | null> => {
  const dir = store.get("localLyric.repoDir") || "";
  if (!dir) return null;
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(dir)).mtimeMs;
  } catch {
    return null;
  }
  if (cache && cache.dir === dir && cache.mtimeMs === mtimeMs) return cache.index;
  if (building) return building;
  building = (async () => {
    try {
      const index = await buildIndex(dir);
      cache = { dir, mtimeMs, index };
      return index;
    } catch (err) {
      coreLog.warn("[localLyric] 索引构建失败：", err);
      return null;
    } finally {
      building = null;
    }
  })();
  return building;
};

/** 读取文件，失败或没有命中路径时返回 null */
const tryRead = async (file: string | null | undefined): Promise<string | null> => {
  if (!file) return null;
  try {
    return await readFileAutoEncoding(file);
  } catch {
    return null;
  }
};

/**
 * 同名候选里按艺术家挑最匹配的；只有一条或无法用艺术家区分时取第一条
 * @param candidates - 同一标题下的候选
 * @param wantArtist - 归一化的目标首艺术家
 * @returns 命中文件路径
 */
const pickByArtist = (candidates: NameCandidate[], wantArtist: string): string => {
  if (candidates.length === 1 || !wantArtist) return candidates[0].file;
  const exact = candidates.find((candidate) => candidate.artist === wantArtist);
  if (exact) return exact.file;
  const partial = candidates.find(
    (candidate) =>
      candidate.artist &&
      (candidate.artist.includes(wantArtist) || wantArtist.includes(candidate.artist)),
  );
  return (partial ?? candidates[0]).file;
};

/**
 * 用匹配缓存里在线模糊搜索解析出的网易云歌曲 id 回查本地库
 * 本地歌首播时没有平台 id、标题也可能对不上，靠在线搜索事后写入的 id 兜底命中
 * @param track - 歌曲信息
 * @param index - 当前索引
 * @returns 命中的歌词原文，未命中返回 null
 */
const matchByCachedId = async (track: Track, index: RepoIndex): Promise<string | null> => {
  const ncm = getMatchedId(buildFingerprint(track), "netease");
  if (!ncm) return null;
  return tryRead(index.byNcm.get(ncm.platformId));
};

/**
 * 在本地歌词库中匹配当前歌曲
 * @param track - 歌曲信息
 * @returns 命中的歌词原文，未命中返回 null
 */
export const matchLocalLyric = async (track: Track): Promise<string | null> => {
  if (!store.get("localLyric.enableLocalTTMLOverride")) return null;
  const index = await getIndex();
  if (!index) return null;
  // track 自带平台 id 精确命中（在线歌曲）
  if (track.source === "netease") {
    const hit = await tryRead(index.byNcm.get(track.id));
    if (hit) return hit;
  }
  // 标题命中；同名多条时再用艺术家软性区分
  const candidates = index.byTitle.get(normalize(track.title));
  if (candidates && candidates.length > 0) {
    const hit = await tryRead(pickByArtist(candidates, normalize(track.artists[0]?.name ?? "")));
    if (hit) return hit;
  }
  // 平台 id 回查
  const byId = await matchByCachedId(track, index);
  if (byId) return byId;
  // 精确链路都没命中，才走文件名 / 文件头元信息模糊判定
  return tryRead(pickMatchedLyricFile(index.files, track));
};
