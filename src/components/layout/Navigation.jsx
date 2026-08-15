import React from 'react';
import { motion } from 'framer-motion';
import { MODULE_FLACON_MAP } from '../ui/FlaconIcons.jsx';

/**
 * Organic Atelier Navigation Tabs
 * Displays horizontal pill chips with delicate line-art flacon icons above each tab.
 */
const Navigation = ({ modules = [], activeModule, onSelect, className = '' }) => {
  return (
    <nav
      role="tablist"
      aria-label="التنقل الرئيسي"
      className={[
        'relative flex items-center justify-center gap-1.5 overflow-x-auto scrollbar-none px-4 pb-2 pt-0.5',
        className
      ].join(' ')}
    >
      {modules.map((mod) => {
        const isActive = activeModule === mod.id;
        const FlaconIcon = MODULE_FLACON_MAP[mod.id];

        return (
          <motion.button
            key={mod.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect?.(mod.id)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            className={[
              'relative shrink-0 flex flex-col items-center gap-0.5 py-1 px-3 rounded-full cursor-pointer no-select transition-all',
              isActive
                ? 'text-[#2D2424] dark:text-slate-900 font-bold'
                : 'text-[#5C524F] dark:text-slate-300 hover:text-[#2D2424] dark:hover:text-white font-medium hover:bg-white/40 dark:hover:bg-white/10'
            ].join(' ')}
          >
            {/* Smooth animated active pill background */}
            {isActive && (
              <motion.span
                layoutId="canopy-active-pill"
                className="absolute inset-0 rounded-full bg-gradient-to-r from-[#D4A359] via-[#FBDF9D] to-[#9EBAA4] dark:from-amber-400 dark:to-amber-500 shadow-[0_4px_12px_rgba(212,163,89,0.35)]"
                transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                aria-hidden="true"
              />
            )}

            {/* Delicate Flacon Icon */}
            {FlaconIcon && (
              <FlaconIcon
                className={[
                  'relative z-10 w-4 h-4 transition-transform duration-200',
                  isActive ? 'scale-110 text-[#2D2424] dark:text-slate-950' : 'text-[#8C827A] dark:text-slate-400'
                ].join(' ')}
                aria-hidden="true"
              />
            )}

            {/* Label */}
            <span className="relative z-10 text-[11px] whitespace-nowrap leading-none mt-0.5">
              {mod.label}
            </span>
          </motion.button>
        );
      })}
    </nav>
  );
};

export default Navigation;
