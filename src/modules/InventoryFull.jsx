import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { useSettingsStore } from '../stores/useSettingsStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useAuthStore } from '../stores/useAuthStore.js';
import { CategoriesRepository } from '../database/repositories/CategoriesRepository.js';
import useDebounce from '../hooks/useDebounce.js';
import { getIpcRenderer } from '../utils/electronBridge.js';
import usePagination from '../hooks/usePagination.js';
import Modal from '../components/ui/Modal.jsx';
import { generateId, formatCurrency, safeParseFloat } from '../utils/helpers.js';

const categoriesRepo = new CategoriesRepository();

const PAGE_SIZE = 8;

// Premium gold button (btn-gold is referenced app-wide but not defined in CSS)
const goldButtonClass =
  'bg-gold text-[#0d1117] font-bold rounded-lg ' +
  'hover:bg-amber-300 hover:shadow-[0_0_20px_rgba(251,191,36,0.35)] ' +
  'active:scale-[0.98] transition-all duration-200 cursor-pointer ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const EMPTY_FORM = {
  name: '',
  category: '',
  qty: '0',
  cost: '0',
  price: '0',
  wholesale_price: '0',
  unit: 'piece',
  capacity: '0',
  image_url: ''
};

/* ---------------------------------------------------------------------------
 * Loading Skeleton
 * ------------------------------------------------------------------------- */
const ProductSkeleton = () => (
  <div className="glass-card p-4 animate-pulse pointer-events-none">
    <div className="flex items-start justify-between mb-3">
      <div className="flex-1">
        <div className="h-6 bg-gray-800 rounded w-1/2 mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="h-4 bg-gray-800 rounded w-3/4" />
          <div className="h-4 bg-gray-800 rounded w-2/3" />
          <div className="h-4 bg-gray-800 rounded w-4/5" />
          <div className="h-4 bg-gray-800 rounded w-1/2" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="w-9 h-9 bg-gray-800 rounded" />
        <div className="w-9 h-9 bg-gray-800 rounded" />
        <div className="w-9 h-9 bg-gray-800 rounded" />
        <div className="w-9 h-9 bg-gray-800 rounded" />
      </div>
    </div>
  </div>
);

/* ---------------------------------------------------------------------------
 * Main Module
 * ------------------------------------------------------------------------- */
const InventoryFullModule = () => {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canViewProfit = hasPermission('view_profit');

  // ---- Global state (locked contracts) ----
  const {
    products,
    loading,
    error,
    searchTerm,
    categoryFilter,
    lowStockFilter,
    loadProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    setSearchTerm,
    setCategoryFilter,
    setLowStockFilter,
    getFilteredProducts
  } = useInventoryStore();

  const { showSuccess, showError, showWarning } = useUIStore();

  // ---- Local UI state ----
  const [searchInput, setSearchInput] = useState(searchTerm); // immediate input value
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [dbCategoryNames, setDbCategoryNames] = useState([]);
  const [showQuickCatModal, setShowQuickCatModal] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');
  const [creatingQuickCat, setCreatingQuickCat] = useState(false);

  const loadDbCategories = useCallback(async () => {
    try {
      const data = await categoriesRepo.findAll({}, 'name ASC');
      if (data && data.length > 0) {
        setDbCategoryNames(data.map((c) => c.name).filter(Boolean));
      }
    } catch (e) {
      console.warn('Failed to load categories in InventoryFull:', e);
    }
  }, []);

  // ---- Load products on mount ----
  useEffect(() => {
    loadProducts();
    loadDbCategories();

    const handleRefresh = () => {
      loadProducts();
      loadDbCategories();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, [loadProducts, loadDbCategories]);

  const handleCreateQuickCategory = async () => {
    const trimmed = quickCatName.trim();
    if (!trimmed) {
      showWarning('يرجى كتابة اسم التصنيف');
      return;
    }
    setCreatingQuickCat(true);
    try {
      const existing = await categoriesRepo.findByName(trimmed);
      if (!existing) {
        await categoriesRepo.create({
          id: generateId(),
          name: trimmed,
          icon: '🏷️'
        });
      }
      await loadDbCategories();
      setFormData((prev) => ({ ...prev, category: trimmed }));
      setShowQuickCatModal(false);
      setQuickCatName('');
      showSuccess(`✅ تم إضافة واختيار فئة "${trimmed}" بنجاح`);
    } catch (err) {
      showError('خطأ أثناء إضافة التصنيف: ' + err.message);
    } finally {
      setCreatingQuickCat(false);
    }
  };

  // ---- Debounced search ----
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    setSearchTerm(debouncedSearch);
  }, [debouncedSearch, setSearchTerm]);

  // Sync store search term into the input when module mounts (persists across navigation)
  useEffect(() => {
    setSearchInput(searchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Filtered products (store computed, reactive) ----
  const filtered = useMemo(
    () => getFilteredProducts(),
    [getFilteredProducts, products, categoryFilter, lowStockFilter, searchTerm]
  );

  // ---- Categories derived from database and products ----
  const categories = useMemo(() => {
    const productCats = products.map((p) => p.category).filter(Boolean);
    const combined = [...new Set([...dbCategoryNames, ...productCats])];
    return combined.sort((a, b) => a.localeCompare(b, 'ar'));
  }, [products, dbCategoryNames]);

  const lowStockThresholdSetting = useSettingsStore((s) => s.settings.low_stock_threshold);
  const lowStockThreshold = safeParseFloat(lowStockThresholdSetting) || 10;
  const isLowStock = useCallback(
    (product) => safeParseFloat(product.qty) <= lowStockThreshold,
    [lowStockThreshold]
  );

  // ---- Stats header ----
  const stats = useMemo(() => {
    let totalStockValue = 0;
    let totalRetailValue = 0;
    let lowStockCount = 0;
    for (const p of products) {
      const qty = safeParseFloat(p.qty);
      totalStockValue += safeParseFloat(p.cost) * qty;
      totalRetailValue += safeParseFloat(p.price) * qty;
      if (qty <= lowStockThreshold) lowStockCount += 1;
    }
    return {
      totalProducts: products.length,
      totalStockValue,
      totalRetailValue,
      lowStockCount
    };
  }, [products, lowStockThreshold]);

  // ---- Pagination ----
  const {
    page,
    pageSize,
    offset,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextPage,
    prevPage,
    goToPage,
    reset
  } = usePagination({ totalItems: filtered.length, initialPageSize: PAGE_SIZE });

  // Reset to first page whenever the result set changes
  useEffect(() => {
    reset();
  }, [reset, debouncedSearch, categoryFilter, lowStockFilter, products.length]);

  const paginatedProducts = useMemo(
    () => filtered.slice(offset, offset + pageSize),
    [filtered, offset, pageSize]
  );

  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxShown = 5;
    let start = Math.max(1, page - Math.floor(maxShown / 2));
    const end = Math.min(totalPages, start + maxShown - 1);
    start = Math.max(1, end - maxShown + 1);
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  }, [page, totalPages]);

  // ---- Form helpers ----
  const openCreateForm = () => {
    setEditingProduct(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
    setFormOpen(true);
  };

  const handlePrintStockSheet = async () => {
    try {
      const ipc = getIpcRenderer();
      if (ipc) {
        await ipc.invoke('print:inventory-report', {
          products: filtered,
          totalCost: stats.totalStockValue,
          totalRetail: stats.totalRetailValue,
          lowStockCount: stats.lowStockCount
        });
        showSuccess('تم فتح كشف الجرد للمعاينة والطباعة');
      } else {
        window.print();
      }
    } catch (err) {
      showError(`فشل طباعة كشف الجرد: ${err.message}`);
    }
  };

  const openEditForm = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name || '',
      category: product.category || '',
      qty: String(product.qty ?? ''),
      cost: String(product.cost ?? ''),
      price: String(product.price ?? ''),
      wholesale_price: String(product.wholesale_price ?? ''),
      unit: product.unit || 'piece',
      capacity: String(product.capacity ?? ''),
      image_url: product.image_url || ''
    });
    setFormErrors({});
    setFormOpen(true);
  };

  // Unguarded close — used internally after a successful save.
  const closeForm = () => {
    setFormOpen(false);
    setEditingProduct(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
  };

  // User-initiated close — blocked while a save is in flight.
  const handleCancelForm = () => {
    if (saving) return;
    closeForm();
  };

  const updateFormField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showWarning('حجم الصورة يجب أن لا يتجاوز 2 ميغابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateFormField('image_url', reader.result);
    };
    reader.readAsDataURL(file);
  };

  // ---- Validation: name required, prices >= 0 ----
  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) {
      errors.name = 'اسم المنتج مطلوب';
    }
    if (safeParseFloat(formData.qty) < 0) {
      errors.qty = 'الكمية يجب أن تكون أكبر من أو تساوي صفر';
    }
    if (safeParseFloat(formData.cost) < 0) {
      errors.cost = 'التكلفة يجب أن تكون أكبر من أو تساوي صفر';
    }
    if (safeParseFloat(formData.price) < 0) {
      errors.price = 'سعر التجزئة يجب أن يكون أكبر من أو يساوي صفر';
    }
    if (safeParseFloat(formData.wholesale_price) < 0) {
      errors.wholesale_price = 'سعر الجملة يجب أن يكون أكبر من أو يساوي صفر';
    }
    if (safeParseFloat(formData.capacity) < 0) {
      errors.capacity = 'السعة يجب أن تكون أكبر من أو تساوي صفر';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ---- Save (create / update) ----
  const handleSave = async () => {
    if (!validateForm()) {
      showError('يرجى تصحيح الأخطاء في النموذج');
      return;
    }

    setSaving(true);
    const payload = {
      name: formData.name.trim(),
      category: formData.category,
      qty: safeParseFloat(formData.qty),
      cost: safeParseFloat(formData.cost),
      price: safeParseFloat(formData.price),
      wholesale_price: safeParseFloat(formData.wholesale_price),
      unit: formData.unit,
      capacity: safeParseFloat(formData.capacity),
      image_url: formData.image_url || null
    };

    try {
      if (editingProduct) {
        const result = await updateProduct(editingProduct.id, payload);
        if (result.success) {
          showSuccess(`✅ تم تحديث المنتج "${payload.name}" بنجاح`);
          closeForm();
        } else {
          showError(`خطأ في تحديث المنتج: ${result.error}`);
        }
      } else {
        const result = await addProduct({ id: generateId(), ...payload });
        if (result.success) {
          showSuccess(`✅ تم إضافة المنتج "${payload.name}" بنجاح`);
          closeForm();
        } else {
          showError(`خطأ في إضافة المنتج: ${result.error}`);
        }
      }
    } catch (err) {
      showError(`خطأ في حفظ المنتج: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ---- Delete (confirmed via modal) ----
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const targetName = deleteTarget.name;
    const targetId = deleteTarget.id;
    try {
      const result = await deleteProduct(targetId, targetName);
      if (result.success) {
        showSuccess(`✅ تم حذف المنتج "${targetName}" بنجاح`);
      } else {
        showError(`خطأ في حذف المنتج: ${result.error}`);
      }
    } catch (err) {
      showError(`خطأ في حذف المنتج: ${err.message}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  // ---- Stock adjust (+/-) via store updateProduct ----
  const handleAdjustStock = async (product, delta) => {
    const newQty = Math.max(0, safeParseFloat(product.qty) + delta);
    try {
      const result = await updateProduct(product.id, { qty: newQty });
      if (result.success) {
        showSuccess(`تم تحديث كمية "${product.name}" إلى ${newQty}`);
      } else {
        showError(`خطأ في تعديل الكمية: ${result.error}`);
      }
    } catch (err) {
      showError(`خطأ في تعديل الكمية: ${err.message}`);
    }
  };

  // ---- Export CSV (client-side) ----
  const handleExportCSV = () => {
    if (filtered.length === 0) {
      showWarning('لا توجد منتجات للتصدير');
      return;
    }

    const headers = [
      'الاسم',
      'الفئة',
      'الكمية',
      'الوحدة',
      'التكلفة',
      'سعر التجزئة',
      'سعر الجملة',
      'السعة (مل)'
    ];

    const escapeCell = (value) => {
      const str = String(value ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const rows = filtered.map((p) =>
      [
        p.name,
        p.category || '',
        p.qty,
        p.unit || '',
        p.cost,
        p.price,
        p.wholesale_price,
        p.capacity > 0 ? p.capacity : ''
      ]
        .map(escapeCell)
        .join(',')
    );

    const csv = [headers.map(escapeCell).join(','), ...rows].join('\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSuccess(`📥 تم تصدير ${filtered.length} منتج إلى CSV`);
  };

  // ---- Derived flags ----
  const hasActiveFilters = Boolean(searchTerm || categoryFilter !== 'all' || lowStockFilter);
  const showSkeletons = loading && products.length === 0;
  const showEmptyState = !showSkeletons && filtered.length === 0;

  const formCost = safeParseFloat(formData.cost);
  const formPrice = safeParseFloat(formData.price);
  const formWholesale = safeParseFloat(formData.wholesale_price);

  /* =========================================================================
   * RENDER
   * ======================================================================== */
  return (
    <div className="h-full flex flex-col glass-card p-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span aria-hidden="true">📦</span>
          <span>إدارة المخزون</span>
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePrintStockSheet}
            className="px-4 py-2 bg-[#161b22] text-[#fbbf24] border border-[#fbbf24]/30 font-bold rounded-lg hover:bg-[#fbbf24]/10 transition-all cursor-pointer flex items-center gap-1.5"
            title="طباعة كشف جرد المخزون A4"
          >
            <span>🖨️</span>
            <span>كشف الجرد (A4)</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-4 py-2 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition-all cursor-pointer"
            title="تصدير المنتجات إلى CSV"
          >
            📥 تصدير CSV
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className={`px-4 py-2 ${goldButtonClass}`}
          >
            ➕ منتج جديد
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 bg-red-600/10 border border-red-500/30 p-3 rounded-lg text-red-400 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="bg-gray-800/70 border border-white/5 p-3 rounded-lg">
          <div className="text-sm text-gray-400 flex items-center gap-1">
            <span aria-hidden="true">📦</span> إجمالي المنتجات
          </div>
          <div className="text-2xl font-bold text-gold mt-1">{stats.totalProducts}</div>
        </div>
        <div className="bg-gray-800/70 border border-white/5 p-3 rounded-lg">
          <div className="text-sm text-gray-400 flex items-center gap-1">
            <span aria-hidden="true">💰</span> قيمة المخزون (تكلفة)
          </div>
          <div className="text-2xl font-bold text-green-400 mt-1">
            {canViewProfit ? formatCurrency(stats.totalStockValue) : '••••••'}
          </div>
        </div>
        <div className="bg-gray-800/70 border border-white/5 p-3 rounded-lg">
          <div className="text-sm text-gray-400 flex items-center gap-1">
            <span aria-hidden="true">🏷️</span> قيمة البيع (تجزئة)
          </div>
          <div className="text-2xl font-bold text-gold mt-1">
            {formatCurrency(stats.totalRetailValue)}
          </div>
        </div>
        <div className="bg-gray-800/70 border border-white/5 p-3 rounded-lg">
          <div className="text-sm text-gray-400 flex items-center gap-1">
            <span aria-hidden="true">⚠️</span> مخزون منخفض
          </div>
          <div className="text-2xl font-bold text-red-400 mt-1">{stats.lowStockCount}</div>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="🔍 بحث بالاسم أو الباركود..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="flex-1 min-w-[200px] bg-gray-800 text-white px-4 py-2.5 rounded-lg border border-gold/30 focus:outline-none focus:border-gold transition-colors"
          aria-label="بحث في المنتجات"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-gray-800 text-white px-4 py-2.5 rounded-lg border border-gold/30 focus:outline-none focus:border-gold transition-colors cursor-pointer"
          aria-label="تصفية حسب الفئة"
        >
          <option value="all">كل الفئات</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              📁 {cat}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setLowStockFilter(!lowStockFilter)}
          className={`px-4 py-2.5 rounded-lg font-bold transition-all cursor-pointer ${
            lowStockFilter
              ? 'bg-red-600 text-white shadow-[0_0_16px_rgba(239,68,68,0.35)]'
              : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          aria-pressed={lowStockFilter}
        >
          ⚠️ مخزون منخفض
        </button>
      </div>

      {/* Product list / grid */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {showSkeletons ? (
          <div className="space-y-2">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        ) : showEmptyState ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div
              className="text-7xl mb-5 opacity-90 animate-pulse"
              aria-hidden="true"
            >
              📦
            </div>
            <h3 className="text-xl font-bold text-gray-300 mb-2">
              {hasActiveFilters ? 'لا توجد نتائج مطابقة' : 'لا توجد منتجات بعد'}
            </h3>
            <p className="text-gray-500 mb-6 max-w-sm">
              {hasActiveFilters
                ? 'جرّب تغيير كلمة البحث أو الفلاتر للعثور على ما تبحث عنه.'
                : 'ابدأ بإضافة منتجك الأول إلى المخزون لإدارته هنا.'}
            </p>
            {!hasActiveFilters && (
              <button
                type="button"
                onClick={openCreateForm}
                className={`px-6 py-2.5 ${goldButtonClass}`}
              >
                ➕ إضافة أول منتج
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {paginatedProducts.map((product) => (
              <div
                key={product.id}
                className="glass-card p-4 hover:border-gold/50 transition-all"
              >
                <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
                  <div className="flex gap-3 flex-1 min-w-[220px]">
                    {/* Product Image Thumbnail */}
                    <div className="w-16 h-16 rounded-xl bg-[#161b22] border border-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-inner">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'block';
                          }}
                        />
                      ) : null}
                      <span
                        className="text-2xl"
                        style={{ display: product.image_url ? 'none' : 'block' }}
                        aria-hidden="true"
                      >
                        🧴
                      </span>
                    </div>

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="text-xl font-bold text-gold truncate">
                          {product.name}
                        </h3>
                        {isLowStock(product) && (
                          <span className="badge badge-danger" title="الكمية أقل من أو تساوي 10">
                            ⚠️ مخزون منخفض
                          </span>
                        )}
                        {product.category && (
                          <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded">
                            📁 {product.category}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-2">
                        <div>
                          <span className="text-gray-400">الكمية: </span>
                          <span
                            className={`font-bold ${
                              isLowStock(product) ? 'text-red-400' : 'text-green-400'
                            }`}
                          >
                            {safeParseFloat(product.qty)} {product.unit || 'قطعة'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">التكلفة: </span>
                          <span className="font-bold">
                            {canViewProfit ? formatCurrency(safeParseFloat(product.cost)) : '••••••'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">التجزئة: </span>
                          <span className="font-bold text-gold">
                            {formatCurrency(safeParseFloat(product.price))}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400">الجملة: </span>
                          <span className="font-bold">
                            {formatCurrency(safeParseFloat(product.wholesale_price))}
                          </span>
                        </div>
                      </div>
                      {safeParseFloat(product.capacity) > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          السعة: {safeParseFloat(product.capacity)}ml
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleAdjustStock(product, -1)}
                      className="bg-red-600 text-white w-9 h-9 rounded hover:bg-red-700 transition-colors cursor-pointer text-lg leading-none"
                      title="خصم وحدة"
                      aria-label={`خصم وحدة من ${product.name}`}
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAdjustStock(product, 1)}
                      className="bg-green-600 text-white w-9 h-9 rounded hover:bg-green-700 transition-colors cursor-pointer text-lg leading-none"
                      title="إضافة وحدة"
                      aria-label={`إضافة وحدة إلى ${product.name}`}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditForm(product)}
                      className="bg-blue-600 text-white w-9 h-9 rounded hover:bg-blue-700 transition-colors cursor-pointer"
                      title="تعديل المنتج"
                      aria-label={`تعديل ${product.name}`}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(product)}
                      className="bg-gray-700 text-red-400 w-9 h-9 rounded hover:bg-red-600 hover:text-white transition-colors cursor-pointer"
                      title="حذف المنتج"
                      aria-label={`حذف ${product.name}`}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination footer */}
      {filtered.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-gray-500">
            عرض{' '}
            <span className="text-gray-300 font-bold">{offset + 1}</span> -{' '}
            <span className="text-gray-300 font-bold">
              {Math.min(offset + pageSize, filtered.length)}
            </span>{' '}
            من <span className="text-gray-300 font-bold">{filtered.length}</span> منتج
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={prevPage}
              disabled={!hasPrevPage}
              className="px-3 py-1.5 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="الصفحة السابقة"
            >
              السابق
            </button>

            {pageNumbers.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => goToPage(p)}
                className={`w-9 h-9 rounded-lg font-bold transition-colors cursor-pointer ${
                  p === page
                    ? 'bg-gold text-[#0d1117]'
                    : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
                aria-label={`الصفحة ${p}`}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </button>
            ))}

            <button
              type="button"
              onClick={nextPage}
              disabled={!hasNextPage}
              className="px-3 py-1.5 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="الصفحة التالية"
            >
              التالي
            </button>
          </div>
        </div>
      )}

      {/* ---- Product form modal ---- */}
      <Modal
        open={formOpen}
        onClose={handleCancelForm}
        title={editingProduct ? '✏️ تعديل منتج' : '➕ منتج جديد'}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={handleCancelForm}
              disabled={saving}
              className="px-6 py-2.5 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-600 disabled:opacity-40 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={`px-6 py-2.5 ${goldButtonClass} inline-flex items-center gap-2`}
            >
              {saving ? (
                <span className="spinner !w-4 !h-4" aria-hidden="true" />
              ) : (
                <span aria-hidden="true">{editingProduct ? '✅' : '💾'}</span>
              )}
              {editingProduct ? 'تحديث' : 'حفظ'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="inv-product-name" className="text-sm text-gray-400 mb-1 block">
              اسم المنتج <span className="text-red-400">*</span>
            </label>
            <input
              id="inv-product-name"
              type="text"
              placeholder="اسم المنتج..."
              value={formData.name}
              onChange={(e) => updateFormField('name', e.target.value)}
              className={`input-luxury ${formErrors.name ? 'border-red-500/50' : ''}`}
              autoFocus
            />
            {formErrors.name && (
              <p className="text-red-400 text-xs mt-1" role="alert">
                {formErrors.name}
              </p>
            )}
          </div>

          {/* Category */}
          <div>
            <label htmlFor="inv-product-category" className="text-sm text-gray-400 mb-1 block">
              الفئة
            </label>
            <div className="flex items-center gap-1.5">
              <select
                id="inv-product-category"
                value={formData.category}
                onChange={(e) => updateFormField('category', e.target.value)}
                className="select-luxury flex-1"
              >
                <option value="">بدون فئة</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    📁 {cat}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setQuickCatName('');
                  setShowQuickCatModal(true);
                }}
                className="px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold shrink-0 cursor-pointer"
                title="إضافة تصنيف جديد"
              >
                ➕
              </button>
            </div>
          </div>

          {/* Qty + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="inv-product-qty" className="text-sm text-gray-400 mb-1 block">
                الكمية
              </label>
              <input
                id="inv-product-qty"
                type="number"
                min="0"
                step="0.1"
                value={formData.qty}
                onChange={(e) => updateFormField('qty', e.target.value)}
                className={`input-luxury ${formErrors.qty ? 'border-red-500/50' : ''}`}
              />
              {formErrors.qty && (
                <p className="text-red-400 text-xs mt-1" role="alert">
                  {formErrors.qty}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="inv-product-unit" className="text-sm text-gray-400 mb-1 block">
                الوحدة
              </label>
              <select
                id="inv-product-unit"
                value={formData.unit}
                onChange={(e) => updateFormField('unit', e.target.value)}
                className="select-luxury"
              >
                <option value="piece">قطعة</option>
                <option value="bottle">زجاجة</option>
                <option value="box">علبة</option>
                <option value="ml">مل</option>
                <option value="liter">لتر</option>
              </select>
            </div>
          </div>

          {/* Cost / Retail / Wholesale */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="inv-product-cost" className="text-sm text-gray-400 mb-1 block">
                التكلفة
              </label>
              <input
                id="inv-product-cost"
                type="number"
                min="0"
                step="0.01"
                value={formData.cost}
                onChange={(e) => updateFormField('cost', e.target.value)}
                className={`input-luxury ${formErrors.cost ? 'border-red-500/50' : ''}`}
              />
              {formErrors.cost && (
                <p className="text-red-400 text-xs mt-1" role="alert">
                  {formErrors.cost}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="inv-product-price" className="text-sm text-gray-400 mb-1 block">
                سعر التجزئة
              </label>
              <input
                id="inv-product-price"
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={(e) => updateFormField('price', e.target.value)}
                className={`input-luxury ${formErrors.price ? 'border-red-500/50' : ''}`}
              />
              {formErrors.price && (
                <p className="text-red-400 text-xs mt-1" role="alert">
                  {formErrors.price}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="inv-product-wholesale" className="text-sm text-gray-400 mb-1 block">
                سعر الجملة
              </label>
              <input
                id="inv-product-wholesale"
                type="number"
                min="0"
                step="0.01"
                value={formData.wholesale_price}
                onChange={(e) => updateFormField('wholesale_price', e.target.value)}
                className={`input-luxury ${formErrors.wholesale_price ? 'border-red-500/50' : ''}`}
              />
              {formErrors.wholesale_price && (
                <p className="text-red-400 text-xs mt-1" role="alert">
                  {formErrors.wholesale_price}
                </p>
              )}
            </div>
          </div>

          {/* Capacity */}
          <div>
            <label htmlFor="inv-product-capacity" className="text-sm text-gray-400 mb-1 block">
              السعة (مل) - للعطور
            </label>
            <input
              id="inv-product-capacity"
              type="number"
              min="0"
              step="1"
              value={formData.capacity}
              onChange={(e) => updateFormField('capacity', e.target.value)}
              className={`input-luxury ${formErrors.capacity ? 'border-red-500/50' : ''}`}
            />
            {formErrors.capacity && (
              <p className="text-red-400 text-xs mt-1" role="alert">
                {formErrors.capacity}
              </p>
            )}
          </div>

          {/* Product Image Ingestion (File & URL) */}
          <div className="bg-[#0d1117] border border-white/10 p-3.5 rounded-xl space-y-3">
            <label className="text-sm font-bold text-gold block">
              🖼️ صورة المنتج (محلي أو رابط ويب)
            </label>
            
            <div className="flex items-center gap-3">
              {formData.image_url ? (
                <div className="relative w-16 h-16 rounded-xl border border-gold/40 overflow-hidden bg-black/40 flex-shrink-0">
                  <img
                    src={formData.image_url}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => updateFormField('image_url', '')}
                    className="absolute top-0 right-0 bg-red-600/90 text-white w-5 h-5 text-xs flex items-center justify-center rounded-bl"
                    title="حذف الصورة"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center text-gray-500 text-xs flex-shrink-0">
                  <span>لا توجد</span>
                  <span>صورة</span>
                </div>
              )}

              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  placeholder="رابط الصورة المباشر (https://...)"
                  value={formData.image_url}
                  onChange={(e) => updateFormField('image_url', e.target.value)}
                  className="input-luxury !py-1.5 !text-xs text-left"
                  dir="ltr"
                />
                
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer px-3 py-1 bg-[#161b22] text-[#adbac7] hover:text-white border border-white/10 hover:border-white/30 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5">
                    <span>📁 اختيار ملف من الجهاز</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-gray-500">يدعم PNG, JPG, WebP</span>
                </div>
              </div>
            </div>
          </div>

          {/* Profit margin preview */}
          {formPrice > 0 && formCost > 0 && (
            <div className="bg-green-600/10 border border-green-400/30 p-3 rounded-lg">
              <div className="text-sm text-green-400">
                💰 هامش الربح (تجزئة): {formatCurrency(formPrice - formCost)} (
                {((formPrice - formCost) / formPrice) * 100}%)
              </div>
              {formWholesale > 0 && (
                <div className="text-sm text-green-400 mt-1">
                  💰 هامش الربح (جملة): {formatCurrency(formWholesale - formCost)} (
                  {((formWholesale - formCost) / formWholesale) * 100}%)
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ---- Delete confirmation modal ---- */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="🗑️ تأكيد الحذف"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-6 py-2.5 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-600 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors cursor-pointer"
            >
              🗑️ حذف
            </button>
          </>
        }
      >
        <p className="text-gray-300">
          هل أنت متأكد من حذف المنتج{' '}
          <span className="font-bold text-gold">"{deleteTarget?.name}"</span>؟
        </p>
        <p className="text-gray-500 text-sm mt-2">لا يمكن التراجع عن هذا الإجراء.</p>
      </Modal>

      {/* ---- Quick Add Category Modal ---- */}
      <Modal
        open={showQuickCatModal}
        onClose={() => setShowQuickCatModal(false)}
        title="🏷️ إضافة تصنيف جديد للمخزون"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowQuickCatModal(false)}
              className="px-6 py-2.5 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-600 transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleCreateQuickCategory}
              disabled={creatingQuickCat || !quickCatName.trim()}
              className={`px-6 py-2.5 ${goldButtonClass}`}
            >
              {creatingQuickCat ? '⏳ جاري الحفظ...' : '➕ حفظ واختيار التصنيف'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="text-sm text-gray-400 block">اسم التصنيف الجديد:</label>
          <input
            type="text"
            placeholder="مثال: عطور ملكية، بخور فاخر، مستلزمات تركيب..."
            value={quickCatName}
            onChange={(e) => setQuickCatName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateQuickCategory();
            }}
            className="input-luxury w-full"
            autoFocus
          />
          <p className="text-xs text-gray-500">
            سيتم حفظ التصنيف في قاعدة البيانات واعتماده فوراً للمنتج الحالي وكافة أقسام المنظومة.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default InventoryFullModule;
