/**
 * B 站 API 常量（域名、接口路径、伪装请求头、音质档位、超时与缓存参数）
 *
 * 全部取自 Otter Music 已验证可用的实现，接口与 query 参数不做改动。
 */

/** B 站业务接口域名 */
export const API_DOMAIN = "https://api.bilibili.com";
/** 视频页域名，playurl / 音频流都要求 Referer 指向它 */
export const VIDEO_PAGE_DOMAIN = "https://www.bilibili.com";

/**
 * Chromium 侧接口请求统一使用的 Referer：只给站点根。
 * 带路径的 Referer（`/video/BV…`）在 Electron 网络栈里会被判为非法请求头并直接拦掉
 * （表现为 `net::ERR_BLOCKED_BY_CLIENT`），因此视频页 Referer 只留给本地代理发往 CDN 的取流请求。
 */
export const API_REFERER = `${VIDEO_PAGE_DOMAIN}/`;

/**
 * 伪装成桌面 Chrome：B 站对含 Electron/自定义 UA 的请求会返回 412 风控页
 */
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 未登录时的占位 buvid3：B 站按设备指纹风控，完全不带 buvid 会被 -352 拦截 */
export const ANONYMOUS_COOKIE: Record<string, string> = { buvid3: "0" };

/** 接口路径（不含 query） */
export const ENDPOINT = {
  /** 导航信息：WBI 密钥来源，同时是登录态校验接口 */
  nav: "/x/web-interface/nav",
  /** 视频搜索 */
  search: "/x/web-interface/search/type",
  /** 视频详情（分 P / UP 主 / 合集） */
  view: "/x/web-interface/view",
  /** 播放地址（DASH，需 WBI 签名） */
  playurl: "/x/player/wbi/playurl",
  /** 播放地址（durl 分段降级，Otter 现行接口，无需签名） */
  playurlDurl: "/x/player/playurl",
  /** 播放器信息（字幕轨道所在接口，需 WBI 签名） */
  playerV2: "/x/player/wbi/v2",
} as const;

/** playurl 的取流格式位：16 = DASH，0 = durl（FLV/MP4 分段） */
export const FNVAL_DASH = 16;
export const FNVAL_DURL = 0;

/** 请求超时；与 netease 请求层同口径，避免 B 站抖动时把主进程拖住 */
export const REQUEST_TIMEOUT_MS = 8000;
/** 网络层重试次数（不含业务层的风控重试） */
export const MAX_ATTEMPTS = 3;
/** 重试退避基数，第 n 次失败后等待 n * 200ms */
export const RETRY_BASE_DELAY_MS = 200;
/** 命中风控（412 / HTML 响应）后的单次业务重试间隔，Otter 实测 1.5s 足够解冻 */
export const RISK_CONTROL_RETRY_DELAY_MS = 1500;

/** WBI 密钥缓存时长：站方约 24h 轮换，取 12h 保证不过期 */
export const WBI_KEYS_TTL_MS = 12 * 60 * 60 * 1000;
/** 接口响应缓存 TTL */
export const RESPONSE_CACHE_TTL_MS = 2 * 60 * 1000;
/** view 结果 TTL：Otter 用 24h，音频与歌词需解析到同一分 P，短 TTL 会串台 */
export const VIEW_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** 响应缓存容量上限，超出后按插入顺序淘汰 */
export const CACHE_MAX_ENTRIES = 200;

/** 字幕时间轴相对分 P 时长的容忍秒数，超出即判定为无关字幕（防串台） */
export const SUBTITLE_DURATION_TOLERANCE = 15;

/**
 * DASH 音频 `id`（音质码）→ 中文标签。
 * B 站档位码与网易云的 level 字符串不同轨，这里只做展示与代理元数据，
 * 未收录的新档位回落到「未知音质」，不参与选流（选流按带宽取最高，同 Otter）。
 */
export const AUDIO_QUALITY_LABEL: Record<number, string> = {
  30216: "标准",
  30232: "高音质",
  30280: "无损",
  30250: "杜比全景声",
  30251: "Hi-Res 无损",
};

/** 音质档位兜底标签 */
export const UNKNOWN_QUALITY_LABEL = "未知音质";
