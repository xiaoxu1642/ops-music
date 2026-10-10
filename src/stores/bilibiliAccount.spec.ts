import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apis = vi.hoisted(() => ({
  call: vi.fn(),
  clearSession: vi.fn(),
}));

import { useBilibiliAccountStore } from "./bilibiliAccount";

describe("bilibili account store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    apis.call.mockReset();
    apis.clearSession.mockReset();
    Object.defineProperty(window, "api", {
      configurable: true,
      value: { apis },
    });
  });

  it("nav 返回已登录时记录身份，未登录时清空身份", async () => {
    apis.call.mockResolvedValueOnce({
      ok: true,
      body: { isLogin: true, mid: 42, uname: "测试用户", face: "https://i0.hdslb.com/face.jpg" },
    });
    const store = useBilibiliAccountStore();

    expect(await store.fetchStatus()).toBe(true);
    expect(apis.call).toHaveBeenCalledWith("bilibili", "nav", undefined);
    expect(store.profile).toEqual({
      mid: 42,
      uname: "测试用户",
      face: "https://i0.hdslb.com/face.jpg",
    });

    apis.call.mockResolvedValueOnce({
      ok: true,
      body: { isLogin: false, mid: 0, uname: "", face: "" },
    });
    expect(await store.fetchStatus()).toBe(false);
    expect(store.profile).toBeNull();
  });

  it("校验请求失败时保留已缓存身份", async () => {
    apis.call.mockResolvedValueOnce({ ok: false, error: "network error" });
    const store = useBilibiliAccountStore();
    store.profile = { mid: 1, uname: "缓存用户", face: "" };

    expect(await store.fetchStatus()).toBe(true);
    expect(store.profile).toEqual({ mid: 1, uname: "缓存用户", face: "" });
  });

  it("登出只清 B 站会话并重置身份", async () => {
    apis.clearSession.mockResolvedValue(undefined);
    const store = useBilibiliAccountStore();
    store.profile = { mid: 1, uname: "缓存用户", face: "" };

    await store.logout();

    expect(apis.clearSession).toHaveBeenCalledTimes(1);
    expect(apis.clearSession).toHaveBeenCalledWith("bilibili");
    expect(store.profile).toBeNull();
    expect(store.isLoggedIn).toBe(false);
  });
});
