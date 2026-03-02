import { useState, useEffect } from 'react';
import { AuthContext } from './AuthContext';
import api from '../api/axios';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper to fetch user data
  const fetchUser = async () => {
    try {
      const response = await api.get('/api/users/me');
      setUser(response.data);
    } catch (error) {
      localStorage.removeItem('token');
      setUser(null);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

    const login = async (username, password) => {
    try {
      // Sending a plain JavaScript object automatically tells 
      // Axios to send it as JSON (application/json)
      const response = await api.post('/api/users/login', {
        username: username,
        email: "",
        password: password
      });
      
      localStorage.setItem('token', response.data.access_token);
      await fetchUser(); 
      return { success: true };
    } catch (error) {
      const message = error.response?.data?.detail || "Login failed.";
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      // Optional: Call your backend /logout route to blacklist the token
      await api.post('/api/users/logout');
    } catch (err) {
      console.error("Logout failed on server, cleaning up local storage anyway.");
    } finally {
      localStorage.removeItem('token');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children} 
      {/* Logic: Don't render the app until we know if the user is logged in */}
    </AuthContext.Provider>
  );
};
