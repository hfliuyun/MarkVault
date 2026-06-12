<script setup >
import { onMounted, reactive } from 'vue';
import { MdEditor } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import axios from 'axios';
import { ElMessage } from 'element-plus';
import { useRoute } from 'vue-router';


const route = useRoute();
const editID = route.query.edit || ''; // 获取编辑文章的缩略链接参数
console.log('编辑文章的缩略链接:', editID);

const postData = reactive({
    text: '', // Markdown 内容
    title: '', // 文章标题
    categories: [], // 文章分类
})


// // --- 使用 reactive 来管理整个文章对象 ---
// const postData = reactive({
//   text: '## 从这里开始\n\n写下你的精彩内容...', // 编辑器 Markdown 内容
//   title: '', // 文章标题
//   categories: [], // 文章分类
// });

onMounted(async  () => {
    // 如果有 editID，尝试加载现有文章数据
    if (editID) {
        fetchArticleById(editID);
    } else {
        console.log('新建文章，无需加载现有数据');
        postData = reactive({
            text: '## 从这里开始\n\n写下你的精彩内容...', // 编辑器 Markdown 内容
            title: '', // 文章标题
            categories: [], // 文章分类
        });
    }
});

async function fetchArticleById(id) {
    try {
        // 假设后端 API 是 /api/get_post
       const response = await axios.get(`/api/md/${id}`);
       const data = response.data;
       if (data.error) {
            ElMessage.warning("文章不存在或已被删除！");
            return;
       }
       // 更新 postData 的内容
       postData.text = data.content || '';
       postData.title = data.title || '';
       postData.categories = [data.categories] || [];
        //console.log('文章数据加载成功:', postData);
    } catch (error) {
        console.error('获取文章时发生错误:', error);
        ElMessage.error('加载文章时发生网络错误！');
    }
}


// --- 实现图片上传功能 ---
const onUploadImg = async (files, callback) => {
  // 使用 Promise.all 来支持同时上传多张图片
  try {
    const responses = await Promise.all(
      files.map((file) => {
        // 后端 API 需要的字段名是 'image'
        const form = new FormData();
        form.append('image', file);

        return axios.post('/api/upload_image', form, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      })
    );

    // 从所有成功的响应中提取 URL
    // 我们假设后端成功时返回 { url: '...' }
    const urls = responses.map((res) => res.data.url);
    
    // 调用回调函数，将 URL 数组插入到编辑器中
    callback(urls);
    ElMessage.success('图片上传成功！');

  } catch (error) {
    console.error('图片上传失败:', error);
    ElMessage.error('图片上传失败，请检查网络或联系管理员。');
  }
};


// --- 实现保存功能 (修正了拼写 onSvae -> onSave) ---
// onSave 事件会在用户按 Ctrl+S 时触发
const handleSave = async (markdownContent) => {
  // 检查标题是否为空
  if (!postData.title.trim()) {
    ElMessage.warning('请输入文章标题！');
    return;
  }
  
  console.log('正在保存文章...');
  console.log('标题:', postData.title);
  console.log('分类:', postData.categories);
  console.log('Markdown内容:', markdownContent);

  try {
    // 构造发送到后端的数据包
    const payload = {
      title: postData.title,
      categories: postData.categories,
      content: markdownContent, // 使用事件传递过来的最新内容
      // 如果是编辑现有文章，您可能还需要一个 id 字段
      // id: 'some-post-id'
    };
    
    // 调用后端的保存接口
    const response = await axios.post('/api/save_post', payload);

    // 根据后端的响应给出提示
    // 假设后端成功时返回 { message: '...' }
    ElMessage.success(response.data.message || '文章保存成功！');
    
  } catch (error) {
    console.error('保存文章时出错:', error);
    const errorMessage = error.response?.data?.error || '保存文章时发生网络错误！';
    ElMessage.error(errorMessage);
  }
};
</script>

<template>
  <div class="edit-page-container">
    <!-- 美化后的文章信息表单 -->
    <el-card class="post-info-card" shadow="never">
      <div class="post-info-form">
        <div class="form-item">
          <span class="label">文章标题</span>
          <el-input
            v-model="postData.title"
            placeholder="请输入文章标题"
            size="large"
            clearable
          />
        </div>

        <div class="form-item">
          <span class="label">文章分类</span>
          <!-- 假设您已经安装并全局注册了 el-input-tag -->
          <!-- 如果没有，请使用 npm install el-input-tag -->
          <el-input-tag
            v-model="postData.categories"
            placeholder="输入后按回车添加分类"
            clearable
            style="width: 100%;"
          />
        </div>
      </div>
    </el-card>

    <!-- 编辑器组件 -->
    <md-editor
      v-model="postData.text"
      class="editor-instance"
      language="zh-CN"
      :on-upload-img="onUploadImg"
      @on-save="handleSave"
    />
  </div>
</template>

<style scoped>
.edit-page-container {
  padding: 20px;
  background-color: #f4f5f7;
}

/* 美化卡片和表单 */
.post-info-card {
  margin-bottom: 20px;
  border: none;
}
.post-info-form {
  display: flex;
  flex-direction: column;
  gap: 20px; /* 控制表单项之间的间距 */
}
.form-item {
  display: flex;
  flex-direction: center;
  gap: 12px; /* 控制标签和输入框之间的间距 */
}
.form-item .label {
  width: 90px; /* 固定标签宽度，保持对齐 */
  font-size: 14px;
  color: #606266;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 编辑器实例样式 */
.editor-instance {
  height: calc(100vh - 280px); /* 动态计算高度，减去顶部表单和页边距 */
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  text-align: left;
}
</style>