<script setup lang="ts">
import { useBilibiliAccountStore } from "@/stores/bilibiliAccount";
import { toast } from "@/composables/useToast";
import { dialog } from "@/composables/useDialog";

defineProps<{ open: boolean }>();

const emit = defineEmits<{ "update:open": [value: boolean] }>();

const { t } = useI18n();
const account = useBilibiliAccountStore();

/** 网页登录窗口打开期间保持 pending */
const loading = ref(false);

/** 打开官方登录窗口，窗口返回后向 nav 校验身份 */
const handleLogin = async (): Promise<void> => {
  loading.value = true;
  try {
    const result = await window.api.apis.openLoginWeb("bilibili");
    if (!result.ok) {
      if (result.error !== "canceled") toast.error(t("login.failed"));
      return;
    }
    if (await account.fetchStatus()) toast.success(t("login.success"));
    else toast.error(t("login.failed"));
  } finally {
    loading.value = false;
  }
};

const handleLogout = async (): Promise<void> => {
  const ok = await dialog.confirm({
    title: t("login.logoutConfirmTitle"),
    content: t("login.bilibiliLogoutConfirmDesc"),
    type: "warning",
  });
  if (!ok) return;
  await account.logout();
  toast.success(t("login.logoutDone"));
};
</script>

<template>
  <SDialog
    :open="open"
    :title="t('login.bilibiliTitle')"
    width="380px"
    @update:open="emit('update:open', $event)"
  >
    <!-- 已登录：身份与登出 -->
    <div v-if="account.profile" class="flex flex-col items-center gap-3 py-3">
      <span
        class="size-16 rounded-full overflow-hidden bg-on-surface/10 flex items-center justify-center"
      >
        <img
          v-if="account.profile.face"
          :src="account.profile.face"
          alt="avatar"
          class="size-full object-cover"
          decoding="async"
        />
        <IconLucideTv v-else class="size-7 text-on-surface-variant" />
      </span>
      <div class="flex flex-col items-center gap-1">
        <span class="text-sm font-semibold text-on-surface max-w-[16rem] truncate">
          {{ account.profile.uname }}
        </span>
        <span class="text-xs text-on-surface-variant/70 tabular-nums">
          UID {{ account.profile.mid }}
        </span>
      </div>
      <SDivider class="w-full" />
      <SButton variant="secondary" size="small" @click="handleLogout">
        <template #icon><IconLucideLogOut /></template>
        {{ t("login.logout") }}
      </SButton>
    </div>

    <!-- 未登录：网页登录 -->
    <div v-else class="flex flex-col items-center gap-4 py-3">
      <span class="size-14 rounded-full bg-on-surface/8 flex items-center justify-center">
        <IconLucideTv class="size-6 text-on-surface-variant/80" />
      </span>
      <p class="text-xs text-on-surface-variant/70 text-center leading-relaxed">
        {{ t("login.autoFetchTip") }}
      </p>
      <SButton type="primary" :loading="loading" @click="handleLogin">
        <template #icon><IconLucideGlobe2 /></template>
        {{ loading ? t("login.bilibiliWaiting") : t("login.bilibiliLogin") }}
      </SButton>
    </div>
  </SDialog>
</template>
