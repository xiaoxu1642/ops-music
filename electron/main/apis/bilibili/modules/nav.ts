/**
 * B 站 nav（登录态校验 + WBI 密钥来源）
 *
 * 未登录时 nav 也会下发 buvid3/buvid4 设备指纹 cookie，
 * 因此它在本平台属于「会变更会话」的接口，响应 cookie 需要落库。
 */

import { ENDPOINT } from "../core/config";
import { normalizeResourceUrl } from "../core/url";
import type { BilibiliModule, BilibiliNavResponse } from "../core/types";

const nav: BilibiliModule = async (query, http) => {
  const res = await http.get(ENDPOINT.nav, {
    cookie: query.cookie as Record<string, string> | undefined,
  });
  const data = (res.body as BilibiliNavResponse).data;

  return {
    status: 200,
    body: {
      isLogin: Boolean(data?.isLogin),
      mid: data?.mid ?? 0,
      uname: data?.uname ?? "",
      face: normalizeResourceUrl(data?.face),
    },
    cookie: res.cookie,
  };
};

export default nav;
