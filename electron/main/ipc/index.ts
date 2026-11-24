import { registerSystemIpc } from "./system";
import { registerPlayerIpc } from "./player";
import { registerConfigIpc } from "./config";
import { registerLibraryIpc } from "./library";
import { registerNowPlayingIpc } from "./nowPlaying";
import { registerWindowIpc } from "./window";
import { registerApisIpc } from "./apis";
import { registerLyricsIpc } from "./lyrics";
import { registerHotkeyIpc } from "./hotkey";
import { registerCacheIpc } from "./cache";
import { registerDownloadIpc } from "./download";
import { registerStatsIpc } from "./stats";
import { registerPlaylistIpc } from "./playlist";
import { registerOpenccIpc } from "./opencc";
import { registerCommentsIpc } from "./comments";
import { registerAutoMixIpc } from "./automix";
import { registerStartupMetricsIpc } from "./startupMetrics";

/** 注册所有 IPC 处理 */
export const registerIpcHandlers = (): void => {
  registerSystemIpc();
  registerPlayerIpc();
  registerAutoMixIpc();
  registerConfigIpc();
  registerLibraryIpc();
  registerNowPlayingIpc();
  registerWindowIpc();
  registerApisIpc();
  registerLyricsIpc();
  registerOpenccIpc();
  registerCommentsIpc();
  registerHotkeyIpc();
  registerPlaylistIpc();
  registerCacheIpc();
  registerDownloadIpc();
  registerStatsIpc();
  registerStartupMetricsIpc();
};
