import { useEffect, useState } from "react";
import api from "../api/axios";
import Modal from "../components/Modal";
import { FileText, Download, Eye, RefreshCw } from "lucide-react";

const History = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [selectedJob, setSelectedJob] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchHistory = async () => {
    try {
      const response = await api.get("/api/users/history");
      setJobs(response.data);
    } catch (err) {
      console.error("History fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const openDetails = (job) => {
    setSelectedJob(job);
    setIsModalOpen(true);
  };

  const handleDownload = async (jobId) => {
    try {
      const response = await api.get(`/api/scrape/download/${jobId}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `scrape_${jobId}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error("Download error:", err);

      let errorMessage = "Download failed. Please try again.";

      if (err.response && err.response.data instanceof Blob) {
        try {
          // Convert Blob to text, then to JSON
          const errorText = await err.response.data.text();
          const errorJson = JSON.parse(errorText);

          if (errorJson.detail) {
            errorMessage = errorJson.detail;
          }
        } catch (parseErr) {
          console.error("Could not parse error blob", parseErr);
        }
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      }

      // Display the actual FastAPI error message
      alert(errorMessage);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  if (loading)
    return <div className="p-8 text-center">Loading your history...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Scraping History</h1>
        <button
          onClick={fetchHistory}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          title="Refresh History"
        >
          <RefreshCw className="w-5 h-5 text-gray-500" />
        </button>
      </div>
      {/* Main History Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                File Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Ingredients
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(job.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {job.filename}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      job.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : job.status === "pending"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {job.results?.length || 0}
                </td>
                <td className="px-6 py-4 text-right space-x-3">
                  {job.status === "completed" && (
                    <>
                      <button
                        onClick={() => openDetails(job)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Eye className="w-5 h-5 inline" />
                      </button>
                      <button
                        onClick={() => handleDownload(job.id)}
                        className="text-green-600 hover:text-green-900"
                      >
                        <Download className="w-5 h-5 inline" />
                      </button>
                    </>
                  )}
                  {job.status === "failed" && job.error_message && (
                    <p
                      className="text-xs text-red-500 mt-1 max-w-xs truncate"
                      title={job.error_message}
                    >
                      {job.error_message}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No scraping jobs found yet.</p>
          </div>
        )}
      </div>

      {/* The Detail Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Results for ${selectedJob?.filename}`}
      >
        {selectedJob && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg sticky top-0 z-20">
              <span className="text-sm text-gray-600 font-medium">
                Found {selectedJob.results.length} items
              </span>
              <button
                onClick={() => handleDownload(selectedJob.id)}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4 mr-2" /> Download Excel
              </button>
            </div>

            {/* Table Container with fixed height for sticky header support */}
            <div className="border border-gray-200 rounded-lg overflow-x-auto overflow-y-auto max-h-[60vh]">
              <table className="min-w-full divide-y divide-gray-200">
                {/* STICKY HEADER */}
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    {selectedJob.results?.[0] &&
                      Object.keys(selectedJob.results[0]).map((key) => (
                        <th
                          key={key}
                          className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-b"
                        >
                          {key.replace("_", " ")}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {selectedJob.results?.map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      {Object.values(row).map((val, j) => (
                        <td
                          key={j}
                          className="px-6 py-4 text-sm text-gray-600 min-w-[200px] max-w-md border-b"
                        >
                          {/* THE MULTI-LINE & CLAMP FIX */}
                          <div className="whitespace-pre-line break-words line-clamp-4 hover:line-clamp-none transition-all duration-200 cursor-pointer">
                            {val || (
                              <span className="text-gray-300 italic">null</span>
                            )}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default History;
