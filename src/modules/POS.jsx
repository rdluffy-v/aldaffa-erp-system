/**
 * ============================================================================
 * POS MODULE - REFACTORED WITH NEW ARCHITECTURE
 * ============================================================================
 *
 * Features:
 * - Zustand stores for state management (useCartStore, useInventoryStore, useUIStore)
 * - Repository pattern for data access (SalesRepository)
 * - Keyboard shortcuts (F1=focus search, F2=clear cart, F3=checkout)
 * - Barcode scanner support (numeric input detection)
 * - Optimistic UI updates
 * - Loading skeletons
 * - Toast notifications
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCartStore } from '../stores/useCartStore.js';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useAuthStore } from '../stores/useAuthStore.js';
import { useSettingsStore } from '../stores/useSettingsStore.js';
import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { DebtorsRepository } from '../database/repositories/DebtorsRepository.js';
import { formatCurrency, generateId } from '../utils/helpers.js';
import PortionModal from '../components/PortionModal.jsx';
import DateTimePicker from '../components/DateTimePicker.jsx';

const salesRepo = new SalesRepository();
const debtorsRepo = new DebtorsRepository();

const POSModule = () => {
  // Zustand stores
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canChangePrice = hasPermission('change_price');
  const canApplyDiscount = hasPermission('apply_discount');
  const currencySymbol = useSettingsStore((s) => s.getSetting('currency_symbol', 'د.ل'));
  const {
    items: cartItems,
    pricingMode,
    discount,
    discountType,
    paymentMethod,
    customerName,
    notes,
    saleDate,
    addItem,
    removeItem,
    updateQuantity,
    updatePrice,
    setDiscount,
    setDiscountType,
    setPricingMode,
    setPaymentMethod,
    setCustomerName,
    setNotes,
    setSaleDate,
    clear: clearCart,
    getSubtotal,
    getDiscountAmount,
    getTotal,
    getProfit
  } = useCartStore();

  const {
    products,
    loading: productsLoading,
    searchTerm,
    setSearchTerm,
    loadProducts,
    getFilteredProducts
  } = useInventoryStore();

  const { showSuccess, showError, showWarning, showInfo } = useUIStore();

  // Local state
  const [showPortionModal, setShowPortionModal] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isProcessingSale, setIsProcessingSale] = useState(false);
  const [barcodeBuffer, setBarcodeBuffer] = useState('');
  const [barcodeTimeout, setBarcodeTimeout] = useState(null);

  // Load products on mount
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // F1: Focus search
      if (e.key === 'F1') {
        e.preventDefault();
        document.getElementById('pos-search-input')?.focus();
      }
      // F2: Clear cart
      if (e.key === 'F2') {
        e.preventDefault();
        if (cartItems.length > 0) {
          if (window.confirm('هل تريد مسح السلة؟')) {
            clearCart();
            showInfo('تم مسح السلة');
          }
        }
      }
      // F3: Checkout
      if (e.key === 'F3') {
        e.preventDefault();
        if (cartItems.length > 0) {
          handleCompleteSale();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cartItems, clearCart]);

  // Barcode scanner support (detects rapid numeric input)
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only capture if not in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Check if it's a numeric key
      if (/^\d$/.test(e.key)) {
        // Clear existing timeout
        if (barcodeTimeout) {
          clearTimeout(barcodeTimeout);
        }

        const newBuffer = barcodeBuffer + e.key;
        setBarcodeBuffer(newBuffer);

        // Set timeout to process barcode (100ms after last key)
        const timeout = setTimeout(() => {
          if (newBuffer.length >= 3) {
            handleBarcodeScanned(newBuffer);
          }
          setBarcodeBuffer('');
        }, 100);

        setBarcodeTimeout(timeout);
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      if (barcodeTimeout) {
        clearTimeout(barcodeTimeout);
      }
    };
  }, [barcodeBuffer, barcodeTimeout]);

  // Handle barcode scan
  const handleBarcodeScanned = useCallback((barcode) => {
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      handleAddToCart(product);
      showSuccess(`تم إضافة ${product.name} إلى السلة`);
    } else {
      showWarning(`لم يتم العثور على منتج بالباركود: ${barcode}`);
    }
  }, [products]);

  // Add to cart with optimistic update
  const handleAddToCart = useCallback((product, customQty = 1, customPrice = null, portionMl = null) => {
    if (product.qty <= 0) {
      showError(`${product.name} غير متوفر في المخزون`);
      return;
    }

    const finalPrice = customPrice !== null ? customPrice :
      (pricingMode === 'wholesale' ? (product.wholesale_price || product.price) : product.price);

    const unitCost = portionMl
      ? (product.cost * portionMl / (product.capacity || 1))
      : product.cost;

    addItem({
      product_id: product.id,
      name: product.name,
      cart_qty: customQty,
      unit: product.unit,
      final_price: finalPrice,
      unit_cost: unitCost,
      portion_ml: portionMl,
      capacity: product.capacity
    });
  }, [pricingMode, addItem, showError]);

  // Complete sale transaction
  const handleCompleteSale = async () => {
    if (cartItems.length === 0) {
      showWarning('السلة فارغة');
      return;
    }

    const total = getTotal();
    if (total <= 0) {
      showError('إجمالي البيع يجب أن يكون أكبر من صفر');
      return;
    }

    if (paymentMethod === 'debt') {
      if (!customerName || !customerName.trim()) {
        showError('يرجى إدخال اسم العميل لإتمام عملية البيع بالآجل (دين)');
        return;
      }
    }

    setIsProcessingSale(true);

    try {
      const subtotal = getSubtotal();
      const profit = getProfit();

      // Prepare sale data
      const saleData = {
        date: saleDate,
        subtotal,
        discount,
        discount_type: discountType,
        total,
        profit,
        payment_method: paymentMethod,
        customer_name: customerName || null,
        sale_pricing_mode: pricingMode,
        type: 'store',
        notes: notes || null
      };

      // Prepare sale items
      const saleItems = cartItems.map(item => ({
        product_id: item.product_id,
        name: item.name,
        cart_qty: item.cart_qty,
        unit: item.unit,
        final_price: item.final_price,
        unit_cost: item.unit_cost,
        portion_ml: item.portion_ml || null
      }));

      // Create sale with transaction (includes inventory updates)
      const results = await salesRepo.createSaleWithItems(saleData, saleItems);
      const saleId = results[0]?.lastInsertRowid;

      // If payment is debt, update debtor ledger
      if (paymentMethod === 'debt' && customerName) {
        try {
          const cleanName = customerName.trim();
          let debtor = (await debtorsRepo.findAll({ name: cleanName }))[0];
          if (!debtor) {
            const newDebtorId = generateId();
            await debtorsRepo.create({
              id: newDebtorId,
              name: cleanName,
              phone: null,
              total_debt: 0,
              created_at: new Date().toISOString()
            });
            debtor = await debtorsRepo.findById(newDebtorId);
          }
          if (debtor) {
            await debtorsRepo.addDebtTransaction(debtor.id, {
              id: generateId(),
              debtor_id: debtor.id,
              type: 'debt',
              amount: total,
              date: saleDate || new Date().toISOString(),
              invoice_id: saleId || null
            });
          }
        } catch (debtErr) {
          console.error('Debtor transaction error:', debtErr);
        }
      }

      // Print receipt (optional - check if IPC is available)
      try {
        const electron = window.require ? window.require('electron') : null;
        if (electron) {
          await electron.ipcRenderer.invoke('print:receipt', {
            saleId,
            date: saleDate,
            items: cartItems,
            subtotal,
            discount,
            total,
            paymentMethod,
            customerName
          });
        }
      } catch (printError) {
        console.warn('Print receipt failed:', printError);
      }

      // Success
      showSuccess(`✅ تم إتمام البيع بنجاح - الإجمالي: ${formatCurrency(total)}`);

      // Reset cart and reload products
      clearCart();
      await loadProducts(true);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
      }

    } catch (error) {
      console.error('Sale error:', error);
      showError(`خطأ في إتمام البيع: ${error.message}`);
    } finally {
      setIsProcessingSale(false);
    }
  };

  // Get filtered products (in stock only)
  const availableProducts = useMemo(() => {
    return getFilteredProducts().filter(p => p.qty > 0);
  }, [products, searchTerm]);

  // Computed totals
  const subtotal = getSubtotal();
  const discountAmount = getDiscountAmount();
  const total = getTotal();

  return (
    <div className="h-full flex gap-6">
      {/* Products Panel */}
      <div className="flex-1 flex flex-col glass-card p-6">
        <div className="flex gap-4 mb-4">
          <input
            id="pos-search-input"
            type="text"
            placeholder="🔍 بحث عن منتج أو مسح الباركود... (F1)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 focus:outline-none focus:border-gold transition-colors"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={() => setPricingMode('retail')}
              className={`px-6 py-3 rounded-lg font-bold transition-all ${
                pricingMode === 'retail'
                  ? 'bg-gradient-to-r from-gold to-gold-dark text-navy shadow-lg scale-105'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              تجزئة
            </button>
            <button
              onClick={() => setPricingMode('wholesale')}
              className={`px-6 py-3 rounded-lg font-bold transition-all ${
                pricingMode === 'wholesale'
                  ? 'bg-gradient-to-r from-gold to-gold-dark text-navy shadow-lg scale-105'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              جملة
            </button>
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {productsLoading ? (
            // Loading skeletons
            <div className="grid grid-cols-2 gap-3">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="glass-card p-4 animate-pulse">
                  <div className="h-6 bg-gray-700 rounded mb-2"></div>
                  <div className="h-4 bg-gray-700 rounded w-1/2 mb-3"></div>
                  <div className="h-10 bg-gray-700 rounded"></div>
                </div>
              ))}
            </div>
          ) : availableProducts.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="text-6xl mb-4">📦</div>
              <p className="text-xl mb-2">لا توجد منتجات متاحة</p>
              <p className="text-sm">
                {searchTerm ? 'جرب مصطلح بحث آخر' : 'تأكد من إضافة منتجات إلى المخزون'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 content-start">
              {availableProducts.map(product => (
                <div
                  key={product.id}
                  className="glass-card p-3.5 cursor-pointer hover:border-gold/50 transition-all duration-200 flex flex-col justify-between"
                >
                  <div className="flex gap-3 items-start mb-2">
                    {/* Thumbnail */}
                    <div className="w-12 h-12 rounded-lg bg-black/40 border border-white/10 flex-shrink-0 flex items-center justify-center overflow-hidden">
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
                        className="text-xl"
                        style={{ display: product.image_url ? 'none' : 'block' }}
                        aria-hidden="true"
                      >
                        🧴
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-1">
                        <h3 className="font-bold text-base text-gold truncate">{product.name}</h3>
                        <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                          product.qty <= 10 ? 'bg-red-600/20 text-red-400' : 'bg-gold/20 text-gold'
                        }`}>
                          {product.qty} {product.unit}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1 font-semibold">
                        {formatCurrency(pricingMode === 'retail' ? product.price : (product.wholesale_price || product.price))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => handleAddToCart(product)}
                      className="flex-1 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-green-700 transition-colors"
                    >
                      إضافة
                    </button>
                    {product.capacity > 0 && (
                      <button
                        onClick={() => setShowPortionModal(product)}
                        className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
                        title="جرعة مخصصة"
                      >
                        📏
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart Panel */}
      <div className="w-[450px] flex flex-col glass-card p-6 h-full overflow-hidden">
        <div className="flex justify-between items-center mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gold">السلة</h2>
            {cartItems.length > 0 && (
              <span className="bg-gold text-navy px-3 py-1 rounded-full text-sm font-bold">
                {cartItems.length}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowDatePicker(true)}
            className="text-sm bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
            title="تعديل التاريخ"
          >
            📅 {new Date(saleDate).toLocaleDateString('ar-SD')}
          </button>
        </div>

        {/* Cart Items - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin mb-4 space-y-2">
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="text-5xl mb-3">🛒</div>
              <p className="text-lg">السلة فارغة</p>
              <p className="text-sm mt-1">أضف منتجات لبدء البيع</p>
            </div>
          ) : (
            cartItems.map((item, index) => (
              <div key={index} className="bg-gray-800 p-3 rounded-lg hover:bg-gray-750 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h4 className="font-bold text-gold">{item.name}</h4>
                    {item.portion_ml && (
                      <span className="text-xs text-blue-400">
                        {item.portion_ml}ml من {item.capacity}ml
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(index)}
                    className="text-red-500 hover:text-red-400 text-xl leading-none transition-colors"
                    title="حذف من السلة"
                  >
                    ×
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={item.cart_qty}
                    onChange={(e) => updateQuantity(index, parseFloat(e.target.value) || 0)}
                    className="w-20 bg-gray-700 text-white px-2 py-1 rounded text-center focus:outline-none focus:ring-2 focus:ring-gold"
                    min="0.1"
                    step="0.1"
                  />
                  <span className="text-sm text-gray-400">×</span>
                  <input
                    type="number"
                    value={item.final_price}
                    disabled={!canChangePrice}
                    readOnly={!canChangePrice}
                    title={!canChangePrice ? 'تعديل السعر اليدوي غير مصرح به لهذا الحساب' : 'تعديل السعر'}
                    onChange={(e) => canChangePrice && updatePrice(index, parseFloat(e.target.value) || 0)}
                    className={`flex-1 bg-gray-700 text-white px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-gold ${
                      !canChangePrice ? 'opacity-60 cursor-not-allowed' : ''
                    }`}
                    step="0.01"
                  />
                  <span className="text-sm font-bold text-gold min-w-[80px] text-left">
                    {formatCurrency(item.final_price * item.cart_qty)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Customer Info & Totals & Actions - Pinned */}
        <div className="shrink-0 space-y-3">
          <div className="space-y-2">
            <input
              type="text"
              placeholder="اسم العميل (اختياري)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-gray-800 text-white px-3.5 py-1.5 text-sm rounded-lg border border-gold/30 focus:outline-none focus:border-gold"
            />
            <input
              type="text"
              placeholder="ملاحظات..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-gray-800 text-white px-3.5 py-1.5 text-sm rounded-lg border border-gold/30 focus:outline-none focus:border-gold"
            />
          </div>

          {/* Totals */}
          <div className="space-y-1.5 bg-gray-800 p-3 rounded-lg text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">المجموع الجزئي:</span>
              <span className="font-bold">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400 text-xs">الخصم:</span>
                <div className="inline-flex rounded-lg bg-gray-800 p-0.5 border border-amber-500/20">
                  <button
                    type="button"
                    disabled={!canApplyDiscount}
                    onClick={() => canApplyDiscount && setDiscountType('percentage')}
                    title={!canApplyDiscount ? 'تطبيق الخصم غير مصرح به لهذا الحساب' : 'خصم نسبة مئوية'}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                      !canApplyDiscount ? 'opacity-50 cursor-not-allowed' : ''
                    } ${
                      discountType === 'percentage'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    disabled={!canApplyDiscount}
                    onClick={() => canApplyDiscount && setDiscountType('fixed')}
                    title={!canApplyDiscount ? 'تطبيق الخصم غير مصرح به لهذا الحساب' : 'خصم قيمة ثابتة'}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                      !canApplyDiscount ? 'opacity-50 cursor-not-allowed' : ''
                    } ${
                      discountType === 'fixed'
                        ? 'bg-amber-500 text-slate-950 shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {currencySymbol}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={discount || ''}
                  placeholder="0"
                  disabled={!canApplyDiscount}
                  readOnly={!canApplyDiscount}
                  title={!canApplyDiscount ? 'تطبيق الخصم غير مصرح به لهذا الحساب' : 'قيمة الخصم'}
                  onChange={(e) => canApplyDiscount && setDiscount(parseFloat(e.target.value) || 0)}
                  className={`w-16 bg-gray-700 text-white px-1.5 py-0.5 rounded text-center focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs ${
                    !canApplyDiscount ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  min="0"
                  max={discountType === 'percentage' ? 100 : undefined}
                  step={discountType === 'percentage' ? '0.5' : '1'}
                />
                <span className="text-red-400 min-w-[70px] text-left text-xs">
                  -{formatCurrency(discountAmount)}
                </span>
              </div>
            </div>
            <div className="flex justify-between text-lg font-bold text-gold border-t border-gold/30 pt-1.5">
              <span>الإجمالي:</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { method: 'cash', label: '💵 نقدي' },
              { method: 'card', label: '💳 بطاقة' },
              { method: 'bank_transfer', label: '🏦 تحويل' },
              { method: 'debt', label: '📝 دين (آجل)' }
            ].map(({ method, label }) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`py-2 px-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  paymentMethod === method
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md scale-105'
                    : 'bg-gray-700/80 text-white hover:bg-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Complete Sale Button */}
          <button
            onClick={handleCompleteSale}
            disabled={cartItems.length === 0 || isProcessingSale}
            className="btn-gold w-full py-3.5 text-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:shadow-xl shrink-0"
          >
            {isProcessingSale ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                جاري المعالجة...
              </span>
            ) : (
              `✅ إتمام البيع (F3)`
            )}
          </button>

          {/* Keyboard Shortcuts Help */}
          <div className="text-[11px] text-gray-500 text-center">
            F1: بحث | F2: مسح السلة | F3: إتمام البيع
          </div>
        </div>
      </div>

      {/* Portion Modal */}
      {showPortionModal && (
        <PortionModal
          product={showPortionModal}
          pricingMode={pricingMode}
          onSelect={(qty, price, portionMl) => {
            handleAddToCart(showPortionModal, qty, price, portionMl);
            setShowPortionModal(null);
          }}
          onClose={() => setShowPortionModal(null)}
        />
      )}

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DateTimePicker
          value={saleDate}
          onChange={setSaleDate}
          onClose={() => setShowDatePicker(false)}
        />
      )}
    </div>
  );
};

export default POSModule;
