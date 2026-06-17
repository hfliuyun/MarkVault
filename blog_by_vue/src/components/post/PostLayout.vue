<script setup>
defineProps({
  loading: {
    type: Boolean,
    default: false,
  },
  article: {
    type: Object,
    default: null,
  },
});
</script>

<template>
  <div class="post-page-container">
    <div v-if="loading && !article" class="post-content-card glass-panel delayed-skeleton">
      <el-skeleton :rows="1" animated class="title-skeleton" />
      <el-skeleton :rows="10" animated />
    </div>

    <div v-else-if="article" class="post-layout" v-loading="loading">
      <slot name="sidebar" />
      <div class="post-content-wrapper">
        <slot name="article" />
      </div>
    </div>

    <div v-else class="post-content-card glass-panel">
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
  padding: 0 20px 40px;
  max-width: 1400px; /* Widened for technical blogs */
  margin: 0 auto;
}

.post-layout {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  gap: 32px;
}

.post-content-wrapper {
  flex: 1 1 auto;
  max-width: 1100px; /* Allow it to grow significantly when sidebar collapses */
  width: 100%;
  transition: max-width 0.3s ease, flex 0.3s ease;
}

.post-content-card {
  width: 100%;
  box-sizing: border-box;
  padding: 48px 56px;
  text-align: left;
}

@media (max-width: 960px) {
  .post-page-container {
    padding: 0 12px 30px;
  }

  .post-layout {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .post-content-card {
    padding: 24px 20px;
  }
}

.delayed-skeleton {
  animation: skeleton-fade-in 0.4s ease forwards;
  animation-delay: 0.15s;
  opacity: 0;
}

@keyframes skeleton-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
