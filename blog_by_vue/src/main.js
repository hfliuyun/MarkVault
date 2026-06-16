import { createApp } from 'vue'
import './style.css'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router from './router'
import axios from 'axios'
import { useAuth } from './composables/useAuth'

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
