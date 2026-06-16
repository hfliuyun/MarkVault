<script setup>
import { ref, onMounted } from 'vue';
import { Calendar, CollectionTag } from '@element-plus/icons-vue';
import { listPosts } from '@/api/posts';

const articleList = ref([]);
const loading = ref(true);
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);

const fetchArticles = async (page = 1) => {
  loading.value = true;
  try {
    const data = await listPosts({ page, size: pageSize.value });
    articleList.value = data.articles || [];
    total.value = data.total || 0;
    currentPage.value = page;
  } catch (error) {
    console.error('获取文章列表失败:', error);
    articleList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

const handleCurrentChange = (val) => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  fetchArticles(val);
};

onMounted(() => {
  fetchArticles(currentPage.value);
});
</script>

<template>
  <main class="home-container">
    <header class="page-heading glass-panel">
      <h1>文章</h1>
      <p>按发布时间倒序整理的技术笔记。</p>
    </header>

    <div v-if="loading" class="post-list">
      <article v-for="i in 5" :key="i" class="post-item glass-panel skeleton-item">
        <el-skeleton :rows="4" animated />
      </article>
    </div>

    <el-empty v-else-if="!articleList.length" description="暂无文章" />

    <div v-else class="post-list">
      <article v-for="article in articleList" :key="article.slug" class="post-item glass-panel">
        <h2 class="article-title">
          <router-link
            :to="{ name: 'PostDetail', params: { slug: article.slug } }"
            class="title-link"
          >
            {{ article.title }}
          </router-link>
        </h2>
        <div class="article-meta-wrap">
          <span class="post-meta-item">
            <el-icon><Calendar /></el-icon>
            <time>{{ new Date(article.date).toLocaleDateString() }}</time>
          </span>
          <span class="post-meta-item">
            <el-icon><CollectionTag /></el-icon>
            <span v-if="article.categories?.length" class="category-list">
              <router-link
                v-for="category in article.categories"
                :key="category"
                :to="{ name: 'CategoryDetail', params: { category } }"
                class="category-link"
              >
                {{ category }}
              </router-link>
            </span>
            <span v-else>未分类</span>
          </span>
          <span v-if="article.tags?.length" class="post-meta-item tags">
            <router-link
              v-for="tag in article.tags"
              :key="tag"
              :to="{ name: 'TagDetail', params: { tag } }"
              class="tag-link"
            >
              <span class="glass-tag">{{ tag }}</span>
            </router-link>
          </span>
        </div>
        <router-link
          v-if="article.series?.id"
          :to="{ name: 'SeriesDetail', params: { seriesId: article.series.id } }"
          class="series-badge"
        >
          <span class="series-prefix">系列</span>
          {{ article.series.title || article.series.id }}
        </router-link>
        <p class="summary">
          {{ article.summary }}
        </p>
      </article>
    </div>

    <div class="pagination-container glass-panel" v-if="!loading && total > 0">
      <el-pagination
        :current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next, jumper"
        @current-change="handleCurrentChange"
      />
    </div>
  </main>
</template>

<style scoped>
.home-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 20px;
  text-align: left;
}



.post-list {
  display: flex;
  flex-direction: column;
  gap: 24px; /* Space between glass cards */
}

.post-item {
  padding: 32px;
  text-decoration: none;
  display: block;
}

.post-item:hover {
  transform: translateY(-4px);
}

.skeleton-item {
  min-height: 180px;
}

.article-title {
  margin: 0 0 14px;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.4;
}

.title-link {
  color: var(--blog-text);
  text-decoration: none;
  transition: color .2s ease;
}

.title-link::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
}
.post-item {
  position: relative; /* For the ::before pseudo element if we wanted whole card click */
}

.title-link:hover {
  color: var(--blog-accent);
}

.title-link {
  position: relative;
  z-index: 2;
}

.article-meta-wrap {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 20px;
  color: var(--blog-muted);
  font-size: 14px;
  position: relative;
  z-index: 2;
}

.series-badge {
  position: relative;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  max-width: 100%;
  margin-top: 14px;
  padding: 5px 10px;
  border: 1px solid rgba(64, 158, 255, 0.22);
  border-radius: 8px;
  background: rgba(64, 158, 255, 0.08);
  color: var(--blog-accent);
  font-size: 13px;
  line-height: 1.3;
  text-decoration: none;
  transition: all 0.2s ease;
}

.series-badge:hover {
  border-color: var(--blog-accent);
  background: rgba(64, 158, 255, 0.14);
}

.series-prefix {
  color: var(--blog-muted);
}

.post-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.post-meta-item.tags {
  gap: 8px;
}

.post-meta-item .el-icon {
  color: var(--blog-muted);
}

.category-link {
  color: inherit;
  text-decoration: none;
  transition: color 0.2s;
}

.category-list {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 7px;
}

.category-link:not(:last-child)::after {
  content: "/";
  padding-left: 7px;
  color: var(--blog-muted);
  pointer-events: none;
}

.category-link:hover,
.tag-link:hover {
  color: var(--blog-accent);
}

.tag-link {
  display: inline-flex;
  text-decoration: none;
}

.glass-tag {
  padding: 4px 10px;
  background: rgba(120, 120, 120, 0.1);
  border: 1px solid rgba(120, 120, 120, 0.2);
  border-radius: 12px;
  font-size: 12px;
  color: var(--blog-text);
  transition: all 0.2s;
}

[data-theme='dark'] .glass-tag {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.tag-link:hover .glass-tag {
  background: var(--blog-accent);
  color: #fff;
  border-color: var(--blog-accent);
}

.summary {
  margin: 16px 0 0;
  color: var(--blog-subtle);
  line-height: 1.6;
  font-size: 15px;
}

.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 40px;
  padding: 16px;
  border-radius: 100px; /* Pill shape for pagination */
}

@media (max-width: 640px) {
  .home-container {
    padding: 0 16px;
  }

  .post-item {
    padding: 24px 20px;
  }

  .article-title {
    font-size: 20px;
  }
}
</style>
