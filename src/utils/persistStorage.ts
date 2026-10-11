/**
 * pinia 持久化用的节流 localStorage 适配器
 *
 * status.position 在播放期间以 5Hz 变化，持久化插件对每次订阅都无条件同步序列化写盘，
 * 每次都占用渲染主线程。这里把写盘合并成最多 1Hz 一次，并在页面隐藏或卸载时立即冲刷，
 * 避免丢失最后一段进度（断点续播依赖 position）。
 */

/** 合并落盘窗口（毫秒） */
const PERSIST_FLUSH_MS = 1000;

/** 待落盘内容，key 为持久化键名 */
const pending = new Map<string, string>();

let flushTimer: number | null = null;

/** 立即把待落盘内容写回 localStorage */
export const flushPendingPersist = (): void => {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pending.size === 0) return;
  for (const [key, value] of pending) localStorage.setItem(key, value);
  pending.clear();
};

/** 安排一次合并落盘，已有计时器时不重复安排 */
const scheduleFlush = (): void => {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    flushPendingPersist();
  }, PERSIST_FLUSH_MS);
};

// 隐藏到托盘与退出前都必须冲刷，否则最后 1 秒进度丢失
window.addEventListener("pagehide", flushPendingPersist);
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushPendingPersist();
});

/** 与 StorageLike 兼容的节流存储 */
export const throttledLocalStorage = {
  getItem: (key: string): string | null => pending.get(key) ?? localStorage.getItem(key),
  setItem: (key: string, value: string): void => {
    pending.set(key, value);
    scheduleFlush();
  },
};
