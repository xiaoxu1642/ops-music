/**
 * 咪咕接口路由表：key 由渲染层通过 apis:call("migu", key) 调用
 */

import check_token from "./check_token";
import login_send_code from "./login_send_code";
import login_verify from "./login_verify";
import search from "./search";
import song_detail from "./song_detail";
import song_url from "./song_url";
import token_validate from "./token_validate";
import type { MiguModule } from "../core/types";

export const modules: Record<string, MiguModule> = {
  search,
  song_detail,
  song_url,
  check_token,
  token_validate,
  login_send_code,
  login_verify,
};
