/**
 * ============================================================================
 * PURCHASES MODULE - REFACTORED WITH REPOSITORY PATTERN + UI STORE
 * ============================================================================
 *
 * Features:
 * - PurchasesRepository + InventoryRepository for ALL data access
 * - useUIStore toasts (replaces alert/confirm)
 * - Gemini OCR invoice extraction (kept intact)
 * - Purchase history search (by supplier or item name)
 * - Loading skeletons + empty states
 *
 * Architecture reference: src/modules/POS.jsx
 * ============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { PurchasesRepository } from '../database/repositories/PurchasesRepository.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { BaseRepository } from '../database/repositories/BaseRepository.js';
import { db } from '../database/connection.js';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate, generateId, safeParseFloat } from '../utils/helpers.js';
import useDebounce from '../hooks/useDebounce.js';

const purchasesRepo = new PurchasesRepository();
const inventoryRepo = new InventoryRepository();

/**
 * SettingsRepository - key/value store for app settings (Gemini API key).
 * BaseRepository CRUD assumes an `id` column, but `settings` uses `key` as
 * its primary key, so the upsert logic is implemented explicitly here.
 */
class SettingsRepository extends BaseRepository {
  constructor() {
    super('settings');
  }

  async getValue(key) {
    const row = await this.findOne({ key });
    return row ? row.value : null;
  }

  async setValue(key, value) {
    const existing = await this.findOne({ key });
    const queries = existing
      ? [{ sql: 'UPDATE settings SET value = ? WHERE key = ?', params: [value, key] }]
      : [{ sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', params: [key, value] }];
    await db.transaction(queries);
  }
}

const settingsRepo = new SettingsRepository();

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const PurchasesModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  // Inventory store (product catalog)
  const {
    products,
    loading: productsLoading,
    loadProducts
  } = useInventoryStore();

  // Data
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters / search
  const [filterDays, setFilterDays] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [showOCRModal, setShowOCRModal] = useState(false);

  // Purchase form
  const [supplierName, setSupplierName] = useState('');
  const [purchaseItems, setPurchaseItems] = useState([]);
  const [notes, setNotes] = useState('');

  // OCR state
  const [geminiKey, setGeminiKey] = useState('');
  const [ocrImage, setOcrImage] = useState(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);

  // Load initial data
  useEffect(() => {
    loadPurchases();
  }, [filterDays]);

  useEffect(() => {
    loadProducts();
    loadGeminiKey();
  }, [loadProducts]);

  // ---------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------
  const loadPurchases = async () => {
    setLoading(true);
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filterDays);
      const data = await purchasesRepo.getPurchasesInRange(
        cutoffDate.toISOString(),
        new Date().toISOString()
      );
      setPurchases(data);
    } catch (error) {
      showError(`خطأ في تحميل المشتريات: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadGeminiKey = async () => {
    try {
      const key = await settingsRepo.getValue('gemini_api_key');
      if (key) setGeminiKey(key);
    } catch (error) {
      console.warn('Failed to load Gemini API key:', error.message);
    }
  };

  const saveGeminiKey = async (key) => {
    const trimmed = key.trim();
    if (!trimmed) {
      showWarning('يرجى إدخال مفتاح Gemini API');
      return;
    }
    try {
      await settingsRepo.setValue('gemini_api_key', trimmed);
      setGeminiKey(trimmed);
      showSuccess('✅ تم حفظ مفتاح Gemini API');
    } catch (error) {
      showError(`خطأ في حفظ المفتاح: ${error.message}`);
    }
  };

  // ---------------------------------------------------------------
  // Purchase items form helpers
  // ---------------------------------------------------------------
  const addPurchaseItem = () => {
    setPurchaseItems([
      ...purchaseItems,
      {
        product_id: '',
        name: '',
        quantity: 0,
        cost_per_unit: 0,
        total_cost: 0,
        unit: ''
      }
    ]);
  };

  const updatePurchaseItem = (index, field, value) => {
    const updated = [...purchaseItems];
    updated[index][field] = value;

    if (field === 'product_id') {
      const product = products.find((p) => p.id === value);
      if (product) {
        updated[index].name = product.name;
        updated[index].cost_per_unit = product.cost;
        updated[index].unit = product.unit || 'piece';
      }
    }

    if (field === 'quantity' || field === 'cost_per_unit') {
      const qty = safeParseFloat(updated[index].quantity, 0);
      const cost = safeParseFloat(updated[index].cost_per_unit, 0);
      updated[index].total_cost = qty * cost;
    }

    setPurchaseItems(updated);
  };

  const removePurchaseItem = (index) => {
    setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
  };

  // ---------------------------------------------------------------
  // Save purchase (insert + WAC inventory update in one transaction)
  // ---------------------------------------------------------------
  const savePurchase = async () => {
    if (purchaseItems.length === 0) {
      showError('يرجى إضافة منتجات للطلب');
      return;
    }

    const invalidItems = purchaseItems.filter(
      (item) => !item.product_id || item.quantity <= 0 || item.cost_per_unit <= 0
    );
    if (invalidItems.length > 0) {
      showError('يرجى التأكد من صحة بيانات جميع المنتجات');
      return;
    }

    setSaving(true);
    try {
      const id = generateId();
      const total = purchaseItems.reduce((sum, item) => sum + (item.total_cost || 0), 0);

      const purchaseData = {
        id,
        date: new Date().toISOString(),
        supplier_name: supplierName.trim() || null,
        total,
        items_json: JSON.stringify(purchaseItems)
      };

      const inventoryItems = purchaseItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        cost_per_unit: item.cost_per_unit
      }));

      // Transactional insert + weighted average cost inventory update
      await purchasesRepo.createPurchaseWithInventoryUpdate(purchaseData, inventoryItems, inventoryRepo);

      // Print purchase order (best effort - non-fatal on failure)
      try {
        const electron = window.require('electron');
        await electron.ipcRenderer.invoke('print:purchase-order', {
          orderId: id,
          date: new Date().toISOString(),
          supplier: supplierName.trim(),
          items: purchaseItems,
          total,
          notes
        });
      } catch (printError) {
        console.warn('Print purchase order failed:', printError);
      }

      resetForm();
      await loadPurchases();
      await loadProducts(true); // Force refresh to reflect updated stock/cost

      showSuccess(`✅ تم تسجيل الطلب بنجاح\nرقم الطلب: ${id}\nالمجموع: ${formatCurrency(total)}`);
    } catch (error) {
      showError(`خطأ في حفظ الطلب: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------
  // Gemini OCR invoice extraction
  // ---------------------------------------------------------------
  const readFileAsBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('فشل في قراءة الصورة'));
      reader.readAsDataURL(file);
    });

  const processOCRInvoice = async () => {
    if (!ocrImage) {
      showError('يرجى اختيار صورة الفاتورة');
      return;
    }

    if (!geminiKey.trim()) {
      showError('يرجى إدخال مفتاح Gemini API أولاً');
      return;
    }

    setOcrProcessing(true);

    try {
      const base64Image = await readFileAsBase64(ocrImage);

      const response = await fetch(`${GEMINI_API_URL}?key=${geminiKey.trim()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Extract purchase invoice data from this image. Return ONLY valid JSON with this structure:
{
  "supplier": "supplier name",
  "items": [
    {"name": "product name", "quantity": number, "unit_price": number}
  ]
}
No additional text, only JSON.`
                },
                {
                  inline_data: {
                    mime_type: ocrImage.type,
                    data: base64Image
                  }
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();

      if (data.candidates && data.candidates[0]) {
        const text = data.candidates[0].content.parts[0].text;
        const jsonMatch = text.match(/\{[\s\S]*\}/);

        if (!jsonMatch) {
          throw new Error('لم يتم العثور على بيانات JSON في الاستجابة');
        }

        const invoiceData = JSON.parse(jsonMatch[0]);

        setSupplierName(invoiceData.supplier || '');

        const items = (invoiceData.items || []).map((item) => {
          const matchingProduct = products.find((p) =>
            p.name.toLowerCase().includes(String(item.name || '').toLowerCase())
          );

          const quantity = safeParseFloat(item.quantity, 0);
          const unitPrice = safeParseFloat(item.unit_price, 0);

          return {
            product_id: matchingProduct?.id || '',
            name: item.name || 'منتج',
            quantity,
            cost_per_unit: unitPrice,
            total_cost: quantity * unitPrice,
            unit: matchingProduct?.unit || 'piece'
          };
        });

        setPurchaseItems(items);
        setShowOCRModal(false);
        setShowModal(true);

        showSuccess('✅ تم استخراج بيانات الفاتورة بنجاح');
      } else {
        throw new Error('فشل في معالجة الصورة');
      }
    } catch (error) {
      showError(`خطأ في معالجة الفاتورة: ${error.message}`);
    } finally {
      setOcrProcessing(false);
    }
  };

  // ---------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------
  const resetForm = () => {
    setSupplierName('');
    setPurchaseItems([]);
    setNotes('');
    setShowModal(false);
    setShowOCRModal(false);
    setOcrImage(null);
  };

  // ---------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------
  const filteredPurchases = useMemo(() => {
    if (!debouncedSearch) return purchases;
    const term = debouncedSearch.toLowerCase();
    return purchases.filter((p) => {
      const items = JSON.parse(p.items_json || '[]');
      return (
        (p.supplier_name || '').toLowerCase().includes(term) ||
        items.some((it) => (it.name || '').toLowerCase().includes(term))
      );
    });
  }, [purchases, debouncedSearch]);

  const totalPurchases = purchases.reduce((sum, p) => sum + (p.total || 0), 0);

  // ===============================================================
  // RENDER
  // ===============================================================
  return (
    <div className="h-full flex flex-col glass-card p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>🛒</span>
          <span>المشتريات</span>
        </h2>
        <div className="flex gap-3 flex-wrap">
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
            onClick={() => setShowOCRModal(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-purple-700 transition-colors"
          >
            🤖 OCR فاتورة
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-gold px-4 py-2"
          >
            ➕ طلب جديد
          </button>
        </div>
      </div>

      {/* Summary + Search */}
      <div className="bg-gray-800 p-4 rounded-lg mb-4">
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <span className="text-gray-400">إجمالي المشتريات ({filterDays} يوم):</span>
            <span className="text-2xl font-bold text-blue-400">
              {formatCurrency(totalPurchases)}
            </span>
            {debouncedSearch && (
              <span className="text-xs bg-gold/20 text-gold px-2 py-1 rounded">
                {filteredPurchases.length} نتيجة
              </span>
            )}
          </div>
          <input
            type="text"
            placeholder="🔍 بحث في سجل المشتريات (المورد / المنتج)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30 focus:outline-none focus:border-gold min-w-[280px] flex-1 max-w-[420px]"
          />
        </div>
      </div>

      {/* Purchases list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2">
        {loading ? (
          // Loading skeletons
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="h-5 bg-gray-700 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-gray-700 rounded w-1/4 mb-3"></div>
                <div className="h-10 bg-gray-700 rounded"></div>
              </div>
            ))}
          </div>
        ) : filteredPurchases.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="text-6xl mb-4">🛍️</div>
            <p className="text-xl mb-2">
              {debouncedSearch ? 'لا توجد نتائج مطابقة للبحث' : 'لا توجد مشتريات مسجلة'}
            </p>
            <p className="text-sm">
              {debouncedSearch
                ? 'جرب كلمة بحث أخرى'
                : 'أضف طلب شراء جديد أو غيّر فترة العرض'}
            </p>
          </div>
        ) : (
          filteredPurchases.map((purchase) => {
            const items = JSON.parse(purchase.items_json || '[]');
            return (
              <div key={purchase.id} className="glass-card p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl font-bold text-gold">
                        طلب #{purchase.id.slice(0, 8)}
                      </span>
                      {purchase.supplier_name && (
                        <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded">
                          {purchase.supplier_name}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-400">{formatDate(purchase.date)}</div>
                  </div>
                  <div className="text-left">
                    <div className="text-2xl font-bold text-blue-400">
                      {formatCurrency(purchase.total)}
                    </div>
                    <div className="text-xs text-gray-500">{items.length} منتج</div>
                  </div>
                </div>
                <div className="bg-gray-800/50 p-3 rounded space-y-1">
                  {items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span>
                        {item.name} ({item.quantity})
                      </span>
                      <span className="text-gray-400">{formatCurrency(item.total_cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* OCR Modal */}
      {showOCRModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[600px]">
            <h2 className="text-2xl font-bold text-gold mb-4">معالجة فاتورة بالذكاء الاصطناعي</h2>

            <div className="bg-yellow-600/10 border border-yellow-400/30 p-3 rounded-lg mb-4">
              <div className="text-sm text-yellow-400 mb-2">
                ⚠️ مفتاح Gemini API يستخدم للمعالجة الذكية
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="أدخل Gemini API Key..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="flex-1 bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30"
                />
                <button
                  onClick={() => saveGeminiKey(geminiKey)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700"
                >
                  حفظ
                </button>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm text-gray-400 mb-2 block">اختر صورة الفاتورة</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setOcrImage(e.target.files[0])}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                />
              </div>

              {ocrImage && (
                <div className="bg-gray-800 p-3 rounded-lg">
                  <img
                    src={URL.createObjectURL(ocrImage)}
                    alt="Invoice preview"
                    className="max-h-64 mx-auto"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={processOCRInvoice}
                disabled={!ocrImage || !geminiKey.trim() || ocrProcessing}
                className="flex-1 btn-gold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ocrProcessing ? '⏳ جاري المعالجة...' : '🤖 استخراج البيانات'}
              </button>
              <button
                onClick={() => setShowOCRModal(false)}
                className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg font-bold hover:bg-gray-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[900px] max-h-[90vh] overflow-y-auto scrollbar-thin">
            <h2 className="text-2xl font-bold text-gold mb-4">طلب شراء جديد</h2>

            <div className="space-y-3 mb-4">
              <input
                type="text"
                placeholder="اسم المورد (اختياري)"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
              />
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-bold">المنتجات</h3>
                <button
                  onClick={addPurchaseItem}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                >
                  ➕ إضافة منتج
                </button>
              </div>

              <div className="space-y-2">
                {purchaseItems.length === 0 && (
                  <div className="bg-gray-800/50 p-6 rounded-lg text-center text-gray-500">
                    أضف منتجات إلى الطلب
                  </div>
                )}
                {purchaseItems.map((item, index) => (
                  <div key={index} className="bg-gray-800 p-3 rounded-lg">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <select
                        value={item.product_id}
                        onChange={(e) => updatePurchaseItem(index, 'product_id', e.target.value)}
                        className="col-span-4 bg-gray-700 text-white px-3 py-2 rounded"
                        disabled={productsLoading}
                      >
                        <option value="">
                          {productsLoading ? '⏳ جاري تحميل المنتجات...' : 'اختر منتج...'}
                        </option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.qty} {p.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="الكمية"
                        value={item.quantity}
                        onChange={(e) =>
                          updatePurchaseItem(index, 'quantity', safeParseFloat(e.target.value, 0))
                        }
                        className="col-span-2 bg-gray-700 text-white px-3 py-2 rounded"
                        min="0"
                      />
                      <input
                        type="number"
                        placeholder="سعر الوحدة"
                        value={item.cost_per_unit}
                        onChange={(e) =>
                          updatePurchaseItem(
                            index,
                            'cost_per_unit',
                            safeParseFloat(e.target.value, 0)
                          )
                        }
                        className="col-span-2 bg-gray-700 text-white px-3 py-2 rounded"
                        step="0.01"
                      />
                      <div className="col-span-3 text-gold font-bold">
                        {formatCurrency(item.total_cost)}
                      </div>
                      <button
                        onClick={() => removePurchaseItem(index)}
                        className="col-span-1 text-red-500 hover:text-red-400"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-800 p-4 rounded-lg mb-4">
              <div className="flex justify-between text-xl font-bold">
                <span>الإجمالي:</span>
                <span className="text-gold">
                  {formatCurrency(purchaseItems.reduce((sum, item) => sum + (item.total_cost || 0), 0))}
                </span>
              </div>
            </div>

            <textarea
              placeholder="ملاحظات..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 h-20 resize-none mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={savePurchase}
                disabled={saving}
                className="flex-1 btn-gold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '⏳ جاري الحفظ...' : '✅ حفظ وطباعة'}
              </button>
              <button
                onClick={resetForm}
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

export default PurchasesModule;
