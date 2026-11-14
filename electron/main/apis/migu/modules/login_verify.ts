/**
 * 咪咕验证码登录校验（passport.migu.cn/authn/dynamicpassword）
 *
 * 手机号与验证码都经 RSA 加密后以表单提交，成功返回 result.token（STnid 开头）；
 * token 需再经 token_validate 换 pacmtoken。
 */

import { rsaEncryptHex, randomFingerprint } from "../core/passport";
import type { MiguModule } from "../core/types";

const PASSPORT_ORIGIN = "https://passport.migu.cn";

const login_verify: MiguModule = async (query, http) => {
  const phone = String(query.phone ?? "");
  const code = String(query.code ?? "");
  if (!phone || !code) throw new Error("migu login_verify 缺少 phone 或 code");

  const [msisdn, dynamicPassword] = [await rsaEncryptHex(phone), await rsaEncryptHex(code)];
  if (!msisdn || !dynamicPassword) throw new Error("migu 登录参数加密失败");
  const fingerprint = randomFingerprint();

  const res = await http.post(`${PASSPORT_ORIGIN}/authn/dynamicpassword`, {
    headers: { Referer: `${PASSPORT_ORIGIN}/login`, Origin: PASSPORT_ORIGIN },
    form: {
      isAsync: "true",
      msisdn,
      dynamicPassword,
      captcha: "",
      appType: "",
      securityCode: "7619",
      sourceID: "220029",
      imgcodeType: "2",
      fingerPrint: fingerprint,
      fingerPrintDetail: fingerprint,
    },
  });

  const body = res.body as { status?: number; result?: { token?: string } };
  if (body.status !== 2000 || !body.result?.token) {
    throw new Error(`migu 登录校验失败：${body.status ?? "no token"}`);
  }
  return res;
};

export default login_verify;
