/**
 * ============================================================================
 * ADVANCED FINANCIAL ANALYTICS & PROFIT CHARTS MODULE (التقارير والتحليلات المتقدمة)
 * ============================================================================
 * High-End Visual Design & Interactive Recharts Dashboard
 * Real-time revenue, gross profit, cost breakdowns, liquidity flow, category
 * analytics, top profitable products, CSV export with UTF-8 BOM, and PDF export.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PieChart as PieChartIcon,
  BarChart3,
  Calendar,
  Download,
  Printer,
  FileText,
  Filter,
  Sparkles,
  ShoppingBag,
  ShoppingCart,
  Award,
  Wallet,
  ArrowUpRight,
  RefreshCw,
  Layers,
  ArrowDownRight,
  Minus,
  Coins,
  FileSpreadsheet
} from 'lucide-react';

import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { PurchasesRepository } from '../database/repositories/PurchasesRepository.js';
import { WithdrawalsRepository } from '../database/repositories/WithdrawalsRepository.js';
import { LossesRepository } from '../database/repositories/LossesRepository.js';
import { CapitalRepository } from '../database/repositories/CapitalRepository.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useSettingsStore } from '../stores/useSettingsStore.js';
import { useAuthStore } from '../stores/useAuthStore.js';
import { formatCurrency, formatDate, safeParseFloat } from '../utils/helpers.js';

const salesRepo = new SalesRepository();
const purchasesRepo = new PurchasesRepository();
const withdrawalsRepo = new WithdrawalsRepository();
const lossesRepo = new LossesRepository();
const capitalRepo = new CapitalRepository();
const inventoryRepo = new InventoryRepository();

const COLORS = ['#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#8B5CF6', '#14B8A6', '#F97316'];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0d1117] border border-amber-500/30 p-3 rounded-xl shadow-2xl backdrop-blur-md text-xs space-y-1.5 min-w-[140px]">
        <p className="font-bold text-[#e6edf3] border-b border-white/10 pb-1">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex items-center justify-between gap-4" style={{ color: entry.color }}>
            <span>{entry.name}:</span>
            <span className="font-bold font-mono">{formatCurrency(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const AnalyticsModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();
  const settings = useSettingsStore((s) => s.settings);
  const currencySymbol = useSettingsStore((s) => s.getSetting('currency_symbol', 'د.ل'));
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canViewProfit = hasPermission('view_profit');

  // Preset Filters: 'today' | 'this_week' | 'this_month' | 'ytd' | 'custom'
  const [dateRange, setDateRange] = useState('this_month');
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);

  // Table active tab: 'top_selling' | 'top_profitable'
  const [tableTab, setTableTab] = useState('top_selling');

  // Raw Financial Data
  const [salesList, setSalesList] = useState([]);
  const [purchasesList, setPurchasesList] = useState([]);
  const [withdrawalsList, setWithdrawalsList] = useState([]);
  const [lossesList, setLossesList] = useState([]);
  const [capitalList, setCapitalList] = useState([]);
  const [topSellingProducts, setTopSellingProducts] = useState([]);
  const [mostProfitableProducts, setMostProfitableProducts] = useState([]);
  const [categorySales, setCategorySales] = useState([]);

  // Calculate actual ISO date bounds based on preset
  const calculateDateBounds = useCallback(() => {
    const now = new Date();
    let startStr = startDate;
    let endStr = endDate;

    if (dateRange === 'today') {
      startStr = now.toISOString().split('T')[0];
      endStr = startStr;
    } else if (dateRange === 'this_week') {
      const day = now.getDay(); // 0 is Sunday
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(now.setDate(diff));
      startStr = monday.toISOString().split('T')[0];
      endStr = new Date().toISOString().split('T')[0];
    } else if (dateRange === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      startStr = firstDay.toISOString().split('T')[0];
      endStr = new Date().toISOString().split('T')[0];
    } else if (dateRange === 'ytd') {
      const firstDayOfYear = new Date(now.getFullYear(), 0, 1);
      startStr = firstDayOfYear.toISOString().split('T')[0];
      endStr = new Date().toISOString().split('T')[0];
    }

    const startIso = new Date(startStr + 'T00:00:00.000Z').toISOString();
    const endIso = new Date(endStr + 'T23:59:59.999Z').toISOString();

    return { startStr, endStr, startIso, endIso };
  }, [dateRange, startDate, endDate]);

  // Fetch Data according to range using indexed queries
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { startStr, endStr, startIso, endIso } = calculateDateBounds();

      const [
        sales,
        purchases,
        withdrawals,
        losses,
        capitals,
        topSelling,
        mostProfitable,
        byCategory
      ] = await Promise.all([
        salesRepo.getSalesInRange(startIso, endIso),
        purchasesRepo.getPurchasesInRange(startIso, endIso),
        withdrawalsRepo.getWithdrawalsInRange(startIso, endIso),
        lossesRepo.getLossesInRange(startIso, endIso),
        capitalRepo.getInjectionsInRange(startIso, endIso),
        salesRepo.getTopSellingProducts(10, startIso, endIso),
        salesRepo.getMostProfitableProducts(10, startIso, endIso),
        salesRepo.getSalesByCategory(startIso, endIso)
      ]);

      setSalesList(sales || []);
      setPurchasesList(purchases || []);
      setWithdrawalsList(withdrawals || []);
      setLossesList(losses || []);
      setCapitalList(capitals || []);
      setTopSellingProducts(topSelling || []);
      setMostProfitableProducts(mostProfitable || []);
      setCategorySales(byCategory || []);
    } catch (err) {
      showError(`فشل تحميل بيانات التحليلات: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [calculateDateBounds, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculated Metrics
  const metrics = useMemo(() => {
    const totalRevenue = salesList.reduce((acc, s) => acc + safeParseFloat(s.total), 0);
    const totalProfit = salesList.reduce((acc, s) => acc + safeParseFloat(s.profit), 0);
    const totalPurchases = purchasesList.reduce((acc, p) => acc + safeParseFloat(p.total), 0);
    const totalWithdrawals = withdrawalsList.reduce((acc, w) => acc + safeParseFloat(w.amount), 0);
    const totalLosses = lossesList.reduce((acc, l) => acc + safeParseFloat(l.cost_value), 0);
    const totalCapital = capitalList.reduce((acc, c) => acc + safeParseFloat(c.amount), 0);

    const netProfit = totalProfit - totalWithdrawals - totalLosses;
    const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';
    const avgOrderValue = salesList.length > 0 ? (totalRevenue / salesList.length).toFixed(2) : '0';

    return {
      totalRevenue,
      totalProfit,
      netProfit,
      totalPurchases,
      totalWithdrawals,
      totalLosses,
      totalCapital,
      profitMargin,
      avgOrderValue,
      invoiceCount: salesList.length
    };
  }, [salesList, purchasesList, withdrawalsList, lossesList, capitalList]);

  // Time Series Chart Data (Grouped by Date)
  const timeSeriesData = useMemo(() => {
    const map = {};
    salesList.forEach((s) => {
      const d = (s.date || '').split('T')[0] || 'اليوم';
      if (!map[d]) map[d] = { date: d, revenue: 0, profit: 0, count: 0 };
      map[d].revenue += safeParseFloat(s.total);
      map[d].profit += safeParseFloat(s.profit);
      map[d].count += 1;
    });

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [salesList]);

  // Liquidity Flow Chart Data (Daily Inflow vs Outflow)
  const liquidityData = useMemo(() => {
    const map = {};

    salesList.forEach((s) => {
      const d = (s.date || '').split('T')[0];
      if (d) {
        if (!map[d]) map[d] = { date: d, inflow: 0, outflow: 0 };
        map[d].inflow += safeParseFloat(s.total);
      }
    });

    capitalList.forEach((c) => {
      const d = (c.date || '').split('T')[0];
      if (d) {
        if (!map[d]) map[d] = { date: d, inflow: 0, outflow: 0 };
        map[d].inflow += safeParseFloat(c.amount);
      }
    });

    purchasesList.forEach((p) => {
      const d = (p.date || '').split('T')[0];
      if (d) {
        if (!map[d]) map[d] = { date: d, inflow: 0, outflow: 0 };
        map[d].outflow += safeParseFloat(p.total);
      }
    });

    withdrawalsList.forEach((w) => {
      const d = (w.date || '').split('T')[0];
      if (d) {
        if (!map[d]) map[d] = { date: d, inflow: 0, outflow: 0 };
        map[d].outflow += safeParseFloat(w.amount);
      }
    });

    lossesList.forEach((l) => {
      const d = (l.date || '').split('T')[0];
      if (d) {
        if (!map[d]) map[d] = { date: d, inflow: 0, outflow: 0 };
        map[d].outflow += safeParseFloat(l.cost_value);
      }
    });

    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        netFlow: item.inflow - item.outflow
      }));
  }, [salesList, capitalList, purchasesList, withdrawalsList, lossesList]);

  // Payment Methods Breakdown (Pie Chart)
  const paymentBreakdown = useMemo(() => {
    let cash = 0,
      card = 0,
      transfer = 0,
      debt = 0;
    salesList.forEach((s) => {
      const amt = safeParseFloat(s.total);
      if (s.payment_method === 'card') card += amt;
      else if (s.payment_method === 'bank_transfer') transfer += amt;
      else if (s.payment_method === 'debt') debt += amt;
      else cash += amt;
    });

    return [
      { name: 'نقدي (كاش)', value: cash },
      { name: 'بطاقة مصرفية', value: card },
      { name: 'تحويل مصرفي', value: transfer },
      { name: 'آجل (ديون)', value: debt }
    ].filter((item) => item.value > 0);
  }, [salesList]);

  // Export CSV with UTF-8 BOM
  const handleExportCSV = () => {
    try {
      const { startStr, endStr } = calculateDateBounds();
      const rows = [
        ['تقرير التحليلات والأداء المالي'],
        [`الفترة: من ${startStr} إلى ${endStr}`],
        [''],
        ['المؤشر المالي', 'القيمة', 'العملة'],
        ['إجمالي المبيعات', metrics.totalRevenue.toFixed(2), currencySymbol],
        ['مجمل الأرباح', canViewProfit ? metrics.totalProfit.toFixed(2) : 'محمي', currencySymbol],
        ['صافي الأرباح', canViewProfit ? metrics.netProfit.toFixed(2) : 'محمي', currencySymbol],
        ['هامش الربح التشغيلي', `${metrics.profitMargin}%`, ''],
        ['متوسط قيمة الفاتورة', metrics.avgOrderValue, currencySymbol],
        ['إجمالي المشتريات', metrics.totalPurchases.toFixed(2), currencySymbol],
        ['إجمالي المصروفات والسحوبات', metrics.totalWithdrawals.toFixed(2), currencySymbol],
        ['قيمة التوالف والضياع', metrics.totalLosses.toFixed(2), currencySymbol],
        ['رأس المال وضخ التمويل', metrics.totalCapital.toFixed(2), currencySymbol],
        [''],
        ['الأصناف الأكثر مبيعاً'],
        ['المنتج', 'الكمية المباعة', 'إجمالي المبيعات', 'الربح المحقق']
      ];

      topSellingProducts.forEach((p) => {
        rows.push([
          p.name || 'منتج',
          p.total_qty || 0,
          Number(p.total_revenue || 0).toFixed(2),
          canViewProfit ? Number(p.total_profit || 0).toFixed(2) : 'محمي'
        ]);
      });

      const csvContent = '\uFEFF' + rows.map((e) => e.map((c) => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `financial_report_${startStr}_${endStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showSuccess('✅ تم تصدير التقرير المالي كملف CSV بنجاح');
    } catch (e) {
      showError('خطأ أثناء تصدير CSV: ' + e.message);
    }
  };

  // Export PDF Report via IPC
  const handleExportPDF = async () => {
    try {
      const { startStr, endStr } = calculateDateBounds();
      const electron = window.require ? window.require('electron') : null;

      if (electron?.ipcRenderer) {
        showSuccess('جاري إعداد ومعالجة تقرير PDF المالي الشامل...');
        const payload = {
          reportData: {
            periodLabel:
              dateRange === 'today'
                ? 'اليوم'
                : dateRange === 'this_week'
                ? 'هذا الأسبوع'
                : dateRange === 'this_month'
                ? 'هذا الشهر'
                : dateRange === 'ytd'
                ? 'منذ بداية العام'
                : 'فترة مخصصة',
            startDate: startStr,
            endDate: endStr,
            metrics: {
              ...metrics,
              totalProfit: canViewProfit ? metrics.totalProfit : 0,
              netProfit: canViewProfit ? metrics.netProfit : 0,
              profitMargin: canViewProfit ? metrics.profitMargin : 0
            },
            paymentMethods: paymentBreakdown,
            topProducts: canViewProfit ? mostProfitableProducts : topSellingProducts,
            categories: categorySales
          },
          templateConfig: {
            title: settings.store_name || 'الدفة للعطور',
            subtitle: settings.store_subtitle || 'Aldaffa Perfumes - لأرقى العطور والخلطات',
            phone: settings.store_phone || '0123456789',
            address: settings.store_address || 'ليبيا - مصراتة',
            currency: currencySymbol,
            logoBase64: settings.logo_base64 || ''
          }
        };

        const res = await electron.ipcRenderer.invoke('export:financial-pdf', payload);
        if (res?.success) {
          showSuccess(`✅ تم حفظ تقرير PDF بنجاح في:\n${res.filePath}`);
        } else if (!res?.canceled) {
          showError('فشل تصدير PDF: ' + (res?.error || 'خطأ غير معروف'));
        }
      } else {
        window.print();
      }
    } catch (e) {
      showError('خطأ أثناء تصدير PDF: ' + e.message);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto scrollbar-thin pr-1">
      {/* Header & Date Range Filter */}
      <div className="glass-card p-5 border border-amber-500/30 bg-gradient-to-l from-amber-500/10 via-[#161b22] to-[#0d1117] rounded-2xl flex flex-wrap justify-between items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] flex items-center gap-2.5">
            <BarChart3 className="w-7 h-7 text-[#fbbf24]" />
            التقارير والتحليلات المالية المتقدمة
          </h1>
          <p className="text-xs text-[#768390] mt-1">
            متابعة دقيقة للإيرادات، وهوامش الربح، والسيولة النقدية، مع مخططات Recharts التفاعلية
          </p>
        </div>

        {/* Date Filter Presets & Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-[#0d1117] border border-white/10 rounded-xl p-1">
            {[
              { id: 'today', label: 'اليوم' },
              { id: 'this_week', label: 'هذا الأسبوع' },
              { id: 'this_month', label: 'هذا الشهر' },
              { id: 'ytd', label: 'بداية العام' },
              { id: 'custom', label: 'مخصص' }
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setDateRange(btn.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  dateRange === btn.id
                    ? 'bg-gradient-to-l from-[#fbbf24] to-[#f59e0b] text-[#0d1117] shadow-[0_0_12px_rgba(251,191,36,0.35)]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers */}
          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 bg-[#0d1117] border border-white/10 rounded-xl p-1 text-xs">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-[#e6edf3] outline-none px-2 py-1"
              />
              <span className="text-gray-500">إلى</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-[#e6edf3] outline-none px-2 py-1"
              />
            </div>
          )}

          <button
            type="button"
            onClick={loadData}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 border border-white/10 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="تصدير بيانات إكسل / CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>تصدير CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            className="px-4 py-2 rounded-xl bg-gradient-to-l from-[#fbbf24] to-[#f59e0b] text-[#0d1117] text-xs font-bold flex items-center gap-2 shadow-[0_0_15px_rgba(251,191,36,0.35)] hover:brightness-110 transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>تقرير PDF رسمي</span>
          </button>
        </div>
      </div>

      {/* 8 KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 1. Total Revenue */}
        <div className="glass-card p-4 border border-amber-500/20 bg-[#161b22]/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-amber-400" />
              إجمالي المبيعات
            </span>
            <h3 className="text-xl font-black text-amber-400 mt-1 tabular-nums">
              {formatCurrency(metrics.totalRevenue, currencySymbol)}
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">{metrics.invoiceCount} فاتورة صادرة</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        {/* 2. Total Profit */}
        <div className="glass-card p-4 border border-emerald-500/20 bg-[#161b22]/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              مجمل الربح المحقق
            </span>
            <h3 className="text-xl font-black text-emerald-400 mt-1 tabular-nums">
              {canViewProfit ? formatCurrency(metrics.totalProfit, currencySymbol) : '••••••'}
            </h3>
            <p className="text-[10px] text-emerald-500 mt-0.5">
              {canViewProfit ? `هامش ربح: ${metrics.profitMargin}%` : 'محمي'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {/* 3. Net Profit */}
        <div className="glass-card p-4 border border-blue-500/20 bg-[#161b22]/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-blue-400" />
              صافي الأرباح الفعلية
            </span>
            <h3 className="text-xl font-black text-blue-400 mt-1 tabular-nums">
              {canViewProfit ? formatCurrency(metrics.netProfit, currencySymbol) : '••••••'}
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">بعد المصاريف والتوالف</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* 4. Avg Order Value */}
        <div className="glass-card p-4 border border-purple-500/20 bg-[#161b22]/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
              <ShoppingBag className="w-3.5 h-3.5 text-purple-400" />
              متوسط قيمة الفاتورة
            </span>
            <h3 className="text-xl font-black text-purple-400 mt-1 tabular-nums">
              {formatCurrency(metrics.avgOrderValue, currencySymbol)}
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">سلة المشتريات</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold">
            <Award className="w-5 h-5" />
          </div>
        </div>

        {/* 5. Total Purchases */}
        <div className="glass-card p-4 border border-white/5 bg-[#161b22]/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-medium">إجمالي المشتريات</span>
            <h3 className="text-xl font-black text-amber-200 mt-1 tabular-nums">
              {formatCurrency(metrics.totalPurchases, currencySymbol)}
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">توريدات البضائع</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-300 flex items-center justify-center font-bold">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        {/* 6. Total Withdrawals */}
        <div className="glass-card p-4 border border-white/5 bg-[#161b22]/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-medium">السحوبات والمصروفات</span>
            <h3 className="text-xl font-black text-rose-400 mt-1 tabular-nums">
              {formatCurrency(metrics.totalWithdrawals, currencySymbol)}
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">نفقات تشغيلية</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        {/* 7. Total Losses */}
        <div className="glass-card p-4 border border-white/5 bg-[#161b22]/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-medium">التوالف والضياع</span>
            <h3 className="text-xl font-black text-rose-500 mt-1 tabular-nums">
              {formatCurrency(metrics.totalLosses, currencySymbol)}
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">هدر وتالف المخزون</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center font-bold">
            <Minus className="w-5 h-5" />
          </div>
        </div>

        {/* 8. Total Capital */}
        <div className="glass-card p-4 border border-white/5 bg-[#161b22]/80 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-400 font-medium">ضخ رأس المال</span>
            <h3 className="text-xl font-black text-emerald-300 mt-1 tabular-nums">
              {formatCurrency(metrics.totalCapital, currencySymbol)}
            </h3>
            <p className="text-[10px] text-gray-500 mt-0.5">التمويل الإضافي</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-300 flex items-center justify-center font-bold">
            <Coins className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Row 1: Charts (Revenue/Profit Trend & Liquidity Flow) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Revenue vs Profit Time Series */}
        <div className="glass-card p-4 border border-white/5 bg-[#161b22]/70 rounded-2xl flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#fbbf24]" />
              <span>مخطط نمو الإيرادات والأرباح عبر الزمن</span>
            </h3>
            <span className="text-xs text-gray-500 font-mono">Recharts Area</span>
          </div>

          <div className="h-64 w-full pt-2" dir="ltr">
            {timeSeriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-500">
                لا توجد مبيعات مسجلة في هذه الفترة الزمنية
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6b7280" fontSize={11} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="المبيعات الإجمالية"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                  {canViewProfit && (
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="الأرباح المحققة"
                      stroke="#10B981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorProfit)"
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Daily Liquidity Flow (Cash In vs Cash Out) */}
        <div className="glass-card p-4 border border-white/5 bg-[#161b22]/70 rounded-2xl flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-400" />
              <span>تدفق السيولة اليومية (المقبوضات vs المدفوعات)</span>
            </h3>
            <span className="text-xs text-gray-500 font-mono">Cash Flow</span>
          </div>

          <div className="h-64 w-full pt-2" dir="ltr">
            {liquidityData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-500">
                لا توجد حركات مالية في هذه الفترة
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={liquidityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={11} tickLine={false} />
                  <YAxis stroke="#6b7280" fontSize={11} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="inflow" name="المقبوضات (مبيعات + ضخ)" fill="#10B981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="outflow" name="المدفوعات (مشتريات + سحوبات + فاقد)" fill="#EF4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Charts (Category Breakdown & Payment Methods Split) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 3: Category Distribution */}
        <div className="glass-card p-4 border border-white/5 bg-[#161b22]/70 rounded-2xl flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              <span>حجم المبيعات حسب التصنيفات</span>
            </h3>
            <span className="text-xs text-gray-500">مبيعات الأقسام</span>
          </div>

          <div className="h-64 w-full pt-2" dir="ltr">
            {categorySales.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-gray-500">
                لا توجد مبيعات لتصنيفات محددة
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categorySales} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis type="number" stroke="#6b7280" fontSize={11} tickLine={false} />
                  <YAxis dataKey="category" type="category" stroke="#6b7280" fontSize={11} width={80} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="total_revenue" name="إجمالي الإيرادات" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 4: Payment Methods Distribution */}
        <div className="glass-card p-4 border border-white/5 bg-[#161b22]/70 rounded-2xl flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-emerald-400" />
              <span>توزيع طرق الدفع والتحصيل</span>
            </h3>
            <span className="text-xs text-gray-500">نسبة القنوات</span>
          </div>

          <div className="h-64 w-full flex items-center justify-center" dir="ltr">
            {paymentBreakdown.length === 0 ? (
              <span className="text-xs text-gray-500">لا توجد بيانات طرق دفع</span>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={paymentBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {paymentBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Dual-Tab Products Performance Ranking Table */}
      <div className="glass-card p-5 border border-white/5 bg-[#161b22]/70 rounded-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-[#fbbf24]" />
            <h3 className="text-sm font-bold text-[#e6edf3]">ترتيب وتصنيف أداء المنتجات</h3>
          </div>

          {/* Dual-Tab Buttons */}
          <div className="flex bg-[#0d1117] border border-white/10 rounded-xl p-1 text-xs">
            <button
              type="button"
              onClick={() => setTableTab('top_selling')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                tableTab === 'top_selling'
                  ? 'bg-amber-500 text-black shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              المنتجات الأكثر مبيعاً (بالكمية)
            </button>
            <button
              type="button"
              onClick={() => setTableTab('top_profitable')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                tableTab === 'top_profitable'
                  ? 'bg-emerald-500 text-black shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              المنتجات الأكثر مساهمة في الأرباح
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#0d1117] text-[#adbac7] border-b border-white/10">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">اسم المنتج / الصنف</th>
                <th className="p-3 text-center">الكمية المباعة</th>
                <th className="p-3 text-left">إجمالي المبيعات</th>
                <th className="p-3 text-left">الأرباح المحققة</th>
                {tableTab === 'top_profitable' && <th className="p-3 text-center">نسبة هامش الربح</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(tableTab === 'top_selling' ? topSellingProducts : mostProfitableProducts).map((prod, idx) => (
                <tr key={prod.product_id || idx} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-3 font-mono text-gray-500">{idx + 1}</td>
                  <td className="p-3 font-bold text-[#e6edf3]">{prod.name}</td>
                  <td className="p-3 text-center font-mono font-bold text-amber-300">
                    {prod.total_qty} قطعة
                  </td>
                  <td className="p-3 text-left font-mono font-bold text-[#fbbf24]">
                    {formatCurrency(prod.total_revenue, currencySymbol)}
                  </td>
                  <td className="p-3 text-left font-mono font-bold text-emerald-400">
                    {canViewProfit ? formatCurrency(prod.total_profit, currencySymbol) : '••••••'}
                  </td>
                  {tableTab === 'top_profitable' && (
                    <td className="p-3 text-center font-mono font-bold text-sky-400">
                      {canViewProfit ? `${Number(prod.profit_margin_pct || 0).toFixed(1)}%` : '••%'}
                    </td>
                  )}
                </tr>
              ))}
              {(tableTab === 'top_selling' ? topSellingProducts : mostProfitableProducts).length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500">
                    لا توجد بيانات مبيعات متوفرة في هذه الفترة المحددة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsModule;
