<script setup>
import { Delete, FolderOpened, Plus, Refresh, UploadFilled, View } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import JSZip from 'jszip';
import { deletePost, downloadTemplate, listManagedPosts, uploadPost } from '@/api/manage';
import { listCategories, listTags } from '@/api/taxonomy';
import { listSeries } from '@/api/series';
import { useAuth } from '@/composables/useAuth';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const router = useRouter();
const { checkAuth, isAuthenticated, requireAuth } = useAuth();

const activeTab = ref('list');

async function ensureAuth() {
  if (isAuthenticated.value) return true;
  try {
    await requireAuth();
    return true;
  } catch (error) {
    return false;
  }
}

/* ---------- Tab 1: 文章列表 ---------- */
const posts = ref([]);
const loadingList = ref(false);
const filterText = ref('');

const filteredPosts = computed(() => {
  const query = filterText.value.trim().toLowerCase();
  if (!query) return posts.value;
  return posts.value.filter(
    (post) =>
      (post.title || '').toLowerCase().includes(query) ||
      (post.slug || '').toLowerCase().includes(query)
  );
});

async function loadPosts() {
  if (!(await ensureAuth())) return;
  loadingList.value = true;
  try {
    const data = await listManagedPosts();
    posts.value = data.articles || [];
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '加载文章列表失败');
  } finally {
    loadingList.value = false;
  }
}

function viewPost(slug) {
  router.push({ name: 'PostDetail', params: { slug } });
}

async function handleDelete(post) {
  if (!(await ensureAuth())) return;
  try {
    await deletePost(post.slug);
    posts.value = posts.value.filter((item) => item.slug !== post.slug);
    ElMessage.success('文章已删除');
  } catch (error) {
    ElMessage.error(error.response?.data?.error || '删除失败');
  }
}

/* ---------- Tab 2: 创建模板 ---------- */
const tpl = reactive({
  title: '',
  slug: '',
  summary: '',
  categories: [],
  tags: [],
  series_id: '',
  series_title: '',
  series_order: null,
});
const downloading = ref(false);

// 已有分类 / 标签 / 系列，供创建模板时选择（仍允许输入新值）
const categoryOptions = ref([]);
const tagOptions = ref([]);
const seriesOptions = ref([]);

async function loadTaxonomies() {
  try {
    const [categories, tags, series] = await Promise.all([
      listCategories(),
      listTags(),
      listSeries(),
    ]);
    categoryOptions.value = (categories.categories || []).map((item) => item.name);
    tagOptions.value = (tags.tags || []).map((item) => item.name);
    seriesOptions.value = (series.series || []).map((item) => ({ 
      id: item.id, 
      title: item.title,
      count: item.count || 0
    }));
  } catch (error) {
    // 选项加载失败不阻断模板创建，用户仍可手动输入。
  }
}

function onSeriesIdChange(id) {
  const match = seriesOptions.value.find((item) => item.id === id);
  if (match) {
    tpl.series_title = match.title;
    tpl.series_order = match.count + 1;
  }
}

const isExistingSeries = computed(() => {
  return seriesOptions.value.some((item) => item.id === tpl.series_id);
});

const slugValid = computed(() => SLUG_RE.test(tpl.slug.trim()));

async function readBlobError(error) {
  const data = error.response?.data;
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()).error;
    } catch (parseError) {
      return '';
    }
  }
  return error.response?.data?.error || '';
}

async function handleDownloadTemplate() {
  if (!tpl.title.trim()) {
    ElMessage.warning('请填写标题');
    return;
  }
  if (!slugValid.value) {
    ElMessage.warning('slug 格式不合法（小写字母、数字、单个连字符）');
    return;
  }
  if (!(await ensureAuth())) return;

  downloading.value = true;
  try {
    const slug = tpl.slug.trim();
    const response = await downloadTemplate({
      title: tpl.title.trim(),
      slug,
      summary: tpl.summary.trim(),
      categories: tpl.categories,
      tags: tpl.tags,
      series_id: (tpl.series_id || '').trim() || undefined,
      series_title: (tpl.series_title || '').trim() || undefined,
      series_order: tpl.series_order ?? undefined,
    });
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
    ElMessage.success('模板已生成并下载');
  } catch (error) {
    ElMessage.error((await readBlobError(error)) || '生成模板失败');
  } finally {
    downloading.value = false;
  }
}

/* ---------- Tab 3: 上传文章 ---------- */
const stagedFile = ref(null);
const stagedName = ref('');
const uploading = ref(false);
const folderInput = ref(null);

function stageFile(file, displayName) {
  if (file.size > MAX_UPLOAD_BYTES) {
    ElMessage.warning('文件超过 50MB 限制');
    return;
  }
  stagedFile.value = file;
  stagedName.value = displayName;
}

function onZipChange(uploadFile) {
  const raw = uploadFile.raw;
  if (!raw) return;
  if (!raw.name.toLowerCase().endsWith('.zip')) {
    ElMessage.warning('请选择 .zip 文件');
    return;
  }
  stageFile(raw, raw.name);
}

async function onFolderChange(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length) return;

  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.webkitRelativePath || file.name, file);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const rootName = (files[0].webkitRelativePath || '').split('/')[0] || 'folder';
  stageFile(new File([blob], `${rootName}.zip`, { type: 'application/zip' }), `${rootName}/ (文件夹)`);
}

function clearStaged() {
  stagedFile.value = null;
  stagedName.value = '';
}

async function doUpload(overwrite = false) {
  if (!stagedFile.value) {
    ElMessage.warning('请先选择 ZIP 文件或文件夹');
    return;
  }
  if (!(await ensureAuth())) return;

  uploading.value = true;
  try {
    const result = await uploadPost(stagedFile.value, overwrite);
    ElMessage.success(`发布成功：${result.path}`);
    clearStaged();
    activeTab.value = 'list';
    await loadPosts();
  } catch (error) {
    if (error.response?.status === 409) {
      try {
        await ElMessageBox.confirm(
          error.response?.data?.error || '该 slug 已存在，是否覆盖发布？',
          '覆盖已有文章',
          { confirmButtonText: '覆盖发布', cancelButtonText: '取消', type: 'warning' }
        );
      } catch (cancelled) {
        return;
      }
      await doUpload(true);
      return;
    }
    ElMessage.error(error.response?.data?.error || '上传失败');
  } finally {
    uploading.value = false;
  }
}

const locationLabel = (location) => (location === 'series' ? '系列' : '独立');

onMounted(async () => {
  loadTaxonomies();
  await checkAuth();
  await loadPosts();
});
</script>

<template>
  <section class="manage-page">
    <header class="page-heading glass-panel">
      <h1>文章管理</h1>
      <p>管理已发布文章、生成写作模板、上传发布新文章。</p>
    </header>

    <section class="manage-body glass-panel">
      <el-tabs v-model="activeTab" class="manage-tabs">
        <!-- Tab 1: 文章列表 -->
        <el-tab-pane label="文章列表" name="list">
          <div class="list-toolbar">
            <el-input
              v-model="filterText"
              class="filter-input"
              placeholder="按标题或 slug 筛选"
              clearable
            />
            <el-button text :loading="loadingList" @click="loadPosts">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>

          <el-table :data="filteredPosts" v-loading="loadingList" class="post-table" empty-text="暂无文章">
            <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
            <el-table-column prop="slug" label="slug" min-width="150" show-overflow-tooltip />
            <el-table-column prop="date" label="日期" min-width="160" />
            <el-table-column label="分类" min-width="140">
              <template #default="{ row }">
                <el-tag v-for="cat in row.categories" :key="cat" size="small" class="cell-tag">{{ cat }}</el-tag>
                <span v-if="!row.categories?.length" class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="系列" min-width="140">
              <template #default="{ row }">
                <span v-if="row.series?.title">{{ row.series.title }}</span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="位置" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.location === 'series' ? 'warning' : 'info'">
                  {{ locationLabel(row.location) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button text size="small" @click="viewPost(row.slug)">
                  <el-icon><View /></el-icon>
                  查看
                </el-button>
                <el-popconfirm
                  title="确定删除这篇文章？"
                  confirm-button-text="删除"
                  cancel-button-text="取消"
                  @confirm="handleDelete(row)"
                >
                  <template #reference>
                    <el-button text size="small" type="danger">
                      <el-icon><Delete /></el-icon>
                      删除
                    </el-button>
                  </template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- Tab 2: 创建模板 -->
        <el-tab-pane label="创建模板" name="template">
          <form class="tpl-form" @submit.prevent="handleDownloadTemplate">
            <div class="field">
              <label>标题 <span class="req">*</span></label>
              <input v-model="tpl.title" class="text-input" placeholder="文章标题" />
            </div>

            <div class="field">
              <label>slug <span class="req">*</span></label>
              <input v-model="tpl.slug" class="text-input" placeholder="例如 logistic-regression" />
              <small v-if="tpl.slug && !slugValid" class="hint-error">
                只能包含小写字母、数字和单个连字符
              </small>
            </div>

            <div class="field">
              <label>摘要</label>
              <textarea v-model="tpl.summary" class="text-area" placeholder="简短描述（可选）" />
            </div>

            <div class="grid-2">
              <div class="field">
                <label>分类</label>
                <el-select
                  v-model="tpl.categories"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  :reserve-keyword="false"
                  placeholder="选择已有或输入后回车新增"
                >
                  <el-option v-for="name in categoryOptions" :key="name" :label="name" :value="name" />
                </el-select>
              </div>
              <div class="field">
                <label>标签</label>
                <el-select
                  v-model="tpl.tags"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  :reserve-keyword="false"
                  placeholder="选择已有或输入后回车新增"
                >
                  <el-option v-for="name in tagOptions" :key="name" :label="name" :value="name" />
                </el-select>
              </div>
            </div>

            <div class="grid-3">
              <div class="field">
                <label>系列 ID</label>
                <el-select
                  v-model="tpl.series_id"
                  filterable
                  allow-create
                  clearable
                  default-first-option
                  :reserve-keyword="false"
                  placeholder="选择已有系列或输入新 ID"
                  @change="onSeriesIdChange"
                >
                  <el-option
                    v-for="series in seriesOptions"
                    :key="series.id"
                    :label="`${series.title}（${series.id}）`"
                    :value="series.id"
                  />
                </el-select>
              </div>
              <div class="field">
                <label>系列标题</label>
                <input 
                  v-model="tpl.series_title" 
                  class="text-input" 
                  :disabled="isExistingSeries"
                  :placeholder="isExistingSeries ? '已有系列不可修改标题' : '填写新系列标题'" 
                />
              </div>
              <div class="field">
                <label>系列排序</label>
                <el-input-number v-model="tpl.series_order" :min="1" controls-position="right" />
              </div>
            </div>

            <div class="form-actions">
              <el-button type="primary" native-type="submit" :loading="downloading">
                <el-icon><Plus /></el-icon>
                生成并下载
              </el-button>
            </div>
          </form>
        </el-tab-pane>

        <!-- Tab 3: 上传文章 -->
        <el-tab-pane label="上传文章" name="upload">
          <div class="upload-area">
            <el-upload
              drag
              :auto-upload="false"
              :show-file-list="false"
              accept=".zip"
              :on-change="onZipChange"
            >
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">将 ZIP 拖到此处，或 <em>点击选择</em></div>
              <template #tip>
                <div class="upload-tip">支持模板下载的 ZIP，或包含 index.md 的文章目录（≤ 50MB）。</div>
              </template>
            </el-upload>

            <div class="folder-row">
              <input
                ref="folderInput"
                type="file"
                webkitdirectory
                multiple
                style="display: none"
                @change="onFolderChange"
              />
              <el-button @click="folderInput?.click()">
                <el-icon><FolderOpened /></el-icon>
                选择文件夹上传
              </el-button>
            </div>

            <div v-if="stagedName" class="staged">
              <span class="staged-name">已选择：{{ stagedName }}</span>
              <div class="staged-actions">
                <el-button text @click="clearStaged">移除</el-button>
                <el-button type="primary" :loading="uploading" @click="doUpload(false)">
                  <el-icon><Plus /></el-icon>
                  发布
                </el-button>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </section>
  </section>
</template>

<style scoped>
.manage-page {
  width: min(1120px, 100%);
  margin: 0 auto;
}

.manage-body {
  padding: 12px 24px 24px;
}

/* 列表 */
.list-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.filter-input {
  max-width: 320px;
}

.post-table {
  background: transparent;
}

.cell-tag {
  margin: 2px 4px 2px 0;
}

.muted {
  color: var(--blog-muted);
}

/* 表单（模板 / 上传） */
.tpl-form {
  max-width: 760px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}

.field label {
  color: var(--blog-subtle);
  font-size: 14px;
  font-weight: 600;
}

.req {
  color: var(--blog-accent);
}

.text-input,
.text-area {
  border: 1px solid var(--blog-border);
  border-radius: var(--radius-md);
  background: var(--blog-surface);
  color: var(--blog-text);
  outline: none;
  transition: all 0.3s ease;
}

.text-input:focus,
.text-area:focus {
  border-color: var(--blog-accent);
  box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.15);
  background: var(--blog-surface-hover);
}

.text-input:disabled,
.text-area:disabled {
  background: rgba(0, 0, 0, 0.05);
  color: var(--blog-muted);
  cursor: not-allowed;
  border-color: rgba(255, 255, 255, 0.1);
}

[data-theme='dark'] .text-input:disabled,
[data-theme='dark'] .text-area:disabled {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.05);
}

[data-theme='dark'] .text-input:focus,
[data-theme='dark'] .text-area:focus {
  box-shadow: 0 0 0 3px rgba(41, 151, 255, 0.2);
}

.text-input {
  height: 42px;
  padding: 0 12px;
}

.text-area {
  min-height: 96px;
  padding: 12px;
  resize: vertical;
  line-height: 1.6;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.grid-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
}

.hint-error {
  color: #f56c6c;
  font-size: 12px;
}

.form-actions {
  margin-top: 8px;
}

/* 上传 */
.upload-area {
  max-width: 760px;
}

.upload-tip {
  margin-top: 8px;
  color: var(--blog-muted);
  font-size: 13px;
}

.folder-row {
  margin-top: 16px;
}

.staged {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  padding: 14px 16px;
  border: 1px solid var(--blog-border);
  border-radius: var(--radius-md);
  background: var(--blog-surface);
  overflow-wrap: anywhere;
}

.staged-name {
  color: var(--blog-subtle);
}

.staged-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

/* Element Plus 表格在玻璃面板上透明化 */
.manage-body :deep(.el-table),
.manage-body :deep(.el-table__body),
.manage-body :deep(.el-table tr),
.manage-body :deep(.el-table th.el-table__cell),
.manage-body :deep(.el-table td.el-table__cell) {
  background-color: transparent;
}

.manage-body :deep(.el-select) {
  width: 100%;
}

@media (max-width: 640px) {
  .manage-body {
    padding: 12px 16px 18px;
  }

  .grid-2,
  .grid-3 {
    grid-template-columns: 1fr;
  }

  .filter-input {
    max-width: none;
  }

  .staged {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
