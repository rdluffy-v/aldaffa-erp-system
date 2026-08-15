import React, { useState, useEffect, useCallback } from 'react';
import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { PurchasesRepository } from '../database/repositories/PurchasesRepository.js';
import { WithdrawalsRepository } from '../database/repositories/WithdrawalsRepository.js';
import { CapitalRepository } from '../database/repositories/CapitalRepository.js';
import { GiftsRepository } from '../database/repositories/GiftsRepository.js';
import { LossesRepository } from '../database/repositories/LossesRepository.js';
import { BaseRepository } from '../database/repositories/BaseRepository.js';
import { db } from '../database/connection.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate, generateId } from '../utils/helpers.js';
import { Lock, Printer, CheckCircle, Clock, History, FileText } from 'lucide-react';

const salesRepo = new SalesRepository();
const purchasesRepo = new PurchasesRepository();
const withdrawalsRepo = new WithdrawalsRepository();
const capitalRepo = new CapitalRepository();
const giftsRepo = new GiftsRepository();
const lossesRepo = new LossesRepository();
const shiftReportsRepo = new BaseRepository('shift_reports');

const ShiftCloseModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const [cashierName, setCashierName] = useState('الكاشير المناوب');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedCash, setExpectedCash] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingShift, setSavingShift] = useState(false);
  const [pastReports, setPastReports] = useState([]);
  const [activeTab, setActiveTab] = useState('current'); // 'current' | 'history'

  // Ensure table exists
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
            created_at TEXT
          )
        `);
      } catch (e) {
        console.warn('shift_reports table creation:', e);
      }
    };
    initTable();
    loadPastReports();
  }, []);

  const loadPastReports = async () => {
    try {
      const rows = await shiftReportsRepo.findAll({}, 'created_at DESC');
      setPastReports(rows || []);
    } catch (e) {
      console.warn('loadPastReports error:', e);
    }
  };

  const generateReport = async () => {
    setLoading(true);

    try {
      const start = new Date(startDate).toISOString();
      const end = new Date(endDate + 'T23:59:59').toISOString();

      // Gather all financial data via repositories
      const [sales, purchases, withdrawals, capitalInjections, losses, gifts] =
        await Promise.all([
          salesRepo.getSalesInRange(start, end),
          purchasesRepo.getPurchasesInRange(start, end),
          withdrawalsRepo.getWithdrawalsInRange(start, end),
          capitalRepo.getInjectionsInRange(start, end),
          lossesRepo.getLossesInRange(start, end),
          giftsRepo.getGiftsInRange(start, end)
        ]);

      // Calculate totals
      const cashSales = sales.filter((s) => s.payment_method === 'cash');
      const cardSales = sales.filter((s) => s.payment_method === 'card');
      const transferSales = sales.filter((s) => s.payment_method === 'bank_transfer');

      const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
      const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0);
      const totalCashSales = cashSales.reduce((sum, s) => sum + s.total, 0);
      const totalCardSales = cardSales.reduce((sum, s) => sum + s.total, 0);
      const totalTransferSales = transferSales.reduce((sum, s) => sum + s.total, 0);

      const totalPurchases = purchases.reduce((sum, p) => sum + p.total, 0);
      const totalWithdrawals = withdrawals.reduce((sum, w) => sum + w.amount, 0);
      const totalCapital = capitalInjections.reduce((sum, c) => sum + c.amount, 0);
      const totalLosses = losses.reduce((sum, l) => sum + l.cost_value, 0);
      const totalGifts = gifts.reduce((sum, g) => sum + g.cost_value, 0);

      const expectedCashBalance = totalCashSales + totalCapital - totalWithdrawals;
      const actualCashValue = parseFloat(actualCash) || 0;
      const variance = actualCashValue - expectedCashBalance;

      const reportData = {
        cashier: cashierName,
        period: { start: startDate, end: endDate },
        sales: {
          total: totalRevenue,
          count: sales.length,
          cash: totalCashSales,
          card: totalCardSales,
          transfer: totalTransferSales
        },
        profit: totalProfit,
        expenses: {
          purchases: totalPurchases,
          withdrawals: totalWithdrawals,
          losses: totalLosses,
          gifts: totalGifts
        },
        capital: totalCapital,
        cash: {
          expected: expectedCashBalance,
          actual: actualCashValue,
          variance
        }
      };

      setReport(reportData);
      showSuccess('✅ تم إعداد تقرير الوردية بنجاح');
    } catch (error) {
      showError('خطأ في إنشاء التقرير: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (reportData) => {
    try {
      const electron = window.require ? window.require('electron') : null;
      if (electron) {
        await electron.ipcRenderer.invoke('print:shift-report', reportData);
        showSuccess('✅ تم إرسال تقرير الوردية للطباعة');
      } else {
        window.print();
      }
    } catch (printError) {
      console.warn('Print shift report failed:', printError);
    }
  };

  const handleSaveAndCloseShift = async () => {
    if (!report) {
      showWarning('يرجى إنشاء التقرير أولاً');
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
      await handlePrint(report);
      showSuccess('✅ تم حفظ وإغلاق الوردية نهائياً وطباعة الإيصال');
    } catch (err) {
      showError(`فشل حفظ إغلاق الوردية: ${err.message}`);
    } finally {
      setSavingShift(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Top Header */}
      <div className="atelier-card p-4 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#2D2424] dark:text-white">إغلاق الوردية وتسوية الحسابات</h1>
            <p className="text-xs text-[#5C524F] dark:text-slate-400">جرد النقدية، مطابقة الرصيد، حفظ السجلات وطباعة التقارير</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex rounded-full bg-gray-200 dark:bg-slate-800 p-1 border border-amber-500/20">
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'current'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-[#5C524F] dark:text-slate-300 hover:text-[#2D2424] dark:hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>إغلاق الوردية الحالية</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-[#5C524F] dark:text-slate-300 hover:text-[#2D2424] dark:hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>سجل الورديات السابقة ({pastReports.length})</span>
          </button>
        </div>
      </div>

      {activeTab === 'current' ? (
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Inputs Column */}
          <div className="w-[360px] flex flex-col atelier-card p-5 h-full justify-between overflow-y-auto">
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-[#2D2424] dark:text-amber-300 mb-2">بيانات الوردية</h2>

              <div>
                <label className="text-[11px] font-bold text-gray-500 mb-1 block">اسم الكاشير / المسؤول</label>
                <input
                  type="text"
                  value={cashierName}
                  onChange={(e) => setCashierName(e.target.value)}
                  className="input-atelier w-full text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-gray-500 mb-1 block">من تاريخ</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input-atelier w-full text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 mb-1 block">إلى تاريخ</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input-atelier w-full text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 mb-1 block">النقد الفعلي المعدود في الدرج (د.ل)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  className="input-atelier w-full text-sm font-bold text-emerald-600 dark:text-emerald-400"
                  step="0.01"
                />
              </div>
            </div>

            <div className="space-y-2 pt-4">
              <button
                onClick={generateReport}
                disabled={loading}
                className="btn-atelier-secondary w-full py-2.5 text-xs font-bold"
              >
                {loading ? '⏳ جاري الحساب...' : '📊 حساب ومعاينة التقرير'}
              </button>

              {report && (
                <button
                  onClick={handleSaveAndCloseShift}
                  disabled={savingShift}
                  className="btn-atelier-primary w-full py-3 text-xs font-bold shadow-lg flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{savingShift ? '⏳ جاري الحفظ...' : '🔒 حفظ وإغلاق الوردية نهائياً'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Report Preview */}
          <div className="flex-1 atelier-card p-5 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-bold text-[#2D2424] dark:text-white">معاينة تقرير تسوية الوردية</h2>
              {report && (
                <button
                  onClick={() => handlePrint(report)}
                  className="btn-atelier-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5 text-amber-600" />
                  <span>طباعة فورية</span>
                </button>
              )}
            </div>

            {!report ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <FileText className="w-12 h-12 mb-2 stroke-1" />
                <p className="text-xs">اضغط على "حساب ومعاينة التقرير" لمطابقة الأرقام</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 text-xs">
                {/* Period & Cashier */}
                <div className="bg-amber-50/70 dark:bg-slate-800/60 p-3 rounded-2xl border border-amber-200/50 dark:border-white/5 flex justify-between">
                  <div>
                    <span className="text-gray-500">الفترة:</span>{' '}
                    <span className="font-bold">{new Date(report.period.start).toLocaleDateString('ar-LY')} إلى {new Date(report.period.end).toLocaleDateString('ar-LY')}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">الكاشير:</span>{' '}
                    <span className="font-bold">{report.cashier}</span>
                  </div>
                </div>

                {/* Sales & Profit */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/80 dark:bg-slate-800/80 p-3 rounded-2xl border border-amber-500/10 space-y-1.5">
                    <h3 className="font-bold text-gray-700 dark:text-slate-300">المبيعات</h3>
                    <div className="flex justify-between">
                      <span className="text-gray-400">عدد الفواتير:</span>
                      <span className="font-bold">{report.sales.count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">إجمالي المبيعات:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(report.sales.total)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>نقدي: {formatCurrency(report.sales.cash)}</span>
                      <span>بطاقة: {formatCurrency(report.sales.card)}</span>
                    </div>
                  </div>

                  <div className="bg-white/80 dark:bg-slate-800/80 p-3 rounded-2xl border border-amber-500/10 space-y-1.5">
                    <h3 className="font-bold text-gray-700 dark:text-slate-300">الأرباح والمصروفات</h3>
                    <div className="flex justify-between">
                      <span className="text-gray-400">صافي الربح:</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(report.profit)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">المشتريات:</span>
                      <span className="font-bold text-red-500">{formatCurrency(report.expenses.purchases)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>سحوبات: {formatCurrency(report.expenses.withdrawals)}</span>
                      <span>فاقد: {formatCurrency(report.expenses.losses)}</span>
                    </div>
                  </div>
                </div>

                {/* Cash Reconciliation */}
                <div className="bg-amber-50/70 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-amber-200/50 dark:border-white/5 space-y-2">
                  <h3 className="font-bold text-gray-700 dark:text-slate-300">تسوية النقدية والدرج</h3>
                  <div className="flex justify-between">
                    <span className="text-gray-500">النقد المتوقع حسابه (المبيعات النقدية + الضخ - السحوبات):</span>
                    <span className="font-bold tabular-nums">{formatCurrency(report.cash.expected)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">النقد الفعلي المعدود:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(report.cash.actual)}</span>
                  </div>
                  <div className="flex justify-between border-t border-amber-500/20 pt-2 font-bold text-sm">
                    <span>فارق التسوية (الزيادة / العجز):</span>
                    <span className={`tabular-nums ${report.cash.variance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {report.cash.variance >= 0 ? '+' : ''}{formatCurrency(report.cash.variance)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* History Tab */
        <div className="atelier-card flex-1 p-4 overflow-y-auto scrollbar-thin space-y-2">
          {pastReports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <History className="w-12 h-12 mb-2 stroke-1" />
              <p className="text-sm font-medium">لا توجد ورديات سابقة محفوظة</p>
            </div>
          ) : (
            pastReports.map((row) => {
              let parsedData = null;
              try {
                parsedData = JSON.parse(row.report_data_json || '{}');
              } catch (e) {}

              return (
                <div key={row.id} className="p-3.5 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-amber-500/15 flex justify-between items-center hover:border-amber-500/30 transition-all text-xs">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-[#2D2424] dark:text-white">وردية #{row.id.slice(0, 8)}</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold text-[10px]">
                        الكاشير: {row.cashier_name}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      التاريخ: {formatDate(row.created_at)} | الفترة: {row.start_date} إلى {row.end_date}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-left">
                      <div className="font-bold text-emerald-600 dark:text-emerald-400">
                        مبيعات: {formatCurrency(row.total_sales)}
                      </div>
                      <div className={`text-[11px] ${row.variance >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        الفارق: {row.variance >= 0 ? '+' : ''}{formatCurrency(row.variance)}
                      </div>
                    </div>

                    <button
                      onClick={() => handlePrint(parsedData || row)}
                      className="btn-atelier-secondary py-1.5 px-3 text-xs flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>إعادة طباعة</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default ShiftCloseModule;
