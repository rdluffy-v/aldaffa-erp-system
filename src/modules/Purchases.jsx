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
import { formatCurrency, formatDate, generateId, safeParseFloat, generateValidBarcode } from '../utils/helpers.js';
import useDebounce from '../hooks/useDebounce.js';
import {
  ShoppingBag,
  Plus,
  Minus,
  Printer,
  QrCode,
  Sparkles,
  Search,
  Trash2,
  Calendar,
  FileText,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Tag,
  MapPin,
  Phone,
  Layers
} from 'lucide-react';

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
  const [showExtraDetails, setShowExtraDetails] = useState(false);

  // Purchase form fields
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [storageLocation, setStorageLocation] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
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
        unit: 'قطعة',
        batch_number: '',
        storage_location: '',
        expiry_date: ''
      }
    ]);
  };

  // Add brand new product item
  const addNewItem = () => {
    setPurchaseItems((prev) => [
      ...prev,
      {
        id: generateId(),
        is_new: true,
        product_id: '',
        name: '',
        category: 'عطور شرقية',
        quantity: 1,
        cost_per_unit: 0,
        sell_price: 0,
        total_cost: 0,
        barcode: '', // optional by default
        unit: 'قطعة',
        batch_number: '',
        storage_location: '',
        expiry_date: ''
      }
    ]);
  };

  // Quick generate valid barcode for a specific line item
  const generateBarcodeForItem = (index) => {
    const validCode = generateValidBarcode('628');
    updatePurchaseItem(index, 'barcode', validCode);
    showSuccess(`تم توليد باركود قياسي صالح: ${validCode}`);
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
      showError('يرجى إضافة صنف واحد على الأقل لفاتورة الشراء');
      return;
    }

    for (const item of purchaseItems) {
      if (!item.name || !item.name.trim()) {
        showError('يرجى إدخال أو اختيار اسم لجميع الأصناف المضافة');
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
        let barcode = (item.barcode || '').trim();

        if (item.is_new || !pId) {
          // If user didn't enter a barcode, generate a valid standard barcode automatically
          if (!barcode) {
            barcode = generateValidBarcode('628');
          }
          const insertRes = await inventoryRepo.create({
            name: item.name.trim(),
            category: item.category || 'عطور شرقية',
            cost: item.cost_per_unit,
            price: item.sell_price || (item.cost_per_unit * 1.35),
            qty: 0, // will be updated via WAC transaction
            unit: item.unit || 'قطعة',
            barcode,
            min_qty: 5,
            notes: item.batch_number ? `رقم التشغيلة: ${item.batch_number}` : null
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
        notes: [
          notes.trim(),
          supplierPhone.trim() ? `هاتف المورد: ${supplierPhone.trim()}` : null,
          batchNumber.trim() ? `رقم الدفعة: ${batchNumber.trim()}` : null,
          storageLocation.trim() ? `الموقع: ${storageLocation.trim()}` : null,
          expiryDate.trim() ? `الصلاحية: ${expiryDate.trim()}` : null
        ].filter(Boolean).join(' | ') || null,
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
            notes: purchaseData.notes
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
    setSupplierPhone('');
    setInvoiceRef('');
    setBatchNumber('');
    setStorageLocation('');
    setExpiryDate('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setPaymentType('cash');
    setNotes('');
    setPurchaseItems([]);
    setShowModal(false);
    setShowOCRModal(false);
    setOcrImage(null);
    setShowExtraDetails(false);
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
              <div>
                <h2 className="text-lg font-extrabold text-[#2D2424] dark:text-amber-300 flex items-center gap-2">
                  <span>🛒</span>
                  <span>تسجيل فاتورة شراء وتوريد جديدة</span>
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                  إدخال بضاعة جديدة وتحديث كميات المخزون ومتوسط التكلفة تلقائياً
                </p>
              </div>
              <button
                onClick={resetForm}
                className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Clear Guidance Banner */}
            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
              <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">توضيح طريقة التعبئة:</span> يمكنك اختيار أصناف موجودة مسبقاً في المخزون أو إضافة منتجات جديدة تماماً. تحديد الباركود ورقم التشغيلة <span className="font-bold underline">اختياري تماماً</span> لتسهيل وتنسيق عملك دون تعقيد.
              </div>
            </div>

            {/* Primary Header Fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-amber-50/50 dark:bg-slate-800/40 p-4 rounded-2xl border border-amber-500/20">
              <div>
                <label className="block text-[11px] font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                  اسم المورد <span className="text-gray-400 font-normal">(اختياري)</span>:
                </label>
                <input
                  type="text"
                  placeholder="مثال: شركة العطور المتحدة أو مورد محلي"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="input-atelier w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5C524F] dark:text-slate-300 mb-1">تاريخ الفاتورة:</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="input-atelier w-full text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#5C524F] dark:text-slate-300 mb-1">طريقة الدفع:</label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  className="input-atelier w-full text-xs font-bold"
                >
                  <option value="cash">نقدي (كاش من الخزينة)</option>
                  <option value="card">بطاقة مصرفية</option>
                  <option value="bank_transfer">تحويل مصرفي</option>
                  <option value="debt">آجل (دين مسجل للمورد)</option>
                </select>
              </div>
            </div>

            {/* Optional Extra Details Toggle */}
            <div className="border border-white/10 rounded-2xl p-3 bg-black/10 dark:bg-slate-800/20">
              <button
                type="button"
                onClick={() => setShowExtraDetails(!showExtraDetails)}
                className="w-full flex items-center justify-between text-xs font-bold text-gray-400 dark:text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-amber-500" />
                  <span>تفاصيل وبيانات إضافية للفاتورة (اختيارية لزيادة التوثيق)</span>
                </span>
                {showExtraDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showExtraDetails && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-white/5 animate-in fade-in duration-150">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1">
                      رقم مرجع الفاتورة <span className="text-gray-500">(اختياري)</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="رقم فاتورة المورد INV-..."
                      value={invoiceRef}
                      onChange={(e) => setInvoiceRef(e.target.value)}
                      className="input-atelier w-full text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1">
                      هاتف المورد <span className="text-gray-500">(اختياري)</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="091xxxxxxx"
                      value={supplierPhone}
                      onChange={(e) => setSupplierPhone(e.target.value)}
                      className="input-atelier w-full text-xs"
                      dir="ltr"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1">
                      رقم التشغيلة / الباتش <span className="text-gray-500">(اختياري)</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: BATCH-2026-A"
                      value={batchNumber}
                      onChange={(e) => setBatchNumber(e.target.value)}
                      className="input-atelier w-full text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1">
                      موقع التخزين / الرف <span className="text-gray-500">(اختياري)</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: الرف A-2 أو المخزن الرئيسي"
                      value={storageLocation}
                      onChange={(e) => setStorageLocation(e.target.value)}
                      className="input-atelier w-full text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Line Items */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-[#2D2424] dark:text-white flex items-center gap-1.5">
                    <span>📦</span>
                    <span>قائمة الأصناف والمنتجات المشتراة</span>
                  </h3>
                  <p className="text-[10px] text-gray-400">
                    اختر المنتجات المضافة حالياً في المنظومة أو أضف أصنافاً جديدة بأسعار التكلفة والبيع
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={addExistingItem}
                    className="btn-atelier-secondary py-1.5 px-3 text-xs flex items-center gap-1 cursor-pointer font-bold"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-500" />
                    <span>إضافة صنف من المخزون</span>
                  </button>
                  <button
                    type="button"
                    onClick={addNewItem}
                    className="btn-atelier-primary py-1.5 px-3 text-xs flex items-center gap-1 cursor-pointer font-bold"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>➕ إضافة منتج جديد</span>
                  </button>
                </div>
              </div>

              {purchaseItems.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-amber-500/20 rounded-2xl bg-amber-500/5">
                  <ShoppingBag className="w-8 h-8 mx-auto text-amber-500/40 mb-2" />
                  <div className="text-xs font-bold text-gray-500 dark:text-slate-400">لم يتم إضافة أي منتج بعد في هذه الفاتورة</div>
                  <div className="text-[11px] text-gray-400 mt-1">اضغط على "إضافة صنف من المخزون" أو "إضافة منتج جديد" للبدء</div>
                </div>
              ) : (
                <div className="border border-amber-500/20 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#F4EFEA] dark:bg-slate-800 font-bold text-[#5C524F] dark:text-slate-300">
                      <tr>
                        <th className="p-2.5">المنتج والتفاصيل</th>
                        <th className="p-2.5">النوع</th>
                        <th className="p-2.5 text-center">الكمية المشتراة</th>
                        <th className="p-2.5 text-left">سعر التكلفة (د.ل)</th>
                        <th className="p-2.5 text-left">سعر البيع (د.ل) <span className="text-[9px] font-normal text-gray-400">(اختياري)</span></th>
                        <th className="p-2.5 text-left">الإجمالي</th>
                        <th className="p-2.5 text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-500/10">
                      {purchaseItems.map((item, index) => (
                        <tr key={item.id || index} className="hover:bg-amber-500/5 transition-colors">
                          <td className="p-2.5 min-w-[220px]">
                            {item.is_new ? (
                              <div className="space-y-1.5">
                                <input
                                  type="text"
                                  placeholder="اسم المنتج الجديد *"
                                  value={item.name}
                                  onChange={(e) => updatePurchaseItem(index, 'name', e.target.value)}
                                  className="input-atelier w-full py-1 text-xs font-bold"
                                />
                                <div className="grid grid-cols-2 gap-1.5">
                                  <select
                                    value={item.category}
                                    onChange={(e) => updatePurchaseItem(index, 'category', e.target.value)}
                                    className="input-atelier py-0.5 px-1.5 text-[10px]"
                                  >
                                    <option value="عطور شرقية">عطور شرقية</option>
                                    <option value="عطور غربية">عطور غربية</option>
                                    <option value="زيوت خام">زيوت خام</option>
                                    <option value="زجاجات ومستلزمات">زجاجات ومستلزمات</option>
                                    <option value="بخور ومباخر">بخور ومباخر</option>
                                    <option value="عطور">عطور عامة</option>
                                  </select>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      placeholder="الباركود (اختياري)"
                                      value={item.barcode}
                                      onChange={(e) => updatePurchaseItem(index, 'barcode', e.target.value)}
                                      className="input-atelier py-0.5 px-1.5 text-[10px] flex-1 font-mono"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => generateBarcodeForItem(index)}
                                      className="p-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-500 text-[10px] font-bold shrink-0 cursor-pointer"
                                      title="توليد باركود قياسي صالح فوراً"
                                    >
                                      ⚡
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <select
                                  value={item.product_id}
                                  onChange={(e) => updatePurchaseItem(index, 'product_id', e.target.value)}
                                  className="input-atelier w-full py-1 text-xs font-bold"
                                >
                                  <option value="">-- اختر المنتج من المخزون --</option>
                                  {products.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} (المتوفر: {p.qty} {p.unit} — التكلفة: {formatCurrency(p.cost)})
                                    </option>
                                  ))}
                                </select>
                                {item.barcode && (
                                  <div className="text-[10px] font-mono text-gray-400 flex items-center gap-1">
                                    <span>الباركود:</span>
                                    <span className="bg-black/10 dark:bg-slate-800 px-1.5 py-0.2 rounded">{item.barcode}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="p-2.5">
                            {item.is_new ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                                صنف جديد
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                                من المخزون
                              </span>
                            )}
                          </td>

                          <td className="p-2.5 text-center">
                            <div className="inline-flex items-center gap-1 bg-black/5 dark:bg-slate-800 p-0.5 rounded-lg border border-white/5">
                              <button
                                type="button"
                                onClick={() => updatePurchaseItem(index, 'quantity', Math.max(1, (item.quantity || 1) - 1))}
                                className="w-6 h-6 flex items-center justify-center rounded bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 text-xs font-bold cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updatePurchaseItem(index, 'quantity', Math.max(1, safeParseFloat(e.target.value, 1)))}
                                className="w-12 text-center py-0.5 text-xs font-bold bg-transparent border-0 focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => updatePurchaseItem(index, 'quantity', (item.quantity || 1) + 1)}
                                className="w-6 h-6 flex items-center justify-center rounded bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 text-xs font-bold cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </td>

                          <td className="p-2.5 text-left">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              value={item.cost_per_unit || ''}
                              placeholder="التكلفة"
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
                              className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="حذف هذا الصنف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Total Bar */}
            <div className="bg-[#F8F6F0] dark:bg-slate-800 p-4 rounded-2xl flex justify-between items-center border border-amber-500/20 font-bold">
              <div>
                <span className="text-xs text-gray-500 block">إجمالي الأصناف ({purchaseItems.length} صنف):</span>
                <span className="text-sm">إجمالي فاتورة الشراء والتوريد:</span>
              </div>
              <span className="text-2xl text-emerald-600 dark:text-emerald-400 font-black tabular-nums">
                {formatCurrency(purchaseItems.reduce((sum, item) => sum + (item.total_cost || 0), 0))}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 mb-1">ملاحظات الفاتورة والتوريد (اختياري):</label>
              <textarea
                placeholder="أية ملاحظات إضافية حول التوريد أو حالة الاستلام..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-atelier w-full h-14 text-xs resize-none"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex gap-3 pt-2 border-t border-white/10">
              <button
                onClick={savePurchase}
                disabled={saving}
                className="flex-1 btn-atelier-primary py-2.5 text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <span>⏳</span>
                    <span>جاري حفظ الفاتورة وتحديث كميات المخزون...</span>
                  </>
                ) : (
                  <>
                    <span>✅</span>
                    <span>حفظ فاتورة الشراء وتحديث المخزون</span>
                  </>
                )}
              </button>
              <button
                onClick={resetForm}
                className="btn-atelier-secondary py-2.5 px-6 text-xs font-bold cursor-pointer"
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
