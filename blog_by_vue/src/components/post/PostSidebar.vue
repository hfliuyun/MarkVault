<script setup>
import { computed, ref, watch } from 'vue';
import { Menu } from '@element-plus/icons-vue';
import PostSidebarContent from '@/components/post/PostSidebarContent.vue';

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
const drawerVisible = ref(false);

const hasSidebarContent = computed(() => (
  Boolean(props.article.series_posts?.length) || Boolean(props.article.toc?.length)
));

const toggleSidebar = () => {
  emit('update:collapsed', !props.collapsed);
};

const closeDrawer = () => {
  drawerVisible.value = false;
};

const handleTocClick = (headingId) => {
  emit('toc-click', headingId);
  closeDrawer();
};

watch(() => props.article.slug, closeDrawer);
</script>

<template>
  <div class="post-sidebar-shell" :class="{ 'empty-mobile': !hasSidebarContent }">
    <div v-if="hasSidebarContent" class="mobile-sidebar-trigger">
      <button
        class="mobile-sidebar-button"
        type="button"
        aria-label="打开文章导航"
        @click="drawerVisible = true"
      >
        <el-icon><Menu /></el-icon>
        <span>文章导航</span>
      </button>
    </div>

    <aside class="post-sidebar" :class="{ collapsed }">
      <button class="sidebar-toggle" type="button" @click="toggleSidebar">
        {{ collapsed ? '展开' : '收起' }}
      </button>

      <PostSidebarContent
        v-if="!collapsed"
        :article="article"
        :active-heading-id="activeHeadingId"
        @toc-click="handleTocClick"
      />
    </aside>

    <el-drawer
      v-if="hasSidebarContent"
      v-model="drawerVisible"
      class="post-sidebar-drawer"
      title="文章导航"
      direction="ltr"
      size="min(86vw, 360px)"
    >
      <PostSidebarContent
        :article="article"
        :active-heading-id="activeHeadingId"
        @navigate="closeDrawer"
        @toc-click="handleTocClick"
      />
    </el-drawer>
  </div>
</template>

<style>
.post-sidebar-shell {
  min-width: 0;
}

.mobile-sidebar-trigger {
  display: none;
}

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

@media (max-width: 860px) {
  .post-sidebar-shell {
    order: -1;
  }

  .post-sidebar-shell.empty-mobile {
    display: none;
  }

  .post-sidebar {
    display: none;
  }

  .mobile-sidebar-trigger {
    display: flex;
    justify-content: flex-end;
  }

  .mobile-sidebar-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--blog-border);
    border-radius: 6px;
    padding: 7px 10px;
    background: var(--blog-surface);
    color: var(--blog-subtle);
    cursor: pointer;
  }

  .mobile-sidebar-button:hover {
    border-color: var(--blog-border-strong);
    color: var(--blog-accent);
  }

  .post-sidebar-drawer .el-drawer__header {
    margin-bottom: 0;
    padding: 18px 18px 10px;
    color: var(--blog-text);
  }

  .post-sidebar-drawer .el-drawer__body {
    padding: 0 18px 22px;
  }
}
</style>
