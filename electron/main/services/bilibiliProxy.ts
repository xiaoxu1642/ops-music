/**
 * B 站音频流本地代理
 *
 * 存在的唯一原因：`ffmpeg_audio` 的 HTTP 源（vendor 里 http.rs）把请求头写死成
 * `Lavf/62.12.101` + `Range`，没有任何注入自定义头的入口，而 B 站 CDN 对不带
 * `Referer` 的取流一律 403。因此取流必须在这里转发：本进程带着 Referer/UA/Cookie
 * 去拉，播放引擎只需要访问 `http://127.0.0.1:<port>/bili-stream/<token>`。
 *
 * 安全不变量：本代理只接受本进程签发的 token，绝不接受调用方传入的目标地址。
 * 即便本机其他进程能访问 127.0.0.1，也无法把它当开放代理或内网扫描器使用。
 */

import { randomBytes } from "node:crypto";
import http from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { BilibiliStream } from "../apis/bilibili/core/types";

/** 代理路由前缀，播放地址形如 `/bili-stream/<token>` */
const ROUTE_PREFIX = "/bili-stream/";

/** 注册表容量上限：播放器会预载下一首，长会话下不能让表无限增长，按插入顺序淘汰 */
const MAX_STREAM_TARGETS = 32;

/** 需要透传给客户端的响应头，Range 播放只认这几个 */
const PASSTHROUGH_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
] as const;

interface StreamTarget {
  /** 站方裸地址 */
  url: string;
  /** 取流必需请求头（Referer / User-Agent / 可选 Cookie） */
  headers: Record<string, string>;
}

const targets = new Map<string, StreamTarget>();

let server: http.Server | null = null;
let listening: Promise<number> | null = null;

/**
 * 登记一条取流目标，返回不可猜测的 token
 * @param target - 裸地址与取流请求头
 * @returns token
 */
export const registerStreamTarget = (target: StreamTarget): string => {
  const token = randomBytes(16).toString("hex");
  targets.set(token, target);
  while (targets.size > MAX_STREAM_TARGETS) {
    const oldest = targets.keys().next().value;
    if (oldest === undefined) break;
    targets.delete(oldest);
  }
  return token;
};

/**
 * 解析 token；不存在或已被淘汰时返回 null
 * @param token - 代理地址里的 token
 * @returns 取流目标
 */
export const resolveStreamTarget = (token: string): StreamTarget | null =>
  targets.get(token) ?? null;

/** 清空注册表：退出清理与测试用，正常播放期间不需要调用 */
export const clearStreamTargets = (): void => {
  targets.clear();
};

const handleRequest = async (
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> => {
  if (req.method !== "GET" || !req.url?.startsWith(ROUTE_PREFIX)) {
    res.writeHead(404).end();
    return;
  }

  const token = req.url.slice(ROUTE_PREFIX.length).split("?")[0] ?? "";
  // 只认自己签发的 token：这里拿不到任何调用方提供的 URL，代理不会变成任意转发器
  const target = resolveStreamTarget(token);
  if (!target) {
    res.writeHead(404).end();
    return;
  }

  const headers: Record<string, string> = { ...target.headers };
  if (typeof req.headers.range === "string") headers.Range = req.headers.range;

  // 播放器 seek / 停播 / 窗口销毁都会断开连接，必须同步掐掉上游下载，否则 CDN 连接会漏
  const abort = new AbortController();
  req.on("close", () => abort.abort());

  try {
    const upstream = await fetch(target.url, {
      headers,
      redirect: "follow",
      signal: abort.signal,
    });

    const passthrough: Record<string, string> = {};
    for (const key of PASSTHROUGH_HEADERS) {
      const value = upstream.headers.get(key);
      if (value) passthrough[key] = value;
    }
    res.writeHead(upstream.status, passthrough);

    if (!upstream.body) {
      res.end();
      return;
    }
    await pipeline(Readable.fromWeb(upstream.body as never), res);
  } catch (err) {
    if (abort.signal.aborted) {
      res.destroy();
      return;
    }
    // 日志按需加载：本模块要能在 node:test 下直接跑，顶层引 logger 会把 electron 拖进测试进程
    const { bilibiliLog } = await import("../utils/logger");
    bilibiliLog.warn("[proxy] 取流失败", err);
    if (!res.headersSent) res.writeHead(502);
    res.end();
  }
};

/**
 * 惰性启动代理：只监听 127.0.0.1，端口交给系统分配
 * @returns 本地基准地址（不含路由）
 */
export const ensureBilibiliProxy = async (): Promise<string> => {
  if (!server) {
    const created = http.createServer((req, res) => {
      void handleRequest(req, res);
    });
    server = created;
    listening = new Promise<number>((resolve, reject) => {
      created.once("error", reject);
      created.listen(0, "127.0.0.1", () => {
        const address = created.address();
        if (typeof address === "object" && address) resolve(address.port);
        else reject(new Error("bilibili 代理未拿到监听端口"));
      });
    });
  }
  const port = await listening;
  return `http://127.0.0.1:${port}`;
};

/** 关闭代理并清空注册表；应用退出时调用 */
export const stopBilibiliProxy = (): void => {
  // keep-alive 连接不清掉时 close() 会一直挂着，退出流程会被它拖住
  server?.closeAllConnections();
  server?.close();
  server = null;
  listening = null;
  clearStreamTargets();
};

/**
 * 为一条取流结果签发本地代理地址
 * @param stream - song_url 选出的裸流
 * @returns 播放器可直接加载的本地地址
 */
export const createProxiedStreamUrl = async (stream: BilibiliStream): Promise<string> => {
  const base = await ensureBilibiliProxy();
  const token = registerStreamTarget({ url: stream.url, headers: stream.headers });
  return `${base}${ROUTE_PREFIX}${token}`;
};
