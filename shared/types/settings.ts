import type { HotkeyConfig } from "./hotkey";
import type { DownloadQuality, DownloadFolderScheme } from "./download";

/** 均衡器预设标识 */
export type EqualizerPreset =
  | "flat"
  | "custom"
  | "pop"
  | "rock"
  | "classical"
  | "electronic"
  | "bass"
  | "vocal"
  | "dance"
  | "soft";

/** 均衡器配置 */
export interface EqualizerSettings {
  /** 是否启用均衡器 */
  enabled: boolean;
  /** 当前选中的预设 */
  preset: EqualizerPreset;
  /** 10 频段增益（dB），范围 [-15, 15]，对应 31/62/125/250/500/1k/2k/4k/8k/16k Hz */
  bands: number[];
  /** 前级增益（dB），范围 [-12, 12] */
  preamp: number;
}

/** 音频输出模式 */
export type AudioOutputMode = "shared" | "exclusive";

/** 播放器配置 */
export interface PlayerSettings {
  /** 加载后自动播放 */
  autoPlay: boolean;
  /** 记忆上次播放的歌曲 */
  rememberLastTrack: boolean;
  /** 是否启用渐入渐出 */
  fadeEnabled: boolean;
  /** 渐入渐出时长（毫秒） */
  fadeDuration: number;
  /** 输出设备名称，null 为系统默认 */
  outputDevice: string | null;
  /** 默认音量（0.0 ~ 1.0） */
  volume: number;
  /** 音量均衡（响度归一化） */
  loudnessNormalization: boolean;
  /** 音频输出模式：共享（默认）/ WASAPI 独占（仅 Windows） */
  audioOutputMode: AudioOutputMode;
  /** 均衡器配置 */
  equalizer: EqualizerSettings;
  /** 按 `{Track.id}|{歌词源}` 记忆的歌词偏移（ms，正值为歌词提前）；为 0 时不写入 */
  lyricOffsets: Record<string, number>;
}

/** 媒体集成配置 */
export interface MediaSettings {
  /** 是否启用系统媒体控件（SMTC / MPRIS / MPNowPlaying） */
  systemMediaControls: boolean;
}

/** 任务栏歌词位置模式 */
export type TaskbarLyricPosition = "auto" | "left" | "right";

/** 任务栏歌词配色模式：taskbar=跟随任务栏主题，light=强制浅色，dark=强制深色 */
export type TaskbarLyricColorMode = "taskbar" | "taskbarInverse" | "light" | "dark";

/** 任务栏歌词配置（仅 Windows） */
export interface TaskbarLyricSettings {
  /** 位置：auto 根据任务栏对齐方式自动选择，left 固定左侧，right 固定右侧 */
  position: TaskbarLyricPosition;
  /** 宽度自动：开启时占满可用空间，关闭时按 maxWidth 限制 */
  autoMaxWidth: boolean;
  /** 根据当前歌词与悬浮控件动态调整真实窗口宽度 */
  autoAdjustOccupiedSpace: boolean;
  /** 最大宽度（逻辑像素）；仅在 autoMaxWidth 关闭时生效；超出可用空间时仍以可用空间为准 */
  maxWidth: number;
  /** 左边距（逻辑像素），从可用空间左侧扣除 */
  leftMargin: number;
  /** 右边距（逻辑像素），从可用空间右侧扣除 */
  rightMargin: number;
  /** 配色模式 */
  colorMode: TaskbarLyricColorMode;
  /** 获焦时显示半透明背景 */
  showBackground: boolean;
  /** 双行显示（歌词 + 翻译 / 下一行） */
  doubleLine: boolean;
  /** 显示翻译（doubleLine 开启时，副行优先显示翻译，没有翻译则回退到下一行） */
  showTranslation: boolean;
  /** 显示封面 */
  showCover: boolean;
  /** 逐字高亮 */
  wordByWord: boolean;
  /** 字号（逻辑像素） */
  fontSize: number;
  /** 字重 */
  fontWeight: number;
}

/** 音乐库配置 */
export interface LibrarySettings {
  /** 扫描目录列表 */
  scanDirs: string[];
}

/** 在线歌词服务配置 */
export interface OnlineLyricSettings {
  /** 启用在线 TTML 歌词 */
  enableOnlineTTMLLyric: boolean;
  /** AMLL TTML DB 服务地址，需含 %s 占位符 */
  amllDbServer: string;
}

/** 本地歌词配置 */
export interface LocalLyricSettings {
  /** 启用本地 TTML 歌词库：从指定目录按元信息匹配 .ttml，命中优先于在线源 */
  enableLocalTTMLOverride: boolean;
  /** 本地 TTML 歌词库目录 */
  repoDir: string;
}

/** 歌曲缓存配置 */
export interface SongCacheSettings {
  /** 歌曲缓存总开关 */
  enabled: boolean;
  /** 上限（GB），0 表示不限制；超限按 LRU 淘汰 */
  sizeLimitGb: number;
}

/** 缓存配置 */
export interface CacheSettings {
  /** 自定义缓存目录；null 使用默认 {userData}/app-data/cache */
  dir: string | null;
  /** 歌曲文件级缓存 */
  songCache: SongCacheSettings;
}

/**
 * 下载配置
 *
 * 重名处理 / 歌词格式 / 内嵌选项不再可配，固定为：
 * 重名保留两者（加序号）、增强 LRC、内嵌封面 + 元信息 + 歌词、不额外保存歌词文件
 */
export interface DownloadSettings {
  /** 下载目录；null 使用系统下载目录下的应用子目录 */
  dir: string | null;
  /** 下载音质 */
  quality: DownloadQuality;
  /** 模拟播放下载：网易云用播放接口替代下载接口，避免占用每日下载次数 */
  usePlaybackForDownload: boolean;
  /** 文件名模板，支持 {artist} {title} {album}；不含子目录 */
  fileTemplate: string;
  /** 文件智能分类：按规则分子文件夹 */
  folderScheme: DownloadFolderScheme;
}

/** 主窗口几何 */
export interface MainWindowState {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
}

/** 任务栏歌词窗口状态 */
export interface TaskbarLyricWindowState {
  visible: boolean;
}

/** 窗口几何状态 */
export interface WindowStates {
  main: MainWindowState;
  taskbarLyric: TaskbarLyricWindowState;
}

/** NCM 听歌打卡上报方式 */
export type NeteaseScrobbleMode = "legacy" | "ncbl";

/** 后端配置汇总 */
export interface SystemConfig {
  /** 播放器配置 */
  player: PlayerSettings;
  /** 媒体集成配置 */
  media: MediaSettings;
  /** 音乐库配置 */
  library: LibrarySettings;
  /** 任务栏歌词配置（仅 Windows） */
  taskbarLyric: TaskbarLyricSettings;
  /** 在线歌词服务配置 */
  lyric: OnlineLyricSettings;
  /** 本地歌词配置 */
  localLyric: LocalLyricSettings;
  /** 缓存配置 */
  cache: CacheSettings;
  /** 下载配置 */
  download: DownloadSettings;
  /** 系统配置 */
  system: {
    /** 记忆窗口状态 */
    rememberWindowState: boolean;
    /** 开启无边框主窗口 */
    borderlessWindow: boolean;
    /** 在任务栏显示播放进度 */
    taskbarProgress: boolean;
    /** 悬停任务栏时以专辑封面作为窗口预览（仅 Windows） */
    taskbarThumbnailCover: boolean;
    /** 首启引导是否已完成 */
    onboardingCompleted: boolean;
    /** 用户已同意的协议版本号 */
    agreedAgreementVersion: number;
    /** 听歌打卡开关 */
    neteaseScrobbleEnabled: boolean;
    /** 听歌打卡上报方式 */
    neteaseScrobbleMode: NeteaseScrobbleMode;
  };
  /** 窗口几何状态（运行时自动记录，非用户主动配置） */
  windowStates: WindowStates;
  /** 快捷键配置（独立于其他配置，由 hotkey 模块独占） */
  hotkeys: HotkeyConfig;
}

/** 配置 API */
export interface ConfigApi {
  /** 获取单个配置项（点号路径，如 "player.fadeDuration"） */
  get: (keyPath: string) => Promise<unknown>;
  /** 写入单个配置项 */
  set: (keyPath: string, value: unknown) => Promise<void>;
  /** 获取全部配置 */
  getAll: () => Promise<SystemConfig>;
  /** 重置为默认值 */
  reset: () => Promise<void>;
  /** 整盘替换主进程配置 */
  replaceAll: (config: unknown) => Promise<void>;
  /** 写入用户选择的备份文件 */
  exportToFile: (payload: unknown) => Promise<{ ok: boolean; reason?: "canceled" | "writeFailed" }>;
  /** 读取用户选择的备份文件 */
  importFromFile: () => Promise<
    { ok: true; data: unknown } | { ok: false; reason: "canceled" | "readFailed" | "parseFailed" }
  >;
}
