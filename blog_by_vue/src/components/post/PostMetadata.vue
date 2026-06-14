<script setup>
defineProps({
  article: {
    type: Object,
    required: true,
  },
});

const formatDate = (dateText) => {
  if (!dateText) return '';
  return new Date(dateText).toLocaleDateString();
};
</script>

<template>
  <div class="post-meta">
    <span v-if="article.date">发布于 {{ formatDate(article.date) }}</span>
    <span v-if="article.categories?.length" class="post-meta-group">
      分类:
      <router-link
        v-for="category in article.categories"
        :key="category"
        :to="{ name: 'CategoryDetail', params: { category } }"
        class="post-meta-link category-link"
      >
        {{ category }}
      </router-link>
    </span>
    <span v-if="article.tags?.length" class="post-meta-group">
      标签:
      <router-link
        v-for="tag in article.tags"
        :key="tag"
        :to="{ name: 'TagDetail', params: { tag } }"
        class="post-meta-link tag-link"
      >
        {{ tag }}
      </router-link>
    </span>
  </div>
</template>

<style>
.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  color: var(--blog-muted);
  font-size: 14px;
  margin-bottom: 34px;
  border-bottom: 1px solid var(--blog-border);
  padding-bottom: 18px;
}

.post-meta span {
  margin-right: 0;
}

.post-meta-group {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px 7px;
}

.post-meta-link {
  color: inherit;
  text-decoration: none;
}

.post-meta-link:hover {
  color: var(--blog-accent);
}

.post-meta-link.category-link:not(:last-child)::after {
  content: "/";
  padding-left: 7px;
  color: var(--blog-muted);
}

.post-meta-link.tag-link {
  padding: 0 7px;
  border: 1px solid var(--blog-border);
  border-radius: 4px;
  background: var(--blog-surface);
  font-size: 12px;
}
</style>
