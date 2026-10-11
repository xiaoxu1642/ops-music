<script setup lang="ts">
import { useSettingsStore } from "@/stores/settings";
import { useSettingsDialog } from "@/settings/useSettingsDialog";

const { t } = useI18n();
const settings = useSettingsStore();
const { show: showSettings } = useSettingsDialog();

/** 开关任务栏歌词窗口（开关状态由主进程广播同步） */
const enabled = computed({
  get: () => settings.isTaskbarLyricOpen,
  set: (value: boolean) => {
    if (value === settings.isTaskbarLyricOpen) return;
    window.api.window.toggleTaskbarLyric().catch(() => {});
  },
});

/** 打开任务栏歌词详细设置 */
const openTaskbarLyricSettings = (): void => {
  showSettings("externalLyric", "taskbarLyricEnabled");
};
</script>

<template>
  <div
    class="app-no-drag inline-flex items-center gap-1 h-10 pl-2 pr-2 rounded-full bg-on-surface/6 shrink-0"
  >
    <button
      class="h-8 px-2 rounded-full border-none bg-transparent text-sm text-on-surface cursor-pointer transition-colors hover:bg-on-surface/10"
      @click="openTaskbarLyricSettings"
    >
      {{ t("taskbarLyricToggle") }}
    </button>
    <SSwitch v-model="enabled" />
  </div>
</template>
