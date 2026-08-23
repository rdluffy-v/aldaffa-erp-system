/**
 * ============================================================================
 * TOAST CONTAINER - LUXURY TOP-CENTER FLOATING NOTIFICATION HUD
 * ============================================================================
 * Centered at top of screen to prevent blocking navigation, sidebar, or modals.
 * Features:
 * - High-end Atelier glassmorphic styling
 * - Smooth vertical spring drop & dismiss animations
 * - Color-coded glowing ambient indicator rings
 * - Auto-dismiss gradient progress bar
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, XCircle, Info, X, Sparkles } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';

const TYPE_CONFIG = {
  success: {
    icon: CheckCircle2,
    accentColor: '#10b981',
    gradient: 'from-emerald-500/20 via-emerald-500/10 to-transparent',
    border: 'border-emerald-500/40',
    glow: 'shadow-[0_12px_36px_rgba(16,185,129,0.22)]',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    label: 'تمت العملية بنجاح'
  },
  error: {
    icon: XCircle,
    accentColor: '#f43f5e',
    gradient: 'from-rose-500/20 via-rose-500/10 to-transparent',
    border: 'border-rose-500/40',
    glow: 'shadow-[0_12px_36px_rgba(244,63,94,0.25)]',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    label: 'تنبيه خطأ'
  },
  warning: {
    icon: AlertTriangle,
    accentColor: '#f59e0b',
    gradient: 'from-amber-500/20 via-amber-500/10 to-transparent',
    border: 'border-amber-500/40',
    glow: 'shadow-[0_12px_36px_rgba(245,158,11,0.22)]',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    label: 'ملاحظة وتنبيه'
  },
  info: {
    icon: Info,
    accentColor: '#38bdf8',
    gradient: 'from-sky-500/20 via-sky-500/10 to-transparent',
    border: 'border-sky-500/40',
    glow: 'shadow-[0_12px_36px_rgba(56,189,248,0.22)]',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    label: 'إشعار توضيحي'
  }
};

const ToastContainer = () => {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none w-full max-w-[480px] px-3"
      role="region"
      aria-live="polite"
      aria-label="إشعارات النظام"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const config = TYPE_CONFIG[toast.type] || TYPE_CONFIG.info;
          const ToastIcon = config.icon;
          const hasProgress = Number(toast.duration) > 0;

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.92, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -16, scale: 0.94, filter: 'blur(2px)' }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              role="alert"
              className={`relative overflow-hidden rounded-2xl border backdrop-blur-2xl bg-[#161b22]/95 dark:bg-[#0d1117]/95 ${config.border} ${config.glow} pointer-events-auto w-full shadow-2xl transition-all`}
            >
              {/* Top ambient luxury gradient glow */}
              <div className={`absolute inset-0 bg-gradient-to-b ${config.gradient} pointer-events-none opacity-40`} />

              <div className="relative z-10 flex items-start gap-3 p-3.5 sm:p-4">
                {/* Icon Container with glowing ring */}
                <div
                  className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center border shadow-sm mt-0.5"
                  style={{
                    backgroundColor: `${config.accentColor}18`,
                    borderColor: `${config.accentColor}40`
                  }}
                >
                  <ToastIcon className="w-4.5 h-4.5" style={{ color: config.accentColor }} aria-hidden="true" />
                </div>

                {/* Text Body */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-black text-white">{config.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${config.badge}`}>
                      إشعار
                    </span>
                  </div>

                  {toast.message && (
                    <p className="text-xs font-medium text-[#c9d1d9] leading-relaxed break-words">
                      {toast.message}
                    </p>
                  )}
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  aria-label="إغلاق الإشعار"
                  className="shrink-0 p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Minimalist Progress Timer Line */}
              {hasProgress && (
                <div className="w-full bg-white/5 h-[2.5px] overflow-hidden">
                  <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{
                      duration: Number(toast.duration) / 1000,
                      ease: 'linear'
                    }}
                    className="h-full"
                    style={{
                      background: `linear-gradient(90deg, ${config.accentColor}, #fbbf24)`,
                      boxShadow: `0 0 8px ${config.accentColor}`
                    }}
                    aria-hidden="true"
                  />
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default ToastContainer;
