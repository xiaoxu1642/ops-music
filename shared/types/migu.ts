/**
 * 咪咕共享类型（主进程归一化产物，渲染层直接消费）
 */

/** 归一化后的咪咕歌曲 */
export interface MiguSong {
  /** 唯一 id：contentId */
  id: string;
  /** listen 接口必需的版权 ID */
  copyrightId: string;
  title: string;
  artist: string;
  /** 歌手 id（首位） */
  artistId?: string;
  /** 专辑 id（首位） */
  albumId?: string;
  /** 专辑名（首位） */
  album?: string;
  /** 毫秒时长，解析失败为 0 */
  duration: number;
  cover: string;
  /** VIP 标记 */
  isVip: boolean;
}

/** 归一化后的取流结果（裸地址直拉，实测无防盗链） */
export interface MiguStream {
  /** 音频直链（去 query，可直接交给播放引擎） */
  url: string;
  /** 咪咕档位码 */
  tone: string;
  /** 档位中文标签 */
  toneLabel: string;
  /** 音频格式（mp3/flac/wav） */
  format: string;
  /** 字节数，未知为 0 */
  size: number;
  /** 降级说明：目标档位不可用时实际落到的档位 */
  fallbackFrom?: string;
}
