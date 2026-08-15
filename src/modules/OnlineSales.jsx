import React, { useState, useEffect, useMemo } from 'react';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { formatCurrency } from '../utils/helpers.js';

const salesRepo = new SalesRepository();

const OnlineSalesModule = () => {
  // Zustand stores
  const {
    products,
    loading: productsLoading,
    loadProducts
  } = useInventoryStore();

  const { showSuccess, showError, showWarning } = useUIStore();

  // Local state
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Load products on mount
  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const addToCart = (product) => {
    if (product.qty <= 0) {
      showWarning(`${product.name} غير متوفر في المخزون`);
      return;
    }

    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      setCart(cart.map(item =>
        item.product_id === product.id
          ? { ...item, cart_qty: item.cart_qty + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        name: product.name,
        cart_qty: 1,
        unit: product.unit,
        final_price: product.price,
        unit_cost: product.cost
      }]);
    }
  };

  const removeFromCart = (index) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const updateCartQty = (index, newQty) => {
    if (newQty <= 0) {
      removeFromCart(index);
      return;
    }
    const updated = [...cart];
    updated[index].cart_qty = newQty;
    setCart(updated);
  };

  const updateCartPrice = (index, newPrice) => {
    const updated = [...cart];
    updated[index].final_price = parseFloat(newPrice) || 0;
    setCart(updated);
  };

  const calculateTotals = () => {
    const subtotal = cart.reduce((sum, item) => sum + (item.final_price * item.cart_qty), 0);
    const discountAmount = (subtotal * discount / 100);
    const total = subtotal - discountAmount;
    const profit = cart.reduce((sum, item) =>
      sum + ((item.final_price - item.unit_cost) * item.cart_qty), 0) - discountAmount;

    return { subtotal, discountAmount, total, profit };
  };

  const completeOnlineSale = async () => {
    if (cart.length === 0) {
      showWarning('السلة فارغة');
      return;
    }

    if (!customerPhone) {
      showError('يرجى إدخال رقم هاتف العميل');
      return;
    }

    const { subtotal, total, profit } = calculateTotals();

    setIsProcessing(true);

    try {
      const saleData = {
        date: new Date().toISOString(),
        subtotal,
        discount,
        total,
        profit,
        payment_method: 'cash',
        customer_name: customerName || null,
        sale_pricing_mode: 'retail',
        type: 'online',
        phone: customerPhone,
        notes: `العنوان: ${customerAddress}\n${notes}`
      };

      const saleItems = cart.map(item => ({
        product_id: item.product_id,
        name: item.name,
        cart_qty: item.cart_qty,
        unit: item.unit,
        final_price: item.final_price,
        unit_cost: item.unit_cost
      }));

      // Create sale with items and inventory deduction (transaction)
      const results = await salesRepo.createSaleWithItems(saleData, saleItems);
      const saleId = results[0]?.lastInsertRowid;

      // Reset
      setCart([]);
      setDiscount(0);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setNotes('');
      loadProducts(true); // Force refresh to update stock quantities

      showSuccess(`✅ تم تسجيل الطلب بنجاح\nرقم الفاتورة: ${saleId}\nالعميل: ${customerName || customerPhone}`);
    } catch (error) {
      showError('خطأ في تسجيل الطلب: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p =>
      p.qty > 0 &&
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  const { subtotal, discountAmount, total } = calculateTotals();

  return (
    <div className="h-full flex gap-6">
      {/* Products Panel */}
      <div className="flex-1 flex flex-col glass-card p-6">
        <h2 className="text-2xl font-bold text-gold mb-4 flex items-center gap-2">
          <span>📱</span>
          <span>المبيعات أونلاين</span>
        </h2>

        <input
          type="text"
          placeholder="🔍 بحث عن منتج..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 focus:outline-none focus:border-gold mb-4"
        />

        <div className="flex-1 overflow-y-auto scrollbar-thin grid grid-cols-3 gap-3 content-start">
          {productsLoading ? (
            // Loading skeletons
            [...Array(6)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="h-5 bg-gray-700 rounded mb-3 w-3/4"></div>
                <div className="h-4 bg-gray-700 rounded w-1/2"></div>
              </div>
            ))
          ) : filteredProducts.length === 0 ? (
            <div className="col-span-3 text-center text-gray-500 py-12">
              {searchTerm ? 'لا توجد منتجات مطابقة للبحث' : 'لا توجد منتجات متوفرة في المخزون'}
            </div>
          ) : (
            filteredProducts.map(product => (
              <div
                key={product.id}
                onClick={() => addToCart(product)}
                className="glass-card p-4 cursor-pointer hover:scale-105 transition-transform"
              >
                <h3 className="font-bold text-lg text-gold mb-2">{product.name}</h3>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400">{formatCurrency(product.price)}</span>
                  <span className="bg-gold/20 px-2 py-1 rounded">
                    {product.qty} {product.unit}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Checkout Panel */}
      <div className="w-[500px] flex flex-col glass-card p-6">
        <h2 className="text-2xl font-bold text-gold mb-4">تفاصيل الطلب</h2>

        {/* Customer Info */}
        <div className="space-y-3 mb-4">
          <input
            type="text"
            placeholder="👤 اسم العميل (اختياري)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
          />
          <input
            type="tel"
            placeholder="📱 رقم الهاتف *"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
            required
          />
          <textarea
            placeholder="📍 العنوان"
            value={customerAddress}
            onChange={(e) => setCustomerAddress(e.target.value)}
            className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 h-20 resize-none"
          />
          <textarea
            placeholder="📝 ملاحظات إضافية..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 h-20 resize-none"
          />
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto scrollbar-thin mb-4 space-y-2">
          {cart.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              السلة فارغة
            </div>
          ) : (
            cart.map((item, index) => (
              <div key={index} className="bg-gray-800 p-3 rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-gold flex-1">{item.name}</h4>
                  <button
                    onClick={() => removeFromCart(index)}
                    className="text-red-500 hover:text-red-400 text-xl"
                  >
                    ×
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={item.cart_qty}
                    onChange={(e) => updateCartQty(index, parseFloat(e.target.value) || 0)}
                    className="w-20 bg-gray-700 text-white px-2 py-1 rounded text-center"
                    min="1"
                  />
                  <span className="text-sm">×</span>
                  <input
                    type="number"
                    value={item.final_price}
                    onChange={(e) => updateCartPrice(index, e.target.value)}
                    className="flex-1 bg-gray-700 text-white px-2 py-1 rounded"
                    step="0.01"
                  />
                  <span className="text-sm font-bold text-gold">
                    {formatCurrency(item.final_price * item.cart_qty)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Totals */}
        <div className="space-y-2 mb-4 bg-gray-800 p-4 rounded-lg">
          <div className="flex justify-between">
            <span>المجموع الجزئي:</span>
            <span className="font-bold">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>الخصم:</span>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
                className="w-20 bg-gray-700 text-white px-2 py-1 rounded text-center"
                min="0"
                max="100"
              />
              <span>%</span>
              <span className="text-red-400">{formatCurrency(discountAmount)}</span>
            </div>
          </div>
          <div className="flex justify-between text-xl font-bold text-gold border-t border-gold/30 pt-2">
            <span>الإجمالي:</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>

        <button
          onClick={completeOnlineSale}
          disabled={cart.length === 0 || !customerPhone || isProcessing}
          className="btn-gold w-full py-4 text-xl disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? '⏳ جاري التسجيل...' : '✅ تأكيد الطلب'}
        </button>
      </div>
    </div>
  );
};

export default OnlineSalesModule;
