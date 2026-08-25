/**
 * ============================================================================
 * BARCODE STUDIO MODULE (استوديو الباركود الشامل والطباعة الحرارية المتقدمة)
 * ============================================================================
 * Complete standalone barcode management & customizable thermal label studio.
 * Features:
 * - Dynamic adaptive layout fitting all screen heights (1366x768 up to 4K) without clipping
 * - Direct printing from Inventory, Purchases Invoices & Custom Generator
 * - Multi-size presets: 50x30mm, 40x20mm, 60x40mm, 80mm continuous, A4 sheet
 * - Customizable Visual Designer: Store Title, Product Name, Price, Barcode Digits
 * - Orientation / Direction control (0° Normal / 180° Inverted)
 * - Layout Presets (Classic Luxury, Price Top, Barcode Focus)
 * - 1:1 WYSIWYG Live Proportional Thermal Simulator with active item selection
 * - Zero-aliasing crisp integer Code-128 barcode generation and robust print engine
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
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  FileSpreadsheet
} from 'lucide-react';

const inventoryRepo = new InventoryRepository();
const purchasesRepo = new PurchasesRepository();

const LABEL_SIZES = [
  { id: '50x30', label: 'حراري قياسي (50×30 mm)', widthMm: 50, heightMm: 30, isThermal: true, aspect: '5 / 3' },
  { id: '40x20', label: 'حراري صغير (40×20 mm)', widthMm: 40, heightMm: 20, isThermal: true, aspect: '2 / 1' },
  { id: '60x40', label: 'حراري كبير (60×40 mm)', widthMm: 60, heightMm: 40, isThermal: true, aspect: '3 / 2' },
  { id: '80mm_roll', label: 'رول كاشير مستمر (80 mm)', widthMm: 80, heightMm: 40, isThermal: true, aspect: '2 / 1' },
  { id: 'a4_grid', label: 'ورق ملصقات مقسم A4 (24 ملصق)', widthMm: 210, heightMm: 297, isThermal: false, aspect: '210 / 297' }
];

const BarcodeStudioModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();
  const { products, loading: productsLoading, loadProducts } = useInventoryStore();

  // Active Source Tab: 'inventory' | 'purchases' | 'custom'
  const [activeTab, setActiveTab] = useState('inventory');

  // Print Queue Items: [ { id, name, barcode, price, cost, quantity, printCount, selected, source } ]
  const [queueItems, setQueueItems] = useState([]);
  const [selectedSize, setSelectedSize] = useState('50x30');
  const [previewItemId, setPreviewItemId] = useState(null);

  // Visual Customizer Controls State
  const [storeTitle, setStoreTitle] = useState('الدفة للعطور الملكية');
  const [showStoreTitle, setShowStoreTitle] = useState(true);
  const [showProductName, setShowProductName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcodeText, setShowBarcodeText] = useState(true);
  const [printDirection, setPrintDirection] = useState(0); // 0: Normal top-down, 1: Inverted 180
  const [barcodeScale, setBarcodeScale] = useState('medium'); // 'compact' | 'medium' | 'large'
  const [layoutStyle, setLayoutStyle] = useState('classic'); // 'classic' | 'price_top' | 'barcode_focus'
  const [showCustomizer, setShowCustomizer] = useState(false);

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

  // Load Products & Hardware on mount + listen for global data refresh
  useEffect(() => {
    loadProducts();
    loadHardwareInfo();
    loadRecentPurchases();

    const handleRefresh = () => {
      loadProducts();
      loadRecentPurchases();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
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

  // Add a single product from Inventory to Queue
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
      const newItem = {
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
      };
      if (!previewItemId) setPreviewItemId(newItem.id);
      return [...prev, newItem];
    });
    showSuccess(`تمت إضافة "${prod.name}" لقائمة الطباعة`);
  };

  // Add All Filtered Products to Queue
  const handleAddAllFilteredToQueue = () => {
    if (filteredProducts.length === 0) return;
    setQueueItems((prev) => {
      const next = [...prev];
      filteredProducts.forEach((prod) => {
        const existing = next.find(
          (item) => item.product_id === prod.id || (item.barcode && item.barcode === prod.barcode)
        );
        if (existing) {
          existing.selected = true;
        } else {
          next.push({
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
          });
        }
      });
      return next;
    });
    showSuccess(`تمت إضافة ${filteredProducts.length} صنف لقائمة الطباعة`);
  };

  // Import All Items from a Purchase Invoice
  const handleImportPurchaseInvoice = (invoice) => {
    try {
      const items = JSON.parse(invoice.items_json || '[]');
      if (items.length === 0) {
        showWarning('الفاتورة المحددة لا تحتوي على أي أصناف');
        return;
      }

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
    const newId = 'cust_' + Date.now();

    setQueueItems((prev) => [
      ...prev,
      {
        id: newId,
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

    setPreviewItemId(newId);
    setCustomName('');
    setCustomPrice('');
    setCustomBarcode('');
    setCustomQty(1);
    showSuccess(`تمت إضافة "${customName.trim()}" إلى قائمة الطباعة`);
  };

  // Update item print count with direct value or delta
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

  const setDirectPrintCount = (id, val) => {
    const num = Math.max(1, parseInt(val, 10) || 1);
    setQueueItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, printCount: num } : item))
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
    if (previewItemId === id) setPreviewItemId(null);
  };

  const clearQueue = () => {
    setQueueItems([]);
    setPreviewItemId(null);
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

  // Active preview item in Live Simulator
  const activePreviewItem = useMemo(() => {
    if (previewItemId) {
      const found = queueItems.find((it) => it.id === previewItemId);
      if (found) return found;
    }
    if (selectedItems.length > 0) return selectedItems[0];
    if (queueItems.length > 0) return queueItems[0];
    // Elegant fallback sample
    return {
      name: 'عطر مسك الختام الملكي فاخر',
      barcode: '6282010836068',
      price: 185.0
    };
  }, [queueItems, selectedItems, previewItemId]);

  // Barcode pixel height based on scale
  const barcodePixelHeight = useMemo(() => {
    if (barcodeScale === 'compact') return 34;
    if (barcodeScale === 'large') return 56;
    return 44; // medium
  }, [barcodeScale]);

  const currentSizeConfig = useMemo(() => {
    return LABEL_SIZES.find((s) => s.id === selectedSize) || LABEL_SIZES[0];
  }, [selectedSize]);

  // Core Print Executor with 100% bug-free clean HTML structure
  const handleExecutePrint = async (silent = false) => {
    if (selectedItems.length === 0) {
      showWarning('قائمة الطباعة فارغة أو لم يتم تحديد أي صنف');
      return;
    }

    setPrinting(true);

    try {
      const isThermal = currentSizeConfig.isThermal;
      const widthMm = currentSizeConfig.widthMm;
      const heightMm = currentSizeConfig.heightMm;

      // Build each label markup directly without mangling or splitting tags
      const labelsHtml = selectedItems
        .flatMap((item) => {
          const count = Math.max(1, item.printCount || 1);
          const svgCode = generateBarcodeSvgString(item.barcode, 180, barcodePixelHeight, showBarcodeText);

          return Array.from({ length: count }).map(() => {
            let innerContent = '';

            if (layoutStyle === 'price_top') {
              innerContent = `
                ${showPrice ? `<div class="price-badge">${formatCurrency(item.price)}</div>` : ''}
                ${showProductName ? `<div class="product-title">${item.name}</div>` : ''}
                <div class="barcode-area">${svgCode}</div>
                ${showStoreTitle ? `<div class="store-title">${storeTitle}</div>` : ''}
              `;
            } else if (layoutStyle === 'barcode_focus') {
              innerContent = `
                ${showProductName ? `<div class="product-title">${item.name}</div>` : ''}
                <div class="barcode-area">${svgCode}</div>
                ${showPrice ? `<div class="price-badge">${formatCurrency(item.price)}</div>` : ''}
              `;
            } else {
              // Classic layout
              innerContent = `
                ${showStoreTitle ? `<div class="store-title">${storeTitle}</div>` : ''}
                ${showProductName ? `<div class="product-title">${item.name}</div>` : ''}
                <div class="barcode-area">${svgCode}</div>
                ${showPrice ? `<div class="price-badge">${formatCurrency(item.price)}</div>` : ''}
              `;
            }

            if (isThermal) {
              return `<div class="label-wrapper"><div class="label-box">${innerContent}</div></div>`;
            }
            return `<div class="label-box">${innerContent}</div>`;
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
  ${isThermal ? labelsHtml : `<div class="grid-container">${labelsHtml}</div>`}
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
    <div className="h-full flex flex-col gap-3 min-h-0 overflow-hidden select-none animate-in fade-in duration-300">
      {/* Top Header Canopy Bar */}
      <div className="atelier-card p-3 shrink-0 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border border-amber-500/30 flex items-center justify-center text-amber-500 shadow-inner shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black text-[#2D2424] dark:text-white flex items-center gap-2">
              <span>استوديو الباركود والطباعة الحرارية المتقدم</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                XP-365B Ready (203 DPI)
              </span>
            </h1>
            <p className="text-[11px] text-[#5C524F] dark:text-slate-400">
              تصميم وتخصيص وطباعة ملصقات الباركود القياسية مع محاكاة بصرية متناسقة ودقيقة 100%
            </p>
          </div>
        </div>

        {/* Status & Stats Quick Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Counter */}
          <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-amber-500" />
            <span>
              {selectedItems.length} صنف • <strong className="text-emerald-600 dark:text-emerald-400">{totalLabelsCount}</strong> ملصق جاهز
            </span>
          </div>

          {/* Connected Printer Status */}
          {hardwareInfo.systemPrinters && hardwareInfo.systemPrinters.length > 0 ? (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="truncate max-w-[160px]" title={selectedPrinter || hardwareInfo.systemPrinters[0]?.name}>
                {selectedPrinter || hardwareInfo.systemPrinters[0]?.name}
              </span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5">
              <Usb className="w-3.5 h-3.5" />
              <span>طابعة النظام الافتراضية</span>
            </div>
          )}

          <button
            type="button"
            onClick={loadHardwareInfo}
            disabled={checkingHardware}
            className="btn-atelier-secondary py-1.5 px-2.5 text-xs font-bold flex items-center gap-1 cursor-pointer"
            title="إعادة فحص الطابعات ومنافذ الـ USB"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingHardware ? 'animate-spin' : ''}`} />
            <span>فحص</span>
          </button>
        </div>
      </div>

      {/* Main Dual Workspace: Left Column (Sources) | Right Column (Studio & Queue & Simulator) */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-3 min-h-0 overflow-hidden">
        {/* ========================================================================= */}
        {/* LEFT COLUMN: SOURCES EXPLORER (5 Cols on xl) */}
        {/* ========================================================================= */}
        <div className="xl:col-span-5 flex flex-col h-full min-h-0 atelier-card p-3 overflow-hidden gap-2.5">
          {/* Source Tabs Header */}
          <div className="flex gap-1.5 p-1 bg-gray-100 dark:bg-slate-800/80 rounded-xl border border-white/5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('inventory')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-900'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>المخزون ({products.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('purchases')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'purchases'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-900'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>المشتريات ({purchases.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('custom')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'custom'
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ملصق حر</span>
            </button>
          </div>

          {/* TAB 1: INVENTORY PRODUCTS LIST */}
          {activeTab === 'inventory' && (
            <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-hidden">
              {/* Search & Category Filter Bar */}
              <div className="flex gap-2 shrink-0">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="بحث باسم الصنف أو الباركود..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="input-atelier w-full ps-8 py-1.5 text-xs"
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="input-atelier py-1.5 text-xs font-bold w-28 shrink-0"
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
                {filteredProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAddAllFilteredToQueue}
                    className="btn-atelier-secondary py-1.5 px-2.5 text-[11px] font-bold shrink-0 cursor-pointer flex items-center gap-1"
                    title="إضافة كل الأصناف الظاهرة حالياً إلى قائمة الطباعة"
                  >
                    <Plus className="w-3 h-3 text-amber-500" />
                    <span>الكل</span>
                  </button>
                )}
              </div>

              {/* Products Table Scroll Container */}
              <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin border border-white/10 rounded-xl bg-black/5 dark:bg-slate-900/40">
                <table className="w-full text-right text-xs">
                  <thead className="bg-gray-100 dark:bg-slate-800/90 sticky top-0 font-bold text-gray-500 text-[11px] shadow-sm z-10">
                    <tr>
                      <th className="p-2">الصنف</th>
                      <th className="p-2">الباركود</th>
                      <th className="p-2 text-center">المتوفر</th>
                      <th className="p-2 text-center">السعر</th>
                      <th className="p-2 text-center w-14">إضافة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {productsLoading ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-400">
                          جاري تحميل المنتجات...
                        </td>
                      </tr>
                    ) : filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-gray-400 text-xs">
                          لا توجد أصناف مطابقة للبحث
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((p) => (
                        <tr key={p.id} className="hover:bg-amber-500/5 transition-colors">
                          <td className="p-2 font-bold text-[#2D2424] dark:text-white max-w-[130px] truncate" title={p.name}>
                            {p.name}
                          </td>
                          <td className="p-2 font-mono text-[10px] text-gray-500 max-w-[90px] truncate">
                            {p.barcode || 'تلقائي'}
                          </td>
                          <td className="p-2 text-center font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
                            {p.qty}
                          </td>
                          <td className="p-2 text-center font-bold text-amber-600 dark:text-amber-400 tabular-nums text-[11px]">
                            {formatCurrency(p.price)}
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleAddProductToQueue(p)}
                              className="p-1 rounded-lg bg-amber-500/10 hover:bg-amber-500 hover:text-white text-amber-600 dark:text-amber-400 transition-colors font-bold cursor-pointer inline-flex items-center justify-center"
                              title="إضافة إلى قائمة الطباعة"
                            >
                              <Plus className="w-3.5 h-3.5" />
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
            <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-hidden">
              <div className="text-[11px] text-gray-500 dark:text-slate-400 shrink-0">
                اختر أي فاتورة توريد لاستيراد كامل أصنافها وكمياتها فوراً للطباعة:
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 scrollbar-thin pr-1">
                {loadingPurchases ? (
                  <div className="p-8 text-center text-gray-400 text-xs">جاري تحميل الفواتير...</div>
                ) : purchases.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-xs">لا توجد فواتير مشتريات مسجلة</div>
                ) : (
                  purchases.map((pur) => {
                    let items = [];
                    try {
                      items = JSON.parse(pur.items_json || '[]');
                    } catch (e) {}

                    return (
                      <div
                        key={pur.id}
                        className="p-2.5 bg-gray-50 dark:bg-slate-900/60 hover:bg-amber-500/5 border border-amber-500/10 hover:border-amber-500/30 rounded-xl flex justify-between items-center transition-all"
                      >
                        <div className="space-y-0.5 overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-[#2D2424] dark:text-white truncate">
                              {pur.supplier_name || 'مورد عام'}
                            </span>
                            {pur.invoice_ref && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/15 text-amber-500">
                                #{pur.invoice_ref}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {items.length} أصناف • {formatCurrency(pur.total_amount)}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleImportPurchaseInvoice(pur)}
                          className="btn-atelier-primary py-1 px-2.5 text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Plus className="w-3 h-3" />
                          <span>استيراد</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM FREE-FORM LABEL FORM */}
          {activeTab === 'custom' && (
            <div className="flex-1 flex flex-col justify-between min-h-0 overflow-y-auto p-1">
              <form onSubmit={handleAddCustomItem} className="space-y-3 text-xs">
                <div className="font-bold text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>توليد ملصق مخصص فوري لأي منتج:</span>
                </div>

                <div>
                  <label className="block font-bold text-gray-500 text-[11px] mb-1">اسم الصنف أو العطر:</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="مثال: عطر مسك الختام الملكي 50 مل"
                    className="input-atelier w-full text-xs font-bold"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-gray-500 text-[11px] mb-1">سعر البيع (د.ل):</label>
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
                    <label className="block font-bold text-gray-500 text-[11px] mb-1">عدد الملصقات:</label>
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
                    <label className="font-bold text-gray-500 text-[11px]">رقم الباركود (Barcode):</label>
                    <button
                      type="button"
                      onClick={handleAutoGenerateCustomBarcode}
                      className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline font-bold"
                    >
                      ⚡ توليد كود صالح
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
                  className="w-full btn-atelier-primary py-2 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md mt-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة إلى قائمة الطباعة</span>
                </button>
              </form>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: DESIGN WORKBENCH, QUEUE & PROPORTIONAL SIMULATOR (7 Cols)   */}
        {/* ========================================================================= */}
        <div className="xl:col-span-7 flex flex-col h-full min-h-0 atelier-card p-3.5 overflow-hidden gap-3">
          {/* Top Workbench Controls Bar: Size, Printer, Customizer Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-white/10 shrink-0 text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[260px]">
              {/* Size Preset Selector */}
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">مقاس الملصق والورق:</label>
                <select
                  value={selectedSize}
                  onChange={(e) => setSelectedSize(e.target.value)}
                  className="input-atelier w-full py-1 text-xs font-bold"
                >
                  {LABEL_SIZES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Printer Selector */}
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-gray-400 mb-0.5">طابعة الملصقات:</label>
                {hardwareInfo.systemPrinters && hardwareInfo.systemPrinters.length > 0 ? (
                  <select
                    value={selectedPrinter}
                    onChange={(e) => setSelectedPrinter(e.target.value)}
                    className="input-atelier w-full py-1 text-xs font-bold"
                  >
                    {hardwareInfo.systemPrinters.map((p, idx) => (
                      <option key={idx} value={p.name}>
                        {p.name} {p.isDefault ? '(الافتراضية)' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-1 bg-black/10 rounded text-[10px] font-bold text-amber-600 truncate">
                    طابعة النظام الافتراضية
                  </div>
                )}
              </div>
            </div>

            {/* Customizer Toggle Button */}
            <button
              type="button"
              onClick={() => setShowCustomizer(!showCustomizer)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer self-end ${
                showCustomizer
                  ? 'bg-amber-500 text-black border-amber-500 shadow-md'
                  : 'btn-atelier-secondary'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>تخصيص التصميم</span>
              {showCustomizer ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Collapsible Design Customizer Panel */}
          {showCustomizer && (
            <div className="p-3 bg-black/10 dark:bg-slate-900/90 rounded-xl border border-amber-500/20 space-y-2.5 text-xs shrink-0 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showStoreCheck"
                  checked={showStoreTitle}
                  onChange={(e) => setShowStoreTitle(e.target.checked)}
                  className="rounded text-amber-500 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="showStoreCheck" className="font-bold text-gray-400 text-[11px] whitespace-nowrap">
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

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5">ترتيب العناصر:</label>
                  <select
                    value={layoutStyle}
                    onChange={(e) => setLayoutStyle(e.target.value)}
                    className="input-atelier w-full py-0.5 text-[11px] font-bold"
                  >
                    <option value="classic">كلاسيكي (متجر ➔ منتج ➔ باركود ➔ سعر)</option>
                    <option value="price_top">سعر بارز (سعر ➔ منتج ➔ باركود)</option>
                    <option value="barcode_focus">تركيز باركود (منتج ➔ باركود عريض)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5">ارتفاع الباركود:</label>
                  <select
                    value={barcodeScale}
                    onChange={(e) => setBarcodeScale(e.target.value)}
                    className="input-atelier w-full py-0.5 text-[11px] font-bold"
                  >
                    <option value="compact">مضغوط (Compact)</option>
                    <option value="medium">متوسط (Standard)</option>
                    <option value="large">كبير (Large)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 mb-0.5">اتجاه الورق:</label>
                  <select
                    value={printDirection}
                    onChange={(e) => setPrintDirection(Number(e.target.value))}
                    className="input-atelier w-full py-0.5 text-[11px] font-bold"
                  >
                    <option value={0}>طبيعي (0° Top-Down)</option>
                    <option value={1}>معكوس (180° Inverted)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Center: Split Queue & 1:1 Live Proportional Simulator */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0 overflow-hidden">
            {/* Left Sub-panel: Print Queue (7 cols on lg) */}
            <div className="lg:col-span-7 flex flex-col h-full min-h-0 border border-white/10 rounded-2xl p-2.5 bg-black/5 dark:bg-slate-900/30 overflow-hidden">
              {/* Queue Controls Header */}
              <div className="flex justify-between items-center pb-2 border-b border-white/10 shrink-0 text-xs">
                <span className="font-bold text-[#2D2424] dark:text-white text-[11px]">
                  قائمة الأصناف ({queueItems.length})
                </span>

                <div className="flex items-center gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setAllSelections(true)}
                    className="btn-atelier-secondary py-0.5 px-1.5 font-bold cursor-pointer"
                  >
                    تحديد الكل
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllSelections(false)}
                    className="btn-atelier-secondary py-0.5 px-1.5 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="button"
                    onClick={setAllCountsToSingle}
                    className="btn-atelier-secondary py-0.5 px-1.5 font-bold cursor-pointer"
                  >
                    1 لكل صنف
                  </button>
                  {queueItems.length > 0 && (
                    <button
                      type="button"
                      onClick={clearQueue}
                      className="text-red-500 hover:underline font-bold ps-1 cursor-pointer"
                    >
                      تفريغ
                    </button>
                  )}
                </div>
              </div>

              {/* Queue Items Scroll List */}
              <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 scrollbar-thin pr-1 pt-2">
                {queueItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center p-4 text-center text-xs text-gray-400 gap-1.5">
                    <QrCode className="w-8 h-8 text-gray-500 opacity-40" />
                    <span>القائمة فارغة. انقر على (+) من القائمة يميناً للإضافة</span>
                  </div>
                ) : (
                  queueItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setPreviewItemId(item.id)}
                      className={`p-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all cursor-pointer ${
                        previewItemId === item.id
                          ? 'ring-2 ring-amber-500/50 bg-amber-500/10 border-amber-500/40'
                          : item.selected
                          ? 'bg-white dark:bg-slate-800/90 border-amber-500/20'
                          : 'bg-black/5 dark:bg-slate-900 border-white/5 opacity-40'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleItemSelection(item.id);
                          }}
                          className="rounded text-amber-500 focus:ring-0 cursor-pointer shrink-0"
                        />
                        <div className="overflow-hidden">
                          <div className="font-bold text-[#2D2424] dark:text-white truncate max-w-[120px]" title={item.name}>
                            {item.name}
                          </div>
                          <div className="font-mono text-[10px] text-gray-400">{item.barcode}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums text-[11px]">
                          {formatCurrency(item.price)}
                        </span>

                        {/* Numeric Stepper Input */}
                        <div className="inline-flex items-center gap-0.5 bg-black/10 dark:bg-slate-700/80 p-0.5 rounded-lg">
                          <button
                            type="button"
                            onClick={() => updatePrintCount(item.id, -1)}
                            disabled={!item.selected}
                            className="w-5 h-5 flex items-center justify-center rounded bg-white dark:bg-slate-600 text-xs font-bold cursor-pointer disabled:opacity-30"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.selected ? item.printCount : 0}
                            onChange={(e) => setDirectPrintCount(item.id, e.target.value)}
                            disabled={!item.selected}
                            className="w-8 text-center font-bold text-amber-500 bg-transparent text-xs outline-none tabular-nums"
                          />
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
                          title="حذف من القائمة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Sub-panel: 1:1 Live Proportional Simulator (5 cols on lg) */}
            <div className="lg:col-span-5 flex flex-col h-full min-h-0 border border-white/10 rounded-2xl p-2.5 bg-black/10 dark:bg-slate-950/60 overflow-hidden justify-between">
              <div className="flex justify-between items-center pb-1.5 border-b border-white/10 text-[10px] font-bold text-gray-400 shrink-0">
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3 text-amber-500" />
                  <span>محاكاة 1:1 حقيقية</span>
                </span>
                <span className="text-amber-500 font-mono">
                  {currentSizeConfig.widthMm}×{currentSizeConfig.heightMm} mm
                </span>
              </div>

              {/* Physical Thermal Sticker Simulator Canvas */}
              <div className="flex-1 flex items-center justify-center p-2 min-h-0 overflow-hidden">
                <div
                  className="bg-white text-black p-2.5 rounded-lg border-2 border-dashed border-gray-300 shadow-2xl flex flex-col items-center justify-between text-center font-sans transition-all duration-300 transform select-none"
                  style={{
                    width: '100%',
                    maxWidth: '220px',
                    aspectRatio: currentSizeConfig.aspect,
                    maxHeight: '160px'
                  }}
                >
                  {layoutStyle === 'price_top' ? (
                    <>
                      {showPrice && (
                        <div className="text-xs font-black text-emerald-800 tabular-nums leading-tight">
                          {formatCurrency(activePreviewItem.price)}
                        </div>
                      )}
                      {showProductName && (
                        <div className="text-[10px] font-black text-gray-900 truncate max-w-full leading-tight">
                          {activePreviewItem.name}
                        </div>
                      )}
                      <div className="w-full my-0.5 flex justify-center overflow-hidden">
                        <BarcodeSVG
                          value={activePreviewItem.barcode || '6282010836068'}
                          width={160}
                          height={barcodePixelHeight}
                          showText={showBarcodeText}
                        />
                      </div>
                      {showStoreTitle && (
                        <div className="text-[8px] font-bold text-gray-700 leading-tight">
                          {storeTitle}
                        </div>
                      )}
                    </>
                  ) : layoutStyle === 'barcode_focus' ? (
                    <>
                      {showProductName && (
                        <div className="text-[10.5px] font-black text-gray-900 truncate max-w-full leading-tight">
                          {activePreviewItem.name}
                        </div>
                      )}
                      <div className="w-full my-0.5 flex justify-center overflow-hidden">
                        <BarcodeSVG
                          value={activePreviewItem.barcode || '6282010836068'}
                          width={170}
                          height={barcodePixelHeight + 4}
                          showText={showBarcodeText}
                        />
                      </div>
                      {showPrice && (
                        <div className="text-xs font-black text-emerald-800 tabular-nums leading-tight">
                          {formatCurrency(activePreviewItem.price)}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {showStoreTitle && (
                        <div className="text-[8.5px] font-extrabold text-gray-700 leading-tight">
                          {storeTitle}
                        </div>
                      )}
                      {showProductName && (
                        <div className="text-[10px] font-black text-gray-900 truncate max-w-full my-0.5 leading-tight">
                          {activePreviewItem.name}
                        </div>
                      )}
                      <div className="w-full my-0.5 flex justify-center overflow-hidden">
                        <BarcodeSVG
                          value={activePreviewItem.barcode || '6282010836068'}
                          width={160}
                          height={barcodePixelHeight}
                          showText={showBarcodeText}
                        />
                      </div>
                      {showPrice && (
                        <div className="text-xs font-black text-emerald-800 tabular-nums leading-tight">
                          {formatCurrency(activePreviewItem.price)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Active Item Indicator Note */}
              <div className="text-[9px] text-gray-400 text-center truncate px-1 shrink-0">
                معاينة: <strong className="text-amber-500">{activePreviewItem.name}</strong>
              </div>
            </div>
          </div>

          {/* Bottom Fixed Action Dock */}
          <div className="flex gap-2 pt-2 border-t border-white/10 shrink-0">
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
              title="فتح حوار الطباعة الافتراضي للنظام"
            >
              <Printer className="w-4 h-4" />
              <span>حوار النظام</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BarcodeStudioModule;
