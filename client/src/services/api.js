import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api"
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("talesync_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global error handler for network failures
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('Request timeout. Please try again.'));
    }
    if (!error.response) {
      // Network error (no response from server)
      return Promise.reject(new Error('Network error. Please check your connection and try again.'));
    }
    // Pass through server errors
    return Promise.reject(error);
  }
);

export default api;

