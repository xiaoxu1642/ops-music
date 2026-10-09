import { ipcMain } from "electron";
import { broadcast } from "@main/utils/broadcast";
import { getTaskbarLyricWindow, isTaskbarLyricPresented } from "@main/window";
import * as nowPlaying from "@main/services/nowPlaying";
import type { NowPlayingUpdatePayload } from "@shared/types/nowPlaying";

export const registerNowPlayingIpc = (): void => {
  // 渲染进程同步当前播放状态到主进程
  ipcMain.on("nowPlaying:update", (_event, payload: NowPlayingUpdatePayload) => {
    nowPlaying.update(payload.track, payload.lyric, payload.source);
  });

  // 渲染进程写入指定曲目的歌词偏移
  ipcMain.on("nowPlaying:setLyricOffset", (_event, trackId: string, offsetMs: number) => {
    nowPlaying.setLyricOffset(trackId, offsetMs);
  });

  // 窗口拉取当前完整快照
  ipcMain.handle("nowPlaying:requestSnapshot", () => nowPlaying.snapshot());

  // 订阅 service 事件，广播给主窗口与各歌词窗口
  nowPlaying.onTrackChange((data) => {
    broadcast("nowPlaying:track-change", data);
  });
  nowPlaying.onLyricChange((snap) => {
    broadcast("nowPlaying:lyric-change", snap);
  });
  // position-sync 是 5Hz 高频通道，只有任务栏歌词窗口在消费。该窗口嵌在任务栏里，
  // isVisible() 恒为真，必须用真实呈现态作门，否则看不见的歌词窗口会被持续灌位置；
  // 低频的 track-change / lyric-change 仍无条件下发，窗口重新显示后据此自行接续
  nowPlaying.onPositionSync((data) => {
    if (!isTaskbarLyricPresented()) return;
    getTaskbarLyricWindow()?.webContents.send("nowPlaying:position-sync", data);
  });
  nowPlaying.onLyricOffsetChange((data) => {
    broadcast("nowPlaying:lyric-offset-change", data);
  });
};
