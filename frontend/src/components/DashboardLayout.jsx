import { useAuth } from "../hooks/useAuth";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, History, LogOut, User, Menu } from "lucide-react";
import { useState } from "react";

const DashboardLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setSidebarOpen] = useState(true);

  const navigation = [
    { name: "Scraper", href: "/", icon: LayoutDashboard },
    { name: "History", href: "/history", icon: History },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    // 1. h-screen forces exact window height, overflow-hidden stops global scrolling
    <div className="h-screen w-screen bg-gray-100 flex overflow-hidden">
      {/* Sidebar - Added shrink-0 so it maintains its width */}
      <aside
        className={`${
          isSidebarOpen ? "w-64" : "w-20"
        } bg-slate-900 text-white transition-all duration-300 flex flex-col shrink-0 z-20`}
      >
        <div className="p-6 text-xl font-bold border-b border-slate-800 shrink-0">
          {isSidebarOpen ? "CoSing Scraper" : "CS"}
        </div>

        <nav className="flex-1 mt-6 px-4 space-y-2 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center p-3 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {isSidebarOpen && (
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
            {isSidebarOpen && (
              <span className="ml-3 font-medium whitespace-nowrap">Logout</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area Wrapper */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header - Added shrink-0 to prevent squishing, z-10 for shadow */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-8 shrink-0 z-10 relative">
          <button
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="text-gray-500 hover:text-gray-700"
          >
            <Menu className="w-6 h-6" />
          </button>

          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">
                {user?.username}
              </p>
              <p className="text-xs text-gray-500">{user?.email}</p>
            </div>
            <div className="bg-blue-100 p-2 rounded-full text-blue-600">
              <User className="w-5 h-5" />
            </div>
          </div>
        </header>

        {/* 2. Scrollable Content Area - flex-1 takes remaining height, overflow-y-auto traps the scrolling here */}
        <main className="flex-1 p-8 overflow-y-auto bg-gray-100 relative">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
