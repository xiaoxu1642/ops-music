/**
 * 咪咕 API 类型定义
 *
 * 归一化产物（MiguSong / MiguStream）是跨进程共享类型，定义在 shared/types/migu.ts
 */

import type { MiguSong, MiguStream } from "@shared/types/migu";

export type { MiguSong, MiguStream };

/** 专辑条目（搜索与详情响应共用） */
export interface MiguAlbum {
  id?: string;
  name?: string;
  albumName?: string;
  albumImgUrl?: string;
}

/** 搜索结果歌曲条目（bmw/search 响应归一化前） */
export interface MiguSearchSong {
  /** 歌曲 contentId */
  contentId?: string;
  /** 版权 ID，listen 接口必需 */
  copyrightId?: string;
  songName?: string;
  /** 歌手列表（by-contentids 旧结构） */
  singers?: Array<{ name?: string; id?: string }>;
  /** 歌手列表（bmw/search 新结构） */
  singerList?: Array<{ name?: string; id?: string }>;
  /** 专辑信息（旧结构） */
  albums?: MiguAlbum[];
  /** 专辑名（bmw/search 新结构，纯字符串） */
  album?: string;
  /** 时长（秒） */
  duration?: string | number;
  /** 封面地址（可能是 // 协议相对或 / 开头路径） */
  img1?: string;
  /** VIP 标记（showTag 含 vip 或 chargeAuditions） */
  showTag?: string;
  /** VIP 标记（bmw/search 新结构为数组） */
  showTags?: string[];
  chargeAuditions?: string;
}

/** 批量详情条目（by-contentids 响应归一化前，与搜索条目同构） */
export interface MiguSongInfo extends MiguSearchSong {
  lrcUrl?: string;
  mrcUrl?: string;
}

/** listen 接口响应（明文 JSON） */
export interface MiguListenUrlResponse {
  code?: string;
  info?: string;
  data?: {
    /** CDN 直链（PQ 档） */
    url?: string;
    /** 原始地址（与 url 同源时忽略） */
    oriUrl?: string;
  };
}

/** 咪咕模块函数签名：与 bilibili 的 BilibiliModule 对齐 */
export type MiguModule = (
  query: Record<string, unknown>,
  http: MiguHttp,
) => Promise<MiguRequestResponse>;

/** 归一化响应：status + body + 本轮 set-cookie 收获 */
export interface MiguRequestResponse {
  status: number;
  body: Record<string, unknown>;
  /** 响应里新拿到的 cookie（pacmtoken 轮换续期用） */
  cookie: Record<string, string>;
}

/** 请求选项 */
export interface MiguRequestOptions {
  /** 覆盖 channel 头（默认 PC_CHANNEL） */
  channel?: string;
  /** 会话 cookie（pacmtoken 等），主进程统一注入 */
  cookie?: Record<string, string>;
  /** 额外请求头 */
  headers?: Record<string, string>;
  /** JSON 请求体（POST 用） */
  body?: Record<string, unknown>;
  /** 表单请求体（POST 用，passport 登录系接口） */
  form?: Record<string, string>;
}

/** 请求层注入的 http 能力：get / post */
export interface MiguHttp {
  get: (path: string, options?: MiguRequestOptions) => Promise<MiguRequestResponse>;
  post: (path: string, options?: MiguRequestOptions) => Promise<MiguRequestResponse>;
}
