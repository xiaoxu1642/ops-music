/**
 * B 站 API 主进程服务
 *
 * 结构与 netease 服务层对齐，但没有任何加解密：B 站只要 WBI 签名 + 正确的
 * Referer/UA/Cookie 三件套（见 core/credential.ts、core/request.ts）。
 *
 * 统一入口 `callBilibili(name, params)`：
 *   1) 从 sessions 表加载 cookies 注入（内存缓存，不重复读 SQLite）
 *   2) 走一层内存响应缓存
 *   3) 路由到 modules/<name>
 *   4) 只在会变更会话的接口上把响应 set-cookie 写回 sessions
 */

import {
  clearSessionCookies,
  getSessionCookies,
  saveSessionCookies,
} from "@main/database/sessions";
import { buildCacheKey, cacheClear, cacheGet, cacheSet } from "./core/cache";
import { pickSessionCookies } from "./core/credential";
import { createBilibiliRequest, requestWbi, resetWbiKeys } from "./core/request";
import { modules } from "./modules";
import type { BilibiliHttp } from "./core/types";

/** 会变更登录态/设备指纹的接口：响应里带 set-cookie 才值得写回 SQLite */
const SESSION_MUTATING: ReadonlySet<string> = new Set(["nav"]);

/**
 * 不缓存的接口：
 * - song_url 站方地址带签名且有有效期
 * - video_detail 已由 `loadView` 按 bvid 缓存 24h，再套一层没意义
 * - nav 是实时登录态
 * - lyric 由上层歌词缓存（lyric_cache）负责落库
 */
const NON_CACHEABLE: ReadonlySet<string> = new Set(["song_url", "video_detail", "nav", "lyric"]);

const http: BilibiliHttp = { get: createBilibiliRequest, wbi: requestWbi };

let sessionCache: Record<string, string> | null = null;

const loadSession = (): Record<string, string> => {
  if (!sessionCache) sessionCache = getSessionCookies("bilibili");
  return sessionCache;
};

const persistSession = (cookies: Record<string, string>): void => {
  sessionCache = cookies;
  saveSessionCookies("bilibili", cookies);
  cacheClear();
};

export const mergeBilibiliCookies = (patch: Record<string, string>): void => {
  persistSession({ ...loadSession(), ...pickSessionCookies(patch) });
};

export const clearBilibiliCookies = (): void => {
  sessionCache = {};
  clearSessionCookies("bilibili");
  resetWbiKeys();
  cacheClear();
};

/**
 * 调用任意 B 站接口
 * @param name - 见 modules/index.ts 中的 key
 * @param params - 业务参数；cookie 自动注入，无需调用方传
 * @returns `{ status, body }`，与 netease 的分发信封一致
 */
export const callBilibili = async (
  name: string,
  params: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> => {
  const fn = Object.hasOwn(modules, name) ? modules[name] : undefined;
  if (!fn) throw new Error(`unknown bilibili api: ${name}`);

  const cacheable = !NON_CACHEABLE.has(name);
  const cacheKey = cacheable ? buildCacheKey(name, params) : "";
  if (cacheable) {
    const hit = cacheGet(cacheKey);
    if (hit) return hit;
  }

  // 调用方不传 cookie，一律用会话表里的登录态（未登录时由请求层回落占位 buvid3）
  const query = { ...params, cookie: loadSession() };

  const res = await fn(query, http);

  if (SESSION_MUTATING.has(name)) {
    const patch = pickSessionCookies(res.cookie);
    if (Object.keys(patch).length) persistSession({ ...loadSession(), ...patch });
  }

  const value = { status: res.status, body: res.body };
  if (cacheable) cacheSet(cacheKey, value);
  return value;
};
