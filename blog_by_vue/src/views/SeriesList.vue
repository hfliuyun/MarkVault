<script setup>
import { onMounted, ref } from 'vue';
import { Collection, Calendar } from '@element-plus/icons-vue';
import { listSeries } from '@/api/series';

const seriesList = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const data = await listSeries();
    seriesList.value = data.series || [];
  } catch (error) {
    console.error('获取系列列表失败:', error);
    seriesList.value = [];
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="series-page">
    <div class="series-header">
      <h1>系列</h1>
      <p>按主题聚合的文章目录。</p>
    </div>

    <div v-if="loading" class="series-grid">
      <article v-for="i in 3" :key="i" class="series-card">
        <el-skeleton :rows="3" animated />
      </article>
    </div>

    <el-empty v-else-if="!seriesList.length" description="暂无系列文章" />

    <div v-else class="series-grid">
      <article v-for="item in seriesList" :key="item.id" class="series-card">
        <router-link :to="{ name: 'SeriesDetail', params: { seriesId: item.id } }" class="series-title">
          {{ item.title }}
        </router-link>
        <div class="series-meta">
          <span>
            <el-icon><Collection /></el-icon>
            {{ item.count }} 篇文章
          </span>
          <span>
            <el-icon><Calendar /></el-icon>
            {{ new Date(item.updated_at).toLocaleDateString() }}
          </span>
        </div>
      </article>
    </div>
  </main>
</template>

<style scoped>
.series-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 36px 24px 56px;
  text-align: left;
}

.series-header {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--blog-border);
}

.series-header h1 {
  margin: 0 0 8px;
  color: var(--blog-text);
  font-size: 30px;
  line-height: 1.25;
}

.series-header p {
  margin: 0;
  color: var(--blog-muted);
}

.series-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 18px;
  padding-top: 24px;
}

.series-card {
  padding: 20px;
  border: 1px solid var(--blog-border);
  border-radius: 8px;
  background: var(--blog-surface);
}

.series-title {
  display: inline-block;
  margin-bottom: 14px;
  color: var(--blog-text);
  font-size: 20px;
  font-weight: 600;
  text-decoration: none;
}

.series-title:hover {
  color: var(--blog-accent);
}

.series-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  color: var(--blog-muted);
  font-size: 14px;
}

.series-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

@media (max-width: 640px) {
  .series-page {
    padding: 26px 18px 42px;
  }
}
</style>
