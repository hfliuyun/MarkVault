import axios from 'axios';

export async function listManagedPosts() {
  const response = await axios.get('/api/manage/posts');
  return response.data;
}

export async function downloadTemplate(options) {
  const response = await axios.post('/api/posts/template', options, {
    responseType: 'blob',
  });
  return response;
}

export async function uploadPost(file, overwrite = false) {
  const form = new FormData();
  form.append('file', file);
  form.append('overwrite', String(overwrite));
  const response = await axios.post('/api/posts/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function deletePost(slug) {
  const response = await axios.delete(`/api/posts/${encodeURIComponent(slug)}`);
  return response.data;
}
