<div align="center">

<img alt="Ops Music logo" width="120" height="120" src="public/icons/favicon.png" />

<h2>Ops Music</h2>

<p>🎵 Windows 桌面音乐播放器：网易云 + 本地曲库 + 任务栏歌词</p>

<p>本项目是 <a href="https://github.com/SPlayer-Dev/SPlayer-Next">SPlayer-Next</a> 的二次开发分支，不是同一产品。</p>

[![License](https://img.shields.io/github/license/xiaoxu1642/ops-music)](./LICENSE)

**简体中文** | [English](./README.md)

</div>

---

## 来源与许可

- **基线项目**：[SPlayer-Next](https://github.com/SPlayer-Dev/SPlayer-Next)（作者 imsyy，AGPL-3.0）。SPlayer-Next 本身是 [SPlayer](https://github.com/SPlayer-Dev/SPlayer) 的继任版本。本项目沿用 AGPL-3.0，`LICENSE` 未改动。
- **二改内容**：更名为 Ops Music，只面向 Windows；移除听歌识曲、字体配置、桌面歌词、灵动岛、外部 HTTP/WS API、Last.fm、Discord RPC、检查更新、流媒体服务器等功能；保留任务栏歌词、在线逐字歌词与系统媒体控制（SMTC）。
- **原生模块**：音频解码/标签/封面由 SPlayer-Next 的 Rust `audio-engine`（FFmpeg + lofty）提供，系统媒体控件由其 `media-ctrl`（WinRT SMTC）提供。
- **计划新增**：B 站音源，实现来自本人另一项目 Otter Music（Capacitor Android 播放器）。接入完成后会在本节列出对应项目与许可。

---

## 功能特性

- 🎵 **广泛的格式支持** —— MP3、FLAC、WAV、AAC、OGG、APE 等，基于 FFmpeg 解码
- 📝 **丰富的歌词** —— LRC / QRC / YRC / TTML，逐字高亮与翻译，支持桌面、灵动岛、任务栏歌词窗口
- 🌐 **流媒体服务** —— Subsonic / Navidrome / Jellyfin / Emby（多服务器、自动连接）
- 🖥️ **跨平台** —— Windows / macOS / Linux
- 🎚️ **音乐频谱** —— 实时 FFT 可视化
- 🏷️ **元信息编辑** —— 编辑本地曲目标签与封面
- ⬇️ **下载** —— 内置下载管理器
- 🎧 **系统媒体集成** —— Windows SMTC / Linux MPRIS / macOS Now Playing + Discord RPC
- ⚡ **高性能音频引擎** —— FFmpeg + Rust
- 🎨 **自适应主题** —— 基于封面取色，Light / Dark / Auto
- 📈 **Last.fm Scrobble**

## 开发

### 环境要求

- **Node.js** >= 22
- **pnpm** >= 10
- **Rust 工具链**（构建原生模块所需，见下）

### 原生模块

核心性能特性由 Rust 编写的原生模块提供：

| 模块            | 说明                                               |
| --------------- | -------------------------------------------------- |
| `audio-engine`  | 高性能音频解码（FFmpeg）、播放、FFT 频谱、封面提取 |
| `media-ctrl`    | 系统媒体控制 + Discord Rich Presence               |
| `taskbar-lyric` | Windows 任务栏歌词原生渲染                         |

`pnpm dev` 与 `pnpm build` 会自动编译原生模块。若只做 UI 开发想跳过，可设置 `SKIP_NATIVE_BUILD=true`。

### 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动开发（先以 debug 构建原生模块，再启动 Electron）
pnpm dev
```

### 构建

```bash
pnpm build         # 完整构建：清理 → 原生模块 → 类型检查 → electron-vite

pnpm build:win     # 打包 Windows
pnpm build:mac     # 打包 macOS
pnpm build:linux   # 打包 Linux（AppImage / deb / rpm / tar.gz / pacman）
```

> 默认仅构建当前架构，暂不支持交叉编译。

### 其他脚本

```bash
pnpm typecheck        # tsc + vue-tsc（node + web 双目标）
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm build:native     # 仅构建 Rust 原生模块（加 `--dev` 为 debug 构建）
```

## 致谢

特别感谢以下让 SPlayer-Next 成为可能的开源项目：

- [applemusic-like-lyrics](https://github.com/Steve-xmh/applemusic-like-lyrics) —— 类 Apple Music 歌词显示组件库
- [NeteaseCloudMusicApiEnhanced](https://github.com/neteasecloudmusicapienhanced/api-enhanced) —— 网易云音乐 API 备份 + 增强

## 开源许可

本项目基于 [GNU Affero General Public License v3.0 (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html) 许可开源。

- **修改与分发：** 任何修改或分发都必须同样基于 **AGPL-3.0**，并一并提供完整源代码。
- **派生作品：** 必须同样采用 **AGPL-3.0**，并在适当位置保留本项目的许可与版权信息。
- **署名：** 必须保留原作者及版权信息。可为二次开发添加你自己的署名，但不得移除或篡改原始信息。
- **商业用途：** 如用于售卖或其他盈利用途，必须提供源代码及原项目链接。由于本项目涉及第三方服务，商业使用可能存在法律风险。
- **免责：** 本软件按「现状」提供，不附带任何形式的担保，详见 AGPL-3.0。

## 免责声明

本项目仅供个人学习与研究使用，禁止用于商业及非法用途。部分功能依赖第三方 API，使用者须自行确保其使用符合相关法律法规及服务协议。对于因使用本项目而产生的任何直接或间接后果，作者不承担任何责任。
