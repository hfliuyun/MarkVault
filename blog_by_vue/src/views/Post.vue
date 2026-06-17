<script setup>
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getPost } from '@/api/posts';
import PostArticle from '@/components/post/PostArticle.vue';
import PostLayout from '@/components/post/PostLayout.vue';
import PostSidebar from '@/components/post/PostSidebar.vue';
import { useMarkdownEnhancements } from '@/composables/useMarkdownEnhancements';
import { usePostHeadingNavigation } from '@/composables/usePostHeadingNavigation';

import 'highlight.js/styles/atom-one-dark.css';
import 'katex/dist/katex.min.css';

const route = useRoute();
const router = useRouter();
const article = ref(null);
const loading = ref(true);
const sidebarCollapsed = ref(false);
const articleRef = ref(null);

const { enhanceMarkdownContent } = useMarkdownEnhancements();
const {
  activeHeadingId,
  decodeRouteHash,
  scrollToHeading,
  handleTocClick,
} = usePostHeadingNavigation(route, router);

const enhanceCurrentArticle = () => {
  enhanceMarkdownContent(articleRef.value?.markdownContainer);
};

const fetchArticle = async () => {
  loading.value = true;
  // 保持旧文章内容以避免屏幕闪烁，直到新数据返回

  try {
    const newArticle = await getPost(route.params.slug);
    article.value = newArticle;
  } catch (error) {
    console.error('获取文章详情失败:', error);
    article.value = null;
  } finally {
    loading.value = false;
  }

  if (article.value) {
    await nextTick();
    enhanceCurrentArticle();
    const headingId = decodeRouteHash(route.hash);
    if (headingId) {
      scrollToHeading(headingId, 'auto');
    }
  }
};

onMounted(fetchArticle);
watch(() => route.params.slug, fetchArticle);

watch(() => route.hash, async (hash) => {
  const headingId = decodeRouteHash(hash);
  if (!headingId || loading.value) {
    return;
  }
  await nextTick();
  scrollToHeading(headingId);
});
</script>

<template>
  <PostLayout :loading="loading" :article="article">
    <template #sidebar>
      <PostSidebar
        v-model:collapsed="sidebarCollapsed"
        :article="article"
        :active-heading-id="activeHeadingId"
        @toc-click="handleTocClick"
      />
    </template>

    <template #article>
      <PostArticle ref="articleRef" :article="article" class="glass-panel" />
    </template>
  </PostLayout>
</template>
