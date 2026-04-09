import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useNavigate, Link, useLocation } from "react-router-dom";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Track touched state for dynamic feedback
  const [touched, setTouched] = useState({
    email: false,
    password: false,
  });

  const [formErrors, setFormErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const location = useLocation();
  const [isExpired, setIsExpired] = useState(
    new URLSearchParams(location.search).get("expired"),
  );
  const [isRegisterMessage, setIsRegisterMessage] = useState(
    location.state?.message,
  );

  const { login } = useAuth();
  const navigate = useNavigate();

  // --- DYNAMIC REAL-TIME VALIDATION (LOGIN SPECIFIC) ---
  // Notice we DO NOT check password strength here. Only that they typed something.
  useEffect(() => {
    const errors = {};

    if (!email.trim()) {
      errors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Please enter a valid email.";
    }

    if (!password) {
      errors.password = "Password is required.";
    }

    setFormErrors(errors);
  }, [email, password]);

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");
    setIsExpired(false);
    setIsRegisterMessage("");

    // Mark fields touched on submit attempt
    setTouched({ email: true, password: true });

    // Stop if frontend validation fails
    if (Object.keys(formErrors).length > 0) return;

    setIsSubmitting(true);

    const result = await login(email, password);

    if (result.success) {
      navigate("/"); // Send user to the Dashboard
    } else {
      if (result.error?.response?.status === 422) {
        // Fallback for Pydantic Validation Errors
        const validationErrors = result.error.response.data.detail;
        const backendErrors = {};
        validationErrors.forEach((error) => {
          const field = error.loc[1]; // "password" or "username" (FastAPI sees email as username)
          backendErrors[field === "username" ? "email" : field] = error.msg;
        });
        setFormErrors((prev) => ({ ...prev, ...backendErrors }));
      } else {
        // Service Errors (e.g., "Email doesn't exist" or "Wrong Password")
        setServerError(
          result.error.response?.data?.detail ||
            "Network Error: Cannot connect to server.",
        );
      }
      setIsSubmitting(false);
    }
  };

  const getInputBorder = (fieldName) => {
    if (touched[fieldName] && formErrors[fieldName])
      return "border-red-500 focus:ring-red-500 z-10";
    return "border-gray-300 focus:ring-blue-500 z-10";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg border border-gray-100">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isRegisterMessage ? "Welcome!" : "Sign in to Cosing Scraper"}
          </h2>
        </div>

        {/* Dynamic Alert Messages */}
        {isRegisterMessage && !serverError && (
          <div className="bg-green-50 border border-green-200 p-4 rounded-md text-green-800 text-sm font-medium text-center">
            {isRegisterMessage}
          </div>
        )}

        {serverError && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 text-red-700 text-sm">
            {serverError}
          </div>
        )}

        {isExpired && !serverError && !isRegisterMessage && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-sm">
            Your session has expired. Please log in again to continue.
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
          <div className="shadow-sm -space-y-px rounded-md">
            {/* EMAIL */}
            <div className="relative">
              <input
                type="email"
                name="email"
                className={`appearance-none rounded-none relative block w-full px-3 py-2 border placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-1 sm:text-sm transition-colors ${getInputBorder("email")}`}
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => handleBlur("email")}
              />
              {touched.email && formErrors.email && (
                <div className="absolute right-0 top-0 mt-2 mr-3 text-red-500 text-xs font-medium bg-white px-1">
                  {formErrors.email}
                </div>
              )}
            </div>

            {/* PASSWORD */}
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                className={`appearance-none rounded-none relative block w-full px-3 py-2 border placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-1 sm:text-sm pr-10 transition-colors ${getInputBorder("password")}`}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => handleBlur("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none z-20"
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
            {/* Because the inputs are stacked (-space-y-px), we place the password error text below the group */}
          </div>

          <div className="h-4">
            {touched.password && formErrors.password && (
              <div className="text-red-500 text-xs font-medium animate-in fade-in slide-in-from-top-1">
                {formErrors.password}
              </div>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting || Object.keys(formErrors).length > 0}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white transition-colors duration-200 ${
                isSubmitting || Object.keys(formErrors).length > 0
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        <p className="text-center text-sm text-gray-600">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="text-blue-600 hover:underline font-medium"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
