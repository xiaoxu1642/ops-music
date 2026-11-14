import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@shared/types/errors";
vi.mock("@/composables/useToast", () => ({ toast: {} }));
vi.mock("@/composables/useDialog", () => ({ dialog: {} }));
vi.mock("@/i18n", () => ({ default: {} }));
import { isNoSourceSkippableError, isSkippableError } from "./errors";

describe("播放失败跳曲范围", () => {
  it("网络故障停留当前歌曲，单曲损坏和无版权允许跳过", () => {
    expect(isSkippableError(ErrorCode.NETWORK_ERROR)).toBe(false);
    expect(isSkippableError(ErrorCode.NETWORK_TIMEOUT)).toBe(false);
    expect(isSkippableError(ErrorCode.FILE_DECODE_ERROR)).toBe(true);
    expect(isSkippableError(ErrorCode.NETEASE_UNAVAILABLE)).toBe(true);
  });

  it("登录失效与代理配置问题不应连环跳曲", () => {
    expect(isNoSourceSkippableError(ErrorCode.NETEASE_LOGIN_EXPIRED)).toBe(false);
    expect(isNoSourceSkippableError(ErrorCode.MIGU_LOGIN_EXPIRED)).toBe(false);
    expect(isNoSourceSkippableError(ErrorCode.BILIBILI_LOGIN_EXPIRED)).toBe(false);
    expect(isNoSourceSkippableError(ErrorCode.BILIBILI_RISK_CONTROL)).toBe(false);
    expect(isNoSourceSkippableError(ErrorCode.BILIBILI_PROXY_MISSING)).toBe(false);
  });
});
