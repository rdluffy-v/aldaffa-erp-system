/**
 * ============================================================================
 * CAPITAL INJECTIONS MODULE - REFACTORED WITH REPOSITORY PATTERN + UI STORE
 * ============================================================================
 *
 * Features:
 * - CapitalRepository for ALL data access
 * - useUIStore toasts (replaces alert/confirm) + custom confirm modal
 * - Date range filter (from / to)
 * - Donor history (donor chips + filter by donor)
 * - Summary totals (count, total, average, max, unique donors)
 * - Loading skeletons + empty states
 *
 * Architecture reference: src/modules/POS.jsx
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { CapitalRepository } from '../database/repositories/CapitalRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate, generateId, safeParseFloat } from '../utils/helpers.js';
import useDebounce from '../hooks/useDebounce.js';

const capitalRepo = new CapitalRepository();

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

const CapitalInjectionsModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  // Data
  const [injections, setInjections] = useState([]);
  const [summary, setSummary] = useState(null);
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);

  // Date range filter
  const [startDate, setStartDate] = useState(() => toDateInputValue(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState(() => toDateInputValue(Date.now()));

  // Donor filter (donor history)
  const [donorFilter, setDonorFilter] = useState('');

  // Search
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [donorName, setDonorName] = useState('');
  const [donorPhone, setDonorPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    loadInjections();
  }, [startDate, endDate]);

  useEffect(() => {
    loadDonors();
  }, []);

  // ---------------------------------------------------------------
  // Load injections + summary in the selected range
  // ---------------------------------------------------------------
  const loadInjections = async () => {
    const startISO = toStartISO(startDate);
    const endISO = toEndISO(endDate);
    if (!startISO || !endISO) {
      showError('يرجى اختيار نطاق تاريخ صحيح');
      return;
    }

    setLoading(true);
    try {
      const [data, sum] = await Promise.all([
        capitalRepo.getInjectionsInRange(startISO, endISO),
        capitalRepo.getCapitalSummary(startISO, endISO)
      ]);
      setInjections(data);
      setSummary(sum);
    } catch (error) {
      showError(`خطأ في تحميل عمليات الضخ: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadDonors = async () => {
    try {
      const data = await capitalRepo.getDonors();
      setDonors(data);
    } catch (error) {
      console.warn('Failed to load donors:', error.message);
    }
  };

  // ---------------------------------------------------------------
  // Add capital injection
  // ---------------------------------------------------------------
  const addInjection = async () => {
    const amt = safeParseFloat(amount, NaN);
    if (isNaN(amt) || amt <= 0) {
      showError('يرجى إدخال مبلغ صحيح');
      return;
    }

    try {
      await capitalRepo.create({
        id: generateId(),
        date: new Date().toISOString(),
        donor_name: donorName.trim(),
        donor_phone: donorPhone.trim(),
        amount: amt,
        notes: notes.trim()
      });

      setAmount('');
      setDonorName('');
      setDonorPhone('');
      setNotes('');
      setShowAddModal(false);
      await loadInjections();
      await loadDonors();

      showSuccess(`✅ تم تسجيل الضخ الرأسمالي بنجاح\nالمبلغ: ${formatCurrency(amt)}`);
    } catch (error) {
      showError(`خطأ في تسجيل الضخ: ${error.message}`);
    }
  };

  // ---------------------------------------------------------------
  // Delete injection (via custom confirm modal)
  // ---------------------------------------------------------------
  const deleteInjection = (injection) => {
    setConfirmDelete({
      message: `هل أنت متأكد من حذف الضخ بمبلغ ${formatCurrency(injection.amount)}؟`,
      onConfirm: async () => {
        try {
          await capitalRepo.delete(injection.id);
          setConfirmDelete(null);
          await loadInjections();
          await loadDonors();
          showSuccess('✅ تم حذف الضخ');
        } catch (error) {
          setConfirmDelete(null);
          showError(`خطأ في حذف الضخ: ${error.message}`);
        }
      }
    });
  };

  // ---------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------
  const filteredInjections = useMemo(() => {
    let result = injections;

    // Donor history filter
    if (donorFilter) {
      result = result.filter((i) => i.donor_name === donorFilter);
    }

    // Search filter
    if (debouncedSearch) {
      const term = debouncedSearch.toLowerCase();
      result = result.filter(
        (i) =>
          (i.donor_name || '').toLowerCase().includes(term) ||
          (i.donor_phone || '').toLowerCase().includes(term) ||
          (i.notes || '').toLowerCase().includes(term)
      );
    }

    return result;
  }, [injections, donorFilter, debouncedSearch]);

  const totalInjections = injections.reduce((sum, i) => sum + (i.amount || 0), 0);

  // ===============================================================
  // RENDER
  // ===============================================================
  return (
    <div className="h-full flex flex-col glass-card p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>💰</span>
          <span>الضخ الرأسمالي</span>
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
          <button onClick={loadInjections} className="bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors">
            🔄
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-gold px-4 py-2"
          >
            ➕ ضخ جديد
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">عدد عمليات الضخ</div>
          <div className="text-2xl font-bold text-white mt-1">
            {summary?.total_injections || 0}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">إجمالي الضخ</div>
          <div className="text-2xl font-bold text-green-400 mt-1">
            {formatCurrency(summary?.total_capital || totalInjections)}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">متوسط الضخ</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">
            {formatCurrency(summary?.average_amount || 0)}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">عدد المانحين</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">
            {summary?.unique_donors || 0}
          </div>
        </div>
      </div>

      {/* Donor history chips */}
      <div className="mb-4">
        <div className="text-sm text-gray-400 mb-2">سجل المانحين:</div>
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-2">
          <button
            onClick={() => setDonorFilter('')}
            className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-all ${
              donorFilter === ''
                ? 'bg-gradient-to-r from-gold to-gold-dark text-navy'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            الكل ({injections.length})
          </button>
          {donors.map((donor) => (
            <button
              key={donor.donor_name}
              onClick={() => setDonorFilter(donor.donor_name)}
              className={`px-4 py-2 rounded-lg font-bold whitespace-nowrap transition-all ${
                donorFilter === donor.donor_name
                  ? 'bg-gradient-to-r from-gold to-gold-dark text-navy'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              {donor.donor_name} · {formatCurrency(donor.total_amount)}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="🔍 بحث في عمليات الضخ (المانح / الهاتف / ملاحظات)..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="mb-4 bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30 focus:outline-none focus:border-gold"
      />

      {/* Injections list */}
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
        ) : filteredInjections.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="text-6xl mb-4">💰</div>
            <p className="text-xl mb-2">
              {debouncedSearch || donorFilter
                ? 'لا توجد نتائج مطابقة للتصفية'
                : 'لا توجد عمليات ضخ في هذه الفترة'}
            </p>
            <p className="text-sm">
              {debouncedSearch || donorFilter
                ? 'غيّر التصفية أو كلمة البحث'
                : 'غيّر نطاق التاريخ أو أضف ضخ جديد'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredInjections.map((injection) => (
              <div key={injection.id} className="glass-card p-4 hover:border-gold/50 transition-all">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl font-bold text-green-400">
                        {formatCurrency(injection.amount)}
                      </span>
                      <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">
                        ضخ
                      </span>
                      {donorFilter === '' && injection.donor_name && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDonorFilter(injection.donor_name);
                          }}
                          className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded hover:bg-blue-600/30"
                        >
                          👤 {injection.donor_name}
                        </button>
                      )}
                    </div>
                    <div className="text-sm text-gray-400">{formatDate(injection.date)}</div>
                  </div>
                  <button
                    onClick={() => deleteInjection(injection)}
                    className="text-red-500 hover:text-red-400 text-xl"
                  >
                    🗑️
                  </button>
                </div>

                <div className="space-y-2 bg-gray-800/50 p-3 rounded">
                  {injection.donor_name && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 min-w-[80px]">المانح:</span>
                      <span className="font-bold">{injection.donor_name}</span>
                    </div>
                  )}
                  {injection.donor_phone && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 min-w-[80px]">الهاتف:</span>
                      <span>{injection.donor_phone}</span>
                    </div>
                  )}
                  {injection.notes && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 min-w-[80px]">ملاحظات:</span>
                      <span className="text-sm">{injection.notes}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Injection Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[500px]">
            <h2 className="text-2xl font-bold text-gold mb-4">ضخ رأسمالي جديد</h2>
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
                <label className="text-sm text-gray-400 mb-1 block">اسم المانح (اختياري)</label>
                <input
                  type="text"
                  placeholder="اسم المانح..."
                  value={donorName}
                  onChange={(e) => setDonorName(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">رقم الهاتف (اختياري)</label>
                <input
                  type="tel"
                  placeholder="رقم هاتف المانح..."
                  value={donorPhone}
                  onChange={(e) => setDonorPhone(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">ملاحظات</label>
                <textarea
                  placeholder="ملاحظات إضافية..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 h-24 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={addInjection} className="flex-1 btn-gold py-3">
                ✅ تسجيل الضخ
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setAmount('');
                  setDonorName('');
                  setDonorPhone('');
                  setNotes('');
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

export default CapitalInjectionsModule;
