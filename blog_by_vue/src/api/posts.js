import axios from 'axios';

export async function listPosts({ page = 1, size = 10 } = {}) {
  const response = await axios.get('/api/posts', {
    params: { page, size },
  });
  return response.data;
}

export async function getPost(slug) {
  const response = await axios.get(`/api/posts/${encodeURIComponent(slug)}`);
  return response.data;
}

export async function getLegacyPost(abbrlink) {
  const response = await axios.get(`/api/p/${encodeURIComponent(abbrlink)}`);
  return response.data;
}
