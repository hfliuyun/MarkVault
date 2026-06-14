<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Calendar, CollectionTag, PriceTag } from '@element-plus/icons-vue';
import { listCategories, listTags } from '@/api/taxonomy';

const props = defineProps({
  type: {
    type: String,
    required: true,
    validator: (value) => ['category', 'tag'].includes(value),
  },
  detail: {
    type: Boolean,
    default: false,
  },
});

const route = useRoute();
const taxonomyList = ref([]);
const loading = ref(true);

const config = computed(() => {
  if (props.type === 'category') {
    return {
      listKey: 'categories',
      routeName: 'CategoryDetail',
      listRoute: '/categories',
      paramName: 'category',
      icon: CollectionTag,
      title: '分类',
      description: '按主题分类浏览技术笔记。',
      emptyText: '暂无分类',
      missingTitle: '分类不存在',
      backText: '返回分类',
    };
  }

  return {
    listKey: 'tags',
    routeName: 'TagDetail',
    listRoute: '/tags',
    paramName: 'tag',
    icon: PriceTag,
    title: '标签',
    description: '按关键词标签浏览技术笔记。',
    emptyText: '暂无标签',
    missingTitle: '标签不存在',
    backText: '返回标签',
  };
});

const currentName = computed(() => {
  const value = route.params[config.value.paramName];
  return Array.isArray(value) ? value[0] : value;
});

const currentTaxonomy = computed(() => {
  if (!props.detail || !currentName.value) {
    return null;
  }
  return taxonomyList.value.find((item) => item.name === currentName.value) || null;
});

const pageTitle = computed(() => {
  if (!props.detail) {
    return config.value.title;
  }
  return currentName.value || config.value.title;
});

const pageDescription = computed(() => {
  if (!props.detail) {
    return config.value.description;
  }
  if (!currentTaxonomy.value) {
    return `无法找到该${config.value.title}。`;
  }
  return `${currentTaxonomy.value.count} 篇文章`;
});

const formatDate = (dateText) => {
  if (!dateText) return '';
  return new Date(dateText).toLocaleDateString();
};

const fetchTaxonomy = async () => {
  loading.value = true;
  try {
    const data = props.type === 'category' ? await listCategories() : await listTags();
    taxonomyList.value = data[config.value.listKey] || [];
  } catch (error) {
    console.error(`获取${config.value.title}失败:`, error);
    taxonomyList.value = [];
  } finally {
    loading.value = false;
  }
};

onMounted(fetchTaxonomy);
watch(() => props.type, fetchTaxonomy);
</script>

<template>
  <main class="taxonomy-page">
    <div v-if="loading" class="taxonomy-loading">
      <el-skeleton :rows="1" animated class="title-skeleton" />
      <article v-for="i in 4" :key="i" class="taxonomy-card">
        <el-skeleton :rows="3" animated />
      </article>
    </div>

    <template v-else-if="!detail">
      <header class="taxonomy-header">
        <h1>{{ pageTitle }}</h1>
        <p>{{ pageDescription }}</p>
      </header>

      <el-empty v-if="!taxonomyList.length" :description="config.emptyText" />

      <div v-else class="taxonomy-grid">
        <router-link
          v-for="item in taxonomyList"
          :key="item.name"
          :to="{ name: config.routeName, params: { [config.paramName]: item.name } }"
          class="taxonomy-card taxonomy-link"
        >
          <span class="taxonomy-name">
            <el-icon><component :is="config.icon" /></el-icon>
            {{ item.name }}
          </span>
          <span class="taxonomy-count">{{ item.count }} 篇文章</span>
        </router-link>
      </div>
    </template>

    <el-result
      v-else-if="!currentTaxonomy"
      icon="error"
      :title="config.missingTitle"
      :sub-title="pageDescription"
    >
      <template #extra>
        <router-link :to="config.listRoute">
          <el-button type="primary">{{ config.backText }}</el-button>
        </router-link>
      </template>
    </el-result>

    <template v-else>
      <header class="taxonomy-header">
        <router-link :to="config.listRoute" class="back-link">{{ config.backText }}</router-link>
        <h1>{{ pageTitle }}</h1>
        <p>{{ pageDescription }}</p>
      </header>

      <article v-for="post in currentTaxonomy.posts" :key="post.slug" class="post-card">
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
.taxonomy-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 36px 24px 56px;
  text-align: left;
}

.taxonomy-header {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--blog-border);
}

.back-link {
  color: var(--blog-accent);
  font-size: 14px;
  text-decoration: none;
}

.taxonomy-header h1 {
  margin: 0 0 8px;
  color: var(--blog-text);
  font-size: 30px;
  line-height: 1.25;
}

.back-link + h1 {
  margin-top: 10px;
}

.taxonomy-header p {
  margin: 0;
  color: var(--blog-muted);
}

.taxonomy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  padding-top: 24px;
}

.taxonomy-card {
  padding: 18px 20px;
  border: 1px solid var(--blog-border);
  border-radius: 8px;
  background: var(--blog-surface);
}

.taxonomy-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: inherit;
  text-decoration: none;
  transition: border-color .2s ease, color .2s ease;
}

.taxonomy-link:hover {
  color: var(--blog-accent);
  border-color: var(--blog-border-strong);
}

.taxonomy-name {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
  font-size: 18px;
  font-weight: 600;
}

.taxonomy-name .el-icon {
  flex: 0 0 auto;
}

.taxonomy-count {
  flex: 0 0 auto;
  color: var(--blog-muted);
  font-size: 14px;
}

.taxonomy-loading {
  display: grid;
  gap: 16px;
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
  .taxonomy-page {
    padding: 26px 18px 42px;
  }

  .taxonomy-grid {
    grid-template-columns: 1fr;
  }

  .post-card h2 {
    font-size: 20px;
  }
}
</style>
