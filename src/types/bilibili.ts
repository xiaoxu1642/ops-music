/**
 * B 站主进程接口在渲染层的视图类型
 *
 * 与 `@main/apis/bilibili/core/types.ts` 的归一化结构对齐，只保留渲染层实际消费的字段
 */

/** nav 归一化结果：登录态与账号身份 */
export interface BilibiliNavBody {
  isLogin: boolean;
  mid: number;
  uname: string;
  face: string;
}

/** 已登录的 B 站身份 */
export type BilibiliProfile = Omit<BilibiliNavBody, "isLogin">;

/** 搜索归一化条目 */
export interface BilibiliSearchItem {
  bvid: string;
  title: string;
  artist: string;
  mid?: string;
  cover: string;
  /** 毫秒 */
  duration: number;
}

/** 搜索响应主体 */
export interface BilibiliSearchBody {
  items: BilibiliSearchItem[];
  total: number;
  hasMore: boolean;
}

/**
 * 取流归一化结果
 * `url` 是站方裸地址（缺 Referer 会 403），`proxyUrl` 是主进程签发的可播地址
 */
export interface BilibiliStream {
  url: string;
  proxyUrl?: string;
}
