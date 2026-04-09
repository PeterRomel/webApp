import { useState, useEffect, useRef } from "react";
import {
  Upload,
  FileText,
  CheckCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import api from "../api/axios";

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

const Scraper = () => {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("IDLE"); // IDLE, UPLOADING, PROCESSING, COMPLETED
  const [taskId, setTaskId] = useState(null);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  // Pagination State for the Results Table
  const [tablePage, setTablePage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const pollInterval = useRef(null);

  // --- HELPER: Reset the view to upload a new file ---
  const resetToIdle = () => {
    setStatus("IDLE");
    setError(null);
    setFile(null);
    setResults(null);
    setTaskId(null);
    setTablePage(1);

    // Stop polling the current job so it doesn't overwrite the screen
    // The Celery backend will continue processing it in the background!
    if (pollInterval.current) {
      clearInterval(pollInterval.current);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    const MAX_FILE_SIZE = 52428800; // 50MB
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("File is too large. Please upload a file smaller than 50MB.");
      setFile(null);
      e.target.value = null;
      return;
    }

    setFile(selectedFile);
    setError(null);
  };

  const pollStatus = (jobId) => {
    if (pollInterval.current) clearInterval(pollInterval.current);

    pollInterval.current = setInterval(async () => {
      try {
        const response = await api.get(`/api/scrape/status/${jobId}`);
        if (response.data.status === "completed") {
          setStatus("COMPLETED");
          setResults(response.data);
          clearInterval(pollInterval.current);
        } else if (response.data.status === "failed") {
          const backendError =
            response.data.error_message ||
            "Scraping failed due to an unknown error.";
          setError(backendError);
          setStatus("IDLE");
          clearInterval(pollInterval.current);
        }
      } catch (err) {
        console.error("Polling error:", err);
      }
    }, 10000);
  };

  useEffect(() => {
    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, []);

  const handleDownload = async () => {
    try {
      const response = await api.get(`/api/scrape/download/${results.id}`, {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `results_${results.filename}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      let errorMessage = "Could not download the file. Please try again.";

      if (err.response && err.response.data instanceof Blob) {
        try {
          const errorText = await err.response.data.text();
          const errorJson = JSON.parse(errorText);
          if (errorJson.detail) errorMessage = errorJson.detail;
        } catch (parseErr) {
          console.error("Could not parse error blob", parseErr);
        }
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      }
      setError(errorMessage);
    }
  };

  const startScraping = async () => {
    if (!file) return;

    setStatus("UPLOADING");
    setError(null);
    setResults(null);
    setTablePage(1);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await api.post("/api/scrape/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.data && response.data.job_id) {
        setTaskId(response.data.job_id);
        setStatus("PROCESSING");
        pollStatus(response.data.job_id);
      } else {
        throw new Error("Backend didn't return a job_id");
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || "Upload failed";
      setError(msg);
      setStatus("IDLE");
    }
  };

  // Calculate pagination variables safely
  const totalItems = results?.data?.length || 0;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const currentDataSlice =
    results?.data?.slice(
      (tablePage - 1) * ITEMS_PER_PAGE,
      tablePage * ITEMS_PER_PAGE,
    ) || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          Cosing Ingredient Scraper
        </h1>
        <p className="text-gray-500 mb-8">
          Upload your Excel file containing INCI names to begin the automated
          extraction.
        </p>

        {/* Upload Zone */}
        {status === "IDLE" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const droppedFile = e.dataTransfer.files[0];
              if (!droppedFile) return;

              if (droppedFile.size > 52428800) {
                setError(
                  "File is too large. Please drop a file smaller than 50MB.",
                );
                setFile(null);
                return;
              }

              setFile(droppedFile);
              setError(null);
            }}
            className="border-2 border-dashed border-gray-200 rounded-xl p-12 flex flex-col items-center justify-center transition-colors hover:border-blue-400 bg-gray-50/50"
          >
            <Upload className="w-12 h-12 text-blue-500 mb-4" />
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".xlsx,.xlsm,.xls,.csv"
              onChange={handleFileChange}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer text-blue-600 font-semibold hover:text-blue-700"
            >
              Click to upload
            </label>
            <p className="text-gray-400 text-sm mt-1">
              or drag and drop Excel/CSV
            </p>
            {file && (
              <div className="mt-4 flex items-center text-sm text-green-600 bg-green-50 px-4 py-2 rounded-full border border-green-200">
                <FileText className="w-4 h-4 mr-2" /> {file.name}
              </div>
            )}
          </div>
        )}

        {/* Processing State */}
        {(status === "UPLOADING" || status === "PROCESSING") && (
          <div className="py-12 flex flex-col items-center bg-blue-50/50 rounded-xl border border-blue-100">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <h3 className="text-lg font-medium text-gray-800">
              {status === "UPLOADING"
                ? "Sending file to server..."
                : "Selenium is scraping Cosing..."}
            </h3>
            <p className="text-gray-500 text-sm mt-2 mb-6 text-center max-w-sm">
              This may take a few minutes depending on the number of
              ingredients. You don't have to wait here!
            </p>

            {/* NEW: Button to background the task and start a new one */}
            <button
              onClick={resetToIdle}
              className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:text-blue-600 transition-colors shadow-sm text-sm font-medium"
            >
              Run in background & Start new job{" "}
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
            <p className="text-xs text-gray-400 mt-3">
              You can download these results later from the History tab.
            </p>
          </div>
        )}

        {/* Completed State */}
        {status === "COMPLETED" && results && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Summary Header */}
            <div className="flex items-center justify-between bg-green-50 p-6 rounded-xl border border-green-100">
              <div className="flex items-center">
                <CheckCircle className="w-8 h-8 text-green-500 mr-4" />
                <div>
                  <h3 className="text-lg font-bold text-green-900">
                    Scraping Complete!
                  </h3>
                  <p className="text-green-700 text-sm">
                    Found {results.result_count} items from{" "}
                    <strong>{results.filename}</strong>.
                  </p>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={resetToIdle}
                  className="px-4 py-2 bg-white border border-green-200 text-green-700 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium shadow-sm"
                >
                  Start New Job
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm text-sm font-medium"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Download Excel
                </button>
              </div>
            </div>

            {/* Data Preview Table (History-style Pagination & Sticky Header) */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h4 className="font-semibold text-gray-700">Data Preview</h4>
                <span className="text-sm text-gray-500">
                  Showing page {tablePage} of {totalPages}
                </span>
              </div>

              <div className="overflow-x-auto overflow-y-auto max-h-[50vh]">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      {results.data &&
                        results.data.length > 0 &&
                        Object.keys(results.data[0]).map((key) => (
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
                    {currentDataSlice.map((row, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        {Object.values(row).map((val, i) => (
                          <td
                            key={i}
                            className="px-6 py-4 text-sm text-gray-600 min-w-[200px] max-w-md border-b"
                          >
                            {/* Reusing the ExpandableCell from History */}
                            <ExpandableCell content={val} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalItems > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                    disabled={tablePage === 1}
                    className="flex items-center px-3 py-1 text-sm text-blue-600 hover:bg-blue-100 rounded-md disabled:opacity-50 disabled:hover:bg-transparent transition-colors font-medium"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                  </button>
                  <span className="text-sm text-gray-500 font-medium">
                    Page {tablePage} of {totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setTablePage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={tablePage === totalPages}
                    className="flex items-center px-3 py-1 text-sm text-blue-600 hover:bg-blue-100 rounded-md disabled:opacity-50 disabled:hover:bg-transparent transition-colors font-medium"
                  >
                    Next <ChevronRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 text-red-600 text-sm bg-red-50 p-4 rounded-lg border border-red-100 flex items-start">
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {/* Start Button (Only visible during IDLE) */}
        {status === "IDLE" && (
          <div className="mt-8 flex justify-end">
            <button
              onClick={startScraping}
              disabled={!file}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              Start Scraping
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Scraper;
