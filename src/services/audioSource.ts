import type { Track } from "@shared/types/player";
import { isPlatform } from "@shared/types/platform";
import type { QualityLevel } from "@/utils/quality";
import { useSettingsStore } from "@/stores/settings";
import { useUserStore } from "@/stores/user";
import { resolveNeteaseUrl } from "@/apis/song/netease";
import { ErrorCode } from "@shared/types/errors";
import { handleError } from "@/utils/errors";

/** 解析选项 */
export interface ResolveTrackSourceOptions {
  /** 将解析失败原因交给播放流程，供提示和跳曲决策使用 */
  onError?: (error: string) => void;
  /** 是否跳过官方在线接口 */
  skipOfficialOnline?: boolean;
  /** 是否静默解析 */
  silent?: boolean;
}

/**
 * 派生缓存键
 * 在线源把音质档位并入键，使不同音质的同一首歌互不覆盖
 * @param track - 要解析的 track
 * @param songLevel - 在线歌曲音质档位
 * @returns 派生缓存键，如果该 track 不参与歌曲缓存则返回 null
 */
const cacheKeyForTrack = (track: Track, songLevel: QualityLevel): string | null => {
  if (isPlatform(track.source) && track.id) {
    return `o:${track.source}:${track.id}:${songLevel}`;
  }
  return null;
};

/** 在线 URL 解析结果 */
export type OnlineResolveResult =
  | { ok: true; url: string; isTrial: boolean; provider: "official" | "trial" }
  | { ok: false; errorCode: ErrorCode };

/**
 * 解析在线音频源 URL
 * @param track - 要解析的 track
 * @param songLevel - 在线歌曲音质档位
 */
const resolveOnlineUrl = async (
  track: Track,
  songLevel: QualityLevel,
  options: ResolveTrackSourceOptions = {},
): Promise<OnlineResolveResult> => {
  const settings = useSettingsStore();
  let trialUrl: string | null = null;
  let officialErrorCode: ErrorCode | null = null;
  if (track.source === "netease" && !options.skipOfficialOnline) {
    const user = useUserStore();
    try {
      const resolved = await resolveNeteaseUrl(track, songLevel, {
        authenticated: user.isLoggedIn,
        validate: () => user.fetchStatus(),
      });
      if (!resolved.available) {
        officialErrorCode = resolved.errorCode;
      } else if (!resolved.isTrial) {
        return { ok: true, url: resolved.url, isTrial: false, provider: "official" };
      } else {
        trialUrl = resolved.url;
      }
    } catch (err) {
      console.warn("[audio-source] official URL resolve failed:", err);
      officialErrorCode = ErrorCode.NETWORK_ERROR;
    }
  }
  if (trialUrl && settings.player.allowTrialPlay) {
    return { ok: true, url: trialUrl, isTrial: true, provider: "trial" };
  }
  if (trialUrl) return { ok: false, errorCode: ErrorCode.NETEASE_TRIAL_DISABLED };
  if (officialErrorCode) return { ok: false, errorCode: officialErrorCode };
  return { ok: false, errorCode: ErrorCode.URL_RESOLVE_FAILED };
};

/**
 * 解析结果
 * - fromCache 为 true 时表示音源直接命中本地缓存
 * - cacheRequest 存在时表示尚未缓存，调用方应在合适时机（如播放达到阈值后）触发它
 */
export interface ResolvedTrackSource {
  source: string;
  fromCache: boolean;
  provider: "local" | "cache" | "official" | "trial";
  /**
   * 下载音源并返回可供原生预载使用的缓存路径
   * @param preloadId - 可选的预载消费者标识，用于缓存租约和独立取消
   * @param signal - 在解析下载地址期间取消任务的信号
   * @returns 缓存路径，未完成下载或已取消时返回 null
   */
  cacheRequest?: (preloadId?: string, signal?: AbortSignal) => Promise<string | null>;
}

/**
 * 记录解析错误，支持静默模式抑制
 * @param err - 错误信息或错误码
 * @param options - 提示方式和错误接收回调
 */
const reportLoadError = (err: ErrorCode | string, options: ResolveTrackSourceOptions): void => {
  options.onError?.(err);
  if (!options.silent) handleError(err);
};

/**
 * 解析歌曲的可播放音源及缓存下载入口
 * @param track - 要解析的歌曲
 * @param options - 错误提示与在线来源重试选项
 * @returns 本地路径或远端地址及缓存入口，无法解析时返回 null
 */
export const resolveTrackSource = async (
  track: Track,
  options: ResolveTrackSourceOptions = {},
): Promise<ResolvedTrackSource | null> => {
  // 本地文件
  if (track.source === "local") {
    const localPath = track.cueAudioPath ?? track.path;
    if (!localPath) reportLoadError(ErrorCode.FILE_NOT_FOUND, options);
    return localPath ? { source: localPath, fromCache: false, provider: "local" } : null;
  }
  const settings = useSettingsStore();
  const songLevel = settings.player.songLevel;
  const cacheKey = cacheKeyForTrack(track, songLevel);
  const cacheEnabled = settings.system.cache?.songCache?.enabled === true && cacheKey !== null;
  if (cacheEnabled) {
    const cached = await window.api.cache.song.lookup(cacheKey!);
    if (cached) return { source: cached, fromCache: true, provider: "cache" };
  }
  // 在线源（netease）
  if (isPlatform(track.source)) {
    try {
      const resolved = await resolveOnlineUrl(track, songLevel, options);
      if (!resolved.ok) {
        reportLoadError(resolved.errorCode, options);
        return null;
      }
      const url = resolved.url;
      const result: ResolvedTrackSource = {
        source: url,
        fromCache: false,
        provider: resolved.provider,
      };
      if (cacheEnabled && !resolved.isTrial) {
        result.cacheRequest = async (preloadId, signal) => {
          if (signal?.aborted) return null;
          return window.api.cache.song.fetch(cacheKey, track.source, url, preloadId);
        };
      }
      return result;
    } catch (err) {
      reportLoadError(err instanceof Error ? err.message : String(err), options);
      return null;
    }
  }
  return null;
};
