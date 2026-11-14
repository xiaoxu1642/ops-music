/**
 * 咪咕 token 换 pacmtoken（c.musicapp.migu.cn/user/h5/token-validate/v3.0）
 *
 * 登录 token 经该接口换取 pacmtoken cookie；响应的 set-cookie 由服务层写回会话表。
 * 请求必须带 `idmpauth=true@passport.migu.cn` cookie 与 music.migu.cn 的 Origin/Referer。
 */

import type { MiguModule } from "../core/types";

const token_validate: MiguModule = async (query, http) => {
  const token = String(query.token ?? "");
  if (!token) throw new Error("migu token_validate 缺少 token");

  const res = await http.get(
    `https://c.musicapp.migu.cn/user/h5/token-validate/v3.0?token=${encodeURIComponent(
      token,
    )}&type=2&sourceId=220029&activityId=MUSIC-WWW`,
    {
      cookie: { idmpauth: "true@passport.migu.cn" },
      headers: { Origin: "https://music.migu.cn", Referer: "https://music.migu.cn/" },
    },
  );

  const pacmtoken = res.cookie.pacmtoken;
  if (!pacmtoken) throw new Error("migu token_validate 未取得 pacmtoken");
  return res;
};

export default token_validate;
