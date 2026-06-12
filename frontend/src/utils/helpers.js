export const getImageUrl = (path) => {
  if (!path) return null;
  // Automatically points to FastAPI port 8000 in dev, and relative path in production
  return import.meta.env.DEV ? `http://127.0.0.1:8000${path}` : path;
};
