import React, { useState, useEffect, useCallback } from 'react';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { LossesRepository } from '../database/repositories/LossesRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate, generateId } from '../utils/helpers.js';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';

const inventoryRepo = new InventoryRepository();
const lossesRepo = new LossesRepository();

const LossesModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const [losses, setLosses] = useState([]);
  const [products, setProducts] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [filterDays, setFilterDays] = useState(30);

  // Loading states
  const [loadingLosses, setLoadingLosses] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saving, setSaving] = useState(false);

  // Confirmation states (replaces window.confirm)
  const [pendingOverQty, setPendingOverQty] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const lossReasons = [
    'زجاجة مكسورة',
    'منتج منتهي الصلاحية',
    'تسرب',
    'تلف أثناء النقل',
    'عيب في التصنيع',
    'تبخر',
    'سرقة',
    'أخرى'
  ];

  const loadLosses = useCallback(async () => {
    setLoadingLosses(true);
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filterDays);
      const data = await lossesRepo.getLossesInRange(
        cutoffDate.toISOString(),
        new Date(8640000000000000).toISOString()
      );
      setLosses(data);
    } catch (error) {
      showError('خطأ في تحميل الخسائر: ' + error.message);
    } finally {
      setLoadingLosses(false);
    }
  }, [filterDays, showError]);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const data = await inventoryRepo.findAll({}, 'name ASC');
      setProducts(data);
    } catch (error) {
      showError('خطأ في تحميل المنتجات: ' + error.message);
    } finally {
      setLoadingProducts(false);
    }
  }, [showError]);

  useEffect(() => {
    loadLosses();
    loadProducts();
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
        unit: product.unit,
        cost_value: costValue,
        reason: `${reason}${notes ? `: ${notes}` : ''}`
      };

      // Insert loss + deduct inventory in one transaction
      await lossesRepo.createLossWithInventoryDeduction(lossData, product.id);

      setSelectedProduct('');
      setQuantity('');
      setReason('');
      setNotes('');
      setShowAddModal(false);
      await Promise.all([loadLosses(), loadProducts()]);

      showSuccess(`✅ تم تسجيل الفقد\nالمنتج: ${product.name}\nالكمية المخصومة: ${actualQty}\nالتكلفة: ${formatCurrency(costValue)}`);
    } catch (error) {
      showError('خطأ في تسجيل الفقد: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const addLoss = async () => {
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      showWarning('يرجى إدخال كمية صحيحة');
      return;
    }

    if (!selectedProduct) {
      showWarning('يرجى اختيار منتج');
      return;
    }

    if (!reason) {
      showWarning('يرجى اختيار سبب الفقد');
      return;
    }

    const product = products.find(p => p.id === selectedProduct);
    if (!product) {
      showError('منتج غير موجود');
      return;
    }

    const actualQty = Math.min(qty, product.qty);
    const costValue = product.cost * actualQty;

    if (qty > product.qty) {
      // Ask via confirm modal instead of window.confirm
      setPendingOverQty({
        product,
        qty,
        actualQty,
        costValue
      });
      return;
    }

    await performAddLoss(product, actualQty, costValue);
  };

  const deleteLoss = async (loss) => {
    setPendingDelete(null);
    try {
      await lossesRepo.delete(loss.id);
      await loadLosses();
      showSuccess('✅ تم حذف السجل');
    } catch (error) {
      showError('خطأ في حذف السجل: ' + error.message);
    }
  };

  const totalCost = losses.reduce((sum, l) => sum + l.cost_value, 0);
  const totalQty = losses.reduce((sum, l) => sum + l.qty, 0);

  return (
    <div className="h-full flex flex-col glass-card p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>💔</span>
          <span>الفاقد والتالف</span>
        </h2>
        <div className="flex gap-3">
          <select
            value={filterDays}
            onChange={(e) => setFilterDays(parseInt(e.target.value))}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30"
          >
            <option value={7}>آخر 7 أيام</option>
            <option value={30}>آخر 30 يوم</option>
            <option value={90}>آخر 90 يوم</option>
            <option value={365}>السنة كاملة</option>
          </select>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-gold px-4 py-2"
          >
            ➕ تسجيل فقد
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">إجمالي الكمية ({filterDays} يوم):</span>
            <span className="text-xl font-bold text-red-400">
              {totalQty.toFixed(1)}
            </span>
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">إجمالي التكلفة:</span>
            <span className="text-xl font-bold text-red-400">
              {formatCurrency(totalCost)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loadingLosses ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="h-5 bg-gray-700 rounded mb-2 w-1/3"></div>
                <div className="h-4 bg-gray-700 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : losses.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            لا توجد خسائر مسجلة
          </div>
        ) : (
          <div className="space-y-2">
            {losses.map(loss => (
              <div key={loss.id} className="glass-card p-4 hover:border-gold/50 transition-all">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl font-bold text-red-400">
                        {loss.item_name}
                      </span>
                      <span className="text-xs bg-red-600/20 text-red-400 px-2 py-1 rounded">
                        {loss.qty} {loss.unit}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400">
                      {formatDate(loss.date)}
                    </div>
                    <div className="text-sm font-bold text-gray-300 mt-1">
                      الخسارة: {formatCurrency(loss.cost_value)}
                    </div>
                  </div>
                  <button
                    onClick={() => setPendingDelete(loss)}
                    className="text-red-500 hover:text-red-400 text-xl"
                  >
                    🗑️
                  </button>
                </div>

                <div className="bg-gray-800/50 p-3 rounded">
                  <div className="flex items-start gap-2">
                    <span className="text-gray-400 min-w-[80px]">السبب:</span>
                    <span className="font-bold text-red-300">{loss.reason}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[600px] max-h-[90vh] overflow-y-auto scrollbar-thin">
            <h2 className="text-2xl font-bold text-gold mb-4">تسجيل فقد / تلف</h2>
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">المنتج *</label>
                <select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  autoFocus
                >
                  <option value="">اختر منتج...</option>
                  {loadingProducts ? (
                    <option disabled>جاري تحميل المنتجات...</option>
                  ) : (
                    products.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.name} - متوفر: {product.qty} {product.unit}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">الكمية المفقودة *</label>
                <input
                  type="number"
                  placeholder="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  min="0"
                  step="0.1"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">السبب *</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                >
                  <option value="">اختر السبب...</option>
                  {lossReasons.map((r, idx) => (
                    <option key={idx} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">تفاصيل إضافية</label>
                <textarea
                  placeholder="ملاحظات حول الفقد..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 h-24 resize-none"
                />
              </div>

              {selectedProduct && quantity && (
                <div className="bg-red-600/10 border border-red-400/30 p-3 rounded-lg">
                  <div className="text-sm text-red-400 mb-2">
                    ⚠️ سيتم خصم الكمية من المخزون نهائياً
                  </div>
                  {(() => {
                    const product = products.find(p => p.id === selectedProduct);
                    const qty = parseFloat(quantity) || 0;
                    const cost = product ? product.cost * Math.min(qty, product.qty) : 0;
                    return (
                      <div className="font-bold">
                        خسارة التكلفة: {formatCurrency(cost)}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={addLoss}
                disabled={!selectedProduct || !quantity || !reason || saving}
                className="flex-1 btn-gold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '⏳ جاري الحفظ...' : '✅ تسجيل الفقد'}
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedProduct('');
                  setQuantity('');
                  setReason('');
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

      {/* Over-quantity confirmation (replaces window.confirm) */}
      <ConfirmModal
        open={!!pendingOverQty}
        title="الكمية أكبر من المخزون"
        icon="⚠️"
        message={pendingOverQty
          ? `الكمية المسجلة (${pendingOverQty.qty}) أكبر من المخزون الحالي (${pendingOverQty.product.qty})\n\nسيتم خصم الكمية المتاحة فقط (${pendingOverQty.actualQty})\nبالتكلفة: ${formatCurrency(pendingOverQty.costValue)}`
          : ''}
        confirmLabel="✅ متابعة"
        cancelLabel="إلغاء"
        onConfirm={() => {
          const { product, actualQty, costValue } = pendingOverQty;
          setPendingOverQty(null);
          performAddLoss(product, actualQty, costValue);
        }}
        onCancel={() => setPendingOverQty(null)}
      />

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!pendingDelete}
        title="حذف سجل الفقد"
        icon="🗑️"
        message={pendingDelete
          ? `هل أنت متأكد من حذف سجل الفقد "${pendingDelete.item_name}"؟\n\n⚠️ لن يتم إرجاع الكمية للمخزون`
          : ''}
        confirmLabel="🗑️ حذف"
        cancelLabel="إلغاء"
        onConfirm={() => deleteLoss(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};

export default LossesModule;
