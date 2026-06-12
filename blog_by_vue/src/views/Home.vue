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
    <header class="page-heading">
      <h1>文章</h1>
      <p>按发布时间倒序整理的技术笔记。</p>
    </header>

    <div v-if="loading" class="post-list">
      <article v-for="i in 5" :key="i" class="post-item skeleton-item">
        <el-skeleton :rows="4" animated />
      </article>
    </div>

    <el-empty v-else-if="!articleList.length" description="暂无文章" />

    <div v-else class="post-list">
      <article v-for="article in articleList" :key="article.slug" class="post-item">
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
            <span class="category-link">{{ article.categories?.join?.(' / ') || '未分类' }}</span>
          </span>
          <span v-if="article.tags?.length" class="post-meta-item tags">
            <el-tag v-for="tag in article.tags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
          </span>
        </div>
        <p class="summary">
          {{ article.summary }}
        </p>
      </article>
    </div>

    <div class="pagination-container" v-if="!loading && total > 0">
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
  max-width: 880px;
  margin: 0 auto;
  padding: 36px 24px 56px;
  text-align: left;
}

.page-heading {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--blog-border);
}

.page-heading h1 {
  margin: 0 0 8px;
  color: var(--blog-text);
  font-size: 30px;
  line-height: 1.25;
}

.page-heading p {
  margin: 0;
  color: var(--blog-muted);
}

.post-list {
  display: flex;
  flex-direction: column;
}

.post-item {
  padding: 24px 0;
  border-bottom: 1px solid var(--blog-border);
}

.skeleton-item {
  min-height: 132px;
}

.article-title {
  margin: 0 0 10px;
  font-size: 23px;
  line-height: 1.35;
}

.title-link {
  color: var(--blog-text);
  text-decoration: none;
  transition: color .2s ease;
}

.title-link:hover {
  color: var(--blog-accent);
}

.article-meta-wrap {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 18px;
  color: var(--blog-muted);
  font-size: 14px;
}

.post-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.post-meta-item.tags {
  gap: 6px;
}

.post-meta-item .el-icon {
  color: var(--blog-muted);
}

.category-link {
  color: inherit;
  text-decoration: none;
}

.summary {
  margin: 14px 0 0;
  color: var(--blog-subtle);
  line-height: 1.6;
}

.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 30px;
}

@media (max-width: 640px) {
  .home-container {
    padding: 26px 18px 42px;
  }

  .article-title {
    font-size: 20px;
  }
}
</style>
