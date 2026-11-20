import type { Ref } from "vue";

/** 磁吸位移系数（X/Y），原型 mag 数值 */
const MAGNETIC_X = 0.22;
const MAGNETIC_Y = 0.28;

/**
 * 指针磁吸悬停：元素随指针微位移，离开复位
 * 直接写 inline transform，不经过 Vue 响应式；按压时的 active:scale 会被 inline 覆盖（与原型行为一致）
 * @param target - 目标元素 ref（组件 ref 需先归一化出 $el）
 */
export const useMagnetic = (target: Ref<HTMLElement | null>): void => {
  const reduce = usePreferredReducedMotion();
  const onMove = (e: PointerEvent): void => {
    const el = target.value;
    if (!el || reduce.value === "reduce") return;
    const rect = el.getBoundingClientRect();
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height / 2;
    el.style.transform = `translate(${(dx * MAGNETIC_X).toFixed(1)}px, ${(dy * MAGNETIC_Y).toFixed(1)}px)`;
  };
  const onLeave = (): void => {
    const el = target.value;
    if (el) el.style.transform = "";
  };
  useEventListener(target, "pointermove", onMove);
  useEventListener(target, "pointerleave", onLeave);
};
