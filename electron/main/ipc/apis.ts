/**
 * 音源 API 统一 IPC
 *
 * 只注册两个通道：
 * - apis:call(platform, name, params)   调用对应平台的任意接口
 * - apis:clearSession(platform)         清空某平台登录态
 */

import { ipcMain } from "electron";
import { callBilibili, clearBilibiliCookies, mergeBilibiliCookies } from "@main/apis/bilibili";
import {
  hasBilibiliSession,
  normalizeBilibiliCookie,
  pickSessionCookies,
} from "@main/apis/bilibili/core/credential";
import { BilibiliRequestError } from "@main/apis/bilibili/core/request";
import { callNetease, clearNeteaseCookies, mergeNeteaseCookies } from "@main/apis/netease";
import { NeteaseRequestError } from "@main/apis/netease/core/request";
import { cookieToJson } from "@main/apis/netease/core/cookie";
import { openBilibiliLoginWindow, openNeteaseLoginWindow } from "@main/window/login";
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
    case "bilibili": {
      const res = await callBilibili(name, params);
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
        if (err instanceof NeteaseRequestError || err instanceof BilibiliRequestError) {
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
    switch (platform) {
      case "netease":
        clearNeteaseCookies();
        break;
      case "bilibili":
        clearBilibiliCookies();
        break;
    }
  });

  // 打开官方网页登录，成功后把 cookies 合并写入 session
  ipcMain.handle("apis:openLoginWeb", async (_evt, platform: ApiPlatform) => {
    try {
      switch (platform) {
        case "netease": {
          const cookies = await openNeteaseLoginWindow();
          if (!cookies) return { ok: false, error: "canceled" };
          mergeNeteaseCookies(cookies);
          return { ok: true };
        }
        case "bilibili": {
          const cookies = await openBilibiliLoginWindow();
          if (!cookies) return { ok: false, error: "canceled" };
          mergeBilibiliCookies(cookies);
          return { ok: true };
        }
        default:
          // 类型上已穷尽，这里只挡旧渲染进程传来的非法平台值
          return { ok: false, error: `unsupported platform: ${platform}` };
      }
    } catch (err) {
      coreLog.warn(`[apis] openLoginWeb ${platform} failed:`, err);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // 手动写入 cookie 登录
  ipcMain.handle("apis:setCookie", (_evt, platform: ApiPlatform, raw: string) => {
    switch (platform) {
      case "netease": {
        const parsed = cookieToJson(raw);
        if (!parsed.MUSIC_U) return { ok: false, error: "missing MUSIC_U" };
        mergeNeteaseCookies(parsed);
        return { ok: true };
      }
      case "bilibili": {
        // 用户常把整行 `Cookie: ...` 粘进来，先剥掉头再解析
        const parsed = cookieToJson(normalizeBilibiliCookie(raw));
        if (!hasBilibiliSession(parsed)) return { ok: false, error: "missing SESSDATA" };
        mergeBilibiliCookies(pickSessionCookies(parsed));
        return { ok: true };
      }
      default:
        return { ok: false, error: `unsupported platform: ${platform}` };
    }
  });
};
