import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Register from "./pages/Register";

// A helper component to protect our private pages
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center">
        Loading...
      </div>
    );
  if (!user) return <Navigate to="/login" />;

  return children;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} /> {/* Add this line */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div className="p-8">
                <h1 className="text-2xl font-bold">Dashboard Home</h1>
                <p>Your scraping tools go here.</p>
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
