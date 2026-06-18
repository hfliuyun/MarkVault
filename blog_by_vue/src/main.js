import { createApp } from 'vue'
import './style.css'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import axios from 'axios'
import { useAuth } from './composables/useAuth'

// 配置后端的 API 基础路径，生产环境由 Cloudflare Pages 提供环境变量
if (import.meta.env.VITE_API_BASE_URL) {
  axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL;
}

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('markvault_jwt');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuth().clearAuth();
    }
    return Promise.reject(error);
  }
);

const app = createApp(App);
app.use(ElementPlus);
app.use(router);
app.mount('#app');
