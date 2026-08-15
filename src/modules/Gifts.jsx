/**
 * ============================================================================
 * GIFTS MODULE - REFACTORED WITH REPOSITORY PATTERN + UI STORE
 * ============================================================================
 *
 * Features:
 * - GiftsRepository (transactional insert + inventory deduction)
 * - InventoryRepository via useInventoryStore for the product catalog
 * - useUIStore toasts (replaces alert/confirm) + custom confirm modal
 * - Date range filter (from / to)
 * - Stock deduction on gift, stock restore on delete
 * - Summary totals (count, total cost, unique recipients/products)
 * - Loading skeletons + empty states
 *
 * Architecture reference: src/modules/POS.jsx
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { GiftsRepository } from '../database/repositories/GiftsRepository.js';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate, generateId, safeParseFloat } from '../utils/helpers.js';
import useDebounce from '../hooks/useDebounce.js';

const giftsRepo = new GiftsRepository();

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

const GiftsModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  // Inventory store (products catalog)
  const {
    products,
    loading: productsLoading,
    loadProducts,
    invalidateCache
  } = useInventoryStore();

  // Data
  const [gifts, setGifts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Date range filter
  const [startDate, setStartDate] = useState(() => toDateInputValue(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState(() => toDateInputValue(Date.now()));

  // Search
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [reason, setReason] = useState('');
  const [author, setAuthor] = useState('');

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    loadGifts();
  }, [startDate, endDate]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // ---------------------------------------------------------------
  // Load gifts + summary in the selected range
  // ---------------------------------------------------------------
  const loadGifts = async () => {
    const startISO = toStartISO(startDate);
    const endISO = toEndISO(endDate);
    if (!startISO || !endISO) {
      showError('يرجى اختيار نطاق تاريخ صحيح');
      return;
    }

    setLoading(true);
    try {
      const [data, sum] = await Promise.all([
        giftsRepo.getGiftsInRange(startISO, endISO),
        giftsRepo.getGiftsSummary(startISO, endISO)
      ]);
      setGifts(data);
      setSummary(sum);
    } catch (error) {
      showError(`خطأ في تحميل الهدايا: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshProducts = async () => {
    invalidateCache();
    await loadProducts(true);
  };

  // ---------------------------------------------------------------
  // Add gift (transactional insert + inventory deduction)
  // ---------------------------------------------------------------
  const addGift = async () => {
    const qty = safeParseFloat(quantity, NaN);
    if (isNaN(qty) || qty <= 0) {
      showError('يرجى إدخال كمية صحيحة');
      return;
    }

    if (!selectedProduct) {
      showError('يرجى اختيار منتج');
      return;
    }

    const product = products.find((p) => p.id === selectedProduct);
    if (!product) {
      showError('منتج غير موجود');
      return;
    }

    if (qty > product.qty) {
      showWarning(`الكمية المطلوبة (${qty}) أكبر من المتوفر (${product.qty})`);
      return;
    }

    try {
      const costValue = product.cost * qty;

      await giftsRepo.createGiftWithInventoryDeduction({
        id: generateId(),
        date: new Date().toISOString(),
        recipient_name: recipientName.trim(),
        recipient_phone: recipientPhone.trim(),
        reason: reason.trim(),
        author: author.trim(),
        product_id: product.id,
        item_name: product.name,
        qty,
        unit: product.unit,
        cost_value: costValue
      });

      setSelectedProduct('');
      setQuantity('');
      setRecipientName('');
      setRecipientPhone('');
      setReason('');
      setAuthor('');
      setShowAddModal(false);
      await loadGifts();
      await refreshProducts();

      showSuccess(
        `✅ تم تسجيل الهدية بنجاح\nالمنتج: ${product.name}\nالكمية: ${qty}\nالتكلفة: ${formatCurrency(costValue)}`
      );
    } catch (error) {
      showError(`خطأ في تسجيل الهدية: ${error.message}`);
    }
  };

  // ---------------------------------------------------------------
  // Delete gift (restores inventory + custom confirm modal)
  // ---------------------------------------------------------------
  const deleteGift = (gift) => {
    setConfirmDelete({
      message: `هل أنت متأكد من حذف هدية "${gift.item_name}"؟\nسيتم إرجاع الكمية للمخزون`,
      onConfirm: async () => {
        try {
          await giftsRepo.deleteGiftWithInventoryRestore(gift.id);
          setConfirmDelete(null);
          await loadGifts();
          await refreshProducts();
          showSuccess('✅ تم حذف الهدية وإرجاع الكمية للمخزون');
        } catch (error) {
          setConfirmDelete(null);
          showError(`خطأ في حذف الهدية: ${error.message}`);
        }
      }
    });
  };

  // ---------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------
  const availableProducts = useMemo(
    () => products.filter((p) => p.qty > 0),
    [products]
  );

  const filteredGifts = useMemo(() => {
    if (!debouncedSearch) return gifts;
    const term = debouncedSearch.toLowerCase();
    return gifts.filter(
      (g) =>
        (g.recipient_name || '').toLowerCase().includes(term) ||
        (g.item_name || '').toLowerCase().includes(term) ||
        (g.reason || '').toLowerCase().includes(term)
    );
  }, [gifts, debouncedSearch]);

  const totalCost = gifts.reduce((sum, g) => sum + (g.cost_value || 0), 0);

  // Selected product cost preview
  const selectedProductCost = useMemo(() => {
    if (!selectedProduct || !quantity) return 0;
    const product = products.find((p) => p.id === selectedProduct);
    if (!product) return 0;
    return product.cost * safeParseFloat(quantity, 0);
  }, [selectedProduct, quantity, products]);

  // ===============================================================
  // RENDER
  // ===============================================================
  return (
    <div className="h-full flex flex-col glass-card p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>🎁</span>
          <span>الهدايا والعينات</span>
        </h2>
        <div className="flex gap-3 flex-wrap">
          {/* Date range filter */}
          <div className="flex items-center gap-2 bg-gray-800 p-2 rounded-lg border border-gold/30">
            <span className="text-sm text-gray-400">من</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm"
            />
            <span className="text-sm text-gray-400">إلى</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm"
            />
          </div>
          <button onClick={loadGifts} className="bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors">
            🔄
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-gold px-4 py-2"
          >
            ➕ هدية جديدة
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">عدد الهدايا</div>
          <div className="text-2xl font-bold text-white mt-1">
            {summary?.total_gifts || 0}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">إجمالي التكلفة</div>
          <div className="text-2xl font-bold text-purple-400 mt-1">
            {formatCurrency(summary?.total_cost || totalCost)}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">عدد المستلمين</div>
          <div className="text-2xl font-bold text-yellow-400 mt-1">
            {summary?.unique_recipients || 0}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-sm text-gray-400">عدد المنتجات</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">
            {summary?.unique_products || 0}
          </div>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="🔍 بحث في الهدايا (المستلم / المنتج / السبب)..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="mb-4 bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30 focus:outline-none focus:border-gold"
      />

      {/* Gifts list */}
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
        ) : filteredGifts.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="text-6xl mb-4">🎁</div>
            <p className="text-xl mb-2">
              {debouncedSearch ? 'لا توجد نتائج مطابقة للبحث' : 'لا توجد هدايا في هذه الفترة'}
            </p>
            <p className="text-sm">
              {debouncedSearch ? 'جرب كلمة بحث أخرى' : 'غيّر نطاق التاريخ أو أضف هدية جديدة'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredGifts.map((gift) => (
              <div key={gift.id} className="glass-card p-4 hover:border-gold/50 transition-all">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl font-bold text-purple-400">{gift.item_name}</span>
                      <span className="text-xs bg-purple-600/20 text-purple-400 px-2 py-1 rounded">
                        {gift.qty} {gift.unit}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400">{formatDate(gift.date)}</div>
                    <div className="text-sm font-bold text-gray-300 mt-1">
                      التكلفة: {formatCurrency(gift.cost_value)}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteGift(gift)}
                    className="text-red-500 hover:text-red-400 text-xl"
                  >
                    🗑️
                  </button>
                </div>

                <div className="space-y-2 bg-gray-800/50 p-3 rounded">
                  {gift.recipient_name && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 min-w-[80px]">المستلم:</span>
                      <span className="font-bold">{gift.recipient_name}</span>
                    </div>
                  )}
                  {gift.recipient_phone && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 min-w-[80px]">الهاتف:</span>
                      <span>{gift.recipient_phone}</span>
                    </div>
                  )}
                  {gift.reason && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 min-w-[80px]">السبب:</span>
                      <span className="text-sm">{gift.reason}</span>
                    </div>
                  )}
                  {gift.author && (
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 min-w-[80px]">المسجل:</span>
                      <span className="text-sm">{gift.author}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Gift Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[600px] max-h-[90vh] overflow-y-auto scrollbar-thin">
            <h2 className="text-2xl font-bold text-gold mb-4">تسجيل هدية جديدة</h2>

            {productsLoading ? (
              <div className="space-y-3 mb-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-800 rounded-lg animate-pulse"></div>
                ))}
              </div>
            ) : (
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
                    {availableProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} - متوفر: {product.qty} {product.unit}
                      </option>
                    ))}
                  </select>
                  {availableProducts.length === 0 && (
                    <p className="text-xs text-yellow-400 mt-1">
                      لا توجد منتجات متوفرة في المخزون
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">الكمية *</label>
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
                  <label className="text-sm text-gray-400 mb-1 block">اسم المستلم</label>
                  <input
                    type="text"
                    placeholder="اسم المستلم..."
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">رقم الهاتف</label>
                  <input
                    type="tel"
                    placeholder="رقم هاتف المستلم..."
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">السبب / المناسبة</label>
                  <input
                    type="text"
                    placeholder="مثال: عميل VIP، عينة تسويقية، هدية ترويجية..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">المسجل</label>
                  <input
                    type="text"
                    placeholder="اسم من سجل الهدية..."
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  />
                </div>

                {selectedProduct && quantity && (
                  <div className="bg-purple-600/10 border border-purple-400/30 p-3 rounded-lg">
                    <div className="text-sm text-purple-400">
                      💡 سيتم خصم الكمية من المخزون بالتكلفة فقط (بدون إيراد مبيعات)
                    </div>
                    <div className="mt-2 font-bold text-purple-400">
                      التكلفة: {formatCurrency(selectedProductCost)}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={addGift}
                disabled={!selectedProduct || !quantity || productsLoading}
                className="flex-1 btn-gold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✅ تسجيل الهدية
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedProduct('');
                  setQuantity('');
                  setRecipientName('');
                  setRecipientPhone('');
                  setReason('');
                  setAuthor('');
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
            <p className="text-gray-300 mb-6 whitespace-pre-line">{confirmDelete.message}</p>
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

export default GiftsModule;
