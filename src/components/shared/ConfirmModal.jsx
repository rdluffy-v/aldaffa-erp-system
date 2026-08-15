import React from 'react';

/**
 * ConfirmModal.jsx
 * Lightweight confirmation dialog matching the app's dark luxury style.
 * Replaces window.confirm() usage across modules.
 *
 * @param {Object}  props
 * @param {boolean} props.open              - Controlled visibility
 * @param {string}  props.title             - Dialog title
 * @param {string}  [props.message]         - Optional body message
 * @param {string}  [props.confirmLabel]    - Confirm button label
 * @param {string}  [props.cancelLabel]     - Cancel button label
 * @param {string}  [props.icon]            - Emoji icon shown in the title
 * @param {Function} props.onConfirm        - Confirm callback
 * @param {Function} props.onCancel         - Cancel callback
 */
const ConfirmModal = ({
  open = false,
  title = 'تأكيد العملية',
  message = '',
  confirmLabel = '✅ تأكيد',
  cancelLabel = 'إلغاء',
  icon = '⚠️',
  onConfirm,
  onCancel
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[90]" dir="rtl">
      <div className="glass-card p-6 w-[480px] max-h-[90vh] overflow-y-auto scrollbar-thin">
        <h2 className="text-2xl font-bold text-gold mb-4 flex items-center gap-2">
          <span>{icon}</span>
          <span>{title}</span>
        </h2>

        {message && (
          <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 mb-6">
            <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{message}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 btn-gold py-3"
            autoFocus
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg font-bold hover:bg-gray-600"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
