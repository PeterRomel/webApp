import { useEffect, useState } from "react";
import api from "../api/axios";
import Modal from "../components/Modal";
import { ITEMS_PER_PAGE } from "../config/constants";
import {
  FileText,
  Download,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
  XCircle,
  Sparkles,
  Send,
  LayoutDashboard,
} from "lucide-react";

// --- MINI COMPONENT: Touch-Friendly Expandable Cell ---
const ExpandableCell = ({ content }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!content) return <span className="text-gray-300 italic">null</span>;

  return (
    <div
      onClick={() => setIsExpanded(!isExpanded)}
      className={`whitespace-pre-line break-words cursor-pointer transition-all duration-200 ${
        isExpanded ? "" : "line-clamp-4"
      }`}
      title={isExpanded ? "Click to collapse" : "Click to expand"}
    >
      {content}
    </div>
  );
};

// --- MAIN PAGE COMPONENT ---
const History = () => {
  // Main History State
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  // History Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modal State
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedJobFilename, setSelectedJobFilename] = useState("");
  const [modalData, setModalData] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalLoading, setIsModalLoading] = useState(false);

  // Modal Pagination State
  const [modalPage, setModalPage] = useState(1);

  // --- FETCH HISTORY ---
  const fetchHistory = async (page = 1) => {
    setLoading(true);
    try {
      const response = await api.get(
        `/api/users/history?page=${page}&limit=${ITEMS_PER_PAGE}`,
      );
      setJobs(response.data.data);
      setCurrentPage(response.data.pagination.current_page);
      setTotalPages(response.data.pagination.total_pages);
    } catch (err) {
      console.error("History fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(currentPage);
  }, [currentPage]);

  // --- OPEN MODAL & FETCH FULL DATA ---
  const openDetails = async (job) => {
    setIsModalOpen(true);
    setIsModalLoading(true);
    setSelectedJobId(job.id);
    setSelectedJobFilename(job.filename);
    setModalPage(1); // Reset modal to page 1

    try {
      // Fetch the FULL job data from the status endpoint to get the results
      const response = await api.get(`/api/scrape/status/${job.id}`);
      setModalData(response.data.data || []);
    } catch (err) {
      console.error("Failed to load full job details", err);
      alert("Could not load job details.");
      setIsModalOpen(false);
    } finally {
      setIsModalLoading(false);
    }
  };

  // --- DOWNLOAD DATA ---
  const handleDownload = async (jobId, filename) => {
    try {
      const response = await api.get(`/api/scrape/download/${jobId}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `results_${filename}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
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

  // --- DELETE JOB ---
  const handleDeleteJob = async (jobId, filename) => {
    // BEST PRACTICE: Always confirm destructive actions!
    const confirmed = window.confirm(
      `Are you sure you want to delete the job for "${filename}"?\nThis cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      // 1. Send the delete request to FastAPI
      await api.delete(`/api/scrape/${jobId}`);

      // 2. Handle Pagination Math gracefully
      if (jobs.length === 1 && currentPage > 1) {
        // If they just deleted the LAST item on the current page, go back one page
        setCurrentPage((prev) => prev - 1);
      } else {
        // Otherwise, simply refresh the current page to pull the updated list
        fetchHistory(currentPage);
      }
    } catch (err) {
      console.error("Delete error:", err);
      alert(
        err.response?.data?.detail ||
          "Failed to delete the job. Please try again.",
      );
    }
  };

  // --- CANCEL JOB ---
  const handleCancelJob = async (jobId, filename) => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel the job for "${filename}"?`,
    );
    if (!confirmed) return;

    try {
      await api.post(`/api/scrape/${jobId}/cancel`);
      fetchHistory(currentPage); // Refresh to show the "cancelled" status
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to cancel the job.");
    }
  };

  // --- FORWARD JOB ---
  const handleForwardJob = async (jobId, filename) => {
    const confirmed = window.confirm(
      `Send the results of "${filename}" to the Cosing Scraper?`,
    );
    if (!confirmed) return;

    try {
      await api.post(`/api/scrape/${jobId}/forward-to-scraper`);
      alert("Success! A new Cosing Scraper job has been started.");
      fetchHistory(currentPage); // Refresh to show the newly created scraper job!
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to forward data to scraper.");
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-xl md:text-2xl font-bold text-gray-800">
          Scraping History
        </h1>
        <button
          onClick={() => fetchHistory(currentPage)}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors flex items-center text-sm text-gray-600"
        >
          <RefreshCw className="w-4 h-4 mr-2 text-gray-500" /> Refresh
        </button>
      </div>

      {/* MAIN HISTORY TABLE */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            Loading your history...
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No scraping jobs found yet.</p>
          </div>
        ) : (
          <>
            {/* 1. WRAPPER: Creates a scrolling box strictly for the table. 
                 The calc() ensures it perfectly fits between the header and pagination. */}
            <div className="overflow-y-auto overflow-x-auto w-full max-h-[calc(100vh-200px)]">
              <table className="min-w-full divide-y divide-gray-200">
                {/* 2. THEAD: Added 'sticky top-0 z-10'. 
                     Added 'outline' so the bottom border travels with the header. */}
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm outline outline-1 outline-gray-200">
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
                      Results
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {jobs.map((job) => (
                    <tr
                      key={job.id}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(job.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <div className="flex items-center">
                          {job.job_type === "inci" ? (
                            <Sparkles
                              className="w-4 h-4 text-purple-500 mr-2 shrink-0"
                              title="AI INCI Generator"
                            />
                          ) : (
                            <LayoutDashboard
                              className="w-4 h-4 text-blue-500 mr-2 shrink-0"
                              title="Cosing Scraper"
                            />
                          )}
                          <span
                            className="truncate max-w-[200px]"
                            title={job.filename}
                          >
                            {job.filename}
                          </span>
                        </div>
                      </td>

                      {/* 1. STATUS COLUMN */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1.5">
                          <span
                            className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                              job.status === "completed"
                                ? "bg-green-100 text-green-800"
                                : job.status === "pending"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : job.status === "failed"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {job.status.toUpperCase()}
                          </span>
                          {(job.status === "failed" ||
                            job.status === "cancelled") &&
                            job.error_message && (
                              <span
                                className="text-xs text-red-500 max-w-[200px] truncate"
                                title={job.error_message}
                              >
                                {job.error_message}
                              </span>
                            )}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {job.result_count} items
                      </td>

                      {/* 2. ACTIONS COLUMN */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end space-x-3 min-h-[24px]">
                          {job.status === "completed" &&
                            job.result_count > 0 && (
                              <>
                                <button
                                  onClick={() => openDetails(job)}
                                  className="text-blue-600 hover:text-blue-900 p-1 rounded transition-colors hover:bg-blue-50"
                                  title="View Data"
                                >
                                  <Eye className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() =>
                                    handleDownload(job.id, job.filename)
                                  }
                                  className="text-green-600 hover:text-green-900 p-1 rounded transition-colors hover:bg-green-50"
                                  title="Download Excel"
                                >
                                  <Download className="w-5 h-5" />
                                </button>
                                {job.job_type === "inci" && (
                                  <button
                                    onClick={() =>
                                      handleForwardJob(job.id, job.filename)
                                    }
                                    className="text-purple-600 hover:text-purple-900 p-1 rounded transition-colors hover:bg-purple-50"
                                    title="Forward to Scraper"
                                  >
                                    <Send className="w-5 h-5" />
                                  </button>
                                )}
                              </>
                            )}

                          {job.status === "completed" &&
                            job.result_count === 0 && (
                              <span className="text-xs italic text-gray-400 mr-2">
                                Empty
                              </span>
                            )}

                          {job.status === "pending" && (
                            <Loader2 className="w-4 h-4 text-gray-300 animate-spin mr-2" />
                          )}

                          <div className="w-px h-5 bg-gray-200 mx-1"></div>

                          {job.status === "pending" ? (
                            <button
                              onClick={() =>
                                handleCancelJob(job.id, job.filename)
                              }
                              className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors hover:bg-red-50"
                              title="Cancel Job"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                handleDeleteJob(job.id, job.filename)
                              }
                              className="text-gray-400 hover:text-red-600 p-1 rounded transition-colors hover:bg-red-50"
                              title="Delete Job"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>{" "}
            {/* 3. END OF NEW SCROLLABLE WRAPPER */}
            {/* HISTORY PAGINATION CONTROLS */}
            {/* Added 'relative z-20' so the shadow of the table doesn't overlap the buttons */}
            <div className="bg-gray-50 px-4 md:px-6 py-3 border-t border-gray-200 flex flex-wrap gap-2 items-center justify-between relative z-20">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {/* --- THE MODAL --- */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Results for ${selectedJobFilename}`}
      >
        {isModalLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
            <p className="text-gray-500">Loading heavy data from server...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-lg sticky top-0 z-20">
              <span className="text-sm text-gray-600 font-medium">
                Found {modalData.length} items
              </span>
              <button
                onClick={() =>
                  handleDownload(selectedJobId, selectedJobFilename)
                }
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
              >
                <Download className="w-4 h-4 mr-2" /> Download Excel
              </button>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-x-auto overflow-y-auto max-h-[50vh]">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    {modalData[0] &&
                      Object.keys(modalData[0]).map((key) => (
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
                  {/* SLICE THE DATA FOR MODAL PAGINATION */}
                  {modalData
                    .slice(
                      (modalPage - 1) * ITEMS_PER_PAGE,
                      modalPage * ITEMS_PER_PAGE,
                    )
                    .map((row, i) => (
                      <tr
                        key={i}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        {Object.values(row).map((val, j) => (
                          <td
                            key={j}
                            className="px-6 py-4 text-sm text-gray-600 min-w-[200px] max-w-md border-b"
                          >
                            {/* Use our new touch-friendly component! */}
                            <ExpandableCell content={val} />
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* MODAL PAGINATION CONTROLS */}
            {modalData.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <button
                  onClick={() => setModalPage((p) => Math.max(1, p - 1))}
                  disabled={modalPage === 1}
                  className="flex items-center px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-md disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                </button>
                <span className="text-sm text-gray-500">
                  Page {modalPage} of{" "}
                  {Math.ceil(modalData.length / ITEMS_PER_PAGE)}
                </span>
                <button
                  onClick={() =>
                    setModalPage((p) =>
                      Math.min(
                        Math.ceil(modalData.length / ITEMS_PER_PAGE),
                        p + 1,
                      ),
                    )
                  }
                  disabled={
                    modalPage === Math.ceil(modalData.length / ITEMS_PER_PAGE)
                  }
                  className="flex items-center px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded-md disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default History;
