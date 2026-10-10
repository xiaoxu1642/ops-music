/**
 * B 站歌词（视频字幕转 LRC）
 *
 * 字幕轨道取自 `/x/player/wbi/v2`（B 站播放器现行接口）：
 * 旧的 `/x/player/v2` 返回的字幕随机不稳定，会拿到无关字幕导致串台。
 * 正文仍是 aisubtitle 域上的一个 JSON，需要带着视频页 Referer 才能取到。
 *
 * 选轨策略照抄 Otter 并只保留主轨：人工字幕整体优先于 AI 字幕，
 * 同语言内人工优先，主歌词优先中文、其次英文、否则取第一条。
 */

import { ENDPOINT, SUBTITLE_DURATION_TOLERANCE } from "../core/config";
import { normalizeResourceUrl } from "../core/url";
import type {
  BilibiliLyricResult,
  BilibiliModule,
  BilibiliPlayerResponse,
  BilibiliSubtitleBodyItem,
  BilibiliSubtitleItem,
  BilibiliSubtitleResponse,
} from "../core/types";
import { API_REFERER } from "../core/config";
import { loadView } from "./video_detail";

/** B 站 AI 生成字幕的语言前缀 */
const AI_SUBTITLE_LAN_PREFIX = "ai-";

/**
 * 归一化语言标识：去掉 `ai-` 前缀并取 locale 的语言段，让 `ai-zh` 与 `zh-CN` 归为同组
 * @param item - 字幕轨道
 * @returns 小写语言码
 */
const subtitleLang = (item: BilibiliSubtitleItem): string =>
  (item.lan || "").replace(AI_SUBTITLE_LAN_PREFIX, "").split("-")[0].toLowerCase();

/** 是否为 B 站 AI 自动生成字幕 */
const isAiSubtitle = (item: BilibiliSubtitleItem): boolean =>
  Boolean(item.ai_status || item.ai_type || item.lan?.startsWith(AI_SUBTITLE_LAN_PREFIX));

/**
 * 选出主歌词轨道
 * @param subtitles - player/wbi/v2 返回的轨道列表
 * @returns 主轨道与 AI 标记，无可用轨道返回 null
 */
export const selectPrimarySubtitle = (
  subtitles: BilibiliSubtitleItem[],
): { item: BilibiliSubtitleItem; isAi: boolean } | null => {
  const usable = subtitles.filter((s) => s.subtitle_url && s.lan);
  if (usable.length === 0) return null;

  const human = usable.filter((s) => !isAiSubtitle(s));
  const ai = usable.filter((s) => isAiSubtitle(s));
  const pool = human.length > 0 ? human : ai;

  const lang = pool.some((s) => subtitleLang(s) === "zh")
    ? "zh"
    : pool.some((s) => subtitleLang(s) === "en")
      ? "en"
      : subtitleLang(pool[0]);
  const item = pool.find((s) => subtitleLang(s) === lang) ?? pool[0];

  return { item, isAi: isAiSubtitle(item) };
};

/**
 * 字幕 body 转 LRC：多行 content 合并为一个空格分隔的行
 * @param body - 站方字幕条目
 * @returns `[mm:ss.xx]文本` 串
 */
export const convertSubtitleToLrc = (body: BilibiliSubtitleBodyItem[]): string =>
  body
    .map((item) => {
      const from = item.from;
      const text = item.content?.replace(/\s+/g, " ").trim();
      if (typeof from !== "number" || !text) return "";
      const mins = Math.floor(from / 60);
      const secs = Math.floor(from % 60);
      const ms = Math.round((from - Math.floor(from)) * 100);
      return `[${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(2, "0")}]${text}`;
    })
    .filter(Boolean)
    .join("\n");

/** 字幕 body 里最大的时间戳（秒） */
const subtitleMaxTime = (body: BilibiliSubtitleBodyItem[]): number =>
  body.reduce((max, item) => Math.max(max, item.from ?? 0, item.to ?? 0), 0);

const EMPTY_LYRIC: BilibiliLyricResult = { lyric: "", lan: "", isAi: false };

const lyric: BilibiliModule = async (query, http) => {
  const bvid = String(query.bvid ?? "");
  const cookie = query.cookie as Record<string, string> | undefined;
  // 接口与字幕正文都走 Chromium 网络栈，只能给站点根 Referer
  const referer = API_REFERER;
  const view = await loadView(bvid, http, cookie);

  let cid = Number(query.cid ?? 0) || view.cid;
  // trackId 带的 cid 可能已不在分 P 列表里（视频被重新分 P），回落到 P0
  let page = view.pages.find((p) => p.cid === cid);
  if (!page && view.pages.length > 0) {
    cid = view.pages[0].cid;
    page = view.pages[0];
  }

  const playerRes = await http.wbi(ENDPOINT.playerV2, { bvid, cid }, { referer, cookie });
  const subtitles = (playerRes.body as BilibiliPlayerResponse).data?.subtitle?.subtitles ?? [];
  const primary = selectPrimarySubtitle(subtitles);
  if (!primary) return { status: 200, body: EMPTY_LYRIC, cookie: playerRes.cookie };

  const subtitleRes = await http.get(normalizeResourceUrl(primary.item.subtitle_url), {
    referer,
    cookie,
  });
  const body = (subtitleRes.body as BilibiliSubtitleResponse).body ?? [];

  // 防串台：字幕时间轴明显超出当前分 P 时长，判定为无关字幕后整条丢弃
  const duration = page?.duration ?? 0;
  if (duration > 0 && subtitleMaxTime(body) > duration + SUBTITLE_DURATION_TOLERANCE) {
    return { status: 200, body: EMPTY_LYRIC, cookie: subtitleRes.cookie };
  }

  return {
    status: 200,
    body: {
      lyric: convertSubtitleToLrc(body),
      lan: primary.item.lan ?? "",
      isAi: primary.isAi,
    } satisfies BilibiliLyricResult,
    cookie: subtitleRes.cookie,
  };
};

export default lyric;
