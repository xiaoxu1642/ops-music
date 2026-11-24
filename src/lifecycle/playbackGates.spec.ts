import { beforeEach, describe, expect, it } from "vitest";
import {
  getPlaybackLifecycleMode,
  initPlaybackModeBridge,
  isFullUiMode,
  isPlaybackRestrictedMode,
  isSmartTransitionEnabled,
  isSmartTransitionEnabledForMode,
  onPlaybackModeChange,
  resetPlaybackModeForTests,
  setPlaybackModeForTests,
} from "./playbackGates";

describe("playbackGates", () => {
  beforeEach(() => {
    resetPlaybackModeForTests();
  });

  it("完整态与有歌词最小化态保留智能过渡", () => {
    expect(isSmartTransitionEnabledForMode("full")).toBe(true);
    expect(isSmartTransitionEnabledForMode("minimizedWithLyric")).toBe(true);
    expect(isSmartTransitionEnabledForMode("minimizedWithoutLyric")).toBe(false);
    expect(isSmartTransitionEnabledForMode("tray")).toBe(false);
  });

  it("无歌词最小化态与托盘态进入受限播放", () => {
    setPlaybackModeForTests("minimizedWithoutLyric");
    expect(isFullUiMode()).toBe(false);
    expect(isPlaybackRestrictedMode()).toBe(true);
    expect(isSmartTransitionEnabled()).toBe(false);
    setPlaybackModeForTests("tray");
    expect(isPlaybackRestrictedMode()).toBe(true);
    expect(isSmartTransitionEnabled()).toBe(false);
  });

  it("模式变化通知携带旧模式", () => {
    setPlaybackModeForTests("full");
    const changes: string[] = [];
    const unsubscribe = onPlaybackModeChange((mode, previous) => {
      changes.push(`${previous}->${mode}`);
    });

    setPlaybackModeForTests("tray");
    setPlaybackModeForTests("full");
    unsubscribe();

    expect(changes).toEqual(["full->tray", "tray->full"]);
    expect(getPlaybackLifecycleMode()).toBe("full");
  });

  it("通过 window.api.window 生命周期通道更新模式", () => {
    const originalApi = window.api;
    let notify: ((payload: { mode: string; taskbarLyricEnabled: boolean }) => void) | undefined;
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        window: {
          onLifecycleModeChange: (callback: (payload: { mode: string }) => void) => {
            notify = callback;
            return () => {};
          },
        },
      },
    });

    try {
      initPlaybackModeBridge();
      notify?.({ mode: "tray", taskbarLyricEnabled: false });
      expect(getPlaybackLifecycleMode()).toBe("tray");
      expect(isPlaybackRestrictedMode()).toBe(true);
    } finally {
      Object.defineProperty(window, "api", { configurable: true, value: originalApi });
    }
  });

  it("异步初态迟到时不覆盖广播先到的模式", async () => {
    const originalApi = window.api;
    let notify: ((payload: { mode: string; taskbarLyricEnabled: boolean }) => void) | undefined;
    let resolveInitial: ((state: { mode: string }) => void) | undefined;
    Object.defineProperty(window, "api", {
      configurable: true,
      value: {
        window: {
          onLifecycleModeChange: (callback: (payload: { mode: string }) => void) => {
            notify = callback;
            return () => {};
          },
          getLifecycleState: () =>
            new Promise((resolve) => {
              resolveInitial = resolve;
            }),
        },
      },
    });

    try {
      initPlaybackModeBridge();
      notify?.({ mode: "full", taskbarLyricEnabled: false });
      resolveInitial?.({ mode: "tray" });
      await Promise.resolve();
      await Promise.resolve();
      expect(getPlaybackLifecycleMode()).toBe("full");
    } finally {
      Object.defineProperty(window, "api", { configurable: true, value: originalApi });
    }
  });
});
