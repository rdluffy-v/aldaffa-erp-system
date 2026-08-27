import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, KeyRound, ShieldCheck, UserCheck, AlertCircle, Delete } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { FlaconEmblem } from '../ui/FlaconIcons.jsx';
import { useSettingsStore } from '../../stores/useSettingsStore.js';

export const LockScreenModal = () => {
  const isLocked = useAuthStore((state) => state.isLocked);
  const currentUser = useAuthStore((state) => state.currentUser);
  const usersList = useAuthStore((state) => state.usersList);
  const unlockApp = useAuthStore((state) => state.unlockApp);
  const quickSwitchUser = useAuthStore((state) => state.quickSwitchUser);
  const storeName = useSettingsStore((state) => state.getSetting('store_name', 'الدفة للعطور'));

  const [selectedUser, setSelectedUser] = useState(currentUser || null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setSelectedUser(currentUser);
    }
  }, [currentUser]);

  const handleDigit = useCallback((digit) => {
    setError('');
    setPin((prev) => (prev.length < 6 ? prev + digit : prev));
  }, []);

  const handleDelete = useCallback(() => {
    setError('');
    setPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setError('');
    setPin('');
  }, []);

  const handleUnlock = useCallback(async () => {
    if (!pin) {
      setError('يرجى إدخال رمز PIN');
      return;
    }
    setLoading(true);
    setError('');
    try {
      let res;
      if (selectedUser) {
        res = await quickSwitchUser(selectedUser, pin);
      } else {
        res = await unlockApp(pin);
      }
      if (!res.success) {
        setError(res.error || 'رمز PIN غير صحيح');
        setPin('');
      } else {
        setPin('');
      }
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء فك القفل');
      setPin('');
    } finally {
      setLoading(false);
    }
  }, [pin, selectedUser, quickSwitchUser, unlockApp]);

  // Physical keyboard listener
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      } else if (e.key === 'Enter') {
        handleUnlock();
      } else if (e.key === 'Escape') {
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, handleDigit, handleDelete, handleUnlock, handleClear]);

  if (!isLocked) return null;

  const roleLabels = {
    manager: 'المدير العام',
    accountant: 'المحاسب',
    cashier: 'كاشير مناوب'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07090e]/90 backdrop-blur-xl p-4 select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 15 }}
        className="w-full max-w-md bg-[#12161f]/95 border border-amber-500/30 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] flex flex-col items-center gap-5 text-white"
      >
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 p-0.5 shadow-[0_0_25px_rgba(251,191,36,0.3)]">
            <div className="w-full h-full bg-[#12161f] rounded-[calc(1rem-2px)] flex items-center justify-center">
              <FlaconEmblem className="w-9 h-9 text-amber-400" />
            </div>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-black text-amber-300 tracking-wide">{storeName}</h2>
            <p className="text-xs text-gray-400 font-medium flex items-center justify-center gap-1.5 mt-0.5">
              <Lock className="w-3.5 h-3.5 text-amber-500" />
              <span>المنظومة مغلقة ومؤمنة برمز PIN</span>
            </p>
          </div>
        </div>

        {/* Staff Switch Pills */}
        {usersList && usersList.length > 0 && (
          <div className="w-full">
            <label className="text-[11px] font-bold text-gray-400 block mb-1.5 text-right">
              اختر الموظف لتسجيل الدخول:
            </label>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {usersList.map((u) => {
                const isSelected = selectedUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u);
                      setError('');
                      setPin('');
                    }}
                    className={`flex-1 min-w-[100px] p-2.5 rounded-2xl border transition-all flex flex-col items-center gap-1 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-500/60 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-400'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center text-xs font-bold">
                      {u.name ? u.name.charAt(0) : 'م'}
                    </div>
                    <span className="text-xs font-bold text-gray-200 truncate w-full text-center">
                      {u.name}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-amber-300 font-semibold">
                      {roleLabels[u.role] || u.role}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* PIN Dots Indicator */}
        <div className="w-full flex flex-col items-center gap-2">
          <div className="flex gap-3 my-2">
            {[0, 1, 2, 3].map((idx) => {
              const filled = pin.length > idx;
              return (
                <motion.div
                  key={idx}
                  animate={{ scale: filled ? 1.15 : 1 }}
                  className={`w-4 h-4 rounded-full border transition-all ${
                    filled
                      ? 'bg-amber-400 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]'
                      : 'bg-white/5 border-white/20'
                  }`}
                />
              );
            })}
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs font-bold text-red-400 flex items-center gap-1"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{error}</span>
            </motion.p>
          )}
        </div>

        {/* Keypad Grid (0-9, Clear, Delete) */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[280px]">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(String(num))}
              className="h-13 rounded-2xl bg-white/5 hover:bg-amber-500/20 active:bg-amber-500/30 border border-white/10 hover:border-amber-500/40 text-xl font-bold text-gray-100 hover:text-amber-300 transition-all cursor-pointer shadow-sm flex items-center justify-center"
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            className="h-13 rounded-2xl bg-white/5 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-xs font-bold text-gray-400 hover:text-red-300 transition-all cursor-pointer flex items-center justify-center"
          >
            مسح
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-13 rounded-2xl bg-white/5 hover:bg-amber-500/20 active:bg-amber-500/30 border border-white/10 hover:border-amber-500/40 text-xl font-bold text-gray-100 hover:text-amber-300 transition-all cursor-pointer shadow-sm flex items-center justify-center"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="h-13 rounded-2xl bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/40 text-gray-400 hover:text-amber-300 transition-all cursor-pointer flex items-center justify-center"
            title="حذف الرقم الأخير"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Unlock Action Button */}
        <button
          type="button"
          disabled={loading || pin.length === 0}
          onClick={handleUnlock}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-black text-sm shadow-[0_8px_20px_rgba(245,158,11,0.3)] hover:shadow-[0_8px_25px_rgba(245,158,11,0.5)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Unlock className="w-4 h-4" />
              <span>تسجيل الدخول وفك القفل</span>
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
};

export default LockScreenModal;
