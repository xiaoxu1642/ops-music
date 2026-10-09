import { useSettingsStore } from "@/stores/settings";

/**
 * 虚拟 binding：path 不对应任何持久化 store 字段
 * 而是映射到瞬时状态 / 一次性 action（如窗口开关、命令触发）
 * 写入通常只调 IPC / action，真实状态由广播回流驱动 UI
 */
export interface VirtualBinding {
  get: () => unknown;
  set: (value: unknown) => void;
}

/** 虚拟绑定 */
export const virtualBindings: Record<string, VirtualBinding> = {
  /** 任务栏歌词窗口 */
  isTaskbarLyricOpen: {
    get: () => useSettingsStore().isTaskbarLyricOpen,
    set: (v) => {
      const store = useSettingsStore();
      if (v === store.isTaskbarLyricOpen) return;
      window.api.window.toggleTaskbarLyric().catch(() => {});
    },
  },
};
