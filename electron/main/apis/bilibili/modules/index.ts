/**
 * B 站 API 模块注册表
 *
 * 每新增一个 module，在这里用一行 import + export 接入即可，
 * 运行时通过 `callBilibili(name, params)` 按 key 路由。
 */

import type { BilibiliModule } from "../core/types";

import nav from "./nav";
import search from "./search";
import video_detail from "./video_detail";
import song_url from "./song_url";
import lyric from "./lyric";

export const modules: Record<string, BilibiliModule> = {
  nav,
  search,
  video_detail,
  song_url,
  lyric,
};
