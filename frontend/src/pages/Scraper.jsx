import { useState, useEffect, useRef } from "react";
import { Upload, FileText, CheckCircle, Loader2 } from "lucide-react";
import api from "../api/axios";

const Scraper = () => {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("IDLE"); // IDLE, UPLOADING, PROCESSING, COMPLETED
  const [taskId, setTaskId] = useState(null);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];

    // If the user cancels the file dialog, do nothing
    if (!selectedFile) return;

    // 50MB in bytes (50 * 1024 * 1024)
    const MAX_FILE_SIZE = 52428800;

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("File is too large. Please upload a file smaller than 50MB.");
      setFile(null); // Reject the file
      // Optional: Reset the input element if they try to upload the exact same file twice
      e.target.value = null;
      return;
    }

    setFile(selectedFile);
    setError(null);
  };

  const pollInterval = useRef(null);

  const pollStatus = (jobId) => {
    // Clear any existing poll before starting a new one
    if (pollInterval.current) clearInterval(pollInterval.current);

    pollInterval.current = setInterval(async () => {
      try {
        const response = await api.get(`/api/scrape/status/${jobId}`);
        if (response.data.status === "completed") {
          setStatus("COMPLETED");
          setResults(response.data);
          clearInterval(pollInterval.current);
        } else if (response.data.status === "failed") {
          // Use the backend error, or fall back to a generic one if it's missing
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
    // This return function acts as a "cleanup" when the component unmounts (user leaves the page)
    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, []);

  const handleDownload = async () => {
    try {
      const response = await api.get(`/api/scrape/download/${results.id}`, {
        responseType: "blob", // Critical: tells Axios to handle binary data
      });

      // Create a local URL for the binary data
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;

      // Set the filename (you can also get this from headers if needed)
      link.setAttribute("download", `results_${results.filename}`);

      document.body.appendChild(link);
      link.click();

      // Cleanup
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);

      let errorMessage = "Could not download the file. Please try again.";

      // Check if the error response is a Blob
      if (err.response && err.response.data instanceof Blob) {
        try {
          // Await the text content of the Blob
          const errorText = await err.response.data.text();
          // Parse the string back into a JSON object
          const errorJson = JSON.parse(errorText);

          if (errorJson.detail) {
            errorMessage = errorJson.detail; // "Results are not ready for download"
          }
        } catch (parseErr) {
          console.error("Could not parse error blob", parseErr);
        }
      } else if (err.response?.data?.detail) {
        // Fallback just in case it wasn't a Blob
        errorMessage = err.response.data.detail;
      }

      // Update the UI with the exact message from FastAPI
      setError(errorMessage);
    }
  };

  const startScraping = async () => {
    if (!file) return;

    setStatus("UPLOADING");
    setError(null);
    setResults(null);
    const formData = new FormData();

    formData.append("file", file);

    try {
      const response = await api.post("/api/scrape/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          // Note: Axios automatically handles the boundary for multipart/form-data
        },
      });

      // DEBUG: Look at your console to see exactly what the backend sent
      console.log("Full Backend Response:", response.data);

      if (response.data && response.data.job_id) {
        setTaskId(response.data.job_id);
        setStatus("PROCESSING");
        // Start polling here
        pollStatus(response.data.job_id);
      } else {
        throw new Error("Backend didn't return a job_id");
      }
    } catch (err) {
      console.error("Upload Error Detail:", err);
      // Professional Error Handling: Capture the "Invalid file type" or "Token" errors
      const msg = err.response?.data?.detail || err.message || "Upload failed";
      setError(msg);
      setStatus("IDLE");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
            onDragOver={(e) => e.preventDefault()} // Stops Chrome from trying to open the file
            onDrop={(e) => {
              e.preventDefault();
              const droppedFile = e.dataTransfer.files[0];

              if (!droppedFile) return;

              const MAX_FILE_SIZE = 52428800;
              if (droppedFile.size > MAX_FILE_SIZE) {
                setError(
                  "File is too large. Please drop a file smaller than 50MB.",
                );
                setFile(null);
                return;
              }

              setFile(droppedFile);
              setError(null);
            }}
            className="border-2 border-dashed border-gray-200 rounded-xl p-12 flex flex-col items-center justify-center transition-colors hover:border-blue-400"
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
            <p className="text-xs text-amber-600 mt-2">
              Note: Navigating away from this page will clear this view. You can
              check ongoing progress in the History tab.
            </p>
            {file && (
              <div className="mt-4 flex items-center text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
                <FileText className="w-4 h-4 mr-2" /> {file.name}
              </div>
            )}
          </div>
        )}

        {/* Processing State */}
        {(status === "UPLOADING" || status === "PROCESSING") && (
          <div className="py-12 flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <h3 className="text-lg font-medium text-gray-800">
              {status === "UPLOADING"
                ? "Sending file to server..."
                : "Selenium is scraping Cosing..."}
            </h3>
            <p className="text-gray-500 text-sm mt-2 text-center max-w-xs">
              This may take a few minutes depending on the number of
              ingredients. You can leave this page; we'll keep working.
            </p>
          </div>
        )}

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
                    Found {results.result_count} ingredients from your file.
                  </p>
                </div>
              </div>

              <button
                onClick={handleDownload}
                className="flex items-center px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm"
              >
                <FileText className="w-4 h-4 mr-2" />
                Download Excel
              </button>
            </div>

            {/* Data Preview Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <h4 className="font-semibold text-gray-700">Data Preview</h4>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {/* Dynamically create headers based on the first object keys */}
                      {results.data &&
                        results.data.length > 0 &&
                        Object.keys(results.data[0]).map((key) => (
                          <th
                            key={key}
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50 sticky top-0"
                          >
                            {key.replace("_", " ")}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {results.data?.map((row, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        {Object.values(row).map((val, i) => (
                          <td
                            key={i}
                            className="px-6 py-4 text-sm text-gray-600 min-w-[200px] max-w-md"
                          >
                            <div className="whitespace-pre-line break-words line-clamp-4 hover:line-clamp-none transition-all cursor-pointer">
                              {val || (
                                <span className="text-gray-300 italic">
                                  null
                                </span>
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

            {/* Reset Button */}
            <div className="flex justify-center">
              <button
                onClick={() => {
                  setStatus("IDLE");
                  setError(null);
                  setFile(null);
                  setResults(null);
                  // document.getElementById("file-upload").value = "";
                }}
                className="text-sm text-gray-500 hover:text-blue-600 font-medium"
              >
                Start another job
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 text-red-500 text-sm bg-red-50 p-3 rounded-lg">
            {error}
          </p>
        )}

        <div className="mt-8 flex justify-end">
          <button
            onClick={startScraping}
            disabled={!file || status !== "IDLE"}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all"
          >
            Start Scraping
          </button>
        </div>
      </div>
    </div>
  );
};

export default Scraper;
