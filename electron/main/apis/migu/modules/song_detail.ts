/**
 * 咪咕批量歌曲详情（resource/song/by-contentids/v2.0）
 *
 * contentId 用 | 分隔可一次取多条；响应条目里带 lrcUrl / mrcUrl 供歌词桥使用。
 */

import { ENDPOINT } from "../core/config";
import { extractSongList, normalizeMiguSong } from "../core/song";
import type { MiguModule } from "../core/types";

const song_detail: MiguModule = async (query, http) => {
  const ids = String(query.ids ?? "")
    .split("|")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new Error("migu song_detail 缺少 ids");
  const path = `${ENDPOINT.songInfo}?contentId=${encodeURIComponent(ids.join("|"))}`;

  const res = await http.get(path);
  const songs = extractSongList(res.body)
    .map(normalizeMiguSong)
    .filter((song): song is NonNullable<typeof song> => song !== null);

  return { status: 200, body: { songs }, cookie: res.cookie };
};

export default song_detail;
