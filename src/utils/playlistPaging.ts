import type { Playlist } from "@shared/types/player";

/** 用户歌单分页状态：列表始终是服务端顺序（我喜欢 + 自建 + 收藏）的连续前缀 */
export interface PlaylistPageState {
  /** 已加载的歌单 */
  items: Playlist[];
  /** 可能还有下一页 */
  hasMore: boolean;
}

/** 分页动作：reset 用于退出登录，replace 用于首屏与刷新，append 用于滚动续拉 */
export type PlaylistPageAction =
  | { type: "reset" }
  | { type: "replace"; page: Playlist[]; hasMore: boolean }
  | { type: "append"; page: Playlist[]; hasMore: boolean };

/** 空分页状态 */
export const emptyPlaylistPage: PlaylistPageState = { items: [], hasMore: false };

/**
 * 按 id 去重合并歌单，保留已有顺序，页内与跨页重复都丢弃
 * @param items - 已加载歌单
 * @param page - 新的一页
 * @returns 合并后的歌单，无新增时复用原数组引用
 */
const mergeById = (items: Playlist[], page: Playlist[]): Playlist[] => {
  const seen = new Set(items.map((item) => item.id));
  const appended: Playlist[] = [];
  for (const item of page) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    appended.push(item);
  }
  return appended.length === 0 ? items : [...items, ...appended];
};

/**
 * 归约一页歌单到分页状态
 * @param state - 当前分页状态
 * @param action - 分页动作
 * @returns 归约后的分页状态
 */
export const reducePlaylistPages = (
  state: PlaylistPageState,
  action: PlaylistPageAction,
): PlaylistPageState => {
  if (action.type === "reset") return emptyPlaylistPage;
  const items =
    action.type === "replace" ? mergeById([], action.page) : mergeById(state.items, action.page);
  return { items, hasMore: action.hasMore };
};
