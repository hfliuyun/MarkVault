<script setup>
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import renderMathInElement from 'katex/dist/contrib/auto-render';
import hljs from 'highlight.js';
import { getPost } from '@/api/posts';

import 'highlight.js/styles/atom-one-dark.css';
import 'katex/dist/katex.min.css';

const route = useRoute();
const router = useRouter();
const article = ref(null);
const loading = ref(true);
const sidebarCollapsed = ref(false);
const markdownContainer = ref(null);
const activeHeadingId = ref('');

const formatDate = (dateText) => {
  if (!dateText) return '';
  return new Date(dateText).toLocaleDateString();
};

const decodeRouteHash = (hash) => {
  if (!hash) return '';
  try {
    return decodeURIComponent(hash.slice(1));
  } catch (error) {
    return hash.slice(1);
  }
};

const scrollToHeading = (headingId, behavior = 'smooth') => {
  const heading = document.getElementById(headingId);
  if (!heading) {
    return;
  }
  activeHeadingId.value = headingId;
  const top = heading.getBoundingClientRect().top + window.scrollY - 84;
  window.scrollTo({ top: Math.max(top, 0), behavior });
};

const handleTocClick = async (headingId) => {
  await router.replace({
    name: route.name,
    params: route.params,
    query: route.query,
    hash: `#${headingId}`,
  });
  await nextTick();
  scrollToHeading(headingId);
};

const enhanceMarkdownContent = () => {
  if (!markdownContainer.value) {
    return;
  }

  markdownContainer.value.querySelectorAll('.code-block-wrapper').forEach((wrapper) => {
    const pre = wrapper.querySelector('pre');
    if (pre && wrapper.parentNode) {
      wrapper.parentNode.insertBefore(pre, wrapper);
    }
    wrapper.remove();
  });

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
        copyBtn.textContent = '已复制';
        copyBtn.classList.add('copied');
      } catch (err) {
        copyBtn.textContent = '失败';
      } finally {
        setTimeout(() => {
          copyBtn.textContent = '复制';
          copyBtn.classList.remove('copied');
        }, 2000);
      }
    });

    copyBtn.textContent = '复制';
    wrapper.appendChild(copyBtn);
  });
};

const fetchArticle = async () => {
  loading.value = true;
  article.value = null;

  try {
    article.value = await getPost(route.params.slug);
  } catch (error) {
    console.error('获取文章详情失败:', error);
  } finally {
    loading.value = false;
  }

  if (article.value) {
    await nextTick();
    enhanceMarkdownContent();
    const headingId = decodeRouteHash(route.hash);
    if (headingId) {
      scrollToHeading(headingId, 'auto');
    }
  }
};

onMounted(fetchArticle);
watch(() => route.params.slug, fetchArticle);

watch(() => route.hash, async (hash) => {
  const headingId = decodeRouteHash(hash);
  if (!headingId || loading.value) {
    return;
  }
  await nextTick();
  scrollToHeading(headingId);
});
</script>

<template>
  <div class="post-page-container">
    <div v-if="loading" class="post-content-card">
      <el-skeleton :rows="1" animated class="title-skeleton" />
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
                  <span v-if="item.series?.order" class="series-order">{{ item.series.order }}</span>
                  {{ item.title }}
                </router-link>
              </li>
            </ol>
          </section>

          <section v-if="article.toc?.length" class="sidebar-section">
            <h2>目录</h2>
            <nav class="toc-list">
              <button
                v-for="item in article.toc"
                :key="item.id"
                type="button"
                :class="[`level-${item.level}`, { active: activeHeadingId === item.id }]"
                @click="handleTocClick(item.id)"
              >
                {{ item.title }}
              </button>
            </nav>
          </section>
        </div>
      </aside>

      <article class="post-content-card">
        <h1 class="post-title">{{ article.title }}</h1>
        <div class="post-meta">
          <span v-if="article.date">发布于 {{ formatDate(article.date) }}</span>
          <span v-if="article.categories?.length" class="post-meta-group">
            分类:
            <router-link
              v-for="category in article.categories"
              :key="category"
              :to="{ name: 'CategoryDetail', params: { category } }"
              class="post-meta-link category-link"
            >
              {{ category }}
            </router-link>
          </span>
          <span v-if="article.tags?.length" class="post-meta-group">
            标签:
            <router-link
              v-for="tag in article.tags"
              :key="tag"
              :to="{ name: 'TagDetail', params: { tag } }"
              class="post-meta-link tag-link"
            >
              {{ tag }}
            </router-link>
          </span>
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
  padding: 32px 24px 56px;
  background-color: var(--blog-bg);
  min-height: calc(100vh - 61px);
}

.post-layout {
  display: grid;
  grid-template-columns: minmax(190px, 260px) minmax(0, 860px);
  align-items: start;
  justify-content: center;
  gap: 28px;
}

.post-sidebar {
  position: sticky;
  top: 84px;
  max-height: calc(100vh - 108px);
  overflow: auto;
  padding: 14px;
  background: var(--blog-surface);
  border: 1px solid var(--blog-border);
  border-radius: 8px;
  text-align: left;
}

.post-sidebar.collapsed {
  width: 54px;
  padding: 10px;
}

.sidebar-toggle {
  width: 100%;
  border: 1px solid var(--blog-border);
  background: var(--blog-surface);
  border-radius: 4px;
  padding: 6px 8px;
  color: var(--blog-subtle);
  cursor: pointer;
}

.sidebar-section {
  margin-top: 18px;
}

.sidebar-section h2 {
  margin: 0 0 10px;
  font-size: 15px;
  color: var(--blog-text);
}

.series-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.series-list li {
  margin-bottom: 6px;
  color: var(--blog-subtle);
}

.series-list a {
  display: flex;
  gap: 8px;
  padding: 5px 0;
  line-height: 1.45;
}

.series-list li.active a {
  color: var(--blog-accent);
  font-weight: 600;
}

.series-order {
  min-width: 18px;
  color: var(--blog-muted);
  font-variant-numeric: tabular-nums;
}

.series-list a,
.toc-list button {
  color: inherit;
  text-decoration: none;
}

.toc-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.toc-list button {
  width: 100%;
  border: 0;
  background: transparent;
  color: var(--blog-subtle);
  font-size: 14px;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
}

.toc-list button.active,
.toc-list button:hover {
  color: var(--blog-accent);
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
  max-width: 860px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 0;
  background-color: transparent;
  text-align: left;
}

.post-title {
  margin: 0 0 12px;
  color: var(--blog-text);
  font-size: 36px;
  line-height: 1.25;
  font-weight: 600;
}

.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  color: var(--blog-muted);
  font-size: 14px;
  margin-bottom: 34px;
  border-bottom: 1px solid var(--blog-border);
  padding-bottom: 18px;
}

.post-meta span {
  margin-right: 0;
}

.post-meta-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 7px;
}

.post-meta-link {
  color: inherit;
  text-decoration: none;
}

.post-meta-link:hover {
  color: var(--blog-accent);
}

.post-meta-link.category-link:not(:last-child)::after {
  content: "/";
  padding-left: 7px;
  color: var(--blog-muted);
}

.post-meta-link.tag-link {
  padding: 0 7px;
  border: 1px solid var(--blog-border);
  border-radius: 4px;
  background: var(--blog-surface);
  font-size: 12px;
}

.markdown-body {
  font-family: var(--blog-font);
  line-height: 1.75;
  color: var(--blog-text);
  font-size: 16px;
  overflow-wrap: break-word;
}

.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4,
.markdown-body h5,
.markdown-body h6 {
  color: var(--blog-text);
  line-height: 1.35;
}

.markdown-body h2 {
  margin-top: 2em;
  padding-bottom: .35em;
  border-bottom: 1px solid var(--blog-border);
}

.markdown-body p,
.markdown-body li {
  color: var(--blog-subtle);
}

.markdown-body a {
  color: var(--blog-accent);
}

.markdown-body blockquote {
  margin: 1.4em 0;
  padding: 2px 0 2px 16px;
  color: var(--blog-muted);
  border-left: 3px solid var(--blog-border-strong);
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.4em 0;
  display: block;
  overflow-x: auto;
}

.markdown-body th,
.markdown-body td {
  padding: 8px 10px;
  border: 1px solid var(--blog-border);
}

.markdown-body img {
  max-width: 100%;
  height: auto;
  border-radius: 6px;
}

.code-block-wrapper {
  position: relative;
  margin: 1.2em 0;
}

.markdown-body pre {
  margin: 0 !important;
  border-radius: 6px;
  overflow: hidden;
  white-space: pre;
}

.markdown-body pre code.hljs {
  display: block;
  padding: 1.2em 1.5em;
  overflow-x: auto;
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
    padding: 18px;
  }

  .post-layout {
    grid-template-columns: 1fr;
  }

  .post-sidebar {
    position: static;
    max-height: none;
    order: -1;
  }

  .post-sidebar.collapsed {
    width: auto;
  }

  .post-content-card {
    padding: 0;
  }

  .post-title {
    font-size: 30px;
  }
}
</style>
