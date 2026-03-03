import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import Login from "./pages/Login";
import Register from "./pages/Register";
import DashboardLayout from "./components/DashboardLayout";

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
        <Route path="/register" element={<Register />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                {/* This is where the Scraper tool will go */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <h2 className="text-xl font-bold mb-4">Start New Scrape</h2>
                  <p className="text-gray-600">
                    Ready to extract ingredient data? Upload your Excel file
                    below.
                  </p>
                  {/* We will build the File Upload component next */}
                </div>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />

        {/* Example: A History Page */}
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <h2 className="text-xl font-bold">Scraping History</h2>
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
