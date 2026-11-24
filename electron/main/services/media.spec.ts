import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: { get: vi.fn() },
  mode: "full" as "full" | "minimizedWithLyric" | "minimizedWithoutLyric" | "tray",
  loadNativeModule: vi.fn(),
  app: { on: vi.fn() },
}));

vi.mock("@main/store", () => ({ store: mocks.store }));
vi.mock("electron", () => ({ app: mocks.app }));
vi.mock("@main/window/lifecycleMode", () => ({
  getCurrentLifecycleMode: () => mocks.mode,
}));
vi.mock("@main/utils/nativeLoader", () => ({ loadNativeModule: mocks.loadNativeModule }));
vi.mock("@main/utils/logger", () => ({
  mediaLog: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  nativeLogsDir: "logs",
}));
vi.mock("@main/utils/config", () => ({ isDev: false }));

import { disable, enable } from "./media";

const nativeModule = {
  initLogger: vi.fn(),
  initialize: vi.fn(),
  onEvent: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
};
const browserWindowCreated = mocks.app.on.mock.calls.find(
  ([channel]) => channel === "browser-window-created",
)?.[1] as
  ((_event: unknown, win: { on: (event: string, fn: () => void) => void }) => void) | undefined;

describe("SMTC 生命周期门控", () => {
  beforeEach(() => {
    mocks.mode = "full";
    mocks.store.get.mockReturnValue(true);
    mocks.loadNativeModule.mockReturnValue(nativeModule);
  });

  it("完整态启用，受限态禁用", () => {
    enable();
    mocks.mode = "minimizedWithoutLyric";
    enable();
    disable();
    expect(nativeModule.disable.mock.calls.length).toBeGreaterThan(0);
    expect(mocks.loadNativeModule).toHaveBeenCalledTimes(1);
  });

  it("窗口生命周期变化时主动同步原生媒体控件", async () => {
    enable();
    expect(browserWindowCreated).toBeTypeOf("function");

    const handlers = new Map<string, () => void>();
    browserWindowCreated?.({}, { on: (event, fn) => handlers.set(event, fn) });
    const enableCalls = nativeModule.enable.mock.calls.length;
    mocks.mode = "tray";
    handlers.get("hide")?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(nativeModule.disable.mock.calls.length).toBeGreaterThan(0);

    mocks.mode = "full";
    handlers.get("show")?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(nativeModule.enable.mock.calls.length).toBeGreaterThan(enableCalls);
  });
});
