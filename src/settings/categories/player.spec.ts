import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, defineComponent, h } from "vue";
import { createI18n } from "vue-i18n";
import SettingsItem from "@/components/settings/SettingsItem.vue";
import playerCategory from "./player";

const mocks = vi.hoisted(() => ({
  enabled: false as boolean | string,
  cache: { enabled: false },
  player: { preloadNextTrack: false, transitionMode: "none" },
  confirm: vi.fn(),
  setSystem: vi.fn(),
}));
vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({
    system: { cache: { songCache: mocks.cache } },
    player: mocks.player,
    setSystem: mocks.setSystem,
  }),
}));
vi.mock("@/composables/useDialog", () => ({ dialog: { confirm: mocks.confirm } }));
vi.mock("@/settings/useSettingModel", () => ({
  useSettingModel: () =>
    computed({
      get: () => mocks.enabled,
      set: (value: boolean | string) => {
        mocks.enabled = value;
      },
    }),
}));
vi.mock("@/components/settings/custom/DeviceSelector.vue", () => ({ default: {} }));
vi.mock("~icons/lucide/play", () => ({ default: {} }));
vi.mock("@/utils/config", () => ({ isWin: true }));
vi.mock("@/core/player", () => ({ getActiveDeviceId: vi.fn() }));
vi.mock("@/services/deviceVolume", () => ({ setDeviceVolume: vi.fn() }));
vi.mock("@/stores/status", () => ({ useStatusStore: () => ({ volume: 1 }) }));

const item = playerCategory
  .sections!.flatMap((section) => section.items)
  .find((item) => item.key === "preloadNextTrack")!;
const transitionItem = playerCategory
  .sections!.flatMap((section) => section.items)
  .find((item) => item.key === "transitionMode")!;
const Switch = defineComponent({
  name: "SSwitch",
  emits: ["update:modelValue"],
  setup:
    (_props, { emit }) =>
    () =>
      h("button", { onClick: () => emit("update:modelValue", true) }, "enable"),
});
const Select = defineComponent({
  name: "SSelect",
  emits: ["update:modelValue"],
  setup:
    (_props, { emit }) =>
    () =>
      h(
        "span",
        {},
        {
          default: () => [
            h(
              "button",
              { "data-mode": "crossfade", onClick: () => emit("update:modelValue", "crossfade") },
              "crossfade",
            ),
            h(
              "button",
              { "data-mode": "automix", onClick: () => emit("update:modelValue", "automix") },
              "automix",
            ),
          ],
        },
      ),
});

describe("开启预载的缓存确认", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = false;
    mocks.cache = { enabled: false };
    mocks.player.preloadNextTrack = false;
    mocks.player.transitionMode = "none";
    mocks.setSystem.mockResolvedValue(undefined);
  });

  for (const confirmed of [false, true]) {
    it(confirmed ? "确认后开启预载及歌曲缓存" : "取消后不改变预载和缓存设置", async () => {
      mocks.confirm.mockResolvedValue(confirmed);
      const wrapper = mount(SettingsItem, {
        props: { item },
        global: {
          plugins: [
            createI18n({ legacy: false, locale: "zh-CN", missingWarn: false, fallbackWarn: false }),
          ],
          stubs: { SSwitch: Switch },
        },
      });
      await wrapper.get("button").trigger("click");
      await flushPromises();
      expect(mocks.confirm).toHaveBeenCalledOnce();
      expect(mocks.enabled).toBe(confirmed);
      if (confirmed) {
        expect(mocks.setSystem.mock.calls).toEqual([["cache.songCache.enabled", true]]);
      } else {
        expect(mocks.setSystem).not.toHaveBeenCalled();
      }
      wrapper.unmount();
    });
  }

  it("歌曲缓存已经开启时无需再次确认", () => {
    mocks.cache = { enabled: true };
    expect(item.confirm!.when!(true)).toBe(false);
    expect(item.confirm!.when!(false)).toBe(false);
  });
});

describe("播放过渡设置", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled = "none";
    mocks.cache = { enabled: false };
    mocks.player.preloadNextTrack = false;
    mocks.player.transitionMode = "none";
    mocks.setSystem.mockResolvedValue(undefined);
  });

  it("选择交叉过渡时不弹高占用确认并启用预载和缓存", async () => {
    mocks.confirm.mockResolvedValue(true);
    const wrapper = mount(SettingsItem, {
      props: { item: transitionItem },
      global: {
        plugins: [
          createI18n({ legacy: false, locale: "zh-CN", missingWarn: false, fallbackWarn: false }),
        ],
        stubs: { SSelect: Select },
      },
    });
    await wrapper.get('[data-mode="crossfade"]').trigger("click");
    await flushPromises();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.enabled).toBe("crossfade");
    expect(mocks.player.preloadNextTrack).toBe(true);
    expect(mocks.setSystem).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  for (const confirmed of [false, true]) {
    it(confirmed ? "确认 AutoMix 时启用预载和缓存" : "取消 AutoMix 确认时保留无过渡", async () => {
      mocks.confirm.mockResolvedValue(confirmed);
      const wrapper = mount(SettingsItem, {
        props: { item: transitionItem },
        global: {
          plugins: [
            createI18n({ legacy: false, locale: "zh-CN", missingWarn: false, fallbackWarn: false }),
          ],
          stubs: { SSelect: Select },
        },
      });
      await wrapper.get('[data-mode="automix"]').trigger("click");
      await flushPromises();
      expect(mocks.confirm).toHaveBeenCalledOnce();
      expect(mocks.enabled).toBe(confirmed ? "automix" : "none");
      expect(mocks.player.preloadNextTrack).toBe(confirmed);
      expect(mocks.setSystem).toHaveBeenCalledTimes(confirmed ? 1 : 0);
      wrapper.unmount();
    });
  }

  it("只有切入 AutoMix 时提示高占用", () => {
    mocks.cache = { enabled: true };
    expect(transitionItem.confirm!.when!("crossfade")).toBe(false);
    expect(transitionItem.confirm!.when!("automix")).toBe(true);
    expect(transitionItem.confirm!.when!("none")).toBe(false);
    expect(transitionItem.confirm!.whenCurrent!("none")).toBe(true);
    expect(transitionItem.confirm!.whenCurrent!("crossfade")).toBe(true);
    expect(transitionItem.confirm!.whenCurrent!("automix")).toBe(false);
  });
});

describe("AutoMix 环境感知设置", () => {
  const children = () =>
    playerCategory
      .sections!.find((section) => section.id === "playbackTransition")!
      .items.find((item) => item.key === "transitionMode")!.children!;

  beforeEach(() => {
    mocks.player.transitionMode = "none";
  });

  it("全屏策略与低剩余阈值绑定到主进程配置", () => {
    const policy = children().find((child) => child.key === "automixFullscreenPolicy")!;
    expect(policy.binding!.path).toBe("system.player.automixFullscreenPolicy");
    expect(policy.options!.map((option) => option.value)).toEqual([
      "auto",
      "skipDemucs",
      "beatOnly",
      "unlimited",
    ]);
    expect(policy.defaultValue).toBe("auto");
    const guard = children().find((child) => child.key === "automixLowRemainingGuardMs")!;
    expect(guard.binding!.path).toBe("system.player.automixLowRemainingGuardMs");
    expect(guard.defaultValue).toBe(0);
  });

  it("只在 AutoMix 过渡方式下可见", () => {
    const policy = children().find((child) => child.key === "automixFullscreenPolicy")!;
    const guard = children().find((child) => child.key === "automixLowRemainingGuardMs")!;
    expect(policy.visible!()).toBe(false);
    expect(guard.visible!()).toBe(false);
    mocks.player.transitionMode = "automix";
    expect(policy.visible!()).toBe(true);
    expect(guard.visible!()).toBe(true);
  });
});
