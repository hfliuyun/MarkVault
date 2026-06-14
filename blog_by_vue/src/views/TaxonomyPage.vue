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
      <article v-for="i in 4" :key="i" class="taxonomy-card glass-panel">
        <el-skeleton :rows="3" animated />
      </article>
    </div>

    <template v-else-if="!detail">
      <header class="taxonomy-header glass-panel">
        <h1>{{ pageTitle }}</h1>
        <p>{{ pageDescription }}</p>
      </header>

      <el-empty v-if="!taxonomyList.length" :description="config.emptyText" />

      <div v-else class="taxonomy-grid">
        <router-link
          v-for="item in taxonomyList"
          :key="item.name"
          :to="{ name: config.routeName, params: { [config.paramName]: item.name } }"
          class="taxonomy-card glass-panel taxonomy-link"
        >
          <span class="taxonomy-name">
            <el-icon><component :is="config.icon" /></el-icon>
            {{ item.name }}
          </span>
          <span class="taxonomy-count">{{ item.count }} 篇文章</span>
        </router-link>
      </div>
    </template>

    <div v-else-if="!currentTaxonomy" class="glass-panel" style="padding: 40px">
      <el-result
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
    </div>

    <template v-else>
      <header class="taxonomy-header glass-panel">
        <router-link :to="config.listRoute" class="back-link">{{ config.backText }}</router-link>
        <h1>{{ pageTitle }}</h1>
        <p>{{ pageDescription }}</p>
      </header>

      <div class="post-list">
        <article v-for="post in currentTaxonomy.posts" :key="post.slug" class="post-card glass-panel">
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
                class="tag-link glass-tag"
              >
                {{ tag }}
              </router-link>
            </span>
          </div>
          <p class="summary">{{ post.summary }}</p>
        </article>
      </div>
    </template>
  </main>
</template>

<style scoped>
.taxonomy-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 0 20px;
  text-align: left;
}

.taxonomy-header {
  padding: 40px;
  margin-bottom: 30px;
  text-align: center;
}

.back-link {
  color: var(--blog-accent);
  font-size: 14px;
  text-decoration: none;
  display: inline-block;
  margin-bottom: 12px;
}

.back-link:hover {
  text-decoration: underline;
}

.taxonomy-header h1 {
  margin: 0 0 12px;
  color: var(--blog-text);
  font-size: 36px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.5px;
}

.taxonomy-header p {
  margin: 0;
  color: var(--blog-muted);
  font-size: 16px;
}

.taxonomy-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
}

.taxonomy-card {
  padding: 24px;
}

.taxonomy-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  color: inherit;
  text-decoration: none;
}

.taxonomy-name {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
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

.post-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.post-card {
  padding: 32px;
  text-decoration: none;
  display: block;
}

.post-card:hover {
  transform: translateY(-4px);
}

.post-card h2 {
  margin: 0 0 14px;
  font-size: 24px;
  font-weight: 600;
}

.post-card h2 a {
  color: var(--blog-text);
  text-decoration: none;
  transition: color 0.2s ease;
}

.post-card h2 a:hover,
.meta-link:hover {
  color: var(--blog-accent);
}

.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  color: var(--blog-muted);
  font-size: 14px;
}

.post-meta span {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.meta-link {
  color: inherit;
  text-decoration: none;
  transition: color 0.2s;
}

.category-link:not(:last-child)::after {
  content: "/";
  padding-left: 7px;
  color: var(--blog-muted);
  pointer-events: none;
}

.tag-list {
  gap: 8px;
}

.tag-link {
  display: inline-flex;
  text-decoration: none;
}

.glass-tag {
  padding: 4px 10px;
  background: rgba(120, 120, 120, 0.1);
  border: 1px solid rgba(120, 120, 120, 0.2);
  border-radius: 12px;
  font-size: 12px;
  color: var(--blog-text);
  transition: all 0.2s;
}

[data-theme='dark'] .glass-tag {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.tag-link:hover.glass-tag {
  background: var(--blog-accent);
  color: #fff;
  border-color: var(--blog-accent);
}

.summary {
  margin: 16px 0 0;
  color: var(--blog-subtle);
  line-height: 1.6;
  font-size: 15px;
}

@media (max-width: 640px) {
  .taxonomy-page {
    padding: 0 16px;
  }

  .taxonomy-grid {
    grid-template-columns: 1fr;
  }

  .post-card {
    padding: 24px 20px;
  }

  .post-card h2 {
    font-size: 20px;
  }
}
</style>
