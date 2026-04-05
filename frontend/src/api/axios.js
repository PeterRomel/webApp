import axios from "axios";

const api = axios.create({
  // Use localhost for dev, but use an empty string in production so it relies on the actual domain (Nginx)
  baseURL: import.meta.env.DEV ? "http://127.0.0.1:8000" : "",
});

// This "Interceptor" automatically attaches your JWT token
// to every request if it exists in your browser's storage.
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("token");
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
      !error.config.url.includes("/login") &&
      window.location.pathname !== "/login"
    ) {
      // Token expired or invalid!
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("user");

      // Force a redirect to login
      window.location.href = "/login?expired=true";
    }
    return new Promise(() => {});
  },
);

export default api;
