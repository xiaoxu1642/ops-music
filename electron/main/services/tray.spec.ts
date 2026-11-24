import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";

const mocks = vi.hoisted(() => ({
  mode: "full" as "full" | "minimizedWithLyric" | "minimizedWithoutLyric" | "tray",
  toggleTaskbarLyricWindow: vi.fn(() => true),
  applyLifecycleEvent: vi.fn(),
  setContextMenu: vi.fn(),
  buildFromTemplate: vi.fn((items: MenuItemConstructorOptions[]) => items),
}));

vi.mock("electron", () => ({
  app: { quit: vi.fn() },
  Menu: { buildFromTemplate: mocks.buildFromTemplate },
  nativeTheme: { on: vi.fn(), shouldUseDarkColors: false },
  Tray: class {
    on = vi.fn();
    setContextMenu = mocks.setContextMenu;
    setToolTip = vi.fn();
  },
}));
vi.mock("@main/utils/broadcast", () => ({ sendToMain: vi.fn() }));
vi.mock("@main/utils/config", () => ({ appName: "OpsMusic", isWin: true }));
vi.mock("@main/utils/icon", () => ({
  loadIcon: vi.fn(() => ({})),
  loadThemedIcon: vi.fn(() => ({})),
}));
vi.mock("@main/utils/i18n", () => ({ t: (key: string) => key }));
vi.mock("@main/utils/logger", () => ({ trayLog: { info: vi.fn() } }));
vi.mock("@main/window", () => ({
  toggleTaskbarLyricWindow: mocks.toggleTaskbarLyricWindow,
  focusMainWindow: vi.fn(),
}));
vi.mock("@main/window/lifecycleMode", () => ({
  applyLifecycleEvent: mocks.applyLifecycleEvent,
  getCurrentLifecycleMode: () => mocks.mode,
}));

const lyricItem = (): MenuItemConstructorOptions | undefined => {
  const menu = mocks.setContextMenu.mock.calls.at(-1)?.[0] as MenuItemConstructorOptions[];
  return menu.find(
    (item) => item.label === "openTaskbarLyric" || item.label === "closeTaskbarLyric",
  );
};

describe("托盘任务栏歌词入口", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.mode = "full";
    mocks.toggleTaskbarLyricWindow.mockReturnValue(true);
  });

  it("full 与 minimizedWithLyric 显示歌词入口，受限态隐藏", async () => {
    const { initTray, refreshTray } = await import("./tray");
    initTray();
    expect(lyricItem()).toBeDefined();

    mocks.mode = "minimizedWithLyric";
    refreshTray();
    expect(lyricItem()).toBeDefined();

    mocks.mode = "minimizedWithoutLyric";
    refreshTray();
    expect(lyricItem()).toBeUndefined();

    mocks.mode = "tray";
    refreshTray();
    expect(lyricItem()).toBeUndefined();
  });

  it("托盘开关歌词后同步生命周期状态", async () => {
    const { initTray } = await import("./tray");
    initTray();

    const click = lyricItem()?.click;
    click?.({} as never, {} as never, {} as never);

    expect(mocks.toggleTaskbarLyricWindow).toHaveBeenCalledTimes(1);
    expect(mocks.applyLifecycleEvent).toHaveBeenCalledWith("taskbarLyricChanged", true);
  });
});
