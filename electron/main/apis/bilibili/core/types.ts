/**
 * B 站 API 类型：站方原始响应结构 + 本仓对外返回的归一化结构
 *
 * 原始结构字段命名与 Otter Music 的 `shared/types/music-platforms.ts` 保持一致，
 * 只保留本次 C1 批次用到的接口。
 */

/** nav 接口：WBI 密钥与登录态 */
export interface BilibiliNavResponse {
  code?: number;
  message?: string;
  data?: {
    isLogin?: boolean;
    mid?: number;
    uname?: string;
    face?: string;
    wbi_img?: {
      img_url?: string;
      sub_url?: string;
    };
  };
}

/** 搜索原始条目，`duration` 为站方的 `MM:SS` / `HH:MM:SS` 字符串 */
export interface BilibiliSearchVideoRaw {
  type?: string;
  bvid?: string;
  title?: string;
  author?: string;
  uname?: string;
  mid?: number | string;
  pic?: string;
  duration?: string;
  season_id?: number;
}

export interface BilibiliSearchResponse {
  code?: number;
  message?: string;
  data?: {
    numResults?: number;
    result?: BilibiliSearchVideoRaw[];
  };
}

export interface BilibiliViewPageRaw {
  cid?: number;
  page?: number;
  part?: string;
  duration?: number;
}

export interface BilibiliViewResponse {
  code?: number;
  message?: string;
  data?: {
    aid?: number;
    bvid?: string;
    cid?: number;
    title?: string;
    pic?: string;
    duration?: number;
    pages?: BilibiliViewPageRaw[];
    ugc_season?: {
      id?: number;
      title?: string;
      cover?: string;
    };
    owner?: {
      mid?: number;
      name?: string;
      face?: string;
    };
  };
}

/** DASH 音频条目：`id` 是音质档位码，`size` 单位字节 */
export interface BilibiliDashAudioEntry {
  id?: number;
  baseUrl?: string;
  base_url?: string;
  backupUrl?: string;
  backup_url?: string;
  url?: string;
  bandwidth?: number;
  size?: number;
  mimeType?: string;
  codecs?: string;
}

export interface BilibiliDurlEntry {
  url?: string;
  length?: number;
  size?: number;
}

export interface BilibiliPlayUrlResponse {
  code?: number;
  message?: string;
  data?: {
    dash?: {
      audio?: BilibiliDashAudioEntry[];
    };
    durl?: BilibiliDurlEntry[];
  };
}

export interface BilibiliSubtitleItem {
  lan?: string;
  lan_doc?: string;
  subtitle_url?: string;
  ai_status?: number;
  ai_type?: number;
}

export interface BilibiliPlayerResponse {
  code?: number;
  message?: string;
  data?: {
    subtitle?: {
      subtitles?: BilibiliSubtitleItem[];
    };
  };
}

export interface BilibiliSubtitleBodyItem {
  from?: number;
  to?: number;
  content?: string;
}

export interface BilibiliSubtitleResponse {
  body?: BilibiliSubtitleBodyItem[];
}

/** 请求层的可选参数 */
export interface BilibiliRequestOptions {
  /** Referer 覆盖，播放地址与音频流必须指向具体视频页 */
  referer?: string;
  /** 登录 cookie；省略时用会话表里的 cookie，都没有则回落占位 buvid3 */
  cookie?: Record<string, string>;
}

/** 请求层统一响应，`cookie` 为站方 set-cookie 里提取的键值 */
export interface BilibiliRequestResponse {
  status: number;
  body: Record<string, unknown>;
  cookie: Record<string, string>;
}

/**
 * 请求层注入面：`get` 走普通 GET，`wbi` 自动补签名参数。
 * 模块通过这个接口发请求，单测里换成立刻返回的假实现即可，不触网。
 */
export interface BilibiliHttp {
  get: (path: string, options?: BilibiliRequestOptions) => Promise<BilibiliRequestResponse>;
  wbi: (
    endpoint: string,
    params: Record<string, string | number>,
    options?: BilibiliRequestOptions,
  ) => Promise<BilibiliRequestResponse>;
}

/** 模块归一化结果：`body` 是本平台对外结构，`cookie` 是站方 set-cookie 提取出的键值 */
export interface BilibiliModuleResult {
  status: number;
  body: unknown;
  cookie: Record<string, string>;
}

/** 模块函数签名：`(query, http) => 归一化后的响应` */
export type BilibiliModule = (
  query: Record<string, unknown>,
  http: BilibiliHttp,
) => Promise<BilibiliModuleResult>;

/** 搜索归一化条目 */
export interface BilibiliSearchItem {
  id: string;
  bvid: string;
  title: string;
  artist: string;
  /** UP 主 mid，供后续歌手维度检索 */
  mid?: string;
  cover: string;
  /** 毫秒 */
  duration: number;
  source: "bilibili";
}

export interface BilibiliSearchResult {
  items: BilibiliSearchItem[];
  total: number;
  hasMore: boolean;
}

/** 视频详情归一化结果 */
export interface BilibiliVideoDetail {
  bvid: string;
  aid?: number;
  cid: number;
  title: string;
  cover: string;
  owner: { mid?: number; name: string };
  pages: Array<{ cid: number; page: number; part: string; duration: number }>;
  season?: { id: number; title: string; cover: string };
}

/**
 * 音频流归一化结果：`url` 是站方裸地址，必须配合 `headers` 才能取到流，
 * 交给后续的 127.0.0.1 代理消费。
 */
export interface BilibiliStream {
  url: string;
  /** 容器格式，供解码侧选择 demuxer */
  format: "m4s" | "m4a" | "flv";
  /** 站方音质档位码 */
  quality: number;
  qualityLabel: string;
  /** 字节数，durl 分段为整段大小 */
  size: number;
  bandwidth: number;
  mimeType: string;
  /** 取流必需请求头，代理需原样转发 */
  headers: Record<string, string>;
  /** 取流方式，dash 为最高带宽音频，durl 为降级分段 */
  via: "dash" | "durl";
}

/** 歌词归一化结果 */
export interface BilibiliLyricResult {
  /** 行级时间戳 LRC 原文 */
  lyric: string;
  /** 字幕语言标识，AI 字幕已去掉 `ai-` 前缀 */
  lan: string;
  isAi: boolean;
}
