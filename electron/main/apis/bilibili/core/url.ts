/**
 * B 站资源地址归一化
 *
 * 站方返回的封面与流地址混合了 `//host/...`、`http://host/...` 三种写法，
 * Electron 主窗口是 https 页面，混合内容会被 WebView 拦掉，统一抬到 https。
 */

/**
 * 补全协议相对地址并强制 https
 * @param url - 站方原始地址，可能为空
 * @returns 归一化后的地址，入参为空时返回空串
 */
export const normalizeResourceUrl = (url: string | undefined): string => {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  return url.replace(/^http:\/\//i, "https://");
};
