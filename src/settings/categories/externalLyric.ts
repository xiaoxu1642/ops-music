import type { SettingCategory, SettingSection } from "@/types/settings-schema";
import { useSettingsStore } from "@/stores/settings";
import IconLucideMonitor from "~icons/lucide/monitor";

/** Win 平台限定 */
const taskbarLyricSection: SettingSection = {
  id: "taskbarLyric",
  tag: { text: "Beta" },
  items: [
    {
      key: "taskbarLyricEnabled",
      type: "switch",
      binding: { store: "settings", path: "isTaskbarLyricOpen" },
      defaultValue: false,
    },
    {
      key: "taskbarLyricPosition",
      type: "select",
      binding: { store: "settings", path: "system.taskbarLyric.position" },
      options: [
        { value: "auto", labelKey: "settings.taskbarLyricPosition.auto" },
        { value: "left", labelKey: "settings.taskbarLyricPosition.left" },
        { value: "right", labelKey: "settings.taskbarLyricPosition.right" },
      ],
      defaultValue: "auto",
    },
    {
      key: "taskbarLyricAutoMaxWidth",
      type: "switch",
      binding: { store: "settings", path: "system.taskbarLyric.autoMaxWidth" },
      defaultValue: true,
      childrenCondition: () => true,
      children: [
        {
          key: "taskbarLyricAutoAdjustOccupiedSpace",
          type: "switch",
          binding: { store: "settings", path: "system.taskbarLyric.autoAdjustOccupiedSpace" },
          defaultValue: false,
          visible: () => useSettingsStore().system.taskbarLyric.autoMaxWidth === true,
          tag: { text: "Beta" },
        },
        {
          key: "taskbarLyricMaxWidth",
          type: "slider",
          binding: { store: "settings", path: "system.taskbarLyric.maxWidth" },
          visible: () => useSettingsStore().system.taskbarLyric.autoMaxWidth === false,
          min: 200,
          max: 800,
          step: 20,
          defaultValue: 400,
          marks: { 200: "200", 400: "400", 800: "800" },
        },
      ],
    },
    {
      key: "taskbarLyricLeftMargin",
      type: "number",
      binding: { store: "settings", path: "system.taskbarLyric.leftMargin" },
      min: 0,
      max: 500,
      defaultValue: 0,
    },
    {
      key: "taskbarLyricRightMargin",
      type: "number",
      binding: { store: "settings", path: "system.taskbarLyric.rightMargin" },
      min: 0,
      max: 500,
      defaultValue: 0,
    },
    {
      key: "taskbarLyricColorMode",
      type: "select",
      binding: { store: "settings", path: "system.taskbarLyric.colorMode" },
      options: [
        { value: "taskbar", labelKey: "settings.taskbarLyricColorMode.taskbar" },
        { value: "taskbarInverse", labelKey: "settings.taskbarLyricColorMode.taskbarInverse" },
        { value: "light", labelKey: "settings.taskbarLyricColorMode.light" },
        { value: "dark", labelKey: "settings.taskbarLyricColorMode.dark" },
      ],
      defaultValue: "taskbar",
    },
    {
      key: "taskbarLyricShowBackground",
      type: "switch",
      binding: { store: "settings", path: "system.taskbarLyric.showBackground" },
      defaultValue: false,
    },
    {
      key: "taskbarLyricFontSize",
      type: "slider",
      binding: { store: "settings", path: "system.taskbarLyric.fontSize" },
      min: 12,
      max: 20,
      step: 1,
      defaultValue: 14,
      marks: { 12: "12", 14: "14", 17: "17", 20: "20" },
    },
    {
      key: "taskbarLyricFontWeight",
      type: "slider",
      binding: { store: "settings", path: "system.taskbarLyric.fontWeight" },
      min: 100,
      max: 900,
      step: 100,
      defaultValue: 400,
      marks: { 100: "100", 400: "400", 700: "700", 900: "900" },
    },
    {
      key: "taskbarLyricShowCover",
      type: "switch",
      binding: { store: "settings", path: "system.taskbarLyric.showCover" },
      defaultValue: true,
    },
    {
      key: "taskbarLyricWordByWord",
      type: "switch",
      binding: { store: "settings", path: "system.taskbarLyric.wordByWord" },
      defaultValue: true,
    },
    {
      key: "taskbarLyricDoubleLine",
      type: "switch",
      binding: { store: "settings", path: "system.taskbarLyric.doubleLine" },
      defaultValue: true,
    },
    {
      key: "taskbarLyricShowTranslation",
      type: "switch",
      binding: { store: "settings", path: "system.taskbarLyric.showTranslation" },
      defaultValue: true,
    },
  ],
};

const externalLyricCategory: SettingCategory = {
  id: "externalLyric",
  icon: IconLucideMonitor,
  sections: [
    // taskbarLyric 仅 Windows 可用
    ...(navigator.platform.startsWith("Win") ? [taskbarLyricSection] : []),
  ],
};

export default externalLyricCategory;
