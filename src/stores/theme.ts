import { generatePalette, applyThemeToDOM, DEFAULT_PRIMARY } from "@/utils/color";
import { useSettingsStore } from "@/stores/settings";

/** 主题覆盖的持久化键 */
const THEME_MODE_KEY = "theme-mode";

/** 读取持久化的主题覆盖 */
const loadThemeMode = (): "dark" | "light" | null => {
  const stored = localStorage.getItem(THEME_MODE_KEY);
  return stored === "dark" || stored === "light" ? stored : null;
};

/**
 * 主题 store
 *
 * 默认跟随系统明暗；侧栏月亮按钮可覆盖为固定暗色/亮色（持久化，再次点击在两态间往返）
 */
export const useThemeStore = defineStore("theme", () => {
  /** 封面取色 HEX，null 时播放器 UI 回退默认色 */
  const coverColor = ref<string | null>(null);

  /** 用户手动覆盖的主题模式，null = 跟随系统 */
  const modeOverride = ref<"dark" | "light" | null>(loadThemeMode());

  /** 系统暗色偏好 */
  const systemDark = usePreferredDark();

  /** 当前是否为暗色（覆盖优先于系统） */
  const isDark = computed(() =>
    modeOverride.value ? modeOverride.value === "dark" : systemDark.value,
  );

  /** 月亮/太阳按钮：在暗色与亮色间往返（覆盖系统偏好） */
  const toggleThemeMode = (): void => {
    modeOverride.value = isDark.value ? "light" : "dark";
    localStorage.setItem(THEME_MODE_KEY, modeOverride.value);
  };

  /** 应用主题到 DOM */
  const apply = (): void => {
    applyThemeToDOM(
      generatePalette(DEFAULT_PRIMARY, isDark.value),
      coverColor.value,
      isDark.value,
      useSettingsStore().appearance.ambientFx,
    );
  };

  /** 初始化 */
  const init = (): void => {
    apply();
    const settings = useSettingsStore();
    watch([isDark, coverColor, () => settings.appearance.ambientFx], () => apply());
  };

  return { coverColor, isDark, modeOverride, toggleThemeMode, init };
});
