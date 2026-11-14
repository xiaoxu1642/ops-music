/**
 * B 站凭证：WBI 签名与登录 Cookie 判定
 *
 * WBI 算法按站方规范实现（打乱表取 img_key+sub_key 前 32 位得 mixin_key，
 * 参数按 key 升序、过滤值里的 `!'()*`、URL 编码后拼 mixin_key 做 md5 得 w_rid），
 * 与 Otter Music 的实现逐行对齐，只把 node-forge 换成 node:crypto（同摘要、零新依赖）。
 */

import { createHash } from "node:crypto";
import type { BilibiliNavResponse } from "./types";

/** mixin_key 字符打乱表（站方 Web 端固定表） */
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

/** 站方签名前会从参数值里剔除这些字符，否则 w_rid 校验不过 */
const CHR_FILTER = /[!'()*]/g;

/**
 * 对 img_key + sub_key 做字符打乱，取前 32 位作为签名密钥
 * @param orig - img_key 与 sub_key 的拼接串
 * @returns mixin_key
 */
export const getMixinKey = (orig: string): string => {
  let temp = "";
  for (const n of MIXIN_KEY_ENC_TAB) {
    temp += orig[n];
  }
  return temp.slice(0, 32);
};

/**
 * 从 nav 响应里取出 WBI 密钥（密钥就是图片文件名）
 * @param response - nav 接口响应
 * @returns imgKey / subKey，缺任一返回 null
 */
export const extractWbiKeys = (
  response: BilibiliNavResponse,
): { imgKey: string; subKey: string } | null => {
  const wbi = response.data?.wbi_img;
  if (!wbi?.img_url || !wbi?.sub_url) return null;
  const imgKey = wbi.img_url.split("/").pop()?.split(".")[0] ?? "";
  const subKey = wbi.sub_url.split("/").pop()?.split(".")[0] ?? "";
  if (!imgKey || !subKey) return null;
  return { imgKey, subKey };
};

/**
 * 生成带签名的 query string（含 wts 与末位 w_rid）
 * @param params - 业务参数，不含 wts / w_rid
 * @param imgKey - nav 下发的 img_key
 * @param subKey - nav 下发的 sub_key
 * @param wts - 时间戳秒，仅测试需要固定值时传入
 * @returns 可直接拼到 `?` 后的 query
 */
export const signWbiParams = (
  params: Record<string, string | number>,
  imgKey: string,
  subKey: string,
  wts: number = Math.round(Date.now() / 1000),
): string => {
  const mixinKey = getMixinKey(imgKey + subKey);
  const signed: Record<string, string | number> = { ...params, wts };

  const query = Object.keys(signed)
    .sort()
    .map((key) => {
      const value = String(signed[key]).replace(CHR_FILTER, "");
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join("&");

  const wrid = createHash("md5").update(`${query}${mixinKey}`, "utf8").digest("hex");
  return `${query}&w_rid=${wrid}`;
};

/**
 * API 实际需要的 cookie 键：
 * SESSDATA 是登录态，DedeUserID/bili_jct 供后续点赞收藏（csrf），
 * buvid3/buvid4 是风控设备指纹，缺失会被 -352 拦截。
 */
export const SESSION_COOKIE_KEYS = ["SESSDATA", "DedeUserID", "bili_jct", "buvid3", "buvid4"];

/**
 * 归一化用户粘贴的 cookie：去掉首尾空白与可能带上的 `Cookie:` 头名前缀
 * @param cookie - 原始 cookie 串
 * @returns 纯 `k=v; k=v` 串
 */
export const normalizeBilibiliCookie = (cookie: string): string =>
  cookie.trim().replace(/^Cookie:\s*/i, "");

/**
 * 判定 cookie 集合是否构成可用的 B 站登录态
 * @param cookies - 键值形式的 cookie
 * @returns 是否已登录
 */
export const hasBilibiliSession = (cookies: Record<string, string>): boolean =>
  Boolean(cookies.SESSDATA);

/**
 * 只保留 API 真正需要的 cookie 键
 * @param cookies - 任意 cookie 集合（登录窗口抓到的或站方 set-cookie 下发的）
 * @returns 过滤后的键值对
 */
export const pickSessionCookies = (cookies: Record<string, string>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const key of SESSION_COOKIE_KEYS) {
    if (cookies[key]) out[key] = cookies[key];
  }
  return out;
};
