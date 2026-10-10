import type { Track } from "@shared/types/player";
import { bilibiliCall } from "@/apis/bilibili";
import { pickBilibiliPlayUrl, type BilibiliPlayUrlResult } from "@/utils/format/bilibili";
import type { BilibiliStream } from "@/types/bilibili";

/**
 * 解析 Track 的播放地址
 *
 * 调用主进程 song_url（未传 cid，由主进程解析默认分 P），
 * 结果里只取本地代理地址，裸地址不下发
 * @param track - track.id 为 bvid
 * @returns 代理播放地址或明确失败原因
 */
export const resolveBilibiliUrl = async (track: Track): Promise<BilibiliPlayUrlResult> => {
  const body = await bilibiliCall<BilibiliStream | undefined>("song_url", { bvid: track.id });
  return pickBilibiliPlayUrl(body);
};
