<script setup>
import { CopyDocument } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import yaml from 'highlight.js/lib/languages/yaml';
import 'highlight.js/styles/github.css';
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getPaste } from '@/api/paste';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('python', python);
hljs.registerLanguage('yaml', yaml);

const route = useRoute();
const paste = ref(null);
const loading = ref(true);
const errorMessage = ref('');

const highlightedContent = computed(() => {
  if (!paste.value) return '';
  const language = paste.value.language || 'text';
  if (language !== 'text' && hljs.getLanguage(language)) {
    return hljs.highlight(paste.value.content, { language }).value;
  }
  return hljs.highlightAuto(paste.value.content).value;
});

function formatTime(value) {
  if (!value) return '永不过期';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

async function copyContent() {
  await navigator.clipboard.writeText(paste.value?.content || '');
  ElMessage.success('内容已复制');
}

onMounted(async () => {
  loading.value = true;
  try {
    paste.value = await getPaste(route.params.id);
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Paste 不存在或已过期';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <section class="paste-view-page">
    <div v-if="loading" class="glass-panel paste-state">
      正在加载...
    </div>

    <div v-else-if="errorMessage" class="glass-panel paste-state">
      <h1>找不到 Paste</h1>
      <p>{{ errorMessage }}</p>
      <router-link to="/paste">返回剪贴板</router-link>
    </div>

    <article v-else class="paste-view glass-panel">
      <header class="paste-view-header">
        <div>
          <span class="language-tag">{{ paste.language || 'text' }}</span>
          <h1>{{ paste.title || `Paste ${paste.id}` }}</h1>
          <p>创建于 {{ formatTime(paste.created_at) }} · 过期 {{ formatTime(paste.expires_at) }}</p>
        </div>
        <el-button type="primary" @click="copyContent">
          <el-icon><CopyDocument /></el-icon>
          复制内容
        </el-button>
      </header>

      <pre class="code-block"><code v-html="highlightedContent"></code></pre>
    </article>
  </section>
</template>

<style scoped>
.paste-view-page {
  width: min(1000px, 100%);
  margin: 0 auto;
}

.paste-state,
.paste-view {
  padding: 28px;
}

.paste-state {
  text-align: center;
  color: var(--blog-subtle);
}

.paste-state h1 {
  margin: 0 0 10px;
  color: var(--blog-text);
}

.paste-state a {
  color: var(--blog-accent);
}

.paste-view-header {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
  margin-bottom: 22px;
}

.paste-view-header h1 {
  margin: 10px 0 8px;
  color: var(--blog-text);
  font-size: 30px;
  line-height: 1.25;
}

.paste-view-header p {
  margin: 0;
  color: var(--blog-muted);
}

.language-tag {
  display: inline-flex;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--blog-accent) 16%, transparent);
  color: var(--blog-accent);
  font-size: 12px;
  font-weight: 700;
}

.code-block {
  margin: 0;
  padding: 20px;
  overflow: auto;
  border: 1px solid var(--blog-border);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.76);
  color: #24292f;
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  line-height: 1.65;
  white-space: pre;
}

[data-theme='dark'] .code-block {
  background: rgba(13, 17, 23, 0.86);
  color: #c9d1d9;
}

@media (max-width: 640px) {
  .paste-state,
  .paste-view {
    padding: 20px;
  }

  .paste-view-header {
    flex-direction: column;
  }

  .paste-view-header .el-button {
    width: 100%;
  }
}
</style>
