import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  engine: {
    analyzeAutoMix: vi.fn(),
  },
  playerLog: {
    info: vi.fn(),
  },
  fs: {
    mkdir: vi.fn(),
    mkdtemp: vi.fn(),
    readFile: vi.fn(),
    rm: vi.fn(),
    stat: vi.fn(),
    writeFile: vi.fn(),
  },
  components: {
    getAutoMixComponentStatus: vi.fn(),
  },
  inference: {
    runAutoMixModel: vi.fn(),
    runAutoMixTask: vi.fn(),
  },
  features: {
    createAutoMixProfile: vi.fn(),
  },
}));

vi.mock("node:fs/promises", () => ({ ...mocks.fs, default: mocks.fs }));
vi.mock("@main/services/engine", () => ({ getEngine: () => mocks.engine }));
vi.mock("@main/utils/logger", () => ({ playerLog: mocks.playerLog }));
vi.mock("@main/utils/paths", () => ({ automixCacheDir: "automix-cache" }));
vi.mock("./components", () => ({
  getAutoMixComponentStatus: mocks.components.getAutoMixComponentStatus,
}));
vi.mock("./inference", () => ({
  runAutoMixModel: mocks.inference.runAutoMixModel,
  runAutoMixTask: mocks.inference.runAutoMixTask,
}));
vi.mock("./features", () => ({ createAutoMixProfile: mocks.features.createAutoMixProfile }));

const analyze = async (source: string) => {
  const { analyzeAutoMixTracks } = await import("./analysisHost");
  return analyzeAutoMixTracks([{ source, startMs: 0, tail: true }], new AbortController().signal);
};

describe("AutoMix 档案缓存", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    mocks.components.getAutoMixComponentStatus.mockResolvedValue({
      models: [{ state: "ready" }],
    });
    mocks.inference.runAutoMixTask.mockImplementation((_signal: AbortSignal, task: () => unknown) =>
      task(),
    );
    mocks.inference.runAutoMixModel.mockResolvedValue([]);
    mocks.engine.analyzeAutoMix.mockImplementation(async (source: string) => ({
      firstAudibleSeconds: 1,
      tail: true,
      mel: new Float32Array(1488 * 128),
      source,
    }));
    mocks.features.createAutoMixProfile.mockImplementation(
      (metadata: { source: string }, _data: Float32Array) => ({ source: metadata.source }),
    );
    mocks.fs.stat.mockImplementation(async (source: string) => ({
      size: source.length,
      mtimeMs: source.length,
      ctimeMs: source.length,
    }));
    mocks.fs.mkdtemp.mockResolvedValue("automix-cache/beats-test");
    mocks.fs.readFile.mockResolvedValue(Buffer.alloc(1488 * 8));
  });

  it("命中档案时刷新 LRU 顺序", async () => {
    for (let index = 0; index < 8; index += 1) {
      await analyze(`/track-${index}`);
    }
    expect(mocks.engine.analyzeAutoMix).toHaveBeenCalledTimes(8);
    await analyze("/track-0");
    for (let index = 8; index < 10; index += 1) {
      await analyze(`/track-${index}`);
    }
    await analyze("/track-0");
    expect(mocks.engine.analyzeAutoMix).toHaveBeenCalledTimes(10);
  });

  it("用结构化字段记录缓存结果，不输出歌曲信息", async () => {
    await analyze("/track");
    await analyze("/track");
    expect(mocks.playerLog.info).toHaveBeenNthCalledWith(1, "AutoMix 档案缓存", {
      cacheHit: "none",
    });
    expect(mocks.playerLog.info).toHaveBeenNthCalledWith(2, "AutoMix 档案缓存", {
      cacheHit: "profile",
    });
    expect(JSON.stringify(mocks.playerLog.info.mock.calls)).not.toContain("/track");
  });
});
