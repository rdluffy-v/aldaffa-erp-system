import { useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Modal.jsx
 * Accessible modal dialog with ReactDOM portal, blurred backdrop, Framer Motion animations,
 * ESC-key close and click-outside close.
 *
 * Fixed: Focus management is strictly isolated to the open transition and NEVER steals focus
 * during user keystrokes in form inputs.
 */
const Modal = ({
  open = false,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  closeOnEsc = true,
  showCloseButton = true,
  className = ''
}) => {
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);

  // Keep latest onClose callback reference without re-triggering effects
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleClose = useCallback(() => {
    onCloseRef.current?.();
  }, []);

  // ESC key listener & body scroll lock (only toggles on open boolean change)
  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;

    // Set initial focus ONLY once when opened, if nothing inside is focused
    const focusTimer = window.setTimeout(() => {
      if (panelRef.current && !panelRef.current.contains(document.activeElement)) {
        panelRef.current.focus();
      }
    }, 50);

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && closeOnEsc) {
        e.preventDefault();
        handleClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [open, closeOnEsc, handleClose]);

  const handleBackdropClick = (e) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      handleClose();
    }
  };

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          role="presentation"
          onClick={handleBackdropClick}
        >
          {/* Blurred dark backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-md"
            aria-hidden="true"
          />

          {/* Dialog panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : 'نافذة الحوار'}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className={[
              'relative w-full max-h-[90vh] overflow-y-auto outline-none scrollbar-luxury',
              'bg-[#111827] dark:bg-slate-900 border border-amber-500/30 rounded-2xl',
              'shadow-[0_25px_60px_-12px_rgba(0,0,0,0.8),0_0_40px_rgba(217,119,6,0.12)]',
              sizeClasses[size],
              className
            ].join(' ')}
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          >
            {title && (
              <header className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 border-b border-amber-500/20 bg-[#111827]/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-t-2xl">
                <h2 className="text-lg font-bold text-[#e6edf3] dark:text-white flex items-center gap-2">
                  {title}
                </h2>
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="إغلاق النافذة"
                    className="p-1.5 rounded-lg text-[#768390] hover:text-[#e6edf3] hover:bg-white/10 transition-colors duration-150 cursor-pointer"
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                )}
              </header>
            )}

            <div className="px-6 py-5">{children}</div>

            {footer && (
              <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-amber-500/20 rounded-b-2xl bg-black/10">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default Modal;
