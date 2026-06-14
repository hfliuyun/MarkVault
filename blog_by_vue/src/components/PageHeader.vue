
<script lang="js" setup>
import { EditPen, Search, User } from '@element-plus/icons-vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter,useRoute } from 'vue-router';
import { searchPosts } from '@/api/posts';

const SEARCH_DEBOUNCE_MS = 300;
const router = useRouter();
const route = useRoute();
const searchDialogVisible = ref(false);
const searchInput = ref('');
const searchResults = ref([]);
const searchLoading = ref(false);
const searchTouched = ref(false);
let quickSearchTimer = null;
let quickSearchRequestId = 0;

const activeIndex = computed(() => {
  if (route.path.startsWith('/series')) return '2';
  if (route.path.startsWith('/categories')) return '3';
  if (route.path.startsWith('/tags')) return '4';
  if (route.path.startsWith('/about')) return '5';
  return '1';
});

const isLegacyArticlePage = computed(() => route.path.startsWith('/p/'));

const handleSelect = () => {};

const goWrite = () => {
  router.push('/write');
};

const goSearch = () => {
  const query = route.query.q;
  if (route.name === 'Search') {
    searchInput.value = Array.isArray(query) ? query[0] || '' : query || '';
  }
  searchDialogVisible.value = true;
};
const goLogin = () => {};

const goEdit = () => {
  const abbrlink = route.path.split('/')[2];
  if(!abbrlink) {
    console.error('无法获取文章缩略链接,无法编辑文章');
    return;
  }
  router.push(`/write?edit=${abbrlink}`);
}

const clearQuickSearchTimer = () => {
  if (quickSearchTimer) {
    clearTimeout(quickSearchTimer);
    quickSearchTimer = null;
  }
};

const executeQuickSearch = async (keyword = searchInput.value.trim()) => {
  const requestId = ++quickSearchRequestId;
  searchTouched.value = Boolean(keyword);
  if (!keyword) {
    searchResults.value = [];
    searchLoading.value = false;
    return;
  }

  searchLoading.value = true;
  try {
    const data = await searchPosts(keyword);
    if (requestId !== quickSearchRequestId) {
      return;
    }
    searchResults.value = (data.articles || []).slice(0, 5);
  } catch (error) {
    if (requestId !== quickSearchRequestId) {
      return;
    }
    console.error('搜索文章失败:', error);
    searchResults.value = [];
  } finally {
    if (requestId === quickSearchRequestId) {
      searchLoading.value = false;
    }
  }
};

const scheduleQuickSearch = () => {
  clearQuickSearchTimer();
  if (!searchDialogVisible.value) {
    return;
  }

  const keyword = searchInput.value.trim();
  if (!keyword) {
    quickSearchRequestId += 1;
    searchTouched.value = false;
    searchResults.value = [];
    searchLoading.value = false;
    return;
  }

  searchTouched.value = true;
  searchLoading.value = true;
  quickSearchTimer = setTimeout(() => {
    executeQuickSearch(keyword);
  }, SEARCH_DEBOUNCE_MS);
};

const runQuickSearch = () => {
  clearQuickSearchTimer();
  executeQuickSearch();
};

const goSearchPage = () => {
  const keyword = searchInput.value.trim();
  searchDialogVisible.value = false;
  router.push({
    name: 'Search',
    query: keyword ? { q: keyword } : {},
  });
};

const goPost = (slug) => {
  searchDialogVisible.value = false;
  router.push({ name: 'PostDetail', params: { slug } });
};

watch(searchInput, scheduleQuickSearch);
watch(searchDialogVisible, (visible) => {
  if (visible) {
    scheduleQuickSearch();
    return;
  }
  clearQuickSearchTimer();
  quickSearchRequestId += 1;
  searchLoading.value = false;
});

onBeforeUnmount(clearQuickSearchTimer);
</script>

<template>
  <div class="navbar">
    <el-menu
      :default-active="activeIndex"
      class="el-menu-demo"
      mode="horizontal"
      @select="handleSelect"
    >
      <el-menu-item index="1">
        <router-link to="/">首页</router-link>
      </el-menu-item>
      <el-menu-item index="2">
        <router-link to="/series">系列</router-link>
      </el-menu-item>
      <el-menu-item index="3">
        <router-link to="/categories">分类</router-link>
      </el-menu-item>
      <el-menu-item index="4">
        <router-link to="/tags">标签</router-link>
      </el-menu-item>
      <el-menu-item index="5">
        <router-link to="/about">信息</router-link>
      </el-menu-item>
    </el-menu>

<!-- 右侧功能区 -->
    <div class="nav-right">

      <el-dropdown v-if="isLegacyArticlePage">
        <el-button type="primary" :icon="EditPen">
          编辑
        </el-button>
        
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="goEdit">编辑文章</el-dropdown-item>
            <el-dropdown-item @click="goWrite">新建文章</el-dropdown-item>
          </el-dropdown-menu>
        </template>

      </el-dropdown>

      <el-button v-if="!isLegacyArticlePage" type="primary" :icon="EditPen" @click="goWrite">
        写文章
      </el-button>
      <el-button type="primary" :icon="Search" @click="goSearch">
        搜索
      </el-button>
      <el-button type="primary" :icon="User" @click="goLogin">
        登录
      </el-button>
    </div>

    <el-dialog
      v-model="searchDialogVisible"
      title="搜索文章"
      width="560px"
      class="search-dialog"
      append-to-body
    >
      <form class="quick-search-form" @submit.prevent="runQuickSearch">
        <el-input
          v-model="searchInput"
          clearable
          autofocus
          placeholder="输入关键词"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" native-type="submit" :loading="searchLoading">
          搜索
        </el-button>
      </form>

      <div v-if="searchLoading" class="quick-search-state">
        <el-skeleton :rows="3" animated />
      </div>

      <div v-else-if="!searchInput.trim()" class="quick-search-state">
        输入关键词搜索文章标题、摘要、正文、分类和标签。
      </div>

      <div v-else-if="searchTouched && !searchResults.length" class="quick-search-state">
        没有找到相关文章。
      </div>

      <div v-else-if="searchResults.length" class="quick-result-list">
        <button
          v-for="post in searchResults"
          :key="post.slug"
          type="button"
          class="quick-result-item"
          @click="goPost(post.slug)"
        >
          <span class="quick-result-title">{{ post.title }}</span>
          <span class="quick-result-summary">{{ post.summary }}</span>
        </button>
      </div>

      <template #footer>
        <el-button @click="searchDialogVisible = false">关闭</el-button>
        <el-button type="primary" @click="goSearchPage">查看全部结果</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="css" scoped>
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-right: 20px;
  background-color: var(--blog-surface);
  border-bottom: 1px solid var(--blog-border);
}

.el-menu-demo {
  flex-grow: 1;
}

.el-menu-demo a {
  color: inherit;
  text-decoration: none;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon {
  margin-right: 4px;
  font-size: 16px;
}

.quick-search-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.quick-search-state {
  padding: 18px 0 4px;
  color: var(--blog-muted);
  text-align: left;
}

.quick-result-list {
  display: grid;
  gap: 8px;
  padding-top: 14px;
}

.quick-result-item {
  display: grid;
  gap: 4px;
  width: 100%;
  border: 1px solid var(--blog-border);
  border-radius: 6px;
  padding: 12px;
  background: var(--blog-surface);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.quick-result-item:hover {
  border-color: var(--blog-border-strong);
}

.quick-result-title {
  color: var(--blog-text);
  font-weight: 600;
}

.quick-result-summary {
  color: var(--blog-muted);
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 640px) {
  .navbar {
    align-items: flex-start;
    padding-right: 12px;
  }

  .nav-right {
    gap: 8px;
  }

  .quick-search-form {
    grid-template-columns: 1fr;
  }
}
</style>
