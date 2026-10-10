import type { SystemConfig } from "../types/settings";
import { defaultHotkeyConfig } from "./hotkeys";

/** 默认配置 */
export const defaultSystemConfig: SystemConfig = {
  player: {
    autoPlay: false,
    rememberLastTrack: true,
    fadeEnabled: true,
    fadeDuration: 200,
    outputDevice: null,
    volume: 1,
    loudnessNormalization: false,
    audioOutputMode: "shared",
    equalizer: {
      enabled: false,
      preset: "flat",
      bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      preamp: 0,
    },
    lyricOffsets: {},
  },
  media: {
    systemMediaControls: true,
  },
  library: {
    scanDirs: [],
  },
  taskbarLyric: {
    position: "auto",
    autoMaxWidth: true,
    autoAdjustOccupiedSpace: false,
    maxWidth: 400,
    leftMargin: 0,
    rightMargin: 0,
    colorMode: "taskbar",
    showBackground: false,
    doubleLine: true,
    showTranslation: true,
    showCover: true,
    wordByWord: true,
    fontSize: 14,
    fontWeight: 400,
  },
  lyric: {
    enableOnlineTTMLLyric: false,
    amllDbServer: "https://amlldb.bikonoo.com/%p/%s.ttml",
  },
  localLyric: {
    enableLocalTTMLOverride: false,
    repoDir: "",
  },
  cache: {
    dir: null,
    songCache: {
      enabled: false,
      sizeLimitGb: 10,
    },
  },
  download: {
    dir: null,
    quality: "lossless",
    usePlaybackForDownload: false,
    fileTemplate: "{artist} - {title}",
    folderScheme: "none",
  },
  system: {
    rememberWindowState: true,
    borderlessWindow: true,
    taskbarProgress: true,
    taskbarThumbnailCover: true,
    onboardingCompleted: false,
    agreedAgreementVersion: 1,
    neteaseScrobbleEnabled: false,
    neteaseScrobbleMode: "ncbl",
  },
  windowStates: {
    main: {
      width: 1280,
      height: 800,
      x: null,
      y: null,
      maximized: false,
    },
    taskbarLyric: {
      visible: false,
    },
  },
  hotkeys: defaultHotkeyConfig,
};
