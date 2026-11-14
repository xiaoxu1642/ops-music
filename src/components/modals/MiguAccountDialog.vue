<script setup lang="ts">
import { useMiguAccountStore } from "@/stores/miguAccount";
import { toast } from "@/composables/useToast";
import { dialog } from "@/composables/useDialog";

defineProps<{ open: boolean }>();

const emit = defineEmits<{ "update:open": [value: boolean] }>();

const { t } = useI18n();
const account = useMiguAccountStore();

const phone = ref("");
const code = ref("");
/** send = 等待验证码输入；verify = 登录中 */
const stage = ref<"phone" | "verify">("phone");
const sending = ref(false);
const verifying = ref(false);

const phoneValid = computed(() => /^1\d{10}$/.test(phone.value.trim()));

/** 发送短信验证码 */
const handleSendCode = async (): Promise<void> => {
  sending.value = true;
  try {
    await account.sendCode(phone.value.trim());
    stage.value = "verify";
    toast.success(t("login.miguCodeSent"));
  } catch (err) {
    console.warn("[migu-account] send code failed:", err);
    toast.error(t("login.failed"));
  } finally {
    sending.value = false;
  }
};

/** 验证码登录 */
const handleVerify = async (): Promise<void> => {
  verifying.value = true;
  try {
    const ok = await account.verify(phone.value.trim(), code.value.trim());
    if (ok) {
      toast.success(t("login.success"));
      emit("update:open", false);
    } else {
      toast.error(t("login.failed"));
    }
  } catch (err) {
    console.warn("[migu-account] verify failed:", err);
    toast.error(t("login.failed"));
  } finally {
    verifying.value = false;
  }
};

const handleLogout = async (): Promise<void> => {
  const ok = await dialog.confirm({
    title: t("login.logoutConfirmTitle"),
    content: t("login.miguLogoutConfirmDesc"),
    type: "warning",
  });
  if (!ok) return;
  await account.logout();
  toast.success(t("login.logoutDone"));
};

/** 回到手机号输入步骤（重发验证码） */
const backToPhone = (): void => {
  stage.value = "phone";
  code.value = "";
};
</script>

<template>
  <SDialog
    :open="open"
    :title="t('login.miguTitle')"
    width="380px"
    @update:open="emit('update:open', $event)"
  >
    <!-- 已登录：身份与登出 -->
    <div v-if="account.profile" class="flex flex-col items-center gap-3 py-3">
      <span class="size-16 rounded-full bg-on-surface/10 flex items-center justify-center">
        <IconLucideSmartphone class="size-7 text-on-surface-variant" />
      </span>
      <span class="text-sm font-semibold text-on-surface tabular-nums">
        {{ account.profile.phoneMask }}
      </span>
      <SDivider class="w-full" />
      <SButton variant="secondary" size="small" @click="handleLogout">
        <template #icon><IconLucideLogOut /></template>
        {{ t("login.logout") }}
      </SButton>
    </div>

    <!-- 未登录：手机号 → 验证码两步 -->
    <div v-else class="flex flex-col gap-4 py-3">
      <div class="flex flex-col items-center gap-3">
        <span class="size-14 rounded-full bg-on-surface/8 flex items-center justify-center">
          <IconLucideSmartphone class="size-6 text-on-surface-variant/80" />
        </span>
        <p class="text-xs text-on-surface-variant/70 text-center leading-relaxed">
          {{ t("login.miguTip") }}
        </p>
      </div>

      <div v-if="stage === 'phone'" class="flex flex-col gap-3">
        <SInput v-model="phone" :placeholder="t('login.miguPhonePlaceholder')" maxlength="11" />
        <SButton
          type="primary"
          block
          :loading="sending"
          :disabled="!phoneValid"
          @click="handleSendCode"
        >
          {{ t("login.miguSendCode") }}
        </SButton>
      </div>

      <div v-else class="flex flex-col gap-3">
        <SInput v-model="code" :placeholder="t('login.miguCodePlaceholder')" maxlength="6" />
        <SButton
          type="primary"
          block
          :loading="verifying"
          :disabled="code.trim().length < 4"
          @click="handleVerify"
        >
          {{ t("login.miguVerify") }}
        </SButton>
        <SButton variant="tertiary" size="small" block @click="backToPhone">
          {{ t("login.miguResend") }}
        </SButton>
      </div>
    </div>
  </SDialog>
</template>
