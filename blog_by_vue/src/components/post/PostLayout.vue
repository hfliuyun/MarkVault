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
    <div v-if="loading" class="post-content-card">
      <el-skeleton :rows="1" animated class="title-skeleton" />
      <el-skeleton :rows="10" animated />
    </div>

    <div v-else-if="article" class="post-layout">
      <slot name="sidebar" />
      <slot name="article" />
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

.post-content-card {
  max-width: 860px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 0;
  background-color: transparent;
  text-align: left;
}

@media (max-width: 860px) {
  .post-page-container {
    padding: 18px;
  }

  .post-layout {
    grid-template-columns: 1fr;
  }

  .post-content-card {
    padding: 0;
  }
}
</style>
