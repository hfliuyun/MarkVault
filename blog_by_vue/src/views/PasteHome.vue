<script setup>
import { Delete, Link, Plus, Refresh, Tickets } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { createPaste, deletePaste, listPastes } from '@/api/paste';
import { useAuth } from '@/composables/useAuth';

const router = useRouter();
const { checkAuth, isAuthenticated, requireAuth } = useAuth();

const form = reactive({
  title: '',
  content: '',
  language: 'text',
  expires_in: '1d',
});

const pastes = ref([]);
const loadingList = ref(false);
const creating = ref(false);
const deletingId = ref('');
const lastCreated = ref(null);

const languageOptions = ['text', 'javascript', 'python', 'json', 'yaml', 'bash', 'css', 'html', 'markdown'];
const expiryOptions = [
  { label: '1 小时', value: '1h' },
  { label: '1 天', value: '1d' },
  { label: '1 周', value: '1w' },
  { label: '永不过期', value: 'never' },
];

const canCreate = computed(() => form.content.trim().length > 0);

function displayTitle(paste) {
  if (paste.title) return paste.title;
  if (paste.content) return paste.content.slice(0, 30);
  return `Paste ${paste.id}`;
}

function formatTime(value) {
  if (!value) return '永不过期';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function pasteUrl(paste) {
  return `${window.location.origin}${window.location.pathname}#/paste/${paste.id}`;
}

async function copyText(text, message = '已复制') {
  await navigator.clipboard.writeText(text);
  ElMessage.success(message);
}

async function loadPastes() {
  if (!isAuthenticated.value) return;
  loadingList.value = true;
  try {
    const data = await listPastes();
    pastes.value = data.pastes || [];
  } catch (error) {
    if (error.response?.status !== 401) {
      ElMessage.error(error.response?.data?.error || '加载 Paste 列表失败');
    }
  } finally {
    loadingList.value = false;
  }
}

async function handleCreate() {
  if (!canCreate.value) {
    ElMessage.warning('请输入要同步的内容');
    return;
  }

  creating.value = true;
  try {
    await requireAuth();
    const paste = await createPaste({ ...form });
    lastCreated.value = paste;
    form.title = '';
    form.content = '';
    await loadPastes();
    ElMessage.success('Paste 已创建');
  } catch (error) {
    if (error.message !== 'Authentication cancelled') {
      ElMessage.error(error.response?.data?.error || '创建 Paste 失败');
    }
  } finally {
    creating.value = false;
  }
}

async function handleDelete(paste) {
  deletingId.value = paste.id;
  try {
    await requireAuth();
    await deletePaste(paste.id);
    pastes.value = pastes.value.filter((item) => item.id !== paste.id);
    ElMessage.success('Paste 已删除');
  } catch (error) {
    if (error.message !== 'Authentication cancelled') {
      ElMessage.error(error.response?.data?.error || '删除 Paste 失败');
    }
  } finally {
    deletingId.value = '';
  }
}

onMounted(async () => {
  await checkAuth();
  await loadPastes();
});
</script>

<template>
  <section class="paste-page">
    <header class="page-heading glass-panel">
      <h1>剪贴板</h1>
      <p>跨设备同步文本、配置和代码片段。</p>
    </header>

    <section class="paste-grid">
      <form class="paste-editor glass-panel" @submit.prevent="handleCreate">
        <div class="field">
          <label for="paste-title">标题</label>
          <input id="paste-title" v-model="form.title" class="paste-input" placeholder="可选" />
        </div>

        <div class="field">
          <label for="paste-content">内容</label>
          <textarea
            id="paste-content"
            v-model="form.content"
            class="paste-textarea"
            placeholder="粘贴文本、代码或配置..."
          />
        </div>

        <div class="paste-toolbar">
          <label class="select-field">
            <span>语言</span>
            <select v-model="form.language">
              <option v-for="language in languageOptions" :key="language" :value="language">
                {{ language }}
              </option>
            </select>
          </label>

          <label class="select-field">
            <span>过期</span>
            <select v-model="form.expires_in">
              <option v-for="option in expiryOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <el-button type="primary" native-type="submit" :loading="creating" :disabled="!canCreate">
            <el-icon><Plus /></el-icon>
            创建 Paste
          </el-button>
        </div>

        <div v-if="lastCreated" class="created-tip">
          <span>分享链接：{{ pasteUrl(lastCreated) }}</span>
          <el-button text @click="copyText(pasteUrl(lastCreated), '链接已复制')">
            <el-icon><Link /></el-icon>
            复制
          </el-button>
        </div>
      </form>

      <aside class="paste-list glass-panel">
        <div class="list-title">
          <div>
            <h2>最近 Paste</h2>
            <p>{{ isAuthenticated ? '仅管理员可见' : '登录后查看列表' }}</p>
          </div>
          <el-button text :disabled="!isAuthenticated" :loading="loadingList" @click="loadPastes">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>

        <div v-if="!isAuthenticated" class="empty-state">
          点击创建或登录后查看已有 Paste。
        </div>

        <div v-else-if="loadingList" class="empty-state">
          正在加载...
        </div>

        <div v-else-if="!pastes.length" class="empty-state">
          还没有 Paste。
        </div>

        <div v-else class="paste-items">
          <article
            v-for="paste in pastes"
            :key="paste.id"
            class="paste-item"
            @click="router.push({ name: 'PasteView', params: { id: paste.id } })"
          >
            <div class="paste-item-main">
              <span class="language-tag">{{ paste.language || 'text' }}</span>
              <h3>{{ displayTitle(paste) }}</h3>
              <p>{{ formatTime(paste.created_at) }} · {{ formatTime(paste.expires_at) }}</p>
            </div>
            <div class="paste-item-actions" @click.stop>
              <el-button text @click="copyText(pasteUrl(paste), '链接已复制')">
                <el-icon><Tickets /></el-icon>
              </el-button>
              <el-button text :loading="deletingId === paste.id" @click="handleDelete(paste)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </article>
        </div>
      </aside>
    </section>
  </section>
</template>

<style scoped>
.paste-page {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.paste-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.8fr);
  gap: 24px;
}

.paste-editor,
.paste-list {
  padding: 24px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.field label,
.select-field span {
  color: var(--blog-subtle);
  font-size: 14px;
  font-weight: 600;
}

.paste-input,
.paste-textarea,
.select-field select {
  border: 1px solid var(--blog-border);
  border-radius: var(--radius-md);
  background: var(--blog-surface);
  color: var(--blog-text);
  outline: none;
}

.paste-input,
.select-field select {
  height: 42px;
  padding: 0 12px;
}

.paste-textarea {
  min-height: 360px;
  padding: 14px;
  resize: vertical;
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  line-height: 1.6;
}

.paste-toolbar {
  display: flex;
  align-items: end;
  gap: 14px;
  flex-wrap: wrap;
}

.select-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 140px;
}

.created-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--blog-surface);
  color: var(--blog-subtle);
  overflow-wrap: anywhere;
}

.list-title {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 18px;
}

.list-title h2 {
  margin: 0 0 6px;
  font-size: 20px;
  color: var(--blog-text);
}

.list-title p,
.empty-state {
  margin: 0;
  color: var(--blog-muted);
}

.empty-state {
  padding: 30px 0;
  text-align: center;
}

.paste-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.paste-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--blog-border);
  border-radius: var(--radius-md);
  background: var(--blog-surface);
  cursor: pointer;
}

.paste-item h3 {
  margin: 8px 0 6px;
  font-size: 16px;
  color: var(--blog-text);
}

.paste-item p {
  margin: 0;
  color: var(--blog-muted);
  font-size: 13px;
}

.language-tag {
  display: inline-flex;
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--blog-accent) 16%, transparent);
  color: var(--blog-accent);
  font-size: 12px;
  font-weight: 700;
}

.paste-item-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
}

@media (max-width: 860px) {
  .paste-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .paste-editor,
  .paste-list {
    padding: 18px;
  }

  .paste-toolbar {
    align-items: stretch;
  }

  .select-field,
  .paste-toolbar .el-button {
    width: 100%;
  }
}
</style>
