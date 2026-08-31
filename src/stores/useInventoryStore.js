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

  setLowStockFilter: (enabled) => set({ lowStockFilter: enabled }),

  // Computed
  getFilteredProducts: () => {
    const state = get();
    let filtered = state.products;

    // Category filter
    if (state.categoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === state.categoryFilter);
    }

    // Low stock filter
    if (state.lowStockFilter) {
      filtered = filtered.filter(p => p.qty <= 10);
    }

    // Search filter
    if (state.searchTerm) {
      const term = state.searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.includes(term))
      );
    }

    return filtered;
  },

  getProductById: (id) => {
    return get().products.find(p => p.id === id);
  },

  invalidateCache: () => set({ lastFetch: null })
}));
