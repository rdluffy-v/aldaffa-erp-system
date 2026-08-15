import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, XCircle, Info, X } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';

/**
 * ToastContainer.jsx
 * Renders stacked toast notifications from the UI store (top-right),
 * color-coded by type with auto-dismiss progress bars and Framer Motion
 * slide-in / out animations.
 *
 * Types: success | error | warning | info
 */

const TYPE_CONFIG = {
  success: {
    icon: CheckCircle2,
    color: '#4ade80',
    border: 'rgba(34, 197, 94, 0.35)',
    background: 'rgba(34, 197, 94, 0.12)',
    label: 'تم بنجاح'
  },
  error: {
    icon: XCircle,
    color: '#f87171',
    border: 'rgba(239, 68, 68, 0.35)',
    background: 'rgba(239, 68, 68, 0.12)',
    label: 'خطأ'
  },
  warning: {
    icon: AlertCircle,
    color: '#fbbf24',
    border: 'rgba(217, 119, 6, 0.4)',
    background: 'rgba(217, 119, 6, 0.12)',
    label: 'تنبيه'
  },
  info: {
    icon: Info,
    color: '#60a5fa',
    border: 'rgba(59, 130, 246, 0.35)',
    background: 'rgba(59, 130, 246, 0.12)',
    label: 'معلومة'
  }
};

const ToastContainer = () => {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  return (
    <div
      className="fixed top-4 right-4 z-[1100] flex flex-col gap-3 w-[360px] max-w-[calc(100vw-2rem)]"
      role="region"
      aria-live="polite"
      aria-label="الإشعارات"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const config = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info;
          const ToastIcon = config.icon;
          const hasProgress = Number(toast.duration) > 0;

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 64, scale: 0.94 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 64, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              role="alert"
              className="relative overflow-hidden rounded-xl border shadow-[0_8px_30px_rgba(0,0,0,0.5)] pointer-events-auto"
              style={{ background: config.background, borderColor: config.border }}
            >
              <div className="flex items-start gap-3 p-4">
                <ToastIcon
                  className="w-5 h-5 shrink-0 mt-0.5"
                  style={{ color: config.color }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#e6edf3]">{config.label}</p>
                  {toast.message && (
                    <p className="text-sm text-[#adbac7] break-words mt-0.5">
                      {toast.message}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  aria-label="إغلاق الإشعار"
                  className="shrink-0 p-1 rounded-md text-[#768390] hover:text-[#e6edf3] hover:bg-white/5 transition-colors duration-150 cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {hasProgress && (
                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{
                    duration: Number(toast.duration) / 1000,
                    ease: 'linear'
                  }}
                  className="h-1"
                  style={{ background: config.color, opacity: 0.85 }}
                  aria-hidden="true"
                />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default ToastContainer;
