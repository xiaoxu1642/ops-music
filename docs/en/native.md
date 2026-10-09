# Native Modules

Performance-sensitive features are implemented in **Rust**, compiled with [NAPI-RS](https://napi.rs/) into Node native addons, and loaded on demand by the main process. All modules live under `native/`.

## Modules

| Module              | Responsibility                                                     |
| ------------------- | ------------------------------------------------------------------ |
| `audio-engine`      | FFmpeg decoding, rodio playback, FFT, and cover extraction         |
| `media-ctrl`        | System media controls (Windows SMTC)                               |
| `taskbar-lyric`     | Windows taskbar lyric rendering                                    |
| `taskbar-thumbnail` | Replaces Windows taskbar thumbnail and Peek preview with album art |
| `opencc`            | Chinese simplified/traditional conversion for lyric text           |

### audio-engine

- Decodes MP3, FLAC, WAV, AAC, OGG, APE, and more through `ffmpeg_audio`.
- Outputs through rodio with fades, speed/pitch control, loudness normalization, and an equalizer.
- Produces realtime FFT data for visualizations and lyric motion.
- Extracts cover thumbnails while decoding.
- Streams remote audio through `ffmpeg_audio::HttpAudioSource`. `HttpCancelHandle` supports immediate cancellation and seek reset, while `reqwest` and `rustls` handle TLS without system FFmpeg dependencies.

### media-ctrl

System media controls. Ops Music ships Windows builds only, so the integration in use is **Windows SMTC** (lock screen, notifications, media keys). The crate still contains Linux MPRIS and macOS Now Playing backends inherited from upstream; they are neither shipped nor verified by this project.

### taskbar-lyric

Renders lyrics in the Windows taskbar and adapts to theme and taskbar state.

### taskbar-thumbnail

Uses DWM iconic representation on Windows to replace the taskbar hover thumbnail and full-size Peek preview with album artwork.

### opencc

OpenCC Chinese variant conversion. The main process calls `opencc.convertText` / `convertTexts` to convert lyric text between simplified and traditional Chinese for display and matching.

## Building

Install the **Rust toolchain** through [rustup](https://rustup.rs/). `pnpm dev` and `pnpm build` compile native modules automatically.

```bash
pnpm build:native
pnpm build:native --dev
```

NAPI-RS generates each module's `index.d.ts`. The main process imports them through aliases:

```text
@splayer/audio-engine      → native/audio-engine
@splayer/media-ctrl        → native/media-ctrl
@splayer/taskbar-lyric     → native/taskbar-lyric
@splayer/taskbar-thumbnail → native/taskbar-thumbnail
@splayer/opencc            → native/opencc
```

::: tip Skipping native builds
For renderer-only work, set `SKIP_NATIVE_BUILD=true`:

```bash
SKIP_NATIVE_BUILD=true pnpm dev
```

:::

::: warning Do not edit generated declarations
Do not edit `native/*/index.d.ts`. Import native types from `@splayer/*`.
:::
