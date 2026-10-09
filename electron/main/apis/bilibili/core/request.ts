/**
 * B 站请求层
 *
 * 只做「拼请求头 → 发请求 → 归一化响应」三件事：
 * - 请求头固定带 Referer + 桌面 Chrome UA，Cookie 用会话表里的登录态，未登录回落占位 buvid3
 * - 超时与重试口径与 netease 请求层一致（8s、3 次、退避 n*200ms）
 * - 失败统一抛 `BilibiliRequestError`，由 IPC 层转成 `{ ok:false, status, body }`
 */

import { net } from "electron";
import {
  ANONYMOUS_COOKIE,
  API_DOMAIN,
  ENDPOINT,
  MAX_ATTEMPTS,
  REQUEST_TIMEOUT_MS,
  RETRY_BASE_DELAY_MS,
  USER_AGENT,
  VIDEO_PAGE_DOMAIN,
  WBI_KEYS_TTL_MS,
} from "./config";
import { extractWbiKeys, signWbiParams } from "./credential";
import type { BilibiliNavResponse, BilibiliRequestOptions, BilibiliRequestResponse } from "./types";
import { coreLog } from "@main/utils/logger";

/** 非 2xx 或业务 code 非 0 时抛出，携带原始响应供上层判定风控 */
export class BilibiliRequestError extends Error {
  readonly response: BilibiliRequestResponse;

  constructor(response: BilibiliRequestResponse) {
    const code = response.body?.code ?? response.status;
    const message = typeof response.body?.message === "string" ? response.body.message : "";
    super(message ? `bilibili ${code}: ${message}` : `bilibili ${code}`);
    this.name = "BilibiliRequestError";
    this.response = response;
  }
}

/**
 * Cookie 头序列化：B 站的 SESSDATA 本身是 URL 编码过的串，
 * 再 encode 一次会双重编码导致站方判定无效，所以只做原样拼接。
 */
const toCookieHeader = (cookies: Record<string, string>): string =>
  Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

/** set-cookie 串 → 键值对（忽略 Path/Domain/Max-Age 等属性） */
const parseSetCookie = (arr: string[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const raw of arr) {
    const first = raw.split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const key = first.slice(0, eq).trim();
    const val = first.slice(eq + 1).trim();
    if (key) out[key] = val;
  }
  return out;
};

/**
 * 组装 B 站请求头
 * @param options - Referer / cookie 覆盖项
 * @returns 请求头
 */
export const buildBilibiliHeaders = (
  options: BilibiliRequestOptions = {},
): Record<string, string> => ({
  "User-Agent": USER_AGENT,
  Referer: options.referer || `${VIDEO_PAGE_DOMAIN}/`,
  // 登录 cookie 可能只有 SESSDATA，占位 buvid3 始终垫底，避免缺设备指纹被 -352 拦
  Cookie: toCookieHeader({ ...ANONYMOUS_COOKIE, ...options.cookie }),
});

/**
 * 发起一次 B 站 GET 请求
 * @param path - 接口路径（含 query）；字幕正文在 hdslb 域、站方直接给绝对地址，故允许 http(s) 开头
 * @param options - Referer / cookie 覆盖项
 * @returns 归一化响应；HTTP >= 400 或业务 code 非 0 时抛错
 */
export const createBilibiliRequest = async (
  path: string,
  options: BilibiliRequestOptions = {},
): Promise<BilibiliRequestResponse> => {
  const headers = buildBilibiliHeaders(options);
  const url = /^https?:\/\//i.test(path) ? path : `${API_DOMAIN}${path}`;

  let res: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await net.fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      break;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * RETRY_BASE_DELAY_MS));
      }
    }
  }

  if (!res) {
    const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new BilibiliRequestError({
      status: 502,
      body: { code: 502, message: detail },
      cookie: {},
    });
  }

  const setCookie =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const cookie = parseSetCookie(setCookie);

  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // 风控页会直接吐 HTML，这里保留状态码让业务层能做一次解冻重试
    body = { code: res.status, message: "non-json response (risk control)" };
  }

  const response: BilibiliRequestResponse = { status: res.status, body, cookie };
  if (res.status >= 400) throw new BilibiliRequestError(response);
  // 只有 API 信封才带 code；CDN 上的字幕正文 JSON 没有，不能按业务失败处理
  if (typeof body.code === "number" && body.code !== 0) throw new BilibiliRequestError(response);

  return response;
};

/**
 * 带 WBI 签名的请求：path 里不能带 query，业务参数统一由 params 提供并参与签名，
 * 参数重复会让 w_rid 校验失败。
 * @param endpoint - 接口路径，不含 query
 * @param params - 业务参数
 * @param options - Referer / cookie 覆盖项
 * @returns 归一化响应
 */
export const requestWbi = async (
  endpoint: string,
  params: Record<string, string | number>,
  options: BilibiliRequestOptions = {},
): Promise<BilibiliRequestResponse> => {
  const keys = await getWbiKeys(options);
  return createBilibiliRequest(
    `${endpoint}?${signWbiParams(params, keys.imgKey, keys.subKey)}`,
    options,
  );
};

/**
 * WBI 密钥缓存（单条，12h）：站方约一天轮换一次，每次签名都拉 nav 会白耗一次风控额度
 */
let wbiKeysCache: { imgKey: string; subKey: string; expires: number } | null = null;

/**
 * 取 WBI 签名密钥，必要时刷新
 * @param options - 请求选项，nav 也要带同一份 cookie
 * @returns imgKey / subKey
 */
export const getWbiKeys = async (
  options: BilibiliRequestOptions = {},
): Promise<{ imgKey: string; subKey: string }> => {
  const now = Date.now();
  if (wbiKeysCache && now < wbiKeysCache.expires) {
    return { imgKey: wbiKeysCache.imgKey, subKey: wbiKeysCache.subKey };
  }

  const res = await createBilibiliRequest(ENDPOINT.nav, options);
  const keys = extractWbiKeys(res.body as BilibiliNavResponse);
  if (!keys)
    throw new BilibiliRequestError({ ...res, body: { code: -1, message: "nav missing wbi_img" } });

  wbiKeysCache = { ...keys, expires: now + WBI_KEYS_TTL_MS };
  coreLog.info("[bilibili] WBI 密钥已刷新");
  return keys;
};

/** 登出或密钥被站方判定失效时丢弃缓存 */
export const resetWbiKeys = (): void => {
  wbiKeysCache = null;
};
