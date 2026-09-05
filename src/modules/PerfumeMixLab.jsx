import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FlaskConical,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Package,
  Layers,
  Droplets,
  DollarSign,
  Barcode,
  Eye,
  SlidersHorizontal,
  RefreshCw,
  Search,
  BookOpen,
  HelpCircle,
  Clock,
  MapPin,
  Tag,
  Compass,
  ShieldCheck
} from 'lucide-react';
import { db } from '../database/connection.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { NotesRepository } from '../database/repositories/NotesRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, generateId, safeParseFloat, generateValidBarcode } from '../utils/helpers.js';
import Modal from '../components/ui/Modal.jsx';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';

const inventoryRepo = new InventoryRepository();
const notesRepo = new NotesRepository();

const DEFAULT_WIZARD_DATA = {
  // Step 1: Bottles & Batch
  bottleId: '',
  bottleName: 'زجاجة عطر قياسية',
  bottleCapacity: 50, // ml
  batchQuantity: 1, // number of bottles
  bottleCost: 5,
  batchNumber: '', // optional
  storageLocation: '', // optional
  // Step 2: Fragrance Oils (supports multi-oil blends)
  oils: [
    { oilId: '', oilName: '', mlPerBottle: 15, percentage: 30, unitCostPerMl: 0.8 }
  ],
  purityGrade: 'درجة أولى نقية 100%', // optional
  // Step 3: Alcohol & Solvents
  alcoholId: '',
  alcoholName: 'كحول إيثيلي نقي 96%',
  alcoholMlPerBottle: 35,
  alcoholCostPerMl: 0.05,
  fixativeType: 'مثبت عطري نقي', // optional
  // Step 4: Perfume Identity & Pricing
  perfumeName: '',
  category: 'عطور مركبة / خلطات الدفة',
  retailPrice: 90,
  wholesalePrice: 75,
  barcode: '', // optional (auto-generated on wizard open)
  macerationPeriod: 'أسبوعين إلى شهر', // optional
  scentNotes: 'افتتاحية منعشة، قلب زهري فواح، قاعدة خشبية عنبرية ثقيلة', // optional
  notes: ''
};

const PerfumeMixLabModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const [products, setProducts] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); // 1 to 5
  const [wizardData, setWizardData] = useState(DEFAULT_WIZARD_DATA);
  const [activeFormulaPreview, setActiveFormulaPreview] = useState(null);
  const [pendingDeleteFormula, setPendingDeleteFormula] = useState(null);

  // Load Inventory Products & Saved Formulas
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const allProducts = await inventoryRepo.findAll({}, 'name ASC');
      setProducts(allProducts);

      const savedFormulas = await notesRepo.getByTitlePrefix('FORMULA:');
      setFormulas(savedFormulas);
    } catch (err) {
      showError('فشل تحميل بيانات المختبر: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived categorized products for selection
  const bottleProducts = useMemo(() => {
    return products.filter((p) => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return (
        cat.includes('زجاج') ||
        cat.includes('علب') ||
        name.includes('زجاج') ||
        name.includes('قارورة') ||
        name.includes('غرشة') ||
        p.unit === 'bottle'
      );
    });
  }, [products]);

  const oilProducts = useMemo(() => {
    return products.filter((p) => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return (
        cat.includes('زيت') ||
        cat.includes('خام') ||
        cat.includes('عطر') ||
        name.includes('زيت') ||
        name.includes('مسك') ||
        name.includes('عود') ||
        name.includes('صندل') ||
        name.includes('عنبر') ||
        p.unit === 'ml' ||
        p.unit === 'تولة'
      );
    });
  }, [products]);

  const alcoholProducts = useMemo(() => {
    return products.filter((p) => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return (
        cat.includes('كحول') ||
        cat.includes('مذيب') ||
        cat.includes('مخفف') ||
        name.includes('كحول') ||
        name.includes('مذيب') ||
        name.includes('مثبت') ||
        p.unit === 'liter' ||
        p.unit === 'ml'
      );
    });
  }, [products]);

  // Calculated totals
  const totalOilMlPerBottle = useMemo(() => {
    return wizardData.oils.reduce((sum, o) => sum + safeParseFloat(o.mlPerBottle, 0), 0);
  }, [wizardData.oils]);

  const calculatedOilCostPerBottle = useMemo(() => {
    return wizardData.oils.reduce(
      (sum, o) => sum + safeParseFloat(o.mlPerBottle, 0) * safeParseFloat(o.unitCostPerMl, 0),
      0
    );
  }, [wizardData.oils]);

  const calculatedAlcoholCostPerBottle = useMemo(() => {
    return safeParseFloat(wizardData.alcoholMlPerBottle, 0) * safeParseFloat(wizardData.alcoholCostPerMl, 0);
  }, [wizardData.alcoholMlPerBottle, wizardData.alcoholCostPerMl]);

  const unitTotalCost = useMemo(() => {
    return (
      safeParseFloat(wizardData.bottleCost, 0) +
      calculatedOilCostPerBottle +
      calculatedAlcoholCostPerBottle
    );
  }, [wizardData.bottleCost, calculatedOilCostPerBottle, calculatedAlcoholCostPerBottle]);

  const batchTotalCost = useMemo(() => {
    return unitTotalCost * safeParseFloat(wizardData.batchQuantity, 1);
  }, [unitTotalCost, wizardData.batchQuantity]);

  const oilConcentrationPercentage = useMemo(() => {
    const cap = safeParseFloat(wizardData.bottleCapacity, 50);
    if (cap <= 0) return 0;
    return Math.min(100, Math.round((totalOilMlPerBottle / cap) * 100));
  }, [totalOilMlPerBottle, wizardData.bottleCapacity]);

  const perfumeConcentrationGrade = useMemo(() => {
    if (oilConcentrationPercentage >= 25) return { grade: 'Extrait de Parfum (عطر مركز نقي)', color: 'text-amber-500' };
    if (oilConcentrationPercentage >= 18) return { grade: 'Eau de Parfum (أو دو بارفان فواح)', color: 'text-emerald-500' };
    if (oilConcentrationPercentage >= 10) return { grade: 'Eau de Toilette (أو دو تواليت)', color: 'text-blue-500' };
    return { grade: 'Eau de Cologne (كولونيا خفيفة)', color: 'text-purple-500' };
  }, [oilConcentrationPercentage]);

  // Open Wizard for new formula
  const openNewWizard = () => {
    const validBarcode = generateValidBarcode('628');
    setWizardData({
      ...DEFAULT_WIZARD_DATA,
      barcode: validBarcode
    });
    setCurrentStep(1);
    setWizardOpen(true);
  };

  const handleRegenerateBarcode = () => {
    const code = generateValidBarcode('628');
    setWizardData((prev) => ({ ...prev, barcode: code }));
    showSuccess(`تم توليد باركود قياسي صالح للخلطة: ${code}`);
  };

  // Step 1: Select Bottle Handler
  const handleSelectBottle = (prodId) => {
    const prod = products.find((p) => String(p.id) === String(prodId));
    if (prod) {
      const cap = prod.capacity > 0 ? prod.capacity : 50;
      setWizardData((prev) => ({
        ...prev,
        bottleId: prod.id,
        bottleName: prod.name,
        bottleCapacity: cap,
        bottleCost: prod.cost || 0,
        // Auto-recalculate alcohol
        alcoholMlPerBottle: Math.max(0, cap - totalOilMlPerBottle)
      }));
    }
  };

  // Step 2: Oil blend management
  const handleAddOilSlot = () => {
    setWizardData((prev) => ({
      ...prev,
      oils: [...prev.oils, { oilId: '', oilName: '', mlPerBottle: 5, percentage: 10, unitCostPerMl: 0.8 }]
    }));
  };

  const handleRemoveOilSlot = (index) => {
    setWizardData((prev) => ({
      ...prev,
      oils: prev.oils.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateOilSlot = (index, field, value) => {
    setWizardData((prev) => {
      const nextOils = [...prev.oils];
      const target = { ...nextOils[index], [field]: value };

      if (field === 'oilId') {
        const prod = products.find((p) => String(p.id) === String(value));
        if (prod) {
          target.oilName = prod.name;
          const costPerMl = prod.unit === 'liter' ? prod.cost / 1000 : prod.cost > 0 ? prod.cost / (prod.capacity || 100) : 0.8;
          target.unitCostPerMl = costPerMl;
        }
      }

      nextOils[index] = target;
      const newTotalOilMl = nextOils.reduce((sum, o) => sum + safeParseFloat(o.mlPerBottle, 0), 0);
      const newAlcoholMl = Math.max(0, safeParseFloat(prev.bottleCapacity, 50) - newTotalOilMl);

      return {
        ...prev,
        oils: nextOils,
        alcoholMlPerBottle: newAlcoholMl
      };
    });
  };

  // Step 3: Select Alcohol
  const handleSelectAlcohol = (prodId) => {
    const prod = products.find((p) => String(p.id) === String(prodId));
    if (prod) {
      const costPerMl = prod.unit === 'liter' ? prod.cost / 1000 : prod.cost > 0 ? prod.cost / (prod.capacity || 1000) : 0.05;
      setWizardData((prev) => ({
        ...prev,
        alcoholId: prod.id,
        alcoholName: prod.name,
        alcoholCostPerMl: costPerMl
      }));
    }
  };

  // Validate step progression
  const canProceedStep = (step) => {
    if (step === 1) {
      return wizardData.bottleCapacity > 0 && wizardData.batchQuantity > 0;
    }
    if (step === 2) {
      return wizardData.oils.length > 0 && wizardData.oils.every((o) => o.oilName && o.mlPerBottle > 0);
    }
    if (step === 3) {
      return wizardData.alcoholMlPerBottle >= 0;
    }
    if (step === 4) {
      return wizardData.perfumeName.trim().length > 0 && wizardData.retailPrice > 0;
    }
    return true;
  };

  const handleNextStep = () => {
    if (!canProceedStep(currentStep)) {
      showWarning('يرجى إكمال البيانات المطلوبة لهذه الخطوة قبل المتابعة');
      return;
    }
    if (currentStep === 3 && !wizardData.perfumeName) {
      // Suggest automatic perfume name based on selected oils
      const primaryOil = wizardData.oils[0]?.oilName ? wizardData.oils[0].oilName.replace(/عطر|زيت/g, '').trim() : 'الدفة';
      const autoName = `خلطة ${primaryOil} الملكية ${wizardData.bottleCapacity}ml`;
      setWizardData((prev) => ({
        ...prev,
        perfumeName: autoName,
        retailPrice: Math.round(unitTotalCost * 2.2) || 85,
        wholesalePrice: Math.round(unitTotalCost * 1.6) || 65
      }));
    }
    setCurrentStep((prev) => Math.min(5, prev + 1));
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  // Final Submission: Inject product into Inventory & deduct raw materials & save formula note
  const handleFinalizeFormula = async () => {
    if (!wizardData.perfumeName.trim()) {
      showError('يرجى تحديد اسم العطر النهائي');
      return;
    }

    setSaving(true);
    try {
      const newProductId = generateId();
      const formulaId = generateId();
      const finalBarcode = (wizardData.barcode || '').trim() || generateValidBarcode('628');

      const notesArray = [
        wizardData.notes ? wizardData.notes.trim() : null,
        wizardData.batchNumber ? `رقم الدفعة: ${wizardData.batchNumber.trim()}` : null,
        wizardData.storageLocation ? `الموقع: ${wizardData.storageLocation.trim()}` : null,
        wizardData.macerationPeriod ? `فترة التعتيق: ${wizardData.macerationPeriod.trim()}` : null,
        wizardData.scentNotes ? `نوتات العطر: ${wizardData.scentNotes.trim()}` : null,
        wizardData.purityGrade ? `النقاء: ${wizardData.purityGrade.trim()}` : null,
        `خلطة مخصصة تم إنتاجها في مختبر الدفة - ${wizardData.batchQuantity} زجاجات`
      ].filter(Boolean);

      const batchQty = safeParseFloat(wizardData.batchQuantity, 1);
      const queries = [];

      // 1. Create the new finished perfume product in inventory
      queries.push({
        sql: `INSERT INTO inventory (id, name, category, qty, cost, price, wholesale_price, unit, capacity, barcode, min_qty, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          newProductId,
          wizardData.perfumeName.trim(),
          wizardData.category || 'عطور مركبة / خلطات الدفة',
          batchQty,
          unitTotalCost,
          safeParseFloat(wizardData.retailPrice, 0),
          safeParseFloat(wizardData.wholesalePrice, 0),
          'قطعة',
          safeParseFloat(wizardData.bottleCapacity, 50),
          finalBarcode,
          3,
          notesArray.join(' | ')
        ]
      });

      // 2. Deduct raw materials from inventory
      if (wizardData.bottleId) {
        queries.push({
          sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ? OR CAST(id AS TEXT) = ?',
          params: [batchQty, wizardData.bottleId, String(wizardData.bottleId)]
        });
      }

      for (const oil of wizardData.oils) {
        if (oil.oilId) {
          const totalOilMl = safeParseFloat(oil.mlPerBottle, 0) * batchQty;
          queries.push({
            sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ? OR CAST(id AS TEXT) = ?',
            params: [totalOilMl, oil.oilId, String(oil.oilId)]
          });
        }
      }

      if (wizardData.alcoholId) {
        const totalAlcMl = safeParseFloat(wizardData.alcoholMlPerBottle, 0) * batchQty;
        queries.push({
          sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ? OR CAST(id AS TEXT) = ?',
          params: [totalAlcMl, wizardData.alcoholId, String(wizardData.alcoholId)]
        });
      }

      // 3. Save Formula Spec into notes
      const formulaPayload = {
        id: formulaId,
        productId: newProductId,
        name: wizardData.perfumeName,
        date: new Date().toISOString(),
        bottleCapacity: wizardData.bottleCapacity,
        batchQuantity: wizardData.batchQuantity,
        batchNumber: wizardData.batchNumber,
        storageLocation: wizardData.storageLocation,
        purityGrade: wizardData.purityGrade,
        fixativeType: wizardData.fixativeType,
        macerationPeriod: wizardData.macerationPeriod,
        scentNotes: wizardData.scentNotes,
        bottle: { id: wizardData.bottleId, name: wizardData.bottleName, cost: wizardData.bottleCost },
        oils: wizardData.oils,
        alcohol: { id: wizardData.alcoholId, name: wizardData.alcoholName, ml: wizardData.alcoholMlPerBottle },
        unitTotalCost,
        batchTotalCost,
        retailPrice: wizardData.retailPrice,
        wholesalePrice: wizardData.wholesalePrice,
        barcode: finalBarcode,
        notes: wizardData.notes
      };

      queries.push({
        sql: 'INSERT INTO notes (id, date, title, content, priority) VALUES (?, ?, ?, ?, ?)',
        params: [
          formulaId,
          new Date().toISOString(),
          `FORMULA: ${wizardData.perfumeName}`,
          JSON.stringify(formulaPayload, null, 2),
          'high'
        ]
      });

      // Execute all operations atomically in a single SQLite transaction
      await db.transaction(queries);
      db.invalidateCache();

      setWizardOpen(false);
      await loadData();
      if (typeof loadIngredients === 'function') await loadIngredients();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
      }

      showSuccess(
        `✅ تم اعتماد الخلطة بنجاح!\n\nتمت إضافة "${wizardData.perfumeName}" إلى المخزون (${wizardData.batchQuantity} زجاجة) وتحديث المواد الخام.`
      );
    } catch (err) {
      showError('خطأ أثناء حفظ واعتماد الخلطة: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      {/* Header Banner */}
      <div className="glass-card p-5 border border-amber-500/30 bg-gradient-to-l from-amber-500/10 via-[#161b22] to-[#0d1117] rounded-3xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-13 h-13 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold text-2xl shadow-lg shrink-0">
            🧪
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#e6edf3] flex items-center gap-2">
              مختبر خلطات وعطور الدفة الملكية
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                المعالج التفاعلي الذكي
              </span>
            </h1>
            <p className="text-xs text-[#adbac7] mt-0.5 leading-relaxed">
              إنتاج وتركيب العطور الخاصة بنظام الأسئلة التفاعلي، واحتساب نسب الزيوت والكحول والتكلفة، وحقنها مباشرة في المخزون
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="بحث في أرشيف الخلطات..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-atelier w-full ps-9 py-2 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={openNewWizard}
            className="btn-atelier-primary px-5 py-2.5 text-xs font-bold shrink-0 shadow-lg flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>➕ إنشاء خلطة تفاعلية جديدة</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Saved Formulas & Formulas Catalog */}
      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-4 pr-1">
        {formulas.length === 0 ? (
          <div className="glass-card p-12 text-center rounded-3xl border border-white/10 flex flex-col items-center justify-center gap-4 my-8">
            <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-4xl">
              🧪
            </div>
            <h3 className="text-lg font-bold text-white">لا توجد خلطات مسجلة بعد في المختبر</h3>
            <p className="text-xs text-gray-400 max-w-md leading-relaxed">
              ابدأ الآن بإنشاء أول خلطة عطرية خاصة بمتجرك عبر المعالج التفاعلي (نظام الأسئلة والخطوات) لتحديد الزيوت، الزجاجات، ونسب الكحول.
            </p>
            <button
              type="button"
              onClick={openNewWizard}
              className="btn-atelier-primary px-6 py-2.5 text-xs font-bold mt-2"
            >
              🚀 بدء معالج الخلطات التفاعلي الآن
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {formulas
              .filter((f) => {
                if (!searchTerm.trim()) return true;
                return (
                  f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  f.content.toLowerCase().includes(searchTerm.toLowerCase())
                );
              })
              .map((formula) => {
                let parsed = null;
                try {
                  parsed = JSON.parse(formula.content);
                } catch (e) {}

                const titleClean = formula.title.replace('FORMULA:', '').trim();

                return (
                  <div
                    key={formula.id}
                    className="glass-card p-5 rounded-2xl border border-white/10 hover:border-amber-500/40 transition-all flex flex-col justify-between gap-4 group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 text-[10px] font-bold border border-amber-500/20">
                          {parsed?.bottleCapacity ? `${parsed.bottleCapacity} مل` : 'عطر مخلط'}
                        </span>
                        <span className="text-[11px] text-gray-400 font-mono">
                          {new Date(formula.date).toLocaleDateString('ar-LY')}
                        </span>
                      </div>

                      <h3 className="text-base font-extrabold text-white group-hover:text-amber-400 transition-colors">
                        {titleClean}
                      </h3>

                      {parsed && (
                        <div className="mt-3 space-y-1.5 text-xs text-gray-300 bg-black/20 p-3 rounded-xl border border-white/5">
                          <div className="flex justify-between">
                            <span className="text-gray-400">الزجاجة:</span>
                            <span className="font-semibold">{parsed.bottle?.name || 'قياسية'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">الزيوت المستخدمة:</span>
                            <span className="font-semibold text-amber-300">
                              {parsed.oils?.map((o) => `${o.oilName} (${o.mlPerBottle}ml)`).join(' + ') || 'مزيج زيوت'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">كمية الكحول:</span>
                            <span className="font-semibold">{parsed.alcohol?.ml || 0} مل</span>
                          </div>
                          <div className="flex justify-between pt-1 border-t border-white/10 font-bold">
                            <span className="text-gray-400">تكلفة الزجاجة:</span>
                            <span className="text-emerald-400">{formatCurrency(parsed.unitTotalCost)}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setActiveFormulaPreview(parsed || formula)}
                        className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>معاينة تفاصيل التركيبة</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteFormula({ formula, title: titleClean })}
                        className="text-red-400 hover:text-red-300 p-1 transition-colors cursor-pointer"
                        title="حذف الخلطة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 5-STEP INTERACTIVE MIXING WIZARD MODAL */}
      {/* ========================================================================= */}
      <Modal
        open={wizardOpen}
        onClose={() => {
          if (!saving) setWizardOpen(false);
        }}
        size="xl"
        title={
          <div className="flex items-center gap-2 text-base font-extrabold text-amber-400">
            <FlaskConical className="w-5 h-5" />
            <span>معالج تركيب العطور والخلطات التفاعلي — خطوة {currentStep} من 5</span>
          </div>
        }
      >
        <div className="space-y-6 select-none">
          {/* Wizard Step Progress Indicator */}
          <div className="grid grid-cols-5 gap-2 pb-3 border-b border-white/10 text-center text-xs font-bold">
            {[
              { num: 1, label: '1. الزجاجات والعبوات', icon: Package },
              { num: 2, label: '2. الزيوت العطرية', icon: Droplets },
              { num: 3, label: '3. الكحول والمذيبات', icon: Layers },
              { num: 4, label: '4. التسمية والتسعير', icon: DollarSign },
              { num: 5, label: '5. مراجعة واعتماد', icon: CheckCircle2 }
            ].map((step) => {
              const StepIcon = step.icon;
              const isActive = currentStep === step.num;
              const isPast = currentStep > step.num;

              return (
                <div
                  key={step.num}
                  className={`p-2 rounded-xl border transition-all flex flex-col items-center gap-1 ${
                    isActive
                      ? 'border-amber-500 bg-amber-500/20 text-amber-300 shadow-md scale-102'
                      : isPast
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/5 bg-white/5 text-gray-400 opacity-60'
                  }`}
                >
                  <StepIcon className="w-4 h-4" />
                  <span className="text-[11px] truncate w-full">{step.label}</span>
                </div>
              );
            })}
          </div>

          {/* ===================================================================== */}
          {/* STEP 1: SELECT BOTTLE & BATCH SIZE */}
          {/* ===================================================================== */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl">
                <h3 className="text-sm font-extrabold text-amber-300 mb-1 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  السؤال الأول: ما هي الزجاجات التي ستستخدمها وكم عدد العبوات المراد إنتاجها؟
                </h3>
                <p className="text-xs text-gray-300">
                  💡 <span className="font-bold">شرح:</span> حدد نوع الزجاجة من المخزون وسعتها الإجمالية (مثال: 50ml أو 100ml) والعدد المطلوب تصنيعه في هذه الدفعة ليقوم النظام بحساب إجمالي السوائل تلقائياً.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Select bottle from inventory */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">اختر الزجاجة من المخزون:</label>
                  <select
                    value={wizardData.bottleId}
                    onChange={(e) => handleSelectBottle(e.target.value)}
                    className="select-luxury w-full"
                  >
                    <option value="">-- اختر زجاجة متوفرة أو حدد يدوياً --</option>
                    {bottleProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (المتوفر: {p.qty} قطعة - التكلفة: {formatCurrency(p.cost)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom bottle name */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">اسم أو وصف الزجاجة:</label>
                  <input
                    type="text"
                    value={wizardData.bottleName}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, bottleName: e.target.value }))}
                    className="input-luxury w-full"
                    placeholder="مثال: زجاجة كريستال إيطالية 50ml"
                  />
                </div>

                {/* Bottle Capacity (ml) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">سعة الزجاجة الواحدة (مل):</label>
                  <div className="flex items-center gap-2">
                    {[30, 50, 80, 100].map((cap) => (
                      <button
                        key={cap}
                        type="button"
                        onClick={() =>
                          setWizardData((prev) => ({
                            ...prev,
                            bottleCapacity: cap,
                            alcoholMlPerBottle: Math.max(0, cap - totalOilMlPerBottle)
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          wizardData.bottleCapacity === cap
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-sm'
                            : 'bg-black/20 border-white/10 text-gray-300 hover:border-amber-400/40'
                        }`}
                      >
                        {cap} مل
                      </button>
                    ))}
                    <input
                      type="number"
                      min="1"
                      value={wizardData.bottleCapacity}
                      onChange={(e) =>
                        setWizardData((prev) => {
                          const cap = safeParseFloat(e.target.value, 50);
                          return {
                            ...prev,
                            bottleCapacity: cap,
                            alcoholMlPerBottle: Math.max(0, cap - totalOilMlPerBottle)
                          };
                        })
                      }
                      className="input-luxury w-24 text-center font-bold"
                    />
                  </div>
                </div>

                {/* Batch Quantity (How many bottles) */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">كم عدد الزجاجات المراد إنتاجها (الدفعة)؟</label>
                  <input
                    type="number"
                    min="1"
                    value={wizardData.batchQuantity}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, batchQuantity: safeParseFloat(e.target.value, 1) }))}
                    className="input-luxury w-full font-bold text-amber-400"
                  />
                </div>

                {/* Bottle Unit Cost */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">سعر تكلفة الزجاجة الفارغة (د.ل):</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={wizardData.bottleCost}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, bottleCost: safeParseFloat(e.target.value, 0) }))}
                    className="input-luxury w-full"
                  />
                </div>

                {/* Optional Batch Details */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">
                    رقم الدفعة / التشغيلة <span className="text-gray-500 font-normal">(اختياري)</span>:
                  </label>
                  <input
                    type="text"
                    value={wizardData.batchNumber}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, batchNumber: e.target.value }))}
                    className="input-luxury w-full text-xs"
                    placeholder="مثال: BATCH-MIX-01"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* STEP 2: SELECT FRAGRANCE OILS & DOSAGE */}
          {/* ===================================================================== */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-extrabold text-amber-300 mb-1 flex items-center gap-2">
                    <Droplets className="w-4 h-4" />
                    السؤال الثاني: ما هي الزيوت العطرية التي ستستعملها وكم مقدار كل زيت؟
                  </h3>
                  <p className="text-xs text-gray-300">
                    💡 <span className="font-bold">شرح:</span> حدد الزيوت العطرية والكمية بالملّ لكل زجاجة بسعة ({wizardData.bottleCapacity} مل). يقوم النظام بحساب إجمالي الزيوت المستهلكة للدفعة كاملة وتكلفتها بدقة.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddOilSlot}
                  className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 shrink-0 cursor-pointer font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة زيت آخر للمزيج</span>
                </button>
              </div>

              {/* Oils Table */}
              <div className="space-y-3">
                {wizardData.oils.map((oil, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-black/20 border border-white/10 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3"
                  >
                    <div className="flex-1 w-full space-y-1">
                      <label className="text-[11px] font-bold text-gray-400">الزيت #{idx + 1}:</label>
                      <select
                        value={oil.oilId}
                        onChange={(e) => handleUpdateOilSlot(idx, 'oilId', e.target.value)}
                        className="select-luxury w-full text-xs"
                      >
                        <option value="">-- اختر من مخزون الزيوت العطرية --</option>
                        {oilProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (المتوفر: {p.qty} {p.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-full md:w-36 space-y-1">
                      <label className="text-[11px] font-bold text-gray-400">الاسم يدوياً:</label>
                      <input
                        type="text"
                        value={oil.oilName}
                        onChange={(e) => handleUpdateOilSlot(idx, 'oilName', e.target.value)}
                        placeholder="اسم الزيت..."
                        className="input-luxury w-full text-xs"
                      />
                    </div>

                    <div className="w-full md:w-28 space-y-1">
                      <label className="text-[11px] font-bold text-gray-400">المقدار (مل/زجاجة):</label>
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={oil.mlPerBottle}
                        onChange={(e) => handleUpdateOilSlot(idx, 'mlPerBottle', safeParseFloat(e.target.value, 0))}
                        className="input-luxury w-full text-center text-xs font-bold text-amber-300"
                      />
                    </div>

                    <div className="w-full md:w-28 space-y-1">
                      <label className="text-[11px] font-bold text-gray-400">تكلفة الـ مل (د.ل):</label>
                      <input
                        type="number"
                        min="0"
                        step="0.05"
                        value={oil.unitCostPerMl}
                        onChange={(e) => handleUpdateOilSlot(idx, 'unitCostPerMl', safeParseFloat(e.target.value, 0))}
                        className="input-luxury w-full text-left text-xs font-mono"
                      />
                    </div>

                    {wizardData.oils.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOilSlot(idx)}
                        className="text-red-400 hover:text-red-300 p-2 mt-4 transition-colors cursor-pointer"
                        title="حذف هذا الزيت"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Oil Summary Pill & Optional Purity */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between text-xs font-bold">
                  <span className="text-amber-300">
                    إجمالي الزيوت في الزجاجة ({wizardData.bottleCapacity} مل):
                  </span>
                  <span className="text-white">
                    {totalOilMlPerBottle} مل ({oilConcentrationPercentage}%) — إجمالي الدفعة: {(totalOilMlPerBottle * wizardData.batchQuantity).toFixed(1)} مل
                  </span>
                </div>

                <div className="p-3 bg-black/20 border border-white/10 rounded-xl flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-400 block font-bold">درجة النقاء والمصدر <span className="text-gray-500 font-normal">(اختياري)</span>:</label>
                    <input
                      type="text"
                      value={wizardData.purityGrade}
                      onChange={(e) => setWizardData((prev) => ({ ...prev, purityGrade: e.target.value }))}
                      className="input-luxury w-full py-0.5 text-xs"
                      placeholder="مثال: درجة أولى نقية 100% فرنسية"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* STEP 3: ALCOHOL & FIXATIVES */}
          {/* ===================================================================== */}
          {currentStep === 3 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl">
                <h3 className="text-sm font-extrabold text-amber-300 mb-1 flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  السؤال الثالث: كم مقدار الكحول والمذيب الذي سيتم وضعه لإكمال السعة؟
                </h3>
                <p className="text-xs text-gray-300">
                  💡 <span className="font-bold">شرح:</span> يتم احتساب الكحول المتبقي تلقائياً لإكمال سعة العبوة ({wizardData.bottleCapacity} مل)، مع تحديد درجة تركيز وثبات العطر الناتجة فوراً في المؤشر الذكي.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Select Alcohol */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">اختر نوع الكحول/المذيب من المخزون:</label>
                  <select
                    value={wizardData.alcoholId}
                    onChange={(e) => handleSelectAlcohol(e.target.value)}
                    className="select-luxury w-full"
                  >
                    <option value="">-- اختر من مخزون الكحول والمذيبات --</option>
                    {alcoholProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (المتوفر: {p.qty} {p.unit})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Alcohol Name */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">وصف أو نوع الكحول المستخدم:</label>
                  <input
                    type="text"
                    value={wizardData.alcoholName}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, alcoholName: e.target.value }))}
                    className="input-luxury w-full"
                  />
                </div>

                {/* Alcohol ml per bottle */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">مقدار الكحول في الزجاجة (مل):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={wizardData.alcoholMlPerBottle}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, alcoholMlPerBottle: safeParseFloat(e.target.value, 0) }))}
                    className="input-luxury w-full font-bold text-blue-300"
                  />
                </div>

                {/* Alcohol Cost per ml */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">سعر تكلفة الـ مل من الكحول (د.ل):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={wizardData.alcoholCostPerMl}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, alcoholCostPerMl: safeParseFloat(e.target.value, 0) }))}
                    className="input-luxury w-full"
                  />
                </div>
              </div>

              {/* Optional Fixative Field */}
              <div className="p-3 bg-black/20 border border-white/10 rounded-xl">
                <label className="text-xs font-bold text-gray-300 block mb-1">
                  المثبت أو المذيب الإضافي المستخدم <span className="text-gray-500 font-normal">(اختياري)</span>:
                </label>
                <input
                  type="text"
                  value={wizardData.fixativeType}
                  onChange={(e) => setWizardData((prev) => ({ ...prev, fixativeType: e.target.value }))}
                  className="input-luxury w-full text-xs"
                  placeholder="مثال: مثبت مسك غزال نقي أو جلسرين طبي"
                />
              </div>

              {/* Concentration Gauge Card */}
              <div className="p-4 bg-black/30 border border-white/10 rounded-2xl space-y-2">
                <div className="flex justify-between items-center text-xs font-bold">
                  <span className="text-gray-300">تصنيف تركيز العطر الناتج:</span>
                  <span className={`font-extrabold ${perfumeConcentrationGrade.color}`}>
                    {perfumeConcentrationGrade.grade} ({oilConcentrationPercentage}% زيت نقي)
                  </span>
                </div>
                <div className="w-full bg-gray-700 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-emerald-500 to-amber-500"
                    style={{ width: `${Math.min(100, Math.max(5, oilConcentrationPercentage))}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* STEP 4: PERFUME NAME & PRICING */}
          {/* ===================================================================== */}
          {currentStep === 4 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl">
                <h3 className="text-sm font-extrabold text-amber-300 mb-1 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  السؤال الرابع: ما هو الاسم التجاري للعطر وسعر بيعه في المحل؟
                </h3>
                <p className="text-xs text-gray-300">
                  💡 <span className="font-bold">شرح:</span> اختر اسماً مميزاً للخلطة وسعر البيع للجمهور، وسيقوم النظام فوراً باحتساب هامش الربح وصافي الأرباح المتوقعة، مع إمكانية توليد باركود قياسي أو تركه اختيارياً.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Perfume Name */}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-gray-300 block">
                    اسم العطر المخلط الجديد <span className="text-red-400">*</span>:
                  </label>
                  <input
                    type="text"
                    value={wizardData.perfumeName}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, perfumeName: e.target.value }))}
                    className="input-luxury w-full font-bold text-sm text-amber-300"
                    placeholder="مثال: خلطة عود الصندل الملكية 50ml"
                    autoFocus
                  />
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">فئة المنتج في المخزون:</label>
                  <input
                    type="text"
                    value={wizardData.category}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, category: e.target.value }))}
                    className="input-luxury w-full"
                  />
                </div>

                {/* Barcode with Quick Generator */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-gray-300">
                      الباركود <span className="text-gray-500 font-normal">(اختياري)</span>:
                    </label>
                    <button
                      type="button"
                      onClick={handleRegenerateBarcode}
                      className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-bold"
                    >
                      <span>⚡ توليد باركود قياسي</span>
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={wizardData.barcode}
                      onChange={(e) => setWizardData((prev) => ({ ...prev, barcode: e.target.value }))}
                      className="input-luxury w-full font-mono text-xs"
                      placeholder="باركود صالح للمسح..."
                    />
                  </div>
                </div>

                {/* Retail Price */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">سعر البيع قطاعي للمستهلك (د.ل):</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={wizardData.retailPrice}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, retailPrice: safeParseFloat(e.target.value, 0) }))}
                    className="input-luxury w-full font-bold text-emerald-400"
                  />
                </div>

                {/* Wholesale Price */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">سعر البيع جملة (د.ل):</label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={wizardData.wholesalePrice}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, wholesalePrice: safeParseFloat(e.target.value, 0) }))}
                    className="input-luxury w-full font-bold text-amber-300"
                  />
                </div>

                {/* Optional Scent Notes */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">
                    نوتات العطر الهرمية <span className="text-gray-500 font-normal">(اختياري)</span>:
                  </label>
                  <input
                    type="text"
                    value={wizardData.scentNotes}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, scentNotes: e.target.value }))}
                    className="input-luxury w-full text-xs"
                    placeholder="افتتاحية، قلب، قاعدة..."
                  />
                </div>

                {/* Optional Maceration Period */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-300 block">
                    فترة التعتيق الموصى بها <span className="text-gray-500 font-normal">(اختياري)</span>:
                  </label>
                  <input
                    type="text"
                    value={wizardData.macerationPeriod}
                    onChange={(e) => setWizardData((prev) => ({ ...prev, macerationPeriod: e.target.value }))}
                    className="input-luxury w-full text-xs"
                    placeholder="مثال: أسبوعين في مكان بارد ومظلم"
                  />
                </div>
              </div>

              {/* Live Cost & Margin Indicator */}
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-4 text-xs font-bold">
                <div>
                  <span className="text-gray-400 block">تكلفة الزجاجة المحسوبة:</span>
                  <span className="text-white text-sm">{formatCurrency(unitTotalCost)}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">سعر البيع المقترح:</span>
                  <span className="text-emerald-300 text-sm">{formatCurrency(wizardData.retailPrice)}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">صافي الربح المتوقع للزجاجة:</span>
                  <span className="text-amber-300 text-sm">
                    {formatCurrency(Math.max(0, wizardData.retailPrice - unitTotalCost))} (
                    {unitTotalCost > 0 ? Math.round(((wizardData.retailPrice - unitTotalCost) / unitTotalCost) * 100) : 0}%)
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* STEP 5: COMPREHENSIVE EDITABLE REVIEW SCREEN */}
          {/* ===================================================================== */}
          {currentStep === 5 && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-2xl">
                <h3 className="text-sm font-extrabold text-emerald-300 mb-1 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  المرحلة الأخيرة: مراجعة شاملة لكافة بيانات الخلطة مع إمكانية التعديل
                </h3>
                <p className="text-xs text-gray-300">
                  💡 <span className="font-bold">شرح:</span> راجع كافة تفاصيل ومكونات الخلطة مع إمكانية التعديل المباشر لأي حقل، ثم اضغط على "اعتماد وحفظ الخلطة" لخصم المواد الخام وحقن العطر فوراً في المخزون.
                </p>
              </div>

              {/* Comprehensive Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Perfume Identity Card */}
                <div className="p-4 bg-black/30 border border-amber-500/20 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-amber-300 border-b border-white/10 pb-2 flex items-center justify-between">
                    <span>🏷️ بيانات وهوية العطر الجديد</span>
                    <button
                      type="button"
                      onClick={handleRegenerateBarcode}
                      className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                    >
                      توليد باركود جديد ⚡
                    </button>
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-gray-400 block text-[11px]">اسم العطر:</span>
                      <input
                        type="text"
                        value={wizardData.perfumeName}
                        onChange={(e) => setWizardData((prev) => ({ ...prev, perfumeName: e.target.value }))}
                        className="input-luxury w-full font-bold text-amber-300 py-1"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-gray-400 block text-[11px]">الكمية المنتجة (الدفعة):</span>
                        <input
                          type="number"
                          min="1"
                          value={wizardData.batchQuantity}
                          onChange={(e) => setWizardData((prev) => ({ ...prev, batchQuantity: safeParseFloat(e.target.value, 1) }))}
                          className="input-luxury w-full font-bold py-1"
                        />
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[11px]">سعة الزجاجة (مل):</span>
                        <input
                          type="number"
                          value={wizardData.bottleCapacity}
                          onChange={(e) => setWizardData((prev) => ({ ...prev, bottleCapacity: safeParseFloat(e.target.value, 50) }))}
                          className="input-luxury w-full font-bold py-1"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-gray-400 block text-[11px]">سعر البيع قطاعي (د.ل):</span>
                        <input
                          type="number"
                          value={wizardData.retailPrice}
                          onChange={(e) => setWizardData((prev) => ({ ...prev, retailPrice: safeParseFloat(e.target.value, 0) }))}
                          className="input-luxury w-full font-bold text-emerald-400 py-1"
                        />
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[11px]">سعر البيع جملة (د.ل):</span>
                        <input
                          type="number"
                          value={wizardData.wholesalePrice}
                          onChange={(e) => setWizardData((prev) => ({ ...prev, wholesalePrice: safeParseFloat(e.target.value, 0) }))}
                          className="input-luxury w-full font-bold text-amber-300 py-1"
                        />
                      </div>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[11px]">الباركود:</span>
                      <input
                        type="text"
                        value={wizardData.barcode}
                        onChange={(e) => setWizardData((prev) => ({ ...prev, barcode: e.target.value }))}
                        className="input-luxury w-full font-mono text-[11px] py-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Recipe Breakdown Card */}
                <div className="p-4 bg-black/30 border border-amber-500/20 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-amber-300 border-b border-white/10 pb-2">
                    🧪 مكونات التركيبة والمقادير
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="text-gray-400">الزجاجات:</span>
                      <span className="font-bold text-white">
                        {wizardData.bottleName} ({wizardData.batchQuantity} قطعة)
                      </span>
                    </div>
                    <div className="py-1 border-b border-white/5">
                      <span className="text-gray-400 block mb-1">الزيوت العطرية:</span>
                      <div className="space-y-1 ps-2">
                        {wizardData.oils.map((o, idx) => (
                          <div key={idx} className="flex justify-between text-amber-300">
                            <span>• {o.oilName || `زيت #${idx + 1}`}:</span>
                            <span>{o.mlPerBottle} مل/زجاجة (إجمالي: {(o.mlPerBottle * wizardData.batchQuantity).toFixed(1)} مل)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-white/5">
                      <span className="text-gray-400">الكحول الإيثيلي:</span>
                      <span className="font-bold text-blue-300">
                        {wizardData.alcoholMlPerBottle} مل/زجاجة (إجمالي: {(wizardData.alcoholMlPerBottle * wizardData.batchQuantity).toFixed(1)} مل)
                      </span>
                    </div>
                    {wizardData.macerationPeriod && (
                      <div className="flex justify-between items-center py-1 border-b border-white/5 text-[11px]">
                        <span className="text-gray-400">فترة التعتيق:</span>
                        <span className="text-amber-200">{wizardData.macerationPeriod}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2 font-bold">
                      <span className="text-gray-300">التكلفة الإجمالية للدفعة:</span>
                      <span className="text-emerald-400 text-sm">{formatCurrency(batchTotalCost)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Controls Slot */}
          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={saving}
                className="btn-secondary text-xs px-4 py-2.5 flex items-center gap-2 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>الخطوة السابقة</span>
              </button>
            ) : (
              <div />
            )}

            {currentStep < 5 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="btn-atelier-primary text-xs px-6 py-2.5 font-bold flex items-center gap-2 cursor-pointer"
              >
                <span>متابعة الخطوة التالية</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinalizeFormula}
                disabled={saving}
                className="btn-atelier-primary text-xs px-8 py-3 font-extrabold flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg cursor-pointer"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري حقن الخلطة في المخزون...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>✅ اعتماد وحفظ الخلطة في المخزون فوراً</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* PREVIEW FORMULA DETAILS MODAL */}
      {/* ========================================================================= */}
      <Modal
        open={Boolean(activeFormulaPreview)}
        onClose={() => setActiveFormulaPreview(null)}
        title="تفاصيل ومقادير التركيبة العطرية"
      >
        {activeFormulaPreview && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-black/30 border border-amber-500/20 rounded-2xl space-y-2">
              <h3 className="text-base font-extrabold text-amber-300">
                {activeFormulaPreview.name || activeFormulaPreview.title}
              </h3>
              <p className="text-gray-400">
                تاريخ الإنتاج: {new Date(activeFormulaPreview.date).toLocaleDateString('ar-LY')}
              </p>
            </div>

            <div className="space-y-2 bg-white/5 p-4 rounded-xl border border-white/10">
              <div className="flex justify-between">
                <span className="text-gray-400">سعة الزجاجة:</span>
                <span className="font-bold">{activeFormulaPreview.bottleCapacity} مل</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">الدفعة المنتجة:</span>
                <span className="font-bold">{activeFormulaPreview.batchQuantity} زجاجات</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">التكلفة الفردية للزجاجة:</span>
                <span className="font-bold text-emerald-400">{formatCurrency(activeFormulaPreview.unitTotalCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">سعر البيع قطاعي:</span>
                <span className="font-bold text-amber-300">{formatCurrency(activeFormulaPreview.retailPrice)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Formula Confirmation Modal */}
      <ConfirmModal
        open={Boolean(pendingDeleteFormula)}
        title="تأكيد حذف تركيبة العطر"
        message={`هل أنت متأكد من حذف خلطة "${pendingDeleteFormula?.title}" نهائياً من الأرشيف؟`}
        confirmText="نعم، حذف التركيبة"
        cancelText="إلغاء"
        danger={true}
        onConfirm={async () => {
          if (pendingDeleteFormula?.formula) {
            try {
              await notesRepo.delete(pendingDeleteFormula.formula.id);
              await loadData();
              showSuccess('تم حذف التركيبة من الأرشيف بنجاح');
            } catch (err) {
              showError(`فشل حذف التركيبة: ${err.message}`);
            } finally {
              setPendingDeleteFormula(null);
            }
          }
        }}
        onCancel={() => setPendingDeleteFormula(null)}
      />
    </div>
  );
};

export default PerfumeMixLabModule;
