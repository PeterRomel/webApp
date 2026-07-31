import { useContext } from "react";
import { EditContext } from "../context/EditContext";

export const useEdit = () => {
  const context = useContext(EditContext);
  if (!context) {
    throw new Error("useEdit must be used within an EditProvider");
  }
  return context;
};
