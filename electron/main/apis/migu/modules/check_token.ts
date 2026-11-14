/**
 * 咪咕登录态校验（c.musicapp.migu.cn/mgateway/api/checkPacMtoken）
 *
 * pacmtoken 放在请求头（不是 cookie），由会话表注入；未登录直接报错，
 * 由渲染层账号 store 捕获后归为未登录状态。
 */

import type { MiguModule } from "../core/types";

const check_token: MiguModule = async (query, http) => {
  const pacmtoken = (query.cookie as Record<string, string> | undefined)?.pacmtoken ?? "";
  if (!pacmtoken) throw new Error("migu check_token 未登录");
  return await http.get("https://c.musicapp.migu.cn/mgateway/api/checkPacMtoken", {
    headers: { pacmtoken },
  });
};

export default check_token;
