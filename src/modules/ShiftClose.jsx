/**
 * ============================================================================
 * SHIFT CLOSE MODULE (إغلاق الوردية والحسابات الشاملة)
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { PurchasesRepository } from '../database/repositories/PurchasesRepository.js';
import { WithdrawalsRepository } from '../database/repositories/WithdrawalsRepository.js';
import { CapitalRepository } from '../database/repositories/CapitalRepository.js';
import { GiftsRepository } from '../database/repositories/GiftsRepository.js';
import { LossesRepository } from '../database/repositories/LossesRepository.js';
import { NotesRepository } from '../database/repositories/NotesRepository.js';
import { BaseRepository } from '../database/repositories/BaseRepository.js';
import { db } from '../database/connection.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useAuthStore } from '../stores/useAuthStore.js';
import { formatCurrency, formatDate, generateId, safeParseFloat } from '../utils/helpers.js';
import { getIpcRenderer } from '../utils/electronBridge.js';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';
import {
  Lock,
  Printer,
  CheckCircle,
  Clock,
  History,
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingBag,
  ShoppingCart,
  Wallet,
  Gift,
  HeartCrack,
  StickyNote,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Check,
  Scale,
  RefreshCw,
  Building2,
  Calendar,
  Trash2,
  FileDown,
  Download
} from 'lucide-react';

const salesRepo = new SalesRepository();
const purchasesRepo = new PurchasesRepository();
const withdrawalsRepo = new WithdrawalsRepository();
const capitalRepo = new CapitalRepository();
const giftsRepo = new GiftsRepository();
const lossesRepo = new LossesRepository();
const notesRepo = new NotesRepository();
const shiftReportsRepo = new BaseRepository('shift_reports');

const ShiftCloseModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const currentUser = useAuthStore((s) => s.currentUser);
  const canViewProfit = hasPermission('view_profit');

  const [cashierName, setCashierName] = useState('الكاشير المناوب');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [actualCash, setActualCash] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const [pastReports, setPastReports] = useState([]);
  const [activeTab, setActiveTab] = useState('current'); // 'current' | 'history'
  const [activeDetailTab, setActiveDetailTab] = useState('summary'); // 'summary' | 'sales' | 'purchases' | 'losses' | 'withdrawals' | 'capital' | 'gifts' | 'notes'

  // Delete past report state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Ensure table exists on mount
  useEffect(() => {
    const initTable = async () => {
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS shift_reports (
            id TEXT PRIMARY KEY,
            cashier_name TEXT,
            start_date TEXT,
            end_date TEXT,
            expected_cash REAL,
            actual_cash REAL,
            variance REAL,
            total_sales REAL,
            total_profit REAL,
            report_data_json TEXT,
            created_at TEXT,
            is_demo INTEGER DEFAULT 0
          )
        `);
        try {
          await db.run('ALTER TABLE shift_reports ADD COLUMN is_demo INTEGER DEFAULT 0');
        } catch (e) {}
      } catch (e) {
        console.warn('shift_reports table init error:', e);
      }
    };
    initTable();
    loadPastReports();

    const handleRefresh = () => {
      loadPastReports();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, []);

  const loadPastReports = async () => {
    try {
      const rows = await shiftReportsRepo.findAll({}, 'created_at DESC');
      setPastReports(rows || []);
    } catch (e) {
      console.warn('loadPastReports error:', e);
    }
  };

  const handleDeleteReport = async () => {
    if (!deleteTarget) return;
    if (currentUser?.role !== 'manager') {
      showError('حذف تقارير الورديات مخصص للمدير العام فقط.');
      return;
    }
    setIsDeleting(true);
    try {
      await shiftReportsRepo.delete(deleteTarget.id);
      showSuccess('✅ تم حذف تقرير الوردية بنجاح');
      await loadPastReports();
    } catch (err) {
      showError(`فشل حذف تقرير الوردية: ${err.message}`);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const generateReport = async () => {
    setLoading(true);

    try {
      const start = new Date(startDate).toISOString();
      const end = new Date(endDate + 'T23:59:59.999Z').toISOString();

      // Gather all financial and operational data across all modules
      const [sales, purchases, withdrawals, capitalInjections, losses, gifts, returnsList, notesList] =
        await Promise.all([
          salesRepo.getSalesInRange(start, end),
          purchasesRepo.getPurchasesInRange(start, end),
          withdrawalsRepo.getWithdrawalsInRange(start, end),
          capitalRepo.getInjectionsInRange(start, end),
          lossesRepo.getLossesInRange(start, end),
          giftsRepo.getGiftsInRange(start, end),
          db.query("SELECT * FROM returns WHERE date >= ? AND date <= ?", [start, end]).catch(() => []),
          notesRepo.findAll({}, 'date DESC').catch(() => [])
        ]);

      // Filter notes created within period
      const filteredNotes = (notesList || []).filter((n) => {
        if (!n.date) return false;
        return n.date >= start && n.date <= end;
      });

      // Sales Grouping
      const cashSales = (sales || []).filter((s) => s.payment_method === 'cash');
      const cardSales = (sales || []).filter((s) => s.payment_method === 'card');
      const transferSales = (sales || []).filter((s) => s.payment_method === 'bank_transfer');
      const debtSales = (sales || []).filter((s) => s.payment_method === 'debt');

      const totalRevenue = (sales || []).reduce((sum, s) => sum + safeParseFloat(s.total, 0), 0);
      const totalProfit = (sales || []).reduce((sum, s) => sum + safeParseFloat(s.profit, 0), 0);
      const totalCashSales = cashSales.reduce((sum, s) => sum + safeParseFloat(s.total, 0), 0);
      const totalCardSales = cardSales.reduce((sum, s) => sum + safeParseFloat(s.total, 0), 0);
      const totalTransferSales = transferSales.reduce((sum, s) => sum + safeParseFloat(s.total, 0), 0);
      const totalDebtSales = debtSales.reduce((sum, s) => sum + safeParseFloat(s.total, 0), 0);

      // Purchases Grouping
      const totalPurchases = (purchases || []).reduce((sum, p) => sum + safeParseFloat(p.total, 0), 0);
      const cashPurchases = (purchases || []).filter((p) => p.payment_type === 'cash');
      const totalCashPurchases = cashPurchases.reduce((sum, p) => sum + safeParseFloat(p.total, 0), 0);
      const debtPurchases = (purchases || []).filter((p) => p.payment_type === 'debt');
      const totalDebtPurchases = debtPurchases.reduce((sum, p) => sum + safeParseFloat(p.total, 0), 0);

      // Expenses, Losses, Gifts, Capital, Returns
      const totalWithdrawals = (withdrawals || []).reduce((sum, w) => sum + safeParseFloat(w.amount, 0), 0);
      const totalCapital = (capitalInjections || []).reduce((sum, c) => sum + safeParseFloat(c.amount, 0), 0);
      const totalLosses = (losses || []).reduce((sum, l) => sum + safeParseFloat(l.cost_value, 0), 0);
      const totalLossesQty = (losses || []).reduce((sum, l) => sum + safeParseFloat(l.qty, 0), 0);
      const totalGifts = (gifts || []).reduce((sum, g) => sum + safeParseFloat(g.cost_value, 0), 0);
      const totalReturns = (returnsList || []).reduce((sum, r) => sum + safeParseFloat(r.returned_amount, 0), 0);
      const totalCashReturns = totalReturns;

      // Cash Drawer Calculation Formula:
      // Expected Cash in Drawer = Cash Sales + Cash Capital Injected - Cash Withdrawals - Cash Purchases - Cash Returns
      const expectedCashBalance = totalCashSales + totalCapital - totalWithdrawals - totalCashPurchases - totalCashReturns;
      const actualCashValue = safeParseFloat(actualCash, 0);
      const variance = actualCashValue - expectedCashBalance;

      const reportData = {
        cashier: cashierName.trim() || 'كاشير',
        period: { start: startDate, end: endDate },
        sales: {
          total: totalRevenue,
          count: (sales || []).length,
          cash: totalCashSales,
          card: totalCardSales,
          transfer: totalTransferSales,
          debt: totalDebtSales,
          items: sales || []
        },
        returns: {
          total: totalReturns,
          count: (returnsList || []).length,
          items: returnsList || []
        },
        profit: totalProfit,
        purchases: {
          total: totalPurchases,
          count: (purchases || []).length,
          cash: totalCashPurchases,
          debt: totalDebtPurchases,
          items: purchases || []
        },
        withdrawals: {
          total: totalWithdrawals,
          count: (withdrawals || []).length,
          items: withdrawals || []
        },
        capital: {
          total: totalCapital,
          count: (capitalInjections || []).length,
          items: capitalInjections || []
        },
        losses: {
          total: totalLosses,
          totalQty: totalLossesQty,
          count: (losses || []).length,
          items: losses || []
        },
        gifts: {
          total: totalGifts,
          count: (gifts || []).length,
          items: gifts || []
        },
        notes: {
          count: filteredNotes.length,
          items: filteredNotes
        },
        cash: {
          expected: expectedCashBalance,
          actual: actualCashValue,
          variance
        }
      };

      setReport(reportData);
      showSuccess('✅ تم إعداد وتحليل تقرير الوردية الشامل بنجاح');
    } catch (error) {
      showError('خطأ في إعداد التقرير: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const handleExportPDF = async (reportData) => {
    if (!reportData) return;
    setIsExportingPDF(true);
    try {
      const ipc = getIpcRenderer();
      if (ipc) {
        const res = await ipc.invoke('export:shift-pdf', reportData);
        if (res && res.success) {
          if (res.saved) {
            showSuccess(`✅ تم تصدير تقرير الوردية بنجاح إلى:\n${res.filePath}`);
          }
        } else if (res && res.error) {
          showError(`فشل تصدير PDF: ${res.error}`);
        }
      } else {
        window.print();
      }
    } catch (err) {
      showError(`خطأ أثناء تصدير PDF: ${err.message}`);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handlePrint = async (reportData) => {
    if (!reportData) return;
    setIsPrinting(true);
    try {
      const ipc = getIpcRenderer();
      if (ipc) {
        const res = await ipc.invoke('print:shift-report', reportData);
        if (res && res.success) {
          showSuccess('✅ تم إرسال تقرير الوردية للطباعة');
        } else if (res && res.error) {
          showError(`فشل الطباعة: ${res.error}`);
        }
      } else {
        window.print();
      }
    } catch (printError) {
      showError(`خطأ في الطباعة: ${printError.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSaveAndCloseShift = async () => {
    if (!report) {
      showWarning('يرجى إنشاء وتوليد التقرير أولاً');
      return;
    }

    setSavingShift(true);
    try {
      const id = generateId();
      const record = {
        id,
        cashier_name: cashierName.trim() || 'كاشير',
        start_date: startDate,
        end_date: endDate,
        expected_cash: report.cash.expected,
        actual_cash: report.cash.actual,
        variance: report.cash.variance,
        total_sales: report.sales.total,
        total_profit: report.profit,
        report_data_json: JSON.stringify(report),
        created_at: new Date().toISOString()
      };

      await shiftReportsRepo.create(record);
      await loadPastReports();
      showSuccess('✅ تم حفظ وإغلاق الوردية وأرشفتها بنجاح في المنظومة.\nيمكنك الآن تصديرها كملف PDF أو طباعتها.');
    } catch (err) {
      showError(`فشل حفظ إغلاق الوردية: ${err.message}`);
    } finally {
      setSavingShift(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-3.5">
      {/* Top Header */}
      <div className="atelier-card p-3.5 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shadow-sm">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-[#2D2424] dark:text-white">إغلاق الوردية والحسابات الشاملة</h1>
            <p className="text-[11px] text-[#5C524F] dark:text-slate-400">
              حساب الخزينة، تحليل المبيعات، المشتريات، التوالف، المصاريف، الفوارق والطباعة
            </p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex gap-1.5 bg-black/10 dark:bg-slate-800/60 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('current')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'current'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            📊 تقرير الوردية الحالية
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            📁 سجل الورديات المغلقة ({pastReports.length})
          </button>
        </div>
      </div>

      {activeTab === 'current' ? (
        <div className="flex-1 overflow-y-auto space-y-3.5 scrollbar-thin pr-1">
          {/* Controls Strip */}
          <div className="atelier-card p-4 bg-amber-50/50 dark:bg-slate-800/40 border-amber-500/20">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                  اسم الكاشير المناوب:
                </label>
                <input
                  type="text"
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                  className="input-atelier w-full text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                  من تاريخ:
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input-atelier w-full text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                  إلى تاريخ:
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input-atelier w-full text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                  النقد الفعلي في الصندوق (د.ل) *:
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="المبلغ بعد العد اليدوي"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  className="input-atelier w-full text-xs font-bold text-center border-amber-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-amber-500/15">
              <button
                type="button"
                onClick={generateReport}
                disabled={loading}
                className="btn-atelier-primary py-1.5 px-5 text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>{loading ? 'جاري التحليل والجمع...' : 'توليد وفحص تقرير الوردية'}</span>
              </button>
            </div>
          </div>

          {report && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              {/* Financial KPIs Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="atelier-card p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 font-bold">إجمالي المبيعات</span>
                    <ShoppingCart className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
                    {formatCurrency(report.sales.total)}
                  </div>
                  <div className="text-[9px] text-gray-400">{report.sales.count} فاتورة بيع</div>
                </div>

                <div className="atelier-card p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 font-bold">صافي الأرباح المحققة</span>
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-1 tabular-nums">
                    {canViewProfit ? formatCurrency(report.profit) : '••••••'}
                  </div>
                  <div className="text-[9px] text-gray-400">هامش الربح التشغيلي</div>
                </div>

                <div className="atelier-card p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 font-bold">إجمالي المشتريات</span>
                    <ShoppingBag className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="text-lg font-black text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
                    {formatCurrency(report.purchases.total)}
                  </div>
                  <div className="text-[9px] text-gray-400">
                    نقدي: {formatCurrency(report.purchases.cash)} | آجل: {formatCurrency(report.purchases.debt)}
                  </div>
                </div>

                <div className="atelier-card p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 font-bold">التوالف والفاقد</span>
                    <HeartCrack className="w-4 h-4 text-rose-500" />
                  </div>
                  <div className="text-lg font-black text-rose-600 dark:text-rose-400 mt-1 tabular-nums">
                    {formatCurrency(report.losses.total)}
                  </div>
                  <div className="text-[9px] text-gray-400">{report.losses.totalQty} وحدة مكسورة/تالفة</div>
                </div>
              </div>

              {/* Cash Reconciliation Card */}
              <div className="atelier-card p-4 bg-[#F8F6F0] dark:bg-slate-800/90 border-amber-500/30">
                <div className="flex items-center gap-2 mb-3">
                  <Scale className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-extrabold text-[#2D2424] dark:text-white">
                    تسوية وفحص النقدية في الدرج (Cash Drawer Reconciliation)
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-black/5">
                    <span className="text-gray-500 block text-[10px]">النقد المتوقع في الدرج (Expected):</span>
                    <span className="text-base font-black text-[#2D2424] dark:text-white tabular-nums">
                      {formatCurrency(report.cash.expected)}
                    </span>
                    <span className="text-[9px] text-gray-400 block mt-0.5">
                      (مبيعات كاش + ضخ مالي - سحوبات نقدية - مشتريات كاش)
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-black/5">
                    <span className="text-gray-500 block text-[10px]">النقد الفعلي المعدود (Actual):</span>
                    <span className="text-base font-black text-amber-600 dark:text-amber-400 tabular-nums">
                      {formatCurrency(report.cash.actual)}
                    </span>
                    <span className="text-[9px] text-gray-400 block mt-0.5">العد اليدوي للكاش بالصندوق</span>
                  </div>

                  <div
                    className={`p-3 rounded-xl border font-bold ${
                      report.cash.variance > 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : report.cash.variance < 0
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
                    }`}
                  >
                    <span className="block text-[10px]">حالة المطابقة والفارق (Variance):</span>
                    <span className="text-base font-black tabular-nums">
                      {report.cash.variance > 0
                        ? `+${formatCurrency(report.cash.variance)} (فائض نقدي)`
                        : report.cash.variance < 0
                        ? `${formatCurrency(report.cash.variance)} (عجز نقدي)`
                        : '0.00 د.ل (مطابق 100%)'}
                    </span>
                    <span className="text-[9px] block mt-0.5">
                      {report.cash.variance === 0
                        ? 'الدرج متطابق تماماً بدون أية نواقص'
                        : report.cash.variance > 0
                        ? 'يوجد زيادة نقدية في الخزينة'
                        : 'يوجد نقص نقدي يستوجب المراجعة'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Drilldown Navigation Tabs for Deep Breakdown */}
              <div className="atelier-card p-3.5">
                <div className="flex gap-1.5 overflow-x-auto pb-2 border-b border-white/10 text-xs scrollbar-thin">
                  {[
                    { id: 'summary', label: '📊 التحليل العام', count: null },
                    { id: 'sales', label: '🛒 المبيعات', count: report.sales.count },
                    { id: 'purchases', label: '📦 المشتريات والتوريد', count: report.purchases.count },
                    { id: 'losses', label: '💔 التوالف والفاقد', count: report.losses.count },
                    { id: 'withdrawals', label: '💸 السحوبات', count: report.withdrawals.count },
                    { id: 'capital', label: '💵 الضخ المالي', count: report.capital.count },
                    { id: 'gifts', label: '🎁 الهدايا والعينات', count: report.gifts.count },
                    { id: 'notes', label: '📝 الملاحظات والمهام', count: report.notes.count }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveDetailTab(tab.id)}
                      className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer text-xs ${
                        activeDetailTab === tab.id
                          ? 'bg-amber-500 text-slate-950 shadow-sm'
                          : 'bg-black/5 dark:bg-slate-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.count !== null && (
                        <span className="ms-1 px-1.5 py-0.2 rounded-full text-[9px] bg-black/20 text-current">
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Sub Tab Contents */}
                <div className="pt-3">
                  {/* Summary Breakdown */}
                  {activeDetailTab === 'summary' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-white/5 space-y-2">
                        <h4 className="font-extrabold text-amber-600">تفاصيل قنوات الدفع للمبيعات:</h4>
                        <div className="flex justify-between py-1 border-b border-white/5">
                          <span className="text-gray-400">مبيعات كاش (نقدي):</span>
                          <span className="font-bold tabular-nums">{formatCurrency(report.sales.cash)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-white/5">
                          <span className="text-gray-400">مبيعات بطاقة مصرفية:</span>
                          <span className="font-bold tabular-nums">{formatCurrency(report.sales.card)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-white/5">
                          <span className="text-gray-400">مبيعات تحويل بنكي:</span>
                          <span className="font-bold tabular-nums">{formatCurrency(report.sales.transfer)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-gray-400">مبيعات آجلة (ديون عملاء):</span>
                          <span className="font-bold text-amber-500 tabular-nums">{formatCurrency(report.sales.debt)}</span>
                        </div>
                      </div>

                      <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-white/5 space-y-2">
                        <h4 className="font-extrabold text-rose-600">تفاصيل المصروفات والخصومات:</h4>
                        <div className="flex justify-between py-1 border-b border-white/5">
                          <span className="text-gray-400">مشتريات مدفوعة كاش:</span>
                          <span className="font-bold tabular-nums">{formatCurrency(report.purchases.cash)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-white/5">
                          <span className="text-gray-400">سحوبات ومصاريف المحل:</span>
                          <span className="font-bold tabular-nums">{formatCurrency(report.withdrawals.total)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-white/5">
                          <span className="text-gray-400">تكلفة التوالف والكسر:</span>
                          <span className="font-bold tabular-nums">{formatCurrency(report.losses.total)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-gray-400">تكلفة الهدايا والعينات:</span>
                          <span className="font-bold tabular-nums">{formatCurrency(report.gifts.total)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Detailed Sales Tab */}
                  {activeDetailTab === 'sales' && (
                    <div className="overflow-x-auto max-h-60 overflow-y-auto scrollbar-thin">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-black/10 dark:bg-slate-800 font-bold text-gray-400 sticky top-0">
                          <tr>
                            <th className="p-2">الفاتورة / الوقت</th>
                            <th className="p-2">العميل</th>
                            <th className="p-2">طريقة الدفع</th>
                            <th className="p-2 text-left">الإجمالي</th>
                            <th className="p-2 text-left">الربح</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {report.sales.items.length === 0 ? (
                            <tr>
                              <td colSpan="5" className="p-4 text-center text-gray-400">لا توجد مبيعات في هذه الوردية</td>
                            </tr>
                          ) : (
                            report.sales.items.map((s, idx) => (
                              <tr key={idx} className="hover:bg-amber-500/5">
                                <td className="p-2 font-mono text-[11px]">{formatDate(s.date)}</td>
                                <td className="p-2 font-bold">{s.customer_name || 'زبون عام'}</td>
                                <td className="p-2">
                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-black/10 dark:bg-slate-800">
                                    {s.payment_method === 'cash'
                                      ? 'كاش'
                                      : s.payment_method === 'card'
                                      ? 'بطاقة'
                                      : s.payment_method === 'bank_transfer'
                                      ? 'تحويل'
                                      : 'آجل'}
                                  </span>
                                </td>
                                <td className="p-2 text-left font-bold text-emerald-600">{formatCurrency(s.total)}</td>
                                <td className="p-2 text-left font-mono text-emerald-700">
                                  {canViewProfit ? formatCurrency(s.profit) : '••••••'}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Detailed Purchases Tab */}
                  {activeDetailTab === 'purchases' && (
                    <div className="overflow-x-auto max-h-60 overflow-y-auto scrollbar-thin">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-black/10 dark:bg-slate-800 font-bold text-gray-400 sticky top-0">
                          <tr>
                            <th className="p-2">التاريخ / المرجع</th>
                            <th className="p-2">المورد</th>
                            <th className="p-2">طريقة الدفع</th>
                            <th className="p-2 text-left">إجمالي الفاتورة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {report.purchases.items.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="p-4 text-center text-gray-400">لا توجد مشتريات مسجلة في هذه الوردية</td>
                            </tr>
                          ) : (
                            report.purchases.items.map((p, idx) => (
                              <tr key={idx} className="hover:bg-amber-500/5">
                                <td className="p-2 font-mono text-[11px]">
                                  {formatDate(p.date)} {p.invoice_ref && `(${p.invoice_ref})`}
                                </td>
                                <td className="p-2 font-bold">{p.supplier_name || 'مورد عام'}</td>
                                <td className="p-2">{p.payment_type === 'cash' ? 'كاش' : 'آجل / أخرى'}</td>
                                <td className="p-2 text-left font-bold text-amber-600">{formatCurrency(p.total)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Detailed Losses Tab */}
                  {activeDetailTab === 'losses' && (
                    <div className="overflow-x-auto max-h-60 overflow-y-auto scrollbar-thin">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-black/10 dark:bg-slate-800 font-bold text-gray-400 sticky top-0">
                          <tr>
                            <th className="p-2">الصنف التالف</th>
                            <th className="p-2 text-center">الكمية</th>
                            <th className="p-2">سبب التلف</th>
                            <th className="p-2 text-left">قيمة الخسارة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {report.losses.items.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="p-4 text-center text-gray-400">لا توجد توالف أو فاقد مسجل</td>
                            </tr>
                          ) : (
                            report.losses.items.map((l, idx) => (
                              <tr key={idx} className="hover:bg-rose-500/5">
                                <td className="p-2 font-bold">{l.item_name}</td>
                                <td className="p-2 text-center">
                                  {l.qty} {l.unit}
                                </td>
                                <td className="p-2 text-gray-400">{l.reason}</td>
                                <td className="p-2 text-left font-bold text-rose-600">{formatCurrency(l.cost_value)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Detailed Withdrawals Tab */}
                  {activeDetailTab === 'withdrawals' && (
                    <div className="overflow-x-auto max-h-60 overflow-y-auto scrollbar-thin">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-black/10 dark:bg-slate-800 font-bold text-gray-400 sticky top-0">
                          <tr>
                            <th className="p-2">المستلم / البند</th>
                            <th className="p-2">السبب / التصنيف</th>
                            <th className="p-2 text-left">المبلغ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {report.withdrawals.items.length === 0 ? (
                            <tr>
                              <td colSpan="3" className="p-4 text-center text-gray-400">لا توجد سحوبات نقدية</td>
                            </tr>
                          ) : (
                            report.withdrawals.items.map((w, idx) => (
                              <tr key={idx} className="hover:bg-amber-500/5">
                                <td className="p-2 font-bold">{w.person || 'سحب عام'}</td>
                                <td className="p-2 text-gray-400">{w.reason || w.category || '—'}</td>
                                <td className="p-2 text-left font-bold text-rose-600">{formatCurrency(w.amount)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Detailed Capital Tab */}
                  {activeDetailTab === 'capital' && (
                    <div className="overflow-x-auto max-h-60 overflow-y-auto scrollbar-thin">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-black/10 dark:bg-slate-800 font-bold text-gray-400 sticky top-0">
                          <tr>
                            <th className="p-2">المصدر</th>
                            <th className="p-2">الملاحظات</th>
                            <th className="p-2 text-left">المبلغ المضاف للخزينة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {report.capital.items.length === 0 ? (
                            <tr>
                              <td colSpan="3" className="p-4 text-center text-gray-400">لا يوجد ضخ مالي مسجل</td>
                            </tr>
                          ) : (
                            report.capital.items.map((c, idx) => (
                              <tr key={idx} className="hover:bg-blue-500/5">
                                <td className="p-2 font-bold">{c.source || 'ضخ مالي'}</td>
                                <td className="p-2 text-gray-400">{c.notes || '—'}</td>
                                <td className="p-2 text-left font-bold text-blue-600">{formatCurrency(c.amount)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Detailed Gifts Tab */}
                  {activeDetailTab === 'gifts' && (
                    <div className="overflow-x-auto max-h-60 overflow-y-auto scrollbar-thin">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-black/10 dark:bg-slate-800 font-bold text-gray-400 sticky top-0">
                          <tr>
                            <th className="p-2">المهدى إليه</th>
                            <th className="p-2">المنتج</th>
                            <th className="p-2 text-center">الكمية</th>
                            <th className="p-2 text-left">التكلفة</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {report.gifts.items.length === 0 ? (
                            <tr>
                              <td colSpan="4" className="p-4 text-center text-gray-400">لا توجد هدايا أو عينات مسجلة</td>
                            </tr>
                          ) : (
                            report.gifts.items.map((g, idx) => (
                              <tr key={idx} className="hover:bg-purple-500/5">
                                <td className="p-2 font-bold">{g.recipient || 'زبون'}</td>
                                <td className="p-2">{g.item_name}</td>
                                <td className="p-2 text-center">{g.qty}</td>
                                <td className="p-2 text-left font-bold text-purple-600">{formatCurrency(g.cost_value)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Detailed Notes Tab */}
                  {activeDetailTab === 'notes' && (
                    <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-thin">
                      {report.notes.items.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-xs">لا توجد ملاحظات أو تنبيهات مسجلة في هذه الوردية</div>
                      ) : (
                        report.notes.items.map((n, idx) => (
                          <div key={idx} className="p-2.5 bg-black/10 dark:bg-slate-900 rounded-xl text-xs space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-[#2D2424] dark:text-white">{n.title || 'ملاحظة وردية'}</span>
                              <span className="text-[10px] text-gray-400">{formatDate(n.date)}</span>
                            </div>
                            <p className="text-gray-500 dark:text-slate-300">{n.content || n.notes}</p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5 pt-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleExportPDF(report)}
                  disabled={isExportingPDF}
                  className="btn-atelier-secondary py-2.5 px-5 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                  title="تصدير تقرير الوردية وحفظه مباشرة كملف PDF على الجهاز"
                >
                  <FileDown className="w-4 h-4 text-amber-500" />
                  <span>{isExportingPDF ? 'جاري تصدير PDF...' : '📄 تصدير كملف PDF'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePrint(report)}
                  disabled={isPrinting}
                  className="btn-atelier-secondary py-2.5 px-5 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                  title="طباعة التقرير الشامل"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isPrinting ? 'جاري الإرسال...' : '🖨️ طباعة التقرير'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndCloseShift}
                  disabled={savingShift}
                  className="flex-1 min-w-[200px] btn-atelier-primary py-2.5 text-xs font-extrabold flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    {savingShift ? 'جاري حفظ وإغلاق الوردية...' : '💾 حفظ وإغلاق الوردية نهائياً'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Past Shift Reports History */
        <div className="flex-1 overflow-y-auto space-y-2.5 scrollbar-thin pr-1">
          {pastReports.length === 0 ? (
            <div className="atelier-card p-12 text-center flex flex-col items-center justify-center gap-3">
              <History className="w-12 h-12 text-gray-300 dark:text-slate-600" />
              <div className="text-sm font-bold text-gray-600 dark:text-gray-300">لا توجد تقارير ورديات مغلقة سابقة</div>
              <p className="text-xs text-gray-400">عند إغلاق أي وردية سيتم أرشفة كامل تقريرها هنا للرجوع إليها وتصديرها PDF أو طباعتها</p>
            </div>
          ) : (
            pastReports.map((item) => {
              let parsed = null;
              try {
                parsed = JSON.parse(item.report_data_json || '{}');
              } catch (e) {}

              return (
                <div
                  key={item.id}
                  className="atelier-card p-3.5 flex justify-between items-center hover:border-amber-500/40 transition-all shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-[#2D2424] dark:text-white">
                        وردية: {item.cashier_name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        {item.start_date} إلى {item.end_date}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 flex items-center gap-3">
                      <span>إجمالي المبيعات: {formatCurrency(item.total_sales)}</span>
                      <span>صافي الربح: {formatCurrency(item.total_profit)}</span>
                      <span
                        className={
                          item.variance >= 0 ? 'text-emerald-500 font-bold' : 'text-rose-500 font-bold'
                        }
                      >
                        الفارق: {item.variance >= 0 ? '+' : ''}
                        {formatCurrency(item.variance)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleExportPDF(parsed || item)}
                      className="btn-atelier-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 font-bold cursor-pointer"
                      title="تصدير كملف PDF على الجهاز"
                    >
                      <FileDown className="w-3.5 h-3.5 text-amber-500" />
                      <span>تصدير PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePrint(parsed || item)}
                      className="btn-atelier-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 font-bold cursor-pointer"
                      title="إعادة طباعة تقرير الوردية"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-500" />
                      <span>طباعة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                      title="حذف تقرير الوردية"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        isOpen={Boolean(deleteTarget)}
        title="تأكيد حذف تقرير الوردية"
        message={`هل أنت متأكد من حذف تقرير الوردية للكاشير "${deleteTarget?.cashier_name}" للفترة من (${deleteTarget?.start_date}) إلى (${deleteTarget?.end_date})؟`}
        confirmText="نعم، حذف نهائياً"
        cancelText="إلغاء"
        type="danger"
        danger={true}
        isLoading={isDeleting}
        onConfirm={handleDeleteReport}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default ShiftCloseModule;
