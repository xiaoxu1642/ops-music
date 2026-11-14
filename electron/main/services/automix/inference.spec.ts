import { EventEmitter } from "node:events";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  playerLog: { info: vi.fn() },
}));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn, default: { spawn: mocks.spawn } }));
vi.mock("electron", () => ({ app: { once: vi.fn() } }));
vi.mock("@main/utils/logger", () => ({ playerLog: mocks.playerLog }));
vi.mock("./assets", () => ({ AUTOMIX_WORKER: "automix-worker.exe" }));
vi.mock("@main/utils/paths", () => ({
  automixDirs: { beat: "beat", demucs: "demucs", runtime: "runtime" },
}));

const windows = [{ input: "a.mel", output: "a.beats" }];
const createChild = () =>
  Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
  });
type LogCall = [string, Record<string, unknown>];
const logCalls = (): LogCall[] => mocks.playerLog.info.mock.calls as LogCall[];
const findLog = (event: string, outcome?: string): Record<string, unknown> | undefined =>
  logCalls().find(
    ([name, data]) => name === event && (outcome === undefined || data.outcome === outcome),
  )?.[1];

describe("独立模型进程与串行任务", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
  });

  it("旧模型取消后等待关闭再启动下一模型", async () => {
    const [firstChild, secondChild] = Array.from({ length: 2 }, createChild);
    mocks.spawn.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
    const { runAutoMixTask, runAutoMixModel } = await import("./inference");
    const controller = new AbortController();
    const first = runAutoMixTask(controller.signal, () =>
      runAutoMixModel("beat", windows, controller.signal),
    ).catch((error: Error) => error);
    await flushPromises();
    controller.abort();
    const signal = new AbortController().signal;
    const second = runAutoMixTask(signal, () => runAutoMixModel("demucs", windows, signal));
    await flushPromises();
    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(firstChild.kill).toHaveBeenCalledOnce();
    firstChild.emit("close", null);
    expect(await first).toBeInstanceOf(Error);
    await flushPromises();
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    const secondRequest = JSON.parse(String(secondChild.stdin.end.mock.calls[0][0])) as {
      analysisId: string;
    };
    secondChild.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          windows: [{ frames: 100 }],
          analysisId: secondRequest.analysisId,
          memoryMb: 100,
          seconds: 1,
          backend: "DirectML",
        }),
      ),
    );
    secondChild.emit("close", 0);
    expect(await second).toEqual([{ frames: 100 }]);
  });

  it("排队期间已失效的任务不运行，后续有效任务仍可执行", async () => {
    const { runAutoMixTask } = await import("./inference");
    let release!: () => void;
    const first = runAutoMixTask(
      new AbortController().signal,
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const controller = new AbortController();
    const task = vi.fn();
    const skipped = runAutoMixTask(controller.signal, task).catch((error: Error) => error);
    await flushPromises();
    controller.abort();
    release();
    await first;
    expect(await skipped).toBeInstanceOf(Error);
    expect(task).not.toHaveBeenCalled();
    expect(await runAutoMixTask(new AbortController().signal, async () => 1)).toBe(1);
  });

  it("记录成功分析的结构化开始与结束日志", async () => {
    const child = createChild();
    mocks.spawn.mockReturnValueOnce(child);
    const { runAutoMixModel } = await import("./inference");
    const promise = runAutoMixModel("beat", windows, new AbortController().signal, {
      generation: 7,
      remainingMs: 32100,
      fullscreen: false,
    });
    await flushPromises();
    const start = findLog("AutoMix 推理开始", "spawned");
    expect(start).toMatchObject({
      kind: "beat",
      windowCount: 1,
      requestedBackend: "auto",
      cpuOnly: false,
      fullscreen: false,
      generation: 7,
      remainingMs: 32100,
    });
    expect(typeof start?.analysisId).toBe("string");
    expect(new Date(String(start?.analysisStart)).toISOString()).toBe(start?.analysisStart);
    expect(JSON.parse(String(child.stdin.end.mock.calls[0][0]))).toEqual({
      analysisId: start?.analysisId,
      kind: "beat",
      model: path.join("beat", "beat-this.onnx"),
      windows,
      cpuOnly: false,
    });
    child.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          windows: [{ frames: 100 }],
          analysisId: start?.analysisId,
          memoryMb: 321,
          seconds: 1.25,
          backend: "DirectML",
        }),
      ),
    );
    child.emit("close", 0);
    await expect(promise).resolves.toEqual([{ frames: 100 }]);
    const end = findLog("AutoMix 推理结束", "completed");
    expect(end).toMatchObject({
      analysisId: start?.analysisId,
      outcome: "completed",
      backend: "DirectML",
      seconds: 1.25,
      memoryMb: 321,
    });
    expect(typeof end?.analysisEnd).toBe("string");
    expect(new Date(String(end?.analysisEnd)).toISOString()).toBe(end?.analysisEnd);
    expect(typeof end?.durationMs).toBe("number");
    expect(end?.error).toBeUndefined();
  });

  it("取消时以同一 analysisId 记录取消结算", async () => {
    const child = createChild();
    mocks.spawn.mockReturnValueOnce(child);
    const { runAutoMixModel } = await import("./inference");
    const controller = new AbortController();
    const promise = runAutoMixModel("demucs", windows, controller.signal, {
      generation: 9,
      fullscreen: "unknown",
    }).catch((error: Error) => error);
    await flushPromises();
    const start = findLog("AutoMix 推理开始");
    expect(findLog("AutoMix 推理开始")).toMatchObject({
      fullscreen: "unknown",
      generation: 9,
    });
    controller.abort();
    await flushPromises();
    expect(child.kill).toHaveBeenCalledOnce();
    child.emit("close", null);
    expect(await promise).toBeInstanceOf(Error);
    expect(findLog("AutoMix 推理结束")).toMatchObject({
      analysisId: start?.analysisId,
      outcome: "cancelled",
    });
    expect(findLog("AutoMix 推理结束")?.error).toBe("AutoMix 分析已取消");
  });

  it("worker 非零退出时以同一 analysisId 记录失败结算", async () => {
    const child = createChild();
    mocks.spawn.mockReturnValueOnce(child);
    const { runAutoMixModel } = await import("./inference");
    const promise = runAutoMixModel("beat", windows, new AbortController().signal).catch(
      (error: Error) => error,
    );
    await flushPromises();
    const start = findLog("AutoMix 推理开始");
    child.stderr.emit("data", Buffer.from("推理失败"));
    child.emit("close", 1);
    expect(await promise).toBeInstanceOf(Error);
    const end = findLog("AutoMix 推理结束");
    expect(typeof start?.analysisId).toBe("string");
    expect(end).toMatchObject({ analysisId: start?.analysisId, outcome: "failed" });
    expect(end?.error).toBe("推理失败");
    expect(end?.backend).toBeUndefined();
  });

  it("兼容缺少 analysisId 与 backend 的旧结果", async () => {
    const child = createChild();
    mocks.spawn.mockReturnValueOnce(child);
    const { runAutoMixModel } = await import("./inference");
    const promise = runAutoMixModel("beat", windows, new AbortController().signal);
    await flushPromises();
    const start = findLog("AutoMix 推理开始");
    child.stdout.emit(
      "data",
      Buffer.from(JSON.stringify({ windows: [{ frames: 100 }], memoryMb: 100, seconds: 1 })),
    );
    child.emit("close", 0);
    await expect(promise).resolves.toEqual([{ frames: 100 }]);
    expect(findLog("AutoMix 推理结束", "completed")?.analysisId).toBe(start?.analysisId);
  });

  it("worker 回传的 analysisId 不一致时拒绝结果", async () => {
    const child = createChild();
    mocks.spawn.mockReturnValueOnce(child);
    const { runAutoMixModel } = await import("./inference");
    const promise = runAutoMixModel("beat", windows, new AbortController().signal).catch(
      (error: Error) => error,
    );
    await flushPromises();
    child.stdout.emit(
      "data",
      Buffer.from(
        JSON.stringify({
          windows: [{ frames: 100 }],
          analysisId: "other-analysis",
          memoryMb: 100,
          seconds: 1,
          backend: "DirectML",
        }),
      ),
    );
    child.emit("close", 0);
    expect(await promise).toBeInstanceOf(Error);
    expect(findLog("AutoMix 推理结束", "failed")?.error).toBe("分析编号不匹配");
  });
});
