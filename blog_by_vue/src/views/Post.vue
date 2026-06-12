<script setup>
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import renderMathInElement from 'katex/dist/contrib/auto-render';
import hljs from 'highlight.js';

import 'highlight.js/styles/atom-one-dark.css';
import 'katex/dist/katex.min.css';

const route = useRoute();
const article = ref(null);
const loading = ref(true);
const sidebarCollapsed = ref(false);
const markdownContainer = ref(null);

const enhanceMarkdownContent = () => {
  if (!markdownContainer.value) {
    return;
  }

  renderMathInElement(markdownContainer.value, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
      { left: '\\[', right: '\\]', display: true }
    ],
    throwOnError: false,
    errorColor: '#cc0000'
  });

  markdownContainer.value.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
  });

  markdownContainer.value.querySelectorAll('pre > code').forEach(codeBlock => {
    const pre = codeBlock.parentElement;
    if (pre.parentNode.classList.contains('code-block-wrapper')) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-code-btn';
    copyBtn.type = 'button';
    copyBtn.title = 'Copy Code';
    copyBtn.textContent = 'Copy';

    copyBtn.addEventListener('click', async () => {
      const codeToCopy = codeBlock.innerText;
      try {
        await navigator.clipboard.writeText(codeToCopy);
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
      } catch (err) {
        copyBtn.textContent = 'Failed!';
      } finally {
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
          copyBtn.classList.remove('copied');
        }, 2000);
      }
    });

    wrapper.appendChild(copyBtn);
  });
};

const fetchArticle = async () => {
  loading.value = true;
  article.value = null;

  try {
    const endpoint = route.params.slug
      ? `/api/posts/${route.params.slug}`
      : `/api/p/${route.params.abbrlink}`;
    const response = await axios.get(endpoint);
    article.value = response.data;
  } catch (error) {
    console.error('获取文章详情失败:', error);
  } finally {
    loading.value = false;
  }

  if (article.value) {
    await nextTick();
    enhanceMarkdownContent();
  }
};

onMounted(fetchArticle);
watch(() => route.fullPath, fetchArticle);
</script>

<template>
  <div class="post-page-container">
    <div v-if="loading" class="post-content-card">
      <el-skeleton :rows="1" animated class="title-skeleton"/>
      <el-skeleton :rows="10" animated />
    </div>

    <div v-else-if="article" class="post-layout">
      <aside class="post-sidebar" :class="{ collapsed: sidebarCollapsed }">
        <button class="sidebar-toggle" type="button" @click="sidebarCollapsed = !sidebarCollapsed">
          {{ sidebarCollapsed ? '展开' : '收起' }}
        </button>

        <div v-if="!sidebarCollapsed" class="sidebar-content">
          <section v-if="article.series_posts?.length" class="sidebar-section">
            <h2>{{ article.series?.title || '系列文章' }}</h2>
            <ol class="series-list">
              <li
                v-for="item in article.series_posts"
                :key="item.slug"
                :class="{ active: item.slug === article.slug }"
              >
                <router-link :to="{ name: 'PostDetail', params: { slug: item.slug } }">
                  {{ item.title }}
                </router-link>
              </li>
            </ol>
          </section>

          <section v-if="article.toc?.length" class="sidebar-section">
            <h2>目录</h2>
            <nav class="toc-list">
              <a
                v-for="item in article.toc"
                :key="item.id"
                :href="`#${item.id}`"
                :class="`level-${item.level}`"
              >
                {{ item.title }}
              </a>
            </nav>
          </section>
        </div>
      </aside>

      <article class="post-content-card">
        <h1 class="post-title">{{ article.title }}</h1>
        <div class="post-meta">
          <span>发布于: {{ new Date(article.date).toLocaleDateString() }}</span>
          <span v-if="article.categories?.length">分类: {{ article.categories.join(' / ') }}</span>
          <span v-if="article.tags?.length">标签: {{ article.tags.join(' / ') }}</span>
        </div>

        <div ref="markdownContainer" class="markdown-body" v-html="article.content"></div>
      </article>
    </div>

    <div v-else class="post-content-card">
      <el-result icon="error" title="加载失败" sub-title="无法找到该文章，请检查链接或稍后再试。">
        <template #extra>
          <router-link to="/"><el-button type="primary">返回首页</el-button></router-link>
        </template>
      </el-result>
    </div>
  </div>
</template>

<style>
.post-page-container {
  padding: 24px;
  background-color: #f4f5f7;
  min-height: calc(100vh - 61px);
}

.post-layout {
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(0, 900px);
  align-items: start;
  justify-content: center;
  gap: 24px;
}

.post-sidebar {
  position: sticky;
  top: 84px;
  max-height: calc(100vh - 108px);
  overflow: auto;
  padding: 16px;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  text-align: left;
}

.post-sidebar.collapsed {
  width: 54px;
  padding: 10px;
}

.sidebar-toggle {
  width: 100%;
  border: 1px solid #dcdfe6;
  background: #fff;
  border-radius: 4px;
  padding: 6px 8px;
  cursor: pointer;
}

.sidebar-section {
  margin-top: 18px;
}

.sidebar-section h2 {
  margin: 0 0 10px;
  font-size: 15px;
  color: #303133;
}

.series-list {
  margin: 0;
  padding-left: 18px;
}

.series-list li {
  margin-bottom: 8px;
  color: #606266;
}

.series-list li.active a {
  color: #409eff;
  font-weight: 600;
}

.series-list a,
.toc-list a {
  color: inherit;
  text-decoration: none;
}

.toc-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.toc-list a {
  color: #606266;
  font-size: 14px;
}

.toc-list .level-3 {
  padding-left: 12px;
}

.toc-list .level-4,
.toc-list .level-5,
.toc-list .level-6 {
  padding-left: 24px;
}

.post-content-card {
  max-width: 900px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 30px 40px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, .1);
  text-align: left;
}

.post-title {
  font-size: 2.2em;
  margin-bottom: 10px;
  font-weight: 600;
  color: #2c3e50;
}

.post-meta {
  color: #909399;
  font-size: .9em;
  margin-bottom: 40px;
  border-bottom: 1px solid #eaecef;
  padding-bottom: 20px;
}

.post-meta span {
  margin-right: 20px;
}

.markdown-body {
  font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  line-height: 1.7;
  color: #333;
  font-size: 16px;
  overflow-wrap: break-word;
}

.markdown-body h2 {
  padding-bottom: .3em;
  border-bottom: 1px solid #eaecef;
}

.code-block-wrapper {
  position: relative;
  margin: 1.2em 0;
}

.markdown-body pre {
  margin: 0 !important;
  border-radius: 6px;
  overflow: hidden;
  white-space: pre-wrap;
  word-break: break-all;
}

.markdown-body pre code.hljs {
  display: block;
  padding: 1.2em 1.5em;
}

.copy-code-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  background-color: #3b4048;
  color: #abb2bf;
  border: 1px solid #3b4048;
  border-radius: 4px;
  padding: 4px 8px;
  font-family: sans-serif;
  cursor: pointer;
  opacity: 0;
  transition: opacity .2s ease-in-out, background-color .2s, color .2s;
}

.code-block-wrapper:hover .copy-code-btn {
  opacity: 1;
}

.copy-code-btn:hover {
  background-color: #4f5660;
}

.copy-code-btn.copied {
  background-color: #98c379;
  color: #282c34;
  border-color: #98c379;
}

.markdown-body .katex-display {
  text-align: center;
  margin: 1em 0;
}

.markdown-body .katex {
  font-size: 1.1em;
}

@media (max-width: 860px) {
  .post-page-container {
    padding: 16px;
  }

  .post-layout {
    grid-template-columns: 1fr;
  }

  .post-sidebar {
    position: static;
    max-height: none;
  }

  .post-sidebar.collapsed {
    width: auto;
  }

  .post-content-card {
    padding: 24px 20px;
  }
}
</style>
