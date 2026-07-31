import { useState, useEffect } from "react";
import { EditContext } from "./EditContext";

export const EditProvider = ({ children }) => {
  const [activeEdits, setActiveEdits] = useState([]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (activeEdits.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [activeEdits]);

  const addEdit = (editJob) => {
    setActiveEdits((prev) => [...prev, editJob]);
  };

  const removeEdit = (originalJobId) => {
    setActiveEdits((prev) =>
      prev.filter((job) => job.originalJobId !== originalJobId),
    );
  };

  // NEW: Erase all edits on logout to prevent state leaks
  const clearEdits = () => setActiveEdits([]);

  return (
    <EditContext.Provider
      value={{ activeEdits, addEdit, removeEdit, clearEdits }}
    >
      {children}
    </EditContext.Provider>
  );
};
