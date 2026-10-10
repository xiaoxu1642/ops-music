import { generatePalette, applyThemeToDOM, DEFAULT_PRIMARY } from "@/utils/color";

/**
 * 主题 store
 *
 * 主题固定为「跟随系统 + 默认主题色 + 关闭全局着色 + 纯色背景」，
 * 不提供任何主题配置；仅保留封面取色（--s-cover）供全屏播放器 UI 随封面着色
 */
export const useThemeStore = defineStore("theme", () => {
  /** 封面取色 HEX，null 时播放器 UI 回退默认色 */
  const coverColor = ref<string | null>(null);

  /** 系统暗色偏好（主题跟随系统） */
  const systemDark = usePreferredDark();

  /** 当前是否为暗色 */
  const isDark = computed(() => systemDark.value);

  /** 应用主题到 DOM */
  const apply = (): void => {
    applyThemeToDOM(generatePalette(DEFAULT_PRIMARY, isDark.value), coverColor.value, isDark.value);
  };

  /** 初始化 */
  const init = (): void => {
    apply();
    watch([isDark, coverColor], () => apply());
  };

  return { coverColor, init };
});
