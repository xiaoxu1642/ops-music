<script setup lang="ts">
import {
  type AbstractBaseRenderer,
  type BaseRenderer,
  BackgroundRender as CoreBackgroundRender,
  MeshGradientRenderer,
  IsolationRenderer,
  PixiRenderer,
} from "@applemusic-like-lyrics/core";
import type { PlayerBgRenderer } from "@/types/settings";
import { PLAYER_BG_DEFAULT_RENDER_SCALE, PLAYER_BG_MAX_FPS } from "@/utils/playerBackground";

const RENDERER_MAP: Record<PlayerBgRenderer, new (canvas: HTMLCanvasElement) => BaseRenderer> = {
  mesh: MeshGradientRenderer,
  isolation: IsolationRenderer,
  pixi: PixiRenderer,
};

export interface BackgroundRenderProps {
  /** 专辑封面资源 URL */
  album?: string;
  /** 动画流动速度，默认为 2 */
  flowSpeed?: number;
  /** 是否有歌词，默认为 true */
  hasLyric?: boolean;
  /** 帧率，默认为 30 */
  fps?: number;
  /** 渲染缩放比例，默认为 0.35 */
  renderScale?: number;
  /** 渲染引擎标识，默认为 'mesh' */
  renderEngine?: PlayerBgRenderer;
  /** 自定义渲染器类（若指定则优先于 renderEngine） */
  renderer?: new (...args: ConstructorParameters<typeof BaseRenderer>) => BaseRenderer;
}

const props = withDefaults(defineProps<BackgroundRenderProps>(), {
  flowSpeed: 2,
  hasLyric: true,
  fps: PLAYER_BG_MAX_FPS,
  renderScale: PLAYER_BG_DEFAULT_RENDER_SCALE,
  renderEngine: "mesh",
});

const wrapperRef = ref<HTMLDivElement | null>(null);

// 外部渲染器实例引用
const bgRenderRef = shallowRef<AbstractBaseRenderer>();

/**
 * 统一同步更新属性状态到底层渲染器
 */
const updateRendererState = () => {
  const renderer = bgRenderRef.value;
  if (!renderer) return;

  if (props.album) {
    renderer.setAlbum(props.album, false);
  }
  renderer.setFPS(props.fps);
  renderer.setRenderScale(props.renderScale);
  renderer.setHasLyric(props.hasLyric);
  startMotion();
};

/**
 * 启动渲染循环：实例挂载即运行，暂停/隐藏由父组件直接卸载本组件
 */
const startMotion = () => {
  const renderer = bgRenderRef.value;
  if (!renderer) return;
  renderer.setStaticMode(false);
  renderer.setFlowSpeed(props.flowSpeed);
  renderer.resume();
};

const getRendererClass = () => {
  if (props.renderer) return props.renderer;
  return RENDERER_MAP[props.renderEngine ?? "mesh"] ?? MeshGradientRenderer;
};

/**
 * 初始化底层渲染器并挂载至 DOM
 */
const initRenderer = () => {
  if (!wrapperRef.value) return;

  const RendererClass = getRendererClass();
  bgRenderRef.value = CoreBackgroundRender.new(RendererClass);

  const el = bgRenderRef.value.getElement();
  el.style.width = "100%";
  el.style.height = "100%";
  el.style.display = "block";
  wrapperRef.value.appendChild(el);

  updateRendererState();
};

/**
 * 释放渲染器资源并清空容器
 */
const destroyRenderer = () => {
  const renderer = bgRenderRef.value;
  if (renderer) {
    renderer.pause();
    const el = renderer.getElement();
    el?.remove();
    renderer.dispose();
    bgRenderRef.value = undefined;
  }
};

onMounted(() => {
  initRenderer();
});

onBeforeUnmount(() => {
  destroyRenderer();
});

// 监听渲染器引擎切换，平滑重建实例
watch(
  () => [props.renderEngine, props.renderer],
  () => {
    destroyRenderer();
    initRenderer();
  },
);

// 属性变化监听
watch(
  () => props.album,
  (val) => {
    if (val && bgRenderRef.value) {
      bgRenderRef.value.setAlbum(val, false);
    }
  },
);

watch(
  () => props.fps,
  (val) => {
    bgRenderRef.value?.setFPS(val);
  },
);

watch(
  () => props.flowSpeed,
  (val) => {
    bgRenderRef.value?.setFlowSpeed(val);
  },
);

watch(
  () => props.renderScale,
  (val) => {
    bgRenderRef.value?.setRenderScale(val);
  },
);

watch(
  () => props.hasLyric,
  (val) => {
    bgRenderRef.value?.setHasLyric(val);
  },
);

defineExpose({
  bgRender: bgRenderRef,
  wrapperEl: wrapperRef,
});
</script>

<template>
  <div ref="wrapperRef" class="background-render-wrapper" aria-hidden="true" />
</template>

<style scoped>
.background-render-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;
  pointer-events: none;
}
</style>
