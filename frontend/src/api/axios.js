import axios from 'axios';

const api = axios.create({
  // This is where your FastAPI server is running
  baseURL: 'http://127.0.0.1:8000',
});

// This "Interceptor" automatically attaches your JWT token 
// to every request if it exists in your browser's storage.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;