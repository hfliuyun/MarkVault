<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import axios from 'axios';
import { Calendar, CollectionTag } from '@element-plus/icons-vue';

const route = useRoute();
const series = ref(null);
const loading = ref(true);

const fetchSeries = async () => {
  loading.value = true;
  series.value = null;
  try {
    const response = await axios.get(`/api/series/${route.params.seriesId}`);
    series.value = response.data;
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
    <div v-if="loading">
      <el-skeleton :rows="1" animated class="title-skeleton" />
      <el-card v-for="i in 4" :key="i" class="post-card" shadow="hover">
        <el-skeleton :rows="3" animated />
      </el-card>
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

      <el-card v-for="post in series.posts" :key="post.slug" class="post-card" shadow="hover">
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
      </el-card>
    </template>
  </main>
</template>

<style scoped>
.series-detail-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 28px 5%;
  text-align: left;
}

.series-detail-header {
  margin-bottom: 20px;
}

.back-link {
  color: #409eff;
  font-size: 14px;
  text-decoration: none;
}

.series-detail-header h1 {
  margin: 10px 0 8px;
  color: #303133;
}

.series-detail-header p {
  margin: 0;
  color: #909399;
}

.post-card {
  margin-bottom: 18px;
}

.post-card h2 {
  margin: 0 0 12px;
  font-size: 22px;
}

.post-card h2 a {
  color: #303133;
  text-decoration: none;
}

.post-card h2 a:hover {
  color: #409eff;
}

.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  color: #909399;
  font-size: 14px;
}

.post-meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.summary {
  color: #606266;
  line-height: 1.6;
}
</style>
