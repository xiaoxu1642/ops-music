/**
 * 咪咕歌曲搜索（bmw/search/song/v1.0）
 *
 * 接口只接受 pageNo 与 text（竞品实测无 pageSize 参数），每页条数由服务端决定（约 20 条）。
 * 渲染层的 offset 分页换算成 pageNo，limit 仅用于 hasMore 判断。
 */

import { ENDPOINT, PC_CHANNEL } from "../core/config";
import { extractSongList, normalizeMiguSong } from "../core/song";
import type { MiguModule } from "../core/types";

const search: MiguModule = async (query, http) => {
  const keyword = String(query.keywords ?? "");
  const page = Number(query.page ?? 1);
  const rows = Number(query.limit ?? 20);
  const pageNo = Math.max(1, Math.ceil(page));
  const path = `${ENDPOINT.search}?pageNo=${pageNo}&text=${encodeURIComponent(keyword)}`;

  const res = await http.get(path, { channel: PC_CHANNEL });
  const songs = extractSongList(res.body)
    .map(normalizeMiguSong)
    .filter((song): song is NonNullable<typeof song> => song !== null);
  const total = Number((res.body as { total?: unknown }).total ?? 0);

  return {
    status: 200,
    body: {
      items: songs,
      total,
      hasMore: total > 0 ? pageNo * rows < total : songs.length >= rows,
    },
    cookie: res.cookie,
  };
};

export default search;
