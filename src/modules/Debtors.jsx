/**
 * ============================================================================
 * DEBTORS MODULE - REFACTORED WITH REPOSITORY PATTERN + UI STORE
 * ============================================================================
 *
 * Features:
 * - DebtorsRepository for ALL data access
 * - useUIStore toasts (replaces alert/confirm) + custom confirm modal
 * - Payment history timeline (visual vertical timeline)
 * - Debt aging view (0-30 / 31-60 / 61-90 / 90+ days buckets)
 * - Payment summary per debtor
 * - Loading skeletons + empty states
 *
 * Architecture reference: src/modules/POS.jsx
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { DebtorsRepository } from '../database/repositories/DebtorsRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useAuthStore } from '../stores/useAuthStore.js';
import { formatCurrency, formatDate, generateId, safeParseFloat } from '../utils/helpers.js';
import useDebounce from '../hooks/useDebounce.js';

const debtorsRepo = new DebtorsRepository();

const DebtorsModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const currentUser = useAuthStore((s) => s.currentUser);
  const canDeleteDebts = currentUser?.role === 'manager' || hasPermission('delete_invoice');

  // Data
  const [debtors, setDebtors] = useState([]);
  const [selectedDebtor, setSelectedDebtor] = useState(null);
  const [debtHistory, setDebtHistory] = useState([]);
  const [paymentSummary, setPaymentSummary] = useState([]);
  const [agingReport, setAgingReport] = useState([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'aging'

  // Modals
  const [showAddDebtor, setShowAddDebtor] = useState(false);
  const [showAddTransaction, setShowAddTransaction] = useState(false);

  // Confirm delete modal state
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Search
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Form states
  const [newDebtorName, setNewDebtorName] = useState('');
  const [newDebtorPhone, setNewDebtorPhone] = useState('');
  const [transactionAmount, setTransactionAmount] = useState('');
  const [transactionType, setTransactionType] = useState('debt');
  const [transactionDescription, setTransactionDescription] = useState('');

  useEffect(() => {
    loadDebtors();
  }, []);

  // ---------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------
  const loadDebtors = async () => {
    setLoading(true);
    try {
      const data = await debtorsRepo.getAllDebtors();
      setDebtors(data);
    } catch (error) {
      showError(`خطأ في تحميل العملاء: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadAgingReport = async () => {
    try {
      const data = await debtorsRepo.getDebtAgingReport();
      setAgingReport(data);
    } catch (error) {
      showError(`خطأ في تحميل تقرير التقادم: ${error.message}`);
    }
  };

  const loadDebtorHistory = async (debtorId) => {
    const history = await debtorsRepo.getDebtorHistory(debtorId);
    setDebtHistory(history);
  };

  const loadPaymentSummary = async (debtorId) => {
    const summary = await debtorsRepo.getPaymentSummary(debtorId);
    setPaymentSummary(summary);
  };

  const selectDebtor = async (debtor) => {
    setSelectedDebtor(debtor);
    setLoadingHistory(true);
    try {
      await loadDebtorHistory(debtor.id);
      await loadPaymentSummary(debtor.id);
    } catch (error) {
      showError(`خطأ في تحميل سجل العميل: ${error.message}`);
    } finally {
      setLoadingHistory(false);
    }
  };

  // ---------------------------------------------------------------
  // Add debtor
  // ---------------------------------------------------------------
  const addDebtor = async () => {
    if (!newDebtorName.trim()) {
      showError('يرجى إدخال اسم العميل');
      return;
    }

    try {
      await debtorsRepo.create({
        id: generateId(),
        name: newDebtorName.trim(),
        phone: newDebtorPhone.trim(),
        total_debt: 0
      });

      setNewDebtorName('');
      setNewDebtorPhone('');
      setShowAddDebtor(false);
      await loadDebtors();

      showSuccess('✅ تم إضافة العميل بنجاح');
    } catch (error) {
      showError(`خطأ في إضافة العميل: ${error.message}`);
    }
  };

  // ---------------------------------------------------------------
  // Add debt / payment transaction
  // ---------------------------------------------------------------
  const addTransaction = async () => {
    if (!selectedDebtor) return;

    const amount = safeParseFloat(transactionAmount, NaN);
    if (isNaN(amount) || amount <= 0) {
      showError('يرجى إدخال مبلغ صحيح');
      return;
    }

    try {
      // NOTE: the locked `debt_history` schema has no description column,
      // so only supported fields are persisted (description stays UI-only).
      const updatedDebtor = await debtorsRepo.addDebtTransaction(selectedDebtor.id, {
        id: generateId(),
        debtor_id: selectedDebtor.id,
        date: new Date().toISOString(),
        type: transactionType,
        amount
      });

      setTransactionAmount('');
      setTransactionDescription('');
      setShowAddTransaction(false);
      await loadDebtors();

      setSelectedDebtor(updatedDebtor);
      await loadDebtorHistory(selectedDebtor.id);
      await loadPaymentSummary(selectedDebtor.id);

      showSuccess(
        `✅ تم ${transactionType === 'debt' ? 'تسجيل الدين' : 'تسجيل الدفعة'} بنجاح`
      );
    } catch (error) {
      showError(`خطأ في تسجيل العملية: ${error.message}`);
    }
  };

  useEffect(() => {
    loadDebtors();

    const handleRefresh = () => {
      loadDebtors();
      if (selectedDebtor) {
        loadDebtHistory(selectedDebtor.id);
        loadPaymentSummary(selectedDebtor.id);
      }
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, []);

  // ---------------------------------------------------------------
  // Delete debtor (via custom confirm modal)
  // ---------------------------------------------------------------
  const deleteDebtor = (debtor) => {
    if (!canDeleteDebts) {
      showError('حذف حسابات العملاء مخصص للمدير العام فقط.');
      return;
    }
    setConfirmDelete({
      message:
        debtor.total_debt !== 0
          ? `العميل "${debtor.name}" لديه رصيد دين (${formatCurrency(debtor.total_debt)}). هل أنت متأكد من حذف العميل وسجل ديونه بالكامل نهائياً؟`
          : `هل أنت متأكد من حذف العميل "${debtor.name}"؟`,
      onConfirm: async () => {
        try {
          await db.run('DELETE FROM debt_history WHERE debtor_id = ?', [debtor.id]);
          await debtorsRepo.delete(debtor.id);
          setConfirmDelete(null);
          await loadDebtors();
          if (selectedDebtor?.id === debtor.id) {
            setSelectedDebtor(null);
            setDebtHistory([]);
            setPaymentSummary([]);
          }
          showSuccess('✅ تم حذف العميل وسجلاته بنجاح');
        } catch (error) {
          setConfirmDelete(null);
          showError(`خطأ في حذف العميل: ${error.message}`);
        }
      }
    });
  };

  // ---------------------------------------------------------------
  // Delete individual debt history record
  // ---------------------------------------------------------------
  const deleteHistoryRecord = (record) => {
    if (!canDeleteDebts) {
      showError('حذف حركات الديون مخصص للمدير العام فقط.');
      return;
    }
    if (!selectedDebtor) return;
    setConfirmDelete({
      message: `هل أنت متأكد من حذف حركة (${record.type === 'debt' ? 'الدين' : 'الدفعة'}) بقيمة ${formatCurrency(record.amount)}؟ سيتم تعديل رصيد العميل تلقائياً.`,
      onConfirm: async () => {
        try {
          const delta = record.type === 'debt' ? -record.amount : record.amount;
          await db.run('DELETE FROM debt_history WHERE id = ?', [record.id]);
          await db.run('UPDATE debtors SET total_debt = MAX(0, total_debt + ?) WHERE id = ?', [delta, selectedDebtor.id]);
          setConfirmDelete(null);
          await loadDebtors();
          await loadDebtHistory(selectedDebtor.id);
          await loadPaymentSummary(selectedDebtor.id);
          showSuccess('✅ تم حذف الحركة وتحديث رصيد العميل');
        } catch (err) {
          setConfirmDelete(null);
          showError(`فشل حذف الحركة: ${err.message}`);
        }
      }
    });
  };

  // ---------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------
  const filteredDebtors = useMemo(() => {
    if (!debouncedSearch) return debtors;
    const term = debouncedSearch.toLowerCase();
    return debtors.filter(
      (d) =>
        d.name.toLowerCase().includes(term) ||
        (d.phone || '').toLowerCase().includes(term)
    );
  }, [debtors, debouncedSearch]);

  const totalDebt = debtors.reduce((sum, d) => sum + (d.total_debt || 0), 0);

  // Aging buckets: 0-30 current, 31-60 late, 61-90 very late, 90+ critical
  const agingBuckets = useMemo(() => {
    const buckets = [
      { key: 'current', label: 'حالي (0-30 يوم)', min: 0, max: 30, color: 'text-green-400', bg: 'bg-green-600/20', count: 0, total: 0 },
      { key: 'late31', label: 'متأخر (31-60 يوم)', min: 31, max: 60, color: 'text-yellow-400', bg: 'bg-yellow-600/20', count: 0, total: 0 },
      { key: 'late61', label: 'متأخر جداً (61-90 يوم)', min: 61, max: 90, color: 'text-orange-400', bg: 'bg-orange-600/20', count: 0, total: 0 },
      { key: 'overdue', label: 'خطير (90+ يوم)', min: 91, max: Infinity, color: 'text-red-400', bg: 'bg-red-600/20', count: 0, total: 0 }
    ];

    for (const row of agingReport) {
      const days = row.days_outstanding || 0;
      const bucket = buckets.find((b) => days >= b.min && days <= b.max) || buckets[3];
      bucket.count += 1;
      bucket.total += row.total_debt || 0;
    }

    return buckets;
  }, [agingReport]);

  // Payment summary totals for the selected debtor
  const debtSummaryTotal = paymentSummary.find((s) => s.type === 'debt')?.total_amount || 0;
  const paymentSummaryTotal = paymentSummary.find((s) => s.type === 'payment')?.total_amount || 0;

  // ===============================================================
  // RENDER
  // ===============================================================
  return (
    <div className="h-full flex gap-6">
      {/* Debtors / Aging List */}
      <div className="flex-1 flex flex-col glass-card p-6">
        <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
          <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
            <span>💳</span>
            <span>{viewMode === 'list' ? 'العملاء المدينون' : 'تقادم الديون'}</span>
          </h2>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setViewMode('list');
                setSearchTerm('');
              }}
              className={`px-4 py-2 rounded-lg font-bold transition-all ${
                viewMode === 'list'
                  ? 'bg-gradient-to-r from-gold to-gold-dark text-navy'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              العملاء
            </button>
            <button
              onClick={() => {
                setViewMode('aging');
                loadAgingReport();
              }}
              className={`px-4 py-2 rounded-lg font-bold transition-all ${
                viewMode === 'aging'
                  ? 'bg-gradient-to-r from-gold to-gold-dark text-navy'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              تقادم الديون
            </button>
            {viewMode === 'list' && (
              <button
                onClick={() => setShowAddDebtor(true)}
                className="btn-gold px-4 py-2"
              >
                ➕ عميل جديد
              </button>
            )}
          </div>
        </div>

        {viewMode === 'list' && (
          <>
            <div className="bg-gray-800 p-4 rounded-lg mb-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">إجمالي الديون:</span>
                <span className="text-2xl font-bold text-red-400">{formatCurrency(totalDebt)}</span>
              </div>
            </div>

            <input
              type="text"
              placeholder="🔍 بحث في العملاء (الاسم / الهاتف)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mb-4 bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30 focus:outline-none focus:border-gold"
            />
          </>
        )}

        {viewMode === 'aging' ? (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {/* Aging bucket summary cards */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {agingBuckets.map((bucket) => (
                <div key={bucket.key} className={`${bucket.bg} p-3 rounded-lg`}>
                  <div className={`text-sm font-bold ${bucket.color}`}>{bucket.label}</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {formatCurrency(bucket.total)}
                  </div>
                  <div className="text-xs text-gray-400">{bucket.count} عميل</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {agingReport.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-gray-500 py-12">
                  <div className="text-6xl mb-4">⏳</div>
                  <p className="text-xl">لا توجد ديون تقادم</p>
                  <p className="text-sm">جميع العملاء سددوا ديونهم</p>
                </div>
              ) : (
                agingReport.map((row) => {
                  const days = row.days_outstanding || 0;
                  const bucket = agingBuckets.find((b) => days >= b.min && days <= b.max) || agingBuckets[3];
                  return (
                    <div
                      key={row.id}
                      onClick={() => {
                        setViewMode('list');
                        selectDebtor(row);
                      }}
                      className="glass-card p-4 cursor-pointer hover:border-gold/50 transition-all"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-gold text-lg">{row.name}</h3>
                          {row.phone && <p className="text-sm text-gray-400">📱 {row.phone}</p>}
                          <div className="text-xs text-gray-500 mt-1">
                            آخر عملية: {row.last_transaction_date ? formatDate(row.last_transaction_date) : '—'}
                          </div>
                        </div>
                        <div className="text-left">
                          <div className={`text-lg font-bold ${bucket.color}`}>
                            {formatCurrency(row.total_debt)}
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${bucket.bg} ${bucket.color}`}>
                            {days} يوم
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : loading ? (
          // Loading skeletons
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="h-5 bg-gray-700 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-gray-700 rounded w-1/4"></div>
              </div>
            ))}
          </div>
        ) : filteredDebtors.length === 0 ? (
          // Empty state
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <div className="text-6xl mb-4">💳</div>
            <p className="text-xl mb-2">
              {debouncedSearch ? 'لا توجد نتائج مطابقة' : 'لا يوجد عملاء مسجلون'}
            </p>
            <p className="text-sm">
              {debouncedSearch ? 'جرب كلمة بحث أخرى' : 'أضف عميل جديد للبدء'}
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2">
            {filteredDebtors.map((debtor) => (
              <div
                key={debtor.id}
                onClick={() => selectDebtor(debtor)}
                className={`glass-card p-4 cursor-pointer transition-all ${
                  selectedDebtor?.id === debtor.id
                    ? 'border-2 border-gold'
                    : 'hover:border-gold/50'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-bold text-gold text-lg">{debtor.name}</h3>
                    {debtor.phone && <p className="text-sm text-gray-400">📱 {debtor.phone}</p>}
                  </div>
                  <div className="text-left">
                    <div
                      className={`text-xl font-bold ${
                        debtor.total_debt > 0 ? 'text-red-400' : 'text-green-400'
                      }`}
                    >
                      {formatCurrency(debtor.total_debt)}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDebtor(debtor);
                      }}
                      className="text-xs text-red-500 hover:text-red-400 mt-1 flex items-center gap-1 cursor-pointer transition-colors"
                      title="حذف العميل وسجلاته"
                    >
                      <span>🗑️</span>
                      <span>حذف</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Debtor Details */}
      <div className="w-[520px] flex flex-col glass-card p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gold">تفاصيل العميل</h2>
          {selectedDebtor && (
            <button
              type="button"
              onClick={() => deleteDebtor(selectedDebtor)}
              className="text-xs bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all cursor-pointer"
              title="حذف هذا العميل"
            >
              <span>🗑️</span>
              <span>حذف العميل</span>
            </button>
          )}
        </div>

        {!selectedDebtor ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2">
            <div className="text-5xl">👤</div>
            <p>اختر عميل من القائمة لعرض تفاصيله</p>
          </div>
        ) : (
          <>
            <div className="bg-gray-800 p-4 rounded-lg mb-4">
              <div className="flex justify-between mb-3">
                <span className="text-gray-400">الاسم:</span>
                <span className="font-bold">{selectedDebtor.name}</span>
              </div>
              {selectedDebtor.phone && (
                <div className="flex justify-between mb-3">
                  <span className="text-gray-400">الهاتف:</span>
                  <span>{selectedDebtor.phone}</span>
                </div>
              )}
              <div className="flex justify-between text-xl border-t border-gold/30 pt-3">
                <span className="text-gray-400">الرصيد:</span>
                <span
                  className={`font-bold ${
                    selectedDebtor.total_debt > 0 ? 'text-red-400' : 'text-green-400'
                  }`}
                >
                  {formatCurrency(selectedDebtor.total_debt)}
                </span>
              </div>

              {/* Payment summary */}
              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-700">
                <div className="bg-red-600/10 border border-red-400/20 p-2 rounded text-center">
                  <div className="text-xs text-gray-400">إجمالي الديون المسجلة</div>
                  <div className="text-sm font-bold text-red-400">{formatCurrency(debtSummaryTotal)}</div>
                </div>
                <div className="bg-green-600/10 border border-green-400/20 p-2 rounded text-center">
                  <div className="text-xs text-gray-400">إجمالي المدفوعات</div>
                  <div className="text-sm font-bold text-green-400">{formatCurrency(paymentSummaryTotal)}</div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => {
                  setTransactionType('debt');
                  setShowAddTransaction(true);
                }}
                className="flex-1 bg-red-600 text-white px-4 py-3 rounded-lg font-bold hover:bg-red-700 transition-colors"
              >
                ➕ دين جديد
              </button>
              <button
                onClick={() => {
                  setTransactionType('payment');
                  setShowAddTransaction(true);
                }}
                className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg font-bold hover:bg-green-700 transition-colors"
              >
                💰 تسجيل دفعة
              </button>
            </div>

            <h3 className="text-lg font-bold text-gold mb-3">سجل العمليات (خط زمني)</h3>

            {/* Payment history timeline */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {loadingHistory ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-3 h-3 rounded-full bg-gray-700 mt-1"></div>
                      <div className="flex-1 bg-gray-800 p-3 rounded-lg">
                        <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
                        <div className="h-3 bg-gray-700 rounded w-1/3"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : debtHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-gray-500 py-8">
                  <div className="text-5xl mb-3">📋</div>
                  <p>لا توجد عمليات مسجلة لهذا العميل</p>
                </div>
              ) : (
                <div className="relative pr-4 space-y-3 border-r-2 border-gold/20">
                  {debtHistory.map((record, index) => (
                    <div key={record.id} className="relative">
                      {/* Timeline dot */}
                      <span
                        className={`absolute -right-4 top-3 w-3 h-3 rounded-full border-2 border-navy ${
                          record.type === 'debt' ? 'bg-red-400' : 'bg-green-400'
                        }`}
                      ></span>
                      <div className="bg-gray-800 p-3 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xl ${
                                record.type === 'debt' ? 'text-red-400' : 'text-green-400'
                              }`}
                            >
                              {record.type === 'debt' ? '📥' : '💵'}
                            </span>
                            <div>
                              <div className="font-bold">
                                {record.type === 'debt' ? 'دين' : 'دفعة'}
                              </div>
                              <div className="text-xs text-gray-400">{formatDate(record.date)}</div>
                            </div>
                          </div>
                          <div
                            className={`text-lg font-bold ${
                              record.type === 'debt' ? 'text-red-400' : 'text-green-400'
                            }`}
                          >
                            {record.type === 'debt' ? '+' : '-'}
                            {formatCurrency(record.amount)}
                          </div>
                        </div>
                        {record.invoice_id && (
                          <div className="text-xs text-blue-400 mt-1">
                            فاتورة #{record.invoice_id}
                          </div>
                        )}
                        <div className="flex justify-end mt-2 pt-1 border-t border-gray-700/50">
                          <button
                            type="button"
                            onClick={() => deleteHistoryRecord(record)}
                            className="text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 px-2 py-0.5 rounded transition-all cursor-pointer flex items-center gap-1"
                            title="حذف هذه الحركة"
                          >
                            <span>🗑️ حذف الحركة</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Add Debtor Modal */}
      {showAddDebtor && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[500px]">
            <h2 className="text-2xl font-bold text-gold mb-4">إضافة عميل جديد</h2>
            <div className="space-y-3 mb-6">
              <input
                type="text"
                placeholder="اسم العميل *"
                value={newDebtorName}
                onChange={(e) => setNewDebtorName(e.target.value)}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                autoFocus
              />
              <input
                type="tel"
                placeholder="رقم الهاتف (اختياري)"
                value={newDebtorPhone}
                onChange={(e) => setNewDebtorPhone(e.target.value)}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={addDebtor} className="flex-1 btn-gold py-3">
                ✅ حفظ
              </button>
              <button
                onClick={() => {
                  setShowAddDebtor(false);
                  setNewDebtorName('');
                  setNewDebtorPhone('');
                }}
                className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg font-bold hover:bg-gray-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showAddTransaction && selectedDebtor && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[500px]">
            <h2 className="text-2xl font-bold text-gold mb-4">
              {transactionType === 'debt' ? '➕ دين جديد' : '💰 تسجيل دفعة'}
            </h2>
            <div className="bg-gray-800 p-3 rounded-lg mb-4">
              <div className="flex justify-between">
                <span className="text-gray-400">العميل:</span>
                <span className="font-bold">{selectedDebtor.name}</span>
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-gray-400">الرصيد الحالي:</span>
                <span className="font-bold text-red-400">{formatCurrency(selectedDebtor.total_debt)}</span>
              </div>
            </div>
            <div className="space-y-3 mb-6">
              <input
                type="number"
                placeholder="المبلغ *"
                value={transactionAmount}
                onChange={(e) => setTransactionAmount(e.target.value)}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                min="0"
                step="0.01"
                autoFocus
              />
              <textarea
                placeholder="وصف العملية (اختياري)"
                value={transactionDescription}
                onChange={(e) => setTransactionDescription(e.target.value)}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 h-24 resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={addTransaction} className="flex-1 btn-gold py-3">
                ✅ تأكيد
              </button>
              <button
                onClick={() => {
                  setShowAddTransaction(false);
                  setTransactionAmount('');
                  setTransactionDescription('');
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

export default DebtorsModule;
