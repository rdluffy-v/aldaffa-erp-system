import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { formatCurrency, formatNumber } from '../utils/helpers.js';
import { ShoppingBag, Truck, CheckCircle2, Clock, Smartphone, Plus, Trash2 } from 'lucide-react';
import { FlaconSphere, FlaconAtomizer } from '../components/ui/FlaconIcons.jsx';

const salesRepo = new SalesRepository();

const SHIPMENT_STATUSES = [
  { id: 'new', label: 'أوامر جديدة', icon: Clock, color: 'text-amber-600 bg-amber-100 border-amber-300 dark:bg-amber-950/40 dark:border-amber-700' },
  { id: 'processing', label: 'قيد التجهيز', icon: ShoppingBag, color: 'text-blue-600 bg-blue-100 border-blue-300 dark:bg-blue-950/40 dark:border-blue-700' },
  { id: 'in_transit', label: 'شحنات قادمة', icon: Truck, color: 'text-emerald-600 bg-emerald-100 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-700' },
  { id: 'completed', label: 'مكتملة', icon: CheckCircle2, color: 'text-purple-600 bg-purple-100 border-purple-300 dark:bg-purple-950/40 dark:border-purple-700' }
];

const OnlineSalesModule = () => {
  const { products, loading: productsLoading, loadProducts } = useInventoryStore();
  const { showSuccess, showError, showWarning } = useUIStore();

  const [activeTab, setActiveTab] = useState('new');
  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recentOnlineOrders, setRecentOnlineOrders] = useState([]);

  useEffect(() => {
    loadProducts();
    loadRecentOrders();

    const handleRefresh = () => {
      loadProducts();
      loadRecentOrders();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, [loadProducts]);

  const loadRecentOrders = async () => {
    try {
      const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
      const sales = await salesRepo.getSalesInRange(thirtyHoursAgo, new Date().toISOString());
      setRecentOnlineOrders(sales.filter(s => s.type === 'online'));
    } catch (e) {
      console.error(e);
    }
  };

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

      const results = await salesRepo.createSaleWithItems(saleData, saleItems);
      const saleId = results[0]?.lastInsertRowid;

      setCart([]);
      setDiscount(0);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setNotes('');
      await loadProducts(true);
      await loadRecentOrders();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
      }

      showSuccess(`✅ تم تسجيل الطلب بنجاح\nرقم الطلب: #${saleId}\nالعميل: ${customerName || customerPhone}`);
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
  const totalOnlineRevenue = recentOnlineOrders.reduce((sum, o) => sum + (o.total || 0), 0);

  return (
    <div className="h-full flex gap-4 overflow-hidden">
      {/* Main Order Creation & Timeline Panel */}
      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        {/* Top Timeline Stepper Bar */}
        <div className="atelier-card p-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <FlaconSphere className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-[#2D2424] dark:text-slate-100">
                مبيعات الأونلاين والشحنات
              </h2>
              <p className="text-xs text-[#5C524F] dark:text-slate-400">
                إدارة مسار الطلبات والشحن المباشر — ليبيا
              </p>
            </div>
          </div>

          {/* Stepper Status Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-white/60 dark:bg-slate-950/60 rounded-full border border-amber-900/10 dark:border-amber-500/20">
            {SHIPMENT_STATUSES.map((st) => {
              const Icon = st.icon;
              const isActive = activeTab === st.id;
              return (
                <button
                  key={st.id}
                  onClick={() => setActiveTab(st.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-[#D4A359] to-[#9EBAA4] text-[#2D2424] shadow-sm'
                      : 'text-[#5C524F] dark:text-slate-300 hover:bg-white/40'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{st.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Products Grid & Selector */}
        <div className="flex-1 atelier-card p-4 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
            <input
              type="text"
              placeholder="🔍 بحث سريع عن عطر بالاسم..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-atelier flex-1 py-2 text-xs"
            />
            <span className="text-xs font-semibold text-[#8C827A] dark:text-slate-400 shrink-0">
              {filteredProducts.length} عطر متوفر
            </span>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 content-start">
            {productsLoading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="atelier-card p-3 animate-pulse h-28" />
              ))
            ) : filteredProducts.length === 0 ? (
              <div className="col-span-4 text-center text-[#8C827A] py-12">
                لا توجد منتجات مطابقة في المخزون
              </div>
            ) : (
              filteredProducts.map(product => (
                <motion.div
                  key={product.id}
                  onClick={() => addToCart(product)}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  className="atelier-card p-3 cursor-pointer hover:border-amber-500/50 flex flex-col justify-between"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-slate-800 border border-amber-200/50 dark:border-amber-900/30 flex items-center justify-center shrink-0 overflow-hidden">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <FlaconAtomizer className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-xs text-[#2D2424] dark:text-amber-300 truncate">{product.name}</h4>
                      <span className="text-[10px] text-[#8C827A] dark:text-slate-400 block">{product.category || 'عطور'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-amber-900/10 dark:border-white/5">
                    <span className="text-xs font-black text-amber-700 dark:text-amber-400">{formatCurrency(product.price)}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold">
                      {product.qty} {product.unit}
                    </span>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Side: Order Summary & Metric Badges */}
      <div className="w-88 flex flex-col gap-4 shrink-0 overflow-hidden">
        {/* Metric Badges */}
        <div className="grid grid-cols-3 gap-2 shrink-0">
          <div className="atelier-card p-2.5 text-center flex flex-col items-center justify-center">
            <span className="text-[10px] text-[#5C524F] dark:text-slate-400 font-bold">أوامر جديدة</span>
            <span className="text-sm font-black text-amber-600 dark:text-amber-400">{recentOnlineOrders.length}</span>
          </div>
          <div className="atelier-card p-2.5 text-center flex flex-col items-center justify-center">
            <span className="text-[10px] text-[#5C524F] dark:text-slate-400 font-bold">شحنات</span>
            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{recentOnlineOrders.length}</span>
          </div>
          <div className="atelier-card p-2.5 text-center flex flex-col items-center justify-center">
            <span className="text-[10px] text-[#5C524F] dark:text-slate-400 font-bold">الإجمالي</span>
            <span className="text-xs font-black text-[#2D2424] dark:text-slate-200 truncate">{formatCurrency(totalOnlineRevenue)}</span>
          </div>
        </div>

        {/* Customer & Checkout Panel */}
        <div className="flex-1 atelier-card p-4 flex flex-col min-h-0 overflow-hidden">
          <h3 className="font-extrabold text-sm text-[#2D2424] dark:text-slate-200 mb-2 shrink-0">
            بيانات العميل والشحن
          </h3>

          <div className="space-y-2 mb-3 shrink-0">
            <input
              type="text"
              placeholder="👤 اسم العميل (اختياري)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="input-atelier w-full py-1.5 px-2.5 text-xs"
            />
            <input
              type="tel"
              placeholder="📱 رقم الهاتف *"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="input-atelier w-full py-1.5 px-2.5 text-xs"
              required
            />
            <input
              type="text"
              placeholder="📍 عنوان التوصيل (المدينة، الحي)"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              className="input-atelier w-full py-1.5 px-2.5 text-xs"
            />
          </div>

          {/* Cart Basket */}
          <div className="flex-1 overflow-y-auto scrollbar-thin space-y-1.5 min-h-0 mb-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#8C827A] text-xs">
                <span>🛒 السلة فارغة</span>
                <span className="text-[10px] mt-0.5">انقر على عطر لإضافته</span>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={idx} className="p-2 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-amber-900/10 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-[#2D2424] dark:text-amber-300 truncate">{item.name}</p>
                    <p className="text-[10px] text-[#8C827A] dark:text-slate-400">{formatCurrency(item.final_price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      value={item.cart_qty}
                      onChange={(e) => updateCartQty(idx, parseInt(e.target.value) || 1)}
                      className="w-10 text-center py-0.5 text-xs bg-white dark:bg-slate-900 border border-amber-900/20 rounded font-bold"
                    />
                    <button onClick={() => removeFromCart(idx)} className="text-rose-500 hover:text-rose-700 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Totals & Submit */}
          <div className="pt-2 border-t border-amber-900/10 dark:border-white/5 shrink-0 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-[#5C524F] dark:text-slate-400">الإجمالي:</span>
              <span className="text-sm font-black text-amber-700 dark:text-amber-400">{formatCurrency(total)}</span>
            </div>

            <button
              onClick={completeOnlineSale}
              disabled={cart.length === 0 || !customerPhone || isProcessing}
              className="btn-atelier-primary w-full py-2.5 text-xs font-bold disabled:opacity-50"
            >
              {isProcessing ? '⏳ جارٍ التأكيد...' : '✅ تأكيد طلب الأونلاين'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnlineSalesModule;
