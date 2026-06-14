import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import api from "../api/axios";
import Modal from "../components/Modal";
import Cropper from "react-easy-crop";
import { getCroppedImg } from "../utils/cropImage";
import { getImageUrl } from "../utils/helpers";
import {
  User,
  ShieldAlert,
  Upload,
  Loader2,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react";

const Settings = () => {
  const { user, fetchUser, logout } = useAuth();

  // --- TABS STATE ---
  const [activeTab, setActiveTab] = useState("profile"); // Easily add "preferences" or "billing" later

  // --- FORMS STATE ---
  const [username, setUsername] = useState(user?.username || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [saveStatus, setSaveStatus] = useState({
    loading: false,
    success: false,
    error: null,
  });

  // --- CROPPER STATE ---
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // --- DYNAMIC FORM VALIDATION ---
  useEffect(() => {
    const errors = {};
    if (!username.trim()) errors.username = "Username cannot be empty.";

    // Reverted back to just 'password'
    if (password) {
      if (password.length < 8)
        errors.password = "Must be at least 8 characters.";
      else if (!/[A-Z]/.test(password))
        errors.password = "Needs an uppercase letter.";
      else if (!/[a-z]/.test(password))
        errors.password = "Needs a lowercase letter.";
      else if (!/\d/.test(password)) errors.password = "Needs a number.";
      else if (!/[^A-Za-z0-9]/.test(password))
        errors.password = "Needs a special character.";

      if (password !== confirmPassword)
        errors.confirmPassword = "Passwords do not match.";
    }
    setFormErrors(errors);
  }, [username, password, confirmPassword]);

  // --- AVATAR UPLOAD LOGIC ---
  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        // 5MB Limit
        alert(
          "This image is too large. Please select a file smaller than 5MB.",
        );
        e.target.value = null;
        return;
      }
      const imageDataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(file);
      });
      setImageSrc(imageDataUrl);
      setIsCropModalOpen(true);
      e.target.value = null; // reset input
    }
  };

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleUploadAvatar = async () => {
    try {
      setIsUploading(true);
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);

      const formData = new FormData();
      formData.append("file", croppedBlob, "avatar.jpg");

      await api.post("/api/users/me/avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await fetchUser(); // Instantly update header & profile!
      setIsCropModalOpen(false);
    } catch (err) {
      console.error("Upload failed", err);
      alert(err.response?.data?.detail || "Failed to upload avatar.");
    } finally {
      setIsUploading(false);
    }
  };

  // --- SAVE PROFILE LOGIC ---
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (Object.keys(formErrors).length > 0) return;

    setSaveStatus({ loading: true, success: false, error: null });
    try {
      const payload = { username };
      if (password) payload.password = password; // Only send password if they typed one

      await api.patch("/api/users/me", payload);
      await fetchUser(); // Update header context

      setPassword("");
      setConfirmPassword("");
      setSaveStatus({ loading: false, success: true, error: null });
      setTimeout(() => setSaveStatus((s) => ({ ...s, success: false })), 3000); // Hide success message after 3s
    } catch (err) {
      setSaveStatus({
        loading: false,
        success: false,
        error: err.response?.data?.detail || "Failed to save profile.",
      });
    }
  };

  // --- DELETE ACCOUNT LOGIC ---
  const handleDeleteAccount = async () => {
    const isConfirmed = window.confirm(
      "DANGER: Are you absolutely sure you want to delete your account?\n\nThis will permanently delete your user profile and ALL your scraping history. This cannot be undone.",
    );

    if (isConfirmed) {
      try {
        await api.delete("/api/users/me");
        await logout(); // Blacklists token and clears storage
        window.location.href = "/login";
      } catch (err) {
        alert("Failed to delete account. Please try again.");
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Settings</h1>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[600px]">
        {/* --- HORIZONTAL TABS (Mobile Friendly) --- */}
        <div className="border-b border-gray-200 bg-gray-50/50">
          {/* overflow-x-auto allows tabs to scroll horizontally on small screens */}
          <nav
            className="flex overflow-x-auto px-4 md:px-6 no-scrollbar"
            aria-label="Tabs"
          >
            <button
              onClick={() => setActiveTab("profile")}
              className={`whitespace-nowrap py-4 px-2 border-b-2 font-medium text-sm flex items-center transition-colors ${
                activeTab === "profile"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <User className="w-5 h-5 mr-2" />
              Profile Settings
            </button>

            {/* Future tabs can easily be added right here! */}
            {/* 
            <button className="whitespace-nowrap py-4 px-2 ml-8 border-b-2 border-transparent font-medium text-sm flex items-center text-gray-500 hover:text-gray-700 transition-colors">
               <Bell className="w-5 h-5 mr-2" /> Preferences
            </button> 
            */}
          </nav>
        </div>

        {/* --- CONTENT AREA --- */}
        <div className="p-4 md:p-8">
          {activeTab === "profile" && (
            <div className="max-w-2xl space-y-10 animate-in fade-in duration-300">
              {/* SECTION 1: Avatar */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-100 pb-2 mb-4">
                  Profile Picture
                </h3>
                <div className="flex items-center space-x-6">
                  {user?.profile_picture ? (
                    <img
                      src={getImageUrl(user.profile_picture)}
                      alt="Avatar"
                      className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border border-gray-200 shadow-sm shrink-0"
                    />
                  ) : (
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200 shrink-0">
                      <User className="w-8 h-8 md:w-10 md:h-10 text-blue-500" />
                    </div>
                  )}
                  <div>
                    <input
                      type="file"
                      id="avatarUpload"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="avatarUpload"
                      className="cursor-pointer inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Upload className="w-4 h-4 mr-2 shrink-0" /> Change
                      Picture
                    </label>
                    <p className="text-xs text-gray-500 mt-2">
                      JPG, PNG or WebP. Max 5MB.
                    </p>
                  </div>
                </div>
              </section>

              {/* SECTION 2: User Info Form */}
              <section>
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-100 pb-2 mb-4">
                  Account Details
                </h3>

                {saveStatus.error && (
                  <div className="p-3 mb-4 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
                    {saveStatus.error}
                  </div>
                )}
                {saveStatus.success && (
                  <div className="p-3 mb-4 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200 flex items-center">
                    <CheckCircle className="w-4 h-4 mr-2" /> Profile updated
                    successfully!
                  </div>
                )}

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  {/* Username */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${formErrors.username ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"}`}
                    />
                    {formErrors.username && (
                      <p className="text-red-500 text-xs mt-1">
                        {formErrors.username}
                      </p>
                    )}
                  </div>

                  {/* Password Reset Area */}
                  <div className="pt-4 mt-4 border-t border-gray-50 space-y-4 bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                    <p className="text-sm text-gray-600 font-medium mb-2">
                      Change Password{" "}
                      <span className="font-normal text-gray-400">
                        (Leave blank to keep current)
                      </span>
                    </p>

                    <div>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="New Password"
                          value={password}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPassword(val);
                            if (!val) {
                              setConfirmPassword("");
                            }
                          }}
                          className={`w-full px-3 py-2 border rounded-lg pr-10 focus:ring-2 focus:outline-none transition-colors ${formErrors.password ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? (
                            <EyeOff className="w-5 h-5" />
                          ) : (
                            <Eye className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                      {formErrors.password && (
                        <p className="text-red-500 text-xs mt-1">
                          {formErrors.password}
                        </p>
                      )}
                    </div>

                    {password && (
                      <div className="animate-in fade-in slide-in-from-top-2">
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="Confirm New Password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${formErrors.confirmPassword ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"}`}
                        />
                        {formErrors.confirmPassword && (
                          <p className="text-red-500 text-xs mt-1">
                            {formErrors.confirmPassword}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={
                        Object.keys(formErrors).length > 0 || saveStatus.loading
                      }
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors font-medium flex items-center shadow-sm"
                    >
                      {saveStatus.loading && (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      )}
                      Save Changes
                    </button>
                  </div>
                </form>
              </section>

              {/* SECTION 3: Danger Zone */}
              <section className="pt-8">
                <div className="border border-red-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="bg-red-50 px-4 py-3 border-b border-red-200 flex items-center">
                    <ShieldAlert className="w-5 h-5 text-red-600 mr-2 shrink-0" />
                    <h3 className="text-red-800 font-semibold">Danger Zone</h3>
                  </div>
                  <div className="p-4 md:p-5 bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Delete Account
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Permanently delete your account and all history. This
                        action cannot be reversed.
                      </p>
                    </div>
                    <button
                      onClick={handleDeleteAccount}
                      className="w-full sm:w-auto px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium whitespace-nowrap shadow-sm"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      {/* --- CROPPER MODAL --- */}
      <Modal
        isOpen={isCropModalOpen}
        onClose={() => setIsCropModalOpen(false)}
        title="Crop Profile Picture"
      >
        <div className="relative w-full h-[300px] md:h-[400px] bg-gray-900 rounded-lg overflow-hidden">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
            />
          )}
        </div>
        <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="w-full sm:w-1/2 flex items-center space-x-2">
            <span className="text-sm text-gray-500">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(e.target.value)}
              className="w-full accent-blue-600"
            />
          </div>
          <div className="flex space-x-3 w-full sm:w-auto justify-end">
            <button
              onClick={() => setIsCropModalOpen(false)}
              className="w-full sm:w-auto px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium border border-gray-200 sm:border-transparent"
            >
              Cancel
            </button>
            <button
              onClick={handleUploadAvatar}
              disabled={isUploading}
              className="w-full sm:w-auto flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors text-sm font-medium shadow-sm"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}{" "}
              Save Picture
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Settings;
