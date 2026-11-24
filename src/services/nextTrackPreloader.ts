/**
 * 下一首歌曲预载服务
 */

import type { Track } from "@shared/types/player";
import type { ResolvedTrackSource } from "@/services/audioSource";
import { resolveTrackSource } from "@/services/audioSource";
import { getNextTrackCandidate } from "@/core/player/candidate";
import { invalidatePreloadedLyric, preloadLyricForTrack } from "@/services/lyric/preload";
import { useStatusStore } from "@/stores/status";
import { useSettingsStore } from "@/stores/settings";
import { useMediaStore } from "@/stores/media";
import * as queue from "@/stores/queue";
import { isAutoMixReady, connectAutoMixComponents } from "@/services/automix";
import { AUTOMIX_ARM_LEAD_MS, NEXT_TRACK_WATCH_DEBOUNCE_MS } from "@shared/constants/playback";
import { isFullUiMode, isSmartTransitionEnabled } from "@/lifecycle/playbackGates";

/** 预载结果 */
export interface NextTrackPreloadResult {
  trackId: string;
  /** 已就绪的原生槽位标识，缺省表示仅解析或缓存了音源 */
  preparedId?: string;
  /** 仅在 AutoMix 就绪时存在，使用当前曲的展示时间轴 */
  autoMixStartMs?: number;
  source: ResolvedTrackSource | null;
  contextKey: string;
  /** AutoMix 分析代次，用于旧任务迟到时合并队列 */
  generation?: number;
}

let currentToken = 0;
let nativePreloadId: string | null = null;
let preloadAbort: AbortController | null = null;
let cachedResult: NextTrackPreloadResult | null = null;
let currentContextKey: string | null = null;
let pendingCover: HTMLImageElement | null = null;
let transitionPreparedId: string | null = null;
let generationOwner: number | null = null;
let latestRequestedGeneration = 0;
let stopContextWatch: (() => void) | null = null;
let stopAutoMixComponents: (() => void) | null = null;
let watchDebounce: ReturnType<typeof setTimeout> | null = null;

/**
 * 拼装上下文指纹，用于去重与作废
 * @param track - 下一曲候选及其本地文件或 CUE 信息
 * @returns 包含音源、音质和解析环境的上下文指纹
 */
const buildContextKey = (track: Track): string => {
  const settings = useSettingsStore();
  const status = useStatusStore();

  const parts = [
    track.id,
    track.source,
    track.path ?? "",
    track.cueAudioPath ?? "",
    track.cueStartMs ?? "",
    track.cueEndMs ?? "",
    settings.player.songLevel,
    settings.player.transitionMode,
    settings.player.transitionPreference,
    ...(settings.player.transitionMode === "automix"
      ? [isAutoMixReady(), status.speed, status.pitch, status.currentTrack?.id]
      : []),
    settings.player.allowTrialPlay,
  ];

  return parts.join("::");
};

/**
 * 提前解码封面图片，仅利用 Chromium 渲染引擎缓存
 * @param url - 要预载的封面地址
 */
const preloadCover = async (url: string): Promise<void> => {
  if (!url || !isFullUiMode()) return;
  if (pendingCover) pendingCover.src = "";
  const image = new Image();
  pendingCover = image;
  try {
    image.decoding = "async";
    image.src = url;
    await image.decode();
  } catch {
    // ignore
  } finally {
    if (pendingCover === image) pendingCover = null;
  }
};

/**
 * 作废当前的预载缓存
 */
export const invalidateNextTrackPreload = (): void => {
  currentToken++;
  preloadAbort?.abort();
  preloadAbort = null;
  if (nativePreloadId) void window.api.player.cancelPrepared(nativePreloadId).catch(console.warn);
  nativePreloadId = null;
  cachedResult = null;
  currentContextKey = null;
  if (watchDebounce) {
    clearTimeout(watchDebounce);
    watchDebounce = null;
  }
  generationOwner = null;
  if (pendingCover) {
    pendingCover.src = "";
    pendingCover = null;
  }
  invalidatePreloadedLyric();
};

/** 模式切换到受限态时作废预载与正在交接的原生槽位 */
export const invalidateSmartTransitionForModeChange = (): void => {
  if (transitionPreparedId) {
    void window.api.player.cancelPrepared(transitionPreparedId).catch(console.warn);
    transitionPreparedId = null;
  }
  generationOwner = null;
  invalidateNextTrackPreload();
};

/**
 * 消费预载结果
 * @param track - 正在切入播放的目标歌曲
 * @returns 匹配的预载结果，未命中或已作废则返回 null
 */
export const consumePreloadedTrack = (track: Track): NextTrackPreloadResult | null => {
  if (!isSmartTransitionEnabled()) {
    invalidateSmartTransitionForModeChange();
    return null;
  }
  if (!useSettingsStore().player.preloadNextTrack) {
    invalidateNextTrackPreload();
    return null;
  }
  const currentKey = buildContextKey(track);
  if (!cachedResult) {
    invalidateNextTrackPreload();
    return null;
  }
  if (cachedResult.trackId !== track.id) {
    invalidateNextTrackPreload();
    return null;
  }
  if (cachedResult.contextKey !== currentKey) {
    // 上下文已改变（如切换了音质），当前缓存作废
    invalidateNextTrackPreload();
    return null;
  }
  const result = cachedResult;
  nativePreloadId = null;
  preloadAbort = null;
  if (watchDebounce) {
    clearTimeout(watchDebounce);
    watchDebounce = null;
  }
  currentToken++;
  cachedResult = null;
  currentContextKey = null;
  latestRequestedGeneration = currentToken;
  return result;
};

/**
 * 查询与候选曲目匹配的原生备用槽位，不改变其所有权
 * @param track - 即将交接的目标曲目
 * @returns 仍有效且原生 PCM 已就绪的预载结果
 */
export const peekPreparedTrack = (track: Track): NextTrackPreloadResult | null => {
  if (!isSmartTransitionEnabled()) return null;
  if (!useSettingsStore().player.preloadNextTrack) return null;
  if (cachedResult?.trackId !== track.id || !cachedResult.preparedId) return null;
  return cachedResult.contextKey === buildContextKey(track) ? cachedResult : null;
};

/**
 * 将可交接槽位交给在途过渡，无对拍计划时由调用方安排交叉过渡
 * @param track - 本次交接的目标曲目
 * @param expectedId - 后台通知对应的槽位标识
 * @param positionMs - 当前曲展示时间，用于只在入场前提交变速
 * @returns 已接管的预载结果，迟到通知或槽位失效时返回 null
 */
export const beginPreparedTransition = (
  track: Track,
  expectedId?: string,
  positionMs?: number,
): NextTrackPreloadResult | null => {
  if (!isSmartTransitionEnabled()) return null;
  if (transitionPreparedId) return null;
  const prepared = peekPreparedTrack(track);
  if (!prepared?.source || (expectedId && prepared.preparedId !== expectedId)) return null;
  if (
    positionMs != null &&
    prepared.autoMixStartMs != null &&
    positionMs < prepared.autoMixStartMs - AUTOMIX_ARM_LEAD_MS
  )
    return null;
  const result = consumePreloadedTrack(track);
  if (!result?.preparedId) return null;
  transitionPreparedId = result.preparedId;
  generationOwner = result.generation ?? null;
  return result;
};

/**
 * 释放交接所有权，再按最新设置调度下一曲
 * @param id - 本次交接持有的槽位标识
 * @param rejected - 交接失败时保留的音源缓存，同一上下文不再重建 PCM 重试
 */
export const finishPreparedTransition = (id: string, rejected?: NextTrackPreloadResult): void => {
  if (transitionPreparedId !== id) return;
  transitionPreparedId = null;
  generationOwner = null;
  if (rejected) {
    cachedResult = { ...rejected, preparedId: undefined, autoMixStartMs: undefined };
    currentContextKey = rejected.contextKey;
  }
  void window.api.player.cancelPrepared(id).catch(console.warn);
  if (isSmartTransitionEnabled()) scheduleNextTrackPreload();
};

/**
 * 合并高频上下文变化，只保留最新的预载调度
 */
export const debouncedScheduleNextTrackPreload = (): void => {
  if (watchDebounce) clearTimeout(watchDebounce);
  watchDebounce = setTimeout(() => {
    watchDebounce = null;
    scheduleNextTrackPreload();
  }, NEXT_TRACK_WATCH_DEBOUNCE_MS);
};

/**
 * 在加载状态变化后立即恢复预载，避免等待防抖窗口
 */
const resumeDeferredPreload = (): boolean => {
  if (!watchDebounce) return false;
  clearTimeout(watchDebounce);
  watchDebounce = null;
  scheduleNextTrackPreload();
  return true;
};

/**
 * 调度下一首预载任务
 */
export const scheduleNextTrackPreload = (): void => {
  if (!isSmartTransitionEnabled()) {
    invalidateSmartTransitionForModeChange();
    return;
  }
  if (transitionPreparedId) return;
  const settings = useSettingsStore();
  if (!settings.player.preloadNextTrack) {
    invalidateNextTrackPreload();
    return;
  }

  const status = useStatusStore();
  if (status.state === "stopped" || status.state === "idle") {
    invalidateNextTrackPreload();
    return;
  }
  const currentTrack = status.currentTrack;
  if (status.trackLoading || status.state === "loading") {
    return;
  }
  if (resumeDeferredPreload()) return;
  if (!currentTrack || useMediaStore().track?.id !== currentTrack.id) {
    invalidateNextTrackPreload();
    return;
  }
  const candidateResult = getNextTrackCandidate({
    playIndex: status.playIndex,
    queue: queue.queue.value,
    fmMode: status.fmMode,
    skipKeywordsSongs: settings.preset.skipKeywordsSongs,
    skipTrackKeywords: settings.preset.skipTrackKeywords,
    shuffleMode: status.shuffleMode,
  });

  if (!candidateResult) {
    invalidateNextTrackPreload();
    return;
  }

  const candidateTrack = candidateResult.track;
  if (candidateTrack.source !== "local" && !settings.system.cache.songCache.enabled) {
    invalidateNextTrackPreload();
    return;
  }
  const contextKey = buildContextKey(candidateTrack);
  const generation = latestRequestedGeneration + 1;
  if (generationOwner != null && generation <= generationOwner) return;
  // 上下文指纹一致且已有缓存，避免重复触发
  if (cachedResult && cachedResult.contextKey === contextKey) {
    preloadLyricForTrack(candidateTrack);
    return;
  }

  // 避免在异步生成过程中重复调度同一 contextKey
  if (currentContextKey === contextKey && !cachedResult) {
    latestRequestedGeneration = Math.max(latestRequestedGeneration, generation);
    preloadLyricForTrack(candidateTrack);
    return;
  }

  invalidateNextTrackPreload();
  preloadLyricForTrack(candidateTrack);
  const token = ++currentToken;
  latestRequestedGeneration = Math.max(latestRequestedGeneration, generation);
  const id = crypto.randomUUID();
  const abort = new AbortController();
  preloadAbort = abort;
  nativePreloadId = id;
  currentContextKey = contextKey;
  cachedResult = null;
  console.info("[player:preload] 开始预载下一曲", {
    trackId: candidateTrack.id,
    title: candidateTrack.title,
  });

  void (async () => {
    try {
      if (candidateTrack.cover) {
        void preloadCover(candidateTrack.cover);
      }
      // 音源预拉取
      let source = await resolveTrackSource(candidateTrack, {
        silent: true,
      });
      if (token !== currentToken) return;
      if (!source) {
        console.info("[player:preload] 下一曲未找到可用音源", {
          trackId: candidateTrack.id,
          title: candidateTrack.title,
        });
        invalidateNextTrackPreload();
        return;
      }
      if (source.cacheRequest) {
        const cachedPath = await source.cacheRequest(id, abort.signal);
        if (token !== currentToken) return;
        if (cachedPath) source = { source: cachedPath, fromCache: true, provider: "cache" };
      }
      let preparedId: string | undefined;
      let autoMixStartMs: number | undefined;
      if (source.provider === "local" || source.fromCache) {
        const result = await window.api.player.prepareNext(
          id,
          source.source,
          candidateTrack.cueStartMs,
          settings.player.transitionMode !== "none"
            ? settings.player.transitionPreference
            : undefined,
          settings.player.transitionMode === "automix"
            ? {
                mode: "automix",
                endMs: candidateTrack.cueEndMs,
                analysisContext: { generation },
              }
            : undefined,
        );
        if (token !== currentToken) return;
        if (result.ready) preparedId = id;
        autoMixStartMs = result.autoMixStartMs;
      }
      if (!preparedId) {
        await window.api.player.cancelPrepared(id);
        if (token !== currentToken) return;
        nativePreloadId = null;
      }
      cachedResult = {
        trackId: candidateTrack.id,
        source,
        contextKey,
        preparedId,
        autoMixStartMs,
        generation,
      };
      if (!preparedId) {
        console.info("[player:preload] 下一曲音源已准备，PCM 未预载", {
          trackId: candidateTrack.id,
          title: candidateTrack.title,
          source: source.provider,
        });
      }
    } catch (err) {
      if (token !== currentToken) return;
      console.warn("[player:preload] 下一曲预载失败", {
        trackId: candidateTrack.id,
        title: candidateTrack.title,
        error: err,
      });
      invalidateNextTrackPreload();
    }
  })();
};

/** 安装预载上下文监听 */
export const installNextTrackPreloadWatchers = (): void => {
  if (stopContextWatch) return;
  const settings = useSettingsStore();
  if (settings.player.transitionMode === "automix" && isSmartTransitionEnabled())
    stopAutoMixComponents = connectAutoMixComponents();
  const status = useStatusStore();
  stopContextWatch = watch(
    () => [
      settings.player.preloadNextTrack,
      settings.player.transitionMode,
      settings.player.transitionPreference,
      ...(settings.player.transitionMode === "automix"
        ? [isAutoMixReady(), status.speed, status.pitch]
        : []),
      settings.system.cache.songCache.enabled,
      settings.player.songLevel,
      settings.player.allowTrialPlay,
      status.playIndex,
      status.state,
      status.fmMode,
      status.shuffleMode,
      settings.preset.skipKeywordsSongs,
      settings.preset.skipTrackKeywords.join(","),
      queue.queue.value,
      settings.lyric.lyricSourcePreference,
      settings.lyric.lyricSourceOrder.join(","),
      settings.lyric.lyricFormatOrder.join(","),
      settings.lyric.smartPreferOnline,
      settings.system.lyric.enableOnlineTTMLLyric,
      settings.system.localLyric.enableLocalTTMLOverride,
      settings.system.localLyric.repoDir,
    ],
    () => {
      syncAutoMixComponents();
      debouncedScheduleNextTrackPreload();
    },
    { flush: "post" },
  );
};

/** 按当前模式与过渡配置同步 AutoMix 组件订阅 */
const syncAutoMixComponents = (): void => {
  const settings = useSettingsStore();
  if (settings.player.transitionMode === "automix" && isSmartTransitionEnabled()) {
    stopAutoMixComponents ??= connectAutoMixComponents();
    return;
  }
  stopAutoMixComponents?.();
  stopAutoMixComponents = null;
};

/** 模式变化后刷新智能过渡能力，受限态取消预载并停止 AutoMix 订阅 */
export const refreshSmartTransitionAvailability = (): void => {
  if (!isSmartTransitionEnabled()) {
    stopAutoMixComponents?.();
    stopAutoMixComponents = null;
    invalidateSmartTransitionForModeChange();
    return;
  }
  syncAutoMixComponents();
  scheduleNextTrackPreload();
};

/** 清理预载上下文监听 */
export const disposeNextTrackPreload = (): void => {
  if (watchDebounce) clearTimeout(watchDebounce);
  watchDebounce = null;
  stopContextWatch?.();
  stopContextWatch = null;
  stopAutoMixComponents?.();
  stopAutoMixComponents = null;
  invalidateSmartTransitionForModeChange();
};
