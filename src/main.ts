import "virtual:uno.css";
import "@/styles/global.css";

import piniaPersistedstate from "pinia-plugin-persistedstate";
import App from "./App.vue";
import router from "./router";
import i18n from "./i18n";

import { useThemeStore } from "./stores/theme";
import { useHotkeyStore } from "./stores/hotkey";
import { initPlayer, restoreLastTrack } from "./core/player";
import { playFiles } from "./core/player";
import { isAudioFile } from "@shared/utils/audioFile";
import { installHotkeyManager } from "./core/hotkey/manager";
import { vRipple } from "./directives/ripple";

const pinia = createPinia();
pinia.use(piniaPersistedstate);

const app = createApp(App);
app.directive("ripple", vRipple);
app.use(pinia);
app.use(router);
app.use(i18n);

// 初始化主题
useThemeStore().init();

/** splash 最短展示时长（ms） */
const SPLASH_MIN_MS = 300;

/** splash 淡出时长（ms） */
const SPLASH_FADE_MS = 300;

/** 最短展示计时 */
const splashMinElapsed = new Promise<void>((resolve) => setTimeout(resolve, SPLASH_MIN_MS));

/** 等待首帧绘制完成；窗口被遮挡/最小化时 rAF 不会触发，用 timer 兜底保证 splash 必然淡出 */
const nextPaintedFrame = (): Promise<void> => {
  const painted = new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  return Promise.race([
    painted,
    new Promise<void>((resolve) => setTimeout(resolve, SPLASH_FADE_MS)),
  ]);
};

/** 淡出并移除 splash 层 */
const removeSplash = (): void => {
  const el = document.getElementById("app-loading");
  if (!el) return;
  el.classList.add("hidden");
  setTimeout(() => el.remove(), SPLASH_FADE_MS + 50);
};

/**
 * 启动播放服务
 */
const bootstrapPlayback = async (): Promise<void> => {
  await initPlayer();
  let restoring = true;
  const pendingPlayFiles: string[][] = [];
  window.api.system.onOpenFiles((files) => {
    const valid = files.filter((file) => isAudioFile(file));
    if (!valid.length) return;
    if (restoring) {
      pendingPlayFiles.push(valid);
      return;
    }
    void playFiles(valid);
  });
  const pendingFiles = (await window.api.system.consumePendingAudioFiles()).filter((file) =>
    isAudioFile(file),
  );
  if (pendingFiles.length) await playFiles(pendingFiles);
  else await restoreLastTrack();
  restoring = false;
  for (const files of pendingPlayFiles) void playFiles(files);
};

// 初始化程序
router.isReady().then(async () => {
  // 挂载应用
  app.mount("#app");
  // 启动播放服务
  void bootstrapPlayback().catch(console.error);
  // 淡出加载动画
  await Promise.all([splashMinElapsed, nextPaintedFrame()]);
  removeSplash();
  // 初始化快捷键
  useHotkeyStore()
    .init()
    .then(installHotkeyManager)
    .catch((err) => console.error("[hotkey] init failed", err));
});
