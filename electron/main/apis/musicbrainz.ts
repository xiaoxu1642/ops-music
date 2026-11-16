import { net } from "electron";
import fs from "node:fs";
import path from "node:path";
import { getArtistCacheDir } from "@main/utils/config";
import { toCacheUrl } from "@main/utils/protocol";

/** MusicBrainz User-Agent */
const UA = "OpsMusic/1.0";

/** 预取并发数 */
const PREFETCH_CONCURRENCY = 2;

/** 冷缓存单次最多预取的歌手数；其余按需拉取 */
const PREFETCH_BUDGET = 24;

/** 过期未找到标记的存活时间（毫秒） */
const NOT_FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 正在获取头像的歌手 */
const avatarInFlight = new Map<string, Promise<string | null>>();
/** 进程内头像状态，value 为 URL 或缺省占位；磁盘 notfound 标记仍保留以跨启动生效 */
const avatarState = new Map<string, string | undefined>();
const notFoundAt = new Map<string, number>();
/** 进程内头像状态上限，超出按最近使用淘汰 */
const AVATAR_STATE_LIMIT = 200;

/**
 * 规范化歌手名
 * @param artistName 歌手名
 * @returns 规范化后的歌手名
 */
const normalizeArtistName = (artistName: string): string => artistName.trim().toLowerCase();

/** 根据歌手名生成缓存文件名 */
const getCacheFileName = (artistName: string): string => {
  const safe = Buffer.from(artistName.toLowerCase()).toString("base64url");
  return `${safe}.jpg`;
};

/** 标记文件名（查询失败标记，避免重复请求） */
const getNotFoundFileName = (artistName: string): string => {
  const safe = Buffer.from(artistName.toLowerCase()).toString("base64url");
  return `${safe}.notfound`;
};

/** 确保缓存目录存在 */
const ensureCacheDir = (): void => {
  if (!fs.existsSync(getArtistCacheDir())) {
    fs.mkdirSync(getArtistCacheDir(), { recursive: true });
  }
};

/**
 * 通过 MusicBrainz 搜索歌手获取 MBID
 */
const searchMusicBrainzId = async (artistName: string): Promise<string | null> => {
  const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json&limit=1`;
  const response = await net.fetch(url, {
    headers: { "User-Agent": UA },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { artists?: { id: string; score: number }[] };
  const artist = data.artists?.[0];
  if (!artist || artist.score < 90) return null;
  return artist.id;
};

/**
 * 通过 TheAudioDB 获取歌手头像 URL
 */
const fetchAudioDbThumb = async (mbid: string): Promise<string | null> => {
  const url = `https://www.theaudiodb.com/api/v1/json/2/artist-mb.php?i=${mbid}`;
  const response = await net.fetch(url, {
    headers: { "User-Agent": UA },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    artists?: { strArtistThumb?: string; strArtistFanart?: string }[];
  };
  const artist = data.artists?.[0];
  return artist?.strArtistThumb || artist?.strArtistFanart || null;
};

/**
 * 下载图片到指定路径
 */
const downloadImage = async (imageUrl: string, savePath: string): Promise<boolean> => {
  const response = await net.fetch(imageUrl, {
    headers: { "User-Agent": UA },
  });
  if (!response.ok) return false;
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(savePath, buffer);
  return true;
};

/**
 * 获取歌手头像
 * @returns cache://artists/xxx.jpg 或 null
 */
const fetchArtistAvatarCore = async (artistName: string): Promise<string | null> => {
  const name = artistName.trim();
  const key = normalizeArtistName(name);
  // 确保目录存在
  ensureCacheDir();
  const cacheFileName = getCacheFileName(name);
  const cachePath = path.join(getArtistCacheDir(), cacheFileName);
  // 首次访问补齐进程内命中集，后续跳过 existsSync/statSync
  if (avatarState.has(key)) return avatarState.get(key) ?? null;
  if (fs.existsSync(cachePath)) {
    const url = toCacheUrl(cachePath) ?? null;
    if (url) avatarState.set(key, url);
    return url;
  }
  // 已标记为未找到（7 天过期）
  const notFoundPath = path.join(getArtistCacheDir(), getNotFoundFileName(name));
  if (fs.existsSync(notFoundPath)) {
    const stat = fs.statSync(notFoundPath);
    if (Date.now() - stat.mtimeMs < NOT_FOUND_TTL_MS) {
      notFoundAt.set(key, stat.mtimeMs);
      avatarState.set(key, undefined);
      return null;
    }
    fs.unlinkSync(notFoundPath);
  }
  try {
    // MusicBrainz 搜索 MBID
    const mbid = await searchMusicBrainzId(name);
    if (!mbid) {
      fs.writeFileSync(notFoundPath, "");
      notFoundAt.set(key, Date.now());
      avatarState.set(key, undefined);
      return null;
    }
    // TheAudioDB 获取头像 URL
    const thumbUrl = await fetchAudioDbThumb(mbid);
    if (!thumbUrl) {
      fs.writeFileSync(notFoundPath, "");
      notFoundAt.set(key, Date.now());
      avatarState.set(key, undefined);
      return null;
    }
    // 下载并缓存
    const ok = await downloadImage(thumbUrl, cachePath);
    if (!ok) {
      fs.writeFileSync(notFoundPath, "");
      notFoundAt.set(key, Date.now());
      avatarState.set(key, undefined);
      return null;
    }
    const url = toCacheUrl(cachePath) ?? null;
    if (url) avatarState.set(key, url);
    return url;
  } catch {
    // 网络异常不写 notfound 标记，下次重试
    return null;
  }
};

/**
 * 获取歌手头像
 * @returns cache://artists/xxx.jpg 或 null
 */
export const fetchArtistAvatar = async (artistName: string): Promise<string | null> => {
  if (!artistName?.trim()) return null;
  const key = normalizeArtistName(artistName);
  if (avatarState.has(key)) {
    const known = avatarState.get(key) ?? null;
    avatarState.delete(key);
    avatarState.set(key, known ?? undefined);
    return known;
  }
  const existing = avatarInFlight.get(key);
  if (existing) return existing;
  // 创建任务
  const task = fetchArtistAvatarCore(artistName);
  avatarInFlight.set(key, task);
  try {
    return await task;
  } finally {
    avatarInFlight.delete(key);
  }
};

/**
 * 预取多位歌手头像
 * @returns key 为规范化歌手名（小写）
 */
export const prefetchArtistAvatars = async (
  artistNames: string[],
): Promise<Record<string, string>> => {
  const deduped = new Map<string, string>();
  for (const name of artistNames) {
    if (!name?.trim()) continue;
    const key = normalizeArtistName(name);
    if (!key || deduped.has(key)) continue;
    deduped.set(key, name.trim());
  }
  // 队列：冷缓存只预算前若干名，其余留给歌手页按可视项懒加载
  const queue = [...deduped.values()].slice(0, PREFETCH_BUDGET);
  const result: Record<string, string> = {};
  if (!queue.length) return result;
  for (const name of queue) {
    const key = normalizeArtistName(name);
    if (!avatarState.has(key)) avatarState.set(key, undefined);
  }
  // 工作线程
  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < queue.length) {
      const current = queue[index++];
      const avatar = await fetchArtistAvatar(current);
      if (avatar) result[normalizeArtistName(current)] = avatar;
    }
  };
  // 启动工作线程
  const workerCount = Math.min(PREFETCH_CONCURRENCY, queue.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  while (avatarState.size > AVATAR_STATE_LIMIT) {
    const oldest = avatarState.keys().next().value;
    if (oldest === undefined) break;
    avatarState.delete(oldest);
    notFoundAt.delete(oldest);
  }
  return result;
};
