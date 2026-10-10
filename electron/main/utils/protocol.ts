import path from "node:path";
import { net, protocol, session } from "electron";
import { USER_AGENT } from "@main/apis/bilibili/core/config";
import { getAppCacheDir } from "./config";

/** cache:// 协议方案名 */
const SCHEME = "cache";
export const MAIN_PARTITION = "persist:main";

/**
 * 注册 cache:// 协议方案
 * 必须在 app.whenReady 之前调用
 */
export const registerCacheScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        corsEnabled: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: true,
        stream: true,
      },
    },
  ]);
};

/** cache:// 协议的处理函数 */
const cacheHandler = (request: Request): Response | Promise<Response> => {
  // 剥离查询串：?v=xxx 仅用于封面替换后的缓存失效，不参与路径解析
  const withoutQuery = request.url.split("?")[0];
  const relativePath = decodeURIComponent(withoutQuery.slice(`${SCHEME}://`.length));
  const root = getAppCacheDir();
  const resolved = path.resolve(root, relativePath);
  // 防 cache://../ 逃逸：解析后的绝对路径必须仍在缓存根目录内
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    return new Response(null, { status: 403 });
  }
  return net.fetch(`file://${resolved.replace(/\\/g, "/")}`);
};

/**
 * 注册 cache:// 协议处理
 * 在 app.whenReady 之后调用
 * 格式：cache://covers/xxx.jpg、cache://artists/xxx.jpg
 */
export const handleCacheProtocol = (): void => {
  protocol.handle(SCHEME, cacheHandler);
};

/**
 * 在指定 partition 的 session 上注册 cache:// 协议处理
 */
export const handleCacheProtocolOnPartition = (partition: string): void => {
  session.fromPartition(partition).protocol.handle(SCHEME, cacheHandler);
};

/** B 站图片 CDN 域名：搜索封面、视频封面与 UP 主头像都在这些域下发 */
const BILIBILI_IMAGE_HOSTS = ["i0.hdslb.com", "i1.hdslb.com", "i2.hdslb.com"] as const;

/** 图片域只校验来源站点，指向站点根即可 */
const BILIBILI_IMAGE_REFERER = "https://www.bilibili.com/";

/**
 * 为 B 站图片域名注入 Referer 与桌面 Chrome UA
 *
 * 渲染层直接以 <img> 拉封面，图片请求走 webRequest 拦截；
 * 只命中图片 CDN 域名，音频取流走本地代理（bilibiliProxy），不在此列
 * @param partition - 生效的 session 分区
 */
export const handleBilibiliImageHeaders = (partition: string): void => {
  session
    .fromPartition(partition)
    .webRequest.onBeforeSendHeaders(
      { urls: BILIBILI_IMAGE_HOSTS.map((host) => `*://${host}/*`) },
      (details, callback) => {
        callback({
          requestHeaders: {
            ...details.requestHeaders,
            Referer: BILIBILI_IMAGE_REFERER,
            "User-Agent": USER_AGENT,
          },
        });
      },
    );
};

/**
 * 将 app-cache 下的磁盘路径转为 cache:// 协议 URL
 * @param filePath 磁盘路径（如 C:/.../app-cache/covers/xxx.jpg）
 * @returns cache://covers/xxx.jpg 或 undefined
 */
export const toCacheUrl = (filePath: string | undefined | null): string | undefined => {
  if (!filePath) return undefined;
  const relative = path.relative(getAppCacheDir(), filePath);
  // 路径不在缓存根目录下时拒绝生成 URL，避免产出可逃逸的 cache:// 链接
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  return `${SCHEME}://${relative.replace(/\\/g, "/")}`;
};
