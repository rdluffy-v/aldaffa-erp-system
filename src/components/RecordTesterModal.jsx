import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  FlaskConical, 
  Sparkles, 
  Search, 
  Check, 
  AlertCircle, 
  Droplet, 
  Package, 
  User, 
  FileText,
  DollarSign,
  Tag
} from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore.js';
import { TestersRepository } from '../database/repositories/TestersRepository.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { formatCurrency, safeParseFloat } from '../utils/helpers.js';

const testersRepo = new TestersRepository();
const inventoryRepo = new InventoryRepository();

export const RecordTesterModal = ({ isOpen, onClose, onSuccess, initialProduct = null }) => {
  const currentUser = useAuthStore((s) => s.currentUser);

  // Mode: 'ready_perfume' or 'compounded_mix'
  const [sourceType, setSourceType] = useState('ready_perfume');

  // Inventory lists
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Ready Perfume Form
  const [selectedProductId, setSelectedProductId] = useState('');
  const [readySearch, setReadySearch] = useState('');
  const [readyVolumeMl, setReadyVolumeMl] = useState(10);

  // Compounded Mix Form
  const [selectedOilId, setSelectedOilId] = useState('');
  const [oilSearch, setOilSearch] = useState('');
  const [oilVolumeMl, setOilVolumeMl] = useState(2);
  const [selectedAlcoholId, setSelectedAlcoholId] = useState('');
  const [alcoholSearch, setAlcoholSearch] = useState('');
  const [alcoholVolumeMl, setAlcoholVolumeMl] = useState(8);
  const [selectedBottleId, setSelectedBottleId] = useState('');
  const [bottleSearch, setBottleSearch] = useState('');
  const [bottleQty, setBottleQty] = useState(1);

  // Audit and Metadata
  const [reason, setReason] = useState('عرض وتجربة على الرف / رف التستر بالمحل');
  const [customReason, setCustomReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Load products when modal opens
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchInventory = async () => {
      setLoadingProducts(true);
      try {
        const rows = await inventoryRepo.findAll({}, 'name ASC');
        if (isMounted) {
          setProducts(rows || []);
          if (initialProduct && initialProduct.id) {
            setSelectedProductId(initialProduct.id);
            setReadySearch(initialProduct.name);
          }
        }
      } catch (err) {
        console.error('RecordTesterModal: Failed to load inventory:', err);
      } finally {
        if (isMounted) setLoadingProducts(false);
      }
    };

    fetchInventory();
    setErrorMsg('');
    setSuccessMsg('');

    return () => {
      isMounted = false;
    };
  }, [isOpen, initialProduct]);

  // Filter ready perfumes (either item_type === 'ready_perfume' or perfumes/sprays)
  const readyPerfumeOptions = useMemo(() => {
    return products.filter((p) => {
      const matchSearch = readySearch
        ? p.name.toLowerCase().includes(readySearch.toLowerCase()) ||
          (p.barcode && p.barcode.includes(readySearch))
        : true;
      return matchSearch;
    });
  }, [products, readySearch]);

  // Filter oils (item_type === 'raw_material' or category containing زيت or oil)
  const oilOptions = useMemo(() => {
    return products.filter((p) => {
      const isOil = (p.category && p.category.includes('زيت')) || p.unit === 'ml' || p.unit === 'gram';
      const matchSearch = oilSearch
        ? p.name.toLowerCase().includes(oilSearch.toLowerCase())
        : true;
      return matchSearch && isOil;
    });
  }, [products, oilSearch]);

  // Filter alcohol / solvents
  const alcoholOptions = useMemo(() => {
    return products.filter((p) => {
      const isAlc = (p.name && (p.name.includes('كحول') || p.name.includes('إيثانول') || p.name.includes('مذيب') || p.name.toLowerCase().includes('alcohol')));
      const matchSearch = alcoholSearch
        ? p.name.toLowerCase().includes(alcoholSearch.toLowerCase())
        : true;
      return matchSearch && (isAlc || p.unit === 'ml');
    });
  }, [products, alcoholSearch]);

  // Filter bottle / packaging from inventory
  const bottleOptions = useMemo(() => {
    return products.filter((p) => {
      const isBottle = p.item_type === 'empty_bottle' ||
        (p.category && (p.category.includes('علب') || p.category.includes('زجاج') || p.category.includes('تغليف') || p.category.includes('عبو'))) ||
        (p.name && (p.name.includes('زجاج') || p.name.includes('علبة') || p.name.includes('قارورة') || p.name.includes('غرشة') || p.name.includes('تستر') || p.name.includes('عينة') || p.name.includes('بخاخ')));
      const matchSearch = bottleSearch
        ? p.name.toLowerCase().includes(bottleSearch.toLowerCase()) ||
          (p.barcode && p.barcode.includes(bottleSearch))
        : true;
      return matchSearch && isBottle;
    });
  }, [products, bottleSearch]);

  // Auto-select first alcohol if available and not set
  useEffect(() => {
    if (alcoholOptions.length > 0 && !selectedAlcoholId) {
      const defaultAlc = alcoholOptions.find(p => p.name.includes('كحول') || p.name.includes('إيثانول')) || alcoholOptions[0];
      if (defaultAlc) setSelectedAlcoholId(defaultAlc.id);
    }
  }, [alcoholOptions, selectedAlcoholId]);

  // Selected product object
  const selectedProduct = useMemo(() => {
    return products.find((p) => p.id === selectedProductId) || null;
  }, [products, selectedProductId]);

  // Selected oil object
  const selectedOil = useMemo(() => {
    return products.find((p) => p.id === selectedOilId) || null;
  }, [products, selectedOilId]);

  // Selected alcohol object
  const selectedAlcohol = useMemo(() => {
    return products.find((p) => p.id === selectedAlcoholId) || null;
  }, [products, selectedAlcoholId]);

  // Selected bottle object
  const selectedBottle = useMemo(() => {
    return products.find((p) => p.id === selectedBottleId) || null;
  }, [products, selectedBottleId]);

  // Calculations for Ready Perfume
  const readyCalculations = useMemo(() => {
    if (!selectedProduct) return { costPerMl: 0, totalCost: 0, qtyToDeduct: 0 };
    const bottleCost = safeParseFloat(selectedProduct.cost);
    const bottleCapacity = safeParseFloat(selectedProduct.capacity);
    const isVolumeUnit = selectedProduct.unit === 'ml' || selectedProduct.unit === 'gram';

    let costPerMl = 0;
    let qtyToDeduct = 0;

    if (isVolumeUnit) {
      costPerMl = bottleCost;
      qtyToDeduct = readyVolumeMl;
    } else if (bottleCapacity > 0) {
      costPerMl = bottleCost / bottleCapacity;
      qtyToDeduct = readyVolumeMl / bottleCapacity;
    } else {
      costPerMl = bottleCost / 100;
      qtyToDeduct = readyVolumeMl / 100;
    }

    const totalCost = readyVolumeMl * costPerMl;
    return {
      costPerMl,
      totalCost,
      qtyToDeduct
    };
  }, [selectedProduct, readyVolumeMl]);

  // Calculations for Compounded Mix
  const compoundedCalculations = useMemo(() => {
    const oVol = safeParseFloat(oilVolumeMl);
    const aVol = safeParseFloat(alcoholVolumeMl);
    const totalVol = oVol + aVol;

    let oCostPerMl = 0;
    let aCostPerMl = 0;

    if (selectedOil) {
      const cap = safeParseFloat(selectedOil.capacity);
      oCostPerMl = (selectedOil.unit === 'ml' || selectedOil.unit === 'gram')
        ? safeParseFloat(selectedOil.cost)
        : (cap > 0 ? safeParseFloat(selectedOil.cost) / cap : safeParseFloat(selectedOil.cost));
    }

    if (selectedAlcohol) {
      const cap = safeParseFloat(selectedAlcohol.capacity);
      aCostPerMl = (selectedAlcohol.unit === 'ml' || selectedAlcohol.unit === 'gram')
        ? safeParseFloat(selectedAlcohol.cost)
        : (cap > 0 ? safeParseFloat(selectedAlcohol.cost) / cap : safeParseFloat(selectedAlcohol.cost));
    }

    const bUnitPrice = selectedBottle ? safeParseFloat(selectedBottle.cost) : 0;
    const bCount = selectedBottle ? safeParseFloat(bottleQty, 1) : 0;
    const bottleTotalCost = bUnitPrice * bCount;

    const oilTotalCost = oVol * oCostPerMl;
    const alcTotalCost = aVol * aCostPerMl;
    const totalCost = oilTotalCost + alcTotalCost + bottleTotalCost;
    const oilConcentration = totalVol > 0 ? ((oVol / totalVol) * 100) : 0;

    return {
      totalVol,
      oilTotalCost,
      alcTotalCost,
      bottleTotalCost,
      bUnitPrice,
      bCount,
      totalCost,
      oilConcentration,
      oCostPerMl,
      aCostPerMl
    };
  }, [selectedOil, oilVolumeMl, selectedAlcohol, alcoholVolumeMl, selectedBottle, bottleQty]);

  // Submit Handler
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const activeReason = reason === 'أخرى' ? (customReason.trim() || 'صرف تستر مخصص') : reason;
    const staffName = currentUser?.name || 'الكاشير';

    setSubmitting(true);
    try {
      if (sourceType === 'ready_perfume') {
        if (!selectedProductId) {
          throw new Error('يرجى اختيار العطر الجاهز');
        }
        if (readyVolumeMl <= 0) {
          throw new Error('يرجى تحديد حجم عينة صالح (أكبر من 0 مل)');
        }

        const res = await testersRepo.recordReadyPerfumeTester({
          productId: selectedProductId,
          sampleVolumeMl: readyVolumeMl,
          reason: activeReason,
          dispensedBy: staffName,
          notes
        });

        if (res.success) {
          setSuccessMsg(`✅ تم صرف تستر "${res.product_name}" بحجم ${res.sample_volume_ml} مل وتوثيق تكلفة ${formatCurrency(res.total_cost)}`);
          setTimeout(() => {
            if (onSuccess) onSuccess(res);
            onClose();
          }, 1200);
        }
      } else {
        // Compounded mix
        if (!selectedOilId && !selectedAlcoholId) {
          throw new Error('يرجى اختيار الزيت العطري أو الكحول');
        }
        if (compoundedCalculations.totalVol <= 0) {
          throw new Error('إجمالي حجم العينة يجب أن يكون أكبر من 0 مل');
        }

        const res = await testersRepo.recordCompoundedTester({
          fragranceOilId: selectedOilId,
          oilVolumeMl,
          alcoholId: selectedAlcoholId,
          alcoholVolumeMl,
          bottleId: selectedBottleId || null,
          bottleQty: selectedBottle ? bottleQty : 0,
          bottleCost: selectedBottle ? safeParseFloat(selectedBottle.cost) : 0,
          reason: activeReason,
          dispensedBy: staffName,
          notes
        });

        if (res.success) {
          const bottleText = res.bottle_name ? ` + عبوة ${res.bottle_name}` : '';
          setSuccessMsg(`✅ تم تركيب وصرف عينة ${res.sample_volume_ml} مل بنسبة تركيز ${res.oil_concentration}%${bottleText} وتوثيق تكلفة ${formatCurrency(res.total_cost)}`);
          setTimeout(() => {
            if (onSuccess) onSuccess(res);
            onClose();
          }, 1200);
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'حدث خطأ أثناء صرف التستر');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" dir="rtl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-slate-900 border border-gold/40 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 border-b border-gold/20 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>صرف عينة أو تستر جديد</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  استهلاك تسويقي داخلي
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                خصم ذري دقيق من المخزون بدون إحداث عجز وهمي في الجرد
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Type Toggle */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40">
          <div className="grid grid-cols-2 gap-2 bg-slate-800/80 p-1 rounded-xl border border-slate-700">
            <button
              type="button"
              onClick={() => setSourceType('ready_perfume')}
              className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                sourceType === 'ready_perfume'
                  ? 'bg-amber-500 text-slate-950 shadow-md scale-[1.01]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>عطر جاهز (سحب مل من الزجاجة)</span>
            </button>
            <button
              type="button"
              onClick={() => setSourceType('compounded_mix')}
              className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                sourceType === 'compounded_mix'
                  ? 'bg-purple-600 text-white shadow-md scale-[1.01]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FlaskConical className="w-4 h-4" />
              <span>تركيب وتخليط (زيت خام + كحول)</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-slate-200">
          {errorMsg && (
            <div className="p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Section 1: Ready Perfume Selection */}
          {sourceType === 'ready_perfume' && (
            <div className="space-y-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
              <div>
                <label className="block text-xs font-bold text-amber-300 mb-1 flex items-center gap-1">
                  <Search className="w-3.5 h-3.5" />
                  <span>اختر العطر الجاهز من المخزون:</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="ابحث بالاسم أو الباركود..."
                    value={readySearch}
                    onChange={(e) => setReadySearch(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  />
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="">-- اضغط لاختيار العطر ({readyPerfumeOptions.length}) --</option>
                    {readyPerfumeOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (المتوفر: {p.qty} {p.unit || 'قطعة'} | السعة: {p.capacity || 100} مل)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedProduct && (
                <div className="bg-slate-900/80 p-3 rounded-lg border border-amber-500/20 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400 block">الرصيد الحالي:</span>
                    <span className="font-bold text-amber-300 font-mono">{selectedProduct.qty} {selectedProduct.unit}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">سعة القارورة:</span>
                    <span className="font-bold text-slate-200 font-mono">{selectedProduct.capacity || 100} مل</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">تكلفة القارورة:</span>
                    <span className="font-bold text-slate-200 font-mono">{formatCurrency(selectedProduct.cost)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">تكلفة الملي (د.ل/مل):</span>
                    <span className="font-bold text-emerald-400 font-mono">{readyCalculations.costPerMl.toFixed(3)} د.ل</span>
                  </div>
                </div>
              )}

              {/* Sample Volume Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Droplet className="w-3.5 h-3.5 text-blue-400" />
                    <span>حجم عينة التستر المسحوبة (مل):</span>
                  </span>
                  <span className="text-amber-400 font-mono font-bold">{readyVolumeMl} مل</span>
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {[2, 5, 10, 15, 20, 30].map((ml) => (
                    <button
                      key={ml}
                      type="button"
                      onClick={() => setReadyVolumeMl(ml)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        readyVolumeMl === ml
                          ? 'bg-amber-500 text-slate-950 font-black'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {ml} مل
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={readyVolumeMl}
                  onChange={(e) => setReadyVolumeMl(safeParseFloat(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400 font-mono"
                  placeholder="حجم مخصص بالمل..."
                />
              </div>

              {/* Cost & Deduction Summary Card */}
              {selectedProduct && (
                <div className="p-3 bg-purple-950/30 border border-purple-500/30 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs text-purple-300 block">إجمالي تكلفة العينة الترويجية:</span>
                    <span className="text-lg font-black text-amber-400 font-mono">
                      {formatCurrency(readyCalculations.totalCost)}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-xs text-slate-400 block">الخصم من المخزون:</span>
                    <span className="text-xs font-mono font-bold text-slate-200">
                      -{readyCalculations.qtyToDeduct.toFixed(3)} {selectedProduct.unit || 'قارورة'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 2: Compounded Mix Selection */}
          {sourceType === 'compounded_mix' && (
            <div className="space-y-4 bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
              {/* Oil Selection */}
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/60 space-y-2">
                <label className="block text-xs font-bold text-amber-300 flex items-center gap-1">
                  <Droplet className="w-3.5 h-3.5 text-amber-400" />
                  <span>1. الزيت العطري الخام:</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedOilId}
                    onChange={(e) => setSelectedOilId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-400"
                  >
                    <option value="">-- اختر الزيت العطري ({oilOptions.length}) --</option>
                    {oilOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (المتوفر: {p.qty} {p.unit || 'جم'} | التكلفة: {p.cost} د.ل)
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={oilVolumeMl}
                      onChange={(e) => setOilVolumeMl(safeParseFloat(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-400 font-mono"
                      placeholder="مل الزيت..."
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">مل زيت</span>
                  </div>
                </div>
              </div>

              {/* Alcohol Selection */}
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/60 space-y-2">
                <label className="block text-xs font-bold text-blue-300 flex items-center gap-1">
                  <FlaskConical className="w-3.5 h-3.5 text-blue-400" />
                  <span>2. الكحول الإيثيلي المذيب:</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedAlcoholId}
                    onChange={(e) => setSelectedAlcoholId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-400"
                  >
                    <option value="">-- اختر الكحول المذيب ({alcoholOptions.length}) --</option>
                    {alcoholOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (المتوفر: {p.qty} {p.unit || 'مل'} | التكلفة: {p.cost} د.ل)
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={alcoholVolumeMl}
                      onChange={(e) => setAlcoholVolumeMl(safeParseFloat(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-400 font-mono"
                      placeholder="مل الكحول..."
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">مل كحول</span>
                  </div>
                </div>
              </div>

              {/* Bottle / Packaging Selection */}
              <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-700/60 space-y-2">
                <label className="block text-xs font-bold text-emerald-300 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Package className="w-3.5 h-3.5 text-emerald-400" />
                    <span>3. الزجاجة أو عبوة التستر (من المخزون):</span>
                  </span>
                  {selectedBottle && (
                    <span className="text-[11px] text-emerald-400 font-mono font-bold">
                      تكلفة العبوة: {formatCurrency(selectedBottle.cost)}
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={selectedBottleId}
                    onChange={(e) => setSelectedBottleId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-400"
                  >
                    <option value="">-- بدون خصم عبوة (أو استخدام قارورة مستعملة) --</option>
                    {bottleOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (المتوفر: {p.qty} | التكلفة: {formatCurrency(p.cost)})
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={!selectedBottleId}
                      value={bottleQty}
                      onChange={(e) => setBottleQty(safeParseFloat(e.target.value, 1))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-400 font-mono disabled:opacity-40"
                      placeholder="عدد العبوات..."
                    />
                    <span className="text-xs text-slate-400 whitespace-nowrap">عبوة</span>
                  </div>
                </div>
                {selectedBottle && (
                  <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800">
                    <span>الرصيد المتاح: <b className="text-white">{selectedBottle.qty}</b> {selectedBottle.unit || 'قطعة'}</span>
                    <span>إجمالي تكلفة العبوات: <b className="text-emerald-400 font-mono">{formatCurrency(compoundedCalculations.bottleTotalCost)}</b></span>
                  </div>
                )}
              </div>

              {/* Compounded Summary */}
              <div className="p-3 bg-slate-900/90 rounded-xl border border-purple-500/30 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-slate-400 block">حجم العينة الكلي:</span>
                  <span className="font-bold text-slate-100 font-mono text-sm">
                    {compoundedCalculations.totalVol} مل
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">تركيز الزيت:</span>
                  <span className="font-bold text-amber-400 font-mono text-sm">
                    {compoundedCalculations.oilConcentration}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">التكلفة المجمعة:</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    {formatCurrency(compoundedCalculations.totalCost)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Reason & Audit Details */}
          <div className="space-y-3 bg-slate-800/40 p-4 rounded-xl border border-slate-700/60">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-amber-400" />
                <span>سياق وسبب صرف العينة:</span>
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-gold"
              >
                <option value="عرض وتجربة على الرف / رف التستر بالمحل">رف التستر بالمحل (Counter Display Shelf)</option>
                <option value="عينة ترويجية لزبون مميز">عينة ترويجية لزبون مميز (Discovery VIP Sample)</option>
                <option value="فحص ومقارنة شذية ومعملية">فحص ومقارنة شذية ومعملية (Olfactory Inspection)</option>
                <option value="أخرى">سبب مخصص آخر...</option>
              </select>
            </div>

            {reason === 'أخرى' && (
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="اكتب سبب الصرف هنا بالتفصيل..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-gold"
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-purple-400" />
                  <span>الموظف المسئول عن الصرف:</span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={currentUser?.name || 'الكاشير'}
                  className="w-full bg-slate-900/60 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-300 font-mono cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ملاحظات إضافية (اختياري):</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثال: رقم طلب، تفاصيل الزبون..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-gold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-between items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 rounded-xl text-xs sm:text-sm font-black shadow-lg shadow-amber-500/20 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 hover:scale-105"
          >
            {submitting ? (
              <span>جارٍ الصرف والخصم الذري...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>تأكيد صرف التستر وخصم المخزون</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

export default RecordTesterModal;
