/** 扫码登录状态 */
export type QrLoginState = "expired" | "waiting" | "scanned" | "success";

/** 扫码登录适配器：由音源侧提供创建与轮询实现 */
export interface QrLoginAdapter {
  create: () => Promise<{ key: string; content: string }>;
  check: (key: string) => Promise<{
    state: QrLoginState;
    nickname?: string;
    avatarUrl?: string;
  }>;
}
