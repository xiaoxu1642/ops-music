/**
 * 咪咕 API 常量（域名、接口路径、渠道头、音质档位映射、超时与缓存参数）
 *
 * 端点与档位口径取自竞品静态分析结论（music-lib / miguMusic-api-enhanced），
 * 走 PC 网页端通道（channel 014X031），不需要安卓客户端 UA 伪装。
 */

/** PC 网页端接口域名（搜索 / 详情 / 播放地址 / 榜单） */
export const API_DOMAIN = "https://app.c.nf.migu.cn";
/** 老版 resourceinfo 域名（歌词地址来源） */
export const LEGACY_DOMAIN = "https://app.u.nf.migu.cn";
/** 安卓端域名（token 校验与备用播放接口） */
export const APP_DOMAIN = "https://c.musicapp.migu.cn";

/** PC 网页端渠道标识：bmw/* 与 pc/listen 接口都要求这个 channel 头 */
export const PC_CHANNEL = "014X031";

/** 请求伪装：网页接口用桌面 Chrome，咪咕按 UA 区分客户端但不强校验版本 */
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 音频 CDN 取流的伪装头：竞品证据倾向直链无 Referer 校验，安卓 UA 兜底 */
export const STREAM_HEADERS: Record<string, string> = {
  "User-Agent": "Android_migu/7.41.13 okhttp/3.12.13",
};

/** 接口路径（不含 query） */
export const ENDPOINT = {
  /** 歌曲搜索（bmw 新接口，无 pageSize 参数，只传 pageNo） */
  search: "/bmw/search/song/v1.0",
  /** 批量歌曲详情（contentId 用 | 分隔） */
  songInfo: "/resource/song/by-contentids/v2.0",
  /** 播放地址（明文 JSON，上游固定返回 PQ 档） */
  listenUrl: "/MIGUM3.0/strategy/pc/listen/v1.0",
  /** 会员鉴权播放地址（pacmtoken 放请求头，响应为混淆 JSON） */
  listenUrlV2: "/strategy/pc/listen/v2.0",
  /** 可听性检查（VIP / 版权限制判定） */
  canListen: "/strategy/pc/can-listen/v1.0",
  /** 歌曲元信息（lrcUrl / mrcUrl 来源） */
  resourceInfo: "/MIGUM2.0/v1.0/content/resourceinfo.do",
} as const;

/** 请求超时；与 netease / bilibili 请求层同口径 */
export const REQUEST_TIMEOUT_MS = 8000;
/** 网络层重试次数（不含业务层的降级重试） */
export const MAX_ATTEMPTS = 3;
/** 重试退避基数，第 n 次失败后等待 n * 200ms */
export const RETRY_BASE_DELAY_MS = 200;
/** 接口响应缓存 TTL */
export const RESPONSE_CACHE_TTL_MS = 2 * 60 * 1000;
/** 响应缓存容量上限，超出后按插入顺序淘汰 */
export const CACHE_MAX_ENTRIES = 200;

/**
 * 音质档位 → CDN 路径片段与扩展名。
 * listen 接口上游固定返回 PQ（标清高清/MP3_128_16_Stero），
 * 改档是对返回 URL 做路径片段字符串替换（客户端改档，竞品 quality.ts 口径）。
 */
export interface MiguToneSpec {
  /** 客户端音质档位名 */
  tone: "LQ" | "PQ" | "HQ" | "SQ" | "ZQ24";
  /** CDN 路径片段 */
  pathSegment: string;
  /** 对应扩展名 */
  ext: string;
}

export const MIGU_TONES: Record<string, MiguToneSpec> = {
  LQ: { tone: "LQ", pathSegment: "全曲试听/Mp3_64_22_16", ext: ".mp3" },
  PQ: { tone: "PQ", pathSegment: "标清高清/MP3_128_16_Stero", ext: ".mp3" },
  HQ: { tone: "HQ", pathSegment: "标清高清/MP3_320_16_Stero", ext: ".mp3" },
  SQ: { tone: "SQ", pathSegment: "歌曲下载/flac", ext: ".flac" },
  ZQ24: { tone: "ZQ24", pathSegment: "歌曲下载/flac_24bit", ext: ".flac" },
};

/** 项目音质档位 → 咪咕档位降级链（目标档位拿不到时按序回退，PQ 保底） */
export const QUALITY_TO_TONES: Record<string, MiguToneSpec[]> = {
  lq: [MIGU_TONES.LQ, MIGU_TONES.PQ],
  sq: [MIGU_TONES.PQ],
  hq: [MIGU_TONES.HQ, MIGU_TONES.PQ],
  lossless: [MIGU_TONES.SQ, MIGU_TONES.HQ, MIGU_TONES.PQ],
  "hi-res": [MIGU_TONES.ZQ24, MIGU_TONES.SQ, MIGU_TONES.HQ, MIGU_TONES.PQ],
};

/** 档位中文标签（展示与代理元数据用） */
export const TONE_LABEL: Record<string, string> = {
  LQ: "标准",
  PQ: "高音质",
  HQ: "超高音质",
  SQ: "无损",
  ZQ24: "Hi-Res 无损",
};
