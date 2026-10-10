import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";

import {
  clearStreamTargets,
  ensureBilibiliProxy,
  registerStreamTarget,
  resolveStreamTarget,
  stopBilibiliProxy,
} from "./bilibiliProxy";

interface StubUpstream {
  url: string;
  headers: http.IncomingHttpHeaders[];
  waitForClose: () => Promise<void>;
}

/** 用例结束时统一收尾，避免断言失败时漏掉 close 让测试进程挂住 */
const stubs: http.Server[] = [];

/**
 * 起一个本机假上游：只监听 127.0.0.1，记录收到的请求头
 * @param handler - 自定义响应逻辑，返回 true 表示已自行处理响应
 */
const startStub = async (
  handler?: (req: http.IncomingMessage, res: http.ServerResponse) => boolean,
): Promise<StubUpstream> => {
  const headers: http.IncomingHttpHeaders[] = [];
  const server = http.createServer((req, res) => {
    headers.push(req.headers);
    if (handler?.(req, res)) return;
    res.writeHead(200, { "content-type": "audio/mp4", "content-length": "4" });
    res.end("data");
  });
  const closed: Array<() => void> = [];
  server.on("request", (req) => {
    req.on("close", () => closed.forEach((fn) => fn()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  stubs.push(server);
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}/stream.m4s?sign=test`,
    headers,
    waitForClose: () =>
      new Promise<void>((resolve) => {
        closed.push(resolve);
      }),
  };
};

after(() => {
  stopBilibiliProxy();
  clearStreamTargets();
  for (const stub of stubs) {
    stub.closeAllConnections();
    stub.close();
  }
});

describe("B 站音频流代理", () => {
  it("只监听 127.0.0.1，未知 token 与非 GET 一律 404", async () => {
    const base = await ensureBilibiliProxy();
    assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);

    const unknown = await fetch(`${base}/bili-stream/deadbeef`);
    assert.equal(unknown.status, 404);

    const wrongPath = await fetch(`${base}/other`);
    assert.equal(wrongPath.status, 404);

    const posted = await fetch(`${base}/bili-stream/deadbeef`, { method: "POST" });
    assert.equal(posted.status, 404);
  });

  it("转发 Range 并注入 Referer 与 Cookie，回传 206 与 Content-Range", async () => {
    const stub = await startStub((req, res) => {
      if (req.headers.range !== "bytes=100-") return false;
      res.writeHead(206, {
        "content-type": "audio/mp4",
        "content-length": "2",
        "content-range": "bytes 100-101/2000",
        "accept-ranges": "bytes",
      });
      res.end("ok");
      return true;
    });
    const base = await ensureBilibiliProxy();
    const token = registerStreamTarget({
      url: stub.url,
      headers: {
        Referer: "https://www.bilibili.com/video/BV1xx",
        "User-Agent": "Mozilla/5.0 test",
        Cookie: "SESSDATA=abc",
      },
    });

    const res = await fetch(`${base}/bili-stream/${token}`, { headers: { Range: "bytes=100-" } });

    assert.equal(res.status, 206);
    assert.equal(res.headers.get("content-range"), "bytes 100-101/2000");
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal(await res.text(), "ok");

    const seen = stub.headers[0] ?? {};
    assert.equal(seen.range, "bytes=100-");
    assert.equal(seen.referer, "https://www.bilibili.com/video/BV1xx");
    assert.equal(seen.cookie, "SESSDATA=abc");
    assert.match(String(seen["user-agent"]), /Mozilla/);
  });

  it("上游 403 原样透传，不重试也不改写状态", async () => {
    const stub = await startStub((_req, res) => {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("forbidden");
      return true;
    });
    const base = await ensureBilibiliProxy();
    const token = registerStreamTarget({ url: stub.url, headers: {} });

    const res = await fetch(`${base}/bili-stream/${token}`);

    assert.equal(res.status, 403);
    assert.equal(await res.text(), "forbidden");
    assert.equal(stub.headers.length, 1);
  });

  it("客户端断开时中止上游请求", async () => {
    const stub = await startStub((_req, res) => {
      res.writeHead(200, { "content-type": "audio/mp4" });
      res.write("first");
      // 保持连接不结束，等待代理侧因客户端 abort 而断开
      return true;
    });
    const base = await ensureBilibiliProxy();
    const token = registerStreamTarget({ url: stub.url, headers: {} });

    const closed = stub.waitForClose();
    const controller = new AbortController();
    const res = await fetch(`${base}/bili-stream/${token}`, { signal: controller.signal });
    const reader = res.body?.getReader();
    await reader?.read();
    controller.abort();

    await closed;
  });

  it("注册表有界：超过容量后按插入顺序淘汰最早的 token", () => {
    clearStreamTargets();
    const tokens: string[] = [];
    for (let index = 0; index < 40; index += 1) {
      tokens.push(registerStreamTarget({ url: `http://127.0.0.1/x-${index}`, headers: {} }));
    }

    const first = tokens[0] ?? "";
    const last = tokens[tokens.length - 1] ?? "";
    assert.equal(resolveStreamTarget(first), null, "最早的 token 应已淘汰");
    assert.notEqual(resolveStreamTarget(last), null, "最新的 token 必须仍可用");
  });
});
