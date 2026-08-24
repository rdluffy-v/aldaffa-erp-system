/**
 * ============================================================================
 * BARCODE STUDIO MODULE (استوديو الباركود الشامل والطباعة الحرارية المتقدمة)
 * ============================================================================
 * Complete standalone barcode management & customizable thermal label studio.
 * Features:
 * - Direct printing from Inventory, Purchases Invoices & Custom Generator
 * - Multi-size presets: 50x30mm, 40x20mm, 60x40mm, 80mm continuous, A4 sheet
 * - Customizable Visual Designer: Store Title, Product Name, Price, Barcode Digits
 * - Orientation / Direction control (0° Normal / 180° Inverted)
 * - Layout Presets (Classic Luxury, Price Top, Barcode Focus)
 * - 1:1 WYSIWYG Live Thermal Simulator
 * - Zero-aliasing crisp integer Code-128 barcode generation
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { PurchasesRepository } from '../database/repositories/PurchasesRepository.js';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, generateValidBarcode } from '../utils/helpers.js';
import { BarcodeSVG, generateBarcodeSvgString } from '../utils/barcodeGenerator.jsx';
import useDebounce from '../hooks/useDebounce.js';
import {
  QrCode,
  Printer,
  Package,
  ShoppingBag,
  Plus,
  Search,
  RefreshCw,
  Usb,
  Terminal,
  Trash2,
  Zap,
  Sliders,
  Sparkles,
  RotateCw,
  Eye,
  Type,
  DollarSign,
  Barcode as BarcodeIcon,
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

  // Visual Customizer Controls State
  const [storeTitle, setStoreTitle] = useState('الدفة للعطور الملكية');
  const [showStoreTitle, setShowStoreTitle] = useState(true);
  const [showProductName, setShowProductName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcodeText, setShowBarcodeText] = useState(true);
  const [printDirection, setPrintDirection] = useState(0); // 0: Normal top-down, 1: Inverted 180
  const [barcodeScale, setBarcodeScale] = useState('medium'); // 'compact' | 'medium' | 'large'
  const [layoutStyle, setLayoutStyle] = useState('classic'); // 'classic' | 'price_top' | 'barcode_focus'
  const [showCustomizer, setShowCustomizer] = useState(true);

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
      const existing = prev.find(
        (item) => item.product_id === prod.id || (item.barcode && item.barcode === prod.barcode)
      );
      if (existing) {
        return prev.map((item) =>
          item.id === existing.id ? { ...item, printCount: (item.printCount || 0) + 1, selected: true } : item
        );
      }
      return [
        ...prev,
        {
          id: 'q_' + prod.id,
          product_id: prod.id,
          name: prod.name,
          barcode: prod.barcode || generateValidBarcode('628'),
          price: prod.price || 0,
          cost: prod.cost || 0,
          quantity: prod.qty || 0,
          printCount: 1,
          selected: true,
          source: 'inventory'
        }
      ];
    });
    showSuccess(`تمت إضافة "${prod.name}" لقائمة الطباعة`);
  };

  // Import All Items from a Purchase Invoice
  const handleImportPurchaseInvoice = (invoice) => {
    try {
      const items = JSON.parse(invoice.items_json || '[]');
      if (items.length === 0) {
        showWarning('الفاتورة المحددة لا تحتوي على أي أصناف');
        return;
      }

      let addedCount = 0;
      setQueueItems((prev) => {
        const next = [...prev];
        items.forEach((it, idx) => {
          const count = Math.max(1, Number(it.quantity) || 1);
          const barcode = it.barcode || generateValidBarcode('628');
          const itemId = `pur_${invoice.id}_${idx}`;
          const existing = next.find((p) => p.name === it.name || p.barcode === barcode);

          if (existing) {
            existing.printCount += count;
            existing.selected = true;
          } else {
            next.push({
              id: itemId,
              product_id: it.product_id || '',
              name: it.name,
              barcode: barcode,
              price: it.sell_price || (it.cost_per_unit || 0) * 1.35,
              cost: it.cost_per_unit || 0,
              quantity: count,
              printCount: count,
              selected: true,
              source: 'purchase'
            });
            addedCount++;
          }
        });
        return next;
      });

      showSuccess(`تم استيراد ${items.length} أصناف من الفاتورة بنجاح`);
    } catch (e) {
      showError('فشل استيراد أصناف الفاتورة: ' + e.message);
    }
  };

  // Add Custom Label to Queue
  const handleAddCustomItem = (e) => {
    e.preventDefault();
    if (!customName.trim()) {
      showWarning('يرجى إدخال اسم الصنف');
      return;
    }

    const priceNum = parseFloat(customPrice) || 0;
    const qtyNum = Math.max(1, parseInt(customQty, 10) || 1);
    const barcodeVal = customBarcode.trim() || generateValidBarcode('628');

    setQueueItems((prev) => [
      ...prev,
      {
        id: 'cust_' + Date.now(),
        product_id: '',
        name: customName.trim(),
        barcode: barcodeVal,
        price: priceNum,
        cost: 0,
        quantity: qtyNum,
        printCount: qtyNum,
        selected: true,
        source: 'custom'
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

  // Barcode pixel height based on scale
  const barcodePixelHeight = useMemo(() => {
    if (barcodeScale === 'compact') return 36;
    if (barcodeScale === 'large') return 60;
    return 48; // medium
  }, [barcodeScale]);

  // Core Print Executor
  const handleExecutePrint = async (silent = false) => {
    if (selectedItems.length === 0) {
      showWarning('قائمة الطباعة فارغة أو لم يتم تحديد أي صنف');
      return;
    }

    const currentSizeConfig = LABEL_SIZES.find((s) => s.id === selectedSize) || LABEL_SIZES[0];
    setPrinting(true);

    try {
      const isThermal = currentSizeConfig.isThermal;
      const widthMm = currentSizeConfig.widthMm;
      const heightMm = currentSizeConfig.heightMm;

      // Build pure standalone HTML with inline integer SVGs (zero CDN dependency)
      const labelsHtml = selectedItems
        .flatMap((item) => {
          const count = item.printCount || 1;
          const svgCode = generateBarcodeSvgString(item.barcode, 180, barcodePixelHeight, showBarcodeText);

          return Array.from({ length: count }).map(() => {
            if (layoutStyle === 'price_top') {
              return `
                <div class="label-box">
                  ${showPrice ? `<div class="price-badge">${formatCurrency(item.price)}</div>` : ''}
                  ${showProductName ? `<div class="product-title">${item.name}</div>` : ''}
                  <div class="barcode-area">${svgCode}</div>
                  ${showStoreTitle ? `<div class="store-title">${storeTitle}</div>` : ''}
                </div>
              `;
            }

            if (layoutStyle === 'barcode_focus') {
              return `
                <div class="label-box">
                  ${showProductName ? `<div class="product-title">${item.name}</div>` : ''}
                  <div class="barcode-area">${svgCode}</div>
                  ${showPrice ? `<div class="price-badge">${formatCurrency(item.price)}</div>` : ''}
                </div>
              `;
            }

            // Classic Default Layout
            return `
              <div class="label-box">
                ${showStoreTitle ? `<div class="store-title">${storeTitle}</div>` : ''}
                ${showProductName ? `<div class="product-title">${item.name}</div>` : ''}
                <div class="barcode-area">${svgCode}</div>
                ${showPrice ? `<div class="price-badge">${formatCurrency(item.price)}</div>` : ''}
              </div>
            `;
          });
        })
        .join('');

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
        font-size: 8.5px;
        font-weight: 800;
        color: #111111;
        line-height: 1.1;
      }
      .product-title {
        font-size: 11px;
        font-weight: 900;
        color: #000000;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: ${widthMm - 4}mm;
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
        width: ${widthMm - 6}mm !important;
        height: auto !important;
        max-height: 16mm;
      }
      .price-badge {
        font-size: 11.5px;
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
      .store-title { font-size: 8.5px; font-weight: bold; color: #333333; }
      .product-title { font-size: 10.5px; font-weight: 900; }
      .barcode-area { width: 100%; display: flex; justify-content: center; margin: 1mm 0; }
      .barcode-area svg { width: 44mm !important; height: auto !important; max-height: 14mm; }
      .price-badge { font-size: 11px; font-weight: 900; }
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
          heightMm,
          direction: printDirection
        });

        if (res && res.success) {
          showSuccess(
            `✅ تم إرسال ${totalLabelsCount} ملصق إلى الطابعة (${selectedPrinter || 'الافتراضية'}) بنجاح`
          );
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
    <div className="h-full flex flex-col gap-4 overflow-hidden animate-in fade-in duration-300">
      {/* Top Header Bar */}
      <div className="atelier-card p-4 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-inner">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-[#2D2424] dark:text-white flex items-center gap-2">
              <span>استوديو الباركود والطباعة الحرارية المتقدم</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                XP-365B Ready
              </span>
            </h1>
            <p className="text-xs text-[#5C524F] dark:text-slate-400">
              تصميم وتخصيص وطباعة ملصقات الباركود بدقة عتادية 203 DPI مع محاكاة بصرية مباشرة
            </p>
          </div>
        </div>

        {/* Hardware Status Quick Badge */}
        <div className="flex items-center gap-2">
          {hardwareInfo.systemPrinters && hardwareInfo.systemPrinters.length > 0 ? (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>الطابعة المتصلة: {selectedPrinter || hardwareInfo.systemPrinters[0]?.name}</span>
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

      {/* Main Dual Workspace: Left Column (Sources) | Right Column (Customizer & Queue) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: SOURCES (6 Cols) */}
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
                  {categories
                    .filter((c) => c !== 'all')
                    .map((cat) => (
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
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: CUSTOMIZER, QUEUE & LIVE SIMULATOR (6 Cols) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-6 flex flex-col gap-3 overflow-hidden">
          {/* Label Hardware, Size & Visual Controls Accordion */}
          <div className="atelier-card p-3.5 space-y-3">
            {/* Row 1: Target Printer & Size Selector */}
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

            {/* Visual Customizer Options Toggle Header */}
            <div className="pt-2 border-t border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500">
                <Sliders className="w-3.5 h-3.5" />
                <span>خيارات وتخصيص شكل الملصق الحراري:</span>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomizer(!showCustomizer)}
                className="text-[11px] text-gray-400 hover:text-white underline cursor-pointer"
              >
                {showCustomizer ? 'إخفاء الخيارات' : 'إظهار الخيارات'}
              </button>
            </div>

            {/* Visual Customizer Panel */}
            {showCustomizer && (
              <div className="p-3 bg-black/20 dark:bg-slate-900/60 rounded-xl border border-white/5 space-y-3 text-xs">
                {/* Store Title Input */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="showStoreCheck"
                    checked={showStoreTitle}
                    onChange={(e) => setShowStoreTitle(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="showStoreCheck" className="font-bold text-gray-400 whitespace-nowrap">
                    عنوان المتجر:
                  </label>
                  <input
                    type="text"
                    value={storeTitle}
                    onChange={(e) => setStoreTitle(e.target.value)}
                    disabled={!showStoreTitle}
                    className="input-atelier flex-1 py-1 text-xs font-bold disabled:opacity-30"
                  />
                </div>

                {/* Element Visibility Toggles */}
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showProductName}
                      onChange={(e) => setShowProductName(e.target.checked)}
                      className="rounded text-amber-500"
                    />
                    <span>اسم الصنف</span>
                  </label>

                  <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showPrice}
                      onChange={(e) => setShowPrice(e.target.checked)}
                      className="rounded text-amber-500"
                    />
                    <span>سعر البيع</span>
                  </label>

                  <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showBarcodeText}
                      onChange={(e) => setShowBarcodeText(e.target.checked)}
                      className="rounded text-amber-500"
                    />
                    <span>أرقام الباركود</span>
                  </label>
                </div>

                {/* Layout & Direction Selectors */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1">ترتيب العناصر:</label>
                    <select
                      value={layoutStyle}
                      onChange={(e) => setLayoutStyle(e.target.value)}
                      className="input-atelier w-full py-1 text-[11px] font-bold"
                    >
                      <option value="classic">كلاسيكي (متجر ➔ منتج ➔ باركود ➔ سعر)</option>
                      <option value="price_top">سعر بارز (سعر ➔ منتج ➔ باركود)</option>
                      <option value="barcode_focus">تركيز باركود (منتج ➔ باركود عريض)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1">ارتفاع الباركود:</label>
                    <select
                      value={barcodeScale}
                      onChange={(e) => setBarcodeScale(e.target.value)}
                      className="input-atelier w-full py-1 text-[11px] font-bold"
                    >
                      <option value="compact">مضغوط (Compact)</option>
                      <option value="medium">متوسط (Standard)</option>
                      <option value="large">كبير (Large)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 mb-1">اتجاه خروج الورق:</label>
                    <select
                      value={printDirection}
                      onChange={(e) => setPrintDirection(Number(e.target.value))}
                      className="input-atelier w-full py-1 text-[11px] font-bold"
                    >
                      <option value={0}>طبيعي (0° Top-Down)</option>
                      <option value={1}>معكوس (180° Inverted)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Print Queue Items Adjuster & Live Simulator */}
          <div className="atelier-card flex-1 p-3.5 flex flex-col justify-between overflow-hidden">
            {/* Queue Header */}
            <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-2">
              <h3 className="text-xs font-bold text-[#2D2424] dark:text-white">
                أصناف الطباعة ({selectedItems.length} صنف • {totalLabelsCount} ملصق)
              </h3>

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
            <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-thin max-h-36 pr-1">
              {queueItems.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400 flex flex-col items-center justify-center gap-1">
                  <QrCode className="w-6 h-6 text-gray-500" />
                  <span>قائمة الطباعة فارغة. اختر أصنافاً من المخزون لإضافتها.</span>
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
                        <div className="font-bold text-[#2D2424] dark:text-white truncate max-w-[150px]">
                          {item.name}
                        </div>
                        <div className="font-mono text-[10px] text-gray-400">{item.barcode}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(item.price)}
                      </span>

                      {/* Stepper */}
                      <div className="inline-flex items-center gap-1 bg-black/10 dark:bg-slate-700/80 p-0.5 rounded-lg">
                        <button
                          type="button"
                          onClick={() => updatePrintCount(item.id, -1)}
                          disabled={!item.selected}
                          className="w-5 h-5 flex items-center justify-center rounded bg-white dark:bg-slate-600 text-xs font-bold cursor-pointer disabled:opacity-30"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-bold text-amber-500 tabular-nums">
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

            {/* 1:1 Live Thermal Simulator Box */}
            <div className="mt-2 pt-2 border-t border-white/10 flex flex-col gap-1.5">
              <div className="text-[11px] font-bold text-gray-400 flex justify-between items-center">
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>محاكاة الملصق الحراري الحقيقي (1:1 Output Simulator):</span>
                </span>
                <span className="text-amber-500 font-mono text-[10px]">
                  {LABEL_SIZES.find((s) => s.id === selectedSize)?.label}
                </span>
              </div>

              {/* Physical Thermal Sticker Simulator Surface */}
              <div className="p-3 bg-gray-300 dark:bg-slate-950 rounded-2xl flex items-center justify-center">
                {selectedItems.length > 0 ? (
                  <div
                    className="bg-white text-black p-2.5 rounded-xl border border-gray-400 shadow-xl flex flex-col items-center justify-between text-center font-sans transition-all"
                    style={{
                      width: '200px',
                      minHeight: selectedSize === '40x20' ? '90px' : '125px'
                    }}
                  >
                    {layoutStyle === 'price_top' ? (
                      <>
                        {showPrice && (
                          <div className="text-xs font-black text-emerald-800 tabular-nums leading-tight">
                            {formatCurrency(selectedItems[0].price)}
                          </div>
                        )}
                        {showProductName && (
                          <div className="text-[10.5px] font-black text-gray-900 truncate max-w-full leading-tight">
                            {selectedItems[0].name}
                          </div>
                        )}
                        <div className="w-full my-1 flex justify-center">
                          <BarcodeSVG
                            value={selectedItems[0].barcode || '6282010836068'}
                            width={170}
                            height={barcodePixelHeight}
                            showText={showBarcodeText}
                          />
                        </div>
                        {showStoreTitle && (
                          <div className="text-[8.5px] font-bold text-gray-700 leading-tight">
                            {storeTitle}
                          </div>
                        )}
                      </>
                    ) : layoutStyle === 'barcode_focus' ? (
                      <>
                        {showProductName && (
                          <div className="text-[11px] font-black text-gray-900 truncate max-w-full leading-tight">
                            {selectedItems[0].name}
                          </div>
                        )}
                        <div className="w-full my-1 flex justify-center">
                          <BarcodeSVG
                            value={selectedItems[0].barcode || '6282010836068'}
                            width={175}
                            height={barcodePixelHeight + 6}
                            showText={showBarcodeText}
                          />
                        </div>
                        {showPrice && (
                          <div className="text-xs font-black text-emerald-800 tabular-nums leading-tight">
                            {formatCurrency(selectedItems[0].price)}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {showStoreTitle && (
                          <div className="text-[9px] font-extrabold text-gray-700 leading-tight">
                            {storeTitle}
                          </div>
                        )}
                        {showProductName && (
                          <div className="text-[11px] font-black text-gray-900 truncate max-w-full my-0.5 leading-tight">
                            {selectedItems[0].name}
                          </div>
                        )}
                        <div className="w-full my-1 flex justify-center">
                          <BarcodeSVG
                            value={selectedItems[0].barcode || '6282010836068'}
                            width={170}
                            height={barcodePixelHeight}
                            showText={showBarcodeText}
                          />
                        </div>
                        {showPrice && (
                          <div className="text-xs font-black text-emerald-800 tabular-nums leading-tight">
                            {formatCurrency(selectedItems[0].price)}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 py-4">أضف أصنافاً لمعاينة الملصق المباشر</div>
                )}
              </div>
            </div>

            {/* Action Print Buttons */}
            <div className="flex gap-2 pt-2.5 mt-1 border-t border-white/10">
              <button
                type="button"
                onClick={() => handleExecutePrint(true)}
                disabled={printing || totalLabelsCount === 0}
                className="flex-1 btn-atelier-primary py-2.5 text-xs flex items-center justify-center gap-2 font-bold cursor-pointer shadow-lg disabled:opacity-50"
              >
                <Zap className={`w-4 h-4 text-slate-950 ${printing ? 'animate-spin' : ''}`} />
                <span>
                  {printing
                    ? 'جاري إرسال الملصقات...'
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
