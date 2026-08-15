import React, { useState } from 'react';
import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { PurchasesRepository } from '../database/repositories/PurchasesRepository.js';
import { WithdrawalsRepository } from '../database/repositories/WithdrawalsRepository.js';
import { CapitalRepository } from '../database/repositories/CapitalRepository.js';
import { GiftsRepository } from '../database/repositories/GiftsRepository.js';
import { LossesRepository } from '../database/repositories/LossesRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency } from '../utils/helpers.js';

const salesRepo = new SalesRepository();
const purchasesRepo = new PurchasesRepository();
const withdrawalsRepo = new WithdrawalsRepository();
const capitalRepo = new CapitalRepository();
const giftsRepo = new GiftsRepository();
const lossesRepo = new LossesRepository();

const ShiftCloseModule = () => {
  const { showError } = useUIStore();

  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedCash, setExpectedCash] = useState('');
  const [actualCash, setActualCash] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

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
      const cashSales = sales.filter(s => s.payment_method === 'cash');
      const cardSales = sales.filter(s => s.payment_method === 'card');
      const transferSales = sales.filter(s => s.payment_method === 'bank_transfer');

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

      // Print report via unified Electron IPC
      try {
        if (window.electronAPI) {
          await window.electronAPI.invoke('print:shift-report', reportData);
        } else if (window.require) {
          await window.require('electron').ipcRenderer.invoke('print:shift-report', reportData);
        }
      } catch (printError) {
        console.warn('Print shift report failed:', printError);
      }
    } catch (error) {
      showError('خطأ في إنشاء التقرير: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex gap-6">
      {/* Form Panel */}
      <div className="w-[400px] flex flex-col glass-card p-6 h-full justify-between overflow-y-auto">
        <div>
          <h2 className="text-2xl font-bold text-gold mb-4 flex items-center gap-2">
            <span>📊</span>
            <span>إغلاق الوردية والحسابات</span>
          </h2>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">من تاريخ</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">إلى تاريخ</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">الرصيد المتوقع (اختياري)</label>
              <input
                type="number"
                placeholder="0.00"
                value={expectedCash}
                onChange={(e) => setExpectedCash(e.target.value)}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                step="0.01"
              />
            </div>

            <div>
              <label className="text-sm text-gray-400 mb-1 block">النقد الفعلي في الدرج</label>
              <input
                type="number"
                placeholder="0.00"
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                step="0.01"
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 pt-3">
          <button
            onClick={generateReport}
            disabled={loading}
            className="btn-gold w-full py-4 text-xl disabled:opacity-50 shadow-lg cursor-pointer"
          >
            {loading ? '⏳ جاري الإعداد...' : '📄 إنشاء التقرير'}
          </button>
        </div>
      </div>

      {/* Report Preview Panel */}
      <div className="flex-1 flex flex-col glass-card p-6">
        <h2 className="text-2xl font-bold text-gold mb-4">معاينة التقرير</h2>

        {!report ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-6xl mb-4">📊</div>
              <div>املأ البيانات وانقر على "إنشاء التقرير"</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-4">
            {/* Period */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="font-bold text-lg mb-2">الفترة</h3>
              <div className="text-sm">
                من {new Date(report.period.start).toLocaleDateString('ar-SD')} إلى {new Date(report.period.end).toLocaleDateString('ar-SD')}
              </div>
            </div>

            {/* Sales Summary */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="font-bold text-lg mb-3">المبيعات</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">عدد الفواتير:</span>
                  <span className="font-bold">{report.sales.count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">إجمالي المبيعات:</span>
                  <span className="font-bold text-green-400">{formatCurrency(report.sales.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">نقدي:</span>
                  <span>{formatCurrency(report.sales.cash)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">بطاقة:</span>
                  <span>{formatCurrency(report.sales.card)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">تحويل:</span>
                  <span>{formatCurrency(report.sales.transfer)}</span>
                </div>
              </div>
            </div>

            {/* Profit */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-bold text-lg">صافي الربح</span>
                <span className="text-2xl font-bold text-gold">{formatCurrency(report.profit)}</span>
              </div>
            </div>

            {/* Expenses */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="font-bold text-lg mb-3">المصروفات</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">المشتريات:</span>
                  <span className="text-red-400">{formatCurrency(report.expenses.purchases)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">السحوبات:</span>
                  <span className="text-red-400">{formatCurrency(report.expenses.withdrawals)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">الخسائر:</span>
                  <span className="text-red-400">{formatCurrency(report.expenses.losses)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">الهدايا:</span>
                  <span className="text-red-400">{formatCurrency(report.expenses.gifts)}</span>
                </div>
              </div>
            </div>

            {/* Capital */}
            {report.capital > 0 && (
              <div className="bg-gray-800 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg">الضخ الرأسمالي</span>
                  <span className="text-xl font-bold text-blue-400">{formatCurrency(report.capital)}</span>
                </div>
              </div>
            )}

            {/* Cash Reconciliation */}
            <div className="bg-gray-800 p-4 rounded-lg">
              <h3 className="font-bold text-lg mb-3">تسوية النقد</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">النقد المتوقع:</span>
                  <span className="font-bold">{formatCurrency(report.cash.expected)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">النقد الفعلي:</span>
                  <span className="font-bold">{formatCurrency(report.cash.actual)}</span>
                </div>
                <div className={`flex justify-between pt-2 border-t ${report.cash.variance >= 0 ? 'border-green-700' : 'border-red-700'}`}>
                  <span className="font-bold">الفرق:</span>
                  <span className={`text-xl font-bold ${report.cash.variance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {report.cash.variance >= 0 ? '+' : ''}{formatCurrency(report.cash.variance)}
                  </span>
                </div>
              </div>
            </div>

            {report.cash.variance !== 0 && (
              <div className={`p-3 rounded-lg border ${report.cash.variance > 0 ? 'bg-green-600/10 border-green-400/30' : 'bg-red-600/10 border-red-400/30'}`}>
                <div className={`text-sm ${report.cash.variance > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {report.cash.variance > 0 ? '💰 فائض نقدي' : '⚠️ عجز نقدي'}: يوجد فرق {Math.abs(report.cash.variance).toFixed(2)} بين النقد المتوقع والفعلي
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ShiftCloseModule;
