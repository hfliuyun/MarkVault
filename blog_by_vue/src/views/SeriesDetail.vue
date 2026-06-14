<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Calendar, CollectionTag } from '@element-plus/icons-vue';
import { getSeries } from '@/api/series';

const route = useRoute();
const series = ref(null);
const loading = ref(true);

const fetchSeries = async () => {
  loading.value = true;
  series.value = null;
  try {
    series.value = await getSeries(route.params.seriesId);
  } catch (error) {
    console.error('获取系列详情失败:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(fetchSeries);
watch(() => route.params.seriesId, fetchSeries);
</script>

<template>
  <main class="series-detail-page">
    <div v-if="loading" class="loading-list">
      <el-skeleton :rows="1" animated class="title-skeleton" />
      <article v-for="i in 4" :key="i" class="post-card">
        <el-skeleton :rows="3" animated />
      </article>
    </div>

    <el-result
      v-else-if="!series"
      icon="error"
      title="系列不存在"
      sub-title="无法找到该系列。"
    >
      <template #extra>
        <router-link to="/series"><el-button type="primary">返回系列列表</el-button></router-link>
      </template>
    </el-result>

    <template v-else>
      <header class="series-detail-header glass-panel">
        <router-link to="/series" class="back-link">返回系列</router-link>
        <h1>{{ series.title }}</h1>
        <p>{{ series.count }} 篇文章 · 更新于 {{ new Date(series.updated_at).toLocaleDateString() }}</p>
      </header>

      <div class="post-list">
        <article v-for="post in series.posts" :key="post.slug" class="post-card glass-panel">
          <h2>
            <router-link :to="{ name: 'PostDetail', params: { slug: post.slug } }">
              {{ post.title }}
            </router-link>
          </h2>
          <div class="post-meta">
            <span>
              <el-icon><Calendar /></el-icon>
              {{ new Date(post.date).toLocaleDateString() }}
            </span>
            <span v-if="post.categories?.length">
              <el-icon><CollectionTag /></el-icon>
              {{ post.categories.join(' / ') }}
            </span>
          </div>
          <p class="summary">{{ post.summary }}</p>
        </article>
      </div>
    </template>
  </main>
</template>

<style scoped>
.series-detail-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 20px;
  text-align: left;
}

.series-detail-header {
  padding: 40px;
  margin-bottom: 30px;
  text-align: center;
}

.back-link {
  color: var(--blog-accent);
  font-size: 14px;
  text-decoration: none;
  display: inline-block;
  margin-bottom: 12px;
}

.back-link:hover {
  text-decoration: underline;
}

.series-detail-header h1 {
  margin: 0 0 12px;
  color: var(--blog-text);
  font-size: 36px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.5px;
}

.series-detail-header p {
  margin: 0;
  color: var(--blog-muted);
  font-size: 16px;
}

.post-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.post-card {
  padding: 32px;
  text-decoration: none;
  display: block;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.post-card:hover {
  transform: translateY(-4px);
}

.post-card h2 {
  margin: 0 0 14px;
  font-size: 24px;
  font-weight: 600;
}

.post-card h2 a {
  color: var(--blog-text);
  text-decoration: none;
  transition: color 0.2s ease;
}

.post-card h2 a:hover {
  color: var(--blog-accent);
}

.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  color: var(--blog-muted);
  font-size: 14px;
}

.post-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.summary {
  margin: 16px 0 0;
  color: var(--blog-subtle);
  line-height: 1.6;
  font-size: 15px;
}

@media (max-width: 640px) {
  .series-detail-page {
    padding: 26px 18px 42px;
  }

  .post-card h2 {
    font-size: 20px;
  }
}
</style>
