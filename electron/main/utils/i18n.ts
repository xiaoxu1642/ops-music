interface MainMessages {
  prev: string;
  play: string;
  pause: string;
  next: string;
  addToLiked: string;
  removeFromLiked: string;
  shuffle: string;
  sequential: string;
  repeatList: string;
  repeatOne: string;
  openTaskbarLyric: string;
  closeTaskbarLyric: string;
  quit: string;
}

/** 主进程翻译表（界面仅中文） */
const messages: MainMessages = {
  prev: "上一曲",
  play: "播放",
  pause: "暂停",
  next: "下一曲",
  addToLiked: "添加到我喜欢",
  removeFromLiked: "从我喜欢中移除",
  shuffle: "随机播放",
  sequential: "顺序播放",
  repeatList: "列表循环",
  repeatOne: "单曲循环",
  openTaskbarLyric: "开启任务栏歌词",
  closeTaskbarLyric: "关闭任务栏歌词",
  quit: "退出",
};

/** 获取翻译文本 */
export const t = (key: keyof MainMessages): string => messages[key];
