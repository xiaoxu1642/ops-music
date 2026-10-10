import type { Ref } from "vue";
import type { Collection } from "@/types/collection";
import { useUserStore } from "@/stores/user";
import { toast } from "@/composables/useToast";

/**
 * 通用收藏 / 取消收藏
 *
 * 当前支持：netease playlist / album
 * 待接入：netease radio
 */
export const useCollectionSubscribe = (collection: Ref<Collection | null>) => {
  const { t } = useI18n();
  const userStore = useUserStore();
  const busy = ref(false);
  /** 不在已加载分页中的歌单：详情接口校正后的收藏状态 */
  const verifiedSubscribed = ref<boolean | null>(null);
  /** 校正请求序号，切换歌单或本地已定结果后作废旧响应 */
  let verifySeq = 0;

  /** 已加载分页内的收藏状态，不在分页中时为 undefined */
  const loadedSubscribed = computed<boolean | undefined>(() => {
    const current = collection.value;
    if (!current || current.source !== "netease" || current.type !== "playlist") return undefined;
    return userStore.resolveLoadedPlaylistSubscribe(current.id);
  });

  /** 当前是否已收藏 */
  const isSubscribed = computed(() => {
    const current = collection.value;
    if (!current || current.source !== "netease") return false;
    if (current.type === "playlist") {
      return loadedSubscribed.value ?? verifiedSubscribed.value ?? false;
    }
    if (current.type === "album") {
      return userStore.albums.some((item) => item.id === current.id);
    }
    return false;
  });

  /** 是否显示收藏按钮：仅 netease，且不是自建（自建无法再"收藏"） */
  const available = computed(() => {
    const current = collection.value;
    if (!current || current.source !== "netease") return false;
    if (current.type === "playlist") {
      return !userStore.createdPlaylists.some((item) => item.id === current.id);
    }
    if (current.type === "album") return true;
    return false;
  });

  /** 异步校正收藏状态，仅针对不在已加载分页中的歌单 */
  const verifySubscribed = async (): Promise<void> => {
    const current = collection.value;
    if (!current || current.source !== "netease" || current.type !== "playlist") return;
    if (loadedSubscribed.value !== undefined || !available.value) return;
    const id = current.id;
    const seq = ++verifySeq;
    try {
      const subscribed = await userStore.resolvePlaylistSubscribe(id);
      if (seq !== verifySeq || collection.value?.id !== id) return;
      if (subscribed !== undefined) verifiedSubscribed.value = subscribed;
    } catch {
      // 校正失败时保留本地判定
    }
  };

  /** 切换歌单时丢弃旧歌单的校正结果 */
  watch(
    () => collection.value?.id,
    () => {
      verifiedSubscribed.value = null;
    },
  );

  watch([() => collection.value?.id, loadedSubscribed, available], () => {
    void verifySubscribed();
  });

  /** 切换收藏状态 */
  const toggle = async (): Promise<void> => {
    const current = collection.value;
    if (!current || busy.value || !available.value) return;
    busy.value = true;
    try {
      const next = !isSubscribed.value;
      if (current.type === "playlist") {
        await userStore.togglePlaylistSubscribe(current.id, next);
        // 分页刷新后该歌单可能仍不在已加载前缀内，本地固定结果避免按钮回跳为未收藏
        if (collection.value?.id === current.id) {
          verifySeq += 1;
          verifiedSubscribed.value = next;
        }
      } else if (current.type === "album") {
        await userStore.toggleAlbumSubscribe(current.id, next);
      }
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t("liked.toast.failed");
      toast.error(message);
    } finally {
      busy.value = false;
    }
  };

  return { available, isSubscribed, busy, toggle };
};
