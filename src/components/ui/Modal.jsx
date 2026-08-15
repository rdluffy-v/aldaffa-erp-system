import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';

/**
 * Modal.jsx
 * Accessible modal dialog with blurred backdrop, Framer Motion slide-up
 * animation, ESC-key close and click-outside close.
 *
 * @param {Object}  props
 * @param {boolean} [props.open=false]             - Controlled visibility
 * @param {Function} props.onClose                  - Close callback
 * @param {React.ReactNode} [props.title]           - Dialog title
 * @param {React.ReactNode} [props.children]        - Dialog body
 * @param {React.ReactNode} [props.footer]          - Dialog footer slot
 * @param {string}  [props.size='md']               - sm | md | lg | xl
 * @param {boolean} [props.closeOnBackdrop=true]    - Click outside closes
 * @param {boolean} [props.closeOnEsc=true]         - ESC closes
 * @param {boolean} [props.showCloseButton=true]    - Show the X button
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

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // Click-outside to close (capture-phase mousedown, works with RTL).
  useClickOutside(() => {
    if (closeOnBackdrop) handleClose();
  }, [panelRef], open);

  // ESC key + focus management + scroll lock while open.
  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    // Give the panel focus so it can receive keyboard events & announce itself.
    const focusTimer = window.setTimeout(() => panelRef.current?.focus(), 0);

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
      // Restore focus to the trigger element on close.
      previousFocusRef.current?.focus?.();
    };
  }, [open, closeOnEsc, handleClose]);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          role="presentation"
        >
          {/* Blurred dark backdrop */}
          <div
            className="absolute inset-0 bg-[#0d1117]/85 backdrop-blur-[8px]"
            aria-hidden="true"
          />

          {/* Dialog panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : 'نافذة الحوار'}
            tabIndex={-1}
            className={[
              'relative w-full max-h-[90vh] overflow-y-auto outline-none scrollbar-luxury',
              'bg-[#161b22] border border-white/10 rounded-2xl',
              'shadow-[0_25px_60px_-12px_rgba(0,0,0,0.7),0_0_40px_rgba(217,119,6,0.06)]',
              sizeClasses[size],
              className
            ].join(' ')}
            initial={{ opacity: 0, y: 28, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.9 }}
          >
            {title && (
              <header className="sticky top-0 z-10 flex items-center justify-between gap-4 px-6 py-4 border-b border-white/5 bg-[#161b22]/95 backdrop-blur-sm rounded-t-2xl">
                <h2 className="text-lg font-bold text-[#e6edf3]">{title}</h2>
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="إغلاق النافذة"
                    className="p-1.5 rounded-lg text-[#768390] hover:text-[#e6edf3] hover:bg-white/5 transition-colors duration-150 cursor-pointer"
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                )}
              </header>
            )}

            <div className="px-6 py-5">{children}</div>

            {footer && (
              <footer className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/5 rounded-b-2xl">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
