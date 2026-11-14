import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseLyricsfile } from "./lyricsfile";
import { isWordSynced, lrcmuxToSyncedLines, serializeToLrc, serializeToTtml } from "./synced";

/** 站方的两种序列项缩进风格，词项都只给起始毫秒 */
const wordSyncedFile = `version: '1.0'
metadata:
  title: 测试曲
lines:
- text: First things first
  start_ms: 7950
  end_ms: 9287
  words:
  - text: 'First '
    start_ms: 7950
  - text: 'things '
    start_ms: 8425
  - text: first
    start_ms: 8912
- text: Second line here
  start_ms: 9462
  end_ms: 12050
  words:
  - text: 'Second '
    start_ms: 9462
  - text: 'line '
    start_ms: 9900
  - text: here
    start_ms: 10500
- text: Third line words
  start_ms: 13000
  end_ms: 15000
  words:
  - text: 'Third '
    start_ms: 13000
  - text: words
    start_ms: 14000
- text: Fourth line again
  start_ms: 16000
  end_ms: 18000
  words:
  - text: 'Fourth '
    start_ms: 16000
  - text: again
    start_ms: 17000
- text: Fifth line today
  start_ms: 19000
  end_ms: 21000
  words:
  - text: 'Fifth '
    start_ms: 19000
  - text: today
    start_ms: 20000
- text: Sixth line forever
  start_ms: 22000
  end_ms: 24000
  words:
  - text: 'Sixth '
    start_ms: 22000
  - text: forever
    start_ms: 23000
`;

/** 整行成一个词：hasWordSync 为 true 也不算逐字 */
const fakeWordSyncFile = `version: '1.0'
metadata:
  title: 测试曲
lines:
  - text: 故事的小黄花
    start_ms: 29250
    end_ms: 35697
    words:
      - text: 故事的小黄花
        start_ms: 29250
  - text: 童年的荡秋千
    start_ms: 36120
    end_ms: 42568
    words:
      - text: 童年的荡秋千
        start_ms: 36120
  - text: 随记忆一直晃到现在
    start_ms: 42670
    end_ms: 48941
    words:
      - text: 随记忆一直晃到现在
        start_ms: 42670
  - text: 三四五六七八
    start_ms: 49000
    end_ms: 52000
    words:
      - text: 三四五六七八
        start_ms: 49000
  - text: 七八九十甲乙
    start_ms: 53000
    end_ms: 56000
    words:
      - text: 七八九十甲乙
        start_ms: 53000
`;

describe("parseLyricsfile", () => {
  it("顶格序列项与词项只给 start_ms 时，按下一词起点补出时间轴", () => {
    const lines = parseLyricsfile(wordSyncedFile);
    assert.equal(lines.length, 6);
    assert.deepEqual(lines[0].words, [
      { text: "First ", startTime: 7950 },
      { text: "things ", startTime: 8425 },
      { text: "first", startTime: 8912 },
    ]);
    assert.equal(lines[0].startTime, 7950);
    assert.equal(lines[0].endTime, 9287);
  });

  it("缩进序列项与 words: [] 时仍保留整行文本", () => {
    const lines = parseLyricsfile(`lines:
  - text: 'I''m here'
    start_ms: 1000
    end_ms: 2000
    words: []
  - text: "quoted \\"text\\""
    start_ms: 3000
    end_ms: 4000
`);
    assert.equal(lines.length, 2);
    assert.equal(lines[0].words[0].text, "I'm here");
    assert.equal(lines[1].words[0].text, 'quoted "text"');
  });

  it("metadata 后的 plain 块不进歌词行", () => {
    const lines = parseLyricsfile(`lines:
- text: 正文
  start_ms: 1000
  end_ms: 2000
words: []
plain: |-
  不该被解析
`);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].words[0].text, "正文");
  });
});

describe("逐字质量闸门", () => {
  it("多数行含多词时判为逐字并序列化成 TTML", () => {
    const lines = parseLyricsfile(wordSyncedFile);
    assert.equal(isWordSynced(lines), true);
    const ttml = serializeToTtml(lines);
    assert.ok(ttml.startsWith("<?xml"));
    assert.ok(ttml.includes('<span begin="00:07.950" end="00:08.425">First </span>'));
    assert.ok(ttml.includes('<span begin="00:08.912" end="00:09.287">first</span>'));
  });

  it("整行成词的虚标记录退回行级，调用方按闸门选 LRC", () => {
    const lines = parseLyricsfile(fakeWordSyncFile);
    assert.equal(isWordSynced(lines), false);
    const content = isWordSynced(lines) ? serializeToTtml(lines) : serializeToLrc(lines);
    assert.ok(!content.startsWith("<?xml"));
    assert.ok(content.includes("[00:29.25]故事的小黄花"));
  });

  it("行数不足时不凭少数几行判逐字", () => {
    assert.equal(isWordSynced(parseLyricsfile(wordSyncedFile).slice(0, 4)), false);
  });
});

describe("lrcmux 行项归一化", () => {
  it("词项带起止时间时原样保留，缺 end 时由下一词起点补齐", () => {
    const lines = lrcmuxToSyncedLines([
      {
        text: "First things first",
        start: 7950,
        end: 9287,
        words: [
          { text: "First ", start: 7950, end: 8337 },
          { text: "things ", start: 8425 },
          { text: "first", start: 8912, end: 9287 },
        ],
      },
      {
        text: "I am here",
        start: 9462,
        end: 12050,
        words: [
          { text: "I ", start: 9462 },
          { text: "here", start: 10500 },
        ],
      },
    ]);
    assert.equal(lines.length, 2);
    assert.ok(Number.isNaN(lines[0].words[1].endTime));
    assert.ok(Number.isNaN(lines[1].words[0].endTime));
    const ttml = serializeToTtml(lines);
    assert.ok(ttml.includes('<span begin="00:08.425" end="00:08.912">things </span>'));
    assert.ok(ttml.includes('<span begin="00:09.462" end="00:10.500">I </span>'));
  });

  it("没有逐字序列时整行文本当一个词，缺起始时间的行丢弃", () => {
    const lines = lrcmuxToSyncedLines([
      { text: "纯文本兜底", start: 1000, end: 2000 },
      { text: "缺起始时间", end: 3000 },
      { text: "", start: 4000, end: 5000 },
    ]);
    assert.equal(lines.length, 1);
    assert.equal(serializeToLrc(lines), "[00:01.00]纯文本兜底");
  });

  it("词项缺起始时间时按行级文本回退", () => {
    const lines = lrcmuxToSyncedLines([
      { text: "整行回退", start: 1000, end: 2000, words: [{ text: "缺时间" }] },
    ]);
    assert.equal(lines[0].words[0].text, "整行回退");
  });

  it("NaN 词尾时间不会写进 TTML 时间轴", () => {
    const lines = lrcmuxToSyncedLines([
      { text: "有始无终", start: 1000, end: 2000, words: [{ text: "有始无终", start: 1000 }] },
    ]);
    assert.equal(serializeToTtml(lines).includes("NaN"), false);
  });
});
