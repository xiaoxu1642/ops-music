/**
 * 音源 API 统一 IPC
 *
 * 只注册两个通道：
 * - apis:call(platform, name, params)   调用对应平台的任意接口
 * - apis:clearSession(platform)         清空某平台登录态
 */

import { ipcMain } from "electron";
import { callNetease, clearNeteaseCookies, mergeNeteaseCookies } from "@main/apis/netease";
import { NeteaseRequestError } from "@main/apis/netease/core/request";
import { cookieToJson } from "@main/apis/netease/core/cookie";
import { openNeteaseLoginWindow } from "@main/window/login";
import { coreLog } from "@main/utils/logger";
import type { ApiPlatform } from "@shared/types/apis";

/** 各平台的调用器：统一返回 `{ status?, body?, data? }` 由前端按需取 */
const dispatch = async (
  platform: ApiPlatform,
  name: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  switch (platform) {
    case "netease": {
      const res = await callNetease(name, params);
      return { status: res.status, body: res.body };
    }
    default:
      throw new Error(`unknown platform: ${platform}`);
  }
};

export const registerApisIpc = (): void => {
  ipcMain.handle(
    "apis:call",
    async (_evt, platform: ApiPlatform, name: string, params?: Record<string, unknown>) => {
      try {
        const result = await dispatch(platform, name, params ?? {});
        return { ok: true, ...result };
      } catch (err) {
        coreLog.warn(`[apis] ${platform}.${name} failed:`, err);
        if (err instanceof NeteaseRequestError) {
          return {
            ok: false,
            error: err.message,
            status: err.response.status,
            body: err.response.body,
          };
        }
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  ipcMain.handle("apis:clearSession", (_evt, platform: ApiPlatform) => {
    if (platform === "netease") clearNeteaseCookies();
  });

  // 打开官方网页登录，成功后把 cookies 合并写入 session
  ipcMain.handle("apis:openLoginWeb", async (_evt, platform: ApiPlatform) => {
    try {
      if (platform === "netease") {
        const cookies = await openNeteaseLoginWindow();
        if (!cookies) return { ok: false, error: "canceled" };
        mergeNeteaseCookies(cookies);
        return { ok: true };
      }
      return { ok: false, error: "unsupported platform" };
    } catch (err) {
      coreLog.warn(`[apis] openLoginWeb ${platform} failed:`, err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 手动写入 cookie 登录
  ipcMain.handle("apis:setCookie", (_evt, platform: ApiPlatform, raw: string) => {
    const parsed = cookieToJson(raw);
    if (platform === "netease") {
      if (!parsed.MUSIC_U) return { ok: false, error: "missing MUSIC_U" };
      mergeNeteaseCookies(parsed);
      return { ok: true };
    }
    return { ok: false, error: "unsupported platform" };
  });
};
