import type { Track } from "@shared/types/player";
import { ErrorCode } from "@shared/types/errors";
import type { BilibiliSearchItem, BilibiliStream } from "@/types/bilibili";

/**
 * 搜索条目 → 应用层 Track
 *
 * id 直接落 bvid：取流与歌词都以 bvid 为入口，cid 由主进程按需解析默认分 P。
 * B 站没有专辑 / 付费标记 / 云盘等概念，不设 fee、cloud 等字段。
 * @param item - 主进程归一化后的搜索条目
 * @returns 应用层 Track
 */
export const bilibiliItemToTrack = (item: BilibiliSearchItem): Track => ({
  id: item.bvid,
  source: "bilibili",
  title: item.title,
  artists: [{ id: item.mid, name: item.artist }],
  duration: item.duration,
  cover: item.cover,
});

/** 播放地址选择结果 */
export type BilibiliPlayUrlResult =
  { available: true; url: string } | { available: false; errorCode: ErrorCode };

/**
 * 从取流结果里挑选播放地址
 *
 * 只认主进程签发的本地代理地址：裸地址缺 Referer 会被站方 403，
 * 缺失代理时显式失败，绝不把裸地址交给播放器
 * @param stream - 主进程 song_url 的响应体
 * @returns 代理播放地址或明确失败原因
 */
export const pickBilibiliPlayUrl = (
  stream: BilibiliStream | undefined | null,
): BilibiliPlayUrlResult => {
  const proxyUrl = stream?.proxyUrl?.trim();
  if (!proxyUrl) return { available: false, errorCode: ErrorCode.BILIBILI_PROXY_MISSING };
  return { available: true, url: proxyUrl };
};
