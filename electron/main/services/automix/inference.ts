import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { app } from "electron";
import { playerLog } from "@main/utils/logger";
import { automixDirs } from "@main/utils/paths";
import type { AutoMixAnalysisContext } from "@shared/types/automix";
import { AUTOMIX_WORKER } from "./assets";

type InferenceOutcome =
  "spawned" | "completed" | "cancelled" | "failed" | "timeout" | "output-limit";

let pending: Promise<unknown> = Promise.resolve();
const shutdown = new AbortController();
app.once("before-quit", () => shutdown.abort());

/**
 * 顺序运行模型任务，旧进程退出前不启动下一次分析
 * @param signal - 当前预载代次的取消信号
 * @param task - 包含输入导出和进程关闭的完整任务
 * @returns 当前任务的结果，排队期间取消时直接拒绝
 */
export const runAutoMixTask = <T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> => {
  const result = pending.then(() => {
    shutdown.signal.throwIfAborted();
    signal.throwIfAborted();
    return task();
  });
  pending = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
};

/**
 * 在独立分析进程推理有限窗口，关闭后才归还任务所有权和模型内存
 * @param kind - 节拍或声部分离模型
 * @param windows - 本次任务的临时输入输出文件
 * @param signal - 当前预载代次的取消信号
 * @param context - 本次预载的分析观测上下文
 * @returns 每个窗口的紧凑元数据，音频和预测张量通过临时文件传递
 */
export const runAutoMixModel = <T>(
  kind: "beat" | "demucs",
  windows: { input: string; output: string }[],
  signal: AbortSignal,
  context?: AutoMixAnalysisContext,
): Promise<T[]> =>
  new Promise((resolve, reject) => {
    const combined = AbortSignal.any([signal, shutdown.signal]);
    if (combined.aborted) {
      reject(combined.reason);
      return;
    }
    const analysisId = randomUUID();
    const startedAtMs = Date.now();
    const analysisStart = new Date(startedAtMs).toISOString();
    const cpuOnly = false;
    const requestedBackend: "auto" | "cpu" = cpuOnly ? "cpu" : "auto";
    const baseLog = {
      analysisId,
      analysisStart,
      kind,
      windowCount: windows.length,
      requestedBackend,
      cpuOnly,
      fullscreen: context?.fullscreen ?? "unknown",
      generation: context?.generation,
      remainingMs: context?.remainingMs,
    };
    playerLog.info("AutoMix 推理开始", { ...baseLog, outcome: "spawned" as InferenceOutcome });
    const child = spawn(path.join(automixDirs.runtime, AUTOMIX_WORKER), [], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let failure: Error | undefined;
    let outcome: Exclude<InferenceOutcome, "spawned"> = "completed";
    /** 记录终止原因并保留首次触发的结算类型 */
    const markFailure = (error: Error, nextOutcome: Exclude<InferenceOutcome, "spawned">): void => {
      if (failure) return;
      failure = error;
      outcome = nextOutcome;
    };
    child.once("error", (error) => {
      markFailure(error, "failed");
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      combined.removeEventListener("abort", abort);
      let error =
        failure ?? (code === 0 ? undefined : new Error(stderr || `AutoMix exited: ${code}`));
      if (!failure && code !== 0) outcome = "failed";
      let result:
        | {
            windows: T[];
            analysisId?: string | null;
            memoryMb: number;
            seconds: number;
            backend: "DirectML" | "CPU";
          }
        | undefined;
      if (!error) {
        try {
          const parsed = JSON.parse(stdout) as NonNullable<typeof result>;
          if (
            parsed.analysisId !== undefined &&
            parsed.analysisId !== null &&
            typeof parsed.analysisId !== "string"
          ) {
            throw new Error("分析编号格式错误");
          }
          if (parsed.analysisId && parsed.analysisId !== analysisId) {
            throw new Error("分析编号不匹配");
          }
          if (parsed.windows.length !== windows.length) throw new Error("分析窗口数量不匹配");
          result = parsed;
          playerLog.info(kind === "beat" ? "AutoMix 节拍分析完成" : "AutoMix 声部分离完成", {
            memoryMb: result.memoryMb,
            seconds: Math.round(result.seconds * 1000) / 1000,
            backend: result.backend,
          });
        } catch (reason) {
          error = reason instanceof Error ? reason : new Error(String(reason));
          outcome = "failed";
        }
      }
      const endedAtMs = Date.now();
      playerLog.info("AutoMix 推理结束", {
        ...baseLog,
        analysisEnd: new Date(endedAtMs).toISOString(),
        durationMs: endedAtMs - startedAtMs,
        outcome,
        backend: result?.backend,
        seconds: result?.seconds,
        memoryMb: result?.memoryMb,
        ...(error ? { error: error.message } : {}),
      });
      if (error) reject(error);
      else resolve(result!.windows);
    });
    /**
     * 等待子进程关闭文件后再结算，防止取消后继续占用 Windows 临时文件
     * @param error - 取消或终止原因
     * @param nextOutcome - 本次结算的观测结果
     */
    const stop = (error: Error, nextOutcome: Exclude<InferenceOutcome, "spawned">): void => {
      markFailure(error, nextOutcome);
      child.kill();
    };
    /** 取消当前预载对应的模型进程 */
    const abort = (): void => stop(new Error("AutoMix 分析已取消"), "cancelled");
    const timer = setTimeout(() => stop(new Error("AutoMix 分析超时"), "timeout"), 120_000);
    combined.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += String(chunk);
      if (stdout.length > 256_000) {
        stop(new Error("AutoMix 分析输出超出限制"), "output-limit");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + String(chunk)).slice(-8192);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(
      JSON.stringify({
        analysisId,
        kind,
        model: path.join(automixDirs[kind], kind === "beat" ? "beat-this.onnx" : "htdemucs.onnx"),
        windows,
        cpuOnly,
      }),
    );
  });
