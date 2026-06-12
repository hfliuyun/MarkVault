<script setup>
import { onMounted, ref } from 'vue';
import axios from 'axios';
import { Collection, Calendar } from '@element-plus/icons-vue';

const seriesList = ref([]);
const loading = ref(true);

onMounted(async () => {
  try {
    const response = await axios.get('/api/series');
    seriesList.value = response.data.series || [];
  } catch (error) {
    console.error('获取系列列表失败:', error);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <main class="series-page">
    <div class="series-header">
      <h1>系列</h1>
    </div>

    <div v-if="loading" class="series-grid">
      <el-card v-for="i in 3" :key="i" class="series-card" shadow="hover">
        <el-skeleton :rows="3" animated />
      </el-card>
    </div>

    <el-empty v-else-if="!seriesList.length" description="暂无系列文章" />

    <div v-else class="series-grid">
      <el-card v-for="item in seriesList" :key="item.id" class="series-card" shadow="hover">
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
      </el-card>
    </div>
  </main>
</template>

<style scoped>
.series-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 28px 5%;
  text-align: left;
}

.series-header h1 {
  margin: 0 0 20px;
  color: #303133;
}

.series-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 18px;
}

.series-card {
  border-radius: 8px;
}

.series-title {
  display: inline-block;
  margin-bottom: 14px;
  color: #303133;
  font-size: 20px;
  font-weight: 600;
  text-decoration: none;
}

.series-title:hover {
  color: #409eff;
}

.series-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  color: #909399;
  font-size: 14px;
}

.series-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
</style>
