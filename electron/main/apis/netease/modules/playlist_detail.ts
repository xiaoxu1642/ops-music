/**
 * 歌单详情
 *
 * params:
 * - id  歌单 id
 * - s   收藏者数量，默认 8
 *
 * 响应：`{ code, playlist: { id, name, ..., tracks, trackIds }, privileges }`
 * tracks 服务端可能截断；trackIds 是全量，需要时再走 song_detail 拉完整 song
 *
 * 加密：默认 eapi（对齐 NCM 增强版 playlist_detail 行为）
 */

import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

const playlistDetail: NeteaseModule = (query, request) => {
  const data = {
    id: query.id,
    // 服务端对 tracks 自带 ~1000 条截断，消费端已有 trackIds 全量 + song_detail 分页补尾；
    // n 拉到 10 万只会在超大歌单上白拉数 MB 的完整 song
    n: 1000,
    s: query.s ?? 8,
  };
  return request("/api/v6/playlist/detail", data, createOption(query));
};

export default playlistDetail;
