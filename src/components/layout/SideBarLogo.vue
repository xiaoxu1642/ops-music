<script setup lang="ts">
import { useThemeStore } from "@/stores/theme";

defineProps<{
  collapsed: boolean;
}>();

const router = useRouter();
const theme = useThemeStore();

const goHome = (): void => {
  router.push("/");
};
</script>

<template>
  <div class="flex items-center justify-between h-16 shrink-0 pl-3 pr-4">
    <div
      role="link"
      tabindex="0"
      class="inline-flex items-center cursor-pointer transform-gpu transition-transform duration-300 hover:scale-105 active:scale-100"
      @click="goHome"
    >
      <SLogo :size="30" class="shrink-0" />
      <span
        class="text-[22px] text-primary mt-0.5 leading-10 overflow-hidden whitespace-nowrap font-logo transition-[width,opacity,margin] duration-300"
        :class="collapsed ? 'w-0 opacity-0 ml-0' : 'w-[112px] ml-2'"
      >
        Ops Music
      </span>
    </div>
    <!-- 暗黑模式快捷切换：亮色显示月亮（进暗色），暗色显示太阳（回亮色） -->
    <SButton
      v-if="!collapsed"
      variant="tertiary"
      circle
      :size="28"
      :icon-size="16"
      :title="theme.isDark ? $t('theme.toLight') : $t('theme.toDark')"
      @click="theme.toggleThemeMode()"
    >
      <template #icon>
        <IconLucideSun v-if="theme.isDark" />
        <IconLucideMoon v-else />
      </template>
    </SButton>
  </div>
</template>
