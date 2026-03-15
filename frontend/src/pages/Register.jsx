import { useState } from "react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [formErrors, setFormErrors] = useState({});
  //const [passwordMatch, setPasswordMatch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const isPasswordMismatch =
    formData.confirmPassword.length > 0 &&
    formData.password !== formData.confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setFormErrors({});
    //setPasswordMatch("");

    // 1. Client-side Validation
    /* if (formData.password !== formData.confirmPassword) {
      return setPasswordMatch("Passwords do not match");
    } */

    setIsSubmitting(true);

    try {
      // 2. Call your FastAPI /api/users/register route
      // Note: We send JSON here as per your backend configuration
      await api.post("/api/users/register", {
        username: formData.username,
        email: formData.email,
        password: formData.password,
      });

      // 3. Success! Redirect to login
      navigate("/login", {
        state: { message: "Account created" },
      });
    } catch (err) {
      if (err.response?.status === 422) {
        // These are Pydantic Validation Errors
        const validationErrors = err.response.data.detail;
        validationErrors.forEach((error) => {
          const field = error.loc[1]; // "password" or "email"
          const message = error.msg;
          setFormErrors((prev) => ({ ...prev, [field]: message }));
        });
      } else {
        // These are your Service Errors (e.g., "Email already exists")
        setError(err.response?.data?.detail || "Registration failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg border border-gray-100">
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Create Account
        </h2>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded border border-red-200 text-sm">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <input
            type="text"
            required
            className="w-full px-3 py-2 border rounded-md"
            placeholder="Username"
            onChange={(e) =>
              setFormData({ ...formData, username: e.target.value })
            }
          />
          {formErrors.username && (
            <div className="text-red-500 text-xs mt-1 ml-1 font-medium animate-pulse">
              {formErrors.username}
            </div>
          )}
          <input
            type="text"
            required
            className="w-full px-3 py-2 border rounded-md"
            placeholder="Email Address"
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
          />
          {formErrors.email && (
            <div className="text-red-500 text-xs mt-1 ml-1 font-medium animate-pulse">
              {formErrors.email}
            </div>
          )}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              className="w-full px-3 py-2 border rounded-md pr-10" // added padding-right
              placeholder="Password"
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {formErrors.password && (
            <div className="text-red-500 text-xs mt-1 ml-1 font-medium animate-pulse">
              {formErrors.password}
            </div>
          )}
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              required
              className="w-full px-3 py-2 border rounded-md pr-10"
              placeholder="Confirm Password"
              onChange={(e) =>
                setFormData({ ...formData, confirmPassword: e.target.value })
              }
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          {isPasswordMismatch && (
            <div className="text-red-500 text-xs mt-1 ml-1 font-medium animate-pulse">
              Passwords do not match
            </div>
          )}

          <button
            type="submit"
            disabled={isPasswordMismatch || isSubmitting}
            className="w-full bg-green-600 text-white py-2 rounded-md hover:bg-green-700 disabled:bg-green-300"
          >
            {isSubmitting ? "Creating Account..." : "Register"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
