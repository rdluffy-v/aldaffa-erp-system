import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FlaskConical,
  Hourglass,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  Droplets,
  Package,
  Sparkles,
  RefreshCw,
  Search,
  Filter,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Info,
  FileText,
  Check,
  ChevronDown,
  Eye,
  SlidersHorizontal,
  Award,
  ShieldAlert,
  X,
  ExternalLink,
  Printer
} from 'lucide-react';
import { MacerationRepository } from '../database/repositories/MacerationRepository.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, safeParseFloat, generateId } from '../utils/helpers.js';
import Modal from '../components/ui/Modal.jsx';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';

const macerationRepo = new MacerationRepository();
const inventoryRepo = new InventoryRepository();

const BATCH_CATEGORIES = [
  'Signature Blend',
  'VIP Maceration',
  'Seasonal / موسمية',
  'Oriental Oud / شرقي',
  'French Floral / فرنسي',
  'Private Reserve / خاص'
];

const COMMON_BOTTLE_SIZES = [
  { size: 30, label: '30 مل' },
  { size: 50, label: '50 مل (الأكثر طلباً)' },
  { size: 100, label: '100 مل (كلاسيكي)' }
];

// Helper to determine perfume concentration class
const getConcentrationInfo = (oilRatioPercent) => {
  const p = Math.round(oilRatioPercent);
  if (p >= 25) return { label: 'Extrait de Parfum (معتق مركز فائق)', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' };
  if (p >= 18) return { label: 'Eau de Parfum (أو دو برفيوم فواح)', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' };
  if (p >= 10) return { label: 'Eau de Toilette (أو دو تواليت)', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };
  return { label: 'Eau de Cologne / مخفف', color: 'text-gray-400 bg-gray-500/10 border-gray-500/30' };
};

const MacerationLabModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const [batches, setBatches] = useState([]);
  const [metrics, setMetrics] = useState({
    volumeLiters: 0,
    capitalTied: 0,
    maturingThisWeek: 0,
    pendingApproval: 0,
    counts: { aging: 0, mature_pending_approval: 0, ready_for_sale: 0, bottled: 0, discarded: 0 }
  });
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatusTab, setSelectedStatusTab] = useState('all'); // all, aging, mature_pending_approval, ready_for_sale, bottled, discarded

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [formulaModalBatch, setFormulaModalBatch] = useState(null);
  const [qaModalBatch, setQaModalBatch] = useState(null);
  const [qaNotesInput, setQaNotesInput] = useState('');
  const [extendModalBatch, setExtendModalBatch] = useState(null);
  const [extendDaysInput, setExtendDaysInput] = useState(15);
  const [extendReasonInput, setExtendReasonInput] = useState('');
  const [graduateModalBatch, setGraduateModalBatch] = useState(null);
  const [discardModalBatch, setDiscardModalBatch] = useState(null);
  const [discardReasonInput, setDiscardReasonInput] = useState('');

  // New Batch Form State
  const [formData, setFormData] = useState({
    batch_number: '',
    blend_name: '',
    category: 'Signature Blend',
    start_date: new Date().toISOString().split('T')[0],
    duration_unit: 'days', // 'days' or 'months'
    duration_value: 45,
    target_volume_ml: 1000,
    notes: '',
    // Ingredients
    oil_id: '',
    oil_name: '',
    oil_volume_ml: 250,
    oil_cost_per_ml: 0.8,
    alcohol_id: '',
    alcohol_name: '',
    alcohol_volume_ml: 750,
    alcohol_cost_per_ml: 0.04,
    fixatives: [], // [{ id, name, volume_ml, cost_per_ml }]
    // Vessel
    vessel_id: '',
    vessel_name: 'وعاء تعتيق زجاجي داكن',
    vessel_cost: 15,
    vessel_absorbed: true
  });

  // Graduation Form State
  const [gradData, setGradData] = useState({
    actionType: 'bottling', // 'bottling' or 'bulk'
    actual_volume_ml: 1000,
    bottle_capacity: 50,
    bottle_item_id: '',
    bottle_cost: 5,
    box_item_id: '',
    box_cost: 2,
    retail_price: 120,
    wholesale_price: 95,
    product_name: '',
    notes: ''
  });

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedBatches, fetchedMetrics, fetchedInventory] = await Promise.all([
        macerationRepo.getAllBatches({
          status: selectedStatusTab,
          search: searchTerm
        }),
        macerationRepo.getMetrics(),
        inventoryRepo.findAll({}, 'name ASC')
      ]);

      setBatches(fetchedBatches);
      setMetrics(fetchedMetrics);
      setInventoryProducts(fetchedInventory);
    } catch (err) {
      showError('فشل تحميل بيانات معمل التعتيق: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedStatusTab, searchTerm, showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Create Modal & generate sequential batch code
  const handleOpenCreateModal = async () => {
    const nextCode = await macerationRepo.generateNextBatchNumber();
    
    // Auto-detect default oil & alcohol from inventory if available
    const rawOils = inventoryProducts.filter(p => p.item_type === 'raw_oil');
    const alcohols = inventoryProducts.filter(p => p.item_type === 'alcohol_fixative');

    const defaultOil = rawOils[0];
    const defaultAlc = alcohols[0];

    const oilCost = defaultOil ? (defaultOil.cost || 0.8) : 0.8;
    const alcCost = defaultAlc ? (defaultAlc.cost || 0.04) : 0.04;

    setFormData({
      batch_number: nextCode,
      blend_name: '',
      category: 'Signature Blend',
      start_date: new Date().toISOString().split('T')[0],
      duration_unit: 'days',
      duration_value: 45,
      target_volume_ml: 1000,
      notes: '',
      oil_id: defaultOil ? defaultOil.id : '',
      oil_name: defaultOil ? defaultOil.name : '',
      oil_volume_ml: 250,
      oil_cost_per_ml: oilCost,
      alcohol_id: defaultAlc ? defaultAlc.id : '',
      alcohol_name: defaultAlc ? defaultAlc.name : '',
      alcohol_volume_ml: 750,
      alcohol_cost_per_ml: alcCost,
      fixatives: [],
      vessel_id: '',
      vessel_name: 'وعاء تعتيق زجاجي كيميائي',
      vessel_cost: 0,
      vessel_absorbed: false
    });
    setCreateModalOpen(true);
  };

  // Calculations for Create Modal
  const createCalculations = useMemo(() => {
    const targetVol = Math.max(0.1, safeParseFloat(formData.target_volume_ml) || 1000);
    const oilVol = safeParseFloat(formData.oil_volume_ml);
    const oilCostPerMl = safeParseFloat(formData.oil_cost_per_ml);
    const oilTotal = oilVol * oilCostPerMl;

    const alcVol = safeParseFloat(formData.alcohol_volume_ml);
    const alcCostPerMl = safeParseFloat(formData.alcohol_cost_per_ml);
    const alcTotal = alcVol * alcCostPerMl;

    let fixativesTotal = 0;
    let fixativesVol = 0;
    (formData.fixatives || []).forEach(f => {
      const v = safeParseFloat(f.volume_ml);
      const c = safeParseFloat(f.cost_per_ml);
      fixativesVol += v;
      fixativesTotal += v * c;
    });

    const vesselCost = formData.vessel_absorbed ? safeParseFloat(formData.vessel_cost) : 0;
    const totalBatchCost = Math.round((oilTotal + alcTotal + fixativesTotal + vesselCost) * 100) / 100;
    const unitCostPerMl = Math.round((totalBatchCost / targetVol) * 10000) / 10000;

    const totalLiquidVol = oilVol + alcVol + fixativesVol;
    const oilConcentrationRatio = totalLiquidVol > 0 ? (oilVol / totalLiquidVol) * 100 : 0;

    // Calculate Ready Date
    const days = formData.duration_unit === 'months' ? (parseInt(formData.duration_value, 10) || 1) * 30 : (parseInt(formData.duration_value, 10) || 30);
    const startMs = new Date(formData.start_date).getTime();
    const readyMs = startMs + (days * 24 * 60 * 60 * 1000);
    const readyDateStr = new Date(readyMs).toISOString().split('T')[0];

    return {
      oilTotal,
      alcTotal,
      fixativesTotal,
      totalBatchCost,
      unitCostPerMl,
      oilConcentrationRatio,
      totalLiquidVol,
      readyDateStr,
      days
    };
  }, [formData]);

  // Handle Save New Batch
  const handleSaveNewBatch = async () => {
    if (!formData.blend_name.trim()) {
      showWarning('يرجى إدخال اسم العطر أو الخلطة المعتقة');
      return;
    }

    if (safeParseFloat(formData.oil_volume_ml) <= 0) {
      showWarning('يرجى تحديد حجم الزيت العطري المستخدم');
      return;
    }

    try {
      const ingredients = [
        {
          ingredient_type: 'oil',
          raw_material_id: formData.oil_id || null,
          ingredient_name: formData.oil_name || 'زيت عطري خام',
          volume_ml: safeParseFloat(formData.oil_volume_ml),
          cost_per_ml: safeParseFloat(formData.oil_cost_per_ml)
        },
        {
          ingredient_type: 'alcohol',
          raw_material_id: formData.alcohol_id || null,
          ingredient_name: formData.alcohol_name || 'كحول إيثانول طبي',
          volume_ml: safeParseFloat(formData.alcohol_volume_ml),
          cost_per_ml: safeParseFloat(formData.alcohol_cost_per_ml)
        }
      ];

      (formData.fixatives || []).forEach(f => {
        if (safeParseFloat(f.volume_ml) > 0) {
          ingredients.push({
            ingredient_type: 'fixative',
            raw_material_id: f.raw_material_id || null,
            ingredient_name: f.name || 'مثبت عطري',
            volume_ml: safeParseFloat(f.volume_ml),
            cost_per_ml: safeParseFloat(f.cost_per_ml)
          });
        }
      });

      await macerationRepo.createBatch(
        {
          batch_number: formData.batch_number,
          blend_name: formData.blend_name,
          category: formData.category,
          start_date: formData.start_date,
          maceration_days: createCalculations.days,
          target_volume_ml: safeParseFloat(formData.target_volume_ml),
          vessel_item_id: formData.vessel_id || null,
          vessel_cost: safeParseFloat(formData.vessel_cost),
          vessel_absorbed: formData.vessel_absorbed,
          notes: formData.notes
        },
        ingredients
      );

      showSuccess(`تم بدء تعتيق الدفعة ${formData.batch_number} بنجاح وحجز المواد الخام!`);
      setCreateModalOpen(false);
      loadData();
    } catch (err) {
      showError('فشل إنشاء دفعة التعتيق: ' + err.message);
    }
  };

  // Open QA Modal
  const handleOpenQaModal = (batch) => {
    setQaModalBatch(batch);
    setQaNotesInput(batch.qa_notes || '');
  };

  // Save QA Notes
  const handleSaveQaNotes = async () => {
    if (!qaModalBatch) return;
    try {
      await macerationRepo.updateQANotes(qaModalBatch.id, qaNotesInput);
      showSuccess('تم حفظ تقرير الجودة والملاحظات بنجاح');
      setQaModalBatch(null);
      loadData();
    } catch (err) {
      showError('فشل حفظ الملاحظات: ' + err.message);
    }
  };

  // Open Extend Modal
  const handleOpenExtendModal = (batch) => {
    setExtendModalBatch(batch);
    setExtendDaysInput(15);
    setExtendReasonInput('');
  };

  // Save Extension
  const handleSaveExtension = async () => {
    if (!extendModalBatch) return;
    try {
      await macerationRepo.extendMaceration(extendModalBatch.id, extendDaysInput, extendReasonInput);
      showSuccess(`تم تمديد تعتيق الدفعة ${extendModalBatch.batch_number} بمقدار ${extendDaysInput} يوماً`);
      setExtendModalBatch(null);
      loadData();
    } catch (err) {
      showError('فشل تمديد التعتيق: ' + err.message);
    }
  };

  // Open Graduation Modal
  const handleOpenGraduateModal = (batch) => {
    setGraduateModalBatch(batch);
    // Find default empty bottle if any
    const bottles = inventoryProducts.filter(p => p.item_type === 'empty_bottle');
    const defaultBottle = bottles[0];

    const vol = batch.actual_volume_ml || batch.target_volume_ml;
    const estBottles = Math.floor(vol / 50);
    const bottleCost = defaultBottle ? (defaultBottle.cost || 5) : 5;
    const unitPerfumeCost = (50 * batch.unit_cost_per_ml) + bottleCost + 2;

    setGradData({
      actionType: 'bottling',
      actual_volume_ml: vol,
      bottle_capacity: 50,
      bottle_item_id: defaultBottle ? defaultBottle.id : '',
      bottle_cost: bottleCost,
      box_item_id: '',
      box_cost: 2,
      retail_price: Math.round(unitPerfumeCost * 1.6),
      wholesale_price: Math.round(unitPerfumeCost * 1.3),
      product_name: `${batch.blend_name} 50مل (معتق)`,
      notes: ''
    });
  };

  // Execute Graduation
  const handleExecuteGraduation = async () => {
    if (!graduateModalBatch) return;

    try {
      await macerationRepo.graduateBatch(graduateModalBatch.id, {
        actionType: gradData.actionType,
        actual_volume_ml: safeParseFloat(gradData.actual_volume_ml),
        bottle_capacity: safeParseFloat(gradData.bottle_capacity),
        bottle_item_id: gradData.bottle_item_id || null,
        bottle_cost: safeParseFloat(gradData.bottle_cost),
        box_item_id: gradData.box_item_id || null,
        box_cost: safeParseFloat(gradData.box_cost),
        retail_price: safeParseFloat(gradData.retail_price),
        wholesale_price: safeParseFloat(gradData.wholesale_price),
        product_name: gradData.product_name,
        retail_price_per_ml: safeParseFloat(gradData.retail_price),
        wholesale_price_per_ml: safeParseFloat(gradData.wholesale_price),
        notes: gradData.notes
      });

      showSuccess(`تم تخريج واعتماد الدفعة ${graduateModalBatch.batch_number} وإدراجها في المخزون بنجاح!`);
      setGraduateModalBatch(null);
      loadData();
    } catch (err) {
      showError('فشل تخريج الدفعة: ' + err.message);
    }
  };

  // Discard Batch Execution
  const handleExecuteDiscard = async () => {
    if (!discardModalBatch) return;
    try {
      await macerationRepo.discardBatch(discardModalBatch.id, discardReasonInput);
      showWarning(`تم استبعاد الدفعة ${discardModalBatch.batch_number} وتوثيق السبب`);
      setDiscardModalBatch(null);
      loadData();
    } catch (err) {
      showError('فشل استبعاد الدفعة: ' + err.message);
    }
  };

  // Open Formula Sheet Preview
  const handleOpenFormulaSheet = async (batch) => {
    try {
      const full = await macerationRepo.getBatchById(batch.id);
      setFormulaModalBatch(full);
    } catch (err) {
      showError('تعذر جلب تفاصيل التركيبة: ' + err.message);
    }
  };

  // Status Tab config
  const statusTabs = [
    { id: 'all', label: 'الكل', count: batches.length },
    { id: 'aging', label: 'قيد التعتيق ⏳', count: metrics.counts.aging },
    { id: 'mature_pending_approval', label: 'جاهز للاعتماد 🔔', count: metrics.counts.mature_pending_approval },
    { id: 'ready_for_sale', label: 'سائب جاهز ✅', count: metrics.counts.ready_for_sale },
    { id: 'bottled', label: 'معبأ في قوارير 🏺', count: metrics.counts.bottled },
    { id: 'discarded', label: 'مستبعد ❌', count: metrics.counts.discarded }
  ];

  return (
    <div className="h-full flex flex-col gap-4 overflow-y-auto pr-1" dir="rtl">
      {/* Top Header & Quick Actions */}
      <div className="glass-card p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 border border-amber-500/20 bg-gradient-to-r from-amber-500/5 via-transparent to-emerald-500/5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
            <Hourglass className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              معمل تعتيق العطور (عطور المعتق)
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                WIP Maturation Lab
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              إدارة الخلطات قيد التعتيق، احتساب التكلفة التناسبية، وحجز المواد الخام حتى النضج
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-[#D4A359] via-[#FBDF9D] to-[#9EBAA4] hover:shadow-[0_4px_16px_rgba(212,163,89,0.35)] active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة دفعة معتقة جديدة</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="glass-card p-4 rounded-xl border border-amber-500/20 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">سعة العطور قيد التعتيق</p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
              {metrics.volumeLiters} <span className="text-xs font-normal">لتر</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">({metrics.counts.aging} دفعات قيد النضج)</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
            <Droplets className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-emerald-500/20 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">رأس المال المقيد في التعتيق</p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
              {formatCurrency(metrics.capitalTied)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">أصول قيد التشغيل (WIP Asset)</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-blue-500/20 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">دفعات تنضج هذا الأسبوع</p>
            <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
              {metrics.maturingThisWeek} <span className="text-xs font-normal">دفعة</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">خلال الـ 7 أيام القادمة</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-card p-4 rounded-xl border border-rose-500/20 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">بانتظار الاعتماد المخبري</p>
            <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
              {metrics.pendingApproval} <span className="text-xs font-normal">دفعة</span>
            </p>
            <p className="text-[11px] text-rose-500/80 mt-0.5">جاهزة للفحص والتخريج</p>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {statusTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedStatusTab(tab.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                selectedStatusTab === tab.id
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-white/40 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
              <span className={`mr-1.5 px-1.5 py-0.2 rounded-full text-[10px] ${
                selectedStatusTab === tab.id ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="بحث باسم العطر أو كود الدفعة..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-9 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Batches Grid / List */}
      {batches.length === 0 ? (
        <div className="glass-card p-12 rounded-2xl text-center border border-dashed border-slate-300 dark:border-slate-800">
          <FlaskConical className="w-12 h-12 mx-auto text-amber-500/40 mb-3" />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">لا توجد دفعات تعتيق مسجلة</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">
            ابدأ بتسجيل دفعة عطرية معتقة جديدة لتتبع فترات النضج واحتساب التكاليف ونسب التركيز بدقة
          </p>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer transition-colors"
          >
            + إضافة دفعة الآن
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {batches.map((batch) => {
            const isMature = batch.status === 'mature_pending_approval' || (batch.status === 'aging' && batch.days_remaining <= 0);
            const isBottled = batch.status === 'bottled';
            const isReadySale = batch.status === 'ready_for_sale';
            const isDiscarded = batch.status === 'discarded';

            return (
              <div
                key={batch.id}
                className={`glass-card p-4 rounded-2xl border transition-all hover:shadow-lg flex flex-col justify-between ${
                  isMature
                    ? 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.15)] bg-gradient-to-b from-amber-500/5 to-transparent'
                    : isBottled || isReadySale
                    ? 'border-emerald-500/40 bg-gradient-to-b from-emerald-500/5 to-transparent'
                    : isDiscarded
                    ? 'border-rose-500/30 opacity-75'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                          {batch.batch_number}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500">
                          {batch.category}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1">
                        {batch.blend_name}
                      </h3>
                    </div>

                    {/* Status Badge */}
                    <div>
                      {isMature && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500 text-slate-950 animate-bounce">
                          <AlertTriangle className="w-3 h-3" />
                          جاهز للاعتماد
                        </span>
                      )}
                      {batch.status === 'aging' && !isMature && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                          <Hourglass className="w-3 h-3" />
                          قيد التعتيق
                        </span>
                      )}
                      {isBottled && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          معبأ بالقوارير
                        </span>
                      )}
                      {isReadySale && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          <CheckCircle2 className="w-3 h-3" />
                          عطر سائب جاهز
                        </span>
                      )}
                      {isDiscarded && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
                          <X className="w-3 h-3" />
                          مستبعد
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar (Maturation Timeline) */}
                  <div className="my-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        التقدم في التعتيق:
                      </span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {batch.progress}%
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          batch.progress >= 100
                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                            : 'bg-gradient-to-r from-amber-500 to-amber-400'
                        }`}
                        style={{ width: `${Math.min(100, batch.progress)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                      <span>البدء: {batch.start_date}</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        {batch.days_remaining > 0 ? `باقي ${batch.days_remaining} يوم` : (isMature ? 'أتم التعتيق ✅' : 'منتهي')}
                      </span>
                      <span>الجاهزية: {batch.ready_date}</span>
                    </div>
                  </div>

                  {/* Batch Metric Numbers */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 dark:border-slate-800 text-center">
                    <div>
                      <p className="text-[10px] text-slate-400">الحصيلة (مل)</p>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        {batch.actual_volume_ml || batch.target_volume_ml} مل
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">إجمالي التكلفة</p>
                      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(batch.total_batch_cost)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">تكلفة الملي الواحد</p>
                      <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                        {batch.unit_cost_per_ml.toFixed(3)}
                      </p>
                    </div>
                  </div>

                  {/* QA notes preview if present */}
                  {batch.qa_notes && (
                    <div className="mt-2.5 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-700 dark:text-emerald-300">
                      <span className="font-bold">ملاحظات الجودة: </span>
                      {batch.qa_notes}
                    </div>
                  )}
                </div>

                {/* Quick Action Buttons */}
                <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenFormulaSheet(batch)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
                      title="عرض التركيبة والتكلفة"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>التركيبة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenQaModal(batch)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
                      title="فحص الجودة والملاحظات"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>الفحص</span>
                    </button>

                    {(batch.status === 'aging' || batch.status === 'mature_pending_approval') && (
                      <button
                        type="button"
                        onClick={() => handleOpenExtendModal(batch)}
                        className="p-1.5 rounded-lg border border-blue-500/30 hover:bg-blue-500/10 text-blue-500 text-xs flex items-center gap-1 cursor-pointer"
                        title="تمديد فترة التعتيق"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>تمديد</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {(batch.status === 'aging' || batch.status === 'mature_pending_approval') && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenGraduateModal(batch)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer shadow-sm"
                          title="اعتماد وتخريج الدفعة للبيع"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>اعتماد وتخريج</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setDiscardModalBatch(batch);
                            setDiscardReasonInput('');
                          }}
                          className="p-1.5 rounded-lg border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 text-xs cursor-pointer"
                          title="استبعاد الدفعة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
       * MODAL 1: ADD NEW AGING BATCH
       * =======================================================================*/}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="إضافة دفعة عطرية معتقة جديدة (Maceration Batch)"
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1" dir="rtl">
          {/* Section 1: Batch Header */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-amber-500" />
              1. هوية الدفعة وجدول التعتيق
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  رقم الدفعة (تلقائي)
                </label>
                <input
                  type="text"
                  readOnly
                  value={formData.batch_number}
                  className="w-full px-2.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-400"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  اسم العطر / الخلطة *
                </label>
                <input
                  type="text"
                  placeholder="مثلاً: قوتشي فلورا معتق خاص"
                  value={formData.blend_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, blend_name: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  التصنيف / الوسم
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  {BATCH_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  الحصيلة المستهدفة (مل) *
                </label>
                <input
                  type="number"
                  min="10"
                  step="10"
                  value={formData.target_volume_ml}
                  onChange={(e) => setFormData(prev => ({ ...prev, target_volume_ml: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  تاريخ البدء
                </label>
                <input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  مدة التعتيق
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="number"
                    min="1"
                    value={formData.duration_value}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration_value: e.target.value }))}
                    className="w-2/3 px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                  <select
                    value={formData.duration_unit}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration_unit: e.target.value }))}
                    className="w-1/3 px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    <option value="days">أيام</option>
                    <option value="months">أشهر</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                  تاريخ الجاهزية المتوقع (محسوب آلياً)
                </label>
                <div className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-between">
                  <span>{createCalculations.readyDateStr}</span>
                  <span className="text-[10px]">({createCalculations.days} يوم)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Ingredient Breakdown & Dynamic Cost Engine */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5 text-emerald-500" />
              2. تركيبة المكونات ومحرك احتساب التكلفة الفوري
            </h4>

            {/* Fragrance Oil Row */}
            <div className="p-3 rounded-lg bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 mb-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  الزيت العطري الخام (Fragrance Oil)
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(createCalculations.oilTotal)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">اختيار الزيت من المخزون</label>
                  <select
                    value={formData.oil_id}
                    onChange={(e) => {
                      const sel = inventoryProducts.find(p => p.id === e.target.value);
                      setFormData(prev => ({
                        ...prev,
                        oil_id: e.target.value,
                        oil_name: sel ? sel.name : prev.oil_name,
                        oil_cost_per_ml: sel ? (sel.cost || prev.oil_cost_per_ml) : prev.oil_cost_per_ml
                      }));
                    }}
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- زيت مخصص (إدخال يدوي) --</option>
                    {inventoryProducts
                      .filter(p => p.item_type === 'raw_oil' || p.category?.includes('زيت'))
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.name} (رصيد: {p.qty} مل)</option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">الكمية المستخدمة (مل)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.oil_volume_ml}
                    onChange={(e) => setFormData(prev => ({ ...prev, oil_volume_ml: e.target.value }))}
                    className="w-full px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">تكلفة الملي الواحد (د.ل)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.oil_cost_per_ml}
                    onChange={(e) => setFormData(prev => ({ ...prev, oil_cost_per_ml: e.target.value }))}
                    className="w-full px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Alcohol / Solvent Row */}
            <div className="p-3 rounded-lg bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 mb-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  كحول الإيثانول الطبي والمذيب (Solvent / Alcohol)
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(createCalculations.alcTotal)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">اختيار الكحول من المخزون</label>
                  <select
                    value={formData.alcohol_id}
                    onChange={(e) => {
                      const sel = inventoryProducts.find(p => p.id === e.target.value);
                      setFormData(prev => ({
                        ...prev,
                        alcohol_id: e.target.value,
                        alcohol_name: sel ? sel.name : prev.alcohol_name,
                        alcohol_cost_per_ml: sel ? (sel.cost || prev.alcohol_cost_per_ml) : prev.alcohol_cost_per_ml
                      }));
                    }}
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  >
                    <option value="">-- كحول مخصص (إدخال يدوي) --</option>
                    {inventoryProducts
                      .filter(p => p.item_type === 'alcohol_fixative' || p.category?.includes('كحول'))
                      .map(p => (
                        <option key={p.id} value={p.id}>{p.name} (رصيد: {p.qty})</option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">الكمية المستخدمة (مل)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.alcohol_volume_ml}
                    onChange={(e) => setFormData(prev => ({ ...prev, alcohol_volume_ml: e.target.value }))}
                    className="w-full px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">تكلفة الملي الواحد (د.ل)</label>
                  <input
                    type="number"
                    step="0.005"
                    min="0"
                    value={formData.alcohol_cost_per_ml}
                    onChange={(e) => setFormData(prev => ({ ...prev, alcohol_cost_per_ml: e.target.value }))}
                    className="w-full px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Fixatives & Modifiers Dynamic Rows */}
            <div className="p-3 rounded-lg bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 mb-2.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  المثبتات والمعدلات (Fixatives & Modifiers)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({
                      ...prev,
                      fixatives: [
                        ...(prev.fixatives || []),
                        { id: generateId('fix_'), name: 'DPG / مثبت عطري', volume_ml: 10, cost_per_ml: 0.1 }
                      ]
                    }));
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>إضافة مثبت</span>
                </button>
              </div>

              {(formData.fixatives || []).length === 0 ? (
                <p className="text-[11px] text-slate-400 italic">لا توجد مثبتات إضافية (اختياري)</p>
              ) : (
                <div className="space-y-2">
                  {formData.fixatives.map((fix, idx) => (
                    <div key={fix.id || idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <input
                          type="text"
                          placeholder="اسم المادة (DPG, ISO E Super...)"
                          value={fix.name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData(prev => {
                              const list = [...prev.fixatives];
                              list[idx].name = val;
                              return { ...prev, fixatives: list };
                            });
                          }}
                          className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          placeholder="الحجم (مل)"
                          value={fix.volume_ml}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData(prev => {
                              const list = [...prev.fixatives];
                              list[idx].volume_ml = val;
                              return { ...prev, fixatives: list };
                            });
                          }}
                          className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="تكلفة الملي"
                          value={fix.cost_per_ml}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData(prev => {
                              const list = [...prev.fixatives];
                              list[idx].cost_per_ml = val;
                              return { ...prev, fixatives: list };
                            });
                          }}
                          className="w-full px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>
                      <div className="col-span-1 text-left">
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              fixatives: prev.fixatives.filter((_, i) => i !== idx)
                            }));
                          }}
                          className="text-rose-500 hover:text-rose-600 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vessel / Aging Container */}
            <div className="p-3 rounded-lg bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  وعاء التعتيق / القارورة الكيميائية (Aging Vessel)
                </span>
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.vessel_absorbed}
                    onChange={(e) => setFormData(prev => ({ ...prev, vessel_absorbed: e.target.checked }))}
                    className="rounded text-amber-500 focus:ring-amber-500"
                  />
                  <span>امتصاص تكلفة الوعاء في الدفعة (مستهلك)</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <input
                    type="text"
                    placeholder="اسم أو وصف الوعاء"
                    value={formData.vessel_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, vessel_name: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="تكلفة الوعاء (د.ل)"
                    value={formData.vessel_cost}
                    onChange={(e) => setFormData(prev => ({ ...prev, vessel_cost: e.target.value }))}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Live Financial Metric Summary Card */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 via-emerald-500/10 to-transparent border border-amber-500/30">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              المؤشرات الحسابية التلقائية للدفعة
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="p-2.5 rounded-lg bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500">إجمالي تكلفة الدفعة</span>
                <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatCurrency(createCalculations.totalBatchCost)}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500">تكلفة الملي الواحد المتوقعة</span>
                <p className="text-lg font-black text-amber-600 dark:text-amber-400 mt-0.5">
                  {createCalculations.unitCostPerMl.toFixed(3)} <span className="text-xs font-normal">د.ل/مل</span>
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <span className="text-[11px] text-slate-500">نسبة تركيز الزيت</span>
                <p className="text-lg font-black text-purple-600 dark:text-purple-400 mt-0.5">
                  %{createCalculations.oilConcentrationRatio.toFixed(1)}
                </p>
                <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full border ${getConcentrationInfo(createCalculations.oilConcentrationRatio).color}`}>
                  {getConcentrationInfo(createCalculations.oilConcentrationRatio).label}
                </span>
              </div>
            </div>

            <div className="mt-3 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span>
                سيتم خصم كميات الزيت الخام والكحول والوعاء مباشرة من رصيد المخزون، وتسجيل الدفعة كـ WIP معزولة عن الكاشير.
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSaveNewBatch}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 hover:shadow-lg cursor-pointer"
            >
              حفظ وبدء التعتيق الآن ⏳
            </button>
          </div>
        </div>
      </Modal>

      {/* =========================================================================
       * MODAL 2: GRADUATE & BOTTLE / BULK BATCH
       * =======================================================================*/}
      <Modal
        isOpen={Boolean(graduateModalBatch)}
        onClose={() => setGraduateModalBatch(null)}
        title={`اعتماد وتخريج الدفعة المعتقة: ${graduateModalBatch?.batch_number}`}
        maxWidth="max-w-2xl"
      >
        {graduateModalBatch && (
          <div className="space-y-4" dir="rtl">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
              <p className="font-bold text-amber-700 dark:text-amber-400">
                العطر: {graduateModalBatch.blend_name}
              </p>
              <p className="text-slate-500 mt-0.5">
                إجمالي تكلفة تحضير الدفعة: {formatCurrency(graduateModalBatch.total_batch_cost)} (الحصيلة المخططة: {graduateModalBatch.target_volume_ml} مل)
              </p>
            </div>

            {/* Evaporation Loss Input */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                الحصيلة الفعلية الصافية بعد التعتيق (مل) — احتساب فاقد التبخر:
              </label>
              <input
                type="number"
                step="1"
                min="10"
                value={gradData.actual_volume_ml}
                onChange={(e) => setGradData(prev => ({ ...prev, actual_volume_ml: e.target.value }))}
                className="w-full px-3 py-2 text-sm font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                <span>الفاقد بالتبخر: {Math.max(0, graduateModalBatch.target_volume_ml - safeParseFloat(gradData.actual_volume_ml))} مل</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  التكلفة الحقيقية بعد التبخر: {(graduateModalBatch.total_batch_cost / Math.max(0.1, safeParseFloat(gradData.actual_volume_ml))).toFixed(3)} د.ل/مل
                </span>
              </div>
            </div>

            {/* Output Mode Selection */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                مسار التخريج والبيع في المنظومة:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGradData(prev => ({ ...prev, actionType: 'bottling' }))}
                  className={`p-3 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                    gradData.actionType === 'bottling'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500'
                  }`}
                >
                  🏺 تعبئة في زجاجات فاخرة (Bottled Perfume)
                </button>
                <button
                  type="button"
                  onClick={() => setGradData(prev => ({ ...prev, actionType: 'bulk' }))}
                  className={`p-3 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                    gradData.actionType === 'bulk'
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500'
                  }`}
                >
                  🧪 عطر معتق سائب بالمل (Bulk Perfume)
                </button>
              </div>
            </div>

            {/* Bottling Details */}
            {gradData.actionType === 'bottling' ? (
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      سعة القارورة (مل)
                    </label>
                    <select
                      value={gradData.bottle_capacity}
                      onChange={(e) => setGradData(prev => ({ ...prev, bottle_capacity: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      {COMMON_BOTTLE_SIZES.map(s => (
                        <option key={s.size} value={s.size}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      عدد القوارير المحققة (آلياً)
                    </label>
                    <div className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {Math.floor(safeParseFloat(gradData.actual_volume_ml) / safeParseFloat(gradData.bottle_capacity))} زجاجة
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      الزجاجة الفارغة من المخزون
                    </label>
                    <select
                      value={gradData.bottle_item_id}
                      onChange={(e) => {
                        const sel = inventoryProducts.find(p => p.id === e.target.value);
                        setGradData(prev => ({
                          ...prev,
                          bottle_item_id: e.target.value,
                          bottle_cost: sel ? sel.cost : prev.bottle_cost
                        }));
                      }}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="">-- بدون خصم زجاجات --</option>
                      {inventoryProducts.filter(p => p.item_type === 'empty_bottle').map(p => (
                        <option key={p.id} value={p.id}>{p.name} (رصيد: {p.qty})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      العلبة الكرتونية الفاخرة
                    </label>
                    <select
                      value={gradData.box_item_id}
                      onChange={(e) => {
                        const sel = inventoryProducts.find(p => p.id === e.target.value);
                        setGradData(prev => ({
                          ...prev,
                          box_item_id: e.target.value,
                          box_cost: sel ? sel.cost : prev.box_cost
                        }));
                      }}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="">-- بدون علبة --</option>
                      {inventoryProducts.filter(p => p.category?.includes('علب') || p.item_type === 'accessory').map(p => (
                        <option key={p.id} value={p.id}>{p.name} (رصيد: {p.qty})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      سعر بيع القارورة قطاعي (د.ل)
                    </label>
                    <input
                      type="number"
                      value={gradData.retail_price}
                      onChange={(e) => setGradData(prev => ({ ...prev, retail_price: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      سعر الجملة (د.ل)
                    </label>
                    <input
                      type="number"
                      value={gradData.wholesale_price}
                      onChange={(e) => setGradData(prev => ({ ...prev, wholesale_price: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Bulk Option Details */
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      سعر البيع للملي الواحد قطاعي (د.ل)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={gradData.retail_price}
                      onChange={(e) => setGradData(prev => ({ ...prev, retail_price: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300 block mb-1">
                      سعر الجملة للملي (د.ل)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={gradData.wholesale_price}
                      onChange={(e) => setGradData(prev => ({ ...prev, wholesale_price: e.target.value }))}
                      className="w-full px-2.5 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setGraduateModalBatch(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleExecuteGraduation}
                className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold"
              >
                تأكيد التخريج وإضافة للمخزون ✅
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* =========================================================================
       * MODAL 3: QA NOTES & SENSORY EVALUATION
       * =======================================================================*/}
      <Modal
        isOpen={Boolean(qaModalBatch)}
        onClose={() => setQaModalBatch(null)}
        title="تقرير فحص الجودة والملاحظات المخبرية (QA Inspection)"
        maxWidth="max-w-md"
      >
        {qaModalBatch && (
          <div className="space-y-3" dir="rtl">
            <p className="text-xs text-slate-500">
              دفعة: <span className="font-bold text-slate-800 dark:text-slate-200">{qaModalBatch.batch_number} - {qaModalBatch.blend_name}</span>
            </p>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                الملاحظات الحسية والمخبرية (الرائحة، النقاء والصفاء، الفلترة):
              </label>
              <textarea
                rows="4"
                placeholder="سجل درجة النقاء، تطور النوتات العطرية، الثبات والفوحان، أو ملاحظات الفلترة..."
                value={qaNotesInput}
                onChange={(e) => setQaNotesInput(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setQaModalBatch(null)}
                className="px-4 py-1.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                إغلاق
              </button>
              <button
                type="button"
                onClick={handleSaveQaNotes}
                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-amber-500 text-slate-950 font-bold"
              >
                حفظ التقرير
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* =========================================================================
       * MODAL 4: EXTEND MACERATION
       * =======================================================================*/}
      <Modal
        isOpen={Boolean(extendModalBatch)}
        onClose={() => setExtendModalBatch(null)}
        title="تمديد فترة التعتيق المخبري"
        maxWidth="max-w-md"
      >
        {extendModalBatch && (
          <div className="space-y-3" dir="rtl">
            <p className="text-xs text-slate-500">
              تمديد مدة النضج للدفعة <span className="font-bold text-slate-800 dark:text-slate-200">{extendModalBatch.batch_number}</span>
            </p>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                عدد الأيام الإضافية:
              </label>
              <div className="flex gap-2 mb-2">
                {[7, 15, 30, 45].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setExtendDaysInput(d)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      extendDaysInput === d
                        ? 'border-blue-500 bg-blue-500/10 text-blue-500'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    +{d} يوم
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="1"
                value={extendDaysInput}
                onChange={(e) => setExtendDaysInput(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                سبب التمديد (اختياري):
              </label>
              <input
                type="text"
                placeholder="مثلاً: الحاجة لمزيد من الثبات واندماج النوتات الخشبية"
                value={extendReasonInput}
                onChange={(e) => setExtendReasonInput(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setExtendModalBatch(null)}
                className="px-4 py-1.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveExtension}
                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-blue-500 text-white font-bold"
              >
                تأكيد التمديد
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* =========================================================================
       * MODAL 5: FORMULA SHEET PREVIEW
       * =======================================================================*/}
      <Modal
        isOpen={Boolean(formulaModalBatch)}
        onClose={() => setFormulaModalBatch(null)}
        title={`بطاقة التركيبة والتكاليف: ${formulaModalBatch?.batch_number}`}
        maxWidth="max-w-2xl"
      >
        {formulaModalBatch && (
          <div className="space-y-4" dir="rtl">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{formulaModalBatch.blend_name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">كود الدفعة: {formulaModalBatch.batch_number} | التصنيف: {formulaModalBatch.category}</p>
              </div>
              <div className="text-left">
                <span className="text-xs text-slate-400 block">إجمالي التكلفة</span>
                <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(formulaModalBatch.total_batch_cost)}</span>
              </div>
            </div>

            {/* Ingredients Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">جدول المواد والمكونات:</h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-right">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500">
                    <tr>
                      <th className="p-2.5">المكون</th>
                      <th className="p-2.5">النوع</th>
                      <th className="p-2.5">الكمية (مل)</th>
                      <th className="p-2.5">تكلفة الملي</th>
                      <th className="p-2.5">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(formulaModalBatch.ingredients || []).map((ing, i) => (
                      <tr key={ing.id || i}>
                        <td className="p-2.5 font-bold">{ing.ingredient_name}</td>
                        <td className="p-2.5 text-slate-400">{ing.ingredient_type}</td>
                        <td className="p-2.5">{ing.volume_ml} مل</td>
                        <td className="p-2.5">{ing.cost_per_ml.toFixed(3)} د.ل</td>
                        <td className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(ing.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Dates & Vessel summary */}
            <div className="grid grid-cols-3 gap-2.5 text-xs text-slate-500">
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] text-slate-400">تاريخ البدء</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{formulaModalBatch.start_date}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] text-slate-400">تاريخ الجاهزية</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{formulaModalBatch.ready_date}</span>
              </div>
              <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] text-slate-400">تكلفة الملي النهائي</span>
                <span className="font-bold text-amber-600">{formulaModalBatch.unit_cost_per_ml.toFixed(3)} د.ل</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setFormulaModalBatch(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* =========================================================================
       * MODAL 6: DISCARD CONFIRMATION
       * =======================================================================*/}
      <Modal
        isOpen={Boolean(discardModalBatch)}
        onClose={() => setDiscardModalBatch(null)}
        title="استبعاد الدفعة من التعتيق (Discard Batch)"
        maxWidth="max-w-md"
      >
        {discardModalBatch && (
          <div className="space-y-3" dir="rtl">
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>
                هل أنت متأكد من استبعاد الدفعة {discardModalBatch.batch_number}؟ سيتم اعتبارها فاقداً مخبرياً وتوثيق السبب.
              </span>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                سبب الاستبعاد:
              </label>
              <input
                type="text"
                placeholder="مثلاً: رائحة زنخة / تغير لون / عكارة لا تزول بالترشيح"
                value={discardReasonInput}
                onChange={(e) => setDiscardReasonInput(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDiscardModalBatch(null)}
                className="px-4 py-1.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleExecuteDiscard}
                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold"
              >
                تأكيد الاستبعاد ❌
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MacerationLabModule;
