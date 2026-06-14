import axios from 'axios';

export async function listCategories() {
  const response = await axios.get('/api/categories');
  return response.data;
}

export async function listTags() {
  const response = await axios.get('/api/tags');
  return response.data;
}
