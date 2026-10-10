/**
 * Bilibili API 渲染端
 *
 * 与 `@/apis/netease` 同约定：经主进程 dispatcher 调用，成功返回 body，失败抛 Error
 */

import type { ApiCallResponse } from "@shared/types/apis";

/**
 * 调用任意 B 站接口
 * @param name - 接口名（见主进程 modules/index.ts）
 * @param params - 接口参数
 * @returns 接口响应体
 */
export const bilibiliCall = async <T = unknown>(
  name: string,
  params?: Record<string, unknown>,
): Promise<T> => {
  const res: ApiCallResponse = await window.api.apis.call("bilibili", name, params);
  if (!res.ok) throw new Error(res.error);
  return res.body as T;
};
