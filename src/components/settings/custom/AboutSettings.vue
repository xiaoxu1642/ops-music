<script setup lang="ts">
import { useCopyText } from "@/composables/useCopyText";
import { openExternal } from "@/utils/url";
import {
  APP_VERSION,
  REPO_URL,
  REPO_NAME,
  IS_APPX,
  COMMIT_HASH,
  COMMIT_DATE,
} from "@/utils/config";
import IconLucideArrowUpRight from "~icons/lucide/arrow-up-right";

const props = defineProps<{ highlightKey?: string }>();

/**
 * 与通用设置区块保持相同的入场节奏，搜索定位时取消延迟
 * @param index - 标题或内容组在页面中的动画顺序
 * @returns 入场动画的延迟和填充方式
 */
const itemStyle = (index: number) => ({
  animationDelay: props.highlightKey ? "0s" : `${index * 0.03}s`,
  animationFillMode: "backwards" as const,
});

const { t } = useI18n();
const { copy } = useCopyText();

/** 提交时间 */
const commitTimeAgo = useTimeAgo(new Date(COMMIT_DATE));
/** 当前版本 */
const versions = window.electron.process.versions;
/** 操作系统信息 */
const osInfo = window.api.system.osInfo;

/** 打开日志目录 */
const handleOpenLogs = (): void => void window.api.system.openLogsDir();

interface EnvItem {
  label: string;
  value?: string;
  url?: string;
}

/** 环境信息列表 */
const envItems = computed<EnvItem[]>(() => [
  {
    label: t("settings.about.commit"),
    value: COMMIT_HASH,
    url: `${REPO_URL}/commit/${COMMIT_HASH}`,
  },
  {
    label: t("settings.about.date"),
    value: `${COMMIT_DATE} (${commitTimeAgo.value})`,
  },
  { label: "Electron", value: versions.electron },
  { label: "Chromium", value: versions.chrome },
  { label: "Node.js", value: versions.node },
  { label: "V8", value: versions.v8 },
  { label: "OS", value: `${osInfo.type} ${osInfo.arch} ${osInfo.release}` },
]);

/** 复制环境信息 */
const handleCopyEnvInfo = (): void => {
  const info = envItems.value.map((item) => `${item.label}: ${item.value}`).join("\n");
  copy(info);
};

interface Dependency {
  name: string;
  description: string;
  url: string;
}

/** 依赖的开源项目 */
const dependencies: Dependency[] = [
  {
    name: "applemusic-like-lyrics",
    description: "类 Apple Music 歌词显示组件库",
    url: "https://github.com/Steve-xmh/applemusic-like-lyrics",
  },
  {
    name: "NeteaseCloudMusicApiEnhanced",
    description: "网易云音乐 API 备份 + 增强",
    url: "https://github.com/neteasecloudmusicapienhanced/api-enhanced",
  },
];
</script>

<template>
  <div class="flex flex-col gap-8">
    <!-- 关于软件 -->
    <section>
      <h3
        class="animate-slide-in-item flex items-center gap-2 text-lg font-semibold text-on-surface mb-3 px-1"
        :style="itemStyle(0)"
      >
        <span class="w-0.75 h-4 rounded-full bg-primary" />
        {{ t("settings.section.aboutApp") }}
      </h3>
      <SCard
        variant="settings"
        :bordered="false"
        radius="xl"
        class="animate-slide-in-item flex flex-wrap items-center gap-4"
        :style="itemStyle(1)"
      >
        <SLogo :size="34" />
        <div class="flex items-center gap-2 mr-auto">
          <span class="text-lg font-logo text-on-surface">{{ REPO_NAME }}</span>
          <STag type="primary" size="small" round>v{{ APP_VERSION }}</STag>
          <STag v-if="IS_APPX" type="primary" size="small" round>
            {{ t("settings.storeVersion") }}
          </STag>
        </div>
        <div class="flex items-center gap-2">
          <SButton variant="secondary" @click="handleOpenLogs">
            {{ t("settings.about.openLogs") }}
          </SButton>
        </div>
      </SCard>
    </section>
    <!-- 特别致谢 -->
    <section>
      <h3
        class="animate-slide-in-item flex items-center gap-2 text-lg font-semibold text-on-surface mb-3 px-1"
        :style="itemStyle(2)"
      >
        <span class="w-0.75 h-4 rounded-full bg-primary" />
        {{ t("settings.section.specialThanks") }}
      </h3>
      <div class="animate-slide-in-item grid grid-cols-3 gap-2.5" :style="itemStyle(3)">
        <SCard
          v-for="dep in dependencies"
          :key="dep.name"
          variant="settings"
          hoverable
          :bordered="false"
          class="group text-left"
          @click="openExternal(dep.url)"
        >
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-medium text-on-surface truncate">{{ dep.name }}</span>
            <IconLucideArrowUpRight
              class="size-3.5 text-on-surface-variant/40 group-hover:text-primary transition-colors"
            />
          </div>
          <div class="text-xs text-on-surface-variant/70 mt-0.5 line-clamp-1">
            {{ dep.description }}
          </div>
        </SCard>
      </div>
    </section>

    <!-- 环境信息 -->
    <section>
      <div
        class="animate-slide-in-item flex items-center justify-between mb-3 px-1"
        :style="itemStyle(4)"
      >
        <h3 class="flex items-center gap-2 text-lg font-semibold text-on-surface">
          <span class="w-0.75 h-4 rounded-full bg-primary" />
          {{ t("settings.section.envInfo") }}
        </h3>
        <SButton variant="ghost" circle size="small" @click="handleCopyEnvInfo">
          <template #icon><IconLucideCopy /></template>
        </SButton>
      </div>
      <SCard
        variant="settings"
        :bordered="false"
        radius="xl"
        class="animate-slide-in-item break-all select-text space-y-1.5"
        :style="itemStyle(5)"
      >
        <div
          v-for="item in envItems"
          :key="item.label"
          class="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-2"
        >
          <span class="text-on-surface/60 shrink-0">{{ item.label }}:</span>
          <a
            v-if="item.url"
            class="text-on-surface hover:text-primary cursor-pointer flex items-center gap-1 w-fit transition-colors"
            @click.prevent="openExternal(item.url!)"
          >
            {{ item.value }}
            <IconLucideArrowUpRight class="size-3 shrink-0" />
          </a>
          <span v-else class="text-on-surface break-words">{{ item.value }}</span>
        </div>
      </SCard>
    </section>
  </div>
</template>
