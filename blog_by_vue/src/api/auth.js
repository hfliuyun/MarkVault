import axios from 'axios';

export async function verifyTotp(code) {
  const response = await axios.post('/api/auth/verify', { code });
  return response.data;
}

export async function checkAuthStatus() {
  const response = await axios.get('/api/auth/status');
  return response.data;
}

export async function getAuthProvisioningUri() {
  const response = await axios.get('/api/auth/provisioning-uri');
  return response.data;
}
