import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useNavigate, Link, useLocation } from "react-router-dom";

const Login = () => {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const location = useLocation();
  const [isExpired, setIsExpired] = useState(
    new URLSearchParams(location.search).get("expired"),
  );
  const [isRegister, setIsRegister] = useState(location.state?.message);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setFormErrors({});
    setIsExpired(false);
    setIsRegister("");
    setIsSubmitting(true);

    const result = await login(user, password);

    if (result.success) {
      navigate("/"); // Send user to the Dashboard
    } else {
      if (result.error.response?.status === 422) {
        // These are Pydantic Validation Errors
        const validationErrors = result.error.response.data.detail;
        validationErrors.forEach((error) => {
          const field = error.loc[1]; // "password" or "email"
          const message = error.msg;
          setFormErrors((prev) => ({ ...prev, [field]: message }));
        });
        setIsSubmitting(false);
      } else {
        // These are your Service Errors (e.g., "Email doesn't exist")
        setError(result.error.response?.data?.detail);
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isRegister ? isRegister : "Sign in to Cosing Scraper"}
          </h2>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {isExpired && !error && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm">
            Your session has expired. Please log in again to continue.
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <input
                type="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Email Address"
                value={user}
                onChange={(e) => setUser(e.target.value)}
              />
              {formErrors.email && (
                <div className="text-red-500 text-xs mt-1 ml-1 font-medium animate-pulse">
                  {formErrors.email}
                </div>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm pr-10"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 z-20"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
            {formErrors.password && (
              <div className="text-red-500 text-xs mt-1 ml-1 font-medium animate-pulse">
                {formErrors.password}
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white ${
                isSubmitting ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors`}
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        <p className="text-center text-sm text-gray-600">
          Don't have an account?{" "}
          <Link to="/register" className="text-blue-600 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
