import type { Track } from "./player";

/** 评论分页类型 */
export type CommentTab = "hot" | "new";

/** 单条歌曲评论 */
export interface MusicCommentItem {
  id: string;
  userId?: string;
  userName: string;
  avatar?: string;
  text: string;
  time?: number;
  location?: string;
  likedCount?: number;
  images?: string[];
  replyTotal?: number;
  reply?: MusicCommentItem[];
}

/** 歌曲评论分页 */
export interface MusicCommentPage {
  list: MusicCommentItem[];
  total: number;
  page: number;
  limit: number;
}

/** 评论查询参数 */
export interface MusicCommentQuery {
  track: Track;
  type: CommentTab;
  page: number;
  limit: number;
}

/** 评论 IPC 响应 */
export type MusicCommentResponse =
  { ok: true; data: MusicCommentPage } | { ok: false; error: string };

/** 渲染端评论 API */
export interface CommentsApi {
  get: (args: MusicCommentQuery) => Promise<MusicCommentResponse>;
}
