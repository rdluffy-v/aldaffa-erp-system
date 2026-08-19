/**
 * ============================================================================
 * PURCHASES MODULE - INTERACTIVE STEP-BY-STEP WIZARD & POST-COMMIT BARCODE STUDIO
 * ============================================================================
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PurchasesRepository } from '../database/repositories/PurchasesRepository.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { CategoriesRepository } from '../database/repositories/CategoriesRepository.js';
import { BaseRepository } from '../database/repositories/BaseRepository.js';
import { db } from '../database/connection.js';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate, generateId, safeParseFloat, generateValidBarcode } from '../utils/helpers.js';
import { BarcodeSVG } from '../utils/barcodeGenerator.jsx';
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
  Layers,
  FolderPlus,
  CheckCircle2,
  Sliders,
  Scale,
  ArrowRight,
  ArrowLeft,
  Check,
  Building2,
  Boxes,
  ClipboardList,
  AlertCircle
} from 'lucide-react';

const purchasesRepo = new PurchasesRepository();
const inventoryRepo = new InventoryRepository();
const categoriesRepo = new CategoriesRepository();

const DEFAULT_UNITS = [
  { value: 'قطعة', label: 'قطعة / عبوة قياسية' },
  { value: 'زجاجة', label: 'زجاجة عطر' },
  { value: 'مل', label: 'ملّيلتر (مل / ml) - زيوت وكحول' },
  { value: 'لتر', label: 'لتر (L) - كحول ومذيبات خام' },
  { value: 'تولة', label: 'تولة (12 مل / 11.6 جم)' },
  { value: 'ربع تولة', label: 'ربع تولة (3 مل)' },
  { value: 'جرام', label: 'جرام (جم / g) - بخور ومسك خام' },
  { value: 'كيلو', label: 'كيلوجرام (كجم / kg)' },
  { value: 'كرتونة', label: 'كرتونة / صندوق (Box)' },
  { value: 'درزن', label: 'درزن (12 قطعة)' }
];

const DEFAULT_CATEGORIES = [
  'عطور شرقية',
  'عطور غربية',
  'عطور فرنسية',
  'زيوت خام',
  'زجاجات ومستلزمات',
  'بخور ومباخر',
  'كحول ومذيبات',
  'مثبتات وأدوات',
  'عطور عامة'
];

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
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterDays, setFilterDays] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Modal & Wizard State
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1: Supplier & Ref, 2: Items & Units, 3: Storage & Notes, 4: Review & Finalize
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Barcode Print Studio Modal State
  const [barcodeModalData, setBarcodeModalData] = useState(null); // { items: [...with printCount, selected] }
  const [barcodeLayout, setBarcodeLayout] = useState('thermal'); // 'thermal' | 'a4_grid'

  // Purchase Form Fields
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

  // OCR State
  const [geminiKey, setGeminiKey] = useState('');
  const [ocrImage, setOcrImage] = useState(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const dbCategories = await categoriesRepo.findAll({}, 'name ASC');
      if (dbCategories && dbCategories.length > 0) {
        const names = Array.from(new Set([...dbCategories.map((c) => c.name), ...DEFAULT_CATEGORIES]));
        setCategories(names);
      } else {
        setCategories(DEFAULT_CATEGORIES);
      }
    } catch (e) {
      setCategories(DEFAULT_CATEGORIES);
    }
  }, []);

  const loadPurchases = useCallback(async () => {
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
  }, [filterDays, showError]);

  useEffect(() => {
    loadPurchases();
    loadCategories();
  }, [loadPurchases, loadCategories]);

  useEffect(() => {
    loadProducts();
    loadGeminiKey();
  }, [loadProducts]);

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

  const handleCreateCategory = async () => {
    const cleanName = newCategoryName.trim();
    if (!cleanName) {
      showWarning('يرجى كتابة اسم التصنيف الجديد');
      return;
    }
    try {
      const existing = await categoriesRepo.findByName(cleanName);
      if (!existing) {
        await categoriesRepo.create({
          id: generateId(),
          name: cleanName,
          icon: '🏷️'
        });
      }
      setCategories((prev) => Array.from(new Set([...prev, cleanName])));
      setNewCategoryName('');
      setShowNewCategoryModal(false);
      showSuccess(`✅ تم إضافة تصنيف "${cleanName}" بنجاح`);
    } catch (e) {
      showError('فشل حفظ التصنيف: ' + e.message);
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
        category: 'عطور شرقية',
        unit: 'قطعة',
        quantity: 1,
        cost_per_unit: 0,
        sell_price: 0,
        total_cost: 0,
        barcode: '',
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
        category: categories[0] || 'عطور شرقية',
        unit: 'قطعة',
        quantity: 1,
        cost_per_unit: 0,
        sell_price: 0,
        total_cost: 0,
        barcode: '',
        batch_number: '',
        storage_location: '',
        expiry_date: ''
      }
    ]);
  };

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
          currentItem.category = product.category || 'عطور شرقية';
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

  // Step Validation
  const handleNextStep = () => {
    if (wizardStep === 1) {
      if (!invoiceDate) {
        showWarning('يرجى تحديد تاريخ الفاتورة');
        return;
      }
      setWizardStep(2);
    } else if (wizardStep === 2) {
      if (purchaseItems.length === 0) {
        showWarning('يرجى إضافة صنف واحد على الأقل للمتابعة');
        return;
      }
      for (let i = 0; i < purchaseItems.length; i++) {
        const it = purchaseItems[i];
        if (!it.name || !it.name.trim()) {
          showWarning(`الصنف رقم ${i + 1} يحتاج إلى تحديد الاسم`);
          return;
        }
        if (safeParseFloat(it.quantity, 0) <= 0) {
          showWarning(`يرجى تحديد كمية صحيحة أكبر من صفر للصنف "${it.name}"`);
          return;
        }
        if (safeParseFloat(it.cost_per_unit, 0) <= 0) {
          showWarning(`يرجى إدخال سعر التكلفة للصنف "${it.name}"`);
          return;
        }
      }
      setWizardStep(3);
    } else if (wizardStep === 3) {
      setWizardStep(4);
    }
  };

  const handlePrevStep = () => {
    setWizardStep((prev) => Math.max(1, prev - 1));
  };

  // Final Commit & Automatic Barcode Studio Launch
  const savePurchase = async () => {
    if (purchaseItems.length === 0) {
      showError('يرجى إضافة صنف واحد على الأقل لفاتورة الشراء');
      return;
    }

    setSaving(true);
    try {
      const id = generateId();
      const total = purchaseItems.reduce((sum, item) => sum + (item.total_cost || 0), 0);

      const finalItems = [];
      const inventoryUpdates = [];

      for (const item of purchaseItems) {
        let pId = item.product_id;
        let barcode = (item.barcode || '').trim();

        if (item.is_new || !pId) {
          if (!barcode) {
            barcode = generateValidBarcode('628');
          }
          const insertRes = await inventoryRepo.create({
            name: item.name.trim(),
            category: item.category || 'عطور شرقية',
            cost: item.cost_per_unit,
            price: item.sell_price || item.cost_per_unit * 1.35,
            qty: 0,
            unit: item.unit || 'قطعة',
            barcode,
            min_qty: 5,
            notes: item.batch_number || batchNumber ? `رقم التشغيلة: ${item.batch_number || batchNumber}` : null
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
        ]
          .filter(Boolean)
          .join(' | ') || null,
        items_json: JSON.stringify(finalItems)
      };

      // Transactional commit
      await purchasesRepo.createPurchaseWithInventoryUpdate(purchaseData, inventoryUpdates, inventoryRepo);

      // Best-effort thermal print receipt
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

      // Automatically launch Barcode Studio for newly committed items
      openBarcodePrintModal(finalItems);

      resetForm();
      await loadPurchases();
      await loadProducts(true);

      showSuccess(`✅ تم حفظ واعتماد الفاتورة بنجاح! الإجمالي: ${formatCurrency(total)}`);
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
    setWizardStep(1);
    setShowWizardModal(false);
    setShowOCRModal(false);
    setOcrImage(null);
  };

  // Open Barcode Print Modal with customized items & sticker counts
  const openBarcodePrintModal = (items) => {
    const formatted = items.map((it) => ({
      ...it,
      selected: true,
      printCount: Math.max(1, Math.min(100, Math.round(it.quantity) || 1))
    }));
    setBarcodeModalData({ items: formatted });
  };

  const toggleItemSelection = (index) => {
    setBarcodeModalData((prev) => {
      if (!prev) return null;
      const nextItems = [...prev.items];
      nextItems[index] = { ...nextItems[index], selected: !nextItems[index].selected };
      return { ...prev, items: nextItems };
    });
  };

  const updateItemPrintCount = (index, delta) => {
    setBarcodeModalData((prev) => {
      if (!prev) return null;
      const nextItems = [...prev.items];
      const newCount = Math.max(0, Math.min(200, (nextItems[index].printCount || 0) + delta));
      nextItems[index] = { ...nextItems[index], printCount: newCount };
      return { ...prev, items: nextItems };
    });
  };

  const setAllPrintCounts = (mode) => {
    setBarcodeModalData((prev) => {
      if (!prev) return null;
      const nextItems = prev.items.map((it) => ({
        ...it,
        selected: true,
        printCount: mode === 'invoice_qty' ? Math.max(1, Math.round(it.quantity) || 1) : 1
      }));
      return { ...prev, items: nextItems };
    });
  };

  const toggleSelectAll = (select) => {
    setBarcodeModalData((prev) => {
      if (!prev) return null;
      const nextItems = prev.items.map((it) => ({ ...it, selected: select }));
      return { ...prev, items: nextItems };
    });
  };

  // OCR Logic
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
            const autoBarcode = generateValidBarcode('628');
            const qty = safeParseFloat(item.quantity, 1);
            const cost = safeParseFloat(item.unit_price, 0);
            return {
              id: generateId(),
              is_new: true,
              product_id: '',
              name: item.name || '',
              category: 'عطور شرقية',
              unit: 'قطعة',
              quantity: qty,
              cost_per_unit: cost,
              sell_price: cost * 1.35,
              total_cost: qty * cost,
              barcode: autoBarcode,
              batch_number: '',
              storage_location: '',
              expiry_date: ''
            };
          });
          setPurchaseItems(items);
        }
        setShowOCRModal(false);
        setWizardStep(2); // Jump directly to items step for review
        setShowWizardModal(true);
        showSuccess('✅ تم استخراج بيانات الفاتورة بنجاح وتحويلها للمعالج');
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
          <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shadow-sm">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#2D2424] dark:text-white">إدارة المشتريات والتوريد</h1>
            <p className="text-xs text-[#5C524F] dark:text-slate-400">
              معالج تفاعلي بالتدريج، استوديو طباعة الباركود، وتحديث المخزون ومتوسط التكلفة (WAC)
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
            onClick={() => setShowOCRModal(true)}
            className="btn-atelier-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 font-bold cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-500" />
            <span>🤖 OCR فاتورة ورقية</span>
          </button>

          <button
            onClick={() => {
              resetForm();
              setShowWizardModal(true);
            }}
            className="btn-atelier-primary py-1.5 px-4 text-xs flex items-center gap-1.5 font-bold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>➕ تسجيل فاتورة شراء بالمعالج</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="atelier-card p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-gray-500 font-bold">إجمالي مشتريات الفترة</div>
            <div className="text-xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
              {formatCurrency(totalPurchases)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        <div className="atelier-card p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-gray-500 font-bold">عدد الفواتير المسجلة</div>
            <div className="text-xl font-black text-[#2D2424] dark:text-white tabular-nums">
              {purchases.length} فاتورة
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="atelier-card p-4 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-gray-500 font-bold">متوسط قيمة الفاتورة</div>
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatCurrency(purchases.length > 0 ? totalPurchases / purchases.length : 0)}
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
            <Scale className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute start-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="بحث برقم الفاتورة، اسم المورد، أو اسم الصنف..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input-atelier w-full ps-9 py-2 text-xs"
        />
      </div>

      {/* Purchases List */}
      <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin pr-1">
        {loading ? (
          <div className="p-8 text-center text-xs text-gray-400">جاري تحميل سجل المشتريات...</div>
        ) : filteredPurchases.length === 0 ? (
          <div className="atelier-card p-12 text-center flex flex-col items-center justify-center gap-3">
            <ShoppingBag className="w-12 h-12 text-gray-300 dark:text-slate-600" />
            <div className="text-sm font-bold text-gray-600 dark:text-gray-300">لا توجد فواتير مشتريات مطابقة</div>
            <p className="text-xs text-gray-400">اضغط على "تسجيل فاتورة شراء بالمعالج" لإدخال أول فاتورة توريد</p>
          </div>
        ) : (
          filteredPurchases.map((purchase) => {
            const items = JSON.parse(purchase.items_json || '[]');
            return (
              <div
                key={purchase.id}
                className="atelier-card p-4 flex flex-col gap-3 hover:border-amber-500/40 transition-all shadow-sm"
              >
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-[#2D2424] dark:text-white">
                        {purchase.supplier_name || 'مورد عام / غير محدد'}
                      </span>
                      {purchase.invoice_ref && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          {purchase.invoice_ref}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300">
                        {purchase.payment_type === 'cash'
                          ? 'كاش'
                          : purchase.payment_type === 'card'
                          ? 'بطاقة'
                          : purchase.payment_type === 'bank_transfer'
                          ? 'تحويل'
                          : 'آجل'}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-400 flex items-center gap-2">
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
                      onClick={() => openBarcodePrintModal(items)}
                      className="btn-atelier-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 font-bold cursor-pointer"
                      title="استوديو طباعة باركود الكميات المشتراة"
                    >
                      <QrCode className="w-3.5 h-3.5 text-amber-600" />
                      <span>استوديو الباركود</span>
                    </button>
                  </div>
                </div>

                {/* Items summary */}
                <div className="bg-white/80 dark:bg-slate-900/80 p-2.5 rounded-xl border border-amber-500/10 divide-y divide-amber-500/5 text-xs">
                  {items.map((it, idx) => (
                    <div key={idx} className="py-1.5 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#2D2424] dark:text-white">{it.name}</span>
                        <span className="text-gray-400 text-[11px]">
                          (×{it.quantity} {it.unit || 'قطعة'})
                        </span>
                        {it.category && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300">
                            {it.category}
                          </span>
                        )}
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

      {/* ========================================================================= */}
      {/* INTERACTIVE 4-STEP PURCHASE WIZARD MODAL */}
      {/* ========================================================================= */}
      {showWizardModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="atelier-card bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[94vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-4">
            
            {/* Wizard Header & Stepper Progress */}
            <div className="border-b border-amber-500/20 pb-4">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h2 className="text-lg font-extrabold text-[#2D2424] dark:text-amber-300 flex items-center gap-2">
                    <span>🛒</span>
                    <span>معالج تسجيل وتوريد المشتريات التفاعلي</span>
                  </h2>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                    خطوات بسيطة ومرتبة تبدأ من بيانات المورد وحتى المراجعة الشاملة وطباعة الباركود
                  </p>
                </div>
                <button
                  onClick={resetForm}
                  className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Progress Steps Indicators */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {[
                  { step: 1, title: '1. بيانات المورد والفاتورة', icon: Building2 },
                  { step: 2, title: '2. البضاعة والأصناف', icon: Boxes },
                  { step: 3, title: '3. التخزين والتشغيلة', icon: MapPin },
                  { step: 4, title: '4. المراجعة والاعتماد', icon: ClipboardList }
                ].map((s) => {
                  const IconComp = s.icon;
                  const isCurrent = wizardStep === s.step;
                  const isCompleted = wizardStep > s.step;
                  return (
                    <div
                      key={s.step}
                      className={`p-2 rounded-xl flex items-center justify-center gap-1.5 transition-all font-bold ${
                        isCurrent
                          ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/50'
                          : isCompleted
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : 'bg-black/5 dark:bg-slate-800 text-gray-400'
                      }`}
                    >
                      {isCompleted ? <Check className="w-3.5 h-3.5" /> : <IconComp className="w-3.5 h-3.5" />}
                      <span className="truncate">{s.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* STEP 1: SUPPLIER & INVOICE METADATA */}
            {wizardStep === 1 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="bg-amber-500/10 border border-amber-500/25 p-3 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">الخطوة الأولى (بيانات المورد والفاتورة):</span> أدخل اسم المورد وطريقة الدفع وتاريخ الفاتورة لتوثيق السند المحاسبي بدقة.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-amber-50/50 dark:bg-slate-800/40 p-5 rounded-2xl border border-amber-500/20">
                  <div>
                    <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1.5">
                      اسم المورد / الشركة الموردة <span className="text-gray-400 font-normal">(اختياري)</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: شركة العطور المتحدة، مورد محلي..."
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      className="input-atelier w-full text-xs font-bold"
                      autoFocus
                    />
                    <span className="text-[10px] text-gray-400 block mt-1">يظهر في تقارير الموردين ومتابعة الديون</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1.5">
                      هاتف المورد <span className="text-gray-400 font-normal">(اختياري)</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: 0912345678"
                      value={supplierPhone}
                      onChange={(e) => setSupplierPhone(e.target.value)}
                      className="input-atelier w-full text-xs"
                      dir="ltr"
                    />
                    <span className="text-[10px] text-gray-400 block mt-1">للتواصل السريع وتوثيق سند التوريد</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1.5">
                      رقم مرجع فاتورة المورد <span className="text-gray-400 font-normal">(اختياري)</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: INV-9842"
                      value={invoiceRef}
                      onChange={(e) => setInvoiceRef(e.target.value)}
                      className="input-atelier w-full text-xs font-mono"
                    />
                    <span className="text-[10px] text-gray-400 block mt-1">رقم الفاتورة الورقية الخاصة بالمورد للرجوع إليها</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1.5">تاريخ الفاتورة:</label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="input-atelier w-full text-xs font-bold"
                    />
                    <span className="text-[10px] text-gray-400 block mt-1">تاريخ استلام الشحنة وتثبيت السعر</span>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1.5">طريقة الدفع والتسوية:</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'cash', label: 'نقدي (كاش)', desc: 'خصم فوري من الخزينة' },
                        { id: 'card', label: 'بطاقة مصرفية', desc: 'دفع إلكتروني' },
                        { id: 'bank_transfer', label: 'تحويل بنكي', desc: 'حوالة مصرفية' },
                        { id: 'debt', label: 'آجل (دين للمورد)', desc: 'تسجيل دين في حساب المورد' }
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setPaymentType(m.id)}
                          className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${
                            paymentType === m.id
                              ? 'bg-amber-500/15 border-amber-500 text-amber-900 dark:text-amber-200 ring-1 ring-amber-500'
                              : 'bg-white dark:bg-slate-900 border-white/10 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          <div className="font-bold text-xs">{m.label}</div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{m.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: ITEMS, UNITS & QUANTITIES */}
            {wizardStep === 2 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="bg-amber-500/10 border border-amber-500/25 p-3 rounded-2xl flex items-start justify-between gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">الخطوة الثانية (البضاعة والأصناف):</span> أضف الأصناف المشتراة، وحدد وحدة القياس (قطعة، زجاجة، ملّ، لتر، تولة...)، والكمية وسعر التكلفة.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewCategoryModal(true)}
                    className="btn-atelier-secondary py-1 px-2.5 text-[11px] flex items-center gap-1 font-bold shrink-0 cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-amber-500" />
                    <span>➕ إضافة فئة</span>
                  </button>
                </div>

                <div className="flex justify-between items-center gap-2">
                  <div className="text-xs font-bold text-gray-500">
                    عدد الأصناف المضافة: <span className="text-amber-500 font-extrabold">{purchaseItems.length} صنف</span>
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
                    <Boxes className="w-10 h-10 mx-auto text-amber-500/40 mb-2" />
                    <div className="text-xs font-bold text-gray-500 dark:text-slate-400">
                      لم يتم إضافة أي منتج بعد في هذه الفاتورة
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1">
                      اضغط على "إضافة صنف من المخزون" أو "إضافة منتج جديد" للبدء
                    </div>
                  </div>
                ) : (
                  <div className="border border-amber-500/20 rounded-2xl overflow-hidden shadow-sm">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-[#F4EFEA] dark:bg-slate-800 font-bold text-[#5C524F] dark:text-slate-300">
                        <tr>
                          <th className="p-2.5">المنتج والتصنيف</th>
                          <th className="p-2.5">وحدة القياس</th>
                          <th className="p-2.5 text-center">الكمية</th>
                          <th className="p-2.5 text-left">سعر التكلفة (د.ل)</th>
                          <th className="p-2.5 text-left">
                            سعر البيع (د.ل) <span className="text-[9px] font-normal text-gray-400">(اختياري)</span>
                          </th>
                          <th className="p-2.5 text-left">الإجمالي</th>
                          <th className="p-2.5 text-center">حذف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-500/10">
                        {purchaseItems.map((item, index) => (
                          <tr key={item.id || index} className="hover:bg-amber-500/5 transition-colors">
                            {/* Product & Category */}
                            <td className="p-2.5 min-w-[240px]">
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
                                      {categories.map((cat) => (
                                        <option key={cat} value={cat}>
                                          {cat}
                                        </option>
                                      ))}
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
                                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                                    <span>الفئة: {item.category}</span>
                                    {item.barcode && (
                                      <span className="font-mono bg-black/10 dark:bg-slate-800 px-1 rounded">
                                        {item.barcode}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Unit Selector */}
                            <td className="p-2.5 min-w-[120px]">
                              <select
                                value={item.unit}
                                onChange={(e) => updatePurchaseItem(index, 'unit', e.target.value)}
                                className="input-atelier w-full py-1 text-xs font-bold"
                              >
                                {DEFAULT_UNITS.map((u) => (
                                  <option key={u.value} value={u.value}>
                                    {u.label}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Quantity with Counter Steppers */}
                            <td className="p-2.5 text-center">
                              <div className="inline-flex items-center gap-1 bg-black/5 dark:bg-slate-800 p-0.5 rounded-lg border border-white/5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updatePurchaseItem(index, 'quantity', Math.max(0.1, (item.quantity || 1) - 1))
                                  }
                                  className="w-6 h-6 flex items-center justify-center rounded bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 text-xs font-bold cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  step="any"
                                  min="0.1"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updatePurchaseItem(index, 'quantity', safeParseFloat(e.target.value, 1))
                                  }
                                  className="w-14 text-center py-0.5 text-xs font-bold bg-transparent border-0 focus:outline-none"
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

                            {/* Cost per unit */}
                            <td className="p-2.5 text-left">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={item.cost_per_unit || ''}
                                placeholder="التكلفة"
                                onChange={(e) =>
                                  updatePurchaseItem(index, 'cost_per_unit', safeParseFloat(e.target.value, 0))
                                }
                                className="input-atelier w-20 text-left py-1 text-xs font-bold tabular-nums"
                              />
                            </td>

                            {/* Suggested Retail Price */}
                            <td className="p-2.5 text-left">
                              <input
                                type="number"
                                step="0.1"
                                min="0"
                                value={item.sell_price || ''}
                                placeholder="سعر البيع"
                                onChange={(e) =>
                                  updatePurchaseItem(index, 'sell_price', safeParseFloat(e.target.value, 0))
                                }
                                className="input-atelier w-20 text-left py-1 text-xs font-bold tabular-nums"
                              />
                            </td>

                            {/* Total Cost */}
                            <td className="p-2.5 text-left font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                              {formatCurrency(item.total_cost)}
                            </td>

                            {/* Delete Item */}
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

                {/* Subtotal Banner */}
                <div className="bg-[#F8F6F0] dark:bg-slate-800 p-3 rounded-2xl flex justify-between items-center border border-amber-500/20 font-bold">
                  <span className="text-xs text-gray-500">إجمالي قيمة البضاعة حتى الآن:</span>
                  <span className="text-xl text-emerald-600 dark:text-emerald-400 font-black tabular-nums">
                    {formatCurrency(purchaseItems.reduce((sum, item) => sum + (item.total_cost || 0), 0))}
                  </span>
                </div>
              </div>
            )}

            {/* STEP 3: STORAGE, BATCH & DELIVERY NOTES */}
            {wizardStep === 3 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="bg-amber-500/10 border border-amber-500/25 p-3 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">الخطوة الثالثة (بيانات التخزين والتشغيلة - اختيارية):</span> يمكنك توثيق رقم الدفعة/التشغيلة وموقع التخزين وتاريخ الصلاحية لسهولة تتبع العطور والمخزون لاحقاً.
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-amber-50/50 dark:bg-slate-800/40 p-5 rounded-2xl border border-amber-500/20">
                  <div>
                    <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1.5">
                      رقم التشغيلة / الدفعة (Batch No) <span className="text-gray-400 font-normal">(اختياري)</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: BATCH-2026-08"
                      value={batchNumber}
                      onChange={(e) => setBatchNumber(e.target.value)}
                      className="input-atelier w-full text-xs font-mono font-bold"
                    />
                    <span className="text-[10px] text-gray-400 block mt-1">تتبع جودة الشحنات وتواريخ إنتاجها</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1.5">
                      موقع التخزين / الرف <span className="text-gray-400 font-normal">(اختياري)</span>:
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: الرف الشرقي A-4 أو المخزن الداخلي"
                      value={storageLocation}
                      onChange={(e) => setStorageLocation(e.target.value)}
                      className="input-atelier w-full text-xs"
                    />
                    <span className="text-[10px] text-gray-400 block mt-1">مكان تخزين البضاعة في المحل أو المستودع</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1.5">
                      تاريخ الصلاحية / الانتهاء <span className="text-gray-400 font-normal">(اختياري)</span>:
                    </label>
                    <input
                      type="date"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="input-atelier w-full text-xs"
                    />
                    <span className="text-[10px] text-gray-400 block mt-1">خاص بالزيوت والمستحضرات العطرية</span>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-[#5C524F] dark:text-slate-300 mb-1.5">
                      ملاحظات التوريد والاستلام <span className="text-gray-400 font-normal">(اختياري)</span>:
                    </label>
                    <textarea
                      placeholder="أية ملاحظات إضافية حول التوريد أو حالة البضاعة المستلمة..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="input-atelier w-full h-20 text-xs resize-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: COMPREHENSIVE REVIEW & FINAL COMMIT */}
            {wizardStep === 4 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">الخطوة الرابعة (المراجعة الشاملة والاعتماد):</span> راجع بيانات الفاتورة والأصناف والتكلفة الإجمالية قبل الحفظ النهائي. فور اعتماد الفاتورة، ستفتح شاشة طباعة الباركود تلقائياً.
                  </div>
                </div>

                {/* Summary Metadata Card */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-amber-50/50 dark:bg-slate-800/40 p-4 rounded-2xl border border-amber-500/20 text-xs">
                  <div>
                    <span className="text-gray-400 block text-[10px]">اسم المورد:</span>
                    <span className="font-bold">{supplierName || 'مورد عام'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">تاريخ الفاتورة:</span>
                    <span className="font-bold">{invoiceDate}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">طريقة الدفع:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      {paymentType === 'cash'
                        ? 'كاش (نقدي)'
                        : paymentType === 'card'
                        ? 'بطاقة مصرفية'
                        : paymentType === 'bank_transfer'
                        ? 'تحويل بنكي'
                        : 'آجل (دين للمورد)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px]">رقم المرجع / الرف:</span>
                    <span className="font-mono">{invoiceRef || storageLocation || '—'}</span>
                  </div>
                </div>

                {/* Items Review Table */}
                <div className="border border-white/10 rounded-2xl overflow-hidden text-xs max-h-56 overflow-y-auto scrollbar-thin">
                  <table className="w-full text-right">
                    <thead className="bg-[#F4EFEA] dark:bg-slate-800 font-bold text-[#5C524F] dark:text-slate-300">
                      <tr>
                        <th className="p-2.5">الصنف</th>
                        <th className="p-2.5">الفئة</th>
                        <th className="p-2.5 text-center">الكمية</th>
                        <th className="p-2.5 text-left">التكلفة</th>
                        <th className="p-2.5 text-left">سعر البيع المقترح</th>
                        <th className="p-2.5 text-left">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-500/10">
                      {purchaseItems.map((it, idx) => (
                        <tr key={idx} className="hover:bg-amber-500/5">
                          <td className="p-2.5 font-bold">{it.name}</td>
                          <td className="p-2.5 text-gray-400">{it.category}</td>
                          <td className="p-2.5 text-center font-bold">
                            {it.quantity} {it.unit}
                          </td>
                          <td className="p-2.5 text-left font-mono">{formatCurrency(it.cost_per_unit)}</td>
                          <td className="p-2.5 text-left font-mono text-emerald-600">
                            {formatCurrency(it.sell_price || it.cost_per_unit * 1.35)}
                          </td>
                          <td className="p-2.5 text-left font-bold text-amber-600 tabular-nums">
                            {formatCurrency(it.total_cost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Big Grand Total Banner */}
                <div className="bg-[#F8F6F0] dark:bg-slate-800 p-4 rounded-2xl flex justify-between items-center border border-amber-500/30">
                  <div>
                    <span className="text-xs text-gray-500 block">إجمالي عدد الأصناف: {purchaseItems.length} صنف</span>
                    <span className="text-sm font-bold text-[#2D2424] dark:text-white">إجمالي قيمة الفاتورة المستحقة:</span>
                  </div>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatCurrency(purchaseItems.reduce((sum, item) => sum + (item.total_cost || 0), 0))}
                  </span>
                </div>
              </div>
            )}

            {/* Wizard Navigation Footer */}
            <div className="flex justify-between items-center gap-3 pt-3 border-t border-white/10">
              <div>
                {wizardStep > 1 && (
                  <button
                    type="button"
                    onClick={handlePrevStep}
                    className="btn-atelier-secondary py-2 px-5 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowRight className="w-4 h-4" />
                    <span>السابق</span>
                  </button>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-atelier-secondary py-2 px-4 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>

                {wizardStep < 4 ? (
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="btn-atelier-primary py-2 px-6 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>التالي</span>
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={savePurchase}
                    disabled={saving}
                    className="btn-atelier-primary py-2.5 px-8 text-xs font-extrabold flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg"
                  >
                    {saving ? (
                      <>
                        <span>⏳</span>
                        <span>جاري حفظ الفاتورة وتحديث المخزون...</span>
                      </>
                    ) : (
                      <>
                        <span>✅</span>
                        <span>اعتماد الفاتورة والانتقال لطباعة الباركود</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BARCODE PRINT STUDIO MODAL (POST-COMMIT OR DEDICATED PRINTING) */}
      {/* ========================================================================= */}
      {barcodeModalData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="atelier-card bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-amber-500/20 pb-3">
              <div>
                <h2 className="text-lg font-bold text-[#2D2424] dark:text-amber-300 flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-amber-500" />
                  <span>استوديو طباعة الباركود القياسي القابل للقراءة</span>
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                  حدد الأصناف التي تود طباعة ملصقاتها، واضبط عدد النسخ لكل صنف بحرية تامة
                </p>
              </div>
              <button
                onClick={() => setBarcodeModalData(null)}
                className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Print Controls Bar */}
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-amber-900 dark:text-amber-300">أزرار سريعة للكميات:</span>
                <button
                  type="button"
                  onClick={() => setAllPrintCounts('invoice_qty')}
                  className="btn-atelier-secondary py-1 px-2.5 text-[11px] font-bold cursor-pointer"
                >
                  نفس كمية الفاتورة
                </button>
                <button
                  type="button"
                  onClick={() => setAllPrintCounts('single')}
                  className="btn-atelier-secondary py-1 px-2.5 text-[11px] font-bold cursor-pointer"
                >
                  ملصق 1 لكل صنف
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectAll(true)}
                  className="btn-atelier-secondary py-1 px-2 text-[10px] cursor-pointer"
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectAll(false)}
                  className="btn-atelier-secondary py-1 px-2 text-[10px] cursor-pointer"
                >
                  إلغاء التحديد
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-600 dark:text-slate-300">مقاس الطباعة:</span>
                <button
                  type="button"
                  onClick={() => setBarcodeLayout('thermal')}
                  className={`py-1 px-2.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                    barcodeLayout === 'thermal'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-black/10 border-white/10 text-gray-400'
                  }`}
                >
                  طابعة حرارية (50×30mm)
                </button>
                <button
                  type="button"
                  onClick={() => setBarcodeLayout('a4_grid')}
                  className={`py-1 px-2.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                    barcodeLayout === 'a4_grid'
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-black/10 border-white/10 text-gray-400'
                  }`}
                >
                  ورق ملصقات A4
                </button>
              </div>
            </div>

            {/* Items Label Count Adjuster Table */}
            <div className="border border-white/10 rounded-2xl overflow-hidden text-xs max-h-44 overflow-y-auto scrollbar-thin">
              <table className="w-full text-right">
                <thead className="bg-black/20 dark:bg-slate-800 font-bold text-gray-400">
                  <tr>
                    <th className="p-2 text-center w-10">طباعة؟</th>
                    <th className="p-2">الصنف</th>
                    <th className="p-2">الباركود</th>
                    <th className="p-2 text-center">كمية الفاتورة</th>
                    <th className="p-2 text-center">عدد الملصقات للطباعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {barcodeModalData.items.map((it, idx) => (
                    <tr key={idx} className={`hover:bg-amber-500/5 ${!it.selected ? 'opacity-40' : ''}`}>
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!it.selected}
                          onChange={() => toggleItemSelection(idx)}
                          className="rounded text-amber-500 focus:ring-amber-400 cursor-pointer"
                        />
                      </td>
                      <td className="p-2 font-bold">{it.name}</td>
                      <td className="p-2 font-mono text-[11px] text-gray-400">{it.barcode || 'تلقائي'}</td>
                      <td className="p-2 text-center text-gray-400">
                        {it.quantity} {it.unit || 'قطعة'}
                      </td>
                      <td className="p-2 text-center">
                        <div className="inline-flex items-center gap-1 bg-black/10 dark:bg-slate-800 p-0.5 rounded-lg border border-white/5">
                          <button
                            type="button"
                            onClick={() => updateItemPrintCount(idx, -1)}
                            disabled={!it.selected}
                            className="w-5 h-5 flex items-center justify-center rounded bg-white dark:bg-slate-700 text-xs font-bold cursor-pointer disabled:opacity-30"
                          >
                            -
                          </button>
                          <span className="w-10 text-center font-bold text-amber-500 tabular-nums">
                            {it.selected ? it.printCount || 0 : 0}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateItemPrintCount(idx, 1)}
                            disabled={!it.selected}
                            className="w-5 h-5 flex items-center justify-center rounded bg-white dark:bg-slate-700 text-xs font-bold cursor-pointer disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Live Scannable Preview Grid */}
            <div
              id="printable-barcode-sheet"
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4 bg-gray-100 dark:bg-slate-950/70 rounded-2xl border border-amber-500/20 max-h-[44vh] overflow-y-auto scrollbar-thin"
            >
              {barcodeModalData.items
                .filter((item) => item.selected && (item.printCount || 0) > 0)
                .flatMap((item, itemIdx) => {
                  const count = item.printCount || 0;
                  return Array.from({ length: count }).map((_, copyIdx) => (
                    <div
                      key={`${itemIdx}-${copyIdx}`}
                      className="bg-white text-black p-3 rounded-xl border border-gray-300 shadow-sm flex flex-col items-center justify-between text-center font-sans"
                      style={{ width: '100%', minHeight: '135px' }}
                    >
                      <div className="text-[10px] font-bold text-gray-600 truncate max-w-full">
                        الدفة للعطور الملكية
                      </div>
                      <div className="text-xs font-black text-gray-900 truncate max-w-full my-0.5">
                        {item.name}
                      </div>

                      {/* True Vector Scannable Barcode SVG */}
                      <div className="w-full flex justify-center my-1">
                        <BarcodeSVG
                          value={item.barcode || 'AL-PERFUME'}
                          width={150}
                          height={50}
                          showText={true}
                        />
                      </div>

                      <div className="text-xs font-black text-emerald-800 mt-1 tabular-nums">
                        {formatCurrency(item.sell_price || item.cost_per_unit * 1.35)}
                      </div>
                    </div>
                  ));
                })}
            </div>

            {/* Print Action Buttons */}
            <div className="flex gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => {
                  window.print();
                  showSuccess('✅ تم إرسال ملصقات الباركود إلى أمر الطباعة');
                }}
                className="flex-1 btn-atelier-primary py-2.5 text-xs flex items-center justify-center gap-2 font-bold cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>
                  طباعة الآن (
                  {barcodeModalData.items
                    .filter((i) => i.selected)
                    .reduce((s, i) => s + (i.printCount || 0), 0)}{' '}
                  ملصق)
                </span>
              </button>
              <button
                onClick={() => setBarcodeModalData(null)}
                className="btn-atelier-secondary py-2.5 px-6 text-xs font-bold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK NEW CATEGORY MODAL */}
      {/* ========================================================================= */}
      {showNewCategoryModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="atelier-card bg-white dark:bg-slate-900 w-full max-w-md p-5 shadow-2xl flex flex-col gap-4">
            <h3 className="text-base font-extrabold text-[#2D2424] dark:text-amber-300 flex items-center gap-2">
              <FolderPlus className="w-5 h-5 text-amber-500" />
              <span>إضافة فئة / تصنيف منتجات جديد</span>
            </h3>
            <p className="text-xs text-gray-500">
              أدخل اسم الفئة ليتم حفظها وتوفيرها فوراً في القوائم المنسدلة بالمشتريات والمخزون
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1">اسم التصنيف الجديد:</label>
              <input
                type="text"
                placeholder="مثال: عطور زيتية نقية، مخلطات خاصة..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="input-atelier w-full text-xs font-bold"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateCategory}
                className="flex-1 btn-atelier-primary py-2 text-xs font-bold cursor-pointer"
              >
                ✅ حفظ وإضافة التصنيف
              </button>
              <button
                type="button"
                onClick={() => setShowNewCategoryModal(false)}
                className="btn-atelier-secondary py-2 px-4 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* OCR MODAL */}
      {/* ========================================================================= */}
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
                className="flex-1 btn-atelier-primary py-2.5 text-xs disabled:opacity-50 font-bold cursor-pointer"
              >
                {ocrProcessing ? '⏳ جاري التحليل...' : '🤖 تحليل واستخراج'}
              </button>
              <button
                onClick={() => setShowOCRModal(false)}
                className="btn-atelier-secondary py-2.5 px-5 text-xs font-bold cursor-pointer"
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
