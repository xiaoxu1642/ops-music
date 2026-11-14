/**
 * 咪咕 passport RSA 工具
 *
 * passport.migu.cn 的登录参数（手机号 / 验证码）用 RSA PKCS#1 v1.5 加密，
 * 公钥从 `/password/publickey` 动态取（hex 形式的 modulus 与 publicExponent）。
 * Node 原生 crypto 经 JWK 构造公钥即可实现，与竞品的 jsbn 实现同语义（输出 hex）。
 */

import { constants, createPublicKey, publicEncrypt, randomBytes } from "node:crypto";
import type { KeyObject } from "node:crypto";

/** passport 公钥接口 */
const PUBLICKEY_URL = "https://passport.migu.cn/password/publickey";

/** 缓存的公钥 KeyObject（passport 公钥低频轮换，进程内常驻） */
let cachedKey: KeyObject | null = null;

/**
 * 取 passport RSA 公钥（必要时拉取并缓存）
 * @returns RSA 公钥
 */
const getRsaKey = async (): Promise<KeyObject> => {
  if (cachedKey) return cachedKey;
  const res = await fetch(PUBLICKEY_URL, {
    // 站方只认 POST，GET 会被 302 到登录页拿不到公钥
    method: "POST",
    headers: { Referer: "https://passport.migu.cn/login", Origin: "https://passport.migu.cn" },
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json()) as { result?: { publicExponent?: string; modulus?: string } };
  const { publicExponent, modulus } = body.result ?? {};
  if (!publicExponent || !modulus) throw new Error("migu passport 公钥响应不完整");
  cachedKey = createPublicKey({
    key: {
      kty: "RSA",
      // JWK 要求 base64url；站方给的是 hex
      n: Buffer.from(modulus, "hex").toString("base64url"),
      e: Buffer.from(publicExponent, "hex").toString("base64url"),
    },
    format: "jwk",
  });
  return cachedKey;
};

/**
 * RSA PKCS#1 v1.5 加密，输出大写 hex（与站方 jsbn 实现同语义）
 * @param text - 明文（手机号 / 验证码）
 * @returns 密文 hex；加密失败返回空串
 */
export const rsaEncryptHex = async (text: string): Promise<string> => {
  try {
    const key = await getRsaKey();
    return publicEncrypt({ key, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(text, "utf8"))
      .toString("hex")
      .toUpperCase();
  } catch {
    return "";
  }
};

/**
 * 32 位随机小写 hex：passport 的 fingerPrint / fingerPrintDetail 假指纹
 * @returns 随机指纹串
 */
export const randomFingerprint = (): string => randomBytes(16).toString("hex");
