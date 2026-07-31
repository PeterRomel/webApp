import { useState } from "react";
import Modal from "./Modal";
import { useEdit } from "../hooks/useEdit";
import api from "../api/axios";
import {
  ExternalLink,
  Trash2,
  DownloadCloud,
  Loader2,
  AlertCircle,
} from "lucide-react";

const ActiveEditsModal = ({ isOpen, onClose }) => {
  const { activeEdits, removeEdit } = useEdit();

  // Track loading and error states per job ID
  const [loadingMap, setLoadingMap] = useState({});
  const [errorMap, setErrorMap] = useState({});

  if (!isOpen) return null;

  const handleOpenSheet = (url) => {
    window.open(url, "_blank");
  };

  const handleCancelEdit = async (job) => {
    setLoadingMap((prev) => ({ ...prev, [job.originalJobId]: "canceling" }));
    try {
      await api.post(
        `/api/scrape/${job.originalJobId}/cancel-edit?sheet_id=${job.sheetId}`,
      );
      removeEdit(job.originalJobId);
      if (activeEdits.length === 1) onClose(); // Close modal if that was the last one
    } catch (err) {
      setErrorMap((prev) => ({
        ...prev,
        [job.originalJobId]:
          "Failed to cancel sheet. It may have already been deleted.",
      }));
    } finally {
      setLoadingMap((prev) => ({ ...prev, [job.originalJobId]: null }));
    }
  };

  const handlePullAndSave = async (job) => {
    setLoadingMap((prev) => ({ ...prev, [job.originalJobId]: "saving" }));
    setErrorMap((prev) => ({ ...prev, [job.originalJobId]: null })); // clear old errors
    try {
      await api.post(
        `/api/scrape/${job.originalJobId}/pull-edit?sheet_id=${job.sheetId}`,
      );
      removeEdit(job.originalJobId);

      // Dispatch event so the History page knows to silently refresh!
      window.dispatchEvent(new Event("refreshHistory"));

      if (activeEdits.length === 1) onClose();
    } catch (err) {
      // Show the specific Pandas validation error inside the modal!
      setErrorMap((prev) => ({
        ...prev,
        [job.originalJobId]:
          err.response?.data?.detail || "Failed to pull and save data.",
      }));
    } finally {
      setLoadingMap((prev) => ({ ...prev, [job.originalJobId]: null }));
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Active Edit Sessions">
      <div className="space-y-4">
        {activeEdits.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No active edits.</p>
        ) : (
          activeEdits.map((job) => (
            <div
              key={job.originalJobId}
              className="border border-blue-100 bg-blue-50/30 p-4 rounded-xl"
            >
              <h4 className="font-semibold text-gray-800 break-all mb-3">
                {job.filename}
              </h4>

              {/* Error Display */}
              {errorMap[job.originalJobId] && (
                <div className="mb-3 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700 flex items-start">
                  <AlertCircle className="w-4 h-4 mr-2 shrink-0 mt-0.5" />
                  <span>{errorMap[job.originalJobId]}</span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleOpenSheet(job.sheetUrl)}
                  className="flex items-center px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 mr-1.5" /> Open Sheet
                </button>

                <button
                  onClick={() => handleCancelEdit(job)}
                  disabled={loadingMap[job.originalJobId]}
                  className="flex items-center px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {loadingMap[job.originalJobId] === "canceling" ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 mr-1.5" />
                  )}
                  Discard
                </button>

                <button
                  onClick={() => handlePullAndSave(job)}
                  disabled={loadingMap[job.originalJobId]}
                  className="flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  {loadingMap[job.originalJobId] === "saving" ? (
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <DownloadCloud className="w-4 h-4 mr-1.5" />
                  )}
                  Pull & Save
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
};

export default ActiveEditsModal;
