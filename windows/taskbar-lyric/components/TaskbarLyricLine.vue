<script setup lang="ts">
import type { LyricLine } from "@shared/types/lyrics";
import { getWordSweepProgress } from "lyric-kit";
import { getNowPlayingCurrentMs } from "@windows/shared/composables/useNowPlayingSync";

const props = withDefaults(
  defineProps<{
    line?: LyricLine;
    text?: string;
    wordByWord?: boolean;
    anchor?: "left" | "right";
    /** 播放中 = 逐字扫光动画推进；暂停时冻结在当前进度并停掉渲染循环 */
    live?: boolean;
    /** 暂停期间的同步修订号：每次位置事件后自增，驱动一次静态重绘 */
    syncRevision?: number;
  }>(),
  { wordByWord: false, anchor: "left", live: true, syncRevision: 0 },
);

const useKaraoke = computed(() => props.wordByWord && !!props.line);
const plainText = computed(() => props.text ?? props.line?.words.map((w) => w.word).join("") ?? "");

const wrapperRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const overflowPx = ref(0);
const isOverflow = computed(() => overflowPx.value > 0);

/** 前 30% 停在开头 */
const SCROLL_START_AT = 0.3;
/** 比 endTime 早多少滚到底 */
const END_MARGIN_MS = 2000;

const measure = (): void => {
  const outer = wrapperRef.value;
  const inner = contentRef.value;
  if (!outer || !inner) {
    overflowPx.value = 0;
    return;
  }
  const diff = inner.getBoundingClientRect().width - outer.getBoundingClientRect().width;
  overflowPx.value = diff > 0.5 ? diff : 0;
};

/** 根据进度计算平移量——溢出时始终向左滚，不做来回 */
const getScrollTransform = (currentMs: number): string => {
  const overflow = overflowPx.value;
  if (overflow <= 0 || !props.line) return "translateX(0)";
  const { startTime, endTime } = props.line;
  if (endTime <= startTime) return "translateX(0)";
  const end = Math.max(startTime + 1, endTime - END_MARGIN_MS);
  const duration = end - startTime;
  if (duration <= 0) return "translateX(0)";
  const progress = Math.max(0, Math.min(1, (currentMs - startTime) / duration));
  if (progress <= SCROLL_START_AT) return "translateX(0)";
  const ratio = (progress - SCROLL_START_AT) / (1 - SCROLL_START_AT);
  const offset = overflow * ratio;
  return `translateX(-${offset.toFixed(3)}px)`;
};

let resizeObserver: ResizeObserver | null = null;
let rafId = 0;
let lastTransform = "";
let lastSweep = -1;

const resetRenderCache = (): void => {
  lastTransform = "";
  lastSweep = -1;
};

const getSweepPercent = (currentMs: number): number => {
  if (!props.line || !useKaraoke.value) return 0;
  const { startTime, endTime, words } = props.line;
  const total = Math.max(1, endTime - startTime);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const progress = getWordSweepProgress(word, startTime, currentMs);
    if (progress >= 1) continue;
    const wordDuration = Math.max(1, word.endTime - word.startTime);
    const absolute = word.startTime - startTime + progress * wordDuration;
    return Math.min(100, Math.max(0, (absolute / total) * 100));
  }
  return 100;
};

/** 渲染一帧：按当前进度更新滚动位移与逐字扫光（脏检查，无变化不写 DOM） */
const renderOnce = (): void => {
  const currentMs = getNowPlayingCurrentMs();

  if (contentRef.value) {
    const transform = getScrollTransform(currentMs);
    if (transform !== lastTransform) {
      lastTransform = transform;
      contentRef.value.style.transform = transform;
    }
  }

  if (wrapperRef.value) {
    const sweep = useKaraoke.value ? getSweepPercent(currentMs) : 0;
    if (sweep !== lastSweep) {
      lastSweep = sweep;
      wrapperRef.value.style.setProperty("--sweep", `${sweep.toFixed(2)}%`);
    }
  }
};

const renderFrame = (): void => {
  renderOnce();
  rafId = requestAnimationFrame(renderFrame);
};

const startLoop = (): void => {
  if (rafId === 0) rafId = requestAnimationFrame(renderFrame);
};

const stopLoop = (): void => {
  if (rafId !== 0) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
};

/** 暂停态的静态刷新：不重启循环，只按当前进度重绘一帧 */
const renderStatic = (): void => {
  if (props.live) return;
  renderOnce();
};

// 播放/暂停切换：暂停立即停表并定格一帧，恢复时重启循环
watch(
  () => props.live,
  (live) => {
    if (live) {
      startLoop();
      return;
    }
    stopLoop();
    nextTick(renderOnce);
  },
);

watch(
  () => props.line,
  () => {
    resetRenderCache();
    nextTick(() => {
      measure();
      renderStatic();
    });
  },
);
watch(
  () => props.text,
  () =>
    nextTick(() => {
      measure();
      renderStatic();
    }),
);
watch(() => props.syncRevision, renderStatic);

onMounted(() => {
  resizeObserver = new ResizeObserver(measure);
  if (wrapperRef.value) resizeObserver.observe(wrapperRef.value);
  if (contentRef.value) resizeObserver.observe(contentRef.value);
  measure();
  if (props.live) {
    startLoop();
  } else {
    renderOnce();
  }
});

onBeforeUnmount(() => {
  stopLoop();
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<template>
  <div
    ref="wrapperRef"
    class="scroll-wrapper"
    :data-anchor="anchor"
    :class="{ 'is-overflow': isOverflow, 'is-karaoke': useKaraoke }"
  >
    <div ref="contentRef" class="scroll-content" :data-lyric-text="plainText">
      <template v-if="useKaraoke">
        <span v-for="(word, i) in line!.words" :key="i" class="tb-word">
          {{ word.word }}
        </span>
      </template>
      <span v-else>{{ plainText }}</span>
    </div>
  </div>
</template>

<style scoped>
.scroll-wrapper {
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-align: left;
  --sweep: 0%;
}
/* 未溢出时根据锚定方向对齐短文本；溢出时强制左对齐，让滚动从头开始 */
.scroll-wrapper[data-anchor="right"]:not(.is-overflow) {
  text-align: right;
}
.scroll-content {
  display: inline-block;
  pointer-events: auto;
  position: relative;
}
.tb-word {
  display: inline;
  color: var(--tbl-unplayed);
}
.scroll-wrapper.is-overflow .scroll-content {
  will-change: transform;
}
.scroll-wrapper.is-karaoke .tb-word {
  color: transparent;
}
.scroll-wrapper.is-karaoke .scroll-content::after {
  content: attr(data-lyric-text);
  position: absolute;
  inset: 0;
  white-space: nowrap;
  color: var(--tbl-played);
  clip-path: inset(0 calc(100% - var(--sweep)) 0 0);
}
</style>
