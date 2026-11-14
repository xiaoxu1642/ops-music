/**
 * 咪咕账号状态
 *
 * 与网易云 / B 站账号相互独立：登录走手机号短信验证码（login_send_code → login_verify
 * → token_validate 换 pacmtoken），登录态经主进程 check_token 校验，
 * 登出只清咪咕自己的会话（apis:clearSession 按平台隔离）。
 */

import { miguCall } from "@/apis/migu";

/** 咪咕登录身份（站方校验接口只回登录态，不回资料，展示用手机号打码） */
export interface MiguProfile {
  /** 手机号打码（139****1234），由登录流程记录 */
  phoneMask: string;
}

/** 手机号打码 */
const maskPhone = (phone: string): string =>
  phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : phone;

export const useMiguAccountStore = defineStore(
  "miguAccount",
  () => {
    /** 已登录的咪咕身份，未登录为 null */
    const profile = ref<MiguProfile | null>(null);
    /** 是否已登录 */
    const isLoggedIn = computed(() => profile.value !== null);

    /**
     * 校验当前登录态（check_token 未登录时主进程直接报错）
     * @returns 是否已登录；网络失败保留已缓存身份
     */
    const fetchStatus = async (): Promise<boolean> => {
      try {
        const body = await miguCall<Record<string, unknown>>("check_token");
        const ok =
          body?.returnCode === "SUCCESS" ||
          body?.status === 2000 ||
          body?.success === true ||
          body?.code === "000000";
        // 校验失败说明 pacmtoken 已失效，清掉本地身份
        if (!ok) profile.value = null;
      } catch (err) {
        // 主进程「未登录」错误归为未登录；其余（网络等）保留已缓存身份
        if (String(err).includes("未登录")) profile.value = null;
        console.warn("[migu-account] fetch status failed:", err);
      }
      return profile.value !== null;
    };

    /**
     * 发送短信验证码
     * @param phone - 手机号
     */
    const sendCode = async (phone: string): Promise<void> => {
      await miguCall("login_send_code", { phone });
    };

    /**
     * 验证码登录：login_verify 拿 token → token_validate 换 pacmtoken（主进程写回会话）
     * @param phone - 手机号
     * @param code - 短信验证码
     * @returns 是否登录成功
     */
    const verify = async (phone: string, code: string): Promise<boolean> => {
      const body = await miguCall<{ result?: { token?: string } }>("login_verify", {
        phone,
        code,
      });
      const token = body?.result?.token;
      if (!token) return false;
      await miguCall("token_validate", { token });
      profile.value = { phoneMask: maskPhone(phone) };
      return true;
    };

    /** 登出：只清咪咕会话与身份，不影响其他平台 */
    const logout = async (): Promise<void> => {
      try {
        await window.api.apis.clearSession("migu");
      } catch (err) {
        console.warn("[migu-account] clear session failed:", err);
      }
      profile.value = null;
    };

    return { profile, isLoggedIn, fetchStatus, sendCode, verify, logout };
  },
  {
    persist: {
      storage: localStorage,
      pick: ["profile"],
    },
  },
);
