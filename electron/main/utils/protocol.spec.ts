import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  defaultHandle: vi.fn(),
  mainHandle: vi.fn(),
  onBeforeSendHeaders: vi.fn(),
  fromPartition: vi.fn(),
  createWindow: vi.fn(),
}));

vi.mock("electron", () => ({
  net: { fetch: vi.fn() },
  protocol: { handle: mocks.defaultHandle, registerSchemesAsPrivileged: vi.fn() },
  session: { fromPartition: mocks.fromPartition },
  BrowserWindow: class {},
  shell: { openExternal: vi.fn() },
}));
vi.mock("@electron-toolkit/utils", () => ({ is: { dev: false } }));
vi.mock("@main/apis/bilibili/core/config", () => ({ USER_AGENT: "test-ua" }));
vi.mock("@main/utils/config", () => ({ getAppCacheDir: () => "C:/cache", isWin: false }));
vi.mock("../window/create", () => ({ createWindow: mocks.createWindow }));
vi.mock("../window/idleDestroy", () => ({
  MAIN_WINDOW_IDLE_DESTROY_MS: 600_000,
  shouldDestroyIdleMainWindow: () => false,
}));
vi.mock("@main/services/thumbar", () => ({ initThumbar: vi.fn() }));
vi.mock("@main/services/thumbnail", () => ({ enableTaskbarThumbnail: vi.fn() }));
vi.mock("@main/services/tray", () => ({ initTray: vi.fn() }));
vi.mock("@main/services/nowPlaying", () => ({ lightSnapshot: () => ({ playing: false }) }));
vi.mock("@main/store", () => ({ store: { get: vi.fn(), set: vi.fn() } }));
vi.mock("@main/utils/lifecycle", () => ({ isAppQuitting: () => false }));
vi.mock("@main/utils/logger", () => ({ coreLog: { info: vi.fn() } }));
vi.mock("@main/utils/broadcast", () => ({ broadcast: vi.fn() }));
vi.mock("@shared/constants/agreement", () => ({ CURRENT_AGREEMENT_VERSION: 1 }));

const makeWindow = () => {
  const listeners = new Map<string, () => void>();
  return {
    on: vi.fn((event: string, listener: () => void) => listeners.set(event, listener)),
    once: vi.fn(),
    emit: (event: string) => listeners.get(event)?.(),
    webContents: {
      on: vi.fn(),
      once: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    },
    loadFile: vi.fn(),
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isMinimized: vi.fn(() => false),
    focus: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    restore: vi.fn(),
    maximize: vi.fn(),
    isMaximized: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 1280, height: 800 })),
    setBounds: vi.fn(),
    destroy: vi.fn(),
  };
};

import { handleCacheProtocol, MAIN_PARTITION } from "./protocol";
import { createMainWindow, focusMainWindow } from "../window/main";

describe("主窗口分区协议注册", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fromPartition.mockReturnValue({
      protocol: { handle: mocks.mainHandle },
      webRequest: { onBeforeSendHeaders: mocks.onBeforeSendHeaders },
    });
    mocks.createWindow.mockImplementation(makeWindow);
  });

  it("启动期注册一次，主窗口重建不再重复注册", () => {
    handleCacheProtocol();
    expect(mocks.defaultHandle).toHaveBeenCalledOnce();
    expect(mocks.mainHandle).toHaveBeenCalledOnce();
    expect(mocks.onBeforeSendHeaders).toHaveBeenCalledOnce();
    expect(mocks.fromPartition).toHaveBeenCalledWith(MAIN_PARTITION);

    createMainWindow();
    const first = mocks.createWindow.mock.results[0].value as ReturnType<typeof makeWindow>;
    first.emit("closed");
    focusMainWindow();

    expect(mocks.createWindow).toHaveBeenCalledTimes(2);
    expect(mocks.defaultHandle).toHaveBeenCalledOnce();
    expect(mocks.mainHandle).toHaveBeenCalledOnce();
    expect(mocks.onBeforeSendHeaders).toHaveBeenCalledOnce();
  });
});
