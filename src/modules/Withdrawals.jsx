/**
 * ============================================================================
 * WITHDRAWALS MODULE - REFACTORED WITH REPOSITORY PATTERN + UI STORE
 * ============================================================================
 *
 * Features:
 * - WithdrawalsRepository for ALL data access
 * - useUIStore toasts (replaces alert/confirm) + custom confirm modal
 * - Date range filter (from / to)
 * - Summary totals (count, total, average, max)
 * - Loading skeletons + empty states
 *
 * Architecture reference: src/modules/POS.jsx
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { WithdrawalsRepository } from '../database/repositories/WithdrawalsRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate, generateId, safeParseFloat } from '../utils/helpers.js';
import useDebounce from '../hooks/useDebounce.js';

const withdrawalsRepo = new WithdrawalsRepository();

// Convert a YYYY-MM-DD date input into an ISO datetime (start/end of day)
const toStartISO = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

const toEndISO = (dateStr) => {
  const d = new Date(`${dateStr}T23:59:59.999`);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

const toDateInputValue = (date) => {
  const d = new Date(date);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const WithdrawalsModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  // Data
  const [withdrawals, setWithdrawals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Date range filter
  const [startDate, setStartDate] = useState(() => toDateInputValue(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState(() => toDateInputValue(Date.now()));

  // Search
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [recipient, setRecipient] = useState('');
  const [reason, setReason] = useState('');

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    loadWithdrawals();

    const handleRefresh = () => {
      loadWithdrawals();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, [startDate, endDate]);

  // ---------------------------------------------------------------
  // Load withdrawals + summary in the selected range
  // ---------------------------------------------------------------
  const loadWithdrawals = async () => {
    const startISO = toStartISO(startDate);
    const endISO = toEndISO(endDate);
    if (!startISO || !endISO) {
      showError('يرجى اختيار نطاق تاريخ صحيح');
      return;
    }

    setLoading(true);
    try {
      const [data, sum] = await Promise.all([
        withdrawalsRepo.getWithdrawalsInRange(startISO, endISO),
        withdrawalsRepo.getWithdrawalsSummary(startISO, endISO)
      ]);
      setWithdrawals(data);
      setSummary(sum);
    } catch (error) {
      showError(`خطأ في تحميل السحوبات: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------
  // Add withdrawal
  // ---------------------------------------------------------------
  const addWithdrawal = async () => {
    const amt = safeParseFloat(amount, NaN);
    if (isNaN(amt) || amt <= 0) {
      showError('يرجى إدخال مبلغ صحيح');
      return;
    }

    if (!reason.trim()) {
      showError('يرجى إدخال سبب السحب');
      return;
    }

    try {
      await withdrawalsRepo.create({
        id: generateId(),
        date: new Date().toISOString(),
        amount: amt,
        recipient: recipient.trim(),
        reason: reason.trim()
      });

      setAmount('');
      setRecipient('');
      setReason('');
      setShowAddModal(false);
      await loadWithdrawals();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
      }

      showSuccess(`✅ تم تسجيل السحب بنجاح\nالمبلغ: ${formatCurrency(amt)}`);
    } catch (error) {
      showError(`خطأ في تسجيل السحب: ${error.message}`);
    }
  };

  // ---------------------------------------------------------------
  // Delete withdrawal (via custom confirm modal)
  // ---------------------------------------------------------------
  const deleteWithdrawal = (withdrawal) => {
    setConfirmDelete({
      message: `هل أنت متأكد من حذف السحب بمبلغ ${formatCurrency(withdrawal.amount)}؟`,
      onConfirm: async () => {
        try {
          await withdrawalsRepo.delete(withdrawal.id);
          setConfirmDelete(null);
          await loadWithdrawals();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
          }
          showSuccess('✅ تم حذف السحب');
        } catch (error) {
          setConfirmDelete(null);
          showError(`خطأ في حذف السحب: ${error.message}`);
        }
      }
    });
  };

  // ---------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------
  const filteredWithdrawals = useMemo(() => {
    if (!debouncedSearch) return withdrawals;
    const term = debouncedSearch.toLowerCase();
    return withdrawals.filter(
      (w) =>
        (w.reason || '').toLowerCase().includes(term) ||
        (w.recipient || '').toLowerCase().includes(term)
    );
  }, [withdrawals, debouncedSearch]);

  const totalWithdrawals = withdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);

  // ===============================================================
  // RENDER
  // ===============================================================
  return (
    <div className="h-full flex flex-col glass-card p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>💸</span>
          <span>السحوبات النقدية</span>
        </h2>
        <div className="flex gap-3 flex-wrap">
          {/* Date range filter */}
          <div className="flex items-center gap-2 bg-gray-800 p-2 rounded-lg border border-gold/30">
            <span className="text-sm text-gray-400">من</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm"
            />
            <span className="text-sm text-gray-400">إلى</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm"
            />
          </div>
          <button onClick={loadWithdrawals} className="bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors">
            🔄
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-gold px-4 py-2"
          >
            ➕ سحب جديد
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">عدد السحوبات</div>
          <div className="text-2xl font-bold text-white mt-1">
            {summary?.total_withdrawals || 0}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">إجمالي السحوبات</div>
          <div className="text-2xl font-bold text-red-400 mt-1">
            {formatCurrency(summary?.total_amount || totalWithdrawals)}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">متوسط السحب</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">
            {formatCurrency(summary?.average_amount || 0)}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">أكبر سحب</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">
            {formatCurrency(summary?.max_amount || 0)}
          </div>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="🔍 بحث في السحوبات (السبب / المستلم)..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="mb-4 bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30 focus:outline-none focus:border-gold"
      />

      {/* Withdrawals list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          // Loading skeletons
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="h-5 bg-gray-700 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-gray-700 rounded w-1/2 mb-3"></div>
                <div className="h-8 bg-gray-700 rounded"></div>
              </div>
            ))}
          </div>
        ) : filteredWithdrawals.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="text-6xl mb-4">💸</div>
            <p className="text-xl mb-2">
              {debouncedSearch ? 'لا توجد نتائج مطابقة للبحث' : 'لا توجد سحوبات في هذه الفترة'}
            </p>
            <p className="text-sm">
              {debouncedSearch ? 'جرب كلمة بحث أخرى' : 'غيّر نطاق التاريخ أو أضف سحب جديد'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredWithdrawals.map((withdrawal) => (
              <div key={withdrawal.id} className="glass-card p-4 hover:border-gold/50 transition-all">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl font-bold text-red-400">
                        {formatCurrency(withdrawal.amount)}
                      </span>
                      <span className="text-xs bg-red-600/20 text-red-400 px-2 py-1 rounded">
                        سحب
                      </span>
                    </div>
                    <div className="text-sm text-gray-400">{formatDate(withdrawal.date)}</div>
                  </div>
                  <button
                    onClick={() => deleteWithdrawal(withdrawal)}
                    className="text-red-500 hover:text-red-400 text-xl"
                  >
                    🗑️
                  </button>
                </div>

                <div className="space-y-2 bg-gray-800/50 p-3 rounded">
                  <div className="flex items-start gap-2">
                    <span className="text-gray-400 min-w-[80px]">السبب:</span>
                    <span className="font-bold">{withdrawal.reason}</span>
                  </div>
                  {withdrawal.recipient && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 min-w-[80px]">المستلم:</span>
                      <span>{withdrawal.recipient}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Withdrawal Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[500px]">
            <h2 className="text-2xl font-bold text-gold mb-4">سحب نقدي جديد</h2>
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">المبلغ *</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  min="0"
                  step="0.01"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">المستلم (اختياري)</label>
                <input
                  type="text"
                  placeholder="اسم المستلم..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">السبب *</label>
                <textarea
                  placeholder="سبب السحب..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 h-24 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={addWithdrawal} className="flex-1 btn-gold py-3">
                ✅ تسجيل السحب
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setAmount('');
                  setRecipient('');
                  setReason('');
                }}
                className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg font-bold hover:bg-gray-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirm Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]" dir="rtl">
          <div className="glass-card p-6 w-[420px]">
            <h2 className="text-xl font-bold text-gold mb-4">⚠️ تأكيد الحذف</h2>
            <p className="text-gray-300 mb-6">{confirmDelete.message}</p>
            <div className="flex gap-3">
              <button
                onClick={confirmDelete.onConfirm}
                className="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg font-bold hover:bg-red-700 transition-colors"
              >
                نعم، حذف
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg font-bold hover:bg-gray-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WithdrawalsModule;
