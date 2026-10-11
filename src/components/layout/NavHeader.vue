<script setup lang="ts">
import { useSettingsDialog } from "@/settings/useSettingsDialog";
import { useWindowControls } from "@/composables/useWindowControls";

const router = useRouter();
const { show: showSettings } = useSettingsDialog();
const { isBorderless } = useWindowControls();
</script>

<template>
  <div class="flex items-center justify-between flex-1 h-full min-w-0 app-drag-region">
    <!-- 左侧 -->
    <div class="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
      <SButton
        class="app-no-drag shrink-0"
        variant="tertiary"
        circle
        :size="40"
        :icon-size="20"
        @click="router.back()"
      >
        <template #icon><IconLucideChevronLeft /></template>
      </SButton>
      <SButton
        class="app-no-drag shrink-0"
        variant="tertiary"
        circle
        :size="40"
        :icon-size="20"
        @click="router.forward()"
      >
        <template #icon><IconLucideChevronRight /></template>
      </SButton>
      <NavSearch />
    </div>
    <!-- 中间 -->
    <div class="flex-1 h-full min-w-4" />
    <!-- 右侧 -->
    <div class="flex items-center gap-2 sm:gap-3 shrink-0">
      <TaskbarLyricQuickToggle />
      <NavUser />
      <SButton
        class="app-no-drag shrink-0"
        variant="tertiary"
        circle
        :size="40"
        @click="showSettings()"
      >
        <template #icon><IconLucideSettings /></template>
      </SButton>
      <SDivider v-if="isBorderless" vertical />
      <WindowControls />
    </div>
  </div>
</template>
