<script setup>
import PostToc from '@/components/post/PostToc.vue';

defineProps({
  article: {
    type: Object,
    required: true,
  },
  activeHeadingId: {
    type: String,
    default: '',
  },
});

const emit = defineEmits(['navigate', 'toc-click']);
</script>

<template>
  <div class="sidebar-content">
    <section v-if="article.series_posts?.length" class="sidebar-section">
      <h2>{{ article.series?.title || '系列文章' }}</h2>
      <ol class="series-list">
        <li
          v-for="item in article.series_posts"
          :key="item.slug"
          :class="{ active: item.slug === article.slug }"
        >
          <router-link
            :to="{ name: 'PostDetail', params: { slug: item.slug } }"
            @click="emit('navigate')"
          >
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
</template>

<style>
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
  color: inherit;
  text-decoration: none;
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
</style>
