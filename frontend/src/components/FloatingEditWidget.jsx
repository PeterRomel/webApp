import { useState, useRef, useEffect } from "react";
import { Edit3 } from "lucide-react";
import { useEdit } from "../hooks/useEdit";
import ActiveEditsModal from "./ActiveEditsModal";

const FloatingEditWidget = () => {
  const { activeEdits } = useEdit();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Widget Placement State
  const [position, setPosition] = useState({
    x: window.innerWidth - 80,
    y: window.innerHeight - 100,
  });
  const isDragging = useRef(false);
  const hasMoved = useRef(false);

  // Keep it within window bounds if they resize the browser
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => ({
        x: Math.min(prev.x, window.innerWidth - 60),
        y: Math.min(prev.y, window.innerHeight - 60),
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  if (activeEdits.length === 0) return null;

  // --- NATIVE DRAG LOGIC ---
  const handlePointerDown = (e) => {
    isDragging.current = true;
    hasMoved.current = false;
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    hasMoved.current = true;

    setPosition((prev) => {
      let newX = prev.x + e.movementX;
      let newY = prev.y + e.movementY;
      // Clamp to screen edges
      newX = Math.max(0, Math.min(window.innerWidth - 60, newX));
      newY = Math.max(0, Math.min(window.innerHeight - 60, newY));
      return { x: newX, y: newY };
    });
  };

  const handlePointerUp = (e) => {
    isDragging.current = false;
    e.target.releasePointerCapture(e.pointerId);

    // If they didn't drag it, it counts as a click!
    if (!hasMoved.current) {
      setIsModalOpen(true);
    }
  };

  return (
    <>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ left: position.x, top: position.y }}
        className="fixed z-50 p-4 bg-yellow-400 text-yellow-900 rounded-full shadow-2xl cursor-grab active:cursor-grabbing hover:bg-yellow-300 transition-colors border-2 border-yellow-200 group"
        title="View Active Edits"
      >
        <Edit3 className="w-6 h-6" style={{ pointerEvents: "none" }} />

        {/* Little badge showing how many active edits there are */}
        <div
          className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full shadow-sm"
          style={{ pointerEvents: "none" }}
        >
          {activeEdits.length}
        </div>
      </div>

      <ActiveEditsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

export default FloatingEditWidget;
