import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { useSettingsStore } from '../stores/useSettingsStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useAuthStore } from '../stores/useAuthStore.js';
import { CategoriesRepository } from '../database/repositories/CategoriesRepository.js';
import { SuppliersRepository } from '../database/repositories/SuppliersRepository.js';
import { PurchasesRepository } from '../database/repositories/PurchasesRepository.js';
import useDebounce from '../hooks/useDebounce.js';
import { getIpcRenderer } from '../utils/electronBridge.js';
import usePagination from '../hooks/usePagination.js';
import Modal from '../components/ui/Modal.jsx';
import { generateId, formatCurrency, safeParseFloat } from '../utils/helpers.js';

const categoriesRepo = new CategoriesRepository();
const suppliersRepo = new SuppliersRepository();
const purchasesRepo = new PurchasesRepository();

const PAGE_SIZE = 8;

const goldButtonClass =
  'bg-gold text-[#0d1117] font-bold rounded-lg ' +
  'hover:bg-amber-300 hover:shadow-[0_0_20px_rgba(251,191,36,0.35)] ' +
  'active:scale-[0.98] transition-all duration-200 cursor-pointer ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

// Perfume-specialized item types
const ITEM_TYPES = [
  { id: 'ready_perfume', label: 'عطر جاهز (مقفول)', icon: '🧴', defaultUnit: 'piece' },
  { id: 'raw_oil', label: 'زيت عطري خام', icon: '🧪', defaultUnit: 'ml' },
  { id: 'empty_bottle', label: 'زجاجة فارغة / بخاخ', icon: '🏺', defaultUnit: 'piece' },
  { id: 'alcohol_fixative', label: 'كحول ومثبتات سكب', icon: '💧', defaultUnit: 'liter' },
  { id: 'accessory', label: 'إكسسوارات وهدايا', icon: '🎁', defaultUnit: 'piece' }
];

const AVAILABLE_UNITS = [
  { id: 'piece', label: 'قطعة (حبة)' },
  { id: 'ml', label: 'ملليتر (مل)' },
  { id: 'g', label: 'جرام (g)' },
  { id: 'bottle', label: 'زجاجة' },
  { id: 'box', label: 'علبة / كرتونة' },
  { id: 'liter', label: 'لتر' },
  { id: 'dozen', label: 'درزن (12)' }
];

const EMPTY_FORM = {
  name: '',
  category: '',
  qty: '0',
  cost: '0',
  price: '0',
  wholesale_price: '0',
  unit: 'piece',
  capacity: '0',
  image_url: '',
  barcode: '',
  min_qty: '5',
  item_type: 'ready_perfume',
  shelf_location: '',
  notes: ''
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

  // ---- Global state ----
  const {
    products,
    loading,
    searchTerm,
    categoryFilter,
    itemTypeFilter,
    lowStockFilter,
    loadProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    setSearchTerm,
    setCategoryFilter,
    setItemTypeFilter,
    setLowStockFilter,
    batchUpdatePrices,
    getFilteredProducts
  } = useInventoryStore();

  const { showSuccess, showError, showWarning } = useUIStore();

  // ---- Local UI state ----
  const [searchInput, setSearchInput] = useState(searchTerm);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [dbCategoryNames, setDbCategoryNames] = useState([]);
  const [suppliersList, setSuppliersList] = useState([]);

  // Category Quick Add
  const [showQuickCatModal, setShowQuickCatModal] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');
  const [creatingQuickCat, setCreatingQuickCat] = useState(false);

  // Quick Restock Modal
  const [restockTarget, setRestockTarget] = useState(null);
  const [restockForm, setRestockForm] = useState({ qty: '1', cost: '0', supplier: '', notes: '' });
  const [restocking, setRestocking] = useState(false);

  // Batch Price Update Modal
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchForm, setBatchForm] = useState({
    category: 'all',
    itemType: 'all',
    adjustmentType: 'percent_increase',
    value: '10'
  });
  const [applyingBatch, setApplyingBatch] = useState(false);

  // Inline Editing state on cards { productId, field: 'price'|'wholesale_price'|'qty', value }
  const [inlineEdit, setInlineEdit] = useState({ productId: null, field: null, value: '' });

  // File input ref for CSV import
  const fileInputRef = useRef(null);

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

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await suppliersRepo.findAll({}, 'name ASC');
      if (data && data.length > 0) {
        setSuppliersList(data);
      }
    } catch (e) {
      console.warn('Failed to load suppliers:', e);
    }
  }, []);

  // ---- Load products and aux data on mount ----
  useEffect(() => {
    loadProducts();
    loadDbCategories();
    loadSuppliers();

    const handleRefresh = () => {
      loadProducts();
      loadDbCategories();
      loadSuppliers();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, [loadProducts, loadDbCategories, loadSuppliers]);

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

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  // ---- Filtered products ----
  const filtered = useMemo(
    () => getFilteredProducts(),
    [getFilteredProducts, products, categoryFilter, itemTypeFilter, lowStockFilter, searchTerm]
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
    (product) => {
      const threshold = product.min_qty !== undefined && product.min_qty !== null ? safeParseFloat(product.min_qty) : lowStockThreshold;
      return safeParseFloat(product.qty) <= threshold;
    },
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
      const threshold = p.min_qty !== undefined && p.min_qty !== null ? safeParseFloat(p.min_qty) : lowStockThreshold;
      if (qty <= threshold) lowStockCount += 1;
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

  useEffect(() => {
    reset();
  }, [reset, debouncedSearch, categoryFilter, itemTypeFilter, lowStockFilter, products.length]);

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
      image_url: product.image_url || '',
      barcode: product.barcode || '',
      min_qty: String(product.min_qty ?? '5'),
      item_type: product.item_type || 'ready_perfume',
      shelf_location: product.shelf_location || '',
      notes: product.notes || ''
    });
    setFormErrors({});
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingProduct(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
  };

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

  // Smart unit adaptation on item_type change
  const handleItemTypeChange = (newType) => {
    const meta = ITEM_TYPES.find((t) => t.id === newType);
    setFormData((prev) => {
      const currentMeta = ITEM_TYPES.find((t) => t.id === prev.item_type);
      const isDefault = !prev.unit || prev.unit === currentMeta?.defaultUnit;
      return {
        ...prev,
        item_type: newType,
        unit: isDefault && meta ? meta.defaultUnit : prev.unit
      };
    });
  };

  // Barcode generator
  const handleGenerateBarcode = () => {
    const code = '628' + Math.floor(100000000 + Math.random() * 900000000);
    updateFormField('barcode', code);
    showSuccess(`⚡ تم توليد باركود فريد: ${code}`);
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

  // Form Validation
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

  // Save (create / update)
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
      image_url: formData.image_url || null,
      barcode: formData.barcode?.trim() || null,
      min_qty: safeParseFloat(formData.min_qty) || 5,
      item_type: formData.item_type || 'ready_perfume',
      shelf_location: formData.shelf_location?.trim() || null,
      notes: formData.notes?.trim() || null
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

  // Delete product
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      const result = await deleteProduct(deleteTarget.id, deleteTarget.name);
      if (result.success) {
        showSuccess(`🗑️ تم حذف المنتج "${deleteTarget.name}"`);
        setDeleteTarget(null);
      } else {
        showError(`خطأ في حذف المنتج: ${result.error}`);
      }
    } catch (err) {
      showError(`خطأ في حذف المنتج: ${err.message}`);
    }
  };

  // Quick adjust stock +1 / -1
  const handleAdjustStock = async (product, delta) => {
    const currentQty = safeParseFloat(product.qty);
    const newQty = Math.max(0, currentQty + delta);
    if (newQty === currentQty && delta < 0) return;
    try {
      const result = await updateProduct(product.id, { qty: newQty });
      if (result.success) {
        showSuccess(`تم تحديث كمية "${product.name}" إلى ${newQty}`);
      } else {
        showError(`فشل تعديل الكمية: ${result.error}`);
      }
    } catch (err) {
      showError(`فشل تعديل الكمية: ${err.message}`);
    }
  };

  // Inline Quick Edit Save
  const handleSaveInlineEdit = async (product) => {
    if (!inlineEdit.productId || inlineEdit.productId !== product.id) return;
    const num = safeParseFloat(inlineEdit.value);
    if (num < 0) {
      showWarning('القيمة لا يمكن أن تكون سالبة');
      return;
    }
    try {
      const field = inlineEdit.field;
      const res = await updateProduct(product.id, { [field]: num });
      if (res.success) {
        showSuccess(`✅ تم تحديث ${field === 'price' ? 'السعر' : field === 'wholesale_price' ? 'سعر الجملة' : 'الكمية'} بنجاح`);
        setInlineEdit({ productId: null, field: null, value: '' });
      } else {
        showError(`فشل الحفظ: ${res.error}`);
      }
    } catch (e) {
      showError(`فشل الحفظ: ${e.message}`);
    }
  };

  // Quick Restock execution
  const handleExecuteRestock = async () => {
    if (!restockTarget) return;
    const addQty = safeParseFloat(restockForm.qty);
    const unitCost = safeParseFloat(restockForm.cost);
    if (addQty <= 0) {
      showWarning('يرجى إدخال كمية توريد أكبر من صفر');
      return;
    }
    if (unitCost < 0) {
      showWarning('سعر التكلفة لا يمكن أن يكون سالباً');
      return;
    }

    setRestocking(true);
    try {
      // 1. Calculate WAC & update inventory stock
      const currentQty = safeParseFloat(restockTarget.qty);
      const currentCost = safeParseFloat(restockTarget.cost);
      const totalQty = currentQty + addQty;
      const newWac = totalQty === 0 ? unitCost : (currentQty * currentCost + addQty * unitCost) / totalQty;

      await updateProduct(restockTarget.id, {
        qty: totalQty,
        cost: Math.round(newWac * 100) / 100
      });

      // 2. Record purchase transaction for accounting synchronization
      try {
        await purchasesRepo.create({
          date: new Date().toISOString(),
          supplier_name: restockForm.supplier.trim() || 'مورد عام',
          total: Math.round(addQty * unitCost * 100) / 100,
          paid: Math.round(addQty * unitCost * 100) / 100,
          remaining: 0,
          items_json: JSON.stringify([
            {
              productId: restockTarget.id,
              name: restockTarget.name,
              qty: addQty,
              cost: unitCost,
              unit: restockTarget.unit || 'piece'
            }
          ]),
          payment_type: 'cash',
          notes: restockForm.notes.trim() || `توريد سريع لصنف: ${restockTarget.name}`
        });
      } catch (errP) {
        console.warn('Purchase record creation notice:', errP.message);
      }

      showSuccess(`✅ تم استلام ${addQty} ${restockTarget.unit || 'وحدة'} وتحديث التكلفة والمخزون بنجاح`);
      setRestockTarget(null);
      setRestockForm({ qty: '1', cost: '0', supplier: '', notes: '' });
      await loadProducts(true);
    } catch (err) {
      showError(`فشل التوريد السريع: ${err.message}`);
    } finally {
      setRestocking(false);
    }
  };

  // Batch price update handler
  const handleApplyBatchUpdate = async () => {
    const val = safeParseFloat(batchForm.value);
    if (val <= 0) {
      showWarning('يرجى إدخال قيمة تعديل صالحة أكبر من صفر');
      return;
    }

    setApplyingBatch(true);
    try {
      const res = await batchUpdatePrices(batchForm);
      if (res.success) {
        showSuccess(`✅ تم تحديث أسعار ${res.count} منتج بنجاح`);
        setShowBatchModal(false);
      } else {
        showError(`فشل التعديل الجماعي: ${res.error}`);
      }
    } catch (e) {
      showError(`فشل التعديل الجماعي: ${e.message}`);
    } finally {
      setApplyingBatch(false);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (filtered.length === 0) {
      showWarning('لا توجد منتجات للتصدير');
      return;
    }

    const headers = [
      'المعرف',
      'الاسم',
      'نوع الصنف',
      'الفئة',
      'الكمية',
      'الوحدة',
      'التكلفة',
      'سعر التجزئة',
      'سعر الجملة',
      'السعة (مل)',
      'الباركود',
      'موقع الرف',
      'حد النواقص',
      'ملاحظات'
    ];

    const escapeCell = (value) => {
      const str = String(value ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const rows = filtered.map((p) =>
      [
        p.id,
        p.name,
        p.item_type || 'ready_perfume',
        p.category || '',
        p.qty,
        p.unit || 'piece',
        p.cost,
        p.price,
        p.wholesale_price,
        p.capacity > 0 ? p.capacity : '',
        p.barcode || '',
        p.shelf_location || '',
        p.min_qty || 5,
        p.notes || ''
      ]
        .map(escapeCell)
        .join(',')
    );

    const csv = [headers.map(escapeCell).join(','), ...rows].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `كشف_المخزون_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSuccess(`📥 تم تصدير ${filtered.length} منتج إلى ملف Excel/CSV بنجاح`);
  };

  // CSV Import
  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length <= 1) {
          showWarning('الملف فارغ أو لا يحتوي على بيانات كافية');
          return;
        }

        let importedCount = 0;
        // Skip header line
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          // Simple CSV split with quotes handling
          const cols = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
          if (!cols || cols.length < 2) continue;

          const clean = (val) => String(val || '').replace(/^"|"$/g, '').trim();
          const name = clean(cols[1] || cols[0]);
          if (!name) continue;

          const itemType = clean(cols[2]) || 'ready_perfume';
          const cat = clean(cols[3]);
          const qty = safeParseFloat(clean(cols[4]));
          const unit = clean(cols[5]) || 'piece';
          const cost = safeParseFloat(clean(cols[6]));
          const price = safeParseFloat(clean(cols[7]));
          const wholesale = safeParseFloat(clean(cols[8]));
          const capacity = safeParseFloat(clean(cols[9]));
          const barcode = clean(cols[10]);
          const shelf = clean(cols[11]);
          const minQty = safeParseFloat(clean(cols[12])) || 5;

          await addProduct({
            id: generateId(),
            name,
            item_type: itemType,
            category: cat,
            qty,
            unit,
            cost,
            price,
            wholesale_price: wholesale,
            capacity,
            barcode,
            shelf_location: shelf,
            min_qty: minQty
          });
          importedCount++;
        }

        showSuccess(`✅ تم استيراد ${importedCount} صنفاً بنجاح إلى المخزون`);
        await loadProducts(true);
      } catch (err) {
        showError(`فشل استيراد الملف: ${err.message}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Derived flags
  const hasActiveFilters = Boolean(
    searchTerm || categoryFilter !== 'all' || itemTypeFilter !== 'all' || lowStockFilter
  );
  const showSkeletons = loading && products.length === 0;
  const showEmptyState = !showSkeletons && filtered.length === 0;

  // Live profit margin calculation in form
  const formCost = safeParseFloat(formData.cost);
  const formPrice = safeParseFloat(formData.price);
  const formWholesale = safeParseFloat(formData.wholesale_price);
  const profitMarginPercent = formCost > 0 ? (((formPrice - formCost) / formCost) * 100).toFixed(1) : null;
  const netProfitUnit = formPrice - formCost;

  /* =========================================================================
   * RENDER
   * ======================================================================== */
  return (
    <div className="h-full flex flex-col glass-card p-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
            <span aria-hidden="true">📦</span>
            <span>إدارة المخزون والتخصيص</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            إدارة متكاملة للعطور الجاهزة، الزيوت الخام، الفوارغ، والباركودات مع تعديل فوري
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowBatchModal(true)}
            className="px-3 py-2 bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold rounded-lg hover:bg-amber-500/30 transition-all cursor-pointer flex items-center gap-1 text-xs sm:text-sm"
            title="تعديل أسعار جماعي لتصنيف أو للكل"
          >
            <span>🏷️</span>
            <span>تعديل أسعار جماعي</span>
          </button>
          <button
            type="button"
            onClick={handlePrintStockSheet}
            className="px-3 py-2 bg-[#161b22] text-[#fbbf24] border border-[#fbbf24]/30 font-bold rounded-lg hover:bg-[#fbbf24]/10 transition-all cursor-pointer flex items-center gap-1.5 text-xs sm:text-sm"
            title="طباعة كشف جرد المخزون A4"
          >
            <span>🖨️</span>
            <span>كشف الجرد (A4)</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-2 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition-all cursor-pointer flex items-center gap-1 text-xs sm:text-sm"
            title="تصدير المنتجات إلى CSV متوافق مع Excel"
          >
            <span>📥</span>
            <span>تصدير Excel/CSV</span>
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-gray-700 text-white font-bold rounded-lg hover:bg-gray-600 transition-all cursor-pointer flex items-center gap-1 text-xs sm:text-sm"
            title="استيراد بضاعة من ملف Excel/CSV"
          >
            <span>📤</span>
            <span>استيراد CSV</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportCSV}
            className="hidden"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={openCreateForm}
            className={`px-4 py-2 ${goldButtonClass} flex items-center gap-1.5 text-xs sm:text-sm`}
          >
            <span>➕</span>
            <span>منتج جديد</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-gray-800/70 border border-white/5 p-3 rounded-lg">
          <div className="text-sm text-gray-400">إجمالي الأصناف</div>
          <div className="text-2xl font-bold text-white mt-1">{stats.totalProducts}</div>
        </div>
        <div className="bg-gray-800/70 border border-white/5 p-3 rounded-lg">
          <div className="text-sm text-gray-400">قيمة التكلفة (رأس المال)</div>
          <div className="text-2xl font-bold text-white mt-1">
            {canViewProfit ? formatCurrency(stats.totalStockValue) : '••••••'}
          </div>
        </div>
        <div className="bg-gray-800/70 border border-white/5 p-3 rounded-lg">
          <div className="text-sm text-gray-400">قيمة البيع المتوقعة</div>
          <div className="text-2xl font-bold text-gold mt-1">
            {formatCurrency(stats.totalRetailValue)}
          </div>
        </div>
        <div className="bg-gray-800/70 border border-white/5 p-3 rounded-lg">
          <div className="text-sm text-gray-400 flex items-center gap-1">
            <span aria-hidden="true">⚠️</span> نواقص وتنبيهات
          </div>
          <div className="text-2xl font-bold text-red-400 mt-1">{stats.lowStockCount}</div>
        </div>
      </div>

      {/* Quick Category / Item-Type Filter Chips */}
      <div className="flex flex-wrap items-center gap-2 mb-3 pb-2 border-b border-white/10">
        <span className="text-xs font-bold text-gray-400 shrink-0 ml-1">تصفية سريعة:</span>
        <button
          type="button"
          onClick={() => {
            setItemTypeFilter('all');
            setLowStockFilter(false);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            itemTypeFilter === 'all' && !lowStockFilter
              ? 'bg-gold text-[#0d1117] shadow-sm'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          كل الأصناف ({products.length})
        </button>
        <button
          type="button"
          onClick={() => {
            setLowStockFilter(!lowStockFilter);
            if (!lowStockFilter) setItemTypeFilter('all');
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
            lowStockFilter
              ? 'bg-red-600 text-white shadow-[0_0_12px_rgba(239,68,68,0.4)]'
              : 'bg-gray-800 text-red-400 hover:bg-red-500/20'
          }`}
        >
          <span>⚠️</span>
          <span>النواقص ({stats.lowStockCount})</span>
        </button>
        {ITEM_TYPES.map((t) => {
          const count = products.filter((p) => (p.item_type || 'ready_perfume') === t.id).length;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setItemTypeFilter(itemTypeFilter === t.id ? 'all' : t.id);
                setLowStockFilter(false);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                itemTypeFilter === t.id
                  ? 'bg-amber-500/30 text-gold border border-gold/40 shadow-sm'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              <span className="text-[10px] opacity-75">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="text"
          placeholder="🔍 بحث بالاسم، الباركود، أو موقع الرف..."
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
            <div className="text-7xl mb-5 opacity-90 animate-pulse" aria-hidden="true">
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
          <div className="space-y-2.5">
            {paginatedProducts.map((product) => {
              const currentType = ITEM_TYPES.find((t) => t.id === product.item_type) || ITEM_TYPES[0];
              const isEditingThis = inlineEdit.productId === product.id;

              return (
                <div
                  key={product.id}
                  className="glass-card p-4 hover:border-gold/50 transition-all border border-white/5"
                >
                  <div className="flex flex-wrap justify-between items-start gap-3">
                    <div className="flex gap-3 flex-1 min-w-[240px]">
                      {/* Product Image Thumbnail */}
                      <div className="w-16 h-16 rounded-xl bg-[#161b22] border border-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-inner relative">
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
                          {currentType.icon}
                        </span>
                      </div>

                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="text-lg font-bold text-gold truncate">
                            {product.name}
                          </h3>
                          <span className="text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span>{currentType.icon}</span>
                            <span>{currentType.label}</span>
                          </span>
                          {product.category && (
                            <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded">
                              📁 {product.category}
                            </span>
                          )}
                          {product.shelf_location && (
                            <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                              <span>📍</span>
                              <span>الرف: {product.shelf_location}</span>
                            </span>
                          )}
                          {product.barcode && (
                            <span className="text-xs bg-gray-700/60 text-gray-300 px-2 py-0.5 rounded font-mono">
                              🏷️ {product.barcode}
                            </span>
                          )}
                          {isLowStock(product) && (
                            <span className="badge badge-danger text-xs font-bold animate-pulse">
                              ⚠️ مخزون منخفض (≤ {product.min_qty ?? 5})
                            </span>
                          )}
                        </div>

                        {/* Details with Inline Edit Support */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mt-2">
                          {/* Quantity */}
                          <div>
                            <span className="text-gray-400">الكمية: </span>
                            {isEditingThis && inlineEdit.field === 'qty' ? (
                              <div className="inline-flex items-center gap-1 mt-0.5">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  value={inlineEdit.value}
                                  onChange={(e) =>
                                    setInlineEdit((p) => ({ ...p, value: e.target.value }))
                                  }
                                  className="w-16 bg-gray-900 text-white border border-gold px-1.5 py-0.5 rounded text-xs"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlineEdit(product)}
                                  className="text-green-400 text-xs font-bold hover:text-green-300 px-1"
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineEdit({ productId: null, field: null, value: '' })
                                  }
                                  className="text-red-400 text-xs font-bold hover:text-red-300 px-1"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span
                                onClick={() =>
                                  setInlineEdit({
                                    productId: product.id,
                                    field: 'qty',
                                    value: String(product.qty ?? '0')
                                  })
                                }
                                className={`font-bold cursor-pointer hover:underline ${
                                  isLowStock(product) ? 'text-red-400' : 'text-green-400'
                                }`}
                                title="انقر لتعديل الكمية سريعاً"
                              >
                                {safeParseFloat(product.qty)} {product.unit || 'قطعة'} ✎
                              </span>
                            )}
                          </div>

                          {/* Cost */}
                          <div>
                            <span className="text-gray-400">التكلفة: </span>
                            <span className="font-bold text-gray-300">
                              {canViewProfit ? formatCurrency(safeParseFloat(product.cost)) : '••••••'}
                            </span>
                          </div>

                          {/* Retail Price */}
                          <div>
                            <span className="text-gray-400">سعر البيع: </span>
                            {isEditingThis && inlineEdit.field === 'price' ? (
                              <div className="inline-flex items-center gap-1 mt-0.5">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={inlineEdit.value}
                                  onChange={(e) =>
                                    setInlineEdit((p) => ({ ...p, value: e.target.value }))
                                  }
                                  className="w-20 bg-gray-900 text-white border border-gold px-1.5 py-0.5 rounded text-xs"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlineEdit(product)}
                                  className="text-green-400 text-xs font-bold hover:text-green-300 px-1"
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineEdit({ productId: null, field: null, value: '' })
                                  }
                                  className="text-red-400 text-xs font-bold hover:text-red-300 px-1"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span
                                onClick={() =>
                                  setInlineEdit({
                                    productId: product.id,
                                    field: 'price',
                                    value: String(product.price ?? '0')
                                  })
                                }
                                className="font-bold text-gold cursor-pointer hover:underline"
                                title="انقر لتعديل سعر البيع سريعاً"
                              >
                                {formatCurrency(safeParseFloat(product.price))} ✎
                              </span>
                            )}
                          </div>

                          {/* Wholesale Price */}
                          <div>
                            <span className="text-gray-400">الجملة: </span>
                            {isEditingThis && inlineEdit.field === 'wholesale_price' ? (
                              <div className="inline-flex items-center gap-1 mt-0.5">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={inlineEdit.value}
                                  onChange={(e) =>
                                    setInlineEdit((p) => ({ ...p, value: e.target.value }))
                                  }
                                  className="w-20 bg-gray-900 text-white border border-gold px-1.5 py-0.5 rounded text-xs"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlineEdit(product)}
                                  className="text-green-400 text-xs font-bold hover:text-green-300 px-1"
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setInlineEdit({ productId: null, field: null, value: '' })
                                  }
                                  className="text-red-400 text-xs font-bold hover:text-red-300 px-1"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span
                                onClick={() =>
                                  setInlineEdit({
                                    productId: product.id,
                                    field: 'wholesale_price',
                                    value: String(product.wholesale_price ?? '0')
                                  })
                                }
                                className="font-bold text-gray-300 cursor-pointer hover:underline"
                                title="انقر لتعديل سعر الجملة سريعاً"
                              >
                                {formatCurrency(safeParseFloat(product.wholesale_price))} ✎
                              </span>
                            )}
                          </div>
                        </div>

                        {safeParseFloat(product.capacity) > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            السعة: {safeParseFloat(product.capacity)} مل
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setRestockTarget(product);
                          setRestockForm({
                            qty: '1',
                            cost: String(product.cost || '0'),
                            supplier: '',
                            notes: ''
                          });
                        }}
                        className="px-2.5 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                        title="إعادة توريد سريع لهذا الصنف"
                      >
                        <span>🔄</span>
                        <span>توريد</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustStock(product, -1)}
                        className="bg-red-600 text-white w-8 h-8 rounded hover:bg-red-700 transition-colors cursor-pointer text-base leading-none"
                        title="خصم وحدة"
                        aria-label={`خصم وحدة من ${product.name}`}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustStock(product, 1)}
                        className="bg-green-600 text-white w-8 h-8 rounded hover:bg-green-700 transition-colors cursor-pointer text-base leading-none"
                        title="إضافة وحدة"
                        aria-label={`إضافة وحدة إلى ${product.name}`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditForm(product)}
                        className="bg-blue-600 text-white w-8 h-8 rounded hover:bg-blue-700 transition-colors cursor-pointer text-xs"
                        title="تعديل تفاصيل المنتج"
                        aria-label={`تعديل ${product.name}`}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(product)}
                        className="bg-gray-700 text-red-400 w-8 h-8 rounded hover:bg-red-600 hover:text-white transition-colors cursor-pointer text-xs"
                        title="حذف المنتج"
                        aria-label={`حذف ${product.name}`}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-white/10 mt-3 text-sm text-gray-400">
          <div>
            صفحة <span className="font-bold text-white">{page}</span> من{' '}
            <span className="font-bold text-white">{totalPages}</span> (إجمالي{' '}
            <span className="font-bold text-gold">{filtered.length}</span> منتج)
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={prevPage}
              disabled={!hasPrevPage}
              className="px-3 py-1.5 bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-40 transition-colors cursor-pointer"
            >
              السابق
            </button>
            {pageNumbers.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => goToPage(p)}
                className={`w-8 h-8 rounded font-bold transition-all cursor-pointer ${
                  p === page
                    ? 'bg-gold text-[#0d1117] shadow-sm'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              onClick={nextPage}
              disabled={!hasNextPage}
              className="px-3 py-1.5 bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-40 transition-colors cursor-pointer"
            >
              التالي
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
       * MODAL 1: ADD / EDIT PRODUCT (Structured into 4 Luxury Cards)
       * ==================================================================== */}
      <Modal
        open={formOpen}
        onClose={handleCancelForm}
        title={editingProduct ? '✏️ تعديل صنف بالمخزون' : '➕ إضافة صنف جديد للمخزون'}
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
              {editingProduct ? 'تحديث الصنف' : 'حفظ الصنف'}
            </button>
          </>
        }
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto px-1 scrollbar-thin">
          {/* Card 1: Basic Information */}
          <div className="bg-[#161b22] border border-white/10 p-4 rounded-xl space-y-3">
            <h4 className="text-sm font-bold text-gold flex items-center gap-1.5 border-b border-white/10 pb-2">
              <span>📋</span>
              <span>1. البيانات الأساسية للصنف</span>
            </h4>

            <div>
              <label htmlFor="inv-product-name" className="text-xs text-gray-400 mb-1 block">
                اسم العطر أو الصنف <span className="text-red-400">*</span>
              </label>
              <input
                id="inv-product-name"
                type="text"
                placeholder="مثال: عطر عود ملوكي / زيت لافندر خام فرنسا..."
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

            <div>
              <label htmlFor="inv-product-category" className="text-xs text-gray-400 mb-1 block">
                التصنيف / العائلة العطرية
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  id="inv-product-category"
                  value={formData.category}
                  onChange={(e) => updateFormField('category', e.target.value)}
                  className="select-luxury flex-1"
                >
                  <option value="">بدون فئة محددة</option>
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
                  className="px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold shrink-0 cursor-pointer flex items-center gap-1"
                  title="إضافة تصنيف جديد"
                >
                  <span>➕</span>
                  <span>فئة جديدة</span>
                </button>
              </div>
            </div>

            {/* Image selection */}
            <div className="bg-[#0d1117] border border-white/10 p-3 rounded-lg flex items-center gap-3">
              {formData.image_url ? (
                <div className="relative w-14 h-14 rounded-lg border border-gold/40 overflow-hidden bg-black/40 flex-shrink-0">
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
                    className="absolute top-0 right-0 bg-red-600/90 text-white w-4 h-4 text-xs flex items-center justify-center rounded-bl"
                    title="حذف الصورة"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="w-14 h-14 rounded-lg border border-dashed border-white/20 flex flex-col items-center justify-center text-gray-500 text-[10px] flex-shrink-0">
                  <span>لا توجد</span>
                  <span>صورة</span>
                </div>
              )}
              <div className="flex-1 space-y-1.5">
                <label className="text-xs text-gray-300 font-bold block">
                  صورة توضيحية للمنتج (اختياري)
                </label>
                <div className="flex items-center gap-2">
                  <label className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs cursor-pointer border border-white/10">
                    📂 اختيار ملف
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileChange}
                      className="hidden"
                    />
                  </label>
                  <input
                    type="url"
                    placeholder="أو ضع رابط صورة ويب..."
                    value={formData.image_url?.startsWith('data:') ? '' : formData.image_url}
                    onChange={(e) => updateFormField('image_url', e.target.value)}
                    className="input-luxury text-xs flex-1 !py-1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Perfume Type & Measurement Units */}
          <div className="bg-[#161b22] border border-white/10 p-4 rounded-xl space-y-3">
            <h4 className="text-sm font-bold text-gold flex items-center gap-1.5 border-b border-white/10 pb-2">
              <span>🧪</span>
              <span>2. نوع الصنف وسعته ووحدات القياس</span>
            </h4>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-bold">
                طبيعة الصنف في محل العطور:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ITEM_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleItemTypeChange(t.id)}
                    className={`p-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border text-right cursor-pointer ${
                      formData.item_type === t.id
                        ? 'bg-amber-500/25 border-gold text-white shadow-sm'
                        : 'bg-gray-800/80 border-white/10 text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                    }`}
                  >
                    <span className="text-base">{t.icon}</span>
                    <span className="truncate">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="inv-product-unit" className="text-xs text-gray-400 mb-1 block">
                  وحدة قياس البيع والتخزين
                </label>
                <select
                  id="inv-product-unit"
                  value={formData.unit}
                  onChange={(e) => updateFormField('unit', e.target.value)}
                  className="select-luxury"
                >
                  {AVAILABLE_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-gray-500 mt-1 block">
                  تتغيّر تلقائياً حسب نوع الصنف مع حرية التبديل لأي وحدة.
                </span>
              </div>

              <div>
                <label htmlFor="inv-product-capacity" className="text-xs text-gray-400 mb-1 block">
                  السعة بالملليتر (للزجاجات والعطور المقفولة)
                </label>
                <div className="relative">
                  <input
                    id="inv-product-capacity"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="مثال: 50 أو 100..."
                    value={formData.capacity}
                    onChange={(e) => updateFormField('capacity', e.target.value)}
                    className={`input-luxury pl-8 ${formErrors.capacity ? 'border-red-500/50' : ''}`}
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs text-gray-500 font-bold">
                    ml
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Pricing, Cost & Profit Margin */}
          <div className="bg-[#161b22] border border-white/10 p-4 rounded-xl space-y-3">
            <h4 className="text-sm font-bold text-gold flex items-center gap-1.5 border-b border-white/10 pb-2">
              <span>💰</span>
              <span>3. التسعير والتكلفة وهوامش الربح</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="inv-product-cost" className="text-xs text-gray-400 mb-1 block">
                  سعر التكلفة (د.ل) <span className="text-red-400">*</span>
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
                <label htmlFor="inv-product-price" className="text-xs text-gray-400 mb-1 block">
                  سعر بيع التجزئة (القطاعي) <span className="text-red-400">*</span>
                </label>
                <input
                  id="inv-product-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => updateFormField('price', e.target.value)}
                  className={`input-luxury font-bold text-gold ${formErrors.price ? 'border-red-500/50' : ''}`}
                />
                {formErrors.price && (
                  <p className="text-red-400 text-xs mt-1" role="alert">
                    {formErrors.price}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="inv-product-wholesale" className="text-xs text-gray-400 mb-1 block">
                  سعر بيع الجملة (د.ل)
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
              </div>
            </div>

            {/* Live Profit Margin Indicator Bar */}
            <div className="bg-[#0d1117] p-3 rounded-lg border border-white/5 flex flex-wrap justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">مؤشر الربح التقديري:</span>
                {formCost > 0 && formPrice >= formCost ? (
                  <span className="text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded">
                    📈 +{profitMarginPercent}% (صافي ربح {formatCurrency(netProfitUnit)} لكل وحدة)
                  </span>
                ) : formCost > 0 && formPrice < formCost ? (
                  <span className="text-red-400 font-bold bg-red-950/60 border border-red-500/40 px-2 py-0.5 rounded">
                    ⚠️ سعر البيع أقل من التكلفة بخسارة {formatCurrency(formCost - formPrice)}!
                  </span>
                ) : (
                  <span className="text-gray-500">أدخل التكلفة وسعر البيع لحساب هامش الربح</span>
                )}
              </div>
              {formWholesale > 0 && (
                <div className="text-gray-400 text-[11px]">
                  ربح الجملة: {formatCurrency(formWholesale - formCost)}
                </div>
              )}
            </div>
          </div>

          {/* Card 4: Barcode, Stock & Location */}
          <div className="bg-[#161b22] border border-white/10 p-4 rounded-xl space-y-3">
            <h4 className="text-sm font-bold text-gold flex items-center gap-1.5 border-b border-white/10 pb-2">
              <span>🏷️</span>
              <span>4. الباركود وموقع الرف وحد النواقص</span>
            </h4>

            {/* Barcode with 1-click generator */}
            <div>
              <label htmlFor="inv-product-barcode" className="text-xs text-gray-400 mb-1 block">
                الباركود (Barcode)
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="inv-product-barcode"
                  type="text"
                  placeholder="امسح بالماسح الضوئي أو انقر توليد..."
                  value={formData.barcode}
                  onChange={(e) => updateFormField('barcode', e.target.value)}
                  className="input-luxury flex-1 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={handleGenerateBarcode}
                  className="px-3 py-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-xs shrink-0 cursor-pointer flex items-center gap-1 border border-amber-500/30"
                  title="توليد باركود تلقائي سريع"
                >
                  <span>⚡</span>
                  <span>توليد تلقائي</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="inv-product-qty" className="text-xs text-gray-400 mb-1 block">
                  الكمية الافتتاحية الحالية
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
              </div>

              <div>
                <label htmlFor="inv-product-min-qty" className="text-xs text-gray-400 mb-1 block">
                  حد التنبيه بالنواقص (Min Qty)
                </label>
                <input
                  id="inv-product-min-qty"
                  type="number"
                  min="0"
                  step="1"
                  value={formData.min_qty}
                  onChange={(e) => updateFormField('min_qty', e.target.value)}
                  className="input-luxury"
                />
              </div>

              <div>
                <label htmlFor="inv-product-shelf" className="text-xs text-gray-400 mb-1 block">
                  موقع الرف / المستودع
                </label>
                <input
                  id="inv-product-shelf"
                  type="text"
                  placeholder="مثال: رف عطور شرقية A-1"
                  value={formData.shelf_location}
                  onChange={(e) => updateFormField('shelf_location', e.target.value)}
                  className="input-luxury"
                />
              </div>
            </div>

            <div>
              <label htmlFor="inv-product-notes" className="text-xs text-gray-400 mb-1 block">
                ملاحظات ومواصفات إضافية
              </label>
              <textarea
                id="inv-product-notes"
                rows="2"
                placeholder="بلد المنشأ، درجة الثبات، المورد المفضل..."
                value={formData.notes}
                onChange={(e) => updateFormField('notes', e.target.value)}
                className="input-luxury text-xs resize-none"
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* =====================================================================
       * MODAL 2: QUICK RESTOCK (إعادة توريد سريع)
       * ==================================================================== */}
      {restockTarget && (
        <Modal
          open={Boolean(restockTarget)}
          onClose={() => setRestockTarget(null)}
          title={`🔄 استلام وتوريد دفعة جديدة: ${restockTarget.name}`}
          size="md"
          footer={
            <>
              <button
                type="button"
                onClick={() => setRestockTarget(null)}
                disabled={restocking}
                className="px-5 py-2 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-600 transition-colors cursor-pointer text-sm"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleExecuteRestock}
                disabled={restocking}
                className={`px-5 py-2 ${goldButtonClass} flex items-center gap-1.5 text-sm`}
              >
                {restocking ? (
                  <span className="spinner !w-4 !h-4" aria-hidden="true" />
                ) : (
                  <span>✅</span>
                )}
                <span>تأكيد واستلام الدفعة</span>
              </button>
            </>
          }
        >
          <div className="space-y-3.5" dir="rtl">
            <div className="bg-[#161b22] p-3 rounded-lg border border-white/10 flex justify-between items-center text-xs">
              <div>
                <span className="text-gray-400">الكمية الحالية: </span>
                <span className="font-bold text-white">
                  {safeParseFloat(restockTarget.qty)} {restockTarget.unit || 'وحدة'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">التكلفة الحالية: </span>
                <span className="font-bold text-gold">
                  {formatCurrency(safeParseFloat(restockTarget.cost))}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  الكمية الواردة الجديدة <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={restockForm.qty}
                  onChange={(e) => setRestockForm((p) => ({ ...p, qty: e.target.value }))}
                  className="input-luxury font-bold text-lg text-emerald-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  تكلفة الوحدة في هذه الدفعة (د.ل) <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={restockForm.cost}
                  onChange={(e) => setRestockForm((p) => ({ ...p, cost: e.target.value }))}
                  className="input-luxury font-bold text-lg"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">المورد التجاري:</label>
              <div className="flex gap-2">
                <select
                  value={restockForm.supplier}
                  onChange={(e) => setRestockForm((p) => ({ ...p, supplier: e.target.value }))}
                  className="select-luxury flex-1"
                >
                  <option value="">مورد عام / نقدي</option>
                  {suppliersList.map((s) => (
                    <option key={s.id} value={s.name}>
                      👥 {s.name} {s.company ? `(${s.company})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="أو اكتب اسم المورد..."
                  value={restockForm.supplier}
                  onChange={(e) => setRestockForm((p) => ({ ...p, supplier: e.target.value }))}
                  className="input-luxury flex-1 text-xs"
                />
              </div>
            </div>

            {/* Live WAC calculation preview */}
            {(() => {
              const addQ = safeParseFloat(restockForm.qty);
              const addC = safeParseFloat(restockForm.cost);
              const curQ = safeParseFloat(restockTarget.qty);
              const curC = safeParseFloat(restockTarget.cost);
              const totQ = curQ + addQ;
              const newWac = totQ > 0 ? (curQ * curC + addQ * addC) / totQ : addC;
              const totalAmount = addQ * addC;

              return (
                <div className="bg-[#0d1117] p-3 rounded-lg border border-gold/30 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">إجمالي فاتورة الدفعة:</span>
                    <span className="font-bold text-white">{formatCurrency(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">الكمية الإجمالية بعد الاستلام:</span>
                    <span className="font-bold text-emerald-400">
                      {totQ} {restockTarget.unit || 'وحدة'}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-1 mt-1">
                    <span className="text-gold font-bold">متوسط التكلفة الجديد (WAC):</span>
                    <span className="font-bold text-gold">{formatCurrency(newWac)} / وحدة</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* =====================================================================
       * MODAL 3: BATCH PRICE UPDATE (تعديل جماعي للأسعار)
       * ==================================================================== */}
      {showBatchModal && (
        <Modal
          open={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          title="🏷️ تعديل جماعي لأسعار المنتجات"
          size="md"
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                disabled={applyingBatch}
                className="px-5 py-2 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-600 transition-colors cursor-pointer text-sm"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleApplyBatchUpdate}
                disabled={applyingBatch}
                className={`px-5 py-2 ${goldButtonClass} flex items-center gap-1.5 text-sm`}
              >
                {applyingBatch ? (
                  <span className="spinner !w-4 !h-4" aria-hidden="true" />
                ) : (
                  <span>⚡</span>
                )}
                <span>تطبيق التعديل الجماعي</span>
              </button>
            </>
          }
        >
          <div className="space-y-4 text-xs" dir="rtl">
            <p className="text-gray-400">
              تتيح لك هذه الميزة زيادة أو تخفيض أسعار مجموعة من المنتجات بضغطة زر واحدة (بنسبة مئوية أو بمبلغ ثابت).
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 mb-1 block">تطبيق على الفئة:</label>
                <select
                  value={batchForm.category}
                  onChange={(e) => setBatchForm((p) => ({ ...p, category: e.target.value }))}
                  className="select-luxury"
                >
                  <option value="all">كل الفئات</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      📁 {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-gray-400 mb-1 block">تطبيق على نوع الصنف:</label>
                <select
                  value={batchForm.itemType}
                  onChange={(e) => setBatchForm((p) => ({ ...p, itemType: e.target.value }))}
                  className="select-luxury"
                >
                  <option value="all">كل الأنواع</option>
                  {ITEM_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.icon} {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 mb-1 block">نوع التعديل:</label>
                <select
                  value={batchForm.adjustmentType}
                  onChange={(e) =>
                    setBatchForm((p) => ({ ...p, adjustmentType: e.target.value }))
                  }
                  className="select-luxury font-bold"
                >
                  <option value="percent_increase">📈 زيادة بنسبة مئوية (+%)</option>
                  <option value="percent_decrease">📉 تخفيض بنسبة مئوية (-%)</option>
                  <option value="amount_increase">➕ زيادة بمبلغ ثابت (+ د.ل)</option>
                  <option value="amount_decrease">➖ تخفيض بمبلغ ثابت (- د.ل)</option>
                </select>
              </div>

              <div>
                <label className="text-gray-400 mb-1 block">
                  مقدار التعديل ({batchForm.adjustmentType.includes('percent') ? '%' : 'د.ل'}):
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={batchForm.value}
                  onChange={(e) => setBatchForm((p) => ({ ...p, value: e.target.value }))}
                  className="input-luxury font-bold text-base text-gold"
                />
              </div>
            </div>

            {/* Target products count preview */}
            {(() => {
              const matched = products.filter((p) => {
                const matchCat = batchForm.category === 'all' || p.category === batchForm.category;
                const matchType =
                  batchForm.itemType === 'all' ||
                  (p.item_type || 'ready_perfume') === batchForm.itemType;
                return matchCat && matchType;
              });

              return (
                <div className="bg-[#0d1117] p-3 rounded-lg border border-white/10 text-gray-300">
                  سيتم تعديل أسعار التجزئة وأسعار الجملة لـ{' '}
                  <span className="font-bold text-gold">{matched.length} منتج</span> مطابق لهذه
                  المعايير.
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* =====================================================================
       * MODAL 4: QUICK CATEGORY
       * ==================================================================== */}
      {showQuickCatModal && (
        <Modal
          open={showQuickCatModal}
          onClose={() => setShowQuickCatModal(false)}
          title="🏷️ إضافة فئة / تصنيف جديد"
          size="sm"
          footer={
            <>
              <button
                type="button"
                onClick={() => setShowQuickCatModal(false)}
                disabled={creatingQuickCat}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-600 transition-colors cursor-pointer text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleCreateQuickCategory}
                disabled={creatingQuickCat}
                className={`px-4 py-2 ${goldButtonClass} text-xs`}
              >
                {creatingQuickCat ? 'جاري الإضافة...' : 'حفظ واختيار'}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="text-xs text-gray-400 block">اسم الفئة الجديدة:</label>
            <input
              type="text"
              placeholder="مثال: زيوت فرنسية / عطور شرقية / بخاخات كريستال..."
              value={quickCatName}
              onChange={(e) => setQuickCatName(e.target.value)}
              className="input-luxury"
              autoFocus
            />
          </div>
        </Modal>
      )}

      {/* =====================================================================
       * MODAL 5: DELETE CONFIRMATION
       * ==================================================================== */}
      {deleteTarget && (
        <Modal
          open={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          title="⚠️ تأكيد حذف منتج"
          size="sm"
          footer={
            <>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg font-bold hover:bg-gray-600 transition-colors cursor-pointer text-xs"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition-colors cursor-pointer text-xs"
              >
                حذف نهائي
              </button>
            </>
          }
        >
          <p className="text-gray-300 text-sm">
            هل أنت متأكد من رغبتك في حذف المنتج{' '}
            <span className="text-gold font-bold">"{deleteTarget.name}"</span>؟ لا يمكن التراجع عن
            هذه العملية.
          </p>
        </Modal>
      )}
    </div>
  );
};

export default InventoryFullModule;
