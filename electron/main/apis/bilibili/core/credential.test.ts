import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractWbiKeys,
  getMixinKey,
  hasBilibiliSession,
  normalizeBilibiliCookie,
  pickSessionCookies,
  signWbiParams,
} from "./credential";
import { ENDPOINT } from "./config";

/**
 * 站方 WBI 规范文档（bilibili-API-collect / misc/sign/wbi）给出的示例向量，
 * 用来钉死打乱表与拼接顺序，改成任何一步都会算不出这个 w_rid。
 */
const IMG_KEY = "7cd084941338484aae1ad9425b84077c";
const SUB_KEY = "4932caff0ff746eab6f01bf08b70ac45";
const MIXIN_KEY = "ea1db124af3c7062474693fa704f4ff8";
const WTS = 1702204169;
const W_RID = "8f6f2b5b3d485fe1886cec6a0be8c5d4";

describe("B 站 WBI 签名", () => {
  it("按打乱表生成 mixin_key", () => {
    assert.equal(getMixinKey(IMG_KEY + SUB_KEY), MIXIN_KEY);
  });

  it("参数升序拼接后签出站方示例的 w_rid", () => {
    const query = signWbiParams({ foo: "114", bar: "514", zab: "1919810" }, IMG_KEY, SUB_KEY, WTS);
    assert.equal(query, `bar=514&foo=114&wts=${WTS}&zab=1919810&w_rid=${W_RID}`);
  });

  it("签名前剔除参数值里的 !'()* 字符", () => {
    const withSymbols = signWbiParams({ q: "a!b'c(d)e*f" }, IMG_KEY, SUB_KEY, WTS);
    const cleaned = signWbiParams({ q: "abcdef" }, IMG_KEY, SUB_KEY, WTS);
    assert.equal(withSymbols, cleaned);
  });

  it("从 nav 响应里取出 img_key 与 sub_key", () => {
    const keys = extractWbiKeys({
      code: 0,
      data: {
        wbi_img: {
          img_url: "https://i0.hdslb.com/bfs/wbi/" + IMG_KEY + ".png",
          sub_url: "https://i0.hdslb.com/bfs/wbi/" + SUB_KEY + ".png",
        },
      },
    });
    assert.deepEqual(keys, { imgKey: IMG_KEY, subKey: SUB_KEY });
  });

  it("nav 缺 wbi_img 时不返回密钥", () => {
    assert.equal(extractWbiKeys({ code: 0, data: { isLogin: false } }), null);
  });

  it("playurl 与播放器接口都是需要签名的 wbi 端点", () => {
    assert.equal(ENDPOINT.playurl, "/x/player/wbi/playurl");
    assert.equal(ENDPOINT.playerV2, "/x/player/wbi/v2");
  });
});

describe("B 站登录 cookie", () => {
  it("归一化用户粘贴的 cookie 串", () => {
    assert.equal(
      normalizeBilibiliCookie("  SESSDATA=abc; DedeUserID=1  "),
      "SESSDATA=abc; DedeUserID=1",
    );
    assert.equal(normalizeBilibiliCookie("Cookie: SESSDATA=abc"), "SESSDATA=abc");
  });

  it("只有 SESSDATA 才算已登录", () => {
    assert.equal(hasBilibiliSession({ SESSDATA: "abc", buvid3: "x" }), true);
    assert.equal(hasBilibiliSession({ buvid3: "x" }), false);
    assert.equal(hasBilibiliSession({ SESSDATA: "" }), false);
  });

  it("只保留接口需要的键", () => {
    assert.deepEqual(
      pickSessionCookies({
        SESSDATA: "s",
        DedeUserID: "1",
        bili_jct: "t",
        buvid3: "b3",
        buvid4: "b4",
        sid: "junk",
        _uuid: "junk",
      }),
      { SESSDATA: "s", DedeUserID: "1", bili_jct: "t", buvid3: "b3", buvid4: "b4" },
    );
  });
});
