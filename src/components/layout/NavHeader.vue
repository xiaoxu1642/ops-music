<script setup lang="ts">
import { useSettingsDialog } from "@/settings/useSettingsDialog";
import { useWindowControls } from "@/composables/useWindowControls";
import { useMagnetic } from "@/composables/useMagnetic";

const router = useRouter();
const { show: showSettings } = useSettingsDialog();
const { isBorderless } = useWindowControls();

// 墨极光磁吸悬停：仅顶栏前进/后退按钮（原型 mag 范围）；SButton ref 归一化出根 button 元素
const backBtnRef = ref<{ $el: HTMLElement } | null>(null);
const fwdBtnRef = ref<{ $el: HTMLElement } | null>(null);
const backBtnEl = computed(() => backBtnRef.value?.$el ?? null);
const fwdBtnEl = computed(() => fwdBtnRef.value?.$el ?? null);
useMagnetic(backBtnEl);
useMagnetic(fwdBtnEl);
</script>

<template>
  <div class="flex items-center justify-between flex-1 h-full min-w-0 app-drag-region">
    <!-- 左侧 -->
    <div class="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
      <SButton
        ref="backBtnRef"
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
        ref="fwdBtnRef"
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
