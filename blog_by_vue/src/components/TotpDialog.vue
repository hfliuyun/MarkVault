<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { useAuth } from '@/composables/useAuth';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:visible', 'authenticated', 'cancelled']);

const { submitTotp, resolveAuthDialog, rejectAuthDialog } = useAuth();
const inputs = ref(Array.from({ length: 6 }, () => ''));
const inputRefs = ref([]);
const loading = ref(false);
const errorMessage = ref('');

const code = computed(() => inputs.value.join(''));

const focusInput = async (index) => {
  await nextTick();
  inputRefs.value[index]?.focus?.();
};

const reset = async () => {
  inputs.value = Array.from({ length: 6 }, () => '');
  errorMessage.value = '';
  await focusInput(0);
};

watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      await reset();
    }
  }
);

const setDigit = (index, value) => {
  const digit = String(value || '').replace(/\D/g, '').slice(-1);
  inputs.value[index] = digit;
  if (digit && index < 5) {
    focusInput(index + 1);
  }
  if (inputs.value.every((item) => item)) {
    submit();
  }
};

const handleKeydown = (index, event) => {
  if (event.key === 'Backspace' && !inputs.value[index] && index > 0) {
    focusInput(index - 1);
  }
};

const submit = async () => {
  if (loading.value) return;
  if (code.value.length !== 6) {
    errorMessage.value = '请输入 6 位验证码';
    return;
  }

  loading.value = true;
  errorMessage.value = '';
  try {
    const token = await submitTotp(code.value);
    resolveAuthDialog(token);
    emit('authenticated', token);
    emit('update:visible', false);
  } catch (error) {
    errorMessage.value = error.response?.data?.error || '验证码无效，请重试';
    inputs.value = Array.from({ length: 6 }, () => '');
    await focusInput(0);
  } finally {
    loading.value = false;
  }
};

const cancel = () => {
  rejectAuthDialog();
  emit('cancelled');
  emit('update:visible', false);
};

defineExpose({ submit });
</script>

<template>
  <el-dialog
    :model-value="visible"
    width="420px"
    class="glass-dialog totp-dialog"
    title="验证登录"
    append-to-body
    @close="cancel"
  >
    <div class="totp-dialog-body">
      <section class="totp-setup">
        <h3>首次绑定</h3>
        <p>
          先在服务器终端执行
          <code>python manage.py setup_totp --account admin</code>
          ，再用 Authenticator 扫描终端二维码，或手动输入终端输出的密钥。
        </p>
      </section>

      <p class="totp-hint">绑定完成后，再输入 6 位动态验证码完成登录。</p>
      <div class="totp-inputs">
        <input
          v-for="(digit, index) in inputs"
          :key="index"
          :ref="(el) => (inputRefs[index] = el)"
          :value="digit"
          inputmode="numeric"
          maxlength="1"
          class="totp-digit"
          @input="setDigit(index, $event.target.value)"
          @keydown="handleKeydown(index, $event)"
        />
      </div>
      <p v-if="errorMessage" class="totp-error">{{ errorMessage }}</p>
      <div class="totp-actions">
        <el-button @click="cancel">取消</el-button>
        <el-button type="primary" :loading="loading" @click="submit">验证</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.totp-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.totp-hint {
  margin: 0;
  color: var(--blog-subtle);
}

.totp-setup {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--blog-border);
  background: color-mix(in srgb, var(--blog-surface) 88%, transparent);
}

.totp-setup h3 {
  margin: 0;
  font-size: 16px;
  color: var(--blog-text);
}

.totp-setup p {
  margin: 0;
  color: var(--blog-subtle);
  line-height: 1.6;
}

.totp-setup code {
  padding: 2px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--blog-accent) 10%, transparent);
  color: var(--blog-text);
}

.totp-inputs {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.totp-digit {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-md);
  border: 1px solid var(--blog-border);
  background: var(--blog-surface);
  color: var(--blog-text);
  text-align: center;
  font-size: 22px;
  outline: none;
}

.totp-digit:focus {
  border-color: var(--blog-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--blog-accent) 18%, transparent);
}

.totp-error {
  margin: 0;
  color: #d14343;
}

.totp-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
