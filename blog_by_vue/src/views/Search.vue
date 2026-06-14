<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Calendar, CollectionTag, Search as SearchIcon } from '@element-plus/icons-vue';
import { searchPosts } from '@/api/posts';

const route = useRoute();
const router = useRouter();
const searchInput = ref('');
const results = ref([]);
const loading = ref(false);
const searched = ref(false);
const total = ref(0);

const queryText = computed(() => {
  const query = route.query.q;
  return Array.isArray(query) ? query[0] || '' : query || '';
});

const formatDate = (dateText) => {
  if (!dateText) return '';
  return new Date(dateText).toLocaleDateString();
};

const fetchResults = async () => {
  const keyword = queryText.value.trim();
  searchInput.value = queryText.value;
  searched.value = Boolean(keyword);

  if (!keyword) {
    results.value = [];
    total.value = 0;
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    const data = await searchPosts(keyword);
    results.value = data.articles || [];
    total.value = data.total || 0;
  } catch (error) {
    console.error('搜索文章失败:', error);
    results.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

const submitSearch = () => {
  const keyword = searchInput.value.trim();
  router.push({
    name: 'Search',
    query: keyword ? { q: keyword } : {},
  });
};

onMounted(fetchResults);
watch(() => route.query.q, fetchResults);
</script>

<template>
  <main class="search-page">
    <header class="search-header">
      <h1>搜索</h1>
      <p>搜索文章标题、摘要、正文、分类和标签。</p>
    </header>

    <form class="search-form" @submit.prevent="submitSearch">
      <el-input
        v-model="searchInput"
        size="large"
        clearable
        placeholder="输入关键词"
      >
        <template #prefix>
          <el-icon><SearchIcon /></el-icon>
        </template>
      </el-input>
      <el-button type="primary" size="large" native-type="submit">搜索</el-button>
    </form>

    <div v-if="loading" class="post-list">
      <article v-for="i in 4" :key="i" class="post-card">
        <el-skeleton :rows="4" animated />
      </article>
    </div>

    <el-empty
      v-else-if="!searched"
      description="请输入关键词开始搜索"
    />

    <el-empty
      v-else-if="!results.length"
      :description="`没有找到与「${queryText}」相关的文章`"
    />

    <template v-else>
      <p class="result-count">找到 {{ total }} 篇相关文章</p>
      <article v-for="post in results" :key="post.slug" class="post-card">
        <h2>
          <router-link :to="{ name: 'PostDetail', params: { slug: post.slug } }">
            {{ post.title }}
          </router-link>
        </h2>
        <div class="post-meta">
          <span v-if="post.date">
            <el-icon><Calendar /></el-icon>
            {{ formatDate(post.date) }}
          </span>
          <span v-if="post.categories?.length">
            <el-icon><CollectionTag /></el-icon>
            <router-link
              v-for="category in post.categories"
              :key="category"
              :to="{ name: 'CategoryDetail', params: { category } }"
              class="meta-link category-link"
            >
              {{ category }}
            </router-link>
          </span>
          <span v-if="post.tags?.length" class="tag-list">
            <router-link
              v-for="tag in post.tags"
              :key="tag"
              :to="{ name: 'TagDetail', params: { tag } }"
              class="tag-link"
            >
              {{ tag }}
            </router-link>
          </span>
        </div>
        <p class="summary">{{ post.summary }}</p>
      </article>
    </template>
  </main>
</template>

<style scoped>
.search-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 36px 24px 56px;
  text-align: left;
}

.search-header {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--blog-border);
}

.search-header h1 {
  margin: 0 0 8px;
  color: var(--blog-text);
  font-size: 30px;
  line-height: 1.25;
}

.search-header p {
  margin: 0;
  color: var(--blog-muted);
}

.search-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  padding: 24px 0 4px;
}

.result-count {
  margin: 20px 0 0;
  color: var(--blog-muted);
  font-size: 14px;
}

.post-list {
  display: flex;
  flex-direction: column;
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

.post-card h2 a:hover,
.meta-link:hover,
.tag-link:hover {
  color: var(--blog-accent);
}

.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  color: var(--blog-muted);
  font-size: 14px;
}

.post-meta span {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.meta-link,
.tag-link {
  color: inherit;
  text-decoration: none;
}

.category-link:not(:last-child)::after {
  content: "/";
  padding-left: 7px;
  color: var(--blog-muted);
}

.tag-list {
  gap: 6px;
}

.tag-link {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--blog-border);
  border-radius: 4px;
  background: var(--blog-surface);
  font-size: 12px;
}

.summary {
  margin: 12px 0 0;
  color: var(--blog-subtle);
  line-height: 1.6;
}

@media (max-width: 640px) {
  .search-page {
    padding: 26px 18px 42px;
  }

  .search-form {
    grid-template-columns: 1fr;
  }

  .post-card h2 {
    font-size: 20px;
  }
}
</style>
