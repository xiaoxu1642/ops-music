import { getPlayer, onPlayerReset } from "@main/services/engine";
import { store } from "@main/store";
import * as songCache from "@main/services/songCache";
import { playerLog } from "@main/utils/logger";
import type { TransitionPreference } from "@shared/types/player";
import {
  AUTOMIX_ARM_LEAD_MS,
  AUTOMIX_MAX_GENERATION_QUEUE,
  AUTOMIX_LOOKAHEAD_MS,
  TRANSITION_LOOKAHEAD_MS,
} from "@shared/constants/playback";
import type {
  AutoMixAnalysisContext,
  AutoMixPlan,
  AutoMixPrepareOptions,
} from "@shared/types/automix";
import { canAutoMix, planAutoMix, planAutoMixBridge, resolveAutoMixScope } from "./automix/planner";
import { analyzeAutoMixTracks } from "./automix/analysisHost";
import { enhanceAutoMixPlan } from "./automix/enhancement";

let prepared: {
  id: string;
  player: ReturnType<typeof getPlayer>;
  ready: boolean;
  preference?: TransitionPreference;
  automix?: Omit<AutoMixPlan, "stems"> & { stems?: AutoMixPlan["stems"] };
  generation?: number;
  /** 槽位取消、曲目范围变化和播放器重建都会终止该信号 */
  analysis: AbortController;
} | null = null;
let notifiedId: string | null = null;
let latestGeneration = 0;
const queuedGenerations: number[] = [];
let currentRange: {
  startMs: number;
  endMs: number;
  source?: string;
  analyzed: boolean;
  tailEndMs?: number;
} | null = null;

/**
 * 只保留当前曲目的尾部判定，加载和停止时清空
 * @param startMs - 曲目或 CUE 分轨起点，省略时清空
 * @param endMs - 曲目或 CUE 分轨终点
 * @param source - 当前曲目的实际本地或完整缓存音源
 */
export const setCurrentTransitionRange = (
  startMs?: number,
  endMs?: number,
  source?: string,
): void => {
  prepared?.analysis.abort();
  currentRange =
    startMs != null && endMs != null ? { startMs, endMs, source, analyzed: false } : null;
};

/**
 * 获取仍属于当前备用槽位的自动混音计划
 * @param id - 备用槽位标识
 * @returns 已完成分析的计划
 */
export const getPreparedAutoMixPlan = (id: string): AutoMixPlan | undefined =>
  prepared?.id === id && !prepared.analysis.signal.aborted ? prepared.automix : undefined;

/**
 * 按代次合并分析队列并取消过时的排队任务
 * @param generation - 本次预载的代次，缺省时按递增代次处理
 * @param signal - 本次预载的取消信号
 * @returns 当前任务是否已成为队列中的最新代次
 */
const claimAnalysisGeneration = (generation: number | undefined, signal: AbortSignal): boolean => {
  if (signal.aborted) return false;
  // 渲染层重载后 generation 会从 1 重新开始，主进程需复位窗口
  if (generation != null && generation < latestGeneration - AUTOMIX_MAX_GENERATION_QUEUE) {
    latestGeneration = generation - 1;
  }
  const next = generation ?? ++latestGeneration;
  latestGeneration = Math.max(latestGeneration, next);
  while (queuedGenerations.length >= AUTOMIX_MAX_GENERATION_QUEUE) {
    const oldest = queuedGenerations.shift()!;
    if (oldest !== next && oldest >= latestGeneration - AUTOMIX_MAX_GENERATION_QUEUE) {
      cancelOldestGeneration(oldest);
    }
  }
  queuedGenerations.push(next);
  signal.addEventListener(
    "abort",
    () => {
      const index = queuedGenerations.indexOf(next);
      if (index >= 0) queuedGenerations.splice(index, 1);
    },
    { once: true },
  );
  return next === latestGeneration;
};

/**
 * 判断本次预载能否进入声部分离阶段
 * @param context - 主进程采集的剩余时间和全屏态
 * @returns 时间充裕且不在全屏时允许完整分析
 */
const shouldSkipDemux = (context: AutoMixAnalysisContext | undefined): boolean => {
  if (!context) return false;
  const policy = store.get("player.automixFullscreenPolicy");
  const scope = resolveAutoMixScope(
    policy === "skipDemucs" || policy === "beatOnly" || policy === "unlimited" ? policy : "auto",
    context.fullscreen ?? "unknown",
  );
  if (scope === "none") return true;
  const guardMs = store.get("player.automixLowRemainingGuardMs");
  const remainingMs = context.remainingMs;
  if (
    typeof guardMs === "number" &&
    Number.isFinite(guardMs) &&
    guardMs > 0 &&
    remainingMs != null &&
    remainingMs < guardMs
  )
    return true;
  return Boolean(context.generation && context.generation !== latestGeneration);
};

/**
 * 取消已超过队列深度的旧代次任务
 * @param generation - 被淘汰的预载代次
 */
const cancelOldestGeneration = (generation: number): void => {
  if (prepared?.generation !== generation) return;
  cancelPreparedTrack(prepared.id);
};

/**
 * 在提交交接前绑定当前解码会话，跳转进度后也能沿用已分析的声部
 * @param id - 就绪的下一曲标识
 * @returns 槽位与音源仍有效且声部已安装时为 true
 */
export const installPreparedAutoMixStems = async (id: string): Promise<boolean> => {
  const task = prepared;
  const stemWindow = task?.automix?.stems?.outgoing;
  const source = currentRange?.source;
  if (!task || task.id !== id || task.analysis.signal.aborted || !stemWindow || !source)
    return false;
  const installed = await task.player.installAutoMixStems(id, source, {
    path: stemWindow.path,
    startSeconds: stemWindow.startMs / 1000,
    frames: stemWindow.frames,
  });
  return installed && !task.analysis.signal.aborted;
};

/**
 * 返回当前曲目确认的交接终点，播放进度和媒体时长仍使用原始值。
 * @param fallbackMs - 原始终点
 * @param positionMs - 当前源时间
 * @param speed - 播放倍速
 * @returns 包含交接余量的源时间终点
 */
export const getTransitionEndMs = (fallbackMs: number, positionMs = 0, speed = 1): number => {
  if (currentRange?.tailEndMs == null) return fallbackMs;
  // 分析完成时可能已经进入静音，仍留出短暂交接时间，避免错过提前切换。
  return Math.min(
    Math.max(currentRange.tailEndMs, positionMs + 1500 * Math.max(1, speed)),
    fallbackMs,
  );
};

/**
 * 曲尾只通知一次就绪槽位，隐藏窗口也能安排交接
 * @param remainingMs - 当前曲目剩余的源时间
 * @param speed - 当前播放倍速，用于转换成墙钟时间
 * @param pitch - 当前用户音调，AutoMix 仅允许原始音调
 * @returns 尚未通知的就绪槽位标识
 */
export const takeTransitionReady = (remainingMs: number, speed = 1, pitch = 0): string | null => {
  if (prepared?.automix && !canAutoMix(speed, pitch)) return null;
  const remainingWallMs = remainingMs / speed;
  const lookahead = prepared?.automix
    ? Math.min(
        AUTOMIX_LOOKAHEAD_MS,
        (currentRange?.endMs ?? 0) - prepared.automix.outStartMs + AUTOMIX_ARM_LEAD_MS,
      )
    : TRANSITION_LOOKAHEAD_MS[prepared?.preference ?? "standard"];
  if (remainingWallMs > lookahead) notifiedId = null;
  if (remainingWallMs < 1000 || remainingWallMs > lookahead || !prepared?.ready) return null;
  if (notifiedId === prepared.id) return null;
  notifiedId = prepared.id;
  return prepared.id;
};

/**
 * 取消下一曲准备任务并释放对应的缓存租约
 * @param id - 预载任务标识，省略时取消当前备用槽位
 */
export const cancelPreparedTrack = (id = prepared?.id): void => {
  if (!id) return;
  const current = prepared?.id === id ? prepared : null;
  current?.analysis.abort();
  if (current) prepared = null;
  try {
    current?.player.cancelPrepared(id);
  } finally {
    songCache.cancelPreload(id);
  }
};

onPlayerReset(cancelPreparedTrack);

/**
 * 将本地或缓存完成的音源交给原生备用槽位解码
 * @param id - 用于取消和消费预载资源的任务标识
 * @param source - 本地音频文件或已完成下载的缓存文件路径
 * @param startMs - 预载起点，单位为毫秒，CUE 子曲目使用对应的起始位置
 * @param preference - 交接偏好，省略时不分析曲尾
 * @param options - 过渡模式和下一曲的有效结束范围
 * @returns 当前任务仍有效且音频已准备就绪时返回 true，否则返回 false
 */
export const prepareNextTrack = async (
  id: string,
  source: string,
  startMs = 0,
  preference?: TransitionPreference,
  options?: AutoMixPrepareOptions,
): Promise<boolean> => {
  cancelPreparedTrack();
  const player = getPlayer();
  const task = {
    id,
    player,
    ready: false,
    preference,
    analysis: new AbortController(),
    automix: undefined as AutoMixPlan | undefined,
    generation: options?.analysisContext?.generation,
  };
  prepared = task;
  songCache.pinPreload(id, source);
  try {
    const range = currentRange;
    if (
      options?.mode === "automix" &&
      range?.source &&
      canAutoMix(player.getSpeed(), player.getPitch())
    ) {
      const context = options?.analysisContext;
      if (!claimAnalysisGeneration(context?.generation, task.analysis.signal)) {
        player.cancelPrepared(id);
        cancelPreparedTrack(id);
        return false;
      }
      const tracks = [
        { source: range.source, startMs: range.startMs, endMs: range.endMs, tail: true },
        { source, startMs, endMs: options.endMs, tail: false },
      ];
      const profiles = await analyzeAutoMixTracks(tracks, task.analysis.signal, context).catch(
        (error) => {
          if (!task.analysis.signal.aborted) playerLog.warn("AutoMix 分析不可用", error);
          return null;
        },
      );
      if (task.analysis.signal.aborted) return false;
      if (profiles) {
        if (shouldSkipDemux(context)) {
          playerLog.info("AutoMix 剩余时间不足或全屏，按节拍与交叉过渡兜底");
        }
        const synced = planAutoMix(profiles[0], profiles[1], range.endMs, context);
        const candidate =
          synced ?? planAutoMixBridge(profiles[0], profiles[1], range.endMs, context);
        if (!synced)
          playerLog.info(
            candidate
              ? "AutoMix 两曲节奏无法对齐，改用原速桥接"
              : "AutoMix 无法对拍也无法桥接，不做混音",
          );
        if (candidate && !shouldSkipDemux(context)) {
          const enhanced = await enhanceAutoMixPlan(
            candidate,
            tracks,
            profiles,
            range.endMs,
            task.analysis.signal,
            context,
          ).catch((error) => {
            if (!task.analysis.signal.aborted) playerLog.warn("AutoMix 分轨编排不可用", error);
            return undefined;
          });
          if (enhanced) task.automix = enhanced;
        }
        if (task.automix && !task.analysis.signal.aborted) {
          const { strategy, durationMs, outStartMs, inStartMs, outgoingRate } = task.automix;
          playerLog.info(
            `AutoMix 就绪：${strategy === "bridge" ? "原速桥接" : "对拍"} · ${(durationMs / 1000).toFixed(1)} 秒`,
            { outStartMs, inStartMs, outgoingRate },
          );
        }
      }
    }
    if (task.analysis.signal.aborted) return false;
    if (options?.mode === "automix" && !task.automix)
      playerLog.info("AutoMix 本次不可用，按设置交叉过渡或直接切歌");
    const basePlan = task.automix;
    const planStems = basePlan?.stems;
    let plan = basePlan;
    if (basePlan) {
      const preRollMs = Math.max(0, Math.min(3000, store.get("player.automixPreRollMs") ?? 1200));
      const span = Math.min(Math.max(0, preRollMs), basePlan.durationMs / 2);
      plan = {
        ...basePlan,
        preRoll: span > 0 ? { startMs: 0, endMs: span } : undefined,
      };
      task.automix = plan;
    }
    const ready =
      plan && planStems
        ? await player.prepareNext(id, source, plan.inStartMs / 1000, {
            path: planStems.incoming.path,
            startSeconds: planStems.incoming.startMs / 1000,
            frames: planStems.incoming.frames,
          })
        : await player.prepareNext(id, source, startMs / 1000);
    if (!ready || task.analysis.signal.aborted) {
      player.cancelPrepared(id);
      cancelPreparedTrack(id);
      return false;
    }
    task.ready = true;
    if (!task.automix && preference && range && !range.analyzed) {
      range.analyzed = true;
      const began = performance.now();
      void player
        .analyzeTail(range.startMs / 1000, range.endMs / 1000)
        .then((end) => {
          if (task.analysis.signal.aborted || currentRange !== range || end == null) return;
          range.tailEndMs = end * 1000;
          playerLog.info("识别到连续近静音拖尾", {
            trimmedMs: Math.round(range.endMs - range.tailEndMs),
            analysisMs: Math.round(performance.now() - began),
          });
        })
        .catch((error) => {
          if (!task.analysis.signal.aborted && currentRange === range)
            playerLog.warn("曲尾分析失败，沿用原始结束位置", error);
        });
    }
    playerLog.info("下一曲 PCM 预载完成", { id, source });
    return true;
  } catch (error) {
    const current = prepared?.id === id;
    cancelPreparedTrack(id);
    if (current) await songCache.invalidate(source);
    throw error;
  }
};
