import { useState, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";

const Register = () => {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  // Tracks if the user has clicked inside and then clicked out of a field
  const [touched, setTouched] = useState({
    username: false,
    email: false,
    password: false,
    confirmPassword: false,
  });

  const [formErrors, setFormErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();

  // --- DYNAMIC REAL-TIME VALIDATION ---
  // This useEffect runs every time formData changes.
  useEffect(() => {
    const errors = {};

    // 1. Username
    if (!formData.username.trim()) {
      errors.username = "Username cannot be empty.";
    }

    // 2. Email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email) {
      errors.email = "Email is required.";
    } else if (!emailRegex.test(formData.email)) {
      errors.email = "Please enter a valid email address.";
    }

    // 3. Password Strength (Mirrors Backend)
    const p = formData.password;
    if (!p) {
      errors.password = "Password is required.";
    } else if (p.length < 8) {
      errors.password = "Must be at least 8 characters long.";
    } else if (!/[A-Z]/.test(p)) {
      errors.password = "Must contain at least one uppercase letter.";
    } else if (!/[a-z]/.test(p)) {
      errors.password = "Must contain at least one lowercase letter.";
    } else if (!/\d/.test(p)) {
      errors.password = "Must contain at least one digit.";
    } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(p)) {
      errors.password = "Must contain a special character.";
    }

    // 4. Confirm Password Match
    if (
      formData.confirmPassword &&
      formData.password !== formData.confirmPassword
    ) {
      errors.confirmPassword = "Passwords do not match.";
    }

    setFormErrors(errors);
  }, [formData]);

  // Handlers for input changes and blurs
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");

    // Mark ALL fields as touched when they try to submit
    setTouched({
      username: true,
      email: true,
      password: true,
      confirmPassword: true,
    });

    // If there are any errors in the state, stop the submission
    if (Object.keys(formErrors).length > 0) return;

    setIsSubmitting(true);

    try {
      await api.post("/api/users/register", {
        username: formData.username,
        email: formData.email,
        password: formData.password,
      });

      navigate("/login", {
        state: { message: "Account successfully created! Please log in." },
      });
    } catch (err) {
      if (err.response?.status === 422) {
        // Fallback: If backend Pydantic catches something frontend missed
        const validationErrors = err.response.data.detail;
        const backendErrors = {};
        validationErrors.forEach((error) => {
          const field = error.loc[1];
          backendErrors[field] = error.msg;
        });
        setFormErrors((prev) => ({ ...prev, ...backendErrors }));
      } else {
        setServerError(err.response?.data?.detail || "Registration failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to determine input border color dynamically
  const getInputBorder = (fieldName) => {
    if (touched[fieldName] && formErrors[fieldName])
      return "border-red-500 focus:border-red-500 focus:ring-red-500";
    if (touched[fieldName] && !formErrors[fieldName])
      return "border-green-500 focus:border-green-500 focus:ring-green-500";
    return "border-gray-300 focus:border-blue-500 focus:ring-blue-500";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg border border-gray-100">
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Create Account
        </h2>

        {serverError && (
          <div className="bg-red-50 text-red-700 p-3 rounded border border-red-200 text-sm">
            {serverError}
          </div>
        )}

        <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
          {/* USERNAME */}
          <div>
            <input
              type="text"
              name="username"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-1 transition-colors ${getInputBorder("username")}`}
              placeholder="Username"
              value={formData.username}
              onChange={handleChange}
              onBlur={handleBlur}
            />
            {touched.username && formErrors.username && (
              <div className="text-red-500 text-xs mt-1 ml-1 font-medium animate-in fade-in slide-in-from-top-1">
                {formErrors.username}
              </div>
            )}
          </div>

          {/* EMAIL */}
          <div>
            <input
              type="email"
              name="email"
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-1 transition-colors ${getInputBorder("email")}`}
              placeholder="Email Address"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
            />
            {touched.email && formErrors.email && (
              <div className="text-red-500 text-xs mt-1 ml-1 font-medium animate-in fade-in slide-in-from-top-1">
                {formErrors.email}
              </div>
            )}
          </div>

          {/* PASSWORD */}
          <div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                className={`w-full px-3 py-2 border rounded-md pr-10 focus:outline-none focus:ring-1 transition-colors ${getInputBorder("password")}`}
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {touched.password && formErrors.password && (
              <div className="text-red-500 text-xs mt-1 ml-1 font-medium animate-in fade-in slide-in-from-top-1">
                {formErrors.password}
              </div>
            )}
          </div>

          {/* CONFIRM PASSWORD */}
          <div>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                className={`w-full px-3 py-2 border rounded-md pr-10 focus:outline-none focus:ring-1 transition-colors ${getInputBorder("confirmPassword")}`}
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={handleChange}
                onBlur={handleBlur}
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {touched.confirmPassword && formErrors.confirmPassword && (
              <div className="text-red-500 text-xs mt-1 ml-1 font-medium animate-in fade-in slide-in-from-top-1">
                {formErrors.confirmPassword}
              </div>
            )}
          </div>

          {/* SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={isSubmitting || Object.keys(formErrors).length > 0}
            className={`w-full py-2 rounded-md font-medium text-white transition-colors duration-200 ${
              isSubmitting || Object.keys(formErrors).length > 0
                ? "bg-green-300 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {isSubmitting ? "Creating Account..." : "Register"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-blue-600 hover:underline font-medium"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
