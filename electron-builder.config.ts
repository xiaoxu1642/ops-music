import type { Configuration } from "electron-builder";

const config: Configuration = {
  appId: "com.ops.music",
  productName: "Ops Music",
  copyright: "Copyright © Ops Music 2026",
  directories: { buildResources: "public" },
  afterPack: "./scripts/after-pack.ts",
  compression: "maximum",
  files: [
    "public/**",
    "out/**",
    "!**/.vscode/*",
    "!src/**",
    "!native/**",
    "!scripts/**",
    "!electron/**",
    "!shared/**",
    "!electron.vite.config.{js,ts,mjs,cjs}",
    "!electron-builder.config.{js,ts,mjs,cjs}",
    "!uno.config.{js,ts,mjs,cjs}",
    "!{.eslintcache,eslint.config.mjs,auto-eslint.mjs,.prettierignore,.prettierrc.yaml,CHANGELOG.md,README.md}",
    "!{components.d.ts,auto-imports.d.ts}",
    "!{.env,.env.*,.npmrc,pnpm-lock.yaml}",
    "!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}",
    "!**/*.{d.ts,ts,map,md}",
    "!**/{CHANGELOG,README,readme}*",
    "!**/node_modules/better-sqlite3/{deps,src}/**",
  ],
  // 保留的语言
  electronLanguages: ["zh-CN"],
  asarUnpack: ["public/**"],
  extraResources: [
    {
      from: "native/audio-engine",
      to: "native",
      filter: ["*.node"],
    },
    {
      from: "native/media-ctrl",
      to: "native",
      filter: ["*.node"],
    },
    {
      from: "native/taskbar-lyric",
      to: "native",
      filter: ["*.node"],
    },
    {
      from: "native/taskbar-thumbnail",
      to: "native",
      filter: ["*.node"],
    },
    {
      from: "native/opencc",
      to: "native",
      filter: ["*.node"],
    },
  ],
  extraFiles: [
    {
      from: "LICENSE",
      to: "LICENSE",
    },
  ],
  win: {
    executableName: "OpsMusic",
    icon: "public/icons/logo.ico",
    artifactName: "${productName}-${version}-${arch}.${ext}",
    forceCodeSigning: false,
    // 只出 zip 免安装版：解压一次后直接运行，启动免去单文件自解压开销；安装器（NSIS）链路已退役
    target: ["zip"],
  },
  npmRebuild: false,
  electronDownload: {
    mirror: "https://npmmirror.com/mirrors/electron/",
  },
};

export default config;
