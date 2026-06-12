import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { Link } from "react-router-dom";
import { User, Calendar, FileText, Edit, Loader2 } from "lucide-react";
import api from "../api/axios";
import { getImageUrl } from "../utils/helpers";

const Profile = () => {
  const { user } = useAuth();
  const [totalJobs, setTotalJobs] = useState(0);
  const [loadingStats, setLoadingStats] = useState(true);

  // Format the ISO date from the backend into a readable string
  const formattedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Recently";

  // Fetch their scraping stats using your existing history endpoint
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // We only ask for 1 item (limit=1) because we only care about the pagination data!
        const response = await api.get("/api/users/history?page=1&limit=1");
        setTotalJobs(response.data.pagination.total_jobs);
      } catch (err) {
        console.error("Failed to fetch stats");
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, []);

  if (!user) return null; // Safety check

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-end mb-8">
        <h1 className="text-2xl font-bold text-gray-800">My Profile</h1>
        <Link
          to="/settings"
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
        >
          <Edit className="w-4 h-4 mr-2" />
          Edit Profile
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Top Banner (Just for a nice UI touch) */}
        <div className="h-32 bg-gradient-to-r from-blue-500 to-indigo-600"></div>

        <div className="px-8 pb-8">
          {/* Avatar floating over the banner */}
          <div className="relative flex justify-between items-start -mt-16 mb-6">
            <div className="p-1 bg-white rounded-full">
              {user.profile_picture ? (
                <img
                  src={getImageUrl(user.profile_picture)}
                  alt="Profile"
                  className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-md bg-white"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-blue-100 flex items-center justify-center border-4 border-white shadow-md">
                  <User className="w-16 h-16 text-blue-500" />
                </div>
              )}
            </div>
          </div>

          {/* User Info */}
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">
                {user.username}
              </h2>
              <p className="text-gray-500 text-lg">{user.email}</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-gray-100">
              <div className="flex items-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg mr-4">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">
                    Member Since
                  </p>
                  <p className="text-lg font-semibold text-gray-800">
                    {formattedDate}
                  </p>
                </div>
              </div>

              <div className="flex items-center p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="p-3 bg-green-100 text-green-600 rounded-lg mr-4">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">
                    Total Scraping Jobs
                  </p>
                  {loadingStats ? (
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400 mt-1" />
                  ) : (
                    <p className="text-lg font-semibold text-gray-800">
                      {totalJobs} Jobs
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
