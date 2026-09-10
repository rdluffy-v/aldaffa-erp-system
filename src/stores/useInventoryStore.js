/**
 * Inventory Store - Global Product Catalog State
 * Manages products, filtering, caching
 */

import { create } from 'zustand';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';

const inventoryRepo = new InventoryRepository();

export const useInventoryStore = create((set, get) => ({
  // State
  products: [],
  loading: false,
  error: null,
  searchTerm: '',
  categoryFilter: 'all',
  itemTypeFilter: 'all',
  lowStockFilter: false,
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

  addProduct: async (productData) => {
    set({ loading: true, error: null });

    try {
      await inventoryRepo.create(productData);
      await get().loadProducts(true);
      return { success: true };
    } catch (error) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  updateProduct: async (id, productData) => {
    set({ loading: true, error: null });

    try {
      await inventoryRepo.update(id, productData);
      await get().loadProducts(true);
      return { success: true };
    } catch (error) {
      set({ error: error.message, loading: false });
      return { success: false, error: error.message };
    }
  },

  deleteProduct: async (id, name = null) => {
    set({ loading: true, error: null });

    try {
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

  // Batch update prices across category or itemType
  batchUpdatePrices: async ({ category = 'all', itemType = 'all', adjustmentType = 'percent_increase', value = 0 }) => {
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

        await inventoryRepo.update(p.id, { price: newPrice, wholesale_price: newWholesale });
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
    let filtered = state.products;

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

    // Search filter
    if (state.searchTerm) {
      const term = state.searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.toLowerCase().includes(term)) ||
        (p.shelf_location && p.shelf_location.toLowerCase().includes(term))
      );
    }

    return filtered;
  },

  getProductById: (id) => {
    return get().products.find(p => p.id === id);
  },

  invalidateCache: () => set({ lastFetch: null })
}));
