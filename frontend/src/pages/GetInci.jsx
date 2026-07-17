import { fetchEventSource } from "@microsoft/fetch-event-source";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileText,
  CheckCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Send,
  Download,
} from "lucide-react";
import api from "../api/axios";
import { ITEMS_PER_PAGE } from "../config/constants";

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

const GetInci = () => {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("IDLE");
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [isForwarding, setIsForwarding] = useState(false);

  const [tablePage, setTablePage] = useState(1);

  const abortControllerRef = useRef(null);
  const navigate = useNavigate();

  const resetToIdle = () => {
    setStatus("IDLE");
    setError(null);
    setFile(null);
    setResults(null);
    setTablePage(1);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.size > 5242880) {
      setError("File is too large. Please upload a file smaller than 5MB.");
      setFile(null);
      e.target.value = null;
      return;
    }
    setFile(selectedFile);
    setError(null);
  };

  const startSecureSSE = (jobId) => {
    const token = sessionStorage.getItem("token");
    const baseUrl = import.meta.env.DEV ? "http://127.0.0.1:8000" : "";
    const url = `${baseUrl}/api/scrape/stream/${jobId}`;

    abortControllerRef.current = new AbortController();

    fetchEventSource(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/event-stream",
      },
      signal: abortControllerRef.current.signal,
      async onopen(response) {
        if (response.status === 401) {
          sessionStorage.removeItem("token");
          sessionStorage.removeItem("user");
          window.location.href = "/login?expired=true";
          return;
        }
        if (!response.ok)
          throw new Error(`Server returned HTTP ${response.status}`);
      },
      async onmessage(event) {
        const data = JSON.parse(event.data);

        if (data.status === "completed") {
          abortControllerRef.current.abort();
          try {
            const response = await api.get(`/api/scrape/status/${jobId}`);
            setStatus("COMPLETED");
            setResults(response.data);
          } catch (err) {
            setError("Job completed, but failed to load results.");
            setStatus("IDLE");
          }
        } else if (data.status === "failed") {
          abortControllerRef.current.abort();
          setError(
            data.error_message || "Generator failed due to an unknown error.",
          );
          setStatus("IDLE");
        } else if (data.status === "cancelled") {
          abortControllerRef.current.abort();
          setError("This job was cancelled.");
          setStatus("IDLE");
        }
      },
      onerror(err) {
        if (err.name === "AbortError") return;
        setError(
          "Lost connection to server. Please check History for results.",
        );
        setStatus("IDLE");
        throw err;
      },
    });
  };

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
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
      link.setAttribute(
        "download",
        `inci_results_${results?.filename?.replace(/\.csv$/, ".xlsx")}`,
      );
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError("Could not download the file. Please try again.");
    }
  };

  const startGeneration = async () => {
    if (!file) return;
    setStatus("UPLOADING");
    setError(null);
    setResults(null);
    setTablePage(1);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // NOTE: Hitting the new INCI endpoint
      const response = await api.post("/api/scrape/upload/inci", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (response.data && response.data.job_id) {
        setStatus("PROCESSING");
        startSecureSSE(response.data.job_id);
      } else {
        throw new Error("Backend didn't return a job_id");
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed");
      setStatus("IDLE");
    }
  };

  // --- THE NEW FORWARD FEATURE ---
  const forwardToScraper = async () => {
    setIsForwarding(true);
    try {
      await api.post(`/api/scrape/${results.id}/forward-to-scraper`);
      // We navigate them directly to the History page so they can watch the new Scraper job run!
      navigate("/history");
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to forward data to scraper.");
    } finally {
      setIsForwarding(false);
    }
  };

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
        <div className="flex items-center mb-2">
          <Sparkles className="w-6 h-6 text-purple-500 mr-2" />
          <h1 className="text-2xl font-bold text-gray-800">
            AI INCI Generator
          </h1>
        </div>
        <p className="text-gray-500 mb-8">
          Upload an Excel file with a column named <strong>"Ingredient"</strong>
          . The AI will analyze trade names and mixtures and extract the
          official INCI names. Maximum 5,000 ingredients (5MB).
        </p>

        {status === "IDLE" && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const droppedFile = e.dataTransfer.files[0];
              if (!droppedFile) return;

              const validExtensions = [".xlsx", ".xlsm", ".xls", ".csv"];
              const fileExtension = droppedFile.name
                .substring(droppedFile.name.lastIndexOf("."))
                .toLowerCase();
              if (!validExtensions.includes(fileExtension)) {
                setError(
                  "Invalid file type. Please drop an Excel or CSV file.",
                );
                setFile(null);
                return;
              }
              if (droppedFile.size > 5242880) {
                setError(
                  "File is too large. Please drop a file smaller than 5MB.",
                );
                setFile(null);
                return;
              }
              setFile(droppedFile);
              setError(null);
            }}
            className="border-2 border-dashed border-purple-200 rounded-xl p-12 flex flex-col items-center justify-center transition-colors hover:border-purple-400 bg-purple-50/30"
          >
            <Upload className="w-12 h-12 text-purple-500 mb-4" />
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".xlsx,.xlsm,.xls,.csv"
              onChange={handleFileChange}
            />
            <label
              htmlFor="file-upload"
              className="cursor-pointer text-purple-600 font-semibold hover:text-purple-700"
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

        {(status === "UPLOADING" || status === "PROCESSING") && (
          <div className="py-12 flex flex-col items-center bg-purple-50/50 rounded-xl border border-purple-100">
            <Loader2 className="w-12 h-12 text-purple-500 animate-spin mb-4" />
            <h3 className="text-lg font-medium text-gray-800">
              {status === "UPLOADING"
                ? "Sending file to server..."
                : "AI is analyzing materials..."}
            </h3>
            <p className="text-gray-500 text-sm mt-2 mb-6 text-center max-w-sm">
              This is very fast, but you can safely run it in the background.
            </p>
            {status === "PROCESSING" && (
              <button
                onClick={resetToIdle}
                className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:text-purple-600 transition-colors shadow-sm text-sm font-medium"
              >
                Run in background & Start new job{" "}
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>
            )}
          </div>
        )}

        {status === "COMPLETED" && results && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-purple-50 p-4 md:p-6 rounded-xl border border-purple-100">
              <div className="flex items-center">
                <CheckCircle className="w-8 h-8 text-purple-500 mr-4 shrink-0" />
                <div>
                  <h3 className="text-lg font-bold text-purple-900">
                    Generation Complete!
                  </h3>
                  <p className="text-purple-700 text-sm">
                    Found {results.result_count} items from{" "}
                    <strong className="break-all">{results.filename}</strong>.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3">
                <button
                  onClick={resetToIdle}
                  className="w-full sm:w-auto justify-center px-4 py-2 bg-white border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-100 transition-colors text-sm font-medium shadow-sm"
                >
                  Start New Job
                </button>

                {/* 1-Click Send to Cosing Scraper */}
                {results.result_count > 0 && (
                  <button
                    onClick={forwardToScraper}
                    disabled={isForwarding}
                    className="flex w-full sm:w-auto items-center justify-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-purple-400 transition-colors shadow-sm text-sm font-medium"
                  >
                    {isForwarding ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-2" />
                    )}
                    Forward to Cosing Scraper
                  </button>
                )}

                {results.result_count > 0 && (
                  <button
                    onClick={handleDownload}
                    className="flex w-full sm:w-auto items-center justify-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm text-sm font-medium"
                  >
                    <Download className="w-4 h-4 mr-2" /> Download Excel
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <h4 className="font-semibold text-gray-700">Data Preview</h4>
                <span className="text-sm text-gray-500">
                  Showing page {tablePage} of {totalPages}
                </span>
              </div>
              <div className="overflow-x-auto overflow-y-auto max-h-[50vh] w-full">
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
                            {key}
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
                            <ExpandableCell content={val} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalItems > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between p-4 border-t border-gray-100 bg-gray-50">
                  <button
                    onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                    disabled={tablePage === 1}
                    className="flex items-center px-3 py-1 text-sm text-purple-600 hover:bg-purple-100 rounded-md disabled:opacity-50 disabled:hover:bg-transparent transition-colors font-medium"
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
                    className="flex items-center px-3 py-1 text-sm text-purple-600 hover:bg-purple-100 rounded-md disabled:opacity-50 disabled:hover:bg-transparent transition-colors font-medium"
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

        {status === "IDLE" && (
          <div className="mt-8 flex justify-end">
            <button
              onClick={startGeneration}
              disabled={!file}
              className="px-6 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-sm flex items-center"
            >
              <Sparkles className="w-4 h-4 mr-2" /> Start AI Generator
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GetInci;
