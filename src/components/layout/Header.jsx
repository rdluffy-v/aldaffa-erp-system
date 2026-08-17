import React, { useEffect, useState } from 'react';
import { useUIStore } from '../../stores/useUIStore.js';
import { FlaconEmblem } from '../ui/FlaconIcons.jsx';
import { Sun, Moon, Keyboard } from 'lucide-react';

/**
 * Organic Atelier Canopy Header
 * Features:
 * - Live Arabic Libyan Date/Time clock
 * - Organic luxury flacon brand emblem
 * - In-app Keyboard Language Mode Switcher (عربي / EN)
 * - Theme Switcher (Daylight Atelier ☀️ / Nocturne Obsidian 🌙)
 * - Actions slot
 */
const Header = ({ children }) => {
  const [now, setNow] = useState(() => new Date());
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
  const keyboardLanguage = useUIStore((state) => state.keyboardLanguage);
  const toggleKeyboardLanguage = useUIStore((state) => state.toggleKeyboardLanguage);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Global hotkey to toggle keyboard language (Alt+K or Alt+Shift)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.altKey && e.key.toLowerCase() === 'k') || (e.altKey && e.shiftKey)) {
        toggleKeyboardLanguage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleKeyboardLanguage]);

  const dateFormatter = new Intl.DateTimeFormat('ar-LY', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const timeFormatter = new Intl.DateTimeFormat('ar-LY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const dateText = dateFormatter.format(now);
  const timeText = timeFormatter.format(now);

  return (
    <div className="w-full flex items-center justify-between px-6 pt-3 pb-2 select-none">
      {/* Date & Time Clock (Left in RTL) */}
      <div className="flex items-center gap-3">
        <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-amber-900/10 dark:border-amber-500/20 shadow-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-[#2D2424] dark:text-amber-300">{dateText}</span>
          <span className="text-[11px] text-[#5C524F] dark:text-slate-400 font-mono">({timeText})</span>
        </div>
      </div>

      {/* Brand Identity, Keyboard Language & Theme Toggle (Right in RTL) */}
      <div className="flex items-center gap-3">
        {children && <div className="flex items-center gap-2">{children}</div>}

        {/* In-app Keyboard Language Mode Switcher */}
        <button
          type="button"
          onClick={toggleKeyboardLanguage}
          title="التبديل بين لغة الكتابة العربية والإنجليزية (اختصار: Alt + K)"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer ${
            keyboardLanguage === 'ar'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300'
              : 'bg-blue-500/15 border-blue-500/40 text-blue-800 dark:text-blue-300'
          }`}
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span>{keyboardLanguage === 'ar' ? 'عربي (AR)' : 'English (EN)'}</span>
        </button>

        {/* Theme Switcher */}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'atelier' ? 'التبديل إلى الوضع الليلي' : 'التبديل إلى وضع النهار الفاخر'}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 dark:bg-slate-900/70 border border-amber-900/10 dark:border-amber-500/20 text-xs font-semibold text-[#2D2424] dark:text-amber-300 shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          {theme === 'atelier' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-600" />
              <span>النهار</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-amber-400" />
              <span>الليل</span>
            </>
          )}
        </button>

        {/* Brand Logo & Emblem */}
        <div className="flex items-center gap-2.5">
          <div className="text-right leading-tight">
            <h1 className="text-base font-extrabold text-[var(--text-primary)] dark:text-[#F3F4F6] tracking-tight transition-colors duration-200">
              الدفة للعطور
            </h1>
            <p className="text-[9px] font-bold text-[var(--text-muted)] dark:text-amber-400/80 tracking-[0.2em] uppercase transition-colors duration-200">
              ALDAFFA PERFUMES ERP
            </p>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-950 dark:to-slate-900 border border-amber-400/40 shadow-sm flex items-center justify-center">
            <FlaconEmblem className="w-6 h-6 text-amber-700 dark:text-amber-300" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;
