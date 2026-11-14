/**
 * 咪咕 MRC 逐字歌词解密
 *
 * MRC 是咪咕自家的逐字歌词格式，站方以十六进制密文下发；解密算法是 TEA 变体
 * （DELTA 0x9E3779B9、轮数 6 + floor(52/n)，key 用 UTF-16LE 展宽），全程要模拟
 * Java long 的 64 位有符号溢出。密钥 `karakal@123Qcomyidongtiantianhaoting`
 * 是咪咕客户端公开的固定值。解密后按 MRC 逐字标记转成增强 LRC（行头时间戳 + 逐字时间戳），
 * 交给渲染端 lyric-kit 现判格式。
 */

/** TEA 常量 DELTA（黄金比例） */
const DELTA = 0x9e3779b9n;
/** 密文最短长度（16 字符一组，不足视为非密文） */
const MIN_HEX_LENGTH = 32;
/** 固定解密密钥（咪咕客户端公开值） */
const MRC_KEY = "karakal@123Qcomyidongtiantianhaoting";
/** 尾部填充清理用的哨兵字节（'0'） */
const PADDING_BYTE = 0x30;

/** 模拟 Java long 溢出：bigint 规范化到 64 位有符号范围 */
const toLong = (num: bigint): bigint => {
  const MAX = (1n << 63n) - 1n;
  const MIN = -(1n << 63n);
  if (num > MAX) return toLong(num - (1n << 64n));
  if (num < MIN) return toLong(num + (1n << 64n));
  return num;
};

/**
 * 十六进制密文 → long 数组（每 16 个 hex 字符一组，大端读入）
 * @param hex - 密文
 * @returns long 数组
 */
const hexToLongs = (hex: string): bigint[] => {
  const groups = Math.floor(hex.length / 16);
  const out: bigint[] = new Array(groups);
  for (let i = 0; i < groups; i++) {
    out[i] = toLong(BigInt(`0x${hex.substring(i * 16, i * 16 + 16)}`));
  }
  return out;
};

/**
 * 密钥 → long 数组：UTF-8 字节展宽成 UTF-16LE 后每 8 字节一组（小端）
 * @param key - 密钥字符串
 * @returns long 数组
 */
const keyToLongs = (key: string): bigint[] => {
  const bytes = Buffer.from(key, "utf8");
  const widened = Buffer.alloc(bytes.length * 2);
  for (let i = 0; i < bytes.length; i++) {
    widened[i * 2] = bytes[i];
  }
  const groups = Math.floor(widened.length / 8) + (widened.length % 8 === 0 ? 0 : 1);
  const out: bigint[] = new Array(groups);
  for (let i = 0; i < groups - 1; i++) {
    out[i] = widened.readBigInt64LE(i * 8);
  }
  const tail = Buffer.alloc(8);
  widened.copy(tail, 0, (groups - 1) * 8);
  out[groups - 1] = tail.readBigInt64LE(0);
  return out;
};

/**
 * long 数组 → 字节并剥离 '0' 填充尾部
 * @param data - 解密后的 long 数组
 * @returns 明文字节
 */
const longsToBytes = (data: bigint[]): Buffer => {
  const bytes: number[] = [];
  for (const value of data) {
    const chunk = Buffer.alloc(8);
    chunk.writeBigInt64LE(value, 0);
    for (let i = 0; i < 8; i++) bytes.push(chunk[i]);
  }
  while (bytes.length > 0 && bytes[bytes.length - 1] === PADDING_BYTE) {
    bytes.pop();
  }
  return Buffer.from(bytes);
};

/**
 * TEA 解密（逐轮差分，Java long 溢出语义）
 *
 * 站方实现里 `chain` 从 data[0] 起跨轮累积（链式解密）：每轮先解尾段
 * （i 从 length-1 降到 1，key 下标 `(3 & i) ^ half`），再解首段（key 下标 half），
 * sum 每轮减 DELTA 直到归零。混合项按 `(A + B) ^ (C + D)` 结合。
 * @param data - 密文 long 数组（原地解密）
 * @param key - 密钥 long 数组
 * @returns 明文 long 数组
 */
const teaDecrypt = (data: bigint[], key: bigint[]): bigint[] => {
  const length = data.length;
  if (length < 1) return data;

  let chain = data[0];
  let sum = toLong((6n + BigInt(Math.floor(52 / length))) * DELTA);

  for (; sum !== 0n; sum = toLong(sum - DELTA)) {
    const half = toLong(3n & (sum >> 2n));
    for (let i = length - 1; i >= 1; i--) {
      const prev = data[i - 1];
      const a = toLong(chain ^ sum);
      const b = toLong(prev ^ key[Number(toLong((3n & BigInt(i)) ^ half))]);
      const c = toLong(toLong(prev >> 5n) ^ toLong(chain << 2n));
      const d = toLong(toLong(chain >> 3n) ^ toLong(prev << 4n));
      chain = toLong(data[i] - toLong(toLong(a + b) ^ toLong(c + d)));
      data[i] = chain;
    }
    const last = data[length - 1];
    const e = toLong(key[Number(half)] ^ last);
    const f = toLong(chain ^ sum);
    const g = toLong(toLong(last >> 5n) ^ toLong(chain << 2n));
    const h = toLong(toLong(chain >> 3n) ^ toLong(last << 4n));
    chain = toLong(data[0] - toLong(toLong(e + f) ^ toLong(g + h)));
    data[0] = chain;
  }
  return data;
};

/**
 * MRC 解密入口：十六进制密文 → 明文
 * @param hex - 密文；过短或非密文原样返回
 * @returns 明文（UTF-16LE 语义的字符串）
 */
export const decryptMrc = (hex: string): string => {
  if (!hex || hex.length < MIN_HEX_LENGTH) return hex;
  const decrypted = teaDecrypt(hexToLongs(hex), keyToLongs(MRC_KEY));
  return longsToBytes(decrypted).toString("utf16le");
};

/**
 * 逐字时间戳（`(mm,ss,ms)` / `[mm,ss,ms]`）→ 标准 `[mm:ss.ms]`
 * @param times - 原始时间戳
 * @returns 标准时间戳
 */
const toWordTime = (times: string): string => {
  const time = Number(times.replace(/[()[\]]/g, "").split(",")[0]);
  if (!Number.isFinite(time)) return "";
  const mm = Math.floor(time / 60000)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor((time / 1000) % 60)
    .toString()
    .padStart(2, "0");
  const ms = Math.floor(time % 1000)
    .toString()
    .padStart(3, "0");
  return `[${mm}:${ss}.${ms}]`;
};

/**
 * MRC 明文 → 增强 LRC：行头时间戳保留、逐字标记展开成 `[ts]字` 序列
 * @param text - MRC 明文
 * @returns 增强 LRC 文本
 */
export const formatMrc = (text: string): string => {
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    // 元信息行（第二个字符不是数字）原样保留
    if (!"1234567890".includes(line[1] ?? "")) {
      out.push(line);
      continue;
    }
    // 逐字行：剥掉行头标记后按 (…) 分段展开
    const stripped = line.replace(/\[[^\]]*\]/g, "");
    let cursor = 0;
    let lineOut = "";
    for (;;) {
      const left = stripped.indexOf("(", cursor);
      if (left === -1) break;
      const right = stripped.indexOf(")", left);
      if (right === -1) break;
      const word = stripped.slice(cursor, left);
      const time = stripped.slice(left, right + 1);
      if (!word || !time) break;
      lineOut += `${toWordTime(time)}${word}`;
      cursor = right + 1;
    }
    out.push(lineOut);
  }
  return out.join("\n");
};
