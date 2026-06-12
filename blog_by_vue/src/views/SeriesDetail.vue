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
      <header class="series-detail-header">
        <router-link to="/series" class="back-link">返回系列</router-link>
        <h1>{{ series.title }}</h1>
        <p>{{ series.count }} 篇文章 · 更新于 {{ new Date(series.updated_at).toLocaleDateString() }}</p>
      </header>

      <article v-for="post in series.posts" :key="post.slug" class="post-card">
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
    </template>
  </main>
</template>

<style scoped>
.series-detail-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 36px 24px 56px;
  text-align: left;
}

.series-detail-header {
  margin-bottom: 4px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--blog-border);
}

.back-link {
  color: var(--blog-accent);
  font-size: 14px;
  text-decoration: none;
}

.series-detail-header h1 {
  margin: 10px 0 8px;
  color: var(--blog-text);
  font-size: 30px;
  line-height: 1.25;
}

.series-detail-header p {
  margin: 0;
  color: var(--blog-muted);
}

.post-card {
  padding: 22px 0;
  border-bottom: 1px solid var(--blog-border);
}

.post-card h2 {
  margin: 0 0 12px;
  font-size: 22px;
}

.post-card h2 a {
  color: var(--blog-text);
  text-decoration: none;
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
  margin: 12px 0 0;
  color: var(--blog-subtle);
  line-height: 1.6;
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
