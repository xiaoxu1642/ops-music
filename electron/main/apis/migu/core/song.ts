/**
 * 咪咕歌曲归一化：搜索条目 / 详情条目 → MiguSong
 */

import type { MiguSearchSong, MiguSong, MiguSongInfo } from "./types";

/**
 * 咪咕图片地址归一化：`//` → https，`/` 开头拼图床域名，http 强升 https
 * @param raw - 站方原始地址
 * @returns 可直接使用的 https 地址，空串原样返回
 */
export const normalizeMiguImageUrl = (raw: string | undefined): string => {
  if (!raw) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `https://d.musicapp.migu.cn${raw}`;
  if (raw.startsWith("http")) return raw.replace(/^http:/, "https:");
  return raw;
};

/**
 * 归一化咪咕歌曲
 * @param raw - 搜索或详情响应里的歌曲条目
 * @returns 归一化歌曲，缺 contentId 时返回 null
 */
export const normalizeMiguSong = (raw: MiguSearchSong | MiguSongInfo): MiguSong | null => {
  const contentId = raw.contentId;
  if (!contentId) return null;
  const singer = raw.singers?.[0] ?? raw.singerList?.[0];
  const album = raw.albums?.[0];
  const durationSec = Number(raw.duration ?? 0);
  const vipMarked =
    raw.chargeAuditions === "1" ||
    /vip/i.test(raw.showTag ?? "") ||
    (raw.showTags?.includes("vip") ?? false);
  return {
    id: contentId,
    copyrightId: raw.copyrightId ?? "",
    title: raw.songName ?? "未知标题",
    artist: singer?.name ?? "未知歌手",
    artistId: singer?.id,
    albumId: album?.id,
    album:
      album?.albumName ?? album?.name ?? (typeof raw.album === "string" ? raw.album : undefined),
    duration: Number.isFinite(durationSec) && durationSec > 0 ? durationSec * 1000 : 0,
    cover: normalizeMiguImageUrl(raw.img1 ?? album?.albumImgUrl),
    isVip: vipMarked,
  };
};

/**
 * 从搜索/详情响应里找出歌曲条目数组
 *
 * 咪咕新老接口的字段名不统一（bmw 新接口与 search_all.do 的层级不同），
 * 先按已知路径取，取不到再做受限深度优先搜索：第一个包含 contentId 字段对象的数组
 * @param body - 上游响应体
 * @returns 歌曲条目数组，找不到返回空数组
 */
export const extractSongList = (body: unknown): MiguSearchSong[] => {
  // bmw/search 新结构：data.items[] 每项嵌套 song 对象
  const items = (body as { data?: { items?: Array<{ song?: unknown }> } } | undefined)?.data?.items;
  if (Array.isArray(items)) {
    const songs = items
      .map((entry) => entry?.song)
      .filter(
        (song): song is MiguSearchSong =>
          typeof song === "object" && song !== null && "contentId" in (song as object),
      );
    if (songs.length > 0) return songs;
  }

  const known = [body, (body as { data?: unknown })?.data]
    .flatMap((node) => [node, (node as { songResultData?: unknown })?.songResultData])
    .flatMap((node) => [node, (node as { result?: unknown })?.result])
    .flatMap((node) => [
      (node as { list?: unknown })?.list,
      (node as { contents?: unknown })?.contents,
    ]);
  for (const candidate of known) {
    if (
      Array.isArray(candidate) &&
      candidate.some(
        (item) => typeof item === "object" && item !== null && "contentId" in (item as object),
      )
    ) {
      return candidate as MiguSearchSong[];
    }
  }

  // 已知路径都落空：限深 4 层、限长 64 的深度优先搜索，避免在超大响应上递归失控
  const search = (node: unknown, depth: number): MiguSearchSong[] | null => {
    if (depth > 4) return null;
    if (Array.isArray(node)) {
      if (
        node.length > 0 &&
        node.every(
          (item) => typeof item === "object" && item !== null && "contentId" in (item as object),
        )
      ) {
        return node.slice(0, 64) as MiguSearchSong[];
      }
      for (const item of node) {
        const found = search(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof node === "object" && node !== null) {
      for (const value of Object.values(node as Record<string, unknown>)) {
        const found = search(value, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  return search(body, 0) ?? [];
};

/**
 * 咪咕时长换算：站方给秒（数字或字符串）
 * @param raw - 原始时长
 * @returns 毫秒，解析失败为 0
 */
export const parseMiguDuration = (raw: string | number | undefined): number => {
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
};
