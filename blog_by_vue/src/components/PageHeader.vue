
<script lang="js" setup>
import { EditPen, Search, User } from '@element-plus/icons-vue'
import { computed } from 'vue';
import { useRouter,useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();

const activeIndex = computed(() => {
  if (route.path.startsWith('/series')) return '2';
  if (route.path.startsWith('/about')) return '3';
  return '1';
});

const isLegacyArticlePage = computed(() => route.path.startsWith('/p/'));

const handleSelect = () => {};

const goWrite = () => {
  router.push('/write');
};

const goSearch = () => {};
const goLogin = () => {};

const goEdit = () => {
  const abbrlink = route.path.split('/')[2];
  if(!abbrlink) {
    console.error('无法获取文章缩略链接,无法编辑文章');
    return;
  }
  router.push(`/write?edit=${abbrlink}`);
}

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



</div>
</template>

<style lang="css" scoped>
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-right: 20px;
  background-color: #fff;
  border-bottom: 1px solid #eee;
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
</style>
