import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../database/connection.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { CategoriesRepository } from '../database/repositories/CategoriesRepository.js';
import { NotesRepository } from '../database/repositories/NotesRepository.js';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { generateId } from '../utils/helpers.js';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';

const inventoryRepo = new InventoryRepository();
const categoriesRepo = new CategoriesRepository();
const notesRepo = new NotesRepository();

const DiscountsModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const {
    products,
    loading: productsLoading,
    loadProducts
  } = useInventoryStore();

  const [discounts, setDiscounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);

  const [discountType, setDiscountType] = useState('storewide');
  const [percentage, setPercentage] = useState(10);
  const [targetCategory, setTargetCategory] = useState('');
  const [targetProduct, setTargetProduct] = useState('');
  const [discountName, setDiscountName] = useState('');

  // Loading + confirmation states
  const [loadingDiscounts, setLoadingDiscounts] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pendingRestore, setPendingRestore] = useState(null);

  const loadDiscounts = useCallback(async () => {
    setLoadingDiscounts(true);
    try {
      const data = await notesRepo.getByTitlePrefix('DISCOUNT:');
      setDiscounts(data);
    } catch (error) {
      showError('خطأ في تحميل الخصومات: ' + error.message);
    } finally {
      setLoadingDiscounts(false);
    }
  }, [showError]);

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const data = await categoriesRepo.findAll({}, 'name ASC');
      setCategories(data);
    } catch (error) {
      showError('خطأ في تحميل التصنيفات: ' + error.message);
    } finally {
      setLoadingCategories(false);
    }
  }, [showError]);

  useEffect(() => {
    loadDiscounts();
    loadCategories();
    loadProducts();
  }, [loadDiscounts, loadCategories, loadProducts]);

  const applyDiscount = async () => {
    if (!discountName.trim()) {
      showWarning('يرجى إدخال اسم الخصم');
      return;
    }

    if (percentage <= 0 || percentage > 100) {
      showWarning('نسبة الخصم يجب أن تكون بين 1% و 100%');
      return;
    }

    if (discountType === 'category' && !targetCategory) {
      showWarning('يرجى اختيار فئة');
      return;
    }

    if (discountType === 'item' && !targetProduct) {
      showWarning('يرجى اختيار منتج');
      return;
    }

    setApplying(true);

    try {
      const discountData = {
        name: discountName,
        type: discountType,
        percentage,
        appliedAt: new Date().toISOString(),
        target: null,
        affectedItems: []
      };

      // Resolve affected products based on discount type
      let affectedProducts = [];
      if (discountType === 'storewide') {
        affectedProducts = await inventoryRepo.findAll({}, 'name ASC');
      } else if (discountType === 'category') {
        affectedProducts = await inventoryRepo.getByCategory(targetCategory);
      } else if (discountType === 'item') {
        const product = await inventoryRepo.findById(targetProduct);
        if (product) affectedProducts = [product];
      }

      const queries = [];

      // Apply price + discount_rate to each product
      for (const product of affectedProducts) {
        const originalPrice = product.original_price || product.price;
        const newPrice = originalPrice * (1 - percentage / 100);

        queries.push({
          sql: 'UPDATE inventory SET original_price = ?, price = ?, discount_rate = ? WHERE id = ?',
          params: [originalPrice, newPrice, percentage, product.id]
        });

        discountData.affectedItems.push({
          id: product.id,
          name: product.name,
          originalPrice,
          newPrice
        });
      }

      if (discountType === 'storewide') {
        discountData.target = 'جميع المنتجات';
      } else if (discountType === 'category') {
        discountData.target = `الفئة: ${targetCategory}`;
      } else if (discountType === 'item') {
        const product = affectedProducts[0];
        discountData.target = product ? `المنتج: ${product.name}` : 'منتج محدد';
      }

      // Save discount record
      queries.push({
        sql: 'INSERT INTO notes (id, date, title, content, priority) VALUES (?, ?, ?, ?, ?)',
        params: [
          generateId(),
          new Date().toISOString(),
          `DISCOUNT: ${discountName}`,
          JSON.stringify(discountData, null, 2),
          'high'
        ]
      });

      await db.transaction(queries);
      db.invalidateCache();

      resetForm();
      await Promise.all([loadDiscounts(), loadProducts(true)]);

      showSuccess(`✅ تم تطبيق الخصم بنجاح\n\nالنوع: ${discountData.target}\nالنسبة: ${percentage}%\nعدد المنتجات: ${discountData.affectedItems.length}`);
    } catch (error) {
      showError('خطأ في تطبيق الخصم: ' + error.message);
    } finally {
      setApplying(false);
    }
  };

  const restoreDiscount = async () => {
    const discount = pendingRestore;
    setPendingRestore(null);
    if (!discount) return;

    try {
      const discountData = JSON.parse(discount.content);
      const queries = [];

      for (const item of discountData.affectedItems) {
        queries.push({
          sql: 'UPDATE inventory SET price = ?, original_price = NULL, discount_rate = 0 WHERE id = ?',
          params: [item.originalPrice, item.id]
        });
      }

      queries.push({
        sql: 'DELETE FROM notes WHERE id = ?',
        params: [discount.id]
      });

      await db.transaction(queries);
      db.invalidateCache();

      await Promise.all([loadDiscounts(), loadProducts(true)]);

      showSuccess('✅ تم إلغاء الخصم واستعادة الأسعار الأصلية');
    } catch (error) {
      showError('خطأ في إلغاء الخصم: ' + error.message);
    }
  };

  const resetForm = () => {
    setDiscountName('');
    setDiscountType('storewide');
    setPercentage(10);
    setTargetCategory('');
    setTargetProduct('');
    setShowModal(false);
  };

  return (
    <div className="h-full flex flex-col glass-card p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>🏷️</span>
          <span>الخصومات والعروض</span>
        </h2>
        <button
          onClick={() => setShowModal(true)}
          className="btn-gold px-4 py-2"
        >
          ➕ خصم جديد
        </button>
      </div>

      <div className="bg-orange-600/10 border border-orange-400/30 p-4 rounded-lg mb-4">
        <div className="text-sm text-orange-400 space-y-1">
          <div>⚠️ تطبيق الخصم يغير أسعار البيع مباشرة</div>
          <div>🔄 يمكن استعادة الأسعار الأصلية بنقرة واحدة</div>
          <div>📊 خصومات متعددة يمكن تطبيقها على نفس المنتج</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loadingDiscounts ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="h-5 bg-gray-700 rounded mb-2 w-1/3"></div>
                <div className="h-4 bg-gray-700 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : discounts.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            لا توجد خصومات نشطة
          </div>
        ) : (
          <div className="space-y-3">
            {discounts.map(discount => {
              const data = JSON.parse(discount.content);
              return (
                <div key={discount.id} className="glass-card p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-orange-400 mb-1">
                        {data.name}
                      </h3>
                      <div className="text-sm text-gray-400">
                        {new Date(data.appliedAt).toLocaleString('ar-SD')}
                      </div>
                    </div>
                    <button
                      onClick={() => setPendingRestore(discount)}
                      className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                    >
                      🔄 إلغاء الخصم
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-gray-800 p-3 rounded">
                      <div className="text-xs text-gray-400">النوع</div>
                      <div className="font-bold">
                        {data.type === 'storewide' ? 'عام' : data.type === 'category' ? 'فئة' : 'منتج'}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-3 rounded">
                      <div className="text-xs text-gray-400">النسبة</div>
                      <div className="font-bold text-orange-400">{data.percentage}%</div>
                    </div>
                    <div className="bg-gray-800 p-3 rounded">
                      <div className="text-xs text-gray-400">المنتجات المتأثرة</div>
                      <div className="font-bold">{data.affectedItems.length}</div>
                    </div>
                  </div>

                  <div className="bg-gray-800/50 p-3 rounded">
                    <div className="text-sm">
                      <span className="text-gray-400">المستهدف: </span>
                      <span className="font-bold">{data.target}</span>
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
          <div className="glass-card p-6 w-[600px]">
            <h2 className="text-2xl font-bold text-gold mb-4">تطبيق خصم جديد</h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">اسم الخصم *</label>
                <input
                  type="text"
                  placeholder="مثال: تخفيضات العيد الوطني"
                  value={discountName}
                  onChange={(e) => setDiscountName(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-1 block">نوع الخصم</label>
                <select
                  value={discountType}
                  onChange={(e) => {
                    setDiscountType(e.target.value);
                    setTargetCategory('');
                    setTargetProduct('');
                  }}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                >
                  <option value="storewide">🏪 خصم عام (جميع المنتجات)</option>
                  <option value="category">📁 خصم على فئة</option>
                  <option value="item">📦 خصم على منتج محدد</option>
                </select>
              </div>

              {discountType === 'category' && (
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">اختر الفئة</label>
                  <select
                    value={targetCategory}
                    onChange={(e) => setTargetCategory(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  >
                    <option value="">اختر فئة...</option>
                    {loadingCategories ? (
                      <option disabled>جاري التحميل...</option>
                    ) : (
                      categories.map(cat => (
                        <option key={cat.id} value={cat.name}>
                          {cat.icon} {cat.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {discountType === 'item' && (
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">اختر المنتج</label>
                  <select
                    value={targetProduct}
                    onChange={(e) => setTargetProduct(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  >
                    <option value="">اختر منتج...</option>
                    {productsLoading ? (
                      <option disabled>جاري التحميل...</option>
                    ) : (
                      products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div>
                <label className="text-sm text-gray-400 mb-2 block">نسبة الخصم (%)</label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={percentage}
                  onChange={(e) => setPercentage(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="text-center text-4xl font-bold text-orange-400 mt-3">
                  {percentage}%
                </div>
              </div>

              <div className="bg-orange-600/10 border border-orange-400/30 p-3 rounded-lg">
                <div className="text-sm text-orange-400">
                  ⚠️ سيتم تطبيق الخصم مباشرة على أسعار البيع
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={applyDiscount}
                disabled={!discountName || (discountType === 'category' && !targetCategory) || (discountType === 'item' && !targetProduct) || applying}
                className="flex-1 btn-gold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applying ? '⏳ جاري التطبيق...' : '✅ تطبيق الخصم'}
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

      {/* Restore discount confirmation */}
      <ConfirmModal
        open={!!pendingRestore}
        title="إلغاء الخصم"
        icon="🔄"
        message={pendingRestore
          ? `هل تريد إلغاء الخصم "${JSON.parse(pendingRestore.content).name}"؟\nسيتم استعادة الأسعار الأصلية`
          : ''}
        confirmLabel="🔄 إلغاء الخصم"
        cancelLabel="إغلاق"
        onConfirm={restoreDiscount}
        onCancel={() => setPendingRestore(null)}
      />
    </div>
  );
};

export default DiscountsModule;
