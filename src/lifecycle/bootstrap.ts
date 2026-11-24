import type { LifecycleState } from "@shared/types/window";
import type { RendererLifecycleMode } from "./rendererMode";
import { normalizeLifecyclePayload, shouldMountFullUi } from "./rendererMode";
import { canApplyInitialLifecycle } from "./lifecycleRace";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import persistedstate from "pinia-plugin-persistedstate";

const pinia: Pinia = createPinia();
pinia.use(persistedstate);
setActivePinia(pinia);

type Unsubscribe = () => void;

/** 生命周期订阅接口，未接入 preload 时可缺省 */
interface LifecycleWindowBridge {
  onLifecycleModeChange?: (callback: (payload: LifecycleState) => void) => Unsubscribe;
  getLifecycleState?: () => Promise<LifecycleState>;
}

/** 读取桥接 API，兼容 preload 未升级的过渡期 */
const getApi = (): { window?: LifecycleWindowBridge } =>
  (window.api as { window?: LifecycleWindowBridge } | undefined) ?? {};

/** 在完整态启动 UI 相关的副作用，重复调用不会重复注册 */
const mountUi = async (): Promise<() => void> => {
  const [
    vue,
    appModule,
    routerModule,
    i18nModule,
    themeModule,
    hotkeyStoreModule,
    hotkeyManagerModule,
    rippleModule,
  ] = await Promise.all([
    import("vue"),
    import("@/App.vue"),
    import("@/router"),
    import("@/i18n"),
    import("@/stores/theme"),
    import("@/stores/hotkey"),
    import("@/core/hotkey/manager"),
    import("@/directives/ripple"),
  ]);

  await import("virtual:uno.css");
  await import("@/styles/global.css");

  const app = vue.createApp(appModule.default);
  app.directive("ripple", rippleModule.vRipple);
  app.use(pinia);
  app.use(routerModule.default);
  app.use(i18nModule.default);
  themeModule.useThemeStore(pinia).init();
  await routerModule.default.isReady();
  app.mount("#app");

  const splashMinElapsed = new Promise<void>((resolve) => setTimeout(resolve, 300));
  const painted = new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  await Promise.all([
    splashMinElapsed,
    Promise.race([painted, new Promise<void>((resolve) => setTimeout(resolve, 300))]),
  ]);
  const splash = document.getElementById("app-loading");
  if (splash) {
    splash.classList.add("hidden");
    setTimeout(() => splash.remove(), 350);
  }
  window.api.startup?.reportMilestone?.("fullUiReady");

  void hotkeyStoreModule
    .useHotkeyStore(pinia)
    .init()
    .then(() => hotkeyManagerModule.installHotkeyManager())
    .catch((error: unknown) => console.error("[hotkey] init failed", error));

  return () => app.unmount();
};

/** 启动播放运行时，并按需挂载完整 UI */
export const bootstrapRenderer = async (): Promise<void> => {
  let mode: RendererLifecycleMode = "full";
  const api = getApi();
  let fullUiPromise: Promise<() => void> | null = null;
  let unmountUi: (() => void) | null = null;
  let modeSeq = 0;
  const applyMode = (next: RendererLifecycleMode): void => {
    mode = next;
    if (!shouldMountFullUi(mode)) {
      unmountUi?.();
      unmountUi = null;
      fullUiPromise = null;
      return;
    }
    if (unmountUi || fullUiPromise) return;
    fullUiPromise = mountUi().then((cleanup) => {
      unmountUi = cleanup;
      fullUiPromise = null;
      if (!shouldMountFullUi(mode)) {
        unmountUi();
        unmountUi = null;
      }
      return cleanup;
    });
    fullUiPromise.catch((error: unknown) => console.error("[lifecycle] UI 挂载失败", error));
  };

  const unsubscribeMode = api.window?.onLifecycleModeChange?.((payload) => {
    const next = normalizeLifecyclePayload(payload, mode);
    modeSeq += 1;
    mode = next;
    applyMode(next);
  });
  const initialSeq = modeSeq;
  const initial = await api.window?.getLifecycleState?.();
  if (canApplyInitialLifecycle(initialSeq, modeSeq)) {
    mode = normalizeLifecyclePayload(initial, mode);
    applyMode(mode);
  }

  const player = await import("@/core/player");
  const { isAudioFile } = await import("@shared/utils/audioFile");

  await player.initPlayer();
  let restoring = true;
  const pendingPlayFiles: string[][] = [];
  const unsubscribeOpenFiles = window.api.system.onOpenFiles((files) => {
    const valid = files.filter((file) => isAudioFile(file));
    if (!valid.length) return;
    if (restoring) {
      pendingPlayFiles.push(valid);
      return;
    }
    void player.playFiles(valid);
  });
  const pendingFiles = (await window.api.system.consumePendingAudioFiles()).filter((file) =>
    isAudioFile(file),
  );
  if (pendingFiles.length) await player.playFiles(pendingFiles);
  else await player.restoreLastTrack();
  restoring = false;
  for (const files of pendingPlayFiles) void player.playFiles(files);
  window.api.startup?.reportMilestone?.("playbackReady");

  window.addEventListener("beforeunload", () => {
    unsubscribeMode?.();
    unsubscribeOpenFiles();
    unmountUi?.();
  });
};
