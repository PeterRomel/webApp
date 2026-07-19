import { X } from "lucide-react";

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="relative px-6 py-4 border-b border-gray-100 bg-gray-50 pr-16 md:pr-6">
          {/* On mobile, text can wrap. On desktop, it stays clean. */}
          <h3 className="text-lg md:text-xl font-bold text-gray-800 break-words">
            {title}
          </h3>

          {/* Positioned absolutely on the top right for mobile safety */}
          <button
            onClick={onClose}
            className="absolute top-3 right-4 p-2 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-6">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
