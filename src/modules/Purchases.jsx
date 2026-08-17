/**
 * ============================================================================
 * PURCHASES MODULE - ADVANCED WORKFLOW & BARCODE GENERATION
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
import { ShoppingBag, Plus, Printer, QrCode, Sparkles, Search, Trash2, Calendar, FileText } from 'lucide-react';

const purchasesRepo = new PurchasesRepository();
const inventoryRepo = new InventoryRepository();

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
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const PurchasesModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const { products, loading: productsLoading, loadProducts } = useInventoryStore();

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterDays, setFilterDays] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [barcodeModalItems, setBarcodeModalItems] = useState(null);

  // Purchase form fields
  const [supplierName, setSupplierName] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentType, setPaymentType] = useState('cash'); // 'cash' | 'card' | 'bank_transfer' | 'debt'
  const [notes, setNotes] = useState('');
  const [purchaseItems, setPurchaseItems] = useState([]);

  // OCR state
  const [geminiKey, setGeminiKey] = useState('');
  const [ocrImage, setOcrImage] = useState(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);

  useEffect(() => {
    loadPurchases();
  }, [filterDays]);

  useEffect(() => {
    loadProducts();
    loadGeminiKey();
  }, [loadProducts]);

  const loadPurchases = async () => {
    setLoading(true);
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filterDays);
      const data = await purchasesRepo.getPurchasesInRange(
        cutoffDate.toISOString(),
        new Date().toISOString()
      );
      setPurchases(data || []);
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
    } catch (e) {
      console.warn(e);
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

  // Add existing product item
  const addExistingItem = () => {
    setPurchaseItems((prev) => [
      ...prev,
      {
        id: generateId(),
        is_new: false,
        product_id: '',
        name: '',
        category: 'عطور',
        quantity: 1,
        cost_per_unit: 0,
        sell_price: 0,
        total_cost: 0,
        barcode: '',
        unit: 'قطعة'
      }
    ]);
  };

  // Add brand new product item
  const addNewItem = () => {
    const autoBarcode = `AL${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
    setPurchaseItems((prev) => [
      ...prev,
      {
        id: generateId(),
        is_new: true,
        product_id: '',
        name: '',
        category: 'عطور',
        quantity: 1,
        cost_per_unit: 0,
        sell_price: 0,
        total_cost: 0,
        barcode: autoBarcode,
        unit: 'قطعة'
      }
    ]);
  };

  const updatePurchaseItem = (index, field, value) => {
    setPurchaseItems((prev) => {
      const updated = [...prev];
      const currentItem = { ...updated[index], [field]: value };

      if (field === 'product_id') {
        const product = products.find((p) => String(p.id) === String(value));
        if (product) {
          currentItem.name = product.name;
          currentItem.cost_per_unit = product.cost || 0;
          currentItem.sell_price = product.price || 0;
          currentItem.category = product.category || 'عطور';
          currentItem.unit = product.unit || 'قطعة';
          currentItem.barcode = product.barcode || '';
        }
      }

      if (field === 'quantity' || field === 'cost_per_unit') {
        const qty = safeParseFloat(currentItem.quantity, 0);
        const cost = safeParseFloat(currentItem.cost_per_unit, 0);
        currentItem.total_cost = qty * cost;
      }

      updated[index] = currentItem;
      return updated;
    });
  };

  const removePurchaseItem = (index) => {
    setPurchaseItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Save Purchase
  const savePurchase = async () => {
    if (purchaseItems.length === 0) {
      showError('يرجى إضافة منتجات للطلب');
      return;
    }

    for (const item of purchaseItems) {
      if (!item.name || !item.name.trim()) {
        showError('يرجى إدخال اسم لجميع المنتجات المضافة');
        return;
      }
      if (item.quantity <= 0 || item.cost_per_unit <= 0) {
        showError('يرجى التأكد من أن الكميات وتكاليف الوحدات أكبر من صفر');
        return;
      }
    }

    setSaving(true);
    try {
      const id = generateId();
      const total = purchaseItems.reduce((sum, item) => sum + (item.total_cost || 0), 0);

      // 1. Process new items: inject into inventory table if needed
      const finalItems = [];
      const inventoryUpdates = [];

      for (const item of purchaseItems) {
        let pId = item.product_id;
        let barcode = item.barcode;

        if (item.is_new || !pId) {
          if (!barcode) {
            barcode = `AL${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
          }
          const insertRes = await inventoryRepo.create({
            name: item.name.trim(),
            category: item.category || 'عطور',
            cost: item.cost_per_unit,
            price: item.sell_price || (item.cost_per_unit * 1.35),
            qty: 0, // will be updated via WAC transaction
            unit: item.unit || 'قطعة',
            barcode,
            min_qty: 5
          });
          pId = insertRes.lastInsertRowid;
        }

        finalItems.push({
          ...item,
          product_id: pId,
          barcode
        });

        inventoryUpdates.push({
          product_id: pId,
          quantity: item.quantity,
          cost_per_unit: item.cost_per_unit
        });
      }

      const purchaseData = {
        id,
        date: invoiceDate ? new Date(invoiceDate).toISOString() : new Date().toISOString(),
        supplier_name: supplierName.trim() || null,
        invoice_ref: invoiceRef.trim() || null,
        payment_type: paymentType,
        total,
        notes: notes.trim() || null,
        items_json: JSON.stringify(finalItems)
      };

      // Transactional insert & inventory update
      await purchasesRepo.createPurchaseWithInventoryUpdate(purchaseData, inventoryUpdates, inventoryRepo);

      // Best-effort thermal print
      try {
        const electron = window.require ? window.require('electron') : null;
        if (electron) {
          await electron.ipcRenderer.invoke('print:purchase-order', {
            orderId: id,
            date: purchaseData.date,
            supplier: supplierName.trim() || 'غير محدد',
            items: finalItems,
            total,
            notes
          });
        }
      } catch (printErr) {
        console.warn('Print purchase order failed:', printErr);
      }

      resetForm();
      await loadPurchases();
      await loadProducts(true);

      showSuccess(`✅ تم تسجيل فاتورة الشراء بنجاح - الإجمالي: ${formatCurrency(total)}`);
    } catch (error) {
      showError(`خطأ في حفظ طلب الشراء: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setSupplierName('');
    setInvoiceRef('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setPaymentType('cash');
    setNotes('');
    setPurchaseItems([]);
    setShowModal(false);
    setShowOCRModal(false);
    setOcrImage(null);
  };

  // OCR
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
                    mime_type: ocrImage.type || 'image/jpeg',
                    data: base64Image
                  }
                }
              ]
            }
          ]
        })
      });

      const result = await response.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.supplier) setSupplierName(parsed.supplier);
        if (Array.isArray(parsed.items)) {
          const items = parsed.items.map((item) => {
            const autoBarcode = `AL${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
            const qty = safeParseFloat(item.quantity, 1);
            const cost = safeParseFloat(item.unit_price, 0);
            return {
              is_new: true,
              product_id: '',
              name: item.name || '',
              category: 'عطور',
              quantity: qty,
              cost_per_unit: cost,
              sell_price: cost * 1.35,
              total_cost: qty * cost,
              barcode: autoBarcode,
              unit: 'قطعة'
            };
          });
          setPurchaseItems(items);
        }
        setShowOCRModal(false);
        setShowModal(true);
        showSuccess('✅ تم استخراج بيانات الفاتورة بنجاح');
      } else {
        throw new Error('لم يتم العثور على بيانات في الصورة');
      }
    } catch (err) {
      showError(`خطأ في معالجة الفاتورة: ${err.message}`);
    } finally {
      setOcrProcessing(false);
    }
  };

  const filteredPurchases = useMemo(() => {
    if (!debouncedSearch) return purchases;
    const term = debouncedSearch.toLowerCase();
    return purchases.filter((p) => {
      const items = JSON.parse(p.items_json || '[]');
      return (
        (p.supplier_name || '').toLowerCase().includes(term) ||
        (p.invoice_ref || '').toLowerCase().includes(term) ||
        items.some((it) => (it.name || '').toLowerCase().includes(term))
      );
    });
  }, [purchases, debouncedSearch]);

  const totalPurchases = purchases.reduce((sum, p) => sum + (p.total || 0), 0);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header Bar */}
      <div className="atelier-card p-4 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#2D2424] dark:text-white">إدارة المشتريات والتوريد</h1>
            <p className="text-xs text-[#5C524F] dark:text-slate-400">إدخال فواتير الشراء، توليد الباركود تلقائياً، وتحديث متوسط التكلفة والمخزون</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterDays}
            onChange={(e) => setFilterDays(parseInt(e.target.value))}
            className="input-atelier py-1 px-3 text-xs"
          >
            <option value={7}>آخر 7 أيام</option>
            <option value={30}>آخر 30 يوم</option>
            <option value={90}>آخر 90 يوم</option>
            <option value={365}>السنة كاملة</option>
          </select>

          <button
            onClick={() => setShowOCRModal(true)}
            className="btn-atelier-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            <span>🤖 OCR فاتورة</span>
          </button>

          <button
            onClick={() => {
              resetForm();
              addExistingItem();
              setShowModal(true);
            }}
            className="btn-atelier-primary py-1.5 px-4 text-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>طلب شراء جديد</span>
          </button>
        </div>
      </div>

      {/* Summary + Search Bar */}
      <div className="atelier-card p-3.5 flex justify-between items-center gap-4 flex-wrap">
        <div className="flex items-center gap-4 text-xs font-bold">
          <span className="text-[#5C524F] dark:text-slate-400">إجمالي المشتريات ({filterDays} يوم):</span>
          <span className="text-base font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
            {formatCurrency(totalPurchases)}
          </span>
          {debouncedSearch && (
            <span className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
              {filteredPurchases.length} نتيجة
            </span>
          )}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute right-3 top-2.5 text-gray-400" />
          <input
            type="text"
            placeholder="بحث بالمورد أو رقم الفاتورة أو الصنف..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-amber-500/30 rounded-full pr-9 pl-4 py-1.5 text-xs text-[#2D2424] dark:text-white focus:outline-none focus:border-amber-500 w-72"
          />
        </div>
      </div>

      {/* Purchases List */}
      <div className="atelier-card flex-1 p-4 overflow-y-auto scrollbar-thin space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 rounded-2xl bg-gray-100 dark:bg-slate-800/50 animate-pulse h-24" />
            ))}
          </div>
        ) : filteredPurchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ShoppingBag className="w-12 h-12 mb-2 stroke-1" />
            <p className="text-sm font-medium">لا توجد فواتير مشتريات مسجلة</p>
          </div>
        ) : (
          filteredPurchases.map((purchase) => {
            const items = JSON.parse(purchase.items_json || '[]');
            return (
              <div key={purchase.id} className="p-4 rounded-2xl bg-amber-50/40 dark:bg-slate-800/40 border border-amber-500/15 hover:border-amber-500/30 transition-all">
                <div className="flex justify-between items-start mb-2.5 flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-bold text-xs text-amber-700 dark:text-amber-400">
                        طلب #{purchase.id.slice(0, 8)}
                      </span>
                      {purchase.invoice_ref && (
                        <span className="text-[10px] bg-gray-200 dark:bg-slate-700 px-2 py-0.5 rounded-full text-gray-700 dark:text-slate-300">
                          مرجع: {purchase.invoice_ref}
                        </span>
                      )}
                      {purchase.supplier_name && (
                        <span className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold px-2 py-0.5 rounded-full">
                          المورد: {purchase.supplier_name}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(purchase.date)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(purchase.total)}
                      </div>
                      <div className="text-[10px] text-gray-500">{items.length} صنف</div>
                    </div>

                    <button
                      onClick={() => setBarcodeModalItems(items)}
                      className="btn-atelier-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
                      title="طباعة باركود الكميات المشتراة"
                    >
                      <QrCode className="w-3.5 h-3.5 text-amber-600" />
                      <span>طباعة باركود الكميات</span>
                    </button>
                  </div>
                </div>

                {/* Items summary */}
                <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-amber-500/10 divide-y divide-amber-500/5 text-xs">
                  {items.map((it, idx) => (
                    <div key={idx} className="py-1 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#2D2424] dark:text-white">{it.name}</span>
                        <span className="text-gray-400 text-[11px]">(×{it.quantity} {it.unit || 'قطعة'})</span>
                        {it.barcode && (
                          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-slate-800 px-1.5 rounded">
                            {it.barcode}
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-gray-700 dark:text-slate-300 tabular-nums">
                        {formatCurrency(it.total_cost)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New Purchase Order Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="atelier-card bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-amber-500/20 pb-3">
              <h2 className="text-lg font-extrabold text-[#2D2424] dark:text-amber-300 flex items-center gap-2">
                <span>🛒</span>
                <span>تسجيل فاتورة شراء وتوريد جديدة</span>
              </h2>
              <button
                onClick={resetForm}
                className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Header Fields */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-amber-50/50 dark:bg-slate-800/40 p-4 rounded-2xl border border-amber-500/20">
              <div>
                <label className="block text-[11px] font-bold text-[#5C524F] dark:text-slate-400 mb-1">اسم المورد</label>
                <input
                  type="text"
                  placeholder="مثال: شركة العطور المتحدة"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="input-atelier w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5C524F] dark:text-slate-400 mb-1">رقم مرجع الفاتورة</label>
                <input
                  type="text"
                  placeholder="مثال: INV-9842"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  className="input-atelier w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5C524F] dark:text-slate-400 mb-1">تاريخ الفاتورة</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="input-atelier w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5C524F] dark:text-slate-400 mb-1">طريقة الدفع</label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className="input-atelier w-full text-xs"
                >
                  <option value="cash">نقدي (كاش)</option>
                  <option value="card">بطاقة مصرفية</option>
                  <option value="bank_transfer">تحويل مصرفي</option>
                  <option value="debt">آجل (دين للمورد)</option>
                </select>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-extrabold text-[#2D2424] dark:text-white">قائمة الأصناف المشتراة</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addExistingItem}
                    className="btn-atelier-secondary py-1 px-3 text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة منتج موجود</span>
                  </button>
                  <button
                    type="button"
                    onClick={addNewItem}
                    className="btn-atelier-primary py-1 px-3 text-xs flex items-center gap-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>➕ إضافة منتج جديد تماماً</span>
                  </button>
                </div>
              </div>

              <div className="border border-amber-500/20 rounded-2xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-[#F4EFEA] dark:bg-slate-800 font-bold text-[#5C524F] dark:text-slate-300">
                    <tr>
                      <th className="p-2.5">المنتج</th>
                      <th className="p-2.5">النوع</th>
                      <th className="p-2.5 text-center">الكمية المشتراة</th>
                      <th className="p-2.5 text-left">سعر التكلفة للقطعة (د.ل)</th>
                      <th className="p-2.5 text-left">سعر البيع المقترح (د.ل)</th>
                      <th className="p-2.5 text-left">الإجمالي الفردي</th>
                      <th className="p-2.5 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-500/10">
                    {purchaseItems.map((item, index) => (
                      <tr key={item.id || index} className="hover:bg-amber-500/5 transition-colors">
                        <td className="p-2.5">
                          {item.is_new ? (
                            <div className="space-y-1">
                              <input
                                type="text"
                                placeholder="اسم المنتج الجديد..."
                                value={item.name}
                                onChange={(e) => updatePurchaseItem(index, 'name', e.target.value)}
                                className="input-atelier w-full py-1 text-xs font-bold"
                              />
                              <div className="text-[10px] text-gray-400 font-mono">باركود تلقائي: {item.barcode}</div>
                            </div>
                          ) : (
                            <select
                              value={item.product_id}
                              onChange={(e) => updatePurchaseItem(index, 'product_id', e.target.value)}
                              className="input-atelier w-full py-1 text-xs"
                            >
                              <option value="">اختر من المخزون...</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} (المتوفر: {p.qty} {p.unit})
                                </option>
                              ))}
                            </select>
                          )}
                        </td>

                        <td className="p-2.5">
                          {item.is_new ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                              جديد
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                              من المخزون
                            </span>
                          )}
                        </td>

                        <td className="p-2.5 text-center">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updatePurchaseItem(index, 'quantity', safeParseFloat(e.target.value, 1))}
                            className="input-atelier w-16 text-center py-1 text-xs font-bold"
                          />
                        </td>

                        <td className="p-2.5 text-left">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={item.cost_per_unit || ''}
                            onChange={(e) => updatePurchaseItem(index, 'cost_per_unit', safeParseFloat(e.target.value, 0))}
                            className="input-atelier w-20 text-left py-1 text-xs font-bold tabular-nums"
                          />
                        </td>

                        <td className="p-2.5 text-left">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            value={item.sell_price || ''}
                            placeholder="سعر البيع"
                            onChange={(e) => updatePurchaseItem(index, 'sell_price', safeParseFloat(e.target.value, 0))}
                            className="input-atelier w-20 text-left py-1 text-xs font-bold tabular-nums"
                          />
                        </td>

                        <td className="p-2.5 text-left font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {formatCurrency(item.total_cost)}
                        </td>

                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => removePurchaseItem(index)}
                            className="text-red-500 hover:text-red-700 p-1 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Total Bar */}
            <div className="bg-[#F8F6F0] dark:bg-slate-800 p-4 rounded-2xl flex justify-between items-center border border-amber-500/20 font-bold">
              <span className="text-sm">إجمالي فاتورة الشراء:</span>
              <span className="text-xl text-emerald-600 dark:text-emerald-400 font-extrabold tabular-nums">
                {formatCurrency(purchaseItems.reduce((sum, item) => sum + (item.total_cost || 0), 0))}
              </span>
            </div>

            <textarea
              placeholder="ملاحظات وتفاصيل التوريد..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-atelier w-full h-16 text-xs"
            />

            {/* Footer Buttons */}
            <div className="flex gap-3">
              <button
                onClick={savePurchase}
                disabled={saving}
                className="flex-1 btn-atelier-primary py-2.5 text-xs font-bold disabled:opacity-50"
              >
                {saving ? '⏳ جاري حفظ الفاتورة وتحديث المخزون...' : '✅ حفظ الفاتورة وطباعة السند'}
              </button>
              <button
                onClick={resetForm}
                className="btn-atelier-secondary py-2.5 px-6 text-xs font-bold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Print Sheet Modal */}
      {barcodeModalItems && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="atelier-card bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-amber-500/20 pb-3">
              <h2 className="text-lg font-bold text-[#2D2424] dark:text-amber-300 flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                <span>طباعة باركود الكميات المشتراة</span>
              </h2>
              <button
                onClick={() => setBarcodeModalItems(null)}
                className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-2 bg-gray-50 dark:bg-slate-950/50 rounded-2xl border border-amber-500/20 max-h-[60vh] overflow-y-auto scrollbar-thin">
              {barcodeModalItems.flatMap((item, itemIdx) => {
                const count = Math.min(item.quantity || 1, 50); // limit preview to 50 tags per item
                return Array.from({ length: count }).map((_, copyIdx) => (
                  <div
                    key={`${itemIdx}-${copyIdx}`}
                    className="bg-white text-black p-3 rounded-xl border border-gray-300 shadow-sm flex flex-col items-center text-center font-sans"
                  >
                    <div className="text-[10px] font-bold truncate max-w-[150px] mb-0.5">الدفة للعطور</div>
                    <div className="text-xs font-extrabold truncate max-w-[150px]">{item.name}</div>
                    <div className="font-mono text-[11px] font-bold tracking-widest my-1 border-y border-black py-0.5 w-full text-center">
                      ||| |||| || |||||
                    </div>
                    <div className="text-[10px] font-mono">{item.barcode || 'AL-PERFUME'}</div>
                    <div className="text-xs font-black text-emerald-700 mt-1">
                      {formatCurrency(item.sell_price || item.cost_per_unit * 1.35)}
                    </div>
                  </div>
                ));
              })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  window.print();
                  showSuccess('✅ تم إرسال صفحة الباركود لأمر الطباعة');
                }}
                className="flex-1 btn-atelier-primary py-2.5 text-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة ملصقات الباركود الآن</span>
              </button>
              <button
                onClick={() => setBarcodeModalItems(null)}
                className="btn-atelier-secondary py-2.5 px-6 text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OCR Modal */}
      {showOCRModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="atelier-card bg-white dark:bg-slate-900 w-full max-w-lg p-6 shadow-2xl flex flex-col gap-4">
            <h2 className="text-lg font-bold text-[#2D2424] dark:text-amber-300 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <span>استخراج بيانات الفاتورة بالذكاء الاصطناعي (OCR)</span>
            </h2>

            <div className="bg-amber-50/70 dark:bg-slate-800/70 border border-amber-200/60 dark:border-white/10 p-3 rounded-xl text-xs space-y-2">
              <label className="block text-gray-500 font-bold">مفتاح Gemini API:</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="أدخل مفتاح Gemini API..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="input-atelier flex-1 text-xs"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => saveGeminiKey(geminiKey)}
                  className="btn-atelier-secondary py-1 px-3 text-xs font-bold"
                >
                  حفظ
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">صورة الفاتورة الورقية:</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setOcrImage(e.target.files?.[0] || null)}
                className="input-atelier w-full text-xs"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={processOCRInvoice}
                disabled={!ocrImage || !geminiKey.trim() || ocrProcessing}
                className="flex-1 btn-atelier-primary py-2.5 text-xs disabled:opacity-50 font-bold"
              >
                {ocrProcessing ? '⏳ جاري التحليل...' : '🤖 تحليل واستخراج'}
              </button>
              <button
                onClick={() => setShowOCRModal(false)}
                className="btn-atelier-secondary py-2.5 px-5 text-xs font-bold"
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
