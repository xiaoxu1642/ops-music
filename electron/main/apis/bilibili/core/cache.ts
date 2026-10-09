/**
 * B 站接口响应内存缓存
 *
 * 与 netease 的响应缓存同构（200 条上限 + TTL + 命中即续位），但**独立建表**：
 * 两个平台的 cookie 变更都要清各自的缓存，共用一份会让 B 站登录把网易云缓存一起冲掉。
 * 只缓存成功响应，失败不写缓存。
 */

import { createHash } from "node:crypto";
import { CACHE_MAX_ENTRIES, RESPONSE_CACHE_TTL_MS } from "./config";

interface CacheEntry {
  value: { status: number; body: unknown };
  expireAt: number;
}

const store = new Map<string, CacheEntry>();

/** 稳定 hash：JSON.stringify + md5 前 8 位 */
const hash = (params: unknown): string =>
  createHash("md5")
    .update(JSON.stringify(params ?? {}))
    .digest("hex")
    .slice(0, 8);

/** 构造缓存 key */
export const buildCacheKey = (name: string, params: unknown): string => `${name}|${hash(params)}`;

/**
 * 读缓存，过期即删除
 * @param key - 缓存 key
 * @returns 命中时返回缓存值
 */
export const cacheGet = (key: string): CacheEntry["value"] | undefined => {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (hit.expireAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  store.delete(key);
  store.set(key, hit);
  return hit.value;
};

/**
 * 写缓存，超容量时按插入顺序淘汰最早的一条
 * @param key - 缓存 key
 * @param value - 缓存值
 * @param ttl - 存活时长，默认 2 分钟
 */
export const cacheSet = (
  key: string,
  value: CacheEntry["value"],
  ttl: number = RESPONSE_CACHE_TTL_MS,
): void => {
  if (store.size >= CACHE_MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expireAt: Date.now() + ttl });
};

/** 清空全部（登录态变更时调用） */
export const cacheClear = (): void => {
  store.clear();
};
