import axios from 'axios';

export async function listSeries() {
  const response = await axios.get('/api/series');
  return response.data;
}

export async function getSeries(seriesId) {
  const response = await axios.get(`/api/series/${encodeURIComponent(seriesId)}`);
  return response.data;
}
