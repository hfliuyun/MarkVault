import axios from 'axios';

export async function createPaste({ content, title, language, expires_in }) {
  const response = await axios.post('/api/paste', { content, title, language, expires_in });
  return response.data;
}

export async function getPaste(id) {
  const response = await axios.get(`/api/paste/${encodeURIComponent(id)}`);
  return response.data;
}

export async function listPastes() {
  const response = await axios.get('/api/pastes');
  return response.data;
}

export async function deletePaste(id) {
  const response = await axios.delete(`/api/paste/${encodeURIComponent(id)}`);
  return response.data;
}
