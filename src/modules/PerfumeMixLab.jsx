import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { NotesRepository } from '../database/repositories/NotesRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, generateId } from '../utils/helpers.js';

const inventoryRepo = new InventoryRepository();
const notesRepo = new NotesRepository();

const PerfumeMixLabModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const [products, setProducts] = useState([]);
  const [formulas, setFormulas] = useState([]);
  const [showModal, setShowModal] = useState(false);

  // Formula form
  const [formulaName, setFormulaName] = useState('');
  const [bottleCapacity, setBottleCapacity] = useState(100);
  const [oilPercentage, setOilPercentage] = useState(20);
  const [selectedOil, setSelectedOil] = useState('');
  const [selectedAlcohol, setSelectedAlcohol] = useState('');
  const [selectedBottle, setSelectedBottle] = useState('');
  const [batchQuantity, setBatchQuantity] = useState(1);

  // Loading states
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingFormulas, setLoadingFormulas] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const data = await inventoryRepo.findAll({}, 'name ASC');
      setProducts(data);
    } catch (error) {
      showError('خطأ في تحميل المنتجات: ' + error.message);
    } finally {
      setLoadingProducts(false);
    }
  }, [showError]);

  const loadFormulas = useCallback(async () => {
    setLoadingFormulas(true);
    try {
      const data = await notesRepo.getByTitlePrefix('FORMULA:');
      setFormulas(data);
    } catch (error) {
      showError('خطأ في تحميل التركيبات: ' + error.message);
    } finally {
      setLoadingFormulas(false);
    }
  }, [showError]);

  useEffect(() => {
    loadProducts();
    loadFormulas();
  }, [loadProducts, loadFormulas]);

  // Mixing calculations preserved exactly
  const calculateMixture = () => {
    const oilMl = (bottleCapacity * oilPercentage) / 100;
    const alcoholMl = bottleCapacity - oilMl;

    return { oilMl, alcoholMl };
  };

  const saveFormula = async () => {
    if (!formulaName.trim()) {
      showWarning('يرجى إدخال اسم التركيبة');
      return;
    }

    if (!selectedOil || !selectedAlcohol || !selectedBottle) {
      showWarning('يرجى اختيار جميع المواد الخام');
      return;
    }

    const { oilMl, alcoholMl } = calculateMixture();

    const oil = products.find(p => p.id === selectedOil);
    const alcohol = products.find(p => p.id === selectedAlcohol);
    const bottle = products.find(p => p.id === selectedBottle);

    if (!oil || !alcohol || !bottle) {
      showError('خطأ في اختيار المواد');
      return;
    }

    // Check stock availability
    const totalOilNeeded = (oilMl / 1000) * batchQuantity;
    const totalAlcoholNeeded = (alcoholMl / 1000) * batchQuantity;
    const totalBottlesNeeded = batchQuantity;

    if (oil.qty < totalOilNeeded) {
      showWarning(`كمية الزيت غير كافية\nمطلوب: ${totalOilNeeded.toFixed(2)}L\nمتوفر: ${oil.qty}L`);
      return;
    }

    if (alcohol.qty < totalAlcoholNeeded) {
      showWarning(`كمية الكحول غير كافية\nمطلوب: ${totalAlcoholNeeded.toFixed(2)}L\nمتوفر: ${alcohol.qty}L`);
      return;
    }

    if (bottle.qty < totalBottlesNeeded) {
      showWarning(`عدد الزجاجات غير كافٍ\nمطلوب: ${totalBottlesNeeded}\nمتوفر: ${bottle.qty}`);
      return;
    }

    setSaving(true);

    try {
      const id = generateId();
      const formulaData = {
        name: formulaName,
        bottleCapacity,
        oilPercentage,
        oilMl,
        alcoholMl,
        batchQuantity,
        materials: {
          oil: { id: oil.id, name: oil.name, mlPerBottle: oilMl, totalMl: oilMl * batchQuantity },
          alcohol: { id: alcohol.id, name: alcohol.name, mlPerBottle: alcoholMl, totalMl: alcoholMl * batchQuantity },
          bottle: { id: bottle.id, name: bottle.name, quantity: batchQuantity }
        },
        totalCost: (oil.cost * totalOilNeeded) + (alcohol.cost * totalAlcoholNeeded) + (bottle.cost * totalBottlesNeeded)
      };

      // Save formula as note
      await notesRepo.create({
        id,
        date: new Date().toISOString(),
        title: `FORMULA: ${formulaName}`,
        content: JSON.stringify(formulaData, null, 2),
        priority: 'normal'
      });

      // Deduct raw materials from inventory
      await inventoryRepo.adjustStock(oil.id, -totalOilNeeded);
      await inventoryRepo.adjustStock(alcohol.id, -totalAlcoholNeeded);
      await inventoryRepo.adjustStock(bottle.id, -totalBottlesNeeded);

      resetForm();
      await Promise.all([loadProducts(), loadFormulas()]);

      showSuccess(`✅ تم حفظ التركيبة وخصم المواد\n\nالتفاصيل:\n- زيت: ${oilMl}ml (${oilPercentage}%)\n- كحول: ${alcoholMl}ml (${100 - oilPercentage}%)\n- عدد الزجاجات: ${batchQuantity}\n- التكلفة: ${formatCurrency(formulaData.totalCost)}`);
    } catch (error) {
      showError('خطأ في حفظ التركيبة: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormulaName('');
    setBottleCapacity(100);
    setOilPercentage(20);
    setSelectedOil('');
    setSelectedAlcohol('');
    setSelectedBottle('');
    setBatchQuantity(1);
    setShowModal(false);
  };

  const { oilMl, alcoholMl } = calculateMixture();

  const oils = useMemo(() =>
    products.filter(p => p.category && p.category.toLowerCase().includes('زيت')),
    [products]
  );
  const alcohols = useMemo(() =>
    products.filter(p => p.name.toLowerCase().includes('كحول') || p.name.toLowerCase().includes('alcohol')),
    [products]
  );
  const bottles = useMemo(() =>
    products.filter(p => p.name.toLowerCase().includes('زجاج') || p.name.toLowerCase().includes('bottle')),
    [products]
  );

  return (
    <div className="h-full flex flex-col glass-card p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>🧪</span>
          <span>مختبر خلط العطور</span>
        </h2>
        <button
          onClick={() => setShowModal(true)}
          className="btn-gold px-4 py-2"
        >
          ➕ تركيبة جديدة
        </button>
      </div>

      <div className="bg-blue-600/10 border border-blue-400/30 p-4 rounded-lg mb-4">
        <div className="text-sm text-blue-400 space-y-1">
          <div>💡 احسب نسب الزيت والكحول تلقائياً</div>
          <div>📊 خصم تلقائي للمواد الخام من المخزون</div>
          <div>🧮 حساب التكلفة الإجمالية للتركيبة</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loadingFormulas ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="h-5 bg-gray-700 rounded mb-3 w-1/2"></div>
                <div className="h-4 bg-gray-700 rounded mb-2 w-full"></div>
                <div className="h-4 bg-gray-700 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : formulas.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            لا توجد تركيبات محفوظة
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {formulas.map(formula => {
              const data = JSON.parse(formula.content);
              return (
                <div key={formula.id} className="glass-card p-4">
                  <h3 className="text-lg font-bold text-gold mb-3">
                    {data.name}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">سعة الزجاجة:</span>
                      <span className="font-bold">{data.bottleCapacity}ml</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">نسبة الزيت:</span>
                      <span className="font-bold text-purple-400">{data.oilPercentage}% ({data.oilMl}ml)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">نسبة الكحول:</span>
                      <span className="font-bold text-blue-400">{100 - data.oilPercentage}% ({data.alcoholMl}ml)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">الدفعة:</span>
                      <span className="font-bold">{data.batchQuantity} زجاجة</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-700 pt-2">
                      <span className="text-gray-400">التكلفة:</span>
                      <span className="font-bold text-gold">{formatCurrency(data.totalCost)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[800px] max-h-[90vh] overflow-y-auto scrollbar-thin">
            <h2 className="text-2xl font-bold text-gold mb-4">تركيبة عطر جديدة</h2>

            <div className="grid grid-cols-2 gap-6">
              {/* Left Column: Inputs */}
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">اسم التركيبة *</label>
                  <input
                    type="text"
                    placeholder="مثال: عطر الياسمين الملكي"
                    value={formulaName}
                    onChange={(e) => setFormulaName(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-1 block">سعة الزجاجة (ml)</label>
                  <input
                    type="number"
                    value={bottleCapacity}
                    onChange={(e) => setBottleCapacity(parseFloat(e.target.value) || 0)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                    min="1"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-1 block">نسبة الزيت (%)</label>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    value={oilPercentage}
                    onChange={(e) => setOilPercentage(parseFloat(e.target.value))}
                    className="w-full"
                  />
                  <div className="text-center text-2xl font-bold text-purple-400 mt-2">
                    {oilPercentage}%
                  </div>
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-1 block">عدد الزجاجات (الدفعة)</label>
                  <input
                    type="number"
                    value={batchQuantity}
                    onChange={(e) => setBatchQuantity(parseInt(e.target.value) || 1)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                    min="1"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-1 block">الزيت العطري *</label>
                  <select
                    value={selectedOil}
                    onChange={(e) => setSelectedOil(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  >
                    <option value="">اختر زيت...</option>
                    {loadingProducts ? (
                      <option disabled>جاري التحميل...</option>
                    ) : (
                      oils.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name} - متوفر: {p.qty}L
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-1 block">الكحول *</label>
                  <select
                    value={selectedAlcohol}
                    onChange={(e) => setSelectedAlcohol(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  >
                    <option value="">اختر كحول...</option>
                    {alcohols.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} - متوفر: {p.qty}L
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-gray-400 mb-1 block">الزجاجة *</label>
                  <select
                    value={selectedBottle}
                    onChange={(e) => setSelectedBottle(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  >
                    <option value="">اختر زجاجة...</option>
                    {bottles.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} - متوفر: {p.qty}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Right Column: Calculator Display */}
              <div className="bg-gray-800 p-6 rounded-lg">
                <h3 className="text-xl font-bold text-gold mb-4 text-center">حاسبة التركيبة</h3>

                <div className="space-y-4">
                  <div className="bg-purple-600/20 p-4 rounded-lg border border-purple-400/30">
                    <div className="text-sm text-gray-400 mb-1">الزيت العطري</div>
                    <div className="text-3xl font-bold text-purple-400">
                      {oilMl.toFixed(1)} ml
                    </div>
                    <div className="text-sm text-purple-300">
                      {oilPercentage}% × {bottleCapacity}ml
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      إجمالي الدفعة: {(oilMl * batchQuantity / 1000).toFixed(2)}L
                    </div>
                  </div>

                  <div className="bg-blue-600/20 p-4 rounded-lg border border-blue-400/30">
                    <div className="text-sm text-gray-400 mb-1">الكحول</div>
                    <div className="text-3xl font-bold text-blue-400">
                      {alcoholMl.toFixed(1)} ml
                    </div>
                    <div className="text-sm text-blue-300">
                      {(100 - oilPercentage)}% × {bottleCapacity}ml
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      إجمالي الدفعة: {(alcoholMl * batchQuantity / 1000).toFixed(2)}L
                    </div>
                  </div>

                  <div className="bg-gold/20 p-4 rounded-lg border border-gold/30">
                    <div className="text-sm text-gray-400 mb-1">عدد الزجاجات</div>
                    <div className="text-3xl font-bold text-gold">
                      {batchQuantity}
                    </div>
                    <div className="text-sm text-gray-300">
                      {bottleCapacity}ml لكل زجاجة
                    </div>
                  </div>

                  {selectedOil && selectedAlcohol && selectedBottle && (() => {
                    const oil = products.find(p => p.id === selectedOil);
                    const alcohol = products.find(p => p.id === selectedAlcohol);
                    const bottle = products.find(p => p.id === selectedBottle);
                    const totalCost = (oil.cost * oilMl * batchQuantity / 1000) +
                                     (alcohol.cost * alcoholMl * batchQuantity / 1000) +
                                     (bottle.cost * batchQuantity);

                    return (
                      <div className="bg-green-600/20 p-4 rounded-lg border border-green-400/30">
                        <div className="text-sm text-gray-400 mb-1">التكلفة الإجمالية</div>
                        <div className="text-2xl font-bold text-green-400">
                          {formatCurrency(totalCost)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatCurrency(totalCost / batchQuantity)} للزجاجة
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveFormula}
                disabled={!formulaName || !selectedOil || !selectedAlcohol || !selectedBottle || saving}
                className="flex-1 btn-gold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '⏳ جاري الحفظ...' : '✅ حفظ وخصم المواد'}
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

export default PerfumeMixLabModule;
