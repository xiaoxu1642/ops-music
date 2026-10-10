---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "SPlayer-Next"
  text: "听音乐，本该如此"
  tagline: 一款简洁而精致的 Windows 桌面音乐播放器。支持多种音频格式与丰富的歌词展现形式，性能经过深度优化，每一处细节都恰到好处。
  actions:
    - theme: brand
      text: 立即下载
      link: /download
    - theme: alt
      text: 使用指南
      link: /guide
    - theme: alt
      text: GitHub
      link: https://github.com/SPlayer-Dev/SPlayer-Next

features:
  - icon: 🎵
    title: 广泛的格式支持
    details: 基于 FFmpeg + Rust 的高性能音频引擎，支持 MP3、FLAC、WAV、AAC、OGG、APE 等众多格式，渐入渐出、音量均衡、均衡器一应俱全。
  - icon: 📝
    title: 丰富的歌词展现
    details: 支持 LRC / QRC / YRC / TTML 多种歌词，逐字高亮与翻译，可选接入 AMLL TTML DB 在线逐字歌词，并支持 Windows 任务栏歌词。
  - icon: 📁
    title: 网易云与本地曲库
    details: 内置网易云音乐在线搜索与播放，也可扫描本地文件夹建立曲库，支持编辑标签与封面；下载管理器写入标签、封面与歌词，并提供缓存管理与听歌统计。
  - icon: 🎧
    title: 系统级集成
    details: 对接 Windows SMTC，锁屏、通知栏、耳机线控皆可掌控；托盘常驻与全局快捷键随时控制播放。
  - icon: 🎨
    title: 自适应主题
    details: 封面取色驱动全站着色，Light / Dark / Auto 自动切换，音乐频谱可视化，细节处处打磨。
  - icon: 🤖
    title: MCP 接口
    details: 内置本机 MCP 服务，支持 AI 客户端查询播放状态、搜索曲库并控制播放。
---
