<div align="center">

<img alt="Ops Music logo" width="120" height="120" src="public/icons/favicon.png" />

<h2>Ops Music</h2>

<p>🎵 Windows desktop music player: Netease Cloud Music, local library and taskbar lyrics.</p>

<p>This project is a derivative of <a href="https://github.com/SPlayer-Dev/SPlayer-Next">SPlayer-Next</a>, not the same product.</p>

[![License](https://img.shields.io/github/license/xiaoxu1642/ops-music)](./LICENSE)

**English** | [简体中文](./README.zh-CN.md)

</div>

---

## Upstream & License

- **Baseline project**: [SPlayer-Next](https://github.com/SPlayer-Dev/SPlayer-Next) (by imsyy, AGPL-3.0). SPlayer-Next itself is the successor of [SPlayer](https://github.com/SPlayer-Dev/SPlayer). This project stays AGPL-3.0 and keeps the original `LICENSE`.
- **What changed**: renamed to Ops Music, Windows-only; song recognition, font configuration, desktop lyric, dynamic island, external HTTP/WS API, Last.fm, Discord RPC, update checking and streaming servers were removed; taskbar lyrics, online word-by-word lyrics and system media controls (SMTC) are kept.
- **Native modules**: decoding, tags and covers come from SPlayer-Next's Rust `audio-engine` (FFmpeg + lofty); system media controls come from its `media-ctrl` (WinRT SMTC).
- **Bilibili source**: search, stream resolution, lyrics and account login are ported from my other project **Otter Music** (a Capacitor Android player). Endpoint parameters, WBI signing and cookie semantics match that project; because audio is fetched by the Rust engine (which cannot carry a Referer), playback goes through a 127.0.0.1 proxy inside the app.

---

## Features

- 🎵 **Broad format support** — MP3, FLAC, WAV, AAC, OGG, APE, and more, decoded via FFmpeg
- 📝 **Rich lyrics** — LRC / QRC / YRC / TTML with word-by-word highlighting and translations, in the player and in the Windows taskbar lyric (word-by-word sweep)
- 🌐 **Online word-level lyrics** — optional match against the community AMLL TTML DB, plus your own local TTML lyric library as an override
- 📺 **Bilibili source** — search, streaming and subtitle lyrics with web login; playback runs through a local proxy that carries the required Referer
- 🖥️ **Windows desktop player** — no macOS / Linux builds shipped
- 📁 **Local library** — folder scanning, playlists, favorites and play history
- 🎚️ **Audio spectrum** — real-time FFT visualization
- 🏷️ **Metadata editing** — edit local track tags and cover art
- ⬇️ **Downloads** — built-in download manager that writes tags, cover art and lyric files
- 🗂️ **Cache & stats** — cache management and listening statistics
- 🎧 **System media integration** — Windows SMTC (lock screen, notifications, media keys), tray menu and global shortcuts
- ⚡ **High-performance audio engine** — FFmpeg + Rust
- 🎨 **Adaptive theming** — cover-based colors, Light / Dark / Auto
- 🧩 **Extensible** — lx-music (`user_api`) plugin sources and a local MCP interface for AI clients

## Development

### Requirements

- **Node.js** >= 22
- **pnpm** >= 10
- **Rust toolchain** (required to build the native modules; see below)

### Native Modules

Core performance features are powered by Rust-based native modules:

| Module              | Description                                                                        |
| ------------------- | ---------------------------------------------------------------------------------- |
| `audio-engine`      | High-performance audio decoding (FFmpeg), playback, FFT spectrum, cover extraction |
| `media-ctrl`        | System media controls (Windows SMTC)                                               |
| `taskbar-lyric`     | Native Windows taskbar lyric rendering                                             |
| `taskbar-thumbnail` | Windows taskbar thumbnail / Peek preview replaced with the album cover             |
| `opencc`            | Chinese variant conversion for lyric text                                          |

`pnpm dev` and `pnpm build` compile the native modules automatically. To skip them (e.g. when working only on the UI), set `SKIP_NATIVE_BUILD=true`.

### Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Start the dev app (builds native modules in debug, then launches Electron)
pnpm dev
```

### Building

```bash
pnpm build         # Full build: clean → native → typecheck → electron-vite

pnpm build:win     # Package for Windows
pnpm build:mac     # Package for macOS
pnpm build:linux   # Package for Linux (AppImage / deb / rpm / tar.gz / pacman)
```

> By default a build targets the current architecture only. Cross-compilation is not supported.
> Ops Music ships Windows packages only; `build:mac` and `build:linux` are inherited from upstream and are not part of the release process.
> Ops Music ships Windows packages only; `build:mac` and `build:linux` are inherited from upstream and are not part of this project's release process.

### Other Scripts

```bash
pnpm typecheck        # tsc + vue-tsc (node + web targets)
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm build:native     # Build the Rust native modules only (add `--dev` for debug)
```

## Acknowledgements

Special thanks to the open-source projects that make SPlayer-Next possible:

- [applemusic-like-lyrics](https://github.com/Steve-xmh/applemusic-like-lyrics) — Apple Music-style lyrics display component library
- [NeteaseCloudMusicApiEnhanced](https://github.com/neteasecloudmusicapienhanced/api-enhanced) — NetEase Cloud Music API (backup + enhanced)

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](https://www.gnu.org/licenses/agpl-3.0.html).

- **Modification & distribution:** any modification or distribution must also be released under **AGPL-3.0**, with the complete source code provided.
- **Derivative works:** must adopt **AGPL-3.0** as well, and must retain this project's license and copyright notice in an appropriate place.
- **Attribution:** the original author and copyright information must be preserved. You may add your own notice for a derivative work, but you must not remove or alter the original.
- **Commercial use:** if used for sale or any other for-profit purpose, the source code and a link to the original project must be provided. Because this project relies on third-party services, commercial use may carry legal risk.
- **No warranty:** the software is provided "as is", without warranty of any kind, as described in the AGPL-3.0.

## Disclaimer

This project is intended for personal learning and research only, and must not be used for commercial or unlawful purposes. Some features rely on third-party APIs; users are solely responsible for ensuring their use complies with the relevant laws, regulations, and service agreements. The authors accept no liability for any direct or indirect consequences arising from the use of this project.
