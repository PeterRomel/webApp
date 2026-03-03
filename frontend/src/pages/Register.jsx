import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";

const Register = () => {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // 1. Client-side Validation
    if (formData.password !== formData.confirmPassword) {
      return setError("Passwords do not match");
    }

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
        state: { message: "Account created! Please log in." },
      });
    } catch (err) {
      const msg =
        err.response?.data?.detail ||
        "Registration failed. Try a different username.";
      setError(msg);
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
          <input
            type="email"
            required
            className="w-full px-3 py-2 border rounded-md"
            placeholder="Email Address"
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
          />
          <input
            type="password"
            required
            className="w-full px-3 py-2 border rounded-md"
            placeholder="Password"
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
          />
          <input
            type="password"
            required
            className="w-full px-3 py-2 border rounded-md"
            placeholder="Confirm Password"
            onChange={(e) =>
              setFormData({ ...formData, confirmPassword: e.target.value })
            }
          />

          <button
            type="submit"
            disabled={isSubmitting}
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
