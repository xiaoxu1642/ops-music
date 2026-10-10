import { callNetease } from "@main/apis/netease";
import { pickBestCandidate, type LyricCandidate } from "@main/apis/common/lyric/utils";
import type { CommentSource, MusicCommentPage, MusicCommentQuery } from "@shared/types/comment";
import type { Track } from "@shared/types/player";
import { buildCommentSources, normalizeNeteaseCommentPage } from "./data";

const NETEASE_SOURCE_ID = "builtin:netease";
const NETEASE_RESOURCE_TYPE = "R_SO_4_";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const toKeyword = (track: Track): string =>
  `${track.title} ${track.artists.map((artist) => artist.name).join(" ")}`.trim();

const findNeteaseId = async (track: Track): Promise<string | null> => {
  if (track.source === "netease" && track.id) return track.id;
  const keyword = toKeyword(track);
  if (!keyword) return null;
  const { status, body } = await callNetease("search", {
    keywords: keyword,
    type: 1,
    limit: 20,
  });
  if (status !== 200) return null;
  const songs = body.result?.songs ?? [];
  const candidates: LyricCandidate<{ id: string }>[] = songs.map(
    (song: {
      id: string | number;
      name?: string;
      artists?: { name: string }[];
      album?: { name?: string };
      duration?: number;
    }) => ({
      name: song.name ?? "",
      artist: (song.artists ?? []).map((artist) => artist.name).join(" / "),
      album: song.album?.name,
      duration: song.duration,
      extra: { id: String(song.id) },
    }),
  );
  return pickBestCandidate(candidates, track)?.extra.id ?? null;
};

const getNeteaseComments = async (args: MusicCommentQuery): Promise<MusicCommentPage> => {
  const id = await findNeteaseId(args.track);
  if (!id) return { list: [], total: 0, page: args.page, limit: args.limit };

  const apiName = args.type === "hot" ? "comment_hot" : "comment_music";
  const { body } = await callNetease(apiName, {
    id,
    type: NETEASE_RESOURCE_TYPE,
    limit: args.limit,
    offset: (args.page - 1) * args.limit,
  });
  return normalizeNeteaseCommentPage(body, args.type, args.page, args.limit);
};

const normalizeQuery = (args: MusicCommentQuery): MusicCommentQuery => ({
  ...args,
  page: Math.max(1, Math.floor(Number(args.page) || 1)),
  limit: Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(args.limit) || DEFAULT_LIMIT))),
});

/** 获取当前可用评论源 */
export const getCommentSources = (): CommentSource[] => buildCommentSources();

/** 获取歌曲评论 */
export const getMusicComments = async (args: MusicCommentQuery): Promise<MusicCommentPage> => {
  const query = normalizeQuery(args);
  if (query.sourceId === NETEASE_SOURCE_ID) return getNeteaseComments(query);
  throw new Error(`unknown comment source: ${query.sourceId}`);
};
