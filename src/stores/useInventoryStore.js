import { create } from 'zustand';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { StockAuditsRepository } from '../database/repositories/StockAuditsRepository.js';
import { safeParseFloat } from '../utils/helpers.js';

const inventoryRepo = new InventoryRepository();
const stockAuditsRepo = new StockAuditsRepository();

export const useInventoryStore = create((set, get) => ({
  // State
  products: [],
  loading: false,
  error: null,
  searchTerm: '',
  categoryFilter: 'all',
  itemTypeFilter: 'all',
  lowStockFilter: false,
  sortBy: 'created_at_desc',
  startDateFilter: '',
  endDateFilter: '',
  lastFetch: null,

  // Actions
  loadProducts: async (_force = true) => {
    set({ loading: true, error: null });

    try {
      const products = await inventoryRepo.findAll({}, 'name ASC');
      set({
        products,
        loading: false,
        lastFetch: Date.now()
      });
    } catch (error) {
      set({
        error: error.message,
        loading: false
      });
    }
  },

  addProduct: async (productData, userName = 'المستخدم') => {
    set({ loading: true, error: null });

    try {
      const now = new Date().toISOString();
      const enrichedData = {
        ...productData,
        created_at: productData.created_at || now,
        updated_at: now
      };

      await inventoryRepo.create(enrichedData);

      // Log stock audit
      await stockAuditsRepo.logAction({
        productId: enrichedData.id,
        productName: enrichedData.name,
        actionType: 'create',
        oldQty: 0,
        newQty: enrichedData.qty,
        qtyDelta: enrichedData.qty,
        oldPrice: 0,
        newPrice: enrichedData.price,
        notes: enrichedData.notes || 'إضافة صنف جديد إلى المخزون',
        userName,
        date: enrichedData.created_at
      });

      await get().loadProducts(true);
      return { success: true };
    } catch (error) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  updateProduct: async (id, productData, userName = 'المستخدم') => {
    set({ loading: true, error: null });

    try {
      const existing = get().products.find(p => p.id === id || String(p.id) === String(id));
      const now = new Date().toISOString();
      const enrichedData = {
        ...productData,
        updated_at: now
      };

      await inventoryRepo.update(id, enrichedData);

      // Log stock audit
      if (existing) {
        const oldQ = safeParseFloat(existing.qty);
        const newQ = productData.qty !== undefined ? safeParseFloat(productData.qty) : oldQ;
        const oldP = safeParseFloat(existing.price);
        const newP = productData.price !== undefined ? safeParseFloat(productData.price) : oldP;

        await stockAuditsRepo.logAction({
          productId: id,
          productName: productData.name || existing.name,
          actionType: oldQ !== newQ ? 'restock' : 'update',
          oldQty: oldQ,
          newQty: newQ,
          qtyDelta: newQ - oldQ,
          oldPrice: oldP,
          newPrice: newP,
          notes: productData.notes || 'تحديث بيانات الصنف في المخزون',
          userName,
          date: now
        });
      }

      await get().loadProducts(true);
      return { success: true };
    } catch (error) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  deleteProduct: async (id, name = null, userName = 'المستخدم') => {
    set({ loading: true, error: null });

    try {
      const target = get().products.find(p => p.id === id || String(p.id) === String(id) || (name && p.name === name));
      const now = new Date().toISOString();

      if (target) {
        await stockAuditsRepo.logAction({
          productId: target.id,
          productName: target.name,
          actionType: 'delete',
          oldQty: target.qty,
          newQty: 0,
          qtyDelta: -safeParseFloat(target.qty),
          oldPrice: target.price,
          newPrice: 0,
          notes: 'حذف صنف من المخزون',
          userName,
          date: now
        });
      }

      // 1. Optimistically remove from state immediately
      set((state) => ({
        products: state.products.filter(
          (p) => p.id !== id && String(p.id) !== String(id) && (!name || p.name !== name)
        )
      }));

      // 2. Delete from database
      if (inventoryRepo.deleteProduct) {
        await inventoryRepo.deleteProduct(id, name);
      } else {
        await inventoryRepo.delete(id);
      }

      // 3. Invalidate DB cache & fetch fresh state
      await get().loadProducts(true);

      // 4. Notify other modules
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
      }

      return { success: true };
    } catch (error) {
      await get().loadProducts(true);
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  setSearchTerm: (term) => set({ searchTerm: term }),

  setCategoryFilter: (category) => set({ categoryFilter: category }),

  setItemTypeFilter: (itemType) => set({ itemTypeFilter: itemType }),

  setLowStockFilter: (enabled) => set({ lowStockFilter: enabled }),

  setSortBy: (sortBy) => set({ sortBy }),

  setStartDateFilter: (startDateFilter) => set({ startDateFilter }),

  setEndDateFilter: (endDateFilter) => set({ endDateFilter }),

  // Batch update prices across category or itemType
  batchUpdatePrices: async ({ category = 'all', itemType = 'all', adjustmentType = 'percent_increase', value = 0, userName = 'المستخدم' }) => {
    set({ loading: true, error: null });
    try {
      const state = get();
      const val = parseFloat(value) || 0;
      if (val === 0) return { success: true, count: 0 };

      const targets = state.products.filter(p => {
        const matchCat = category === 'all' || p.category === category;
        const matchType = itemType === 'all' || (p.item_type || 'ready_perfume') === itemType;
        return matchCat && matchType;
      });

      let updatedCount = 0;
      const now = new Date().toISOString();

      for (const p of targets) {
        let newPrice = p.price;
        let newWholesale = p.wholesale_price;

        if (adjustmentType === 'percent_increase') {
          newPrice = Math.round((p.price * (1 + val / 100)) * 100) / 100;
          newWholesale = Math.round((p.wholesale_price * (1 + val / 100)) * 100) / 100;
        } else if (adjustmentType === 'percent_decrease') {
          newPrice = Math.max(0, Math.round((p.price * (1 - val / 100)) * 100) / 100);
          newWholesale = Math.max(0, Math.round((p.wholesale_price * (1 - val / 100)) * 100) / 100);
        } else if (adjustmentType === 'amount_increase') {
          newPrice = Math.round((p.price + val) * 100) / 100;
          newWholesale = Math.round((p.wholesale_price + val) * 100) / 100;
        } else if (adjustmentType === 'amount_decrease') {
          newPrice = Math.max(0, Math.round((p.price - val) * 100) / 100);
          newWholesale = Math.max(0, Math.round((p.wholesale_price - val) * 100) / 100);
        }

        await inventoryRepo.update(p.id, {
          price: newPrice,
          wholesale_price: newWholesale,
          updated_at: now
        });

        await stockAuditsRepo.logAction({
          productId: p.id,
          productName: p.name,
          actionType: 'batch_price_update',
          oldQty: p.qty,
          newQty: p.qty,
          qtyDelta: 0,
          oldPrice: p.price,
          newPrice,
          notes: `تعديل سعر جماعي (${adjustmentType})`,
          userName,
          date: now
        });

        updatedCount++;
      }

      await get().loadProducts(true);
      return { success: true, count: updatedCount };
    } catch (err) {
      set({ error: err.message, loading: false });
      return { success: false, error: err.message };
    }
  },

  // Computed
  getFilteredProducts: () => {
    const state = get();
    let filtered = [...state.products];

    // Category filter
    if (state.categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === state.categoryFilter);
    }

    // Item type filter
    if (state.itemTypeFilter && state.itemTypeFilter !== 'all') {
      filtered = filtered.filter(p => (p.item_type || 'ready_perfume') === state.itemTypeFilter);
    }

    // Low stock filter (respects item custom min_qty or default 5)
    if (state.lowStockFilter) {
      filtered = filtered.filter(p => {
        const threshold = p.min_qty !== undefined && p.min_qty !== null ? parseFloat(p.min_qty) : 5;
        return p.qty <= threshold;
      });
    }

    // Date range filter
    if (state.startDateFilter) {
      const startMs = new Date(`${state.startDateFilter}T00:00:00`).getTime();
      filtered = filtered.filter(p => {
        const itemDateStr = p.created_at || p.updated_at;
        if (!itemDateStr) return true;
        const itemMs = new Date(itemDateStr).getTime();
        return isNaN(itemMs) || itemMs >= startMs;
      });
    }

    if (state.endDateFilter) {
      const endMs = new Date(`${state.endDateFilter}T23:59:59.999`).getTime();
      filtered = filtered.filter(p => {
        const itemDateStr = p.created_at || p.updated_at;
        if (!itemDateStr) return true;
        const itemMs = new Date(itemDateStr).getTime();
        return isNaN(itemMs) || itemMs <= endMs;
      });
    }

    // Search filter
    if (state.searchTerm) {
      const term = state.searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.toLowerCase().includes(term)) ||
        (p.shelf_location && p.shelf_location.toLowerCase().includes(term))
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (state.sortBy) {
        case 'created_at_desc': {
          const dateA = a.created_at || a.updated_at || '';
          const dateB = b.created_at || b.updated_at || '';
          return dateB.localeCompare(dateA);
        }
        case 'created_at_asc': {
          const dateA = a.created_at || a.updated_at || '';
          const dateB = b.created_at || b.updated_at || '';
          return dateA.localeCompare(dateB);
        }
        case 'updated_at_desc': {
          const dateA = a.updated_at || a.created_at || '';
          const dateB = b.updated_at || b.created_at || '';
          return dateB.localeCompare(dateA);
        }
        case 'name_asc': {
          return a.name.localeCompare(b.name, 'ar');
        }
        case 'price_desc': {
          return safeParseFloat(b.price) - safeParseFloat(a.price);
        }
        case 'price_asc': {
          return safeParseFloat(a.price) - safeParseFloat(b.price);
        }
        case 'qty_desc': {
          return safeParseFloat(b.qty) - safeParseFloat(a.qty);
        }
        case 'qty_asc': {
          return safeParseFloat(a.qty) - safeParseFloat(b.qty);
        }
        default:
          return (b.created_at || '').localeCompare(a.created_at || '');
      }
    });

    return filtered;
  },

  getProductById: (id) => {
    return get().products.find(p => p.id === id);
  },

  invalidateCache: () => set({ lastFetch: null })
}));
