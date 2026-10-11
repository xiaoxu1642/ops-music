<script setup lang="ts" generic="T">
export interface SVirtualListExposed {
  wrapperRef: HTMLElement | null;
  /** 实际滚动容器 */
  scrollRef: HTMLElement | null;
  contentRef: HTMLElement | null;
  actualStartIndex: number;
  scrollTo: (top: number, behavior?: ScrollBehavior) => void;
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
  getScrollTop: () => number;
  getItemTop: (index: number) => number;
  getDropInfoByOffset: (offsetY: number) => { index: number; position: "top" | "bottom" };
}

export interface SVirtualListProps<T> {
  /** 列表数据 */
  items: T[];
  /** 每项高度 */
  itemHeight: number;
  /** 容器高度，支持 CSS 值 */
  height?: number | string;
  /** 顶部内边距（px） */
  paddingTop?: number;
  /** 底部内边距（px） */
  paddingBottom?: number;
  /** 上下额外渲染的缓冲项数 */
  bufferSize?: number;
  /** 初始滚动到的索引 */
  defaultScrollIndex?: number;
  /** 获取唯一键 */
  getItemKey?: (item: T, index: number) => string | number;
  /** 隐藏滚动条 */
  hideScrollbar?: boolean;
  /** 封面主题色 */
  cover?: boolean;
}

const props = withDefaults(defineProps<SVirtualListProps<T>>(), {
  height: "100%",
  paddingTop: 0,
  paddingBottom: 0,
  bufferSize: 5,
  getItemKey: (_item: T, index: number) => index,
});

const emit = defineEmits<{
  scroll: [event: Event];
  reachBottom: [];
}>();

const wrapperRef = ref<HTMLElement | null>(null);
const scrollRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const scrollTop = ref(0);

// 测量滚动容器高度
const { height: scrollViewportHeight } = useElementSize(scrollRef);

const containerHeightStyle = computed(() =>
  typeof props.height === "number" ? `${props.height}px` : props.height,
);

const viewportHeight = computed(() => scrollViewportHeight.value || 0);

const totalHeight = computed(() => props.items.length * props.itemHeight + props.paddingTop);

const actualStartIndex = ref(0);
const actualEndIndex = ref(0);

/** 根据滚动位置计算可见范围 */
const calculateVisibleRange = (currentScrollTop: number): void => {
  if (props.items.length === 0) {
    actualStartIndex.value = 0;
    actualEndIndex.value = -1;
    return;
  }
  const vHeight = viewportHeight.value;
  if (!vHeight) return;

  // 扣掉顶部 padding 后再换算项索引
  const effectiveScroll = Math.max(0, currentScrollTop - props.paddingTop);
  const startIndex = Math.floor(effectiveScroll / props.itemHeight);
  const endIndex = startIndex + Math.ceil(vHeight / props.itemHeight);

  const newStart = Math.max(0, startIndex - props.bufferSize);
  const newEnd = Math.min(props.items.length - 1, endIndex + props.bufferSize);
  if (newStart !== actualStartIndex.value || newEnd !== actualEndIndex.value) {
    actualStartIndex.value = newStart;
    actualEndIndex.value = newEnd;
  }
};

const visibleItems = computed(() => {
  if (actualStartIndex.value > actualEndIndex.value) return [];
  return props.items.slice(actualStartIndex.value, actualEndIndex.value + 1);
});

let rafId: number | null = null;
let pendingScrollTarget: HTMLElement | null = null;
let pendingScrollEvent: Event | null = null;

const processScroll = (): void => {
  rafId = null;
  const target = pendingScrollTarget;
  if (!target) return;
  // 消费端在 @scroll 里写响应式状态，必须与下面的范围计算同帧，否则绕过这层 RAF 节流
  if (pendingScrollEvent) emit("scroll", pendingScrollEvent);
  pendingScrollEvent = null;
  const { scrollTop: st, scrollHeight, clientHeight } = target;
  scrollTop.value = st;
  calculateVisibleRange(st);
  if (scrollHeight - st - clientHeight < 50) {
    emit("reachBottom");
  }
};

const handleScroll = (event: Event): void => {
  const target = event.target as HTMLElement;
  if (!target) return;
  pendingScrollTarget = target;
  pendingScrollEvent = event;
  if (rafId === null) {
    rafId = requestAnimationFrame(processScroll);
  }
};

/** 获取指定索引项的顶部偏移（含 paddingTop） */
const getItemTop = (index: number): number => index * props.itemHeight + props.paddingTop;

/** 根据 Y 轴偏移量计算放置位置（供拖拽排序使用） */
const getDropInfoByOffset = (offsetY: number): { index: number; position: "top" | "bottom" } => {
  const len = props.items.length;
  if (len === 0) return { index: 0, position: "top" };
  // 扣掉 paddingTop，落到项坐标系
  const adjusted = offsetY - props.paddingTop;
  const index = Math.floor(adjusted / props.itemHeight);
  const remainder = ((adjusted % props.itemHeight) + props.itemHeight) % props.itemHeight;
  const position = remainder < props.itemHeight / 2 ? "top" : "bottom";
  return { index: Math.max(0, Math.min(index, len - 1)), position };
};

/** 滚动到指定像素位置 */
const scrollToPosition = (top: number, behavior: ScrollBehavior = "auto"): void => {
  scrollRef.value?.scrollTo({ top, behavior });
};

/** 滚动到指定索引项 */
const scrollToIndex = (index: number, behavior: ScrollBehavior = "auto"): void => {
  if (props.items.length === 0) return;
  const targetIndex = Math.max(0, Math.min(index, props.items.length - 1));
  scrollToPosition(targetIndex * props.itemHeight, behavior);
};

/** 获取当前滚动位置 */
const getScrollTop = (): number => scrollTop.value;

watch([() => props.items, () => props.items.length], () => {
  calculateVisibleRange(scrollTop.value);
});

watch(viewportHeight, () => {
  calculateVisibleRange(scrollTop.value);
});

onMounted(() => {
  calculateVisibleRange(0);
  if (props.defaultScrollIndex) scrollToIndex(props.defaultScrollIndex);
  nextTick(() => {
    if (viewportHeight.value > 0) calculateVisibleRange(scrollTop.value);
  });
});

/** 滚动位置 */
let savedScrollTop = 0;

onDeactivated(() => {
  const domTop = scrollRef.value?.scrollTop;
  savedScrollTop = domTop && domTop > 0 ? domTop : scrollTop.value;
});

/** 恢复滚动位置并重算可见范围 */
onActivated(() => {
  const targetTop = savedScrollTop > 0 ? savedScrollTop : scrollTop.value;
  if (targetTop > 0) {
    scrollTop.value = targetTop;
    calculateVisibleRange(targetTop);
    nextTick(() => {
      scrollRef.value?.scrollTo({ top: targetTop });
      calculateVisibleRange(targetTop);
    });
  }
});

onUnmounted(() => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
});

defineExpose({
  wrapperRef,
  scrollRef,
  contentRef,
  actualStartIndex,
  scrollTo: scrollToPosition,
  scrollToIndex,
  getScrollTop,
  getItemTop,
  getDropInfoByOffset,
});
</script>

<template>
  <div
    ref="wrapperRef"
    class="w-full flex flex-col [overflow-anchor:none] contain-[layout_paint]"
    :style="{ height: containerHeightStyle }"
  >
    <div v-if="items.length === 0 && $slots.empty" class="flex-1 flex items-center justify-center">
      <slot name="empty" />
    </div>
    <template v-else>
      <div v-if="$slots.header" class="shrink-0">
        <slot name="header" />
      </div>
      <div
        ref="scrollRef"
        class="flex-1 min-h-0 overflow-y-auto"
        :class="[
          hideScrollbar ? '[&::-webkit-scrollbar]:hidden' : '',
          cover
            ? '[&::-webkit-scrollbar-thumb]:bg-cover/25 [&::-webkit-scrollbar-thumb:hover]:bg-cover/45'
            : '',
        ]"
        @scroll="handleScroll"
      >
        <div
          v-show="items.length > 0"
          :style="{
            height: `${totalHeight}px`,
            position: 'relative',
            transition: 'height 0.3s ease',
          }"
        >
          <div ref="contentRef" class="absolute inset-x-0 top-0">
            <div
              v-for="(item, visibleIdx) in visibleItems"
              :key="getItemKey(item, actualStartIndex + visibleIdx)"
              class="absolute inset-x-0 top-0 contain-[layout_paint]"
              :style="{ transform: `translateY(${getItemTop(actualStartIndex + visibleIdx)}px)` }"
            >
              <slot :item="item" :index="actualStartIndex + visibleIdx" />
            </div>
          </div>
        </div>
        <div v-if="$slots.footer && items.length > 0" class="shrink-0">
          <slot name="footer" />
        </div>
        <!-- 底部 spacer -->
        <div v-if="paddingBottom > 0" class="shrink-0" :style="{ height: `${paddingBottom}px` }" />
      </div>
    </template>
  </div>
</template>
