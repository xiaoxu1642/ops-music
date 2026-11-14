/**
 * 咪咕手机号验证码发送（passport.migu.cn/login/dynamicpassword）
 *
 * 手机号经 RSA PKCS#1 v1.5 加密；fingerPrint 用 32 位随机 hex 伪造。
 * 一个手机号请求过多会触发图形验证码，本层不做图形验证码转发，失败原样抛给上层。
 */

import { rsaEncryptHex, randomFingerprint } from "../core/passport";
import type { MiguModule } from "../core/types";

const PASSPORT_ORIGIN = "https://passport.migu.cn";

const login_send_code: MiguModule = async (query, http) => {
  const phone = String(query.phone ?? "");
  if (!phone) throw new Error("migu login_send_code 缺少 phone");

  const msisdn = await rsaEncryptHex(phone);
  if (!msisdn) throw new Error("migu 手机号加密失败");
  const fingerprint = randomFingerprint();
  const qs = new URLSearchParams({
    isAsync: "true",
    msisdn,
    captcha: "",
    sourceID: "220029",
    imgcodeType: "2",
    fingerPrint: fingerprint,
    fingerPrintDetail: fingerprint,
    _: Date.now().toString(),
  });

  const res = await http.get(`${PASSPORT_ORIGIN}/login/dynamicpassword?${qs.toString()}`, {
    headers: {
      Referer: `${PASSPORT_ORIGIN}/login`,
      Origin: PASSPORT_ORIGIN,
    },
  });

  const body = res.body as { status?: number; sysMsg?: string };
  if (body.status !== undefined && body.status !== 2000) {
    throw new Error(`migu 验证码发送失败：${body.sysMsg ?? body.status}`);
  }
  return res;
};

export default login_send_code;
