import React, { useEffect, useState } from 'react';
import { useUIStore } from '../../stores/useUIStore.js';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { useSettingsStore } from '../../stores/useSettingsStore.js';
import { SandboxEngine } from '../../database/SandboxEngine.js';
import { FlaconEmblem } from '../ui/FlaconIcons.jsx';
import { Sun, Moon, Keyboard, Sparkles, User, Lock, Users } from 'lucide-react';

/**
 * Organic Atelier Canopy Header
 * Features:
 * - Live Arabic Libyan Date/Time clock
 * - Sandbox/Demo Mode Indicator & 1-Click Purge (Permission Guarded)
 * - User Badge (Name & Arabic Role) with Quick Switcher Trigger
 * - Screen Lock Trigger Button
 * - Organic luxury flacon brand emblem with reactive Store Name
 * - In-app Keyboard Language Mode Switcher (عربي / EN)
 * - Theme Switcher (Daylight Atelier ☀️ / Nocturne Obsidian 🌙)
 * - Actions slot
 */
const Header = ({ children }) => {
  const [now, setNow] = useState(() => new Date());
  const [isSandbox, setIsSandbox] = useState(false);
  const theme = useUIStore((state) => state.theme);
  const toggleTheme = useUIStore((state) => state.toggleTheme);
  const keyboardLanguage = useUIStore((state) => state.keyboardLanguage);
  const toggleKeyboardLanguage = useUIStore((state) => state.toggleKeyboardLanguage);
  const showSuccess = useUIStore((state) => state.showSuccess);
  const showError = useUIStore((state) => state.showError);

  // Auth & Settings
  const currentUser = useAuthStore((state) => state.currentUser);
  const lockApp = useAuthStore((state) => state.lockApp);
  const openSwitchModal = useAuthStore((state) => state.openSwitchModal);
  const hasPermission = useAuthStore((state) => state.hasPermission);

  const storeName = useSettingsStore((state) => state.getSetting('store_name', 'الدفة للعطور'));
  const storeSubtitle = useSettingsStore(
    (state) => state.getSetting('store_subtitle', 'ALDAFFA PERFUMES ERP')
  );

  const roleLabels = {
    manager: 'المدير العام',
    accountant: 'المحاسب',
    cashier: 'كاشير'
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const active = await SandboxEngine.isSandboxActive();
        setIsSandbox(active);
      } catch (e) {}
    };
    check();
    window.addEventListener('aldaffa:data-refresh', check);
    return () => window.removeEventListener('aldaffa:data-refresh', check);
  }, []);

  const handleExitSandbox = async () => {
    try {
      await SandboxEngine.purgeDemoData();
      setIsSandbox(false);
      showSuccess('✅ تم إيقاف وضع التجربة وتطهير كافة البيانات الوهمية بنجاح.');
    } catch (e) {
      showError('خطأ أثناء إيقاف وضع التجربة: ' + e.message);
    }
  };

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
      {/* Date & Time Clock, Sandbox Badge & User Controls (Left in RTL) */}
      <div className="flex items-center gap-3">
        <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-amber-900/10 dark:border-amber-500/20 shadow-sm flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-[#2D2424] dark:text-amber-300">{dateText}</span>
          <span className="text-[11px] text-[#5C524F] dark:text-slate-400 font-mono">({timeText})</span>
        </div>

        {/* User Identity Badge with Click-to-Switch */}
        {currentUser && (
          <div className="flex items-center gap-1.5 bg-white/70 dark:bg-slate-900/70 border border-amber-900/10 dark:border-amber-500/20 rounded-full px-3 py-1 shadow-sm">
            <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300 flex items-center justify-center font-bold text-xs">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[#2D2424] dark:text-gray-100">
                {currentUser.name}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-bold border border-amber-500/30">
                {roleLabels[currentUser.role] || currentUser.role}
              </span>
            </div>

            <button
              type="button"
              onClick={openSwitchModal}
              title="تبديل المستخدم السريع"
              className="p-1 rounded-full hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 transition-colors cursor-pointer mr-1"
            >
              <Users className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={lockApp}
              title="قفل المنظومة برمز PIN"
              className="p-1 rounded-full hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {isSandbox && (
          <div className="flex items-center gap-2 bg-amber-500/20 border border-amber-500/50 px-3 py-1 rounded-full text-xs font-bold text-amber-800 dark:text-amber-300 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin" />
            <span>وضع التجربة (بيانات وهمية)</span>
            {hasPermission('purge_data') && (
              <button
                onClick={handleExitSandbox}
                className="bg-red-600 hover:bg-red-700 text-white text-[10px] px-2.5 py-0.5 rounded-full transition-all cursor-pointer font-bold shadow"
                title="إيقاف وضع التجربة وحذف كافة البيانات الوهمية"
              >
                تطهير وإيقاف
              </button>
            )}
          </div>
        )}
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
              {storeName}
            </h1>
            <p className="text-[9px] font-bold text-[var(--text-muted)] dark:text-amber-400/80 tracking-[0.2em] uppercase transition-colors duration-200">
              {storeSubtitle}
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

