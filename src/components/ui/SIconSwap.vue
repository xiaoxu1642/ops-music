<script setup lang="ts">
const props = defineProps<{
  /** 为真显示 on 槽图标，否则显示 off 槽 */
  active: boolean;
  /** 激活瞬间播放弹跳 + 光环扩散（喜欢等强调型切换） */
  burst?: boolean;
}>();

/** 激活次数：burst 动画以 key 重建元素重播，0 时无动画（避免初次挂载白播） */
const burstCount = ref(0);
watch(
  () => props.active,
  (on) => {
    if (on && props.burst) burstCount.value++;
  },
);
</script>

<template>
  <span class="relative inline-flex items-center justify-center">
    <span
      :key="`on-${burstCount}`"
      class="s-icon-swap absolute inset-0 inline-flex items-center justify-center *:size-full"
      :class="[{ 's-icon-swap-hidden': !active }, burst && burstCount > 0 ? 's-icon-pop' : '']"
    >
      <slot name="on" />
    </span>
    <span
      class="s-icon-swap absolute inset-0 inline-flex items-center justify-center *:size-full"
      :class="{ 's-icon-swap-hidden': active }"
    >
      <slot name="off" />
    </span>
    <span
      v-if="burst && burstCount > 0"
      :key="`ring-${burstCount}`"
      class="s-icon-ring absolute inset-0 rounded-full"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.s-icon-swap {
  transition:
    opacity 0.3s cubic-bezier(0.2, 0, 0, 1),
    transform 0.3s cubic-bezier(0.2, 0, 0, 1);
}

.s-icon-swap-hidden {
  opacity: 0;
  transform: scale(0.25);
  pointer-events: none;
}

/* 墨极光 heart burst：on 图标激活弹跳 + 主题色光环扩散 */
.s-icon-pop {
  animation: s-icon-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes s-icon-pop {
  40% {
    transform: scale(1.4);
  }
}

.s-icon-ring {
  pointer-events: none;
  border: 2px solid rgb(var(--s-primary));
  animation: s-icon-ring 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes s-icon-ring {
  from {
    opacity: 0.8;
    transform: scale(0.55);
  }
  to {
    opacity: 0;
    transform: scale(1.5);
  }
}

@media (prefers-reduced-motion: reduce) {
  .s-icon-pop,
  .s-icon-ring {
    animation: none;
  }
}
</style>
