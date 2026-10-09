import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  get: vi.fn(),
  set: vi.fn(),
  clear: vi.fn(),
  replaceAll: vi.fn(),
}));
vi.mock("electron", () => ({
  dialog: {},
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      mocks.handlers.set(name, handler),
  },
}));
vi.mock("@main/store", () => ({
  store: {
    get: mocks.get,
    set: mocks.set,
    clear: mocks.clear,
    replaceAll: mocks.replaceAll,
  },
}));
vi.mock("@main/utils/logger", () => ({ systemLog: {} }));
vi.mock("@main/utils/config", () => ({ isWin: true }));
vi.mock("@main/utils/broadcast", () => ({}));
vi.mock("@main/services/media", () => ({}));
vi.mock("@main/services/lastfm", () => ({}));
vi.mock("@main/services/engine", () => ({}));
vi.mock("@main/window", () => ({}));
vi.mock("@main/server", () => ({}));
vi.mock("@main/services/mcp/http", () => ({}));
vi.mock("@main/services/orpheus", () => ({}));
vi.mock("@main/services/thumbnail", () => ({}));

import { registerConfigIpc } from "./config";

describe("配置 IPC 入口", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.clear();
    registerConfigIpc();
  });

  it("读写配置转发到主进程 store", () => {
    mocks.handlers.get("config:set")!(null, "player.volume", 0.5);
    expect(mocks.set).toHaveBeenCalledWith("player.volume", 0.5);

    mocks.get.mockReturnValue(0.5);
    expect(mocks.handlers.get("config:get")!(null, "player.volume")).toBe(0.5);
  });

  it("重置与替换配置写入 store", () => {
    mocks.handlers.get("config:reset")!();
    expect(mocks.clear).toHaveBeenCalledOnce();

    const payload = { player: { volume: 0.8 } };
    mocks.handlers.get("config:replaceAll")!(null, payload);
    expect(mocks.replaceAll).toHaveBeenCalledWith(payload);
  });
});
