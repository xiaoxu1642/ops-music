#!/usr/bin/env node

/**
 * Windows 开发启动脚本
 * 启动前设置代码页为 UTF-8
 */

import { spawn } from "child_process";

// 设置环境变量
const env: NodeJS.ProcessEnv = { ...process.env };

const startElectronVite = (): void => {
  console.log("正在启动 Electron Vite 开发服务器...");

  // 设置 Node.js 选项
  env.NODE_OPTIONS = "--max-old-space-size=4096";

  // 传递给 electron-vite 的参数
  const runArgs = ["dev"];
  // 前两个参数分别是 node 和此脚本的路径，丢弃它们
  const args = process.argv.slice(2);
  // 添加参数
  if (args.length > 0) {
    runArgs.push(...args);
  }

  const electronVite = spawn("electron-vite", runArgs, {
    stdio: "inherit",
    shell: true,
    env,
  });

  electronVite.on("close", (code) => {
    console.log(`\n开发服务器已停止 (退出码: ${code})`);
    process.exit(code ?? 0);
  });

  electronVite.on("error", (err) => {
    console.error("启动失败:", err.message);
    process.exit(1);
  });

  // 优雅退出处理
  process.on("SIGINT", () => {
    console.log("\n正在停止开发服务器...");
    electronVite.kill("SIGINT");
  });

  process.on("SIGTERM", () => {
    console.log("\n正在停止开发服务器...");
    electronVite.kill("SIGTERM");
  });
};

// 先执行 chcp 65001 设置代码页
const chcp = spawn("chcp", ["65001"], {
  stdio: "inherit",
  shell: true,
  env,
});

chcp.on("close", (code) => {
  if (code === 0) {
    console.log("代码页设置成功");
    startElectronVite();
  } else {
    console.warn("代码页设置失败，继续启动...");
    startElectronVite();
  }
});
