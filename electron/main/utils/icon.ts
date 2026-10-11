import { nativeImage, nativeTheme, NativeImage } from "electron";
import { join } from "path";

/** 图标根目录 */
const ICONS_DIR = join(__dirname, "../../public/icons");

/**
 * 图标缓存
 * key 为「相对路径 + 尺寸」，主题后缀已经写在路径里，因此 key 空间 = 固定图标集 × 2 主题 × 少量尺寸，
 * 数量天然有界，无需淘汰规则
 */
const iconCache = new Map<string, NativeImage>();

/**
 * 加载图标文件
 * @param relativePath - 相对于 public/icons/ 的路径
 * @param size - 可选，resize 尺寸
 * @returns NativeImage 实例
 */
export const loadIcon = (
  relativePath: string,
  size?: { width: number; height: number },
): NativeImage => {
  const key = size ? `${relativePath}|${size.width}x${size.height}` : relativePath;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const image = nativeImage.createFromPath(join(ICONS_DIR, relativePath));
  const result = size ? image.resize(size) : image;
  iconCache.set(key, result);
  return result;
};

/**
 * 加载主题感知图标（自动根据系统明暗主题选择 -dark / -light 后缀）
 * @param dir - 图标子目录（如 "thumbar"、"tray"）
 * @param name - 图标名称（不含后缀，如 "play"、"prev"）
 * @param size - 可选，resize 尺寸
 * @returns NativeImage 实例
 */
export const loadThemedIcon = (
  dir: string,
  name: string,
  size?: { width: number; height: number },
): NativeImage => {
  const suffix = nativeTheme.shouldUseDarkColors ? "dark" : "light";
  return loadIcon(`${dir}/${name}-${suffix}.png`, size);
};
