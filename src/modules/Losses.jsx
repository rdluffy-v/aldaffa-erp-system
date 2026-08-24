/**
 * ============================================================================
 * LOSSES & DAMAGED GOODS MODULE (التوالف والفاقد)
 * ============================================================================
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { LossesRepository } from '../database/repositories/LossesRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate, generateId, safeParseFloat } from '../utils/helpers.js';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';
import useDebounce from '../hooks/useDebounce.js';
import {
  HeartCrack,
  Plus,
  Search,
  Trash2,
  Calendar,
  AlertTriangle,
  Package,
  FileText,
  DollarSign,
  TrendingDown,
  Info
} from 'lucide-react';

const inventoryRepo = new InventoryRepository();
const lossesRepo = new LossesRepository();

const LossesModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const [losses, setLosses] = useState([]);
  const [products, setProducts] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('زجاجة مكسورة');
  const [notes, setNotes] = useState('');
  const [filterDays, setFilterDays] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Loading states
  const [loadingLosses, setLoadingLosses] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);

  // Confirmation states
  const [pendingOverQty, setPendingOverQty] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const lossReasons = [
    'زجاجة مكسورة',
    'منتج منتهي الصلاحية',
    'تسرب وسيلان',
    'تلف أثناء النقل والشحن',
    'عيب في التصنيع والتعبئة',
    'تبخر ونقصان',
    'فقدان وسرقة',
    'أخرى'
  ];

  const loadLosses = useCallback(async () => {
    setLoadingLosses(true);
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filterDays);
      const startDate = cutoffDate.toISOString();
      const endDate = new Date(Date.now() + 86400000).toISOString(); // end of next 24h ensures all today entries are fetched

      const data = await lossesRepo.getLossesInRange(startDate, endDate);
      setLosses(data || []);
    } catch (error) {
      showError('خطأ في تحميل سجل التوالف: ' + error.message);
    } finally {
      setLoadingLosses(false);
    }
  }, [filterDays, showError]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const data = await inventoryRepo.findAll({}, 'name ASC');
      setProducts(data || []);
    } catch (error) {
      showError('خطأ في تحميل المنتجات: ' + error.message);
    } finally {
      setLoadingProducts(false);
    }
  }, [showError]);

  useEffect(() => {
    loadLosses();
    loadProducts();

    const handleRefresh = () => {
      loadLosses();
      loadProducts();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, [loadLosses, loadProducts]);

  const performAddLoss = async (product, actualQty, costValue) => {
    setSaving(true);
    try {
      const id = generateId();
      const lossData = {
        id,
        date: new Date().toISOString(),
        item_name: product.name,
        qty: actualQty,
        unit: product.unit || 'قطعة',
        cost_value: costValue,
        reason: `${reason}${notes.trim() ? `: ${notes.trim()}` : ''}`
      };

      // Insert loss + deduct inventory in one transaction
      await lossesRepo.createLossWithInventoryDeduction(lossData, product.id);

      setSelectedProduct('');
      setQuantity('');
      setReason('زجاجة مكسورة');
      setNotes('');
      setShowAddModal(false);
      await Promise.all([loadLosses(), loadProducts()]);

      showSuccess(`✅ تم تسجيل الفاقد والتالف بنجاح: ${product.name} (الكمية: ${actualQty} ${product.unit || 'قطعة'})`);
    } catch (error) {
      showError('خطأ في تسجيل التالف: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const addLoss = async () => {
    const qty = safeParseFloat(quantity, 0);
    if (qty <= 0) {
      showWarning('يرجى إدخال كمية صحيحة أكبر من صفر');
      return;
    }

    if (!selectedProduct) {
      showWarning('يرجى اختيار المنتج التالف من القائمة');
      return;
    }

    if (!reason) {
      showWarning('يرجى اختيار سبب التلف');
      return;
    }

    const product = products.find((p) => String(p.id) === String(selectedProduct));
    if (!product) {
      showError('المنتج المحدد غير موجود في المخزون');
      return;
    }

    const currentQty = safeParseFloat(product.qty, 0);
    const unitCost = safeParseFloat(product.cost, 0);
    const actualQty = Math.min(qty, Math.max(0, currentQty));
    const costValue = unitCost * qty;

    if (qty > currentQty) {
      setPendingOverQty({
        product,
        qty,
        actualQty,
        costValue
      });
      return;
    }

    await performAddLoss(product, qty, costValue);
  };

  const deleteLoss = async () => {
    const loss = pendingDelete;
    setPendingDelete(null);
    if (!loss) return;

    try {
      await lossesRepo.delete(loss.id);
      await loadLosses();
      showSuccess('✅ تم حذف سجل التالف بنجاح');
    } catch (error) {
      showError('خطأ في حذف السجل: ' + error.message);
    }
  };

  const filteredLosses = useMemo(() => {
    if (!debouncedSearch) return losses;
    const term = debouncedSearch.toLowerCase();
    return losses.filter(
      (l) =>
        (l.item_name || '').toLowerCase().includes(term) ||
        (l.reason || '').toLowerCase().includes(term)
    );
  }, [losses, debouncedSearch]);

  const totalCost = filteredLosses.reduce((sum, l) => sum + (safeParseFloat(l.cost_value, 0)), 0);
  const totalQty = filteredLosses.reduce((sum, l) => sum + (safeParseFloat(l.qty, 0)), 0);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header Bar */}
      <div className="atelier-card p-4 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold shadow-sm">
            <HeartCrack className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#2D2424] dark:text-white">سجل التوالف والفاقد</h1>
            <p className="text-xs text-[#5C524F] dark:text-slate-400">
              توثيق البضاعة التالفة، كسر الزجاجات، والتبخر وخصمها من المخزون تلقائياً
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterDays}
            onChange={(e) => setFilterDays(parseInt(e.target.value))}
            className="input-atelier py-1.5 px-3 text-xs font-bold"
          >
            <option value={7}>آخر 7 أيام</option>
            <option value={30}>آخر 30 يوم</option>
            <option value={90}>آخر 90 يوم</option>
            <option value={365}>السنة كاملة</option>
          </select>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-atelier-primary py-1.5 px-4 text-xs flex items-center gap-1.5 font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>➕ تسجيل تالف جديد</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="atelier-card p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-gray-500 font-bold">إجمالي تكلفة التوالف</div>
            <div className="text-xl font-black text-rose-600 dark:text-rose-400 tabular-nums">
              {formatCurrency(totalCost)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>

        <div className="atelier-card p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-gray-500 font-bold">إجمالي كمية القطع التالفة</div>
            <div className="text-xl font-black text-[#2D2424] dark:text-white tabular-nums">
              {totalQty.toFixed(1)} وحدة
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="atelier-card p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-gray-500 font-bold">عدد السجلات المسجلة</div>
            <div className="text-xl font-black text-blue-600 dark:text-blue-400 tabular-nums">
              {filteredLosses.length} سجل
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute start-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="بحث في التوالف بالاسم أو السبب..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-atelier w-full ps-9 py-2 text-xs"
        />
      </div>

      {/* Losses List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 scrollbar-thin pr-1">
        {loadingLosses ? (
          <div className="p-8 text-center text-xs text-gray-400">جاري تحميل سجلات التوالف...</div>
        ) : filteredLosses.length === 0 ? (
          <div className="atelier-card p-12 text-center flex flex-col items-center justify-center gap-3">
            <HeartCrack className="w-12 h-12 text-gray-300 dark:text-slate-600" />
            <div className="text-sm font-bold text-gray-600 dark:text-gray-300">لا توجد توالف أو فواقد مسجلة في هذه الفترة</div>
            <p className="text-xs text-gray-400">اضغط على "تسجيل تالف جديد" لتوثيق أي كسر أو تلف وخصمه من المخزون</p>
          </div>
        ) : (
          filteredLosses.map((loss) => (
            <div
              key={loss.id}
              className="atelier-card p-3.5 flex justify-between items-center hover:border-rose-500/40 transition-all shadow-sm"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-extrabold text-sm text-[#2D2424] dark:text-white">
                    {loss.item_name}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                    {loss.qty} {loss.unit || 'قطعة'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">
                    {loss.reason || 'تلف عام'}
                  </span>
                </div>
                <div className="text-[11px] text-gray-400 flex items-center gap-2">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(loss.date)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-left">
                  <div className="text-sm font-black text-rose-600 dark:text-rose-400 tabular-nums">
                    {formatCurrency(loss.cost_value)}
                  </div>
                  <div className="text-[10px] text-gray-400">قيمة الخسارة</div>
                </div>

                <button
                  type="button"
                  onClick={() => setPendingDelete(loss)}
                  className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="حذف هذا السجل"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Loss Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="atelier-card bg-white dark:bg-slate-900 w-full max-w-lg p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-rose-500/20 pb-3">
              <div>
                <h2 className="text-lg font-bold text-[#2D2424] dark:text-rose-300 flex items-center gap-2">
                  <HeartCrack className="w-5 h-5 text-rose-500" />
                  <span>تسجيل منتج تالف أو فاقد</span>
                </h2>
                <p className="text-[11px] text-gray-500">
                  سيتم خصم الكمية التالفة فورياً من رصيد المخزون واحتساب التكلفة في تقرير الوردية
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                  اختر المنتج التالف من المخزون *:
                </label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="input-atelier w-full text-xs font-bold"
                  autoFocus
                >
                  <option value="">-- اضغط لاختيار المنتج --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (المتوفر: {p.qty} {p.unit} — التكلفة: {formatCurrency(p.cost)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                    الكمية التالفة *:
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    placeholder="مثال: 1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="input-atelier w-full text-xs font-bold text-center"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                    سبب التلف *:
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="input-atelier w-full text-xs font-bold"
                  >
                    {lossReasons.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                  تفاصيل وملاحظات إضافية (اختياري):
                </label>
                <textarea
                  placeholder="وصف سبب الكسر أو رقم الكرتونة أو تفاصيل الحادثة..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input-atelier w-full h-16 text-xs resize-none"
                />
              </div>

              {selectedProduct && quantity > 0 && (
                <div className="bg-rose-50/70 dark:bg-slate-800/70 p-3 rounded-xl border border-rose-200/60 dark:border-rose-500/20 text-xs flex justify-between items-center">
                  <span className="text-gray-500 font-bold">قيمة الخسارة التقديرية المحتسبة:</span>
                  <span className="font-extrabold text-rose-600 dark:text-rose-400 text-sm tabular-nums">
                    {formatCurrency(
                      (products.find((p) => String(p.id) === String(selectedProduct))?.cost || 0) *
                        safeParseFloat(quantity, 0)
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={addLoss}
                disabled={saving || !selectedProduct || !quantity}
                className="flex-1 btn-atelier-primary py-2 text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                {saving ? '⏳ جاري التسجيل والخصم من المخزون...' : '✅ تأكيد تسجيل التالف وخصم المخزون'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="btn-atelier-secondary py-2 px-4 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Over Quantity Warning Modal */}
      {pendingOverQty && (
        <ConfirmModal
          title="⚠️ الكمية التالفة أكبر من رصيد المخزون المتوفر!"
          message={`الكمية المدخلة (${pendingOverQty.qty}) أكبر من الكمية الفعلية المتوفرة في المخزون (${pendingOverQty.product.qty} ${pendingOverQty.product.unit || 'قطعة'}).\nهل تريد تسجيل التالف بكامل الكمية المتوفرة (${pendingOverQty.actualQty})؟`}
          onConfirm={() => {
            const item = pendingOverQty;
            setPendingOverQty(null);
            performAddLoss(item.product, item.actualQty, item.costValue);
          }}
          onCancel={() => setPendingOverQty(null)}
          confirmText="نعم، تسجيل الكمية المتوفرة"
          cancelText="تراجع وتعديل الكمية"
        />
      )}

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <ConfirmModal
          title="تأكيد حذف سجل التالف"
          message={`هل أنت متأكد من رغبتك في حذف سجل التالف الخاص بـ "${pendingDelete.item_name}"؟`}
          onConfirm={deleteLoss}
          onCancel={() => setPendingDelete(null)}
          confirmText="نعم، حذف السجل"
          cancelText="إلغاء"
        />
      )}
    </div>
  );
};

export default LossesModule;
