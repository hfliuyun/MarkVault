<script setup>
import PostToc from '@/components/post/PostToc.vue';

const props = defineProps({
  article: {
    type: Object,
    required: true,
  },
  activeHeadingId: {
    type: String,
    default: '',
  },
  collapsed: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:collapsed', 'toc-click']);

const toggleSidebar = () => {
  emit('update:collapsed', !props.collapsed);
};
</script>

<template>
  <aside class="post-sidebar" :class="{ collapsed }">
    <button class="sidebar-toggle" type="button" @click="toggleSidebar">
      {{ collapsed ? '展开' : '收起' }}
    </button>

    <div v-if="!collapsed" class="sidebar-content">
      <section v-if="article.series_posts?.length" class="sidebar-section">
        <h2>{{ article.series?.title || '系列文章' }}</h2>
        <ol class="series-list">
          <li
            v-for="item in article.series_posts"
            :key="item.slug"
            :class="{ active: item.slug === article.slug }"
          >
            <router-link :to="{ name: 'PostDetail', params: { slug: item.slug } }">
              <span v-if="item.series?.order" class="series-order">{{ item.series.order }}</span>
              {{ item.title }}
            </router-link>
          </li>
        </ol>
      </section>

      <section v-if="article.toc?.length" class="sidebar-section">
        <h2>目录</h2>
        <PostToc
          :toc="article.toc"
          :active-heading-id="activeHeadingId"
          @toc-click="(headingId) => emit('toc-click', headingId)"
        />
      </section>
    </div>
  </aside>
</template>

<style>
.post-sidebar {
  position: sticky;
  top: 84px;
  max-height: calc(100vh - 108px);
  overflow: auto;
  padding: 14px;
  background: var(--blog-surface);
  border: 1px solid var(--blog-border);
  border-radius: 8px;
  text-align: left;
}

.post-sidebar.collapsed {
  width: 54px;
  padding: 10px;
}

.sidebar-toggle {
  width: 100%;
  border: 1px solid var(--blog-border);
  background: var(--blog-surface);
  border-radius: 4px;
  padding: 6px 8px;
  color: var(--blog-subtle);
  cursor: pointer;
}

.sidebar-section {
  margin-top: 18px;
}

.sidebar-section h2 {
  margin: 0 0 10px;
  font-size: 15px;
  color: var(--blog-text);
}

.series-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.series-list li {
  margin-bottom: 6px;
  color: var(--blog-subtle);
}

.series-list a {
  display: flex;
  gap: 8px;
  padding: 5px 0;
  line-height: 1.45;
}

.series-list li.active a {
  color: var(--blog-accent);
  font-weight: 600;
}

.series-order {
  min-width: 18px;
  color: var(--blog-muted);
  font-variant-numeric: tabular-nums;
}

.series-list a {
  color: inherit;
  text-decoration: none;
}

@media (max-width: 860px) {
  .post-sidebar {
    position: static;
    max-height: none;
    order: -1;
  }

  .post-sidebar.collapsed {
    width: auto;
  }
}
</style>
