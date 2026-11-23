import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  engine: {
    exportAutoMixWindow: vi.fn(),
  },
  playerLog: {
    info: vi.fn(),
  },
  fs: {
    mkdir: vi.fn(),
    mkdtemp: vi.fn(),
    rm: vi.fn(),
    stat: vi.fn(),
  },
  paths: {
    automixCacheDir: "automix-cache",
  },
  inference: {
    runAutoMixModel: vi.fn(),
    runAutoMixTask: vi.fn(),
  },
  vocals: {
    measureVocalActivity: vi.fn(),
    refineAutoMixVocals: vi.fn(),
  },
  features: {
    measureMixWindow: vi.fn(),
  },
}));

vi.mock("node:fs/promises", () => ({ ...mocks.fs, default: mocks.fs }));
vi.mock("@main/services/engine", () => ({ getEngine: () => mocks.engine }));
vi.mock("@main/utils/logger", () => ({ playerLog: mocks.playerLog }));
vi.mock("@main/utils/paths", () => mocks.paths);
vi.mock("./inference", () => ({
  runAutoMixModel: mocks.inference.runAutoMixModel,
  runAutoMixTask: mocks.inference.runAutoMixTask,
}));
vi.mock("./vocals", () => mocks.vocals);
vi.mock("./features", () => mocks.features);

const now = Date.now();
const stems = { missing: false };
const statTarget = (target: string) => {
  if (stems.missing && !target.startsWith("/track-")) throw new Error("missing");
  return { size: target.length, mtimeMs: 1, ctimeMs: 1 };
};
const tracks = (source: string) => [
  { source, startMs: 0, tail: true },
  { source, startMs: 10_000, tail: false },
];
const profiles = (source: string) =>
  tracks(source).map((track, index) => ({
    ...track,
    endMs: 20_000,
    downbeats: [],
    periodMs: null,
    stability: 1,
    gridStartMs: null,
    gridEndMs: null,
    firstAudibleMs: 100,
    lastAudibleMs: 19_000,
    bodyEndMs: 19_000,
    levels: [],
    chroma: [],
    boundaries: [],
    startMs: index ? 1 : source.includes("rejected") ? 0 : 1,
  }));
const candidate = {
  outStartMs: 12_000,
  inStartMs: 10_000,
  durationMs: 1_000,
  outgoingRate: 1,
  levelRatio: 1,
  envelopes: [],
  strategy: "phrase" as const,
};
const plan = {
  ...candidate,
  levelRatio: 1,
  stems: {
    outgoing: { path: "old", startMs: 0, frames: 1 },
    incoming: { path: "old", startMs: 0, frames: 1 },
  },
};

const enhance = async (source: string) => {
  const { enhanceAutoMixPlan } = await import("./enhancement");
  return enhanceAutoMixPlan(
    candidate,
    tracks(source),
    profiles(source),
    20_000,
    new AbortController().signal,
  );
};

const cacheHitLogs = (): Record<string, unknown>[] =>
  mocks.playerLog.info.mock.calls
    .filter(([message]) => message === "AutoMix 混音缓存")
    .map(([, data]) => data as Record<string, unknown>);

describe("AutoMix 混音缓存", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    stems.missing = false;
    vi.spyOn(Date, "now").mockReturnValue(now);
    mocks.fs.mkdir.mockResolvedValue(undefined);
    mocks.fs.rm.mockResolvedValue(undefined);
    mocks.inference.runAutoMixTask.mockImplementation((_signal: AbortSignal, task: () => unknown) =>
      task(),
    );
    mocks.inference.runAutoMixModel.mockResolvedValue([
      { frames: 1, structure: { vocals: [0] } },
      { frames: 1, structure: { vocals: [0] } },
    ]);
    mocks.fs.mkdtemp.mockImplementation(
      async (_prefix: string) => `automix-cache/mix-${Math.random()}`,
    );
    mocks.fs.stat.mockImplementation(async (target: string) => statTarget(target));
    mocks.vocals.measureVocalActivity.mockReturnValue(0);
    mocks.vocals.refineAutoMixVocals.mockImplementation(
      (_candidate: unknown, profileList: { startMs: number }[]) =>
        profileList[0].startMs === 1
          ? { plan, vocalLossMs: [0] }
          : { plan: undefined, vocalLossMs: [12] },
    );
    mocks.features.measureMixWindow.mockReturnValue({ level: 1 });
  });

  it("被拒计划在 TTL 内走负缓存，过期后重新分析", async () => {
    expect(await enhance("/track-rejected")).toBeUndefined();
    expect(mocks.engine.exportAutoMixWindow).toHaveBeenCalledTimes(2);
    expect(await enhance("/track-rejected")).toBeUndefined();
    expect(mocks.engine.exportAutoMixWindow).toHaveBeenCalledTimes(2);
    const negative = mocks.playerLog.info.mock.calls.find(
      ([message, data]) => message === "AutoMix 混音缓存" && data.cacheHit === "negative",
    )?.[1] as Record<string, unknown>;
    expect(negative).toMatchObject({
      cacheHit: "negative",
      key: expect.any(String),
      reason: "vocalLoss",
    });
    expect(typeof negative.at).toBe("number");
    expect(JSON.stringify(mocks.playerLog.info.mock.calls)).not.toContain("/track-rejected");
    vi.mocked(Date.now).mockReturnValue(now + 60_000);
    expect(await enhance("/track-rejected")).toBeUndefined();
    expect(mocks.engine.exportAutoMixWindow).toHaveBeenCalledTimes(4);
  });

  it("completed 命中时刷新 LRU 并记录缓存日志", async () => {
    const first = await enhance("/track-plan");
    expect(first?.stems?.outgoing.path).toContain("mix-");
    expect(mocks.engine.exportAutoMixWindow).toHaveBeenCalledTimes(2);
    const second = await enhance("/track-plan");
    expect(second).toEqual(first);
    expect(cacheHitLogs()).toContainEqual({ cacheHit: "plan" });
    expect(mocks.engine.exportAutoMixWindow).toHaveBeenCalledTimes(2);
  });

  it("completed 声部文件缺失后删除缓存并重新处理", async () => {
    const first = await enhance("/track-plan");
    vi.mocked(Date.now).mockReturnValue(now + 60_000);
    stems.missing = true;
    const second = await enhance("/track-plan");
    expect(second?.stems?.outgoing.path).not.toBe(first?.stems?.outgoing.path);
    expect(mocks.engine.exportAutoMixWindow).toHaveBeenCalledTimes(4);
    expect(mocks.playerLog.info).toHaveBeenCalledWith("AutoMix 混音缓存", { cacheHit: "none" });
  });

  it("completed 淘汰最近最少使用的磁盘目录", async () => {
    await enhance("/track-a");
    await enhance("/track-b");
    await enhance("/track-c");
    await enhance("/track-b");
    await enhance("/track-d");
    expect(mocks.engine.exportAutoMixWindow).toHaveBeenCalledTimes(8);
    expect(mocks.playerLog.info).toHaveBeenCalledWith("AutoMix 混音缓存", { cacheHit: "plan" });
    const removed = mocks.fs.rm.mock.calls.filter((call) => String(call[0]).includes("mix-"));
    expect(removed.length).toBeGreaterThanOrEqual(1);
  });
});
