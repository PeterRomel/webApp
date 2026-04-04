import { useEffect, useState } from "react";
import api from "../api/axios";
import Modal from "../components/Modal";
import {
  FileText,
  Download,
  Eye,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
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
  const MODAL_ITEMS_PER_PAGE = 20;

  // --- FETCH HISTORY ---
  const fetchHistory = async (page = 1) => {
    setLoading(true);
    try {
      const response = await api.get(
        `/api/users/history?page=${page}&limit=20`,
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

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Scraping History</h1>
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
                    Results
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
                            : job.status === "pending" ||
                                job.status === "processing"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {job.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {job.result_count} items
                    </td>
                    <td className="px-6 py-4 text-right space-x-3">
                      {job.status === "completed" && (
                        <>
                          <button
                            onClick={() => openDetails(job)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Data"
                          >
                            <Eye className="w-5 h-5 inline" />
                          </button>
                          <button
                            onClick={() => handleDownload(job.id, job.filename)}
                            className="text-green-600 hover:text-green-900"
                            title="Download Excel"
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

            {/* HISTORY PAGINATION CONTROLS */}
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200 flex items-center justify-between">
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
                      (modalPage - 1) * MODAL_ITEMS_PER_PAGE,
                      modalPage * MODAL_ITEMS_PER_PAGE,
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
            {modalData.length > MODAL_ITEMS_PER_PAGE && (
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
                  {Math.ceil(modalData.length / MODAL_ITEMS_PER_PAGE)}
                </span>
                <button
                  onClick={() =>
                    setModalPage((p) =>
                      Math.min(
                        Math.ceil(modalData.length / MODAL_ITEMS_PER_PAGE),
                        p + 1,
                      ),
                    )
                  }
                  disabled={
                    modalPage ===
                    Math.ceil(modalData.length / MODAL_ITEMS_PER_PAGE)
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
