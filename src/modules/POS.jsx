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
import { formatCurrency, generateId, safeParseFloat } from '../utils/helpers.js';
import { getIpcRenderer, isElectronRuntime } from '../utils/electronBridge.js';
import { FlaskConical, Sparkles, Package, Droplets, X } from 'lucide-react';
import PortionModal from '../components/PortionModal.jsx';
import DateTimePicker from '../components/DateTimePicker.jsx';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';
import RecordTesterModal from '../components/RecordTesterModal.jsx';

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
  const [completedSaleInfo, setCompletedSaleInfo] = useState(null);
  const [barcodeBuffer, setBarcodeBuffer] = useState('');
  const [barcodeTimeout, setBarcodeTimeout] = useState(null);
  const [showClearCartConfirm, setShowClearCartConfirm] = useState(false);

  // Quick Blending Engine (F4)
  const [showBlendModal, setShowBlendModal] = useState(false);
  const [showTesterModal, setShowTesterModal] = useState(false);
  const [blendOilId, setBlendOilId] = useState('');
  const [blendCapacity, setBlendCapacity] = useState(50);
  const [blendOilMl, setBlendOilMl] = useState(15);
  const [blendBottleId, setBlendBottleId] = useState('');
  const [blendBottleCost, setBlendBottleCost] = useState(5);
  const [blendAlcoholId, setBlendAlcoholId] = useState('');
  const [blendIncludeBox, setBlendIncludeBox] = useState(false);
  const [blendBoxId, setBlendBoxId] = useState('');
  const [blendBoxCost, setBlendBoxCost] = useState(3);
  const [blendPrice, setBlendPrice] = useState('');
  const [blendCustomName, setBlendCustomName] = useState('');

  // Raw materials categorization for quick blending
  const oilProducts = useMemo(() => {
    return products.filter((p) => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const unit = (p.unit || '').toLowerCase();
      return (
        cat.includes('زيت') ||
        cat.includes('خام') ||
        cat.includes('عطر') ||
        name.includes('زيت') ||
        name.includes('مسك') ||
        name.includes('عود') ||
        name.includes('عنبر') ||
        unit === 'ml' ||
        unit === 'تولة'
      );
    });
  }, [products]);

  const bottleProducts = useMemo(() => {
    return products.filter((p) => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return (
        cat.includes('زجاج') ||
        name.includes('زجاج') ||
        name.includes('قارورة') ||
        name.includes('غرشة') ||
        p.unit === 'bottle'
      );
    });
  }, [products]);

  const alcoholProducts = useMemo(() => {
    return products.filter((p) => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return (
        cat.includes('كحول') ||
        name.includes('كحول') ||
        name.includes('مذيب') ||
        name.includes('مثبت')
      );
    });
  }, [products]);

  const boxProducts = useMemo(() => {
    return products.filter((p) => {
      const cat = (p.category || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      return (
        cat.includes('علب') ||
        cat.includes('تغليف') ||
        name.includes('علبة') ||
        name.includes('كرتون') ||
        name.includes('تغليف')
      );
    });
  }, [products]);

  const selectedOil = useMemo(() => {
    return products.find((p) => String(p.id) === String(blendOilId));
  }, [products, blendOilId]);

  const oilCostPerMl = useMemo(() => {
    if (!selectedOil) return 0.8;
    const cost = safeParseFloat(selectedOil.cost, 0);
    const cap = safeParseFloat(selectedOil.capacity, 0);
    if (selectedOil.unit === 'ml') return cost;
    if (cap > 0) return cost / cap;
    return cost > 0 ? cost / 50 : 0.8;
  }, [selectedOil]);

  const selectedAlcohol = useMemo(() => {
    return products.find((p) => String(p.id) === String(blendAlcoholId)) || alcoholProducts[0];
  }, [products, blendAlcoholId, alcoholProducts]);

  const alcoholCostPerMl = useMemo(() => {
    if (!selectedAlcohol) return 0.05;
    const cost = safeParseFloat(selectedAlcohol.cost, 0);
    const cap = safeParseFloat(selectedAlcohol.capacity, 0);
    if (cap > 0) return cost / cap;
    return 0.05;
  }, [selectedAlcohol]);

  const alcoholMl = Math.max(0, blendCapacity - blendOilMl);

  const calculatedBlendCost = useMemo(() => {
    const oilCost = blendOilMl * oilCostPerMl;
    const alcCost = alcoholMl * alcoholCostPerMl;
    const bCost = safeParseFloat(blendBottleCost, 0);
    const pCost = blendIncludeBox ? safeParseFloat(blendBoxCost, 0) : 0;
    return oilCost + alcCost + bCost + pCost;
  }, [blendOilMl, oilCostPerMl, alcoholMl, alcoholCostPerMl, blendBottleCost, blendIncludeBox, blendBoxCost]);

  const defaultBlendName = useMemo(() => {
    return selectedOil
      ? `خلطة ${selectedOil.name} (${blendCapacity}ml)`
      : `خلطة عطر مخصصة (${blendCapacity}ml)`;
  }, [selectedOil, blendCapacity]);

  // Sync auto-suggested price when cost updates
  useEffect(() => {
    if (calculatedBlendCost > 0) {
      const suggested = Math.round(calculatedBlendCost * 1.8);
      setBlendPrice((prev) => (!prev || prev === '0' ? String(suggested) : prev));
    }
  }, [calculatedBlendCost]);

  // Print or Export PDF Invoice for completed sale
  const handlePrintSalePdf = async (saleData) => {
    if (!saleData) return;
    try {
      const ipc = getIpcRenderer();
      if (!ipc) {
        window.print();
        return;
      }
      const res = await ipc.invoke('export:purchase-order-pdf', {
        orderId: `INV-${saleData.saleId}`,
        date: saleData.date,
        supplier: saleData.customerName || 'عميل المحل',
        items: (saleData.items || []).map((it) => ({
          name: it.name,
          quantity: it.cart_qty,
          unit: it.unit || 'قطعة',
          cost_per_unit: it.final_price,
          total: it.final_price * it.cart_qty
        })),
        total: saleData.total,
        notes: `طريقة الدفع: ${
          saleData.paymentMethod === 'cash'
            ? 'نقدي'
            : saleData.paymentMethod === 'card'
            ? 'بطاقة'
            : saleData.paymentMethod === 'debt'
            ? 'آجل (دين)'
            : 'تحويل'
        }`
      });

      if (res?.success) {
        showSuccess(`✅ تم تصدير وحفظ الفاتورة كملف PDF بنجاح:\n${res.filePath}`);
      } else {
        showSuccess('✅ تم فتح حوار طباعة الفاتورة');
      }
    } catch (err) {
      showError(`فشل طباعة الفاتورة: ${err.message}`);
    } finally {
      setCompletedSaleInfo(null);
    }
  };

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
          setShowClearCartConfirm(true);
        }
      }
      // F3: Checkout
      if (e.key === 'F3') {
        e.preventDefault();
        if (cartItems.length > 0) {
          handleCompleteSale();
        }
      }
      // F4: Quick Perfume Blending
      if (e.key === 'F4') {
        e.preventDefault();
        setShowBlendModal(true);
      }
      // F7: Quick Perfume Tester / Sample
      if (e.key === 'F7') {
        e.preventDefault();
        setShowTesterModal(true);
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

  // Add custom perfume blend to cart
  const handleAddBlendToCart = () => {
    if (!selectedOil) {
      showError('يرجى اختيار الزيت العطري المراد تركيبه');
      return;
    }

    if (blendOilMl <= 0) {
      showError('يرجى تحديد كمية الزيت العطري بالملّ');
      return;
    }

    if (selectedOil.qty < blendOilMl) {
      showError(`كمية الزيت المطلوبة (${blendOilMl} مل) تفوق الرصيد المتوفر بالمخزون (${selectedOil.qty} مل)`);
      return;
    }

    const price = safeParseFloat(blendPrice, 0);
    if (price <= 0) {
      showError('يرجى تحديد سعر بيع صحيح أكبر من الصفر');
      return;
    }

    const finalName = (blendCustomName || '').trim() || defaultBlendName;
    const selectedBottle = products.find((p) => String(p.id) === String(blendBottleId));
    const selectedBox = products.find((p) => String(p.id) === String(blendBoxId));

    const blendData = {
      is_custom_blend: true,
      bottle_capacity: blendCapacity,
      oil: {
        id: selectedOil.id,
        name: selectedOil.name,
        ml: blendOilMl,
        cost_per_ml: oilCostPerMl
      },
      alcohol: {
        id: selectedAlcohol?.id || null,
        name: selectedAlcohol?.name || 'كحول إيثيلي نقي 96%',
        ml: alcoholMl,
        cost_per_ml: alcoholCostPerMl
      },
      bottle: {
        id: selectedBottle?.id || null,
        name: selectedBottle?.name || 'زجاجة عطر',
        cost: safeParseFloat(blendBottleCost, 0)
      },
      packaging: blendIncludeBox ? {
        id: selectedBox?.id || null,
        name: selectedBox?.name || 'علبة وتغليف فاخر',
        cost: safeParseFloat(blendBoxCost, 0)
      } : null
    };

    addItem({
      product_id: `custom_blend_${generateId()}`,
      name: finalName,
      cart_qty: 1,
      unit: 'زجاجة',
      final_price: price,
      unit_cost: calculatedBlendCost,
      portion_ml: blendCapacity,
      blend_details: blendData
    });

    setShowBlendModal(false);
    setBlendCustomName('');
    showSuccess(`✅ تمت إضافة "${finalName}" إلى السلة بنجاح`);
  };

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
        portion_ml: item.portion_ml || null,
        blend_details: item.blend_details || null
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

      // Record completed sale info for optional PDF printing
      setCompletedSaleInfo({
        saleId,
        date: saleDate,
        items: [...cartItems],
        subtotal,
        discount,
        total,
        paymentMethod,
        customerName
      });

      // Success
      showSuccess(`✅ تم إتمام البيع بنجاح - الفاتورة #${saleId} (الإجمالي: ${formatCurrency(total)})`);

      // Reset cart and reload products immediately
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
              onClick={() => setShowBlendModal(true)}
              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-4 py-3 rounded-lg font-bold transition-all flex items-center gap-1.5 shadow-md hover:scale-105 cursor-pointer text-sm"
              title="تركيب وتخليط عطر مخصص للزبون (F4)"
            >
              <FlaskConical className="w-4 h-4 text-amber-400" />
              <span>خلطة عطر (F4)</span>
            </button>
            <button
              onClick={() => setShowTesterModal(true)}
              className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 px-4 py-3 rounded-lg font-bold transition-all flex items-center gap-1.5 shadow-md hover:scale-105 cursor-pointer text-sm"
              title="صرف وتوثيق عينة تستر وترويج (F7)"
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>تستر (F7)</span>
            </button>
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

      {/* Clear Cart Confirmation */}
      <ConfirmModal
        open={showClearCartConfirm}
        title="مسح السلة"
        message="هل تريد مسح جميع الأصناف من سلة المشتريات؟ لا يمكن التراجع عن هذا الإجراء."
        icon="🗑️"
        danger
        confirmText="نعم، مسح السلة"
        cancelText="إلغاء"
        onConfirm={() => {
          setShowClearCartConfirm(false);
          clearCart();
          showInfo('تم مسح السلة');
        }}
        onCancel={() => setShowClearCartConfirm(false)}
        onClose={() => setShowClearCartConfirm(false)}
      />

      {/* Quick Perfume Blending Modal (F4) */}
      {showBlendModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="glass-card p-6 w-full max-w-2xl border border-amber-500/40 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-gold">تركيب خلطة عطر مخصصة للزبون (F4)</h2>
                  <p className="text-[11px] text-gray-400">حساب فوري للتكلفة والربح وخصم المواد الخام تلقائياً عند الدفع</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBlendModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* 1. Bottle Capacity Selector */}
              <div>
                <label className="font-bold text-gray-300 block mb-1.5">
                  1. سعة زجاجة العطر المراد تعبئتها:
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[5, 10, 20, 30, 40, 50, 100, 200].map((cap) => (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => {
                        setBlendCapacity(cap);
                        setBlendOilMl(Math.round(cap * 0.3)); // Default 30% concentration
                      }}
                      className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer ${
                        blendCapacity === cap
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-sm'
                          : 'bg-black/30 border-white/10 text-gray-300 hover:border-amber-400/40'
                      }`}
                    >
                      {cap} مل
                    </button>
                  ))}
                  <input
                    type="number"
                    min="1"
                    value={blendCapacity}
                    onChange={(e) => {
                      const cap = safeParseFloat(e.target.value, 50);
                      setBlendCapacity(cap);
                      setBlendOilMl(Math.round(cap * 0.3));
                    }}
                    className="bg-gray-800 text-white px-2 py-1 rounded-lg border border-white/10 text-center font-bold w-20"
                    placeholder="سعة أخرى"
                  />
                </div>
              </div>

              {/* 2. Fragrance Oil Selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">
                    2. الزيت العطري الخام من المخزون: *
                  </label>
                  <select
                    value={blendOilId}
                    onChange={(e) => setBlendOilId(e.target.value)}
                    className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-amber-500/30 focus:outline-none focus:border-amber-400"
                  >
                    <option value="">-- اختر الزيت العطري المتوفر --</option>
                    {oilProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (المتوفر: {p.qty} {p.unit || 'مل'} - التكلفة: {formatCurrency(p.cost)}/{p.unit || 'مل'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Oil Dosage (ml) & Percentage */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-bold text-gray-300">
                      كمية الزيت: <span className="text-amber-400 font-extrabold">{blendOilMl} مل</span>
                    </label>
                    <span className="text-gray-400">
                      نسبة التركيز: <strong className="text-amber-300">{Math.round((blendOilMl / (blendCapacity || 1)) * 100)}%</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="1"
                      max={blendCapacity}
                      value={blendOilMl}
                      onChange={(e) => setBlendOilMl(safeParseFloat(e.target.value, 1))}
                      className="flex-1 accent-amber-400 cursor-pointer"
                    />
                    <input
                      type="number"
                      min="1"
                      max={blendCapacity}
                      value={blendOilMl}
                      onChange={(e) => setBlendOilMl(safeParseFloat(e.target.value, 1))}
                      className="w-16 bg-gray-800 text-white px-2 py-1 rounded-lg border border-white/10 text-center font-bold"
                    />
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1 flex justify-between">
                    <span>كحول مكمل: <strong className="text-blue-300">{alcoholMl} مل</strong></span>
                    <span>تكلفة الزيت بالملّ: <strong className="text-emerald-400">{formatCurrency(oilCostPerMl)}/مل</strong></span>
                  </div>
                </div>
              </div>

              {/* 4. Bottle & Packaging Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-black/20 rounded-xl border border-white/5">
                <div>
                  <label className="font-bold text-gray-300 block mb-1">الزجاجة الفارغة:</label>
                  <select
                    value={blendBottleId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setBlendBottleId(id);
                      const prod = products.find((p) => String(p.id) === String(id));
                      if (prod) setBlendBottleCost(prod.cost || 0);
                    }}
                    className="w-full bg-gray-800 text-white px-3 py-1.5 rounded-lg border border-white/10"
                  >
                    <option value="">زجاجة افتراضية ({formatCurrency(blendBottleCost)})</option>
                    {bottleProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (المتوفر: {p.qty} - التكلفة: {formatCurrency(p.cost)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-gray-300 flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={blendIncludeBox}
                        onChange={(e) => setBlendIncludeBox(e.target.checked)}
                        className="accent-amber-400"
                      />
                      <span>علبة كرتونية فاخرة وتغليف (+ التكلفة)</span>
                    </label>
                  </div>
                  {blendIncludeBox ? (
                    <select
                      value={blendBoxId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setBlendBoxId(id);
                        const prod = products.find((p) => String(p.id) === String(id));
                        if (prod) setBlendBoxCost(prod.cost || 0);
                      }}
                      className="w-full bg-gray-800 text-white px-3 py-1.5 rounded-lg border border-amber-500/30"
                    >
                      <option value="">علبة قياسية فاخرة ({formatCurrency(blendBoxCost)})</option>
                      {boxProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (المتوفر: {p.qty} - التكلفة: {formatCurrency(p.cost)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[11px] text-gray-500 block pt-1">بدون علبة كرتونية خارجية</span>
                  )}
                </div>
              </div>

              {/* 5. Live Cost & Pricing Breakdown */}
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                  <div className="bg-black/30 p-2 rounded-lg">
                    <span className="text-gray-400 text-[10px] block">تكلفة الزيت</span>
                    <span className="font-bold text-emerald-400 text-xs">
                      {formatCurrency(blendOilMl * oilCostPerMl)}
                    </span>
                  </div>
                  <div className="bg-black/30 p-2 rounded-lg">
                    <span className="text-gray-400 text-[10px] block">تكلفة الكحول</span>
                    <span className="font-bold text-blue-400 text-xs">
                      {formatCurrency(alcoholMl * alcoholCostPerMl)}
                    </span>
                  </div>
                  <div className="bg-black/30 p-2 rounded-lg">
                    <span className="text-gray-400 text-[10px] block">الزجاجة والتغليف</span>
                    <span className="font-bold text-purple-400 text-xs">
                      {formatCurrency(safeParseFloat(blendBottleCost, 0) + (blendIncludeBox ? safeParseFloat(blendBoxCost, 0) : 0))}
                    </span>
                  </div>
                  <div className="bg-black/30 p-2 rounded-lg border border-amber-500/40">
                    <span className="text-amber-300 text-[10px] block font-bold">إجمالي التكلفة</span>
                    <span className="font-black text-amber-400 text-sm">
                      {formatCurrency(calculatedBlendCost)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-white/10">
                  <div>
                    <label className="font-bold text-gray-200 block mb-1">سعر البيع للزبون (د.ل): *</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={blendPrice}
                      onChange={(e) => setBlendPrice(e.target.value)}
                      className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-gold/40 text-lg font-black text-gold focus:outline-none focus:border-gold"
                      placeholder="0.00"
                    />
                    <div className="text-[11px] text-gray-400 mt-1 flex justify-between">
                      <span>الربح الصافي: <strong className="text-emerald-400">{formatCurrency(Math.max(0, safeParseFloat(blendPrice, 0) - calculatedBlendCost))}</strong></span>
                      <span>هامش الربح: <strong className="text-gold">{safeParseFloat(blendPrice, 0) > 0 ? Math.round(((safeParseFloat(blendPrice, 0) - calculatedBlendCost) / safeParseFloat(blendPrice, 0)) * 100) : 0}%</strong></span>
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-gray-200 block mb-1">اسم العطر أو بيان الفاتورة:</label>
                    <input
                      type="text"
                      value={blendCustomName}
                      onChange={(e) => setBlendCustomName(e.target.value)}
                      placeholder={defaultBlendName}
                      className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg border border-white/10 text-xs"
                    />
                    <span className="text-[10px] text-gray-400 block mt-1">يظهر هذا الاسم في الفاتورة وسلة المبيعات</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={handleAddBlendToCart}
                className="flex-1 btn-gold py-2.5 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              >
                <span>🧪 إضافة الخلطة إلى السلة</span>
              </button>
              <button
                type="button"
                onClick={() => setShowBlendModal(false)}
                className="px-5 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-bold text-sm cursor-pointer transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Sale Invoice PDF Prompt Modal */}
      {completedSaleInfo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#161b22] border border-amber-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center text-2xl">
              ✅
            </div>
            <div>
              <h3 className="text-base font-bold text-white">تم إتمام عملية البيع بنجاح</h3>
              <p className="text-xs text-gray-400 mt-1 font-mono">
                فاتورة رقم #{completedSaleInfo.saleId} • الإجمالي: {formatCurrency(completedSaleInfo.total)}
              </p>
              {completedSaleInfo.customerName && (
                <p className="text-xs text-amber-400 mt-0.5">العميل: {completedSaleInfo.customerName}</p>
              )}
            </div>

            <div className="p-3 bg-black/30 rounded-xl border border-white/5 text-xs text-gray-300">
              هل ترغب في حفظ أو طباعة فاتورة بيع A4 / PDF لهذا العميل؟
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePrintSalePdf(completedSaleInfo)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg"
              >
                <span>📄 حفظ أو طباعة فاتورة PDF</span>
              </button>
              <button
                type="button"
                onClick={() => setCompletedSaleInfo(null)}
                className="py-2.5 px-4 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-bold text-xs transition-all cursor-pointer"
              >
                <span>متابعة البيع (إغلاق)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Tester / Discovery Sample Modal (F7) */}
      {showTesterModal && (
        <RecordTesterModal
          isOpen={showTesterModal}
          onClose={() => setShowTesterModal(false)}
          onSuccess={() => {
            showSuccess('✅ تم تسجيل وصرف التستر وتحديث المخزون بنجاح');
            loadProducts(true);
          }}
        />
      )}
    </div>
  );
};

export default POSModule;
