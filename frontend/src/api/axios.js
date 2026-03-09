import axios from "axios";

const api = axios.create({
  // This is where your FastAPI server is running
  baseURL: "http://127.0.0.1:8000",
});

// This "Interceptor" automatically attaches your JWT token
// to every request if it exists in your browser's storage.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Interceptor: Catch the 401s
api.interceptors.response.use(
  (response) => response, // If the request succeeds, just return the response
  (error) => {
    if (
      error.response &&
      error.response.status === 401 &&
      !error.config.url.includes("/login")
    ) {
      // Token expired or invalid!
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      // Force a redirect to login
      window.location.href = "/login?expired=true";
    }
    return Promise.reject(error);
  },
);

export default api;
