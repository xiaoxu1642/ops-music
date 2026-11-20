<script setup lang="ts">
import { useStatusStore } from "@/stores/status";
import { useThemeStore } from "@/stores/theme";

const props = withDefaults(
  defineProps<{
    /** 挂载面是否可见，不可见时停 RAF，恢复后自动续 */
    active?: boolean;
  }>(),
  { active: true },
);

const status = useStatusStore();
const theme = useThemeStore();
const { isPlaying } = storeToRefs(status);
const prefersReducedMotion = usePreferredReducedMotion();

/** 柱数，与原型一致 */
const BAR_COUNT = 34;
/** 暂停/降低动效下的基线振幅 */
const IDLE_LEVEL = 0.06;
/** 峰值低于该值视为已收敛到基线，可停 RAF */
const IDLE_PEAK = IDLE_LEVEL + 0.005;

const amp = new Float32Array(BAR_COUNT);
const canvasRef = ref<HTMLCanvasElement | null>(null);
let rafId = 0;
let last = 0;
let hue = 343;
/** 引擎真实频谱柱（Rust SPECTRUM_BARS=34 对齐），null 表示尚未收到过推送 */
let realBars: Float32Array | null = null;
let lastRealAt = 0;
let unsubscribeSpectrum: (() => void) | null = null;
/** 真数据新鲜度窗口：超时视为引擎无推送（暂停/未加载），回退假 FFT 或基线 */
const REAL_DATA_TTL = 150;

/** 色相真源是 applyThemeToDOM 写入根元素的 --s-hue，canvas 读缓存值即时跟随 */
const readHue = (): void => {
  const n = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--s-hue"),
  );
  if (Number.isFinite(n)) hue = n;
};

const fitCanvas = (): void => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(2, Math.round(rect.width * dpr));
  canvas.height = Math.max(2, Math.round(rect.height * dpr));
};

/** 单柱目标振幅：叠层正弦假 FFT（原型同款公式，引擎真数据不可用时的回退装饰频谱） */
const targetAt = (i: number, t: number): number => {
  const x = i / BAR_COUNT;
  const env =
    0.35 + 0.65 * Math.exp(-x * 1.8) + 0.25 * Math.sin(x * 9 + t * 1.7) * Math.exp(-x * 3);
  const wave =
    Math.sin(t * 2.1 + i * 0.55) * Math.cos(t * 1.3 + i * 0.23) +
    0.35 * Math.sin(t * 3.7 + i * 1.1);
  return Math.max(0.08, Math.min(1, (0.3 + 0.7 * Math.abs(wave)) * env));
};

const draw = (): void => {
  const canvas = canvasRef.value;
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = `hsla(${hue}, 90%, 62%, 1)`;
  const barW = w / BAR_COUNT;
  const gap = barW * 0.35;
  for (let i = 0; i < BAR_COUNT; i++) {
    const barH = Math.max(2, amp[i] * h);
    const x = i * barW + gap / 2;
    const w2 = barW - gap;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(x, h - barH, w2, barH, barW * 0.3);
      ctx.fill();
    } else {
      ctx.fillRect(x, h - barH, w2, barH);
    }
  }
};

const stopLoop = (): void => {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
};

const tick = (now: number): void => {
  const dt = Math.min(50, now - last);
  last = now;
  const t = now / 1000;
  const k = prefersReducedMotion.value === "reduce" ? 1 : Math.min(1, dt * 0.012);
  const useReal =
    realBars !== null &&
    prefersReducedMotion.value !== "reduce" &&
    now - lastRealAt < REAL_DATA_TTL;
  let peak = 0;
  for (let i = 0; i < BAR_COUNT; i++) {
    const target = useReal
      ? (realBars as Float32Array)[i]
      : isPlaying.value && prefersReducedMotion.value !== "reduce"
        ? targetAt(i, t)
        : IDLE_LEVEL;
    amp[i] += (target - amp[i]) * k;
    if (amp[i] > peak) peak = amp[i];
  }
  draw();
  if (!isPlaying.value && peak <= IDLE_PEAK) {
    stopLoop();
    return;
  }
  rafId = requestAnimationFrame(tick);
};

const resume = (): void => {
  if (rafId || !props.active || document.hidden) return;
  if (prefersReducedMotion.value === "reduce") {
    amp.fill(IDLE_LEVEL);
    draw();
    return;
  }
  last = performance.now();
  rafId = requestAnimationFrame(tick);
};

watch(
  () => props.active,
  (on) => (on ? resume() : stopLoop()),
);
watch(isPlaying, (on) => on && resume());
watch(prefersReducedMotion, (value) => {
  if (value === "reduce") {
    stopLoop();
    amp.fill(IDLE_LEVEL);
    draw();
  } else {
    resume();
  }
});
watch(
  () => theme.coverColor,
  () => readHue(),
);
useEventListener(document, "visibilitychange", () => {
  if (document.hidden) stopLoop();
  else resume();
});
useResizeObserver(canvasRef, () => {
  fitCanvas();
  // 循环停止期间（暂停收敛/降低动效）尺寸变化会清空画布，补一帧当前振幅
  if (!rafId) draw();
});

onMounted(() => {
  readHue();
  fitCanvas();
  resume();
  // 引擎真频谱：暂停后 Rust 端静默检测输出全零，柱体经平滑自然落底
  unsubscribeSpectrum = window.api.player.onSpectrum(({ bars }) => {
    if (realBars === null || realBars.length !== bars.length) realBars = new Float32Array(bars);
    for (let i = 0; i < realBars.length; i++) realBars[i] = bars[i];
    lastRealAt = performance.now();
  });
});
onBeforeUnmount(() => {
  stopLoop();
  unsubscribeSpectrum?.();
  unsubscribeSpectrum = null;
});
</script>

<template>
  <canvas ref="canvasRef" class="size-full" aria-hidden="true" />
</template>
