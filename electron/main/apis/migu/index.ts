/**
 * 咪咕 API 主进程服务
 *
 * 结构与 bilibili 服务层对齐，没有任何加解密：咪咕只要正确的
 * channel/Referer/UA 三件套（见 core/config.ts、core/request.ts）。
 *
 * 统一入口 `callMigu(name, params)`：
 *   1) 从 sessions 表加载 pacmtoken 注入（内存缓存，不重复读 SQLite）
 *   2) 走一层内存响应缓存
 *   3) 路由到 modules/<name>
 *   4) 登录态接口的响应 set-cookie（pacmtoken 轮换）写回 sessions
 */

import {
  clearSessionCookies,
  getSessionCookies,
  saveSessionCookies,
} from "@main/database/sessions";
import { buildCacheKey, cacheClear, cacheGet, cacheSet } from "./core/cache";
import { createMiguPost, createMiguRequest } from "./core/request";
import { modules } from "./modules";
import type { MiguHttp } from "./core/types";

/** 会变更登录态的接口：响应里带 set-cookie（pacmtoken 轮换）要写回 SQLite */
const SESSION_MUTATING: ReadonlySet<string> = new Set(["token_validate"]);

/**
 * 不缓存的接口：
 * - song_url 的 CDN 直链有时效
 * - token_validate 与登录系是登录态事务
 */
const NON_CACHEABLE: ReadonlySet<string> = new Set([
  "song_url",
  "token_validate",
  "login_send_code",
  "login_verify",
]);

const http: MiguHttp = { get: createMiguRequest, post: createMiguPost };

let sessionCache: Record<string, string> | null = null;

const loadSession = (): Record<string, string> => {
  if (!sessionCache) sessionCache = getSessionCookies("migu");
  return sessionCache;
};

const persistSession = (cookies: Record<string, string>): void => {
  sessionCache = cookies;
  saveSessionCookies("migu", cookies);
  cacheClear();
};

export const mergeMiguCookies = (patch: Record<string, string>): void => {
  // pacmtoken 是唯一关键登录凭证，只收窄到它，避免整包 cookie 落库
  const sessionPatch = patch.pacmtoken ? { pacmtoken: patch.pacmtoken } : patch;
  persistSession({ ...loadSession(), ...sessionPatch });
};

export const clearMiguCookies = (): void => {
  sessionCache = {};
  clearSessionCookies("migu");
  cacheClear();
};

/** 当前是否持有 pacmtoken 登录态 */
export const hasMiguSession = (): boolean => Boolean(loadSession().pacmtoken);

/**
 * 调用任意咪咕接口
 * @param name - 见 modules/index.ts 中的 key
 * @param params - 业务参数；pacmtoken 自动注入，无需调用方传
 * @returns `{ status, body }`，与 netease / bilibili 的分发信封一致
 */
export const callMigu = async (
  name: string,
  params: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> => {
  const fn = Object.hasOwn(modules, name) ? modules[name] : undefined;
  if (!fn) throw new Error(`unknown migu api: ${name}`);

  const cacheable = !NON_CACHEABLE.has(name);
  const cacheKey = cacheable ? buildCacheKey(name, params) : "";
  if (cacheable) {
    const hit = cacheGet(cacheKey);
    if (hit) return hit;
  }

  // 登录态自动注入：游客调用时 sessions 表为空，请求层自然不带 Cookie 头
  const query = { ...params, cookie: loadSession() };

  const res = await fn(query, http);

  if (SESSION_MUTATING.has(name)) {
    const patch = res.cookie;
    if (Object.keys(patch).length) persistSession({ ...loadSession(), ...patch });
  }

  const value = { status: res.status, body: res.body };
  if (cacheable) cacheSet(cacheKey, value);
  return value;
};
