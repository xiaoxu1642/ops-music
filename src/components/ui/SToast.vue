<script setup lang="ts">
import {
  useToast,
  setMaxToasts,
  type ToastType,
  type ToastActionItem,
} from "@/composables/useToast";

const props = withDefaults(defineProps<{ max?: number }>(), { max: 5 });

setMaxToasts(props.max);

const { toasts, remove } = useToast();

/** 点击操作按钮：先执行回调再关闭 toast */
const onAction = (id: number, action: ToastActionItem): void => {
  action.onClick?.();
  remove(id);
};

/** 图标色 */
const iconStyles: Record<ToastType, string> = {
  default: "text-on-surface-variant",
  loading: "text-on-surface-variant",
  info: "text-blue-500",
  success: "text-green-600",
  warning: "text-amber-500",
  error: "text-red-500",
};

const onBeforeLeave = (el: Element): void => {
  const htmlEl = el as HTMLElement;
  const rect = htmlEl.getBoundingClientRect();
  htmlEl.style.position = "fixed";
  htmlEl.style.top = `${rect.top}px`;
  htmlEl.style.left = `${rect.left}px`;
  htmlEl.style.width = `${rect.width}px`;
  htmlEl.style.margin = "0";
};
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed bottom-24 inset-x-0 z-999 flex flex-col items-center gap-2 pointer-events-none"
    >
      <TransitionGroup
        enter-active-class="transition-[opacity,transform] duration-250 ease-[cubic-bezier(0.4,0,0.2,1)]"
        leave-active-class="transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.4,0,1,1)]"
        enter-from-class="scale-95 opacity-0"
        leave-to-class="scale-95 opacity-0"
        move-class="transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
        @before-leave="onBeforeLeave"
      >
        <div
          v-for="item in toasts"
          :key="item.id"
          class="pointer-events-auto border border-solid border-outline-variant/30 rounded-lg px-3.5 py-2.5 flex items-center gap-2.5 text-sm bg-surface-bright text-on-surface shadow-lg whitespace-nowrap will-change-transform"
        >
          <!-- 图标 -->
          <template v-if="item.icon !== false">
            <component
              :is="item.icon"
              v-if="item.icon"
              class="size-5 shrink-0"
              :class="iconStyles[item.type]"
            />
            <template v-else>
              <SLoading v-if="item.type === 'loading'" class="size-5 shrink-0" />
              <IconMaterialSymbolsChatBubbleRounded
                v-else-if="item.type === 'default'"
                class="size-5 shrink-0"
                :class="iconStyles.default"
              />
              <IconMaterialSymbolsInfoRounded
                v-else-if="item.type === 'info'"
                class="size-5 shrink-0"
                :class="iconStyles.info"
              />
              <IconMaterialSymbolsCheckCircleRounded
                v-else-if="item.type === 'success'"
                class="size-5 shrink-0"
                :class="iconStyles.success"
              />
              <IconMaterialSymbolsErrorRounded
                v-else-if="item.type === 'warning'"
                class="size-5 shrink-0"
                :class="iconStyles.warning"
              />
              <IconMaterialSymbolsCancelRounded
                v-else-if="item.type === 'error'"
                class="size-5 shrink-0"
                :class="iconStyles.error"
              />
            </template>
          </template>
          <span>{{ item.message }}</span>
          <div v-if="item.actions?.length" class="flex shrink-0 items-center gap-1.5">
            <button
              v-for="action in item.actions"
              :key="action.label"
              class="shrink-0 px-2 py-0.5 rounded-md border-none bg-primary text-on-primary text-xs cursor-pointer transition-colors duration-200 hover:bg-primary/90"
              @click="onAction(item.id, action)"
            >
              {{ action.label }}
            </button>
          </div>
          <button
            v-if="item.closable"
            class="shrink-0 p-0 border-none bg-transparent opacity-40 hover:opacity-100 cursor-pointer text-current leading-0 transition-opacity duration-200"
            @click="remove(item.id)"
          >
            <IconLucideX class="size-3.5" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
