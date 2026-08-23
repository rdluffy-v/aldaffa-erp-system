/**
 * ============================================================================
 * BARCODE STUDIO MODULE (استوديو الباركود الشامل والطباعة الحرارية)
 * ============================================================================
 * Complete standalone barcode management studio for Aldaffa Perfumes ERP.
 * Supports:
 * - Direct printing from Inventory
 * - Direct import from Purchases Invoices
 * - Custom on-the-fly barcode label creation
 * - Multi-size presets: 50x30mm, 40x20mm, 60x40mm, 80mm continuous, A4 sheet
 * - Real-time USB hardware & CUPS printer auto-discovery (XP-365B, etc.)
 * - Direct Silent Printing & System Dialog printing
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { PurchasesRepository } from '../database/repositories/PurchasesRepository.js';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, generateId, generateValidBarcode } from '../utils/helpers.js';
import { BarcodeSVG, generateBarcodeSvgString } from '../utils/barcodeGenerator.jsx';
import useDebounce from '../hooks/useDebounce.js';
import {
  QrCode,
  Printer,
  Package,
  ShoppingBag,
  Plus,
  Minus,
  Search,
  RefreshCw,
  Usb,
  Terminal,
  Layers,
  CheckCircle2,
  Trash2,
  Tag,
  Zap,
  Sliders,
  FileText,
  Boxes,
  Sparkles,
  Check
} from 'lucide-react';

const inventoryRepo = new InventoryRepository();
const purchasesRepo = new PurchasesRepository();

const LABEL_SIZES = [
  { id: '50x30', label: 'حراري قياسي (50×30 mm)', widthMm: 50, heightMm: 30, isThermal: true },
  { id: '40x20', label: 'حراري صغير (40×20 mm)', widthMm: 40, heightMm: 20, isThermal: true },
  { id: '60x40', label: 'حراري كبير (60×40 mm)', widthMm: 60, heightMm: 40, isThermal: true },
  { id: '80mm_roll', label: 'رول كاشير مستمر (80 mm)', widthMm: 80, heightMm: 40, isThermal: true },
  { id: 'a4_grid', label: 'ورق ملصقات مقسم A4 (24 ملصق)', widthMm: 210, heightMm: 297, isThermal: false }
];

const BarcodeStudioModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();
  const { products, loading: productsLoading, loadProducts } = useInventoryStore();

  // Active Source Tab: 'inventory' | 'purchases' | 'custom'
  const [activeTab, setActiveTab] = useState('inventory');

  // Print Queue Items: [ { id, name, barcode, price, cost, quantity, printCount, selected, source } ]
  const [queueItems, setQueueItems] = useState([]);
  const [selectedSize, setSelectedSize] = useState('50x30');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 250);
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Purchases Invoices List
  const [purchases, setPurchases] = useState([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  // Custom Item Form
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customBarcode, setCustomBarcode] = useState('');
  const [customQty, setCustomQty] = useState(1);

  // Hardware & Printing State
  const [hardwareInfo, setHardwareInfo] = useState({
    systemPrinters: [],
    usbPrinters: [],
    lpDevices: [],
    cupsRunning: false
  });
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [checkingHardware, setCheckingHardware] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showCupsGuide, setShowCupsGuide] = useState(false);

  // Load Products & Hardware on mount
  useEffect(() => {
    loadProducts();
    loadHardwareInfo();
    loadRecentPurchases();
  }, []);

  const loadHardwareInfo = useCallback(async () => {
    setCheckingHardware(true);
    try {
      if (typeof window !== 'undefined' && window.require) {
        const { ipcRenderer } = window.require('electron');
        const res = await ipcRenderer.invoke('hardware:get-devices');
        if (res && res.success) {
          setHardwareInfo(res);
          if (res.systemPrinters && res.systemPrinters.length > 0 && !selectedPrinter) {
            const def = res.systemPrinters.find((p) => p.isDefault) || res.systemPrinters[0];
            setSelectedPrinter(def.name);
          }
        }
      }
    } catch (e) {
      console.warn('loadHardwareInfo error:', e);
    } finally {
      setCheckingHardware(false);
    }
  }, [selectedPrinter]);

  const loadRecentPurchases = async () => {
    setLoadingPurchases(true);
    try {
      const data = await purchasesRepo.findAll({}, 'created_at DESC', 30);
      setPurchases(data || []);
    } catch (e) {
      console.warn('loadRecentPurchases error:', e);
    } finally {
      setLoadingPurchases(false);
    }
  };

  // Generate a random valid barcode for custom form
  const handleAutoGenerateCustomBarcode = () => {
    const code = generateValidBarcode('628');
    setCustomBarcode(code);
  };

  // Add a product from Inventory to Queue
  const handleAddProductToQueue = (prod) => {
    setQueueItems((prev) => {
      const existing = prev.find((item) => item.product_id === prod.id || (item.barcode && item.barcode === prod.barcode));
      if (existing) {
        return prev.map((item) =>
          item.id === existing.id ? { ...item, printCount: (item.printCount || 0) + 1, selected: true } : item
        );
      }
      return [
        ...prev,
        {
          id: generateId(),
          product_id: prod.id,
          name: prod.name,
          barcode: prod.barcode || generateValidBarcode('628'),
          price: prod.price || 0,
          cost: prod.cost || 0,
          unit: prod.unit || 'قطعة',
          quantity: prod.qty || 1,
          printCount: Math.max(1, Math.min(prod.qty || 1, 5)),
          selected: true,
          source: 'inventory'
        }
      ];
    });
    showSuccess(`تمت إضافة "${prod.name}" إلى قائمة الطباعة`);
  };

  // Import all items from a Purchase Invoice
  const handleImportPurchaseInvoice = (purchase) => {
    try {
      const items = JSON.parse(purchase.items_json || '[]');
      if (!items || items.length === 0) {
        showWarning('لا توجد أصناف في هذه الفاتورة');
        return;
      }

      const newEntries = items.map((it) => ({
        id: generateId(),
        product_id: it.product_id || '',
        name: it.name,
        barcode: it.barcode || generateValidBarcode('628'),
        price: it.sell_price || it.cost_per_unit * 1.35 || 0,
        cost: it.cost_per_unit || 0,
        unit: it.unit || 'قطعة',
        quantity: it.quantity || 1,
        printCount: Math.max(1, parseInt(it.quantity) || 1),
        selected: true,
        source: `فاتورة #${purchase.invoice_ref || purchase.id}`
      }));

      setQueueItems((prev) => [...prev, ...newEntries]);
      showSuccess(`✅ تم استيراد ${items.length} صنف من فاتورة المشتريات`);
    } catch (e) {
      showError('خطأ أثناء قراءة الفاتورة: ' + e.message);
    }
  };

  // Add Custom Item to Queue
  const handleAddCustomItem = (e) => {
    e?.preventDefault();
    if (!customName.trim()) {
      showWarning('يرجى كتابة اسم المنتج');
      return;
    }

    const finalBarcode = customBarcode.trim() || generateValidBarcode('628');
    const finalPrice = parseFloat(customPrice) || 0;
    const finalCount = parseInt(customQty) || 1;

    setQueueItems((prev) => [
      ...prev,
      {
        id: generateId(),
        product_id: '',
        name: customName.trim(),
        barcode: finalBarcode,
        price: finalPrice,
        cost: 0,
        unit: 'قطعة',
        quantity: finalCount,
        printCount: finalCount,
        selected: true,
        source: 'مخصص'
      }
    ]);

    setCustomName('');
    setCustomPrice('');
    setCustomBarcode('');
    setCustomQty(1);
    showSuccess(`تمت إضافة "${customName.trim()}" إلى قائمة الطباعة`);
  };

  // Update item print count
  const updatePrintCount = (id, delta) => {
    setQueueItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const newCount = Math.max(1, (item.printCount || 1) + delta);
          return { ...item, printCount: newCount };
        }
        return item;
      })
    );
  };

  // Toggle item selection
  const toggleItemSelection = (id) => {
    setQueueItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  // Batch Selection helpers
  const setAllSelections = (selected) => {
    setQueueItems((prev) => prev.map((item) => ({ ...item, selected })));
  };

  const setAllCountsToSingle = () => {
    setQueueItems((prev) => prev.map((item) => ({ ...item, printCount: 1, selected: true })));
  };

  const removeQueueItem = (id) => {
    setQueueItems((prev) => prev.filter((item) => item.id !== id));
  };

  const clearQueue = () => {
    setQueueItems([]);
  };

  // Filtered Products for Inventory Tab
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        !debouncedSearch ||
        p.name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        p.barcode?.includes(debouncedSearch);
      const matchCat = selectedCategory === 'all' || p.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [products, debouncedSearch, selectedCategory]);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    return ['all', ...Array.from(set)];
  }, [products]);

  // Total Labels to Print
  const selectedItems = useMemo(() => {
    return queueItems.filter((it) => it.selected && (it.printCount || 0) > 0);
  }, [queueItems]);

  const totalLabelsCount = useMemo(() => {
    return selectedItems.reduce((acc, it) => acc + (it.printCount || 0), 0);
  }, [selectedItems]);

  // Core Print Executor
  const handleExecutePrint = async (silent = false) => {
    if (selectedItems.length === 0) {
      showWarning('قائمة الطباعة فارغة أو لم يتم تحديد أي صنف');
      return;
    }

    const currentSizeConfig = LABEL_SIZES.find((s) => s.id === selectedSize) || LABEL_SIZES[0];
    setPrinting(true);

    try {
      // Build pure standalone HTML with inline SVGs (zero CDN dependency)
      const labelsHtml = selectedItems
        .flatMap((item) => {
          const count = item.printCount || 1;
          const svgCode = generateBarcodeSvgString(item.barcode, 160, 45, true);
          return Array.from({ length: count }).map(
            () => `
            <div class="label-box">
              <div class="store-title">الدفة للعطور الملكية</div>
              <div class="product-title">${item.name}</div>
              <div class="barcode-area">${svgCode}</div>
              <div class="price-badge">${formatCurrency(item.price)}</div>
            </div>
          `
          );
        })
        .join('');

      const isThermal = currentSizeConfig.isThermal;
      const widthMm = currentSizeConfig.widthMm;
      const heightMm = currentSizeConfig.heightMm;

      const printHtmlDocument = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>طباعة ملصقات الباركود - الدفة للعطور</title>
  <style>
    @page {
      size: ${isThermal ? `${widthMm}mm ${heightMm}mm` : 'A4'};
      margin: ${isThermal ? '0' : '8mm'};
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #FFFFFF;
      color: #000000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    ${
      isThermal
        ? `
      .label-wrapper {
        width: ${widthMm}mm;
        height: ${heightMm}mm;
        page-break-after: always;
        page-break-inside: avoid;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        text-align: center;
        padding: 1.5mm 2mm;
        overflow: hidden;
      }
      .label-box {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        text-align: center;
      }
      .store-title {
        font-size: 8px;
        font-weight: 700;
        color: #333333;
        line-height: 1.1;
      }
      .product-title {
        font-size: 10px;
        font-weight: 900;
        color: #000000;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: ${widthMm - 6}mm;
        line-height: 1.2;
        margin: 0.5mm 0;
      }
      .barcode-area {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .barcode-area svg {
        width: ${widthMm - 8}mm !important;
        height: auto !important;
        max-height: 12mm;
      }
      .price-badge {
        font-size: 10px;
        font-weight: 900;
        color: #000000;
        line-height: 1.1;
      }
    `
        : `
      .grid-container {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 3mm;
      }
      .label-box {
        border: 1px dashed #CCCCCC;
        border-radius: 4px;
        padding: 2.5mm;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        min-height: 28mm;
        text-align: center;
        page-break-inside: avoid;
      }
      .store-title { font-size: 8px; font-weight: bold; color: #555555; }
      .product-title { font-size: 10px; font-weight: 800; }
      .barcode-area { width: 100%; display: flex; justify-content: center; margin: 1mm 0; }
      .barcode-area svg { width: 42mm !important; height: auto !important; max-height: 12mm; }
      .price-badge { font-size: 10px; font-weight: 900; }
    `
    }
  </style>
</head>
<body>
  ${
    isThermal
      ? labelsHtml
          .split('</div>')
          .filter(Boolean)
          .map((box) => `<div class="label-wrapper">${box}</div></div>`)
          .join('')
      : `
    <div class="grid-container">
      ${labelsHtml}
    </div>
  `
  }
</body>
</html>
      `;

      if (typeof window !== 'undefined' && window.require) {
        const { ipcRenderer } = window.require('electron');
        const res = await ipcRenderer.invoke('print:barcodes-direct', {
          html: printHtmlDocument,
          printerName: selectedPrinter || undefined,
          silent: !!silent,
          widthMm,
          heightMm
        });

        if (res && res.success) {
          showSuccess(`✅ تم إرسال ${totalLabelsCount} ملصق إلى الطابعة (${selectedPrinter || 'الافتراضية'}) بنجاح`);
        } else {
          showError(`فشل إرسال أمر الطباعة: ${res?.error || 'خطأ غير معروف'}`);
        }
      } else {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(printHtmlDocument);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        showSuccess('✅ تم فتح حوار الطباعة');
      }
    } catch (err) {
      showError(`خطأ في تنفيذ الطباعة: ${err.message}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Top Header Card */}
      <div className="atelier-card p-4 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shadow-sm">
            <QrCode className="w-6 h-6 text-amber-500" />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#2D2424] dark:text-white">استوديو طباعة الباركود الشامل (Barcode Studio)</h1>
            <p className="text-xs text-[#5C524F] dark:text-slate-400">
              توليد وطباعة ملصقات الباركود الاحترافية لمنتجات المخزون وفواتير المشتريات بدقة قياسية
            </p>
          </div>
        </div>

        {/* Hardware Status Quick Badge */}
        <div className="flex items-center gap-2">
          {hardwareInfo.systemPrinters && hardwareInfo.systemPrinters.length > 0 ? (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>الطابعة الجاهزة: {selectedPrinter || hardwareInfo.systemPrinters[0]?.name}</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5">
              <Usb className="w-3.5 h-3.5" />
              <span>جاري الاتصال بالطابعة عبر USB...</span>
            </div>
          )}

          <button
            type="button"
            onClick={loadHardwareInfo}
            disabled={checkingHardware}
            className="btn-atelier-secondary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingHardware ? 'animate-spin' : ''}`} />
            <span>{checkingHardware ? 'جاري الفحص...' : 'فحص الأجهزة'}</span>
          </button>
        </div>
      </div>

      {/* Main Dual Workspace: Left Column (Sources & Selection) | Right Column (Queue & Live Preview) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: SOURCES (7 Cols) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-6 flex flex-col gap-3 overflow-hidden">
          {/* Source Tabs Header */}
          <div className="flex gap-2 p-1.5 bg-gray-100 dark:bg-slate-800/70 rounded-2xl border border-white/5">
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>من المخزون ({products.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('purchases')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'purchases'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>فواتير المشتريات ({purchases.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('custom')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'custom'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>ملصق مخصص وحر</span>
            </button>
          </div>

          {/* TAB 1: INVENTORY PRODUCTS LIST */}
          {activeTab === 'inventory' && (
            <div className="atelier-card flex-1 p-3.5 flex flex-col gap-3 overflow-hidden">
              {/* Search & Category Filter */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute start-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو الباركود..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-atelier w-full ps-9 py-1.5 text-xs"
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="input-atelier py-1.5 text-xs font-bold w-36"
                >
                  <option value="all">كل الفئات</option>
                  {categories.filter((c) => c !== 'all').map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Products Table Scroll Area */}
              <div className="flex-1 overflow-y-auto scrollbar-thin border border-white/10 rounded-xl">
                <table className="w-full text-right text-xs">
                  <thead className="bg-black/10 dark:bg-slate-800/80 sticky top-0 font-bold text-gray-400">
                    <tr>
                      <th className="p-2">المنتج</th>
                      <th className="p-2">الباركود</th>
                      <th className="p-2 text-center">المتوفر</th>
                      <th className="p-2 text-center">السعر</th>
                      <th className="p-2 text-center w-20">إضافة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {productsLoading ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-gray-400">
                          جاري تحميل المنتجات...
                        </td>
                      </tr>
                    ) : filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-gray-400">
                          لا توجد أصناف مطابقة للبحث
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((p) => (
                        <tr key={p.id} className="hover:bg-amber-500/5 transition-colors">
                          <td className="p-2 font-bold text-[#2D2424] dark:text-white">{p.name}</td>
                          <td className="p-2 font-mono text-[11px] text-gray-500">{p.barcode || 'تلقائي'}</td>
                          <td className="p-2 text-center font-bold text-emerald-600">
                            {p.qty} {p.unit || 'قطعة'}
                          </td>
                          <td className="p-2 text-center font-bold text-amber-600 tabular-nums">
                            {formatCurrency(p.price)}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleAddProductToQueue(p)}
                              className="btn-atelier-primary py-1 px-3 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>إضافة</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: PURCHASES INVOICES LIST */}
          {activeTab === 'purchases' && (
            <div className="atelier-card flex-1 p-3.5 flex flex-col gap-3 overflow-hidden">
              <div className="text-xs text-gray-500">
                اختر أي فاتورة توريد لاستيراد جميع أصنافها بكمياتها فوراً إلى قائمة الطباعة:
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 scrollbar-thin">
                {loadingPurchases ? (
                  <div className="p-6 text-center text-gray-400 text-xs">جاري تحميل الفواتير...</div>
                ) : purchases.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-xs">لا توجد فواتير مشتريات مسجلة</div>
                ) : (
                  purchases.map((pur) => {
                    const items = JSON.parse(pur.items_json || '[]');
                    return (
                      <div
                        key={pur.id}
                        className="p-3 bg-[#161b22]/60 hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/30 rounded-xl flex justify-between items-center transition-all"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[#2D2424] dark:text-white">
                              {pur.supplier_name || 'مورد عام'}
                            </span>
                            {pur.invoice_ref && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/15 text-amber-400">
                                #{pur.invoice_ref}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-400">
                            {items.length} أصناف • إجمالي: {formatCurrency(pur.total_amount)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleImportPurchaseInvoice(pur)}
                          className="btn-atelier-primary py-1.5 px-3 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>استيراد الفاتورة للطباعة</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM LABEL FORM */}
          {activeTab === 'custom' && (
            <div className="atelier-card flex-1 p-5 flex flex-col justify-between overflow-y-auto">
              <form onSubmit={handleAddCustomItem} className="space-y-4 text-xs">
                <div className="font-bold text-sm text-[#2D2424] dark:text-amber-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>توليد ملصق حر فوري لأي منتج:</span>
                </div>

                <div>
                  <label className="block font-bold text-gray-500 mb-1">اسم الصنف أو العطر:</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="مثال: عطر مسك الختام الملكي 50 مل"
                    className="input-atelier w-full text-xs font-bold"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-500 mb-1">سعر البيع (د.ل):</label>
                    <input
                      type="number"
                      step="any"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      placeholder="0.00"
                      className="input-atelier w-full text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-500 mb-1">عدد الملصقات:</label>
                    <input
                      type="number"
                      min="1"
                      value={customQty}
                      onChange={(e) => setCustomQty(e.target.value)}
                      className="input-atelier w-full text-xs font-bold text-center"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-gray-500">رقم الباركود (Barcode):</label>
                    <button
                      type="button"
                      onClick={handleAutoGenerateCustomBarcode}
                      className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline font-bold"
                    >
                      ⚡ توليد كود تلقائي صالح
                    </button>
                  </div>
                  <input
                    type="text"
                    value={customBarcode}
                    onChange={(e) => setCustomBarcode(e.target.value)}
                    placeholder="اتركه فارغاً للتوليد التلقائي..."
                    className="input-atelier w-full text-xs font-mono"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full btn-atelier-primary py-2.5 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة إلى قائمة الطباعة</span>
                </button>
              </form>

              {/* Quick Preset Tips */}
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-gray-500 dark:text-slate-400 mt-4">
                💡 <span className="font-bold text-amber-700 dark:text-amber-300">ملاحظة:</span> يمكنك إدخال أي باركود تجاري أو تركه ليقوم النظام بتوليد باركود قياسي بدقة Code-128 يعمل مع كافة أجهزة قراءة الباركود.
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: PRINT QUEUE, HARDWARE & LIVE PREVIEW (6 Cols) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-6 flex flex-col gap-3 overflow-hidden">
          {/* Label Configuration & Printer Control Bar */}
          <div className="atelier-card p-3.5 space-y-3">
            {/* Top Row: Target Printer & Size Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-gray-500 mb-1">طابعة الملصقات المستهدفة:</label>
                {hardwareInfo.systemPrinters && hardwareInfo.systemPrinters.length > 0 ? (
                  <select
                    value={selectedPrinter}
                    onChange={(e) => setSelectedPrinter(e.target.value)}
                    className="input-atelier w-full text-xs font-bold"
                  >
                    {hardwareInfo.systemPrinters.map((p, idx) => (
                      <option key={idx} value={p.name}>
                        {p.name} {p.isDefault ? '(الافتراضية)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-1.5 bg-black/10 rounded text-[11px] font-bold text-amber-600 dark:text-amber-400">
                    {hardwareInfo.usbPrinters?.length > 0
                      ? `طابعة USB (${hardwareInfo.usbPrinters[0].name})`
                      : 'طابعة النظام الافتراضية'}
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-gray-500 mb-1">مقاس الملصق والورق:</label>
                <select
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                  className="input-atelier w-full text-xs font-bold"
                >
                  {LABEL_SIZES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Linux CUPS installation helper toggle */}
            {!hardwareInfo.cupsRunning && (
              <div className="text-[11px] flex justify-between items-center text-amber-600 dark:text-amber-400">
                <span>💡 لم يتم رصد خادم CUPS على لينكس</span>
                <button
                  type="button"
                  onClick={() => setShowCupsGuide(!showCupsGuide)}
                  className="underline font-bold cursor-pointer"
                >
                  {showCupsGuide ? 'إخفاء أمر التثبيت' : 'أمر تفعيل خادم الطباعة'}
                </button>
              </div>
            )}

            {showCupsGuide && (
              <div className="p-2.5 bg-black/40 border border-amber-500/30 rounded-xl space-y-1 text-[11px] animate-in fade-in">
                <div className="font-bold text-amber-400 flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>لتفعيل ربط الطابعة بنظام لينكس لمرة واحدة:</span>
                </div>
                <div className="p-1.5 bg-black/70 rounded font-mono text-[10px] text-emerald-400 select-all" dir="ltr">
                  sudo apt-get install -y cups cups-daemon printer-driver-all && sudo usermod -aG lp $USER && sudo systemctl enable --now cups
                </div>
              </div>
            )}
          </div>

          {/* Print Queue Items Adjuster */}
          <div className="atelier-card flex-1 p-3.5 flex flex-col justify-between overflow-hidden">
            <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-[#2D2424] dark:text-white">
                  أصناف أمر الطباعة ({selectedItems.length} صنف مختار • {totalLabelsCount} ملصق إجمالي)
                </h3>
              </div>

              <div className="flex items-center gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setAllSelections(true)}
                  className="btn-atelier-secondary py-0.5 px-2 text-[10px] font-bold cursor-pointer"
                >
                  تحديد الكل
                </button>
                <button
                  type="button"
                  onClick={() => setAllSelections(false)}
                  className="btn-atelier-secondary py-0.5 px-2 text-[10px] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={setAllCountsToSingle}
                  className="btn-atelier-secondary py-0.5 px-2 text-[10px] font-bold cursor-pointer"
                >
                  1 لكل صنف
                </button>
                {queueItems.length > 0 && (
                  <button
                    type="button"
                    onClick={clearQueue}
                    className="text-red-500 hover:underline text-[10px] font-bold ps-1 cursor-pointer"
                  >
                    تفريغ
                  </button>
                )}
              </div>
            </div>

            {/* Queue Table */}
            <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-thin max-h-48 pr-1">
              {queueItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400 flex flex-col items-center justify-center gap-2">
                  <QrCode className="w-8 h-8 text-gray-300 dark:text-slate-600" />
                  <span>قائمة الطباعة فارغة. اختر أصنافاً من المخزون أو فواتير المشتريات لإضافتها.</span>
                </div>
              ) : (
                queueItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all ${
                      item.selected
                        ? 'bg-white dark:bg-slate-800/90 border-amber-500/30'
                        : 'bg-black/5 dark:bg-slate-900 border-white/5 opacity-40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleItemSelection(item.id)}
                        className="rounded text-amber-500 focus:ring-0 cursor-pointer"
                      />
                      <div>
                        <div className="font-bold text-[#2D2424] dark:text-white truncate max-w-[160px]">
                          {item.name}
                        </div>
                        <div className="font-mono text-[10px] text-gray-400">{item.barcode}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(item.price)}
                      </span>

                      {/* Stepper */}
                      <div className="inline-flex items-center gap-1 bg-black/10 dark:bg-slate-700/80 p-0.5 rounded-lg border border-white/5">
                        <button
                          type="button"
                          onClick={() => updatePrintCount(item.id, -1)}
                          disabled={!item.selected}
                          className="w-5 h-5 flex items-center justify-center rounded bg-white dark:bg-slate-600 text-xs font-bold cursor-pointer disabled:opacity-30"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-bold text-amber-500 tabular-nums">
                          {item.selected ? item.printCount : 0}
                        </span>
                        <button
                          type="button"
                          onClick={() => updatePrintCount(item.id, 1)}
                          disabled={!item.selected}
                          className="w-5 h-5 flex items-center justify-center rounded bg-white dark:bg-slate-600 text-xs font-bold cursor-pointer disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeQueueItem(item.id)}
                        className="text-gray-400 hover:text-red-500 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Live Scannable Preview Box */}
            <div className="mt-3 pt-3 border-t border-white/10 flex flex-col gap-2">
              <div className="text-[11px] font-bold text-gray-500 flex justify-between items-center">
                <span>معاينة الملصق المباشرة (Live Label Preview):</span>
                <span className="text-amber-600 dark:text-amber-400 font-mono">
                  {LABEL_SIZES.find((s) => s.id === selectedSize)?.label}
                </span>
              </div>

              {/* Responsive Container for Single Card Sample */}
              <div className="p-3 bg-gray-200 dark:bg-slate-950/80 rounded-2xl flex items-center justify-center">
                {selectedItems.length > 0 ? (
                  <div
                    className="bg-white text-black p-2.5 rounded-xl border border-gray-300 shadow-md flex flex-col items-center justify-between text-center font-sans"
                    style={{ width: '180px', minHeight: '120px' }}
                  >
                    <div className="text-[9px] font-bold text-gray-600 leading-tight">الدفة للعطور الملكية</div>
                    <div className="text-[11px] font-black text-gray-900 truncate max-w-full my-0.5 leading-tight">
                      {selectedItems[0].name}
                    </div>

                    <div className="w-full my-1 flex justify-center">
                      <BarcodeSVG
                        value={selectedItems[0].barcode || 'AL-PERFUME'}
                        width={150}
                        height={45}
                        showText={true}
                      />
                    </div>

                    <div className="text-xs font-black text-emerald-800 tabular-nums leading-tight">
                      {formatCurrency(selectedItems[0].price)}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 py-4">أضف أصنافاً لمعاينة الملصق</div>
                )}
              </div>
            </div>

            {/* Action Print Buttons */}
            <div className="flex gap-2 pt-3 mt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => handleExecutePrint(true)}
                disabled={printing || totalLabelsCount === 0}
                className="flex-1 btn-atelier-primary py-2.5 text-xs flex items-center justify-center gap-2 font-bold cursor-pointer shadow-lg disabled:opacity-50"
              >
                <Zap className={`w-4 h-4 text-slate-950 ${printing ? 'animate-spin' : ''}`} />
                <span>
                  {printing
                    ? 'جاري الطباعة...'
                    : `⚡ طباعة فورية ومباشرة (${totalLabelsCount} ملصق)`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleExecutePrint(false)}
                disabled={printing || totalLabelsCount === 0}
                className="btn-atelier-secondary py-2.5 px-4 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                <span>حوار النظام</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodeStudioModule;
