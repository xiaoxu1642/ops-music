<script setup lang="ts">
import type { CommentTab, MusicCommentPage } from "@shared/types/comment";
import { useStatusStore } from "@/stores/status";
import { toast } from "@/composables/useToast";
import { formatDate } from "@/utils/time";
import IconLucideThumbsUp from "~icons/lucide/thumbs-up";

const { t } = useI18n();
const status = useStatusStore();

const activeTab = ref<CommentTab>("hot");
const loadingCount = ref(0);
const error = ref("");
const listScrollRef = ref<HTMLElement | null>(null);
let loadingEpoch = 0;
const pages = reactive<Record<CommentTab, MusicCommentPage>>({
  hot: { list: [], total: 0, page: 1, limit: 20 },
  new: { list: [], total: 0, page: 1, limit: 20 },
});
const requestTokens = reactive<Record<CommentTab, number>>({
  hot: 0,
  new: 0,
});

const tabs = computed(() =>
  (["hot", "new"] as const).map((key) => ({
    key,
    label: `${t(`comments.${key}`)} (${pages[key].total})`,
  })),
);

const loading = computed(() => loadingCount.value > 0);
const page = computed(() => pages[activeTab.value]);
const maxPage = computed(() =>
  Math.max(1, Math.ceil(page.value.total / Math.max(1, page.value.limit))),
);

/** 评论图片按显示尺寸降档，避免大图常驻内存 */
const sizedImage = (url: string, size: number): string => {
  if (!url.startsWith("http")) return url;
  if (url.includes("?param=")) return url.replace(/param=\d+y\d+/, `param=${size}y${size}`);
  if (url.includes("?")) return url;
  return `${url}?param=${size}y${size}`;
};

const resetPages = (): void => {
  requestTokens.hot += 1;
  requestTokens.new += 1;
  pages.hot = { list: [], total: 0, page: 1, limit: 20 };
  pages.new = { list: [], total: 0, page: 1, limit: 20 };
};

const loadPage = async (type: CommentTab, pageNo = 1): Promise<void> => {
  const track = status.commentsTrack;
  if (!track) return;
  const token = requestTokens[type] + 1;
  requestTokens[type] = token;
  const epoch = loadingEpoch;
  loadingCount.value += 1;
  error.value = "";
  try {
    const result = await window.api.comments.get({
      track: toRaw(track),
      type,
      page: pageNo,
      limit: pages[type].limit,
    });
    if (!result.ok) throw new Error(result.error);
    if (!status.commentsOpen || requestTokens[type] !== token) return;
    if (status.commentsTrack !== track) return;
    pages[type] = result.data;
  } catch (err) {
    if (!status.commentsOpen || requestTokens[type] !== token) return;
    error.value = err instanceof Error ? err.message : String(err);
    toast.error(error.value);
  } finally {
    if (epoch === loadingEpoch) loadingCount.value = Math.max(0, loadingCount.value - 1);
  }
};

const refresh = async (): Promise<void> => {
  resetPages();
  await Promise.all((["hot", "new"] as const).map((type) => loadPage(type)));
  await nextTick();
  listScrollRef.value?.scrollTo({ top: 0 });
};

const changePage = async (delta: number): Promise<void> => {
  const next = Math.min(maxPage.value, Math.max(1, page.value.page + delta));
  if (next === page.value.page) return;
  await loadPage(activeTab.value, next);
  await nextTick();
  listScrollRef.value?.scrollTo({ top: 0 });
};

watch(
  () => status.commentsOpen,
  async (open) => {
    if (!open) {
      loadingEpoch += 1;
      loadingCount.value = 0;
      requestTokens.hot += 1;
      requestTokens.new += 1;
      return;
    }
    await refresh();
  },
);

watch(activeTab, async (next, prev) => {
  if (!status.commentsOpen || next === prev) return;
  await nextTick();
  listScrollRef.value?.scrollTo({ top: 0 });
});
</script>

<template>
  <SDialog
    v-model:open="status.commentsOpen"
    :title="
      status.commentsTrack
        ? t('comments.title', { name: status.commentsTrack.title })
        : t('comments.name')
    "
    width="min(860px, 92vw)"
    height="min(720px, 84vh)"
    destroy-on-close
  >
    <div class="flex h-full min-h-0 flex-col gap-3 px-5 pb-4">
      <div class="flex shrink-0 items-center gap-3">
        <div class="min-w-0 flex-1">
          <STabs v-model="activeTab" :tabs="tabs" type="bar" size="medium" />
        </div>
        <SButton variant="ghost" circle size="small" :loading="loading" @click="refresh">
          <template #icon><IconLucideRefreshCw /></template>
        </SButton>
      </div>

      <div
        v-if="error && page.list.length === 0"
        class="flex flex-1 flex-col items-center justify-center gap-3"
      >
        <div class="text-sm text-on-surface-variant">{{ error }}</div>
        <SButton variant="outline" @click="loadPage(activeTab, page.page)">
          {{ t("common.retry") }}
        </SButton>
      </div>
      <div
        v-else-if="page.list.length === 0 && loading"
        class="flex flex-1 items-center justify-center text-on-surface-variant"
      >
        <div class="text-center text-on-surface-variant/60">
          <SLoading class="mx-auto mb-4 block text-4xl text-primary/70" />
          <div class="text-sm">{{ t("comments.loading") }}</div>
        </div>
      </div>
      <div
        v-else-if="page.list.length === 0"
        class="flex flex-1 items-center justify-center text-on-surface-variant"
      >
        <div class="text-center text-on-surface-variant/60">
          <IconLucideMessageCircleOff class="mx-auto mb-4 size-14 opacity-30" />
          <div class="text-sm">{{ t("comments.empty") }}</div>
        </div>
      </div>
      <div v-else ref="listScrollRef" class="min-h-0 flex-1 overflow-y-auto pr-1">
        <div class="space-y-1.5">
          <SCard v-for="item in page.list" :key="item.id" size="small" radius="lg">
            <div class="flex gap-3">
              <SImg
                v-if="item.avatar"
                :src="sizedImage(item.avatar, 72)"
                class="h-9 w-9 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                alt=""
              />
              <div v-else class="h-9 w-9 shrink-0 rounded-full bg-on-surface/8" />
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-medium">{{ item.userName }}</div>
                    <div class="mt-0.5 flex gap-2 text-xs text-on-surface-variant">
                      <span v-if="item.time">{{ formatDate(item.time) }}</span>
                      <span v-if="item.location">
                        {{ t("comments.location", { location: item.location }) }}
                      </span>
                    </div>
                  </div>
                  <div
                    v-if="item.likedCount != null"
                    class="flex shrink-0 items-center gap-1 text-xs tabular-nums text-on-surface-variant"
                  >
                    <IconLucideThumbsUp class="size-3.5" />
                    <span>{{ item.likedCount }}</span>
                  </div>
                </div>
                <p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6">
                  {{ item.text }}
                </p>
                <div
                  v-if="item.images?.length"
                  class="mt-2 grid w-fit max-w-full grid-cols-3 gap-1.5"
                >
                  <SImg
                    v-for="(image, index) in item.images"
                    :key="image"
                    :src="sizedImage(image, item.images.length === 1 ? 320 : 192)"
                    :alt="`${item.userName} ${index + 1}`"
                    :class="[
                      'aspect-square max-w-full rounded-lg ring-1 ring-black/10 dark:ring-white/10',
                      item.images.length === 1 ? 'w-48' : 'w-24',
                    ]"
                  />
                </div>
                <div v-if="item.reply?.length" class="mt-2 rounded-md bg-on-surface/5 px-3 py-2">
                  <div
                    v-for="reply in item.reply"
                    :key="reply.id"
                    class="text-xs leading-5 text-on-surface-variant"
                  >
                    <span class="font-medium text-on-surface">{{ reply.userName }}：</span>
                    {{ reply.text }}
                  </div>
                </div>
              </div>
            </div>
          </SCard>
        </div>
      </div>

      <div
        v-if="page.list.length"
        class="flex shrink-0 items-center justify-between text-xs text-on-surface-variant"
      >
        <span>{{ t("comments.page", { page: page.page, total: maxPage }) }}</span>
        <div class="flex gap-2">
          <SButton
            size="small"
            variant="secondary"
            :disabled="page.page <= 1 || loading"
            @click="changePage(-1)"
          >
            {{ t("common.prev") }}
          </SButton>
          <SButton
            size="small"
            variant="secondary"
            :disabled="page.page >= maxPage || loading"
            @click="changePage(1)"
          >
            {{ t("common.next") }}
          </SButton>
        </div>
      </div>
    </div>
  </SDialog>
</template>
