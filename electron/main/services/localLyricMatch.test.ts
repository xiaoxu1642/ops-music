import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Track } from "@shared/types/player";
import {
  extractHeadTags,
  hasTimedLyricLine,
  normalizeMatchText,
  pickMatchedLyricFile,
  type LocalLyricFile,
} from "./localLyricMatch";

/** 按仓库索引的构建方式造条目：文件名与声明元信息都先归一化 */
const lyricFile = (name: string, ti = "", ar = ""): LocalLyricFile => ({
  file: `D:/lyrics/${name}`,
  stem: normalizeMatchText(name.replace(/\.[^.]+$/, "")),
  title: normalizeMatchText(ti),
  artist: normalizeMatchText(ar),
});

const track = (partial: Partial<Track>): Track => ({
  id: "local:1",
  source: "local",
  title: "晴天",
  artists: [{ name: "周杰伦" }],
  duration: 269_000,
  ...partial,
});

describe("normalizeMatchText", () => {
  it("丢掉括号整段并去掉非单词字符", () => {
    assert.equal(normalizeMatchText("周杰伦 - 晴天 [Live]"), "周杰伦晴天");
    assert.equal(normalizeMatchText("翻唱（原唱某人）版"), "翻唱版");
    assert.equal(normalizeMatchText("Song: 晴天（Cover 张三）"), "song晴天");
  });

  it("空串与纯符号归一为空", () => {
    assert.equal(normalizeMatchText("（）【】"), "");
    assert.equal(normalizeMatchText(""), "");
  });
});

describe("pickMatchedLyricFile 文件名阶段", () => {
  it("文件名同时含歌名与歌手时接受命中", () => {
    const files = [lyricFile("其他歌 - 别的曲子.lrc"), lyricFile("周杰伦 - 晴天.lrc")];
    assert.equal(pickMatchedLyricFile(files, track({})), "D:/lyrics/周杰伦 - 晴天.lrc");
  });

  it("文件名只带歌名子串也能过 0.62 门槛", () => {
    const files = [lyricFile("02 晴天.lrc")];
    assert.equal(pickMatchedLyricFile(files, track({})), "D:/lyrics/02 晴天.lrc");
  });

  it("文件名与歌曲无关时不接受", () => {
    const files = [lyricFile("Night Radio - Deep Focus.lrc")];
    assert.equal(pickMatchedLyricFile(files, track({})), null);
  });

  it("只命中歌手名的别的歌不接受", () => {
    const files = [lyricFile("周杰伦 - 双刀.lrc")];
    assert.equal(pickMatchedLyricFile(files, track({})), null);
  });

  it("同分保留先出现的条目，保证同一仓库每次命中同一文件", () => {
    const files = [lyricFile("晴天.lrc"), lyricFile("晴天.txt")];
    assert.equal(pickMatchedLyricFile(files, track({})), "D:/lyrics/晴天.lrc");
  });
});

describe("pickMatchedLyricFile 文件头元信息阶段", () => {
  it("文件名对不上时靠 [ti:] / [ar:] 判定命中", () => {
    const files = [lyricFile("track01.lrc", "晴天", "周杰伦")];
    assert.equal(pickMatchedLyricFile(files, track({})), "D:/lyrics/track01.lrc");
  });

  it("元信息歌名与歌手都差太多时不接受", () => {
    const files = [lyricFile("track01.lrc", "雨天", "王俊杰")];
    assert.equal(pickMatchedLyricFile(files, track({ title: "晴天午后台风" })), null);
  });

  it("元信息只对上歌手时不接受", () => {
    const files = [lyricFile("track01.lrc", "双刀", "周杰伦")];
    assert.equal(pickMatchedLyricFile(files, track({})), null);
  });

  it("歌曲名为空时不参与判定", () => {
    const files = [lyricFile("晴天.lrc", "晴天")];
    assert.equal(pickMatchedLyricFile(files, track({ title: "  " })), null);
  });
});

describe("歌词文件内容门槛", () => {
  it("认行级时间戳，无时间轴的纯文本不算歌词", () => {
    assert.ok(hasTimedLyricLine("[00:12.30]第一行"));
    assert.ok(hasTimedLyricLine("[00:12,300]第一行"));
    assert.ok(!hasTimedLyricLine("第一行\n第二行"));
  });

  it("只读文件头 120 行里的 [ti:] / [ar:]", () => {
    assert.deepEqual(extractHeadTags("[ti:晴天]\n[ar:周杰伦]\n[00:12.30]第一行"), {
      title: "晴天",
      artist: "周杰伦",
    });
    const body = Array.from({ length: 120 }, (_, i) => `[00:01.00]第${i}行`).join("\n");
    assert.deepEqual(extractHeadTags(`${body}\n[ti:晴天]`), { title: "", artist: "" });
  });
});
