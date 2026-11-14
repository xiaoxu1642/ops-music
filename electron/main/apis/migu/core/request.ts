/**
 * 咪咕请求层
 *
 * 只做「拼请求头 → 发请求 → 归一化响应」三件事：
 - 请求头固定带 channel + Referer + 桌面 Chrome UA，pacmtoken 由会话表注入
 * - 超时与重试口径与 netease / bilibili 请求层一致（8s、3 次、退避 n*200ms）
 * - 失败统一抛 `MiguRequestError`，由 IPC 层转成 `{ ok:false, status, body }`
 */

import { net } from "electron";
import {
  API_DOMAIN,
  ENDPOINT,
  MAX_ATTEMPTS,
  PC_CHANNEL,
  REQUEST_TIMEOUT_MS,
  RETRY_BASE_DELAY_MS,
  USER_AGENT,
} from "./config";
import type { MiguRequestOptions, MiguRequestResponse } from "./types";

/** 业务 code 非 "000000" 时抛出，携带原始响应供上层判定 */
export class MiguRequestError extends Error {
  readonly response: MiguRequestResponse;

  constructor(response: MiguRequestResponse) {
    const code = response.body?.code ?? response.status;
    const info = typeof response.body?.info === "string" ? response.body.info : "";
    super(info ? `migu ${code}: ${info}` : `migu ${code}`);
    this.name = "MiguRequestError";
    this.response = response;
  }
}

/** 业务成功码：咪咕新老接口都用 "000000" */
const SUCCESS_CODE = "000000";

/**
 * Cookie 头序列化：pacmtoken 原样拼接
 */
const toCookieHeader = (cookies: Record<string, string>): string =>
  Object.entries(cookies)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

/** set-cookie 串 → 键值对（忽略 Path/Domain/Expires 等属性） */
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
 * 组装咪咕请求头
 * @param options - channel / cookie / 额外头覆盖项
 * @returns 请求头
 */
export const buildMiguHeaders = (options: MiguRequestOptions = {}): Record<string, string> => ({
  "User-Agent": USER_AGENT,
  channel: options.channel ?? PC_CHANNEL,
  Referer: "https://music.migu.cn/",
  ...(Object.keys(options.cookie ?? {}).length
    ? { Cookie: toCookieHeader(options.cookie as Record<string, string>) }
    : {}),
  ...options.headers,
});

/**
 * 发起一次咪咕请求（GET / POST 由 method 决定）
 * @param path - 接口路径（含 query），或完整 URL
 * @param options - 请求选项
 * @param method - HTTP 方法
 * @returns 归一化响应；HTTP >= 400 或业务 code 非 "000000" 时抛错
 */
const request = async (
  path: string,
  options: MiguRequestOptions,
  method: "GET" | "POST",
): Promise<MiguRequestResponse> => {
  const headers = buildMiguHeaders(options);
  const url = /^https?:\/\//i.test(path) ? path : `${API_DOMAIN}${path}`;

  let res: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      res = await net.fetch(url, {
        method,
        headers:
          method === "POST"
            ? {
                "Content-Type": options.form
                  ? "application/x-www-form-urlencoded"
                  : "application/json",
                ...headers,
              }
            : headers,
        ...(method === "POST" && options.form
          ? { body: new URLSearchParams(options.form).toString() }
          : {}),
        ...(method === "POST" && options.body ? { body: JSON.stringify(options.body) } : {}),
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
    throw new MiguRequestError({ status: 502, body: { code: 502, info: detail }, cookie: {} });
  }

  const setCookie =
    (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const cookie = parseSetCookie(setCookie);

  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { code: String(res.status), info: "non-json response" };
  }

  const response: MiguRequestResponse = { status: res.status, body, cookie };
  if (res.status >= 400) throw new MiguRequestError(response);
  // 业务失败拦截：带 code 的接口（bmw/listen 系）非成功码且 info 非空时抛错；
  // 老接口（resourceinfo.do）用 success 布尔、空结果类响应交给模块层自行判断
  if (typeof body.code === "string" && body.code !== SUCCESS_CODE && body.info) {
    throw new MiguRequestError(response);
  }

  return response;
};

/**
 * 发起一次咪咕 GET 请求
 * @param path - 接口路径（含 query）或完整 URL
 * @param options - 请求选项
 * @returns 归一化响应
 */
export const createMiguRequest = (
  path: string,
  options: MiguRequestOptions = {},
): Promise<MiguRequestResponse> => request(path, options, "GET");

/**
 * 发起一次咪咕 POST 请求（JSON body 或 headers.form 的表单串）
 * @param path - 接口路径或完整 URL
 * @param options - 请求选项
 * @returns 归一化响应
 */
export const createMiguPost = (
  path: string,
  options: MiguRequestOptions = {},
): Promise<MiguRequestResponse> => request(path, options, "POST");

/** resourceinfo.do 在 app.u.nf 域，请求层默认拼 app.c.nf，这里给歌词桥用完整 URL */
export const resourceInfoUrl = (resourceId: string): string =>
  `https://app.u.nf.migu.cn${ENDPOINT.resourceInfo}?resourceType=2&resourceId=${encodeURIComponent(resourceId)}`;

/**
 * 改档后的 CDN 直链可达性探测：拉前 64 字节即取消，200/206 均视为可用
 * @param url - 咪咕音频 CDN 直链
 * @returns 是否可用
 */
export const probeMiguUrl = async (url: string): Promise<boolean> => {
  try {
    const res = await net.fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-63" },
      signal: AbortSignal.timeout(5000),
    });
    // 只探测不消费：取消 body 立即释放连接
    await res.body?.cancel();
    return res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
};
