import { useState, useEffect } from "react";
import { AuthContext } from "./AuthContext";
import api from "../api/axios";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper to fetch user data
  const fetchUser = async () => {
    try {
      const response = await api.get("/api/users/me");
      setUser(response.data);
    } catch (error) {
      console.error(error.response?.data?.detail || "");
      sessionStorage.removeItem("token");
      setUser(null);
    }
  };

  useEffect(() => {
    const token = sessionStorage.getItem("token");
    if (token) {
      fetchUser().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    try {
      // Send it to FastAPI
      const response = await api.post(
        "/api/users/login",
        {
          username: email,
          password: password,
        },
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );

      sessionStorage.setItem("token", response.data.access_token);
      await fetchUser();
      return { success: true };
    } catch (error) {
      return { success: false, error: error };
    }
  };

  const logout = async () => {
    try {
      // Call your backend /logout route to blacklist the token
      await api.post("/api/users/logout");
    } catch (err) {
      console.error(
        "Logout failed on server, cleaning up local storage anyway.",
        err.response?.data?.detail || "",
      );
    } finally {
      sessionStorage.removeItem("token");
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
