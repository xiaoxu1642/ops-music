import fs from "node:fs";
const base = ".birdview";
const catalog = JSON.parse(fs.readFileSync(`${base}/constraints.catalog.json`, "utf8"));
const now = new Date().toISOString();
const evidence = (path, note, quote) => [{ path, note, quote }];
const architecture = {
  schemaVersion: "birdview.architecture/v1",
  language: "zh",
  mapId: "opsmusic-birdview-2026-11-16",
  revision: 1,
  project: { id: "opsmusic", name: "OpsMusic" },
  constraintDiscovery: { checkedAt: now, checkedPaths: ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"], uninspectedPaths: [] },
  groups: [
    { id: "group-ui", name: "交互层", role: "interaction", evidence: evidence("AGENTS.md", "进程模型明确渲染器与独立歌词窗口承担用户可见界面。", "**Renderer** (`src/`) — Vue 3 SPA"), members: ["renderer", "taskbar-lyric-window"] },
    { id: "group-runtime", name: "运行时与共享契约", role: "runtime", evidence: evidence("AGENTS.md", "主进程、原生模块和共享类型共同支撑播放与数据链路。", "**Main** (`electron/main/`) — windows, IPC, native modules"), members: ["main-process", "native-modules", "shared-contracts"] },
  ],
  modules: [
    { id: "renderer", name: "渲染器界面", kind: "local", responsibility: "Vue 3 单页界面、状态、页面、组件和高频动画", role: "frontend", ownership: ["src/"], evidence: evidence("AGENTS.md", "文档明确 src 是 Vue 3 SPA。", "**Renderer** (`src/`) — Vue 3 SPA"), status: "supported", openQuestions: [], layout: { row: 0, column: 0 } },
    { id: "taskbar-lyric-window", name: "任务栏歌词窗口", kind: "local", responsibility: "独立 Vue 入口，显示任务栏逐字歌词并与主窗口共享播放时间源", role: "frontend", ownership: ["windows/"], evidence: evidence("AGENTS.md", "文档明确独立入口及共享 composable。", "`windows/taskbar-lyric` is an independent Vue entry"), status: "supported", openQuestions: [], layout: { row: 0, column: 1 } },
    { id: "main-process", name: "主进程与 IPC", kind: "local", responsibility: "窗口、IPC、播放服务、下载、曲库、数据库和配置", role: "backend", ownership: ["electron/"], evidence: evidence("AGENTS.md", "文档明确 electron/main 承载窗口、IPC 与原生模块。", "**Main** (`electron/main/`) — windows, IPC, native modules"), status: "supported", openQuestions: [], layout: { row: 1, column: 0 } },
    { id: "native-modules", name: "原生模块", kind: "local", responsibility: "Rust/NAPI-RS：音频解码播放、系统媒体、任务栏歌词、缩略图、AutoMix 与 OpenCC", role: "backend", ownership: ["native/"], evidence: evidence("AGENTS.md", "文档列出 native 目录下的 NAPI-RS 模块。", "Four `.node` modules in `native/`"), status: "supported", openQuestions: [], layout: { row: 1, column: 1 } },
    { id: "shared-contracts", name: "共享类型与契约", kind: "local", responsibility: "跨进程类型、默认值和工具", role: "generic", roleAssessment: { basis: "out-of-taxonomy", note: "共享类型和工具不是单一前端、后端或存储角色，而是跨进程契约层。" }, ownership: ["shared/"], evidence: evidence("AGENTS.md", "文档明确共享类型放在 shared/types。", "Put cross-process types (`SystemConfig`, etc.) in `shared/types/`."), status: "supported", openQuestions: [], layout: { row: 2, column: 0 } },
    { id: "build-delivery", name: "构建与发布", kind: "local", responsibility: "electron-vite、pnpm、Rust 构建、Windows zip 打包与本地 runtime 替换", role: "generic", roleAssessment: { basis: "out-of-taxonomy", note: "构建发布是工程流水线，不属于运行时业务角色分类。" }, ownership: ["scripts/", "electron.vite.config.ts", "electron-builder.config.ts", "package.json", "docs/"], evidence: evidence("AGENTS.md", "命令章节列出 dev、build、build:native 等构建链路。", "pnpm build                # Full build"), status: "supported", openQuestions: [], layout: { row: 2, column: 1 } },
  ],
  relationships: [
    { id: "r-renderer-main", from: "renderer", to: "main-process", label: "通过预加载 IPC 请求播放、曲库、配置与系统能力", evidence: evidence("AGENTS.md", "播放数据流显示用户操作从状态到 IPC 再到主进程。", "User action → status store → IPC"), kind: "request", visibility: "overview", status: "supported", openQuestions: [] },
    { id: "r-main-renderer", from: "main-process", to: "renderer", label: "广播播放事件、位置、状态与曲库结果", evidence: evidence("AGENTS.md", "Rust 事件经主进程广播回 renderer。", "main broadcasts to renderer"), kind: "event", visibility: "overview", status: "supported", openQuestions: [] },
    { id: "r-main-native", from: "main-process", to: "native-modules", label: "懒加载 NAPI 模块并调用解码、媒体控制与任务栏能力", evidence: evidence("AGENTS.md", "文档说明原生模块由主进程懒加载。", "lazy-loaded by `electron/main/utils/nativeLoader.ts`"), kind: "dependency", visibility: "overview", status: "supported", openQuestions: [] },
    { id: "r-native-main", from: "native-modules", to: "main-process", label: "通过 ThreadsafeFunction 推送状态、位置、结束与输出停滞事件", evidence: evidence("AGENTS.md", "audio-engine 事件推送说明。", "Pushes events (state/position/ended/outputStalled)"), kind: "event", visibility: "overview", status: "supported", openQuestions: [] },
    { id: "r-main-taskbar", from: "main-process", to: "taskbar-lyric-window", label: "发送歌词、位置、显隐和悬停状态", evidence: evidence("AGENTS.md", "任务栏歌词消费 nowPlaying 同步。", "`useNowPlayingSync` — playback sync, lyric index, anchor interpolation"), kind: "event", visibility: "overview", status: "supported", openQuestions: [] },
    { id: "r-shared-all", from: "shared-contracts", to: "renderer", label: "提供跨进程类型和默认值", evidence: evidence("AGENTS.md", "共享类型供两个进程使用。", "Put cross-process types (`SystemConfig`, etc.) in `shared/types/`."), kind: "dependency", visibility: "overview", status: "supported", openQuestions: [] },
    { id: "r-shared-main", from: "shared-contracts", to: "main-process", label: "提供系统配置与领域类型契约", evidence: evidence("AGENTS.md", "系统配置放在 shared/types。", "Put cross-process types (`SystemConfig`, etc.) in `shared/types/`."), kind: "dependency", visibility: "detail", status: "supported", openQuestions: [] },
    { id: "r-build-runtime", from: "build-delivery", to: "native-modules", label: "构建 Rust release 模块并打包进 Windows zip", evidence: evidence("AGENTS.md", "build:native 与平台包命令。", "pnpm build:{win,mac,linux}"), kind: "control", visibility: "detail", status: "supported", openQuestions: [] },
  ],
};
fs.writeFileSync(`${base}/architecture.json`, JSON.stringify(architecture, null, 2) + "\n");
const rules = {
  revision: catalog.project.revision,
  scope: "本轮审查根 AGENTS.md、CLAUDE.md 与 copilot 指引中的高频可执行工程约束；仅提炼能在源码或流程中核验的核心要求，未覆盖外部全局规则与未跟踪文档。",
  groups: [
    { sourcePath: "AGENTS.md", category: "configuration", topic: { id: "baseline", name: "基线与开工" }, rules: [
      { id: "rule-baseline-check", name: "开工先校验基线", anchor: "## 收口基线与开工检查", condition: "开始实质性代码或配置任务时", explanation: "先运行基线校验，通过则复用基线；不无脑重算或扩大验证。", verification: "检查 scripts/verify-baseline.sh 的实际退出结果与任务范围。" },
    ]},
    { sourcePath: "AGENTS.md", category: "delivery", topic: { id: "baseline", name: "基线与开工" }, rules: [
      { id: "rule-baseline-closeout", name: "收口只记录已验证结果", anchor: "收口：任务验证通过、无 pending 后更新", condition: "任务验证通过且无 pending 时", explanation: "更新 .agent/baseline.json，记录本轮已完成的轻量验证，不把基线当验证替代品。", verification: "核对验证命令结果、pending 与 baseline 记录一致。" },
    ]},
    { sourcePath: "AGENTS.md", category: "configuration", topic: { id: "shell", name: "命令环境" }, rules: [
      { id: "rule-git-bash", name: "项目命令使用 Git Bash", anchor: "## Shell", condition: "执行项目开发命令时", explanation: "仓库约定开发 shell 是 Windows Git Bash，命令用 bash 语法。", verification: "检查执行器实际 shell 与命令语法。" },
    ]},
    { sourcePath: "AGENTS.md", category: "interfaces", topic: { id: "process", name: "进程边界" }, rules: [
      { id: "rule-process-model", name: "保持三进程与歌词窗口边界", anchor: "### Process Model", condition: "新增或修改跨进程能力时", explanation: "主进程、preload、renderer 与独立歌词窗口职责分离，能力通过 contextBridge/IPC 暴露。", verification: "核对新增代码所在目录和 IPC/预加载暴露路径。" },
      { id: "rule-native-types", name: "原生类型从 NAPI 产物导入", anchor: "Never hand-write native module types", condition: "使用 @splayer/* 原生模块时", explanation: "不要手写原生模块类型，避免与 NAPI-RS 生成声明漂移。", verification: "检查类型导入来源和路径别名。" },
    ]},
    { sourcePath: "AGENTS.md", category: "lifecycle", topic: { id: "memory", name: "内存纪律" }, rules: [
      { id: "rule-hidden-silent", name: "隐藏窗口保持静默", anchor: "**Hidden = silent**", condition: "修改高频推送、RAF 或画布时", explanation: "高频进度、FFT、位置同步不得发给隐藏窗口，消费者从下一次推送恢复；RAF 和画布在隐藏时停止。", verification: "检查 visibleOnly 门控、visibilitychange/freeze 路径与推送频率。" },
      { id: "rule-bounded-cache", name: "内存缓存必须有淘汰", anchor: "**In-memory caches must be bounded**", condition: "新增模块级 Map、数组或图片缓存时", explanation: "每个缓存都要有上限或过期规则，不得长期保留 TrackDetail 级数据。", verification: "审查缓存写入与淘汰分支，必要时检查容量上限。" },
    ]},
    { sourcePath: "AGENTS.md", category: "delivery", topic: { id: "style", name: "代码风格与提交" }, rules: [
      { id: "rule-prettier", name: "提交前格式化纳入文件", anchor: "Before committing, run Prettier", condition: "提交包含代码或配置文件时", explanation: "提交前对本次纳入文件运行 Prettier 并检查工作树，不能留下格式-only 散落改动。", verification: "运行 prettier --check 或项目脚本并核对 diff。" },
      { id: "rule-conventional-commit", name: "提交使用中文 Conventional Commit", anchor: "Use Conventional Commits with a Chinese summary", condition: "创建提交信息时", explanation: "标题格式为 <type>: <summary>，一行中文摘要；无明确要求不写正文。", verification: "检查 git log 中本次提交标题。" },
    ]},
  ],
};
fs.writeFileSync(`${base}/reviewed-rules.json`, JSON.stringify(rules, null, 2) + "\n");
console.log("written architecture.json and reviewed-rules.json");
