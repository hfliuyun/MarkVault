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
  <div class="post-sidebar-shell" :class="{ 'empty-mobile': !hasSidebarContent, 'collapsed': collapsed }">
    <div v-if="hasSidebarContent" class="mobile-sidebar-trigger">
      <button
        class="mobile-sidebar-button glass-panel"
        type="button"
        aria-label="打开文章导航"
        @click="drawerVisible = true"
      >
        <el-icon><Menu /></el-icon>
        <span>文章导航</span>
      </button>
    </div>

    <aside class="post-sidebar glass-panel" :class="{ collapsed }">
      <button class="sidebar-toggle glass-panel" type="button" @click="toggleSidebar">
        {{ collapsed ? '展开' : '收起目录' }}
      </button>

      <div class="sidebar-content-wrapper" v-show="!collapsed">
        <PostSidebarContent
          :article="article"
          :active-heading-id="activeHeadingId"
          @toc-click="handleTocClick"
        />
      </div>
    </aside>

    <el-drawer
      v-if="hasSidebarContent"
      v-model="drawerVisible"
      class="post-sidebar-drawer"
      title="文章导航"
      direction="ltr"
      size="min(80vw, 320px)"
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
  flex: 0 0 280px;
  width: 280px;
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  align-self: stretch;
}

.post-sidebar-shell.collapsed {
  flex: 0 0 64px;
  width: 64px;
}

.mobile-sidebar-trigger {
  display: none;
}

.post-sidebar {
  position: sticky;
  top: 84px;
  max-height: calc(100vh - 108px);
  overflow: hidden;
  padding: 16px;
  text-align: left;
  display: flex;
  flex-direction: column;
}

.post-sidebar.collapsed {
  padding: 12px 10px;
  align-items: center;
}

.sidebar-toggle {
  width: 100%;
  padding: 8px;
  color: var(--blog-subtle);
  cursor: pointer;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
  flex-shrink: 0;
}

.post-sidebar.collapsed .sidebar-toggle {
  padding: 8px 4px;
  font-size: 12px;
  margin-bottom: 0;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  height: 100px;
}

.sidebar-toggle:hover {
  color: var(--blog-text);
  background: var(--blog-surface-hover);
}

.sidebar-content-wrapper {
  overflow-y: auto;
  flex: 1;
}

@media (max-width: 960px) {
  .post-sidebar-shell {
    flex: none;
    width: 100%;
    order: -1;
  }

  .post-sidebar-shell.collapsed {
    flex: none;
    width: 100%;
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
    padding: 8px 12px;
    color: var(--blog-text);
    cursor: pointer;
    font-weight: 500;
  }

  .mobile-sidebar-button:hover {
    color: var(--blog-accent);
  }

  .post-sidebar-drawer {
    margin: 12px !important;
    height: calc(100vh - 24px) !important;
    border-radius: var(--radius-lg) !important;
    border: 1px solid var(--glass-border-tl) !important;
    background: rgba(255, 255, 255, 0.72) !important;
    backdrop-filter: blur(24px) saturate(190%) !important;
    -webkit-backdrop-filter: blur(24px) saturate(190%) !important;
    box-shadow: var(--glass-shadow) !important;
  }

  [data-theme='dark'] .post-sidebar-drawer {
    background: rgba(20, 20, 25, 0.72) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
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
