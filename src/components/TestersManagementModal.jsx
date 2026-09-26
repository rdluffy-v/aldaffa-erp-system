import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Sparkles, 
  FlaskConical, 
  Package, 
  Download, 
  Search, 
  TrendingUp, 
  Droplet, 
  DollarSign, 
  Calendar, 
  Award,
  RefreshCw,
  Plus
} from 'lucide-react';
import { TestersRepository } from '../database/repositories/TestersRepository.js';
import { formatCurrency, safeParseFloat } from '../utils/helpers.js';
import RecordTesterModal from './RecordTesterModal.jsx';

const testersRepo = new TestersRepository();

export const TestersManagementModal = ({ isOpen, onClose, onRefreshInventory }) => {
  const [analytics, setAnalytics] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [sourceTypeFilter, setSourceTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Child modal to record new tester
  const [showRecordModal, setShowRecordModal] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsData, logsData] = await Promise.all([
        testersRepo.getTesterAnalytics(),
        testersRepo.getAllTesterLogs({
          source_type: sourceTypeFilter,
          search: searchTerm
        })
      ]);
      setAnalytics(analyticsData);
      setLogs(logsData || []);
    } catch (err) {
      console.error('TestersManagementModal: Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [sourceTypeFilter, searchTerm]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Handle CSV Export
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const csvContent = await testersRepo.exportTesterLogsCSV({
        source_type: sourceTypeFilter,
        search: searchTerm
      });

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `aldaffa_testers_audit_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleTesterSuccess = () => {
    loadData();
    if (onRefreshInventory) {
      onRefreshInventory();
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-slate-900 border border-gold/40 rounded-3xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 border-b border-gold/20 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shadow-inner">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-100 flex items-center gap-2">
                <span>إدارة عينات والتيسترات</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  مركز الاستهلاك الترويجي
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                متابعة دقيقة لاستهلاك العينات، التكلفة التسويقية، ولوحة العطور الأكثر طلباً
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRecordModal(true)}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black rounded-xl text-xs sm:text-sm flex items-center gap-1.5 shadow-lg shadow-amber-500/20 cursor-pointer transition-all hover:scale-105"
            >
              <Plus className="w-4 h-4" />
              <span>صرف تستر جديد</span>
            </button>
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold rounded-xl text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer transition-all"
              title="تصدير كشف الجرد والتدقيق إلى ملف Excel CSV"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>تصدير CSV</span>
            </button>
            <button
              onClick={loadData}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Container */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* KPI Analytics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-slate-800/60 border border-amber-500/30 p-4 rounded-2xl relative overflow-hidden">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-amber-300">إجمالي الإنفاق التسويقي:</span>
                <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-100 font-mono mt-2">
                {formatCurrency(analytics?.total_spend || 0)}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                القيمة التكلفية الإجمالية لكافة العينات
              </span>
            </div>

            <div className="bg-slate-800/60 border border-purple-500/30 p-4 rounded-2xl relative overflow-hidden">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-purple-300">إنفاق الشهر الحالي:</span>
                <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-purple-200 font-mono mt-2">
                {formatCurrency(analytics?.month_spend || 0)}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                استهلاك {analytics?.month_samples || 0} عينة هذا الشهر
              </span>
            </div>

            <div className="bg-slate-800/60 border border-blue-500/30 p-4 rounded-2xl relative overflow-hidden">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-blue-300">إجمالي الحجم المنصرف:</span>
                <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                  <Droplet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-blue-200 font-mono mt-2">
                {analytics?.total_volume_liters || 0} لتر
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                يعادل ({analytics?.total_volume_ml || 0} مل) مسحوب
              </span>
            </div>

            <div className="bg-slate-800/60 border border-emerald-500/30 p-4 rounded-2xl relative overflow-hidden">
              <div className="flex justify-between items-start">
                <span className="text-xs font-bold text-emerald-300">عدد العينات المسجلة:</span>
                <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-200 font-mono mt-2">
                {analytics?.total_samples || 0} عينة
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                موثقة ذرياً بدون عجز جردي
              </span>
            </div>
          </div>

          {/* Leaderboard: Most Sampled Fragrances */}
          {analytics?.leaderboard && analytics.leaderboard.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-2xl p-4">
              <h3 className="text-sm font-bold text-amber-300 mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <span>العطور الأكثر طلباً كعينات وتيسترات (Most Sampled Fragrances):</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {analytics.leaderboard.slice(0, 6).map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-900/80 border border-slate-700/60 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${
                        idx === 0
                          ? 'bg-amber-500 text-slate-950'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-950'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <span className="text-xs font-bold text-slate-200 block truncate max-w-[140px]">
                          {item.fragrance_name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {item.sample_count} مرات | {item.total_ml} مل
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      {formatCurrency(item.total_spend)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit Logs Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800/40 p-3 rounded-2xl border border-slate-700/60">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="بحث في سجل التيسترات (العطر، الموظف، سبب الصرف)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">المصدر:</span>
              <select
                value={sourceTypeFilter}
                onChange={(e) => setSourceTypeFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value="all">جميع الأنواع</option>
                <option value="ready_perfume">عطور جاهزة</option>
                <option value="compounded_mix">عطور تخليط وتركيب</option>
              </select>
            </div>
          </div>

          {/* Logs Table */}
          <div className="bg-slate-800/40 rounded-2xl border border-slate-700/80 overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs text-slate-300">
                <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-700 uppercase font-mono text-[11px]">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">العطر / المكونات</th>
                    <th className="p-3">النوع</th>
                    <th className="p-3">الحجم (مل)</th>
                    <th className="p-3">التكلفة</th>
                    <th className="p-3">سبب الصرف</th>
                    <th className="p-3">الموظف</th>
                    <th className="p-3">التاريخ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-500">
                        {loading ? 'جارٍ تحميل البيانات...' : 'لا توجد سجلات تستر مطابقة للمعايير'}
                      </td>
                    </tr>
                  ) : (
                    logs.map((log, idx) => (
                      <tr key={log.id || idx} className="hover:bg-slate-800/60 transition-colors">
                        <td className="p-3 font-mono text-slate-500">{idx + 1}</td>
                        <td className="p-3">
                          <span className="font-bold text-slate-100 block">
                            {log.product_name || log.fragrance_oil_name}
                          </span>
                          {log.source_type === 'compounded_mix' && log.alcohol_name && (
                            <span className="text-[10px] text-slate-400 block">
                              مخلوط مع: {log.alcohol_name} ({log.alcohol_volume_ml} مل)
                            </span>
                          )}
                          {log.bottle_name && (
                            <span className="text-[10px] text-emerald-400/90 block">
                              العبوة: {log.bottle_name} ({log.bottle_qty || 1} قطعة — {formatCurrency(log.bottle_cost * (log.bottle_qty || 1))})
                            </span>
                          )}
                          {log.notes && (
                            <span className="text-[10px] text-amber-400/80 block mt-0.5">
                              ملاحظة: {log.notes}
                            </span>
                          )}
                        </td>
                        <td className="p-3">
                          {log.source_type === 'ready_perfume' ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                              <Package className="w-3 h-3" />
                              <span>عطر جاهز</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold inline-flex items-center gap-1">
                              <FlaskConical className="w-3 h-3" />
                              <span>تخليط لحظي</span>
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-200">
                          {log.sample_volume_ml} مل
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-400">
                          {formatCurrency(log.total_cost)}
                        </td>
                        <td className="p-3 text-slate-300 max-w-[150px] truncate" title={log.reason}>
                          {log.reason || 'عرض المحل'}
                        </td>
                        <td className="p-3 text-slate-300">
                          {log.dispensed_by || '—'}
                        </td>
                        <td className="p-3 text-slate-400 font-mono text-[10px]">
                          {log.created_at ? new Date(log.created_at).toLocaleString('ar-LY') : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Child Record Tester Modal */}
      {showRecordModal && (
        <RecordTesterModal
          isOpen={showRecordModal}
          onClose={() => setShowRecordModal(false)}
          onSuccess={handleTesterSuccess}
        />
      )}
    </div>,
    document.body
  );
};

export default TestersManagementModal;
