/**
 * B 站账号状态
 *
 * 与网易云账号（stores/user）完全独立：身份经主进程 dispatcher 的 nav 接口校验，
 * 登出只清 B 站自己的会话（apis:clearSession 按平台隔离），两平台互不影响。
 */

import { bilibiliCall } from "@/apis/bilibili";
import type { BilibiliNavBody, BilibiliProfile } from "@/types/bilibili";

export const useBilibiliAccountStore = defineStore(
  "bilibiliAccount",
  () => {
    /** 已登录的 B 站身份，未登录为 null */
    const profile = ref<BilibiliProfile | null>(null);
    /** 是否已登录 */
    const isLoggedIn = computed(() => profile.value !== null);

    /**
     * 校验当前登录态并同步身份
     * @returns 是否已登录；网络失败保留已缓存身份（离线可用）
     */
    const fetchStatus = async (): Promise<boolean> => {
      try {
        const body = await bilibiliCall<BilibiliNavBody>("nav");
        profile.value =
          body?.isLogin && body.uname
            ? { mid: body.mid, uname: body.uname, face: body.face }
            : null;
      } catch (err) {
        console.warn("[bilibili-account] fetch status failed:", err);
      }
      return profile.value !== null;
    };

    /** 登出：只清 B 站会话与身份，不影响网易云 */
    const logout = async (): Promise<void> => {
      try {
        await window.api.apis.clearSession("bilibili");
      } catch (err) {
        console.warn("[bilibili-account] clear session failed:", err);
      }
      profile.value = null;
    };

    return { profile, isLoggedIn, fetchStatus, logout };
  },
  {
    persist: {
      storage: localStorage,
      pick: ["profile"],
    },
  },
);
