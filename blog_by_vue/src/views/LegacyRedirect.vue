<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getLegacyPost } from '@/api/posts';

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const failed = ref(false);

const redirectLegacyPost = async () => {
  loading.value = true;
  failed.value = false;

  try {
    const post = await getLegacyPost(route.params.abbrlink);
    if (!post?.slug) {
      failed.value = true;
      return;
    }
    await router.replace({
      name: 'PostDetail',
      params: { slug: post.slug },
      hash: route.hash,
    });
  } catch (error) {
    console.error('旧链接跳转失败:', error);
    failed.value = true;
  } finally {
    loading.value = false;
  }
};

onMounted(redirectLegacyPost);
watch(() => route.params.abbrlink, redirectLegacyPost);
</script>

<template>
  <main class="legacy-page">
    <div v-if="loading" class="legacy-card">
      <el-skeleton :rows="4" animated />
    </div>

    <el-result
      v-else-if="failed"
      icon="error"
      title="旧链接不可用"
      sub-title="该旧文章链接尚未迁移到新博客。"
    >
      <template #extra>
        <router-link to="/">
          <el-button type="primary">返回首页</el-button>
        </router-link>
      </template>
    </el-result>
  </main>
</template>

<style scoped>
.legacy-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 24px;
}

.legacy-card {
  padding: 24px 0;
}
</style>
