import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { getEngine } from "@main/services/engine";
import { automixCacheDir } from "@main/utils/paths";
import type { AutoMixAnalysisContext, AutoMixPlan, AutoMixProfile } from "@shared/types/automix";
import type { AnalysisTrack } from "./analysisHost";
import { runAutoMixModel, runAutoMixTask } from "./inference";
import { measureVocalActivity, refineAutoMixVocals } from "./vocals";
import { measureMixWindow } from "./features";
import { playerLog } from "@main/utils/logger";
import type { AutoMixCandidate } from "./planner";

/** 只保留最近四对交接的磁盘窗口，不缓存 PCM 或模型张量 */
interface CompletedCacheEntry {
  plan: AutoMixPlan;
  directory: string;
}

interface NegativeCacheEntry {
  key: string;
  at: number;
  reason: "vocalLoss";
}

type AutoMixCacheHit = "profile" | "plan" | "negative" | "none";

const completed = new Map<string, CompletedCacheEntry>();
const rejected = new Map<string, NegativeCacheEntry>();
const REJECTED_TTL_MS = 60_000;
const COMPLETED_CACHE_LIMIT = 4;
const REJECTED_CACHE_LIMIT = 64;
let workspace: Promise<void> | undefined;
/** 声部分离窗口上限，对应 worker 与引擎的 1_058_444 帧（44.1kHz 下 24 秒） */
const MAX_SEPARATION_MS = 24_000;

/** 一组分离窗口的磁盘结果 */
interface Separation {
  directory: string;
  windows: { input: string; output: string; startMs: number; endMs: number }[];
  frames: number[];
  vocals: number[][];
}

const cacheKey = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const touchCompleted = (key: string) => {
  const entry = completed.get(key);
  if (!entry) return;
  completed.delete(key);
  completed.set(key, entry);
};

const evictCompleted = async () => {
  while (completed.size > COMPLETED_CACHE_LIMIT) {
    const key = completed.keys().next().value!;
    const entry = completed.get(key)!;
    completed.delete(key);
    await rm(entry.directory, { recursive: true, force: true });
  }
};

const setRejected = (key: string) => {
  rejected.delete(key);
  rejected.set(key, { key, at: Date.now(), reason: "vocalLoss" });
  while (rejected.size > REJECTED_CACHE_LIMIT) {
    rejected.delete(rejected.keys().next().value!);
  }
};

const getRejected = (key: string) => {
  const entry = rejected.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at >= REJECTED_TTL_MS) {
    rejected.delete(key);
    return undefined;
  }
  rejected.delete(key);
  rejected.set(key, entry);
  return entry;
};

/**
 * 导出窗口并运行声部分离，失败时清理目录
 * @param tracks - 两路实际音源
 * @param ranges - 绝对毫秒窗口，第一项属于当前曲
 * @param signal - 当前预载的取消信号
 * @param context - 本次预载的分析观测上下文
 * @returns 分离结果，调用方负责保留或删除目录
 */
const separate = async (
  tracks: AnalysisTrack[],
  ranges: { startMs: number; endMs: number }[],
  signal: AbortSignal,
  context?: AutoMixAnalysisContext,
): Promise<Separation> => {
  workspace ??= rm(automixCacheDir, { recursive: true, force: true })
    .then(() => mkdir(automixCacheDir, { recursive: true }))
    .then(() => undefined);
  await workspace;
  const directory = await mkdtemp(path.join(automixCacheDir, "mix-"));
  const windows = ranges.map((window, index) => ({
    input: path.join(directory, index + ".pcm"),
    output: path.join(directory, index + ".stems"),
    ...window,
  }));
  try {
    for (const [index, window] of windows.entries()) {
      signal.throwIfAborted();
      await getEngine().exportAutoMixWindow(
        tracks[index === 0 ? 0 : 1].source,
        window.startMs / 1000,
        window.endMs / 1000,
        false,
        window.input,
      );
    }
    const results = await runAutoMixModel<{ structure: { vocals: number[] }; frames: number }>(
      "demucs",
      windows,
      signal,
      context,
    );
    return {
      directory,
      windows,
      frames: results.map((result) => result.frames),
      vocals: results.map((result) => result.structure.vocals),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
};

/**
 * 分析实际声部，唱句完整时安排分层对拍
 * @param candidate - 对拍候选
 * @param tracks - 两路实际音源
 * @param profiles - 可复用的首尾分析证据
 * @param currentEndMs - 当前曲目或 CUE 的有效终点
 * @param signal - 当前预载的取消信号
 * @param context - 本次预载的分析观测上下文
 * @returns 依据实际声部活动编排的计划，唱句会被截断时为空
 */
export const enhanceAutoMixPlan = (
  candidate: AutoMixCandidate,
  tracks: AnalysisTrack[],
  profiles: AutoMixProfile[],
  currentEndMs: number,
  signal: AbortSignal,
  context?: AutoMixAnalysisContext,
): Promise<AutoMixPlan | undefined> =>
  runAutoMixTask(signal, async () => {
    const identities = await Promise.all(
      tracks.map(async (track) => {
        const info = await stat(track.source);
        return [track.source, info.size, info.mtimeMs, info.ctimeMs];
      }),
    );
    const key = cacheKey([identities, candidate, currentEndMs]);
    signal.throwIfAborted();
    const cached = completed.get(key);
    if (cached) {
      touchCompleted(key);
      let stemsExist = true;
      try {
        if (!cached.plan.stems) throw new Error("缺少声部窗口");
        await Promise.all(Object.values(cached.plan.stems).map((stem) => stat(stem.path)));
      } catch {
        stemsExist = false;
      }
      if (stemsExist) {
        playerLog.info("AutoMix 混音缓存", { cacheHit: "plan" satisfies AutoMixCacheHit });
        return cached.plan;
      }
      completed.delete(key);
      await rm(cached.directory, { recursive: true, force: true });
      playerLog.info("AutoMix 混音缓存", { cacheHit: "none" satisfies AutoMixCacheHit });
    }
    const rejectedEntry = getRejected(key);
    if (rejectedEntry) {
      playerLog.info("AutoMix 混音缓存", {
        cacheHit: "negative" satisfies AutoMixCacheHit,
        key: rejectedEntry.key,
        at: rejectedEntry.at,
        reason: rejectedEntry.reason,
      });
      return undefined;
    }
    const ranges = profiles.map((profile, index) => {
      const start = index ? candidate.inStartMs : candidate.outStartMs;
      // 下一曲从原始入口起分离，入口后移跳过的唱句也要计入损失
      const entry = index ? Math.min(start, profile.firstAudibleMs - 100) : start;
      return {
        startMs: Math.max(profile.startMs, entry - 1500),
        endMs: Math.min(
          profile.endMs,
          start + candidate.durationMs * (index ? 1 : candidate.outgoingRate) + 1500,
        ),
      };
    });
    if (ranges.some((range) => range.endMs - range.startMs > MAX_SEPARATION_MS)) {
      playerLog.info("AutoMix 跳过区间超出声部分离窗口，不做混音");
      return undefined;
    }
    const separation = await separate(tracks, ranges, signal, context);
    const { directory, windows, frames, vocals } = separation;
    const voices = profiles.map((profile, index) =>
      measureVocalActivity(profile, vocals[index], windows[index].startMs),
    );
    const { plan, vocalLossMs } = refineAutoMixVocals(candidate, profiles, voices);
    if (!plan) {
      await rm(directory, { recursive: true, force: true });
      setRejected(key);
      playerLog.info("AutoMix 负缓存", { key, at: rejected.get(key)?.at, reason: "vocalLoss" });
      playerLog.info("AutoMix 交接会截断唱句，不做混音", {
        vocalLossMs: vocalLossMs.map(Math.round),
      });
      return undefined;
    }
    const stem = (index: number) => ({
      path: windows[index].output,
      startMs: windows[index].startMs,
      frames: frames[index],
    });
    const span = plan.durationMs;
    const outgoing = measureMixWindow(
      profiles[0],
      plan.outStartMs,
      plan.outStartMs + span * plan.outgoingRate,
    ).level;
    const incoming = measureMixWindow(profiles[1], plan.inStartMs, plan.inStartMs + span).level;
    const result: AutoMixPlan = {
      ...plan,
      levelRatio: Math.max(0.5, Math.min(2, incoming / outgoing)),
      stems: { outgoing: stem(0), incoming: stem(1) },
    };
    await Promise.all(windows.map((window) => rm(window.input, { force: true })));
    completed.delete(key);
    completed.set(key, { plan: result, directory });
    await evictCompleted();
    return result;
  });
