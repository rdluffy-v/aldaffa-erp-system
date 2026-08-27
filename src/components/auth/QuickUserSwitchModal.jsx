import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Lock, X, Check, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { useUIStore } from '../../stores/useUIStore.js';

export const QuickUserSwitchModal = () => {
  const isSwitchModalOpen = useAuthStore((state) => state.isSwitchModalOpen);
  const closeSwitchModal = useAuthStore((state) => state.closeSwitchModal);
  const currentUser = useAuthStore((state) => state.currentUser);
  const usersList = useAuthStore((state) => state.usersList);
  const quickSwitchUser = useAuthStore((state) => state.quickSwitchUser);
  const { showSuccess, showError } = useUIStore();

  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isSwitchModalOpen) return null;

  const roleLabels = {
    manager: 'المدير العام',
    accountant: 'المحاسب',
    cashier: 'كاشير مناوب'
  };

  const handleSelectUser = (u) => {
    setSelectedUser(u);
    setPin('');
    setError('');
  };

  const handleConfirmSwitch = async (e) => {
    if (e) e.preventDefault();
    if (!selectedUser) {
      setError('يرجى تحديد الموظف أولاً');
      return;
    }
    if (!pin) {
      setError('يرجى إدخال رمز PIN للموظف');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await quickSwitchUser(selectedUser, pin);
      if (res.success) {
        showSuccess(`تم تبديل المستخدم إلى: ${res.user.name}`);
        closeSwitchModal();
      } else {
        setError(res.error || 'رمز PIN غير صحيح');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-md bg-[#161b22] border border-amber-500/30 rounded-3xl p-6 shadow-2xl text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-100">تبديل المستخدم السريع</h3>
              <p className="text-xs text-gray-400">اختر الموظف وأدخل رمز PIN للمتابعة</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeSwitchModal}
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Selection List */}
        <div className="my-4 space-y-2">
          <label className="text-xs font-bold text-gray-300 block text-right">
            اختر الحساب المستهدف:
          </label>
          <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
            {usersList.map((u) => {
              const isCurrent = currentUser?.id === u.id;
              const isSelected = selectedUser?.id === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleSelectUser(u)}
                  className={`w-full p-3 rounded-2xl border transition-all flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-500/60 shadow-sm'
                      : 'bg-white/5 border-white/5 hover:bg-white/10 text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold text-sm">
                      {u.name ? u.name.charAt(0) : 'م'}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-gray-100 flex items-center gap-2">
                        <span>{u.name}</span>
                        {isCurrent && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">
                            الحالي
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {roleLabels[u.role] || u.role}
                      </span>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-amber-400" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* PIN Input if Selected */}
        {selectedUser && (
          <form onSubmit={handleConfirmSwitch} className="space-y-3 pt-2 border-t border-white/10">
            <div>
              <label className="text-xs font-bold text-gray-300 block mb-1.5 text-right">
                أدخل رمز PIN للموظف ({selectedUser.name}):
              </label>
              <div className="relative">
                <input
                  type="password"
                  maxLength={6}
                  autoFocus
                  value={pin}
                  onChange={(e) => {
                    setError('');
                    setPin(e.target.value);
                  }}
                  placeholder="••••"
                  className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 focus:border-amber-500 text-center text-lg font-mono text-white tracking-widest outline-none transition-colors"
                />
                <Lock className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {error && (
              <p className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={loading || !pin}
                className="flex-1 py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {loading ? 'جاري التحقق...' : 'تأكيد التبديل'}
              </button>
              <button
                type="button"
                onClick={closeSwitchModal}
                className="px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold transition-all cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
};

export default QuickUserSwitchModal;
