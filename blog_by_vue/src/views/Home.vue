<script setup>
import { ref, onMounted } from 'vue';
// 引入 Element Plus 图标
import { Calendar, CollectionTag } from '@element-plus/icons-vue';
import axios from 'axios';

// --- 响应式数据定义 ---

const articleList = ref([]);
const loading = ref(true);
const currentPage = ref(1);
const pageSize = ref(10); // 卡片式布局，每页10篇可能更合适
const total = ref(0);

// --- 数据获取逻辑 ---

/**
 * @description 获取文章列表数据
 * @param {number} page - 页码
 * 
 * 后端 Flask API 应返回如下结构的 JSON：
 * {
 *   "total": 50, // 文章总数
 *   "articles": [
 *     { 
 *       "abbrlink": "a3d799f8", 
 *       "title": "安装wslg fedora后一些配置", 
 *       "publishedDate": "2023-04-30", 
 *       "category": "WSL",
 *       "summary": "由于受不了Fedora KED的缩放(在笔记本屏幕上不启用缩放感觉字体实在太小...)，就重新回到windows了。但是又希望用到linux下的开发环境，这时wsl就很合适了..."
 *     },
 *     // ... more articles
 *   ]
 * }
 */
const fetchArticles = async (page = 1) => {
  loading.value = true;
  try {
    const response = await axios.get('/api/posts', {
      params: {
        page: page,
        size: pageSize.value
      }
    });
    // 更新响应式数据

    articleList.value = response.data.articles;
    total.value = response.data.total;
    currentPage.value = page;

  } catch (error) {
    console.error("获取文章列表失败:", error);
  } finally {
    loading.value = false;
  }
};

// --- 事件处理 ---

const handleCurrentChange = (val) => {
  window.scrollTo(0, 0); // 翻页后自动滚动到页面顶部
  fetchArticles(val);
};

// --- 生命周期函数 ---

onMounted(() => {
  fetchArticles(currentPage.value);
});
</script>

<template>
  <div class="home-container">
    <!-- 加载时的骨架屏 -->
    <div v-if="loading">
      <el-card v-for="i in 5" :key="i" class="post-card" shadow="hover">
        <el-skeleton :rows="4" animated />
      </el-card>
    </div>

    <!-- 文章列表 -->
    <div v-else>
      <el-card v-for="article in articleList" :key="article.slug" class="post-card" shadow="hover">
        <h2 class="article-title">
          <router-link
            :to="{ name: 'PostDetail', params: { slug: article.slug } }"
            class="title-link"
          >
            {{ article.title }}
          </router-link>
        </h2>
        <div class="article-meta-wrap">
          <span class="post-meta-item">
            <el-icon><Calendar /></el-icon>
            <span class="meta-label">发表于</span>
            <time>{{ article.date}}</time>
          </span>
          <span class="post-meta-item">
            <el-icon><CollectionTag /></el-icon>
            <span class="meta-label">分类于</span>
            <!-- 分类也可以做成一个链接 -->
            <span class="category-link">{{ article.categories?.join?.(' / ') || '未分类' }}</span>
          </span>
          <span v-if="article.tags?.length" class="post-meta-item tags">
            <el-tag v-for="tag in article.tags" :key="tag" size="small" effect="plain">{{ tag }}</el-tag>
          </span>
        </div>
        <div class="content">
          {{ article.summary }}
        </div>
      </el-card>
    </div>

    <!-- 分页控件 -->
    <div class="pagination-container" v-if="!loading && total > 0">
      <el-pagination
        background
        :current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next, jumper"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

<style scoped>
.home-container {
  padding: 20px 5%; /* 使用百分比边距，适应不同屏幕宽度 */
  max-width: 900px; /* 设置最大宽度，防止在大屏幕上内容过宽 */
  margin: 0 auto; /* 居中显示 */
}

.post-card {
  margin-bottom: 25px;
}

.article-title {
  margin-top: 0;
  margin-bottom: 15px;
  font-size: 1.8em;
}

.title-link {
  color: #303133;
  text-decoration: none;
  transition: color 0.3s;
}

.title-link:hover {
  color: #409eff;
}

.article-meta-wrap {
  color: #909399;
  font-size: 0.9em;
  display: flex;
  align-items: center;
  flex-wrap: wrap; /* 在小屏幕上换行 */
  margin-bottom: 15px;
}

.post-meta-item {
  display: flex;
  align-items: center;
  margin-right: 20px;
}

.post-meta-item.tags {
  gap: 6px;
}

.post-meta-item .el-icon {
  margin-right: 5px;
}

.category-link {
  color: #909399;
  text-decoration: none;
  transition: color 0.3s;
}

.category-link:hover {
  color: #409eff;
}

.content {
  color: #606266;
  line-height: 1.6;
}

.pagination-container {
  display: flex;
  justify-content: center;
  margin-top: 30px;
}
</style>
