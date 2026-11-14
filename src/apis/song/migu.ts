import type { Track } from "@shared/types/player";
import { ErrorCode } from "@shared/types/errors";
import { miguCall } from "@/apis/migu";
import type { MiguStream } from "@shared/types/migu";

/**
 * 解析 Track 的播放地址
 *
 * 调用主进程 song_url（contentId + copyrightId + 音质档位），音质降级链在主进程处理；
 * VIP / 版权受限歌曲主进程会抛「migu vip required」，这里映射为明确的错误码
 * @param track - track.id 为 contentId，track.extId 为 copyrightId
 * @param songLevel - 音质偏好；实际可用档位取决于登录态与版权
 * @returns 播放地址或明确失败原因
 */
export const resolveMiguUrl = async (
  track: Track,
  songLevel: string,
): Promise<
  { available: true; url: string; tone: string } | { available: false; errorCode: ErrorCode }
> => {
  let body: MiguStream | undefined;
  try {
    body = await miguCall<MiguStream | undefined>("song_url", {
      id: track.id,
      copyrightId: track.extId ?? "",
      tone: songLevel,
    });
  } catch (err) {
    if (String(err).includes("vip required")) {
      return { available: false, errorCode: ErrorCode.MIGU_VIP_REQUIRED };
    }
    throw err;
  }
  const url = body?.url?.trim();
  if (!url || !body) return { available: false, errorCode: ErrorCode.MIGU_UNAVAILABLE };
  return { available: true, url, tone: body.tone };
};
