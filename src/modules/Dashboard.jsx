import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Banknote,
  TrendingUp,
  PackageOpen,
  Users,
  RefreshCw,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Loader2
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

import Card from '../components/ui/Card.jsx';
import Table from '../components/ui/Table.jsx';
import Button from '../components/ui/Button.jsx';
import { useUIStore } from '../stores/useUIStore.js';
import { useAuthStore } from '../stores/useAuthStore.js';
import { useSettingsStore } from '../stores/useSettingsStore.js';
import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { DebtorsRepository } from '../database/repositories/DebtorsRepository.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { formatCurrency, formatNumber } from '../utils/helpers.js';

/* ============================================================================
 * CONSTANTS
 * ==========================================================================*/

const RANGES = [
  { id: 'today', label: 'اليوم' },
  { id: 'week', label: 'الأسبوع' },
  { id: 'month', label: 'الشهر' }
];

const RANGE_LABELS = {
  today: { period: 'اليوم', prev: 'أمس' },
  week: { period: 'هذا الأسبوع', prev: 'الأسبوع السابق' },
  month: { period: 'هذا الشهر', prev: 'الشهر السابق' }
};

const PAYMENT_METHOD_LABELS = {
  cash: 'نقدي',
  card: 'بطاقة',
  bank_transfer: 'تحويل بنكي'
};

const PAYMENT_COLORS = {
  cash: '#fbbf24',
  card: '#f59e0b',
  bank_transfer: '#b45309'
};

const LOW_STOCK_THRESHOLD = 10;
const AUTO_REFRESH_INTERVAL = 30_000; // 30 seconds

// Repository singletons (thin stateless wrappers over the shared db instance)
const salesRepo = new SalesRepository();
const debtorsRepo = new DebtorsRepository();
const inventoryRepo = new InventoryRepository();

/* ============================================================================
 * HELPERS
 * ==========================================================================*/

/** Render a percentage-change delta indicator (▲ positive / ▼ negative / — zero). */
const renderDelta = (pct) => {
  const val = Number(pct) || 0;
  if (val > 0) return <span className="text-emerald-500 font-bold">▲ {val.toFixed(1)}%</span>;
  if (val < 0) return <span className="text-red-500 font-bold">▼ {Math.abs(val).toFixed(1)}%</span>;
  return <span className="text-gray-400">—</span>;
};

/** Local-timezone YYYY-MM-DD key so UTC ISO dates align with local day boundaries. */
const toLocalDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Compute the ISO range for the selected period plus an equal-length
 * immediately-preceding comparison window.
 */
const getPeriodRange = (range) => {
  const now = new Date();
  const start = new Date(now);
  let end = new Date(now);
  let prevStart;
  let prevEnd;

  if (range === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    // Same elapsed window yesterday (fair comparison for a partial day).
    prevStart = new Date(start);
    prevStart.setDate(prevStart.getDate() - 1);
    prevEnd = new Date(now);
    prevEnd.setDate(prevEnd.getDate() - 1);
  } else if (range === 'week') {
    // Trailing 7 days ending now.
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const lengthMs = end.getTime() - start.getTime();
    prevStart = new Date(start.getTime() - lengthMs);
    prevEnd = new Date(start.getTime() - 1);
  } else {
    // Current calendar month vs the full previous calendar month.
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    prevStart: prevStart.toISOString(),
    prevEnd: prevEnd.toISOString()
  };
};

/** Compact tick formatter: 1.2k / 3.4M */
const compactNumber = (value) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
};

const formatDateTimeShort = (iso) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('ar-LY', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
};

/**
 * Fetch every dataset the dashboard needs in parallel and normalize it into a
 * single render-ready structure.
 */
const fetchDashboardData = async (range) => {
  const { start, end, prevStart, prevEnd } = getPeriodRange(range);
  const now = new Date();

  const [
    summaryRow,
    prevSummaryRow,
    topProducts,
    paymentMethodRows,
    lowStockItems,
    activeDebtors,
    totalDebt,
    recentPage,
    rangeSales
  ] = await Promise.all([
    salesRepo.getSalesSummary(start, end),
    salesRepo.getSalesSummary(prevStart, prevEnd),
    salesRepo.getTopSellingProducts(10, start, end),
    salesRepo.getSalesByPaymentMethod(start, end),
    inventoryRepo.getLowStock(LOW_STOCK_THRESHOLD),
    debtorsRepo.getActiveDebtors(),
    debtorsRepo.getTotalDebt(),
    salesRepo.paginate(1, 10, {}, 'date DESC'),
    salesRepo.getSalesInRange(start, end)
  ]);

  // Coerce nullable aggregate rows into safe zero-filled summaries.
  const toSummary = (row) => ({
    salesCount: row?.total_sales || 0,
    revenue: row?.total_revenue || 0,
    profit: row?.total_profit || 0,
    cashSales: row?.cash_sales || 0,
    cardSales: row?.card_sales || 0,
    transferSales: row?.transfer_sales || 0
  });

  const summary = toSummary(summaryRow);
  const prevSummary = toSummary(prevSummaryRow);

  const changePct = prevSummary.revenue === 0
    ? (summary.revenue > 0 ? 100 : 0)
    : ((summary.revenue - prevSummary.revenue) / prevSummary.revenue) * 100;

  const marginPct = summary.revenue === 0
    ? 0
    : (summary.profit / summary.revenue) * 100;

  // Dynamic time-series aggregation based on active period:
  let areaData = [];

  if (range === 'today') {
    // 6 hourly intervals across the day
    const hourBuckets = [
      { start: 0, end: 8, label: '08:00 ص' },
      { start: 9, end: 11, label: '11:00 ص' },
      { start: 12, end: 14, label: '02:00 م' },
      { start: 15, end: 17, label: '05:00 م' },
      { start: 18, end: 20, label: '08:00 م' },
      { start: 21, end: 23, label: '11:00 م' }
    ];
    areaData = hourBuckets.map(b => {
      const bucketSales = rangeSales.filter(s => {
        const h = new Date(s.date).getHours();
        return h >= b.start && h <= b.end;
      });
      return {
        key: b.label,
        label: b.label,
        revenue: bucketSales.reduce((sum, s) => sum + (s.total || 0), 0),
        profit: bucketSales.reduce((sum, s) => sum + (s.profit || 0), 0)
      };
    });
  } else if (range === 'week') {
    // 7 days ending today
    const areaMap = {};
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      areaMap[toLocalDateKey(d)] = { revenue: 0, profit: 0, date: d };
    }
    for (const sale of rangeSales) {
      const key = toLocalDateKey(new Date(sale.date));
      if (areaMap[key]) {
        areaMap[key].revenue += sale.total || 0;
        areaMap[key].profit += sale.profit || 0;
      }
    }
    areaData = Object.keys(areaMap).map((key) => {
      const d = areaMap[key].date;
      return {
        key,
        label: d.toLocaleDateString('ar-LY', { weekday: 'short' }),
        revenue: areaMap[key].revenue,
        profit: areaMap[key].profit
      };
    });
  } else {
    // Month: 4 weekly buckets
    const weekBuckets = [
      { startDay: 1, endDay: 7, label: 'أسبوع 1' },
      { startDay: 8, endDay: 14, label: 'أسبوع 2' },
      { startDay: 15, endDay: 21, label: 'أسبوع 3' },
      { startDay: 22, endDay: 31, label: 'أسبوع 4' }
    ];
    areaData = weekBuckets.map(b => {
      const bucketSales = rangeSales.filter(s => {
        const day = new Date(s.date).getDate();
        return day >= b.startDay && day <= b.endDay;
      });
      return {
        key: b.label,
        label: b.label,
        revenue: bucketSales.reduce((sum, s) => sum + (s.total || 0), 0),
        profit: bucketSales.reduce((sum, s) => sum + (s.profit || 0), 0)
      };
    });
  }

  const paymentMethods = paymentMethodRows.map((row) => ({
    method: row.payment_method,
    label: PAYMENT_METHOD_LABELS[row.payment_method] || row.payment_method,
    count: row.count || 0,
    total_amount: row.total_amount || 0
  }));

  return {
    summary: {
      ...summary,
      changePct,
      marginPct
    },
    prevSummary,
    areaData,
    paymentMethods,
    topProducts,
    recentSales: recentPage.items,
    lowStockCount: lowStockItems.length,
    activeDebtorsCount: activeDebtors.length,
    totalDebt: totalDebt || 0
  };
};

/* ============================================================================
 * PRESENTATIONAL SUB-COMPONENTS
 * ==========================================================================*/

const Skeleton = ({ className = '' }) => (
  <div
    className={`animate-pulse bg-white/[0.06] rounded-lg ${className}`}
    aria-hidden="true"
  />
);

const DashboardTooltip = ({ active, payload, label }) => {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-[#fbbf24]/20 bg-[#161b22]/95 px-4 py-3 shadow-lg backdrop-blur-sm">
      <p className="text-xs font-bold text-[#fbbf24] mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: entry.color }}
            aria-hidden="true"
          />
          <span className="text-xs text-[#adbac7]">{entry.name}:</span>
          <span className="text-xs font-bold text-[#e6edf3] tabular-nums">
            {formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

const PieTooltip = ({ active, payload, total }) => {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  const pct = total > 0
    ? ((entry.value / total) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="rounded-xl border border-[#fbbf24]/20 bg-[#161b22]/95 px-4 py-3 shadow-lg backdrop-blur-sm">
      <p className="text-xs font-bold text-[#fbbf24] mb-1">{entry.name}</p>
      <p className="text-sm font-bold text-[#e6edf3] tabular-nums">
        {formatCurrency(entry.value)}
      </p>
      <p className="text-xs text-[#768390] mt-0.5">
        {formatNumber(entry.payload.count)} عملية · {pct}%
      </p>
    </div>
  );
};

/* ============================================================================
 * DASHBOARD COMPONENT
 * ==========================================================================*/

const Dashboard = () => {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canViewProfit = hasPermission('view_profit');
  const lowStockThreshold = Number(useSettingsStore((s) => s.getSetting('low_stock_threshold', '10'))) || 10;

  const [range, setRange] = useState('today');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const showSuccess = useUIStore((s) => s.showSuccess);
  const showError = useUIStore((s) => s.showError);

  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  const loadDashboard = useCallback(async (silent = false) => {
    const requestId = ++requestIdRef.current;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const result = await fetchDashboardData(range);
      if (mountedRef.current && requestId === requestIdRef.current) {
        setData(result);
      }
    } catch (err) {
      console.error('[Dashboard] failed to load data:', err);
      if (mountedRef.current && requestId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [range]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Show skeletons when the period changes.
  useEffect(() => {
    setData(null);
    setError(null);
  }, [range]);

  // Initial load + reload whenever the range changes + listener for data refresh
  useEffect(() => {
    loadDashboard(false);

    const handleRefresh = () => {
      loadDashboard(false);
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, [loadDashboard]);

  // Silent auto-refresh every 30 seconds.
  useEffect(() => {
    const timer = window.setInterval(() => loadDashboard(true), AUTO_REFRESH_INTERVAL);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const exportCSV = useCallback(() => {
    if (!data) return;

    try {
      const periodLabel = RANGE_LABELS[range].period;
      const rows = [];

      const pushSection = (title, headers, body) => {
        rows.push([title]);
        if (headers) rows.push(headers);
        if (body && body.length) body.forEach((row) => rows.push(row));
        rows.push([]);
      };

      rows.push(['الدفة للعطور - تقرير لوحة المعلومات']);
      rows.push(['الفترة', periodLabel]);
      rows.push(['تاريخ التصدير', new Date().toLocaleString('ar-SD')]);
      rows.push([]);

      pushSection(
        'الملخص',
        ['البند', 'القيمة'],
        [
          ['إجمالي الإيرادات', data.summary.revenue],
          ['إجمالي الأرباح', canViewProfit ? data.summary.profit : '••••••'],
          ['هامش الربح (%)', canViewProfit ? data.summary.marginPct.toFixed(2) : '••••••'],
          ['التغير مقابل الفترة السابقة (%)', data.summary.changePct.toFixed(2)],
          ['عدد المبيعات', data.summary.salesCount],
          ['منتجات المخزون المنخفض', data.lowStockCount],
          ['العملاء النشطون', data.activeDebtorsCount],
          ['إجمالي الديون', data.totalDebt]
        ]
      );

      pushSection(
        'أعلى المنتجات مبيعاً',
        ['المنتج', 'الكمية', 'الإيرادات', 'الربح'],
        data.topProducts.map((p) => [
          p.name,
          p.total_qty,
          p.total_revenue,
          canViewProfit ? p.total_profit : '••••••'
        ])
      );

      pushSection(
        'طرق الدفع',
        ['الطريقة', 'عدد العمليات', 'المبلغ'],
        data.paymentMethods.map((p) => [p.label, p.count, p.total_amount])
      );

      pushSection(
        'أحدث المبيعات',
        ['رقم الفاتورة', 'التاريخ', 'النوع', 'طريقة الدفع', 'الإجمالي'],
        data.recentSales.map((s) => [
          s.id,
          s.date,
          s.type === 'online' ? 'أونلاين' : 'متجر',
          PAYMENT_METHOD_LABELS[s.payment_method] || s.payment_method,
          s.total
        ])
      );

      const csvContent =
        '﻿' +
        rows
          .map((row) =>
            row
              .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
              .join(',')
          )
          .join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aldaffa-dashboard-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess('تم تصدير التقرير إلى CSV بنجاح');
    } catch (err) {
      console.error('[Dashboard] CSV export failed:', err);
      showError('تعذر تصدير التقرير');
    }
  }, [data, range, showSuccess, showError]);

  /* ------------------------- Loading skeleton -------------------------- */
  if (loading && !data) {
    return (
      <div className="h-full overflow-y-auto scrollbar-luxury px-6 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-56" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="h-full">
              <div className="flex items-start justify-between mb-4">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-4 w-24" />
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <Skeleton className="h-72 w-full" />
          </Card>
          <Card>
            <Skeleton className="h-72 w-full" />
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <Skeleton className="h-72 w-full" />
          </Card>
          <Card>
            <Skeleton className="h-72 w-full" />
          </Card>
        </div>
      </div>
    );
  }

  /* ------------------------- Fatal error state ------------------------- */
  if (!data && error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="glass-card w-full max-w-md p-8 text-center" role="alert">
          <div className="text-5xl mb-4" aria-hidden="true">⚠️</div>
          <h2 className="text-xl font-bold text-[#e6edf3] mb-2">
            تعذر تحميل لوحة المعلومات
          </h2>
          <p className="text-sm text-[#adbac7] mb-6 break-words">{error}</p>
          <Button
            variant="primary"
            icon={RefreshCw}
            onClick={() => loadDashboard(false)}
          >
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  /* --------------------------- Main content ---------------------------- */
  const periodLabel = RANGE_LABELS[range].period;
  const prevLabel = RANGE_LABELS[range].prev;
  const { summary } = data;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.05 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 240, damping: 24 } }
  };

  const kpis = [
    {
      id: 'revenue',
      label: 'إجمالي المبيعات',
      value: formatCurrency(summary.revenue),
      icon: Banknote,
      iconBg: 'from-[#fbbf24]/20 to-[#f59e0b]/10 text-[#fbbf24]',
      delta: summary.changePct,
      deltaLabel: `مقارنة بـ ${prevLabel}`
    },
    ...(canViewProfit
      ? [
          {
            id: 'profit',
            label: 'صافي الربح',
            value: formatCurrency(summary.profit),
            icon: TrendingUp,
            iconBg: 'from-[#34d399]/20 to-[#10b981]/10 text-[#34d399]',
            badge: `هامش ${summary.marginPct.toFixed(1)}%`,
            subtitle: `${formatNumber(summary.salesCount)} عملية بيع`
          }
        ]
      : []),
    {
      id: 'lowstock',
      label: 'مخزون منخفض',
      value: formatNumber(data.lowStockCount),
      icon: PackageOpen,
      iconBg: 'from-[#fbbf24]/20 to-[#f59e0b]/10 text-[#fbbf24]',
      subtitle: `بحد أقصى ${LOW_STOCK_THRESHOLD} وحدة`
    },
    {
      id: 'debtors',
      label: 'عملاء بديون',
      value: formatNumber(data.activeDebtorsCount),
      icon: Users,
      iconBg: 'from-red-500/20 to-red-600/10 text-red-400',
      subtitle: `إجمالي الديون: ${formatCurrency(data.totalDebt)}`
    }
  ];

  const totalPayments = data.paymentMethods.reduce(
    (sum, p) => sum + p.total_amount,
    0
  );
  const hasPaymentData = data.paymentMethods.some((p) => p.total_amount > 0);

  const productColumns = [
    {
      key: 'name',
      label: 'المنتج',
      render: (row) => <span className="font-semibold text-[#e6edf3]">{row.name}</span>
    },
    {
      key: 'total_qty',
      label: 'الكمية',
      align: 'center',
      render: (row) => <span className="tabular-nums">{formatNumber(row.total_qty)}</span>
    },
    {
      key: 'total_revenue',
      label: 'الإيرادات',
      align: 'end',
      render: (row) => (
        <span className="font-semibold text-[#fbbf24] tabular-nums">
          {formatNumber(row.total_revenue)}
        </span>
      )
    },
    {
      key: 'total_profit',
      label: 'الربح',
      align: 'end',
      render: (row) => (
        <span className="font-semibold text-[#34d399] tabular-nums">
          {canViewProfit ? formatNumber(row.total_profit) : '••••••'}
        </span>
      )
    }
  ];

  const saleColumns = [
    {
      key: 'id',
      label: 'فاتورة',
      render: (row) => <span className="text-[#768390] tabular-nums">#{row.id}</span>
    },
    {
      key: 'date',
      label: 'التاريخ',
      render: (row) => <span className="tabular-nums">{formatDateTimeShort(row.date)}</span>
    },
    {
      key: 'type',
      label: 'النوع',
      render: (row) => (
        <span className={row.type === 'online' ? 'badge badge-primary' : 'badge badge-success'}>
          {row.type === 'online' ? 'أونلاين' : 'متجر'}
        </span>
      )
    },
    {
      key: 'payment_method',
      label: 'الدفع',
      render: (row) => (
        <span>{PAYMENT_METHOD_LABELS[row.payment_method] || row.payment_method}</span>
      )
    },
    {
      key: 'total',
      label: 'الإجمالي',
      align: 'end',
      render: (row) => (
        <span className="font-semibold text-[#fbbf24] tabular-nums">
          {formatNumber(row.total)}
        </span>
      )
    }
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="h-full overflow-y-auto scrollbar-luxury px-6 py-6 space-y-6"
    >
      {/* ------------------------------ Header --------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#e6edf3]">
            لوحة المعلومات
          </h1>
          <p className="text-sm text-[#768390] mt-1">
            نظرة عامة شاملة على أداء المتجر — {periodLabel}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Period selector */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/10"
            role="tablist"
            aria-label="الفترة الزمنية"
          >
            {RANGES.map((r) => {
              const isActive = range === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setRange(r.id)}
                  className={[
                    'px-4 py-1.5 rounded-lg text-sm font-semibold cursor-pointer no-select',
                    'transition-colors duration-200',
                    isActive
                      ? 'bg-gradient-to-l from-[#fbbf24] to-[#f59e0b] text-[#0d1117] shadow-[0_0_14px_rgba(217,119,6,0.4)]'
                      : 'text-[#adbac7] hover:text-[#e6edf3] hover:bg-white/5'
                  ].join(' ')}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            loading={loading}
            onClick={() => loadDashboard(false)}
          >
            تحديث
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={Download}
            onClick={exportCSV}
            disabled={!data}
          >
            تصدير CSV
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <p className="text-sm text-red-300 flex-1 break-words">{error}</p>
          <button
            type="button"
            onClick={() => loadDashboard(false)}
            className="text-xs font-bold text-red-300 hover:text-red-200 underline cursor-pointer shrink-0"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {refreshing && !loading && (
        <div className="flex items-center gap-2 text-xs text-[#768390]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          جارٍ تحديث البيانات...
        </div>
      )}

      {/* --------------------------- Summary cards (Organic Atelier Pebble Row) ----------------------- */}
      <motion.div
        variants={containerVariants}
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3"
      >
        {/* 1. إجمالي المبيعات */}
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          <div className="w-full aspect-square rounded-[2rem] bg-white/85 dark:bg-slate-900/85 border border-amber-500/30 p-3 flex flex-col items-center justify-between text-center shadow-sm hover:scale-105 transition-all">
            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5C524F] dark:text-slate-300">إجمالي المبيعات</p>
              <p className="text-sm font-extrabold text-[#2D2424] dark:text-amber-300 tabular-nums">{formatCurrency(summary.revenue)}</p>
            </div>
            <div className="text-[10px] text-[#8C827A] dark:text-slate-400">{renderDelta(summary.changePct)}</div>
          </div>
        </motion.div>

        {/* 2. الإيرادات */}
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          <div className="w-full aspect-square rounded-[2rem] bg-white/85 dark:bg-slate-900/85 border border-emerald-500/30 p-3 flex flex-col items-center justify-between text-center shadow-sm hover:scale-105 transition-all">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5C524F] dark:text-slate-300">الإيرادات</p>
              <p className="text-sm font-extrabold text-[#2D2424] dark:text-emerald-300 tabular-nums">{formatCurrency(summary.revenue)}</p>
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">{summary.salesCount} طلبات</div>
          </div>
        </motion.div>

        {/* 3. الربح */}
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          <div className="w-full aspect-square rounded-[2rem] bg-white/85 dark:bg-slate-900/85 border border-rose-500/30 p-3 flex flex-col items-center justify-between text-center shadow-sm hover:scale-105 transition-all">
            <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5C524F] dark:text-slate-300">الربح</p>
              <p className="text-sm font-extrabold text-[#2D2424] dark:text-rose-300 tabular-nums">{canViewProfit ? formatCurrency(summary.profit) : '••••••'}</p>
            </div>
            <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">{canViewProfit ? `${summary.marginPct.toFixed(1)}% هامش` : '••••••'}</div>
          </div>
        </motion.div>

        {/* 4. صافي الربح */}
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          <div className="w-full aspect-square rounded-[2rem] bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-slate-900 border-2 border-emerald-500 p-3 flex flex-col items-center justify-between text-center shadow-md hover:scale-105 transition-all">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-extrabold text-emerald-800 dark:text-emerald-200">صافي الربح</p>
              <p className="text-sm font-black text-emerald-900 dark:text-emerald-300 tabular-nums">{canViewProfit ? formatCurrency(summary.profit) : '••••••'}</p>
            </div>
            <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold">{canViewProfit ? 'كفاءة عالية' : '••••••'}</div>
          </div>
        </motion.div>

        {/* 5. التكلفة */}
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          <div className="w-full aspect-square rounded-[2rem] bg-white/85 dark:bg-slate-900/85 border border-purple-500/30 p-3 flex flex-col items-center justify-between text-center shadow-sm hover:scale-105 transition-all">
            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5C524F] dark:text-slate-300">التكلفة</p>
              <p className="text-sm font-extrabold text-[#2D2424] dark:text-purple-300 tabular-nums">{canViewProfit ? formatCurrency(summary.revenue - summary.profit) : '••••••'}</p>
            </div>
            <div className="text-[10px] text-[#8C827A] dark:text-slate-400">تكلفة البضاعة</div>
          </div>
        </motion.div>

        {/* 6. مخزون منخفض */}
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          <div className="w-full aspect-square rounded-[2rem] bg-white/85 dark:bg-slate-900/85 border border-amber-500/30 p-3 flex flex-col items-center justify-between text-center shadow-sm hover:scale-105 transition-all">
            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <PackageOpen className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5C524F] dark:text-slate-300">مخزون منخفض</p>
              <p className="text-sm font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">{formatNumber(data.lowStockCount)}</p>
            </div>
            <div className="text-[10px] text-[#8C827A] dark:text-slate-400">يحتاج طلب</div>
          </div>
        </motion.div>

        {/* 7. عملاء ديون */}
        <motion.div variants={itemVariants} className="flex flex-col items-center">
          <div className="w-full aspect-square rounded-[2rem] bg-white/85 dark:bg-slate-900/85 border border-rose-500/30 p-3 flex flex-col items-center justify-between text-center shadow-sm hover:scale-105 transition-all">
            <div className="w-8 h-8 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-[#5C524F] dark:text-slate-300">عملاء ديون</p>
              <p className="text-sm font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">{formatCurrency(data.totalDebt)}</p>
            </div>
            <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">{data.activeDebtorsCount} عملاء</div>
          </div>
        </motion.div>
      </motion.div>

      {/* ------------------------------ Charts --------------------------- */}
      <motion.div
        variants={containerVariants}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Area chart: last 7 days revenue vs profit */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card
            className="h-full"
            header={
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-bold text-[#e6edf3]">الإيرادات والأرباح</h3>
                  <p className="text-xs text-[#768390] mt-0.5">
                    {range === 'today' ? 'اليوم (توزيع الساعات)' : range === 'week' ? 'آخر 7 أيام' : 'خلال هذا الشهر (أسابيع)'}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1.5 text-[#adbac7]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24]" aria-hidden="true" />
                    الإيرادات
                  </span>
                  <span className="flex items-center gap-1.5 text-[#adbac7]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#34d399]" aria-hidden="true" />
                    الأرباح
                  </span>
                </div>
              </div>
            }
          >
            <div className="h-72" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.areaData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#fbbf24" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.06)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#768390', fontSize: 12 }}
                    axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: '#768390', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tickFormatter={(value) => compactNumber(value)}
                  />
                  <Tooltip
                    content={<DashboardTooltip />}
                    cursor={{ stroke: 'rgba(251,191,36,0.3)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="الإيرادات"
                    stroke="#fbbf24"
                    strokeWidth={2.5}
                    fill="url(#gradRevenue)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#fbbf24', stroke: '#0d1117', strokeWidth: 2 }}
                  />
                  {canViewProfit && (
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="الأرباح"
                      stroke="#34d399"
                      strokeWidth={2.5}
                      fill="url(#gradProfit)"
                      dot={false}
                      activeDot={{ r: 5, fill: '#34d399', stroke: '#0d1117', strokeWidth: 2 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>

        {/* Pie chart: payment methods */}
        <motion.div variants={itemVariants}>
          <Card
            className="h-full"
            header={
              <div>
                <h3 className="font-bold text-[#e6edf3]">طرق الدفع</h3>
                <p className="text-xs text-[#768390] mt-0.5">{periodLabel}</p>
              </div>
            }
          >
            {!hasPaymentData ? (
              <div className="h-72 flex items-center justify-center text-sm text-[#768390]">
                لا توجد بيانات لهذه الفترة
              </div>
            ) : (
              <div className="h-72" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.paymentMethods}
                      dataKey="total_amount"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      stroke="#0d1117"
                      strokeWidth={2}
                    >
                      {data.paymentMethods.map((entry) => (
                        <Cell
                          key={entry.method}
                          fill={PAYMENT_COLORS[entry.method] || '#fbbf24'}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip total={totalPayments} />} />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => (
                        <span className="text-xs text-[#adbac7]">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </motion.div>
      </motion.div>

      {/* ------------------------------ Tables --------------------------- */}
      <motion.div
        variants={containerVariants}
        className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start"
      >
        {/* Top 10 selling products */}
        <motion.div variants={itemVariants}>
          <div className="flex flex-col gap-3 h-full">
            <div>
              <h3 className="font-bold text-[#e6edf3]">الأكثر مبيعاً</h3>
              <p className="text-xs text-[#768390] mt-0.5">
                أعلى 10 منتجات — {periodLabel}
              </p>
            </div>
            <Table
              columns={productColumns}
              data={data.topProducts}
              keyField="product_id"
              emptyMessage="لا توجد مبيعات في هذه الفترة"
            />
          </div>
        </motion.div>

        {/* Recent 10 sales */}
        <motion.div variants={itemVariants}>
          <div className="flex flex-col gap-3 h-full">
            <div>
              <h3 className="font-bold text-[#e6edf3]">أحدث المبيعات</h3>
              <p className="text-xs text-[#768390] mt-0.5">
                آخر 10 عمليات بيع
              </p>
            </div>
            <Table
              columns={saleColumns}
              data={data.recentSales}
              keyField="id"
              emptyMessage="لا توجد مبيعات مسجلة"
            />
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
};

export default Dashboard;
