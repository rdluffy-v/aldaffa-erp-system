/**
 * ============================================================================
 * WITHDRAWALS MODULE - REFACTORED WITH REPOSITORY PATTERN + UI STORE
 * ============================================================================
 *
 * Features:
 * - Sub-tabs: General Expenses (المصروفات العامة), Salaries (المرتبات والأجور),
 *   Capital Assets (المصروفات الرأسمالية والأصول), All (الكل)
 * - Source Selection: 'drawer' (درج الكاشير اليومي) vs 'safe' (الخزينة العامة / رأس المال)
 * - Strict financial separation: 'safe' withdrawals & capital assets never affect POS cash drawer closing
 * - Detailed fields: employee_name, asset_name, notes, recipient, reason
 * - WithdrawalsRepository for ALL data access
 * - useUIStore toasts + custom confirm modal
 * - Date range filter (from / to)
 * - Summary totals with breakdown
 *
 * Architecture reference: src/modules/POS.jsx
 * ============================================================================
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DollarSign,
  Users,
  Building2,
  Wallet,
  Landmark,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar
} from 'lucide-react';
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

  // Active sub-tab: 'all' | 'general' | 'salary' | 'capital_asset'
  const [activeTab, setActiveTab] = useState('all');

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

  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalCategory, setModalCategory] = useState('general'); // 'general' | 'salary' | 'capital_asset'
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('drawer'); // 'drawer' | 'safe'
  const [employeeName, setEmployeeName] = useState('');
  const [assetName, setAssetName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState(null);

  // ---------------------------------------------------------------
  // Load withdrawals + summary in the selected range
  // ---------------------------------------------------------------
  const loadWithdrawals = useCallback(async () => {
    const startISO = toStartISO(startDate);
    const endISO = toEndISO(endDate);
    if (!startISO || !endISO) {
      showError('يرجى اختيار نطاق تاريخ صحيح');
      return;
    }

    setLoading(true);
    try {
      // Always load all records in date range so we can compute breakdowns across tabs
      const [data, sum] = await Promise.all([
        withdrawalsRepo.getWithdrawalsInRange(startISO, endISO),
        withdrawalsRepo.getWithdrawalsSummary(startISO, endISO)
      ]);
      setWithdrawals(data || []);
      setSummary(sum);
    } catch (error) {
      showError(`خطأ في تحميل السحوبات: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, showError]);

  useEffect(() => {
    loadWithdrawals();

    const handleRefresh = () => {
      loadWithdrawals();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, [loadWithdrawals]);

  // Open Add Modal preset for current tab
  const handleOpenAddModal = (presetCategory = null) => {
    const targetCategory = presetCategory || (activeTab !== 'all' ? activeTab : 'general');
    setModalCategory(targetCategory);
    if (targetCategory === 'capital_asset') {
      setSource('safe'); // Fixed assets always from safe/capital
    } else if (targetCategory === 'salary') {
      setSource('drawer'); // Default to drawer, but editable
    } else {
      setSource('drawer');
    }
    setAmount('');
    setEmployeeName('');
    setAssetName('');
    setRecipient('');
    setReason('');
    setNotes('');
    setShowAddModal(true);
  };

  // ---------------------------------------------------------------
  // Add withdrawal
  // ---------------------------------------------------------------
  const addWithdrawal = async () => {
    const amt = safeParseFloat(amount, NaN);
    if (isNaN(amt) || amt <= 0) {
      showError('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    let finalReason = reason.trim();
    let finalRecipient = recipient.trim();
    const finalEmployeeName = employeeName.trim();
    const finalAssetName = assetName.trim();
    const finalNotes = notes.trim();

    if (modalCategory === 'salary') {
      if (!finalEmployeeName) {
        showError('يرجى إدخال اسم الموظف');
        return;
      }
      finalReason = finalReason || `مرتب / أجر: ${finalEmployeeName}`;
      finalRecipient = finalRecipient || finalEmployeeName;
    } else if (modalCategory === 'capital_asset') {
      if (!finalAssetName) {
        showError('يرجى إدخال اسم الأصل الرأسمالي أو الآلة والمعدات');
        return;
      }
      finalReason = finalReason || `شراء أصل رأسمالي: ${finalAssetName}`;
    } else {
      if (!finalReason) {
        showError('يرجى إدخال سبب المصروف');
        return;
      }
    }

    // Enforce capital_asset source to be 'safe'
    const finalSource = modalCategory === 'capital_asset' ? 'safe' : source;

    try {
      await withdrawalsRepo.create({
        id: generateId(),
        date: new Date().toISOString(),
        amount: amt,
        category: modalCategory,
        source: finalSource,
        employee_name: finalEmployeeName || null,
        asset_name: finalAssetName || null,
        recipient: finalRecipient || null,
        reason: finalReason,
        notes: finalNotes || null
      });

      setShowAddModal(false);
      setAmount('');
      setEmployeeName('');
      setAssetName('');
      setRecipient('');
      setReason('');
      setNotes('');

      await loadWithdrawals();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
      }

      const categoryLabel =
        modalCategory === 'salary'
          ? 'مرتب الموظف'
          : modalCategory === 'capital_asset'
          ? 'الأصل الرأسمالي'
          : 'المصروف';
      const sourceLabel = finalSource === 'drawer' ? 'درج الكاشير اليومي' : 'الخزينة العامة / رأس المال';

      showSuccess(`✅ تم تسجيل ${categoryLabel} بنجاح\nالمبلغ: ${formatCurrency(amt)}\nالمصدر: ${sourceLabel}`);
    } catch (error) {
      showError(`خطأ في تسجيل السحب: ${error.message}`);
    }
  };

  // ---------------------------------------------------------------
  // Delete withdrawal (via custom confirm modal)
  // ---------------------------------------------------------------
  const deleteWithdrawal = (withdrawal) => {
    setConfirmDelete({
      message: `هل أنت متأكد من حذف السجل بمبلغ ${formatCurrency(withdrawal.amount)} (${withdrawal.reason || withdrawal.employee_name || withdrawal.asset_name})؟`,
      onConfirm: async () => {
        try {
          await withdrawalsRepo.delete(withdrawal.id);
          setConfirmDelete(null);
          await loadWithdrawals();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
          }
          showSuccess('✅ تم حذف السجل بنجاح');
        } catch (error) {
          setConfirmDelete(null);
          showError(`خطأ في حذف السجل: ${error.message}`);
        }
      }
    });
  };

  // ---------------------------------------------------------------
  // Computed values: breakdowns & active filtering
  // ---------------------------------------------------------------
  const {
    generalTotal,
    salaryTotal,
    capitalTotal,
    drawerTotal,
    safeTotal,
    generalCount,
    salaryCount,
    capitalCount
  } = useMemo(() => {
    let generalSum = 0;
    let salarySum = 0;
    let capitalSum = 0;
    let drawerSum = 0;
    let safeSum = 0;
    let gCount = 0;
    let sCount = 0;
    let cCount = 0;

    for (const w of withdrawals) {
      const amt = safeParseFloat(w.amount, 0);
      const cat = w.category || 'general';
      const src = w.source || 'drawer';

      if (cat === 'salary') {
        salarySum += amt;
        sCount++;
      } else if (cat === 'capital_asset') {
        capitalSum += amt;
        cCount++;
      } else {
        generalSum += amt;
        gCount++;
      }

      // Drawer sum only includes items charged to cashier drawer and not capital assets
      if (src === 'drawer' && cat !== 'capital_asset') {
        drawerSum += amt;
      } else {
        safeSum += amt;
      }
    }

    return {
      generalTotal: generalSum,
      salaryTotal: salarySum,
      capitalTotal: capitalSum,
      drawerTotal: drawerSum,
      safeTotal: safeSum,
      generalCount: gCount,
      salaryCount: sCount,
      capitalCount: cCount
    };
  }, [withdrawals]);

  // Tab and search filtering
  const filteredWithdrawals = useMemo(() => {
    let list = withdrawals;

    // Filter by tab
    if (activeTab === 'general') {
      list = list.filter((w) => !w.category || w.category === 'general');
    } else if (activeTab === 'salary') {
      list = list.filter((w) => w.category === 'salary');
    } else if (activeTab === 'capital_asset') {
      list = list.filter((w) => w.category === 'capital_asset');
    }

    // Filter by search term
    if (!debouncedSearch) return list;
    const term = debouncedSearch.toLowerCase();
    return list.filter(
      (w) =>
        (w.reason || '').toLowerCase().includes(term) ||
        (w.recipient || '').toLowerCase().includes(term) ||
        (w.employee_name || '').toLowerCase().includes(term) ||
        (w.asset_name || '').toLowerCase().includes(term) ||
        (w.notes || '').toLowerCase().includes(term)
    );
  }, [withdrawals, activeTab, debouncedSearch]);

  // ===============================================================
  // RENDER
  // ===============================================================
  return (
    <div className="h-full flex flex-col glass-card p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>💸</span>
          <span>المصروفات والسحوبات والمرتبات</span>
        </h2>
        <div className="flex gap-3 flex-wrap items-center">
          {/* Date range filter */}
          <div className="flex items-center gap-2 bg-gray-800 p-2 rounded-lg border border-gold/30">
            <Calendar className="w-4 h-4 text-gold" />
            <span className="text-sm text-gray-400">من</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm focus:outline-none focus:border-gold"
            />
            <span className="text-sm text-gray-400">إلى</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm focus:outline-none focus:border-gold"
            />
          </div>
          <button
            onClick={loadWithdrawals}
            title="تحديث البيانات"
            className="bg-gray-700 px-3 py-2 rounded-lg hover:bg-gray-600 transition-colors text-gray-200"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleOpenAddModal()}
            className="btn-gold px-4 py-2 flex items-center gap-2 text-sm font-bold shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل جديد</span>
          </button>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="flex items-center gap-2 mb-4 border-b border-gray-700/60 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'all'
              ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
              : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>الكل</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            activeTab === 'all' ? 'bg-slate-950/30 text-slate-950 font-bold' : 'bg-gray-700 text-gray-400'
          }`}>
            {withdrawals.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'general'
              ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
              : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>المصروفات العامة</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            activeTab === 'general' ? 'bg-slate-950/30 text-slate-950 font-bold' : 'bg-gray-700 text-gray-400'
          }`}>
            {generalCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('salary')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'salary'
              ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
              : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>المرتبات والأجور</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            activeTab === 'salary' ? 'bg-slate-950/30 text-slate-950 font-bold' : 'bg-gray-700 text-gray-400'
          }`}>
            {salaryCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('capital_asset')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'capital_asset'
              ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
              : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>المصروفات الرأسمالية والأصول</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            activeTab === 'capital_asset' ? 'bg-slate-950/30 text-slate-950 font-bold' : 'bg-gray-700 text-gray-400'
          }`}>
            {capitalCount}
          </span>
        </button>
      </div>

      {/* Summary cards with financial isolation breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-800/90 border border-gray-700/60 p-4 rounded-xl">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>المصروفات العامة</span>
            <FileText className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-extrabold text-rose-400">
            {formatCurrency(generalTotal)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            {generalCount} عمليات تسجيل
          </div>
        </div>

        <div className="bg-gray-800/90 border border-gray-700/60 p-4 rounded-xl">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>المرتبات والأجور</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-extrabold text-emerald-400">
            {formatCurrency(salaryTotal)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            {salaryCount} رواتب مسجلة
          </div>
        </div>

        <div className="bg-gray-800/90 border border-gray-700/60 p-4 rounded-xl">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
            <span>الأصول الرأسمالية والآلات</span>
            <Building2 className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-extrabold text-purple-400">
            {formatCurrency(capitalTotal)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            {capitalCount} أصول مسجلة (رأس المال)
          </div>
        </div>

        <div className="bg-gray-800/90 border border-amber-500/30 p-4 rounded-xl">
          <div className="flex items-center justify-between text-xs text-amber-400/90 mb-1">
            <span>مسحوبات درج الكاشير</span>
            <Wallet className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-extrabold text-amber-400">
            {formatCurrency(drawerTotal)}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            تخصم من تقفيل الوردية اليومية
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
        <input
          type="text"
          placeholder="🔍 بحث في السحوبات (السبب، اسم الموظف، الأصل الرأسمالي، الملاحظات)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-gray-800 text-white pr-10 pl-4 py-2.5 rounded-lg border border-gold/30 focus:outline-none focus:border-gold text-sm"
        />
      </div>

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
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-12">
            <div className="text-5xl mb-3">💸</div>
            <p className="text-lg font-bold text-gray-400 mb-1">
              {debouncedSearch ? 'لا توجد نتائج مطابقة للبحث' : 'لا توجد عمليات مسجلة في هذا التبويب والفترة'}
            </p>
            <p className="text-xs text-gray-500">
              {debouncedSearch ? 'جرب كلمة بحث أخرى' : 'غيّر نطاق التاريخ أو اضغط على تسجيل جديد'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredWithdrawals.map((withdrawal) => {
              const category = withdrawal.category || 'general';
              const isSalary = category === 'salary';
              const isCapital = category === 'capital_asset';
              const isDrawer = (withdrawal.source || 'drawer') === 'drawer' && !isCapital;

              return (
                <div
                  key={withdrawal.id}
                  className="glass-card p-4 hover:border-gold/50 transition-all border border-gray-700/50 rounded-xl"
                >
                  <div className="flex justify-between items-start mb-2.5">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-2xl font-bold text-gold">
                          {formatCurrency(withdrawal.amount)}
                        </span>

                        {/* Category badge */}
                        {isSalary && (
                          <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span>مرتب موظف</span>
                          </span>
                        )}
                        {isCapital && (
                          <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            <span>أصل رأسمالي / معدات</span>
                          </span>
                        )}
                        {!isSalary && !isCapital && (
                          <span className="text-xs bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            <span>مصروف عام</span>
                          </span>
                        )}

                        {/* Source badge */}
                        {isDrawer ? (
                          <span className="text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                            <Wallet className="w-3 h-3" />
                            <span>درج الكاشير (يخصم من الوردية)</span>
                          </span>
                        ) : (
                          <span className="text-[11px] bg-blue-500/15 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                            <Landmark className="w-3 h-3" />
                            <span>الخزينة العامة / رأس المال (لا يخصم من الوردية)</span>
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-gray-400 flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(withdrawal.date)}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => deleteWithdrawal(withdrawal)}
                      className="text-red-400/80 hover:text-red-300 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                      title="حذف السجل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5 bg-gray-800/60 p-3 rounded-lg text-xs">
                    {/* Salary specifics */}
                    {isSalary && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 min-w-[90px] font-medium">اسم الموظف:</span>
                        <span className="font-bold text-white text-sm">
                          {withdrawal.employee_name || withdrawal.recipient || 'غير محدد'}
                        </span>
                      </div>
                    )}

                    {/* Capital Asset specifics */}
                    {isCapital && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 min-w-[90px] font-medium">اسم الأصل / الآلة:</span>
                        <span className="font-bold text-white text-sm">
                          {withdrawal.asset_name || withdrawal.reason}
                        </span>
                      </div>
                    )}

                    {/* General / reason */}
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 min-w-[90px] font-medium">البيان / السبب:</span>
                      <span className="font-bold text-gray-200">{withdrawal.reason}</span>
                    </div>

                    {/* Optional recipient for general */}
                    {!isSalary && withdrawal.recipient && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 min-w-[90px] font-medium">المستلم:</span>
                        <span className="text-gray-200">{withdrawal.recipient}</span>
                      </div>
                    )}

                    {/* Notes if available */}
                    {withdrawal.notes && (
                      <div className="flex items-start gap-2 pt-1 border-t border-gray-700/50 text-gray-300">
                        <span className="text-gray-400 min-w-[90px] font-medium">ملاحظات:</span>
                        <span className="italic">{withdrawal.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="glass-card p-6 w-full max-w-lg border border-gold/30 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gold mb-3 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              <span>تسجيل مصروف أو مرتب أو أصل رأسمالي</span>
            </h2>

            {/* Category Selector Tabs in Modal */}
            <div className="grid grid-cols-3 gap-2 mb-4 bg-gray-900/60 p-1.5 rounded-xl border border-gray-700/60">
              <button
                type="button"
                onClick={() => {
                  setModalCategory('general');
                  setSource('drawer');
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                  modalCategory === 'general'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                مصروف عام
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalCategory('salary');
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                  modalCategory === 'salary'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                مرتب موظف
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalCategory('capital_asset');
                  setSource('safe');
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                  modalCategory === 'capital_asset'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                أصل رأسمالي / آلة
              </button>
            </div>

            <div className="space-y-3.5 mb-6">
              {/* Category-Specific Top Fields */}
              {modalCategory === 'salary' && (
                <div>
                  <label className="text-xs font-bold text-emerald-400 mb-1 block">
                    اسم الموظف / العامل *
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: أحمد عبد الله..."
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg border border-emerald-500/40 focus:outline-none focus:border-emerald-400 text-sm"
                    autoFocus
                  />
                </div>
              )}

              {modalCategory === 'capital_asset' && (
                <div>
                  <label className="text-xs font-bold text-purple-400 mb-1 block">
                    اسم الأصل / الآلة أو المعدات *
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: ماكينة كبس العطور الهيدروليكية..."
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg border border-purple-500/40 focus:outline-none focus:border-purple-400 text-sm"
                    autoFocus
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    💡 الأصول الرأسمالية تُسجل كقيمة أصول ولا تؤثر على الوردية اليومية، وتظهر في القوائم المالية.
                  </p>
                </div>
              )}

              {/* Amount Field */}
              <div>
                <label className="text-xs font-bold text-gray-300 mb-1 block">المبلغ (د.ل) *</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg border border-gold/30 focus:outline-none focus:border-gold text-lg font-bold"
                  min="0"
                  step="0.01"
                  autoFocus={modalCategory === 'general'}
                />
              </div>

              {/* Source Selection (Drawer vs Safe) */}
              <div>
                <label className="text-xs font-bold text-gray-300 mb-1.5 block">
                  جهة السحب / الصرف *
                </label>
                {modalCategory === 'capital_asset' ? (
                  <div className="bg-purple-950/30 border border-purple-500/30 rounded-lg p-3 text-xs text-purple-200 flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>
                      <strong>الخزينة العامة / رأس المال:</strong> الأصول الرأسمالية والآلات تُصرف حصراً من الخزينة ولا تُخصم من درج الكاشير اليومي.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                        source === 'drawer'
                          ? 'bg-amber-500/20 border-amber-400 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs mb-1">
                        <input
                          type="radio"
                          name="source"
                          checked={source === 'drawer'}
                          onChange={() => setSource('drawer')}
                          className="accent-amber-400"
                        />
                        <Wallet className="w-3.5 h-3.5 text-amber-400" />
                        <span>درج الكاشير اليومي</span>
                      </div>
                      <span className="text-[10px] text-gray-300">
                        يُخصم من مبيعات الوردية الحالية عند التقفيل.
                      </span>
                    </label>

                    <label
                      className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                        source === 'safe'
                          ? 'bg-blue-500/20 border-blue-400 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs mb-1">
                        <input
                          type="radio"
                          name="source"
                          checked={source === 'safe'}
                          onChange={() => setSource('safe')}
                          className="accent-blue-400"
                        />
                        <Landmark className="w-3.5 h-3.5 text-blue-400" />
                        <span>الخزينة العامة / رأس المال</span>
                      </div>
                      <span className="text-[10px] text-gray-300">
                        لا يخصم من الوردية اليومية للكاشير.
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* General Category specific fields */}
              {modalCategory === 'general' && (
                <>
                  <div>
                    <label className="text-xs font-bold text-gray-300 mb-1 block">المستلم (اختياري)</label>
                    <input
                      type="text"
                      placeholder="اسم الشخص أو الجهة المستلمة..."
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      className="w-full bg-gray-800 text-white px-3.5 py-2 rounded-lg border border-gold/30 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-300 mb-1 block">السبب / البيان *</label>
                    <input
                      type="text"
                      placeholder="مثال: فاتورة كهرباء، ضيافة المحل، تنظيفات..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full bg-gray-800 text-white px-3.5 py-2 rounded-lg border border-gold/30 text-xs"
                    />
                  </div>
                </>
              )}

              {/* Notes for all categories */}
              <div>
                <label className="text-xs font-bold text-gray-300 mb-1 block">
                  ملاحظات إضافية <span className="text-gray-500 font-normal">(اختياري)</span>
                </label>
                <textarea
                  placeholder="أي تفاصيل أو ملاحظات إضافية..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-gray-800 text-white px-3.5 py-2 rounded-lg border border-gold/30 h-16 resize-none text-xs"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={addWithdrawal} className="flex-1 btn-gold py-2.5 text-sm font-bold cursor-pointer">
                ✅ تأكيد وحفظ
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setAmount('');
                  setEmployeeName('');
                  setAssetName('');
                  setRecipient('');
                  setReason('');
                  setNotes('');
                }}
                className="flex-1 bg-gray-700 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-gray-600 text-sm cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirm Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[60] p-4" dir="rtl">
          <div className="glass-card p-6 w-full max-w-md border border-red-500/30">
            <h2 className="text-lg font-bold text-gold mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span>تأكيد الحذف</span>
            </h2>
            <p className="text-gray-300 mb-6 text-sm leading-relaxed">{confirmDelete.message}</p>
            <div className="flex gap-3">
              <button
                onClick={confirmDelete.onConfirm}
                className="flex-1 bg-red-600 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-red-700 transition-colors text-sm cursor-pointer"
              >
                نعم، حذف
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 bg-gray-700 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-gray-600 text-sm cursor-pointer"
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
