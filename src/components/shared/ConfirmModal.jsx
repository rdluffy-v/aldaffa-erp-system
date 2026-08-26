import React from 'react';
import ReactDOM from 'react-dom';

/**
 * ConfirmModal.jsx
 * Safe, portaled confirmation dialog with universal support for:
 * - open, isOpen (boolean)
 * - danger, type ('danger' | 'warning' | 'info')
 * - isLoading (boolean)
 * - confirmText, confirmLabel
 * - cancelText, cancelLabel
 * - onConfirm, onCancel, onClose
 */
const ConfirmModal = ({
  open,
  isOpen,
  title = 'تأكيد العملية',
  message = '',
  confirmLabel,
  confirmText,
  cancelLabel,
  cancelText,
  icon = '⚠️',
  danger = false,
  type,
  isLoading = false,
  onConfirm,
  onCancel,
  onClose
}) => {
  // Support both open and isOpen seamlessly
  const isVisible = open !== undefined ? Boolean(open) : (isOpen !== undefined ? Boolean(isOpen) : true);
  if (!isVisible) return null;

  const isDanger = danger || type === 'danger';

  const handleConfirm = (e) => {
    e.stopPropagation();
    if (!isLoading) {
      onConfirm?.();
    }
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    if (!isLoading) {
      if (onCancel) onCancel();
      else if (onClose) onClose();
    }
  };

  const finalConfirmText = isLoading
    ? 'جاري التنفيذ...'
    : confirmText || confirmLabel || '✅ تأكيد';
  const finalCancelText = cancelText || cancelLabel || 'إلغاء';

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4"
      dir="rtl"
      onClick={handleCancel}
    >
      <div
        className="atelier-card bg-white dark:bg-slate-900 border border-amber-500/30 p-6 w-full max-w-md shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-extrabold text-[#2D2424] dark:text-amber-300 mb-3 flex items-center gap-2">
          <span>{icon}</span>
          <span>{title}</span>
        </h2>

        {message && (
          <div className="bg-amber-50/70 dark:bg-slate-800/80 border border-amber-200/60 dark:border-white/10 rounded-2xl p-4 mb-5">
            <p className="text-xs text-[#5C524F] dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {message}
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={handleConfirm}
            className={`flex-1 py-2.5 px-4 rounded-full text-xs font-bold text-white transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50 ${
              isDanger
                ? 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600'
                : 'btn-atelier-primary'
            }`}
            autoFocus
          >
            {finalConfirmText}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={handleCancel}
            className="flex-1 py-2.5 px-4 rounded-full text-xs font-bold bg-gray-200 dark:bg-slate-800 text-[#2D2424] dark:text-slate-200 hover:bg-gray-300 dark:hover:bg-slate-700 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {finalCancelText}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return ReactDOM.createPortal(modalContent, document.body);
  }

  return modalContent;
};

export default ConfirmModal;
