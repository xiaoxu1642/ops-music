import { defineConfig, type DefaultTheme } from "vitepress";

const socialLinks: DefaultTheme.SocialLink[] = [
  { icon: "github", link: "https://github.com/xiaoxu1642/ops-music" },
];

const zhTheme: DefaultTheme.Config = {
  nav: [
    { text: "首页", link: "/" },
    { text: "下载", link: "/download" },
    { text: "使用指南", link: "/guide" },
    {
      text: "开发",
      items: [
        { text: "原生模块", link: "/native" },
        { text: "贡献指南", link: "/contributing" },
      ],
    },
    { text: "类型参考", link: "/types" },
    {
      text: "关于",
      items: [
        { text: "用户协议", link: "/agreement" },
        { text: "隐私策略", link: "/privacy" },
      ],
    },
    { text: "GitHub", link: "https://github.com/xiaoxu1642/ops-music" },
  ],
  sidebar: [
    {
      text: "指南",
      items: [
        { text: "下载", link: "/download" },
        { text: "使用指南", link: "/guide" },
        { text: "用户协议", link: "/agreement" },
        { text: "隐私策略", link: "/privacy" },
      ],
    },
    {
      text: "开发",
      items: [
        { text: "原生模块", link: "/native" },
        { text: "类型参考", link: "/types" },
        { text: "贡献指南", link: "/contributing" },
      ],
    },
    {
      text: "故障排查",
      items: [
        { text: "调试模式与错误排查", link: "/troubleshooting/debug" },
        { text: "Windows 7 兼容性问题", link: "/troubleshooting/windows7" },
      ],
    },
  ],
  outline: { level: [2, 3], label: "文章目录" },
  footer: {
    message:
      '基于 AGPL-3.0 许可发布 | <a href="/agreement">用户协议</a> | <a href="/privacy">隐私策略</a>',
    copyright: "Copyright © 2025-present Ops Music",
  },
  editLink: {
    pattern: "https://github.com/xiaoxu1642/ops-music/blob/main/docs/:path?plain=1",
    text: "查看或编辑此页",
  },
  lastUpdated: {
    text: "最后更新于",
    formatOptions: { dateStyle: "short", timeStyle: "medium" },
  },
};

export default defineConfig({
  title: "Ops Music",
  srcExclude: ["superpowers/**"],
  head: [
    ["link", { rel: "icon", href: "/favicon.png" }],
    ["meta", { name: "author", content: "xiaoxu1642" }],
    [
      "meta",
      {
        name: "keywords",
        content: "Ops Music,ops-music,music player,taskbar lyrics,Electron,Vue3,Rust",
      },
    ],
  ],
  themeConfig: {
    logo: "/favicon.png",
    siteTitle: "Ops Music",
    socialLinks,
    ...zhTheme,
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: {
                buttonText: "搜索文档",
                buttonAriaLabel: "搜索文档",
              },
              modal: {
                displayDetails: "显示详细列表",
                resetButtonTitle: "清除查询条件",
                backButtonTitle: "关闭搜索",
                noResultsText: "没有找到相关结果",
                footer: {
                  selectText: "选择",
                  navigateText: "切换",
                  closeText: "关闭",
                },
              },
            },
          },
        },
      },
    },
  },
});
