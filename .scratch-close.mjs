import http from "node:http";

const log = [];
const upstream = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  let i = 0;
  const t = setInterval(() => {
    if (i++ > 3) {
      clearInterval(t);
      res.end();
      return;
    }
    res.write("chunk");
  }, 30);
  res.on("close", () => {
    log.push("upstream res close finished=" + res.writableFinished);
    clearInterval(t);
  });
});
const proxy = http.createServer((req, res) => {
  req.on("close", () => log.push("PROXY req close"));
  req.on("aborted", () => log.push("PROXY req aborted"));
  res.on("close", () => log.push("PROXY res close finished=" + res.writableFinished));
  const up = http.request({ port: upstream.address().port, method: "GET" }, (upRes) => {
    log.push("upstream responded");
    res.writeHead(upRes.statusCode ?? 502, {});
    upRes.pipe(res);
  });
  up.on("error", (e) => log.push("upstream error " + e.code));
  up.end();
});
await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
await new Promise((r) => proxy.listen(0, "127.0.0.1", r));

log.push("--- normal ---");
await new Promise((resolve) => {
  const req = http.request({ port: proxy.address().port, method: "GET", path: "/ok" }, (res) => {
    res.resume();
    res.on("end", () => setTimeout(resolve, 30));
  });
  req.end();
});
log.push("--- client destroyed mid-stream ---");
await new Promise((resolve) => {
  const req = http.request({ port: proxy.address().port, method: "GET", path: "/ok" }, (res) => {
    res.on("data", () => {
      if (log[log.length - 1] !== "destroyed") {
        log.push("destroyed");
        req.destroy();
      }
    });
    res.on("close", () => setTimeout(resolve, 40));
  });
  req.end();
});
console.log(log.join("\n"));
proxy.close();
upstream.close();
