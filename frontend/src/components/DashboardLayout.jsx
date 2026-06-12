import { useAuth } from "../hooks/useAuth";
import { getImageUrl } from "../utils/helpers";
import { useNavigate, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  History,
  LogOut,
  User,
  Menu,
  X,
  ChevronDown,
  Settings,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";

const DashboardLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Desktop Sidebar State (Shrinks to icons)
  const [isDesktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  // Mobile Sidebar State (Slides in from the left)
  const [isMobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown if user clicks outside of it
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const navigation = [
    { name: "Scraper", href: "/", icon: LayoutDashboard },
    { name: "History", href: "/history", icon: History },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="h-screen w-screen bg-gray-100 flex overflow-hidden relative">
      {/* --- MOBILE OVERLAY BACKDROP --- */}
      {/* This darkens the background on phones when the menu is open */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden transition-opacity"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* --- SIDEBAR --- */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex flex-col bg-slate-900 text-white shadow-xl
          transform transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:shrink-0
          ${isMobileSidebarOpen ? "translate-x-0 w-64" : "-translate-x-full"}
          ${isDesktopSidebarOpen ? "md:w-64" : "md:w-20"}
        `}
      >
        <div className="p-4 md:p-6 text-xl font-bold border-b border-slate-800 shrink-0 flex justify-between items-center">
          <span>
            {isDesktopSidebarOpen && !isMobileSidebarOpen
              ? "CoSing Scraper"
              : "CS"}
          </span>

          {/* Mobile Close Button */}
          <button
            className="md:hidden p-1 text-slate-400 hover:text-white"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 mt-6 px-4 space-y-2 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setMobileSidebarOpen(false)} // Auto-close on mobile click
                className={`flex items-center p-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {/* Show text if desktop sidebar is open OR if we are on mobile */}
                {(isDesktopSidebarOpen || isMobileSidebarOpen) && (
                  <span className="ml-3 font-medium whitespace-nowrap">
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center w-full p-3 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {(isDesktopSidebarOpen || isMobileSidebarOpen) && (
              <span className="ml-3 font-medium whitespace-nowrap">Logout</span>
            )}
          </button>
        </div>
      </aside>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-4 md:px-8 shrink-0 z-10 relative">
          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="text-gray-500 hover:text-gray-700 md:hidden p-2 -ml-2"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* Desktop Hamburger Button */}
          <button
            onClick={() => setDesktopSidebarOpen(!isDesktopSidebarOpen)}
            className="text-gray-500 hover:text-gray-700 hidden md:block"
          >
            <Menu className="w-6 h-6" />
          </button>

          {/* USER DROPDOWN MENU */}
          <div className="relative ml-auto" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-3 md:space-x-4 hover:bg-gray-50 p-2 rounded-lg transition-colors focus:outline-none"
            >
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-900">
                  {user?.username}
                </p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>

              {/* Show Avatar if it exists, otherwise show default User icon */}
              {user?.profile_picture ? (
                <img
                  src={getImageUrl(user.profile_picture)}
                  alt="Profile"
                  className="w-10 h-10 rounded-full object-cover border border-gray-200 shadow-sm"
                />
              ) : (
                <div className="bg-blue-100 p-2.5 rounded-full text-blue-600 shrink-0">
                  <User className="w-5 h-5" />
                </div>
              )}

              <ChevronDown
                className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`}
              />
            </button>

            {/* Dropdown Panel */}
            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="px-4 py-2 border-b border-gray-50 sm:hidden">
                  {/* Mobile only: show name/email inside dropdown since it's hidden in the header */}
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {user?.username}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user?.email}
                  </p>
                </div>

                <Link
                  to="/profile"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                >
                  <User className="w-4 h-4 mr-3 text-gray-400" /> My Profile
                </Link>

                <Link
                  to="/history"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-colors"
                >
                  <History className="w-4 h-4 mr-3 text-gray-400" /> History
                </Link>

                <div className="h-px bg-gray-100 my-1 mx-2"></div>

                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    handleLogout();
                  }}
                  className="flex items-center w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4 mr-3 text-red-400" /> Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Content Box - Adjusted padding for mobile */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto bg-gray-50 relative">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
