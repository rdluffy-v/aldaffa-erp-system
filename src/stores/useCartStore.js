/**
 * Cart Store - Global POS Cart State
 * Manages cart items, pricing, discounts, and checkout flow
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCartStore = create(
  persist(
    (set, get) => ({
      // State
      items: [],
      pricingMode: 'retail', // 'retail' | 'wholesale'
      discount: 0,
      discountType: 'percentage', // 'percentage' | 'fixed'
      paymentMethod: 'cash', // 'cash' | 'card' | 'bank_transfer' | 'debt'
      customerName: '',
      phone: '',
      notes: '',
      saleDate: new Date().toISOString(),

      // Actions
      addItem: (item) => set((state) => {
        const existingIndex = state.items.findIndex(
          (i) => i.product_id === item.product_id && i.portion_ml === item.portion_ml
        );

        if (existingIndex >= 0) {
          const updated = [...state.items];
          updated[existingIndex].cart_qty += item.cart_qty || 1;
          return { items: updated };
        }

        return { items: [...state.items, { ...item, cart_qty: item.cart_qty || 1 }] };
      }),

      removeItem: (index) => set((state) => ({
        items: state.items.filter((_, i) => i !== index)
      })),

      updateQuantity: (index, quantity) => set((state) => {
        if (quantity <= 0) {
          return { items: state.items.filter((_, i) => i !== index) };
        }

        const updated = [...state.items];
        updated[index].cart_qty = quantity;
        return { items: updated };
      }),

      updatePrice: (index, price) => set((state) => {
        const updated = [...state.items];
        updated[index].final_price = price;
        return { items: updated };
      }),

      setDiscount: (discount) => set({ discount: Math.max(0, discount || 0) }),

      setDiscountType: (discountType) => set({ discountType }),

      setPricingMode: (mode) => set({ pricingMode: mode }),

      setPaymentMethod: (method) => set({ paymentMethod: method }),

      setCustomerName: (name) => set({ customerName: name }),

      setPhone: (phone) => set({ phone }),

      setNotes: (notes) => set({ notes }),

      setSaleDate: (date) => set({ saleDate: date }),

      clear: () => set({
        items: [],
        discount: 0,
        discountType: 'percentage',
        customerName: '',
        phone: '',
        notes: '',
        saleDate: new Date().toISOString()
      }),

      // Computed values
      getSubtotal: () => {
        const state = get();
        return state.items.reduce((sum, item) => sum + (item.final_price * item.cart_qty), 0);
      },

      getDiscountAmount: () => {
        const state = get();
        const subtotal = state.getSubtotal();
        if (state.discountType === 'fixed') {
          return Math.min(subtotal, state.discount || 0);
        }
        return subtotal * (Math.min(100, state.discount || 0) / 100);
      },

      getTotal: () => {
        const state = get();
        const subtotal = state.getSubtotal();
        const discountAmount = state.getDiscountAmount();
        return Math.max(0, subtotal - discountAmount);
      },

      getProfit: () => {
        const state = get();
        const grossProfit = state.items.reduce(
          (sum, item) => sum + ((item.final_price - item.unit_cost) * item.cart_qty),
          0
        );
        const discountAmount = state.getDiscountAmount();
        return grossProfit - discountAmount;
      }
    }),
    {
      name: 'aldaffa-cart-storage',
      partialize: (state) => ({
        items: state.items,
        pricingMode: state.pricingMode,
        discount: state.discount,
        paymentMethod: state.paymentMethod
      })
    }
  )
);
