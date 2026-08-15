/**
 * ============================================================================
 * RETURNS MODULE - REFACTORED WITH REPOSITORY PATTERN + UI STORE
 * ============================================================================
 *
 * Features:
 * - SalesRepository + InventoryRepository + sale_items/returns repositories
 * - useUIStore toasts (replaces alert/confirm)
 * - Search sale by invoice ID
 * - Restore stock on return (uses InventoryRepository.adjustStock)
 * - Loading skeletons + empty states
 *
 * Architecture reference: src/modules/POS.jsx
 * ============================================================================
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { BaseRepository } from '../database/repositories/BaseRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate, safeParseFloat } from '../utils/helpers.js';

const salesRepo = new SalesRepository();
const inventoryRepo = new InventoryRepository();
const saleItemsRepo = new BaseRepository('sale_items');
const returnsRepo = new BaseRepository('returns');

const ReturnsModule = () => {
  const { showSuccess, showError, showWarning, showInfo } = useUIStore();

  const [activeChannel, setActiveChannel] = useState('pos'); // 'pos' | 'online'
  const [allRecentSales, setAllRecentSales] = useState([]);
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleItems, setSaleItems] = useState([]);
  const [returnItems, setReturnItems] = useState([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  // Sale ID search
  const [saleIdSearch, setSaleIdSearch] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    loadRecentSales();
  }, []);

  // ---------------------------------------------------------------
  // Load recent sales (last 30 hours) with item counts
  // ---------------------------------------------------------------
  const loadRecentSales = useCallback(async () => {
    setLoadingList(true);
    try {
      const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
      const sales = await salesRepo.getSalesInRange(thirtyHoursAgo, new Date().toISOString());

      // Attach item count per sale (bounded by the 30-hour window)
      const withCounts = [];
      for (const sale of sales) {
        const items = await saleItemsRepo.findAll({ sale_id: sale.id });
        withCounts.push({ ...sale, items_count: items.length });
      }
      setAllRecentSales(withCounts);
    } catch (error) {
      showError(`خطأ في تحميل الفواتير: ${error.message}`);
    } finally {
      setLoadingList(false);
    }
  }, [showError]);

  const recentSales = useMemo(() => {
    if (activeChannel === 'pos') {
      return allRecentSales.filter(s => s.type !== 'online');
    }
    return allRecentSales.filter(s => s.type === 'online');
  }, [allRecentSales, activeChannel]);

  // ---------------------------------------------------------------
  // Search a sale by invoice ID
  // ---------------------------------------------------------------
  const searchSaleById = async () => {
    const id = parseInt(saleIdSearch, 10);
    if (isNaN(id) || id <= 0) {
      showWarning('يرجى إدخال رقم فاتورة صحيح');
      return;
    }

    setSearching(true);
    try {
      const sale = await salesRepo.findById(id);
      if (!sale) {
        showError(`لم يتم العثور على فاتورة برقم ${id}`);
        return;
      }

      const items = await saleItemsRepo.findAll({ sale_id: sale.id });
      const saleWithCount = { ...sale, items_count: items.length };

      // Bring the found invoice to the top of the list if not already there
      setRecentSales((prev) => {
        if (prev.some((s) => s.id === sale.id)) return prev;
        return [saleWithCount, ...prev];
      });

      await selectSale(saleWithCount);
      showInfo(`تم العثور على الفاتورة رقم ${id}`);
    } catch (error) {
      showError(`خطأ في البحث عن الفاتورة: ${error.message}`);
    } finally {
      setSearching(false);
    }
  };

  // ---------------------------------------------------------------
  // Select a sale and load its items
  // ---------------------------------------------------------------
  const selectSale = async (sale) => {
    setSelectedSale(sale);
    setLoading(true);
    try {
      const items = await saleItemsRepo.findAll({ sale_id: sale.id });
      setSaleItems(items);
      setReturnItems(items.map((item) => ({ ...item, return_qty: 0 })));
    } catch (error) {
      showError(`خطأ في تحميل منتجات الفاتورة: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------------------------------------------------
  // Return quantity helpers
  // ---------------------------------------------------------------
  const updateReturnQty = (index, qty) => {
    setReturnItems((prev) => {
      const updated = [...prev];
      const maxQty = updated[index].cart_qty;
      updated[index].return_qty = Math.min(Math.max(0, qty), maxQty);
      return updated;
    });
  };

  const selectFullReturn = () => {
    setReturnItems(returnItems.map((item) => ({
      ...item,
      return_qty: item.cart_qty
    })));
  };

  const clearSelection = () => {
    setReturnItems(returnItems.map((item) => ({ ...item, return_qty: 0 })));
  };

  // ---------------------------------------------------------------
  // Process the return: restore stock, update sale, record return
  // ---------------------------------------------------------------
  const processReturn = async () => {
    if (!selectedSale) return;

    const itemsToReturn = returnItems.filter((item) => item.return_qty > 0);

    if (itemsToReturn.length === 0) {
      showWarning('يرجى تحديد المنتجات المراد إرجاعها');
      return;
    }

    setLoading(true);

    try {
      let totalReturnAmount = 0;
      let totalReturnCost = 0;

      for (const item of itemsToReturn) {
        const returnAmount = item.final_price * item.return_qty;
        const returnCost = item.unit_cost * item.return_qty;

        totalReturnAmount += returnAmount;
        totalReturnCost += returnCost;

        // Restore inventory (portion-aware, matching original POS math)
        const qtyToRestore = item.portion_ml
          ? (item.return_qty * item.portion_ml / (item.capacity || 1))
          : item.return_qty;

        await inventoryRepo.adjustStock(item.product_id, qtyToRestore);

        // Update sale item quantity (or delete if fully returned)
        const newQty = item.cart_qty - item.return_qty;
        if (newQty === 0) {
          await saleItemsRepo.delete(item.id);
        } else {
          await saleItemsRepo.update(item.id, { cart_qty: newQty });
        }
      }

      // Update sale totals
      const newTotal = selectedSale.total - totalReturnAmount;
      const profitLoss = totalReturnAmount - totalReturnCost;
      const newProfit = selectedSale.profit - profitLoss;

      await salesRepo.update(selectedSale.id, {
        total: newTotal,
        subtotal: newTotal + (selectedSale.discount || 0),
        profit: newProfit
      });

      // Record the return transaction
      await returnsRepo.create({
        sale_id: selectedSale.id,
        date: new Date().toISOString(),
        returned_amount: totalReturnAmount,
        returned_cost: totalReturnCost,
        items_json: JSON.stringify(itemsToReturn.map((item) => ({
          name: item.name,
          qty: item.return_qty,
          price: item.final_price
        })))
      });

      showSuccess(`✅ تم معالجة المرتجع بنجاح\nالمبلغ المسترجع: ${formatCurrency(totalReturnAmount)}`);

      // Reset state and refresh the recent sales list
      setSelectedSale(null);
      setSaleItems([]);
      setReturnItems([]);
      setReason('');
      await loadRecentSales();
    } catch (error) {
      showError(`خطأ في معالجة المرتجع: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const totalReturnAmount = returnItems.reduce(
    (sum, item) => sum + (item.final_price * item.return_qty),
    0
  );

  // ===============================================================
  // RENDER
  // ===============================================================
  return (
    <div className="h-full flex gap-6">
      {/* Sales List */}
      <div className="flex-1 flex flex-col glass-card p-6">
        <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-[#2D2424] dark:text-amber-300 flex items-center gap-2">
              <span>↩️</span>
              <span>مرتجعات الفواتير</span>
            </h2>
            <div className="inline-flex rounded-full bg-gray-200 dark:bg-slate-800 p-1 border border-amber-500/20">
              <button
                type="button"
                onClick={() => setActiveChannel('pos')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  activeChannel === 'pos'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-[#5C524F] dark:text-slate-300 hover:text-[#2D2424] dark:hover:text-white'
                }`}
              >
                🏪 مبيعات المحل (POS)
              </button>
              <button
                type="button"
                onClick={() => setActiveChannel('online')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  activeChannel === 'online'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-[#5C524F] dark:text-slate-300 hover:text-[#2D2424] dark:hover:text-white'
                }`}
              >
                🚚 مبيعات الأونلاين
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="بحث برقم الفاتورة..."
                value={saleIdSearch}
                onChange={(e) => setSaleIdSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') searchSaleById();
                }}
                className="bg-white dark:bg-slate-800 text-[#2D2424] dark:text-white px-3 py-1.5 rounded-lg border border-amber-500/30 w-[160px] focus:outline-none focus:border-amber-500 text-xs"
              />
              <button
                onClick={searchSaleById}
                disabled={searching}
                className="btn-atelier-primary px-3 py-1 text-xs"
              >
                {searching ? '⏳' : '🔍 بحث'}
              </button>
            </div>
            <button
              onClick={loadRecentSales}
              className="btn-atelier-secondary px-3 py-1 text-xs"
            >
              🔄 تحديث
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2">
          {loadingList ? (
            // Loading skeletons
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="glass-card p-4 animate-pulse">
                  <div className="h-5 bg-gray-700 rounded w-1/3 mb-2"></div>
                  <div className="h-4 bg-gray-700 rounded w-1/2 mb-3"></div>
                  <div className="h-8 bg-gray-700 rounded"></div>
                </div>
              ))}
            </div>
          ) : recentSales.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="text-6xl mb-4">🧾</div>
              <p className="text-xl mb-2">لا توجد فواتير في آخر 30 ساعة</p>
              <p className="text-sm">أو استخدم البحث برقم الفاتورة لإيجاد فاتورة أقدم</p>
            </div>
          ) : (
            recentSales.map((sale) => (
              <div
                key={sale.id}
                onClick={() => selectSale(sale)}
                className={`glass-card p-4 cursor-pointer transition-all ${
                  selectedSale?.id === sale.id
                    ? 'border-2 border-gold'
                    : 'hover:border-gold/50'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-gold text-lg">فاتورة #{sale.id}</h3>
                    <p className="text-sm text-gray-400">{formatDate(sale.date)}</p>
                    {sale.customer_name && (
                      <p className="text-sm text-blue-400">👤 {sale.customer_name}</p>
                    )}
                  </div>
                  <div className="text-left">
                    <div className="text-xl font-bold text-gold">
                      {formatCurrency(sale.total)}
                    </div>
                    <div className="text-sm text-gray-400">
                      {sale.items_count || 0} منتج
                    </div>
                    <div className="text-xs text-gray-500">
                      {sale.payment_method === 'cash'
                        ? '💵'
                        : sale.payment_method === 'card'
                        ? '💳'
                        : '🏦'}
                    </div>
                  </div>
                </div>
                {sale.type === 'online' && (
                  <div className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded inline-block">
                    📱 طلب أونلاين
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Return Processing */}
      <div className="w-[500px] flex flex-col glass-card p-6">
        <h2 className="text-2xl font-bold text-gold mb-4">معالجة المرتجع</h2>

        {!selectedSale ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-2">
            <div className="text-5xl">↩️</div>
            <p>اختر فاتورة من القائمة أو ابحث برقمها</p>
          </div>
        ) : (
          <>
            <div className="bg-gray-800 p-4 rounded-lg mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-gray-400">فاتورة:</span>
                <span className="font-bold">#{selectedSale.id}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-400">التاريخ:</span>
                <span>{formatDate(selectedSale.date)}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-400">المجموع:</span>
                <span className="font-bold text-gold">{formatCurrency(selectedSale.total)}</span>
              </div>
              {selectedSale.customer_name && (
                <div className="flex justify-between">
                  <span className="text-gray-400">العميل:</span>
                  <span>{selectedSale.customer_name}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={selectFullReturn}
                disabled={returnItems.length === 0}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                إرجاع كامل
              </button>
              <button
                onClick={clearSelection}
                className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-600 transition-colors"
              >
                مسح الاختيار
              </button>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin mb-4 space-y-2">
              {loading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-gray-800 p-3 rounded-lg animate-pulse">
                      <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
                      <div className="h-8 bg-gray-700 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : returnItems.length === 0 ? (
                <div className="text-center text-gray-500 py-8">لا توجد منتجات في الفاتورة</div>
              ) : (
                returnItems.map((item, index) => (
                  <div key={item.id} className="bg-gray-800 p-3 rounded-lg">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-bold text-gold">{item.name}</h4>
                        <div className="text-xs text-gray-400">
                          الكمية الأصلية: {item.cart_qty} {item.unit || ''}
                        </div>
                        {item.portion_ml && (
                          <div className="text-xs text-blue-400">{item.portion_ml}ml</div>
                        )}
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-bold">{formatCurrency(item.final_price)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-sm">الكمية المرتجعة:</span>
                      <input
                        type="number"
                        value={item.return_qty}
                        onChange={(e) =>
                          updateReturnQty(index, safeParseFloat(e.target.value, 0))
                        }
                        className="w-24 bg-gray-700 text-white px-2 py-1 rounded text-center"
                        min="0"
                        max={item.cart_qty}
                        step="0.1"
                      />
                      <span className="text-sm text-gray-400">/ {item.cart_qty}</span>
                      {item.return_qty > 0 && (
                        <span className="mr-auto text-sm font-bold text-red-400">
                          -{formatCurrency(item.final_price * item.return_qty)}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <textarea
              placeholder="سبب الإرجاع..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 h-20 resize-none mb-4"
            />

            <div className="bg-gray-800 p-4 rounded-lg mb-4">
              <div className="flex justify-between text-xl font-bold text-red-400">
                <span>المبلغ المسترجع:</span>
                <span>{formatCurrency(totalReturnAmount)}</span>
              </div>
            </div>

            <button
              onClick={processReturn}
              disabled={totalReturnAmount === 0 || loading}
              className="btn-gold w-full py-4 text-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '⏳ جاري المعالجة...' : '✅ تأكيد الإرجاع'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ReturnsModule;
