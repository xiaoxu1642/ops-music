import type { Track } from "@shared/types/player";
import { ErrorCode } from "@shared/types/errors";
import { miguCall } from "@/apis/migu";
import type { MiguStream } from "@shared/types/migu";

/**
 * 解析 Track 的播放地址
 *
 * 调用主进程 song_url（contentId + copyrightId + 音质档位），
 * 结果里只取本地代理地址，裸地址不下发；音质降级链在主进程处理
 * @param track - track.id 为 contentId，track.extId 为 copyrightId
 * @param songLevel - 音质偏好；实际可用档位取决于登录态与版权
 * @returns 代理播放地址或明确失败原因
 */
export const resolveMiguUrl = async (
  track: Track,
  songLevel: string,
): Promise<
  { available: true; url: string; tone: string } | { available: false; errorCode: ErrorCode }
> => {
  const body = await miguCall<MiguStream | undefined>("song_url", {
    id: track.id,
    copyrightId: track.extId ?? "",
    tone: songLevel,
  });
  const proxyUrl = body?.proxyUrl?.trim();
  if (!proxyUrl || !body) return { available: false, errorCode: ErrorCode.MIGU_UNAVAILABLE };
  return { available: true, url: proxyUrl, tone: body.tone };
};
