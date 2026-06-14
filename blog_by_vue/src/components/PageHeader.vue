<script lang="js" setup>
import { EditPen, Search, User, Sunny, Moon } from '@element-plus/icons-vue'
import { computed, onBeforeUnmount, ref, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
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

// Theme logic
const isDarkMode = ref(false);
const isHidden = ref(false);
let lastScrollY = 0;

const handleScroll = () => {
  const currentScrollY = window.scrollY || document.documentElement.scrollTop;
  if (currentScrollY > lastScrollY && currentScrollY > 60) {
    isHidden.value = true;
  } else if (currentScrollY < lastScrollY) {
    isHidden.value = false;
  }
  lastScrollY = currentScrollY <= 0 ? 0 : currentScrollY;
};

const toggleTheme = () => {
  isDarkMode.value = !isDarkMode.value;
  document.documentElement.setAttribute('data-theme', isDarkMode.value ? 'dark' : 'light');
  localStorage.setItem('theme', isDarkMode.value ? 'dark' : 'light');
};

onMounted(() => {
  window.addEventListener('scroll', handleScroll, { passive: true });
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    isDarkMode.value = savedTheme === 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    isDarkMode.value = prefersDark;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
});

const activeIndex = computed(() => {
  if (route.path.startsWith('/series')) return '2';
  if (route.path.startsWith('/categories')) return '3';
  if (route.path.startsWith('/tags')) return '4';
  if (route.path.startsWith('/about')) return '5';
  return '1';
});

const isLegacyArticlePage = computed(() => route.path.startsWith('/p/'));

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

onBeforeUnmount(() => {
  clearQuickSearchTimer();
  window.removeEventListener('scroll', handleScroll);
});
</script>

<template>
  <div class="header-wrapper" :class="{ 'is-hidden': isHidden }">
    <header class="glass-header">
      <nav class="nav-links">
        <router-link to="/" class="nav-item" :class="{ active: activeIndex === '1' }">首页</router-link>
        <router-link to="/series" class="nav-item" :class="{ active: activeIndex === '2' }">系列</router-link>
        <router-link to="/categories" class="nav-item" :class="{ active: activeIndex === '3' }">分类</router-link>
        <router-link to="/tags" class="nav-item" :class="{ active: activeIndex === '4' }">标签</router-link>
        <router-link to="/about" class="nav-item" :class="{ active: activeIndex === '5' }">信息</router-link>
      </nav>

      <!-- 右侧功能区 -->
      <div class="nav-right">
        <button type="button" class="glass-icon-btn" @click.prevent="toggleTheme" :title="isDarkMode ? '浅色模式' : '深色模式'">
          <el-icon><Sunny v-if="!isDarkMode" /><Moon v-else /></el-icon>
        </button>

        <button type="button" class="glass-icon-btn" @click.prevent="goSearch" title="搜索">
          <el-icon><Search /></el-icon>
        </button>

        <el-dropdown v-if="isLegacyArticlePage" trigger="click">
          <button type="button" class="glass-icon-btn" title="编辑">
            <el-icon><EditPen /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="goEdit">编辑文章</el-dropdown-item>
              <el-dropdown-item @click="goWrite">新建文章</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <button v-if="!isLegacyArticlePage" type="button" class="glass-icon-btn" @click.prevent="goWrite" title="写文章">
          <el-icon><EditPen /></el-icon>
        </button>

        <button type="button" class="glass-icon-btn" @click.prevent="goLogin" title="登录">
          <el-icon><User /></el-icon>
        </button>
      </div>
    </header>

    <el-dialog
      v-model="searchDialogVisible"
      title="搜索文章"
      width="560px"
      class="search-dialog glass-dialog"
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
.header-wrapper {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  justify-content: center;
  padding: 16px 20px;
  pointer-events: none; /* Let clicks pass through empty spaces */
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.header-wrapper.is-hidden {
  transform: translateY(-100%);
}

.glass-header {
  pointer-events: auto; /* Re-enable clicks on the header itself */
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  max-width: 900px;
  height: 56px;
  padding: 0 8px 0 24px;
  background: var(--blog-surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--blog-border);
  border-radius: 28px;
  box-shadow: var(--glass-shadow);
  transition: all 0.3s ease;
}

.nav-links {
  display: flex;
  gap: 20px;
}

.nav-item {
  color: var(--blog-subtle);
  text-decoration: none;
  font-size: 15px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 16px;
  transition: all 0.2s ease;
}

.nav-item:hover {
  color: var(--blog-text);
  background: rgba(0, 0, 0, 0.05);
}

[data-theme='dark'] .nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.nav-item.active {
  color: var(--blog-text);
  font-weight: 600;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.glass-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--blog-subtle);
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.2s ease;
}

.glass-icon-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--blog-text);
}

[data-theme='dark'] .glass-icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
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
  border-radius: 12px;
  padding: 12px 16px;
  background: rgba(0,0,0,0.02);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
}

[data-theme='dark'] .quick-result-item {
  background: rgba(255,255,255,0.02);
}

.quick-result-item:hover {
  background: var(--blog-surface-hover);
  border-color: var(--blog-border-strong);
}

.quick-result-title {
  color: var(--blog-text);
  font-weight: 600;
  font-size: 15px;
}

.quick-result-summary {
  color: var(--blog-muted);
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 640px) {
  .glass-header {
    padding: 0 4px 0 16px;
    border-radius: 20px;
  }
  
  .nav-links {
    gap: 8px;
  }
  
  .nav-item {
    padding: 4px 8px;
    font-size: 14px;
  }
  
  .glass-icon-btn {
    width: 36px;
    height: 36px;
    font-size: 16px;
  }

  .quick-search-form {
    grid-template-columns: 1fr;
  }
}
</style>
