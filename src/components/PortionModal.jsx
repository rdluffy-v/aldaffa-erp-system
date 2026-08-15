import React, { useState } from 'react';
import { formatCurrency } from '../db';

const PortionModal = ({ product, pricingMode, onSelect, onClose }) => {
  const [selectedPortion, setSelectedPortion] = useState(null);
  const [customMl, setCustomMl] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [customPrice, setCustomPrice] = useState('');

  const predefinedPortions = [5, 10, 20, 30, 50];

  const calculatePortionPrice = (ml) => {
    if (!product.capacity || product.capacity === 0) return 0;

    const basePrice = pricingMode === 'wholesale'
      ? (product.wholesale_price || product.price)
      : product.price;

    const ratio = ml / product.capacity;
    return basePrice * ratio;
  };

  const calculatePortionCost = (ml) => {
    if (!product.capacity || product.capacity === 0) return 0;
    const ratio = ml / product.capacity;
    return product.cost * ratio;
  };

  const calculateProfit = (ml, price) => {
    const cost = calculatePortionCost(ml);
    return price - cost;
  };

  const getActivePortion = () => {
    if (selectedPortion === 'custom' && customMl) {
      return parseFloat(customMl);
    }
    if (typeof selectedPortion === 'number') {
      return selectedPortion;
    }
    return null;
  };

  const getActivePrice = () => {
    const portion = getActivePortion();
    if (!portion) return 0;

    if (customPrice) {
      return parseFloat(customPrice);
    }

    return calculatePortionPrice(portion);
  };

  const handleConfirm = () => {
    const portion = getActivePortion();
    if (!portion || portion <= 0) {
      alert('يرجى تحديد جرعة صحيحة');
      return;
    }

    if (portion > product.capacity) {
      alert(`الجرعة أكبر من سعة المنتج (${product.capacity}ml)`);
      return;
    }

    const price = getActivePrice();
    if (price <= 0) {
      alert('يرجى تحديد سعر صحيح');
      return;
    }

    onSelect(quantity, price, portion);
  };

  const activePortion = getActivePortion();
  const activePrice = getActivePrice();
  const profit = activePortion ? calculateProfit(activePortion, activePrice) : 0;
  const profitMargin = activePrice > 0 ? ((profit / activePrice) * 100) : 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
      <div className="glass-card p-6 w-[600px] max-h-[90vh] overflow-y-auto scrollbar-thin">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gold">اختيار الجرعة</h2>
            <p className="text-gray-400">{product.name}</p>
            <p className="text-sm text-gray-500">
              السعة الكاملة: {product.capacity}ml
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-3xl"
          >
            ×
          </button>
        </div>

        {/* Predefined Portions */}
        <div className="mb-4">
          <h3 className="text-sm text-gray-400 mb-2">الجرعات المحددة مسبقاً:</h3>
          <div className="grid grid-cols-5 gap-2">
            {predefinedPortions.map(ml => (
              <button
                key={ml}
                onClick={() => {
                  setSelectedPortion(ml);
                  setCustomMl('');
                  setCustomPrice('');
                }}
                disabled={ml > product.capacity}
                className={`py-3 rounded-lg font-bold transition-all ${
                  selectedPortion === ml
                    ? 'bg-gradient-to-r from-gold to-gold-dark text-navy'
                    : ml > product.capacity
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-gray-700 text-white hover:bg-gray-600'
                }`}
              >
                {ml}ml
              </button>
            ))}
          </div>
        </div>

        {/* Custom Portion */}
        <div className="mb-4">
          <h3 className="text-sm text-gray-400 mb-2">جرعة مخصصة:</h3>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="أدخل الكمية بالمل"
              value={customMl}
              onChange={(e) => {
                setCustomMl(e.target.value);
                setSelectedPortion('custom');
                setCustomPrice('');
              }}
              className="flex-1 bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
              min="1"
              max={product.capacity}
            />
            <span className="flex items-center text-gray-400">ml</span>
          </div>
        </div>

        {/* Quantity */}
        <div className="mb-4">
          <h3 className="text-sm text-gray-400 mb-2">عدد العبوات:</h3>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
            className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
            min="1"
            step="1"
          />
        </div>

        {/* Price Calculation */}
        {activePortion && (
          <div className="bg-gray-800 p-4 rounded-lg mb-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">الجرعة المحددة:</span>
              <span className="font-bold">{activePortion}ml</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">السعر المحسوب:</span>
              <span className="font-bold">{formatCurrency(calculatePortionPrice(activePortion))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">التكلفة:</span>
              <span>{formatCurrency(calculatePortionCost(activePortion))}</span>
            </div>
            <div className="border-t border-gray-700 pt-2">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">السعر النهائي:</span>
                <input
                  type="number"
                  value={customPrice || calculatePortionPrice(activePortion)}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="w-32 bg-gray-700 text-white px-3 py-1 rounded text-left"
                  step="0.01"
                />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">الربح:</span>
                <span className={profit > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                  {formatCurrency(profit)} ({profitMargin.toFixed(1)}%)
                </span>
              </div>
            </div>
            <div className="border-t border-gold/30 pt-2 flex justify-between text-xl">
              <span className="text-gold">الإجمالي:</span>
              <span className="font-bold text-gold">
                {formatCurrency(activePrice * quantity)}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={!activePortion}
            className="flex-1 btn-gold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ✅ إضافة للسلة
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg font-bold hover:bg-gray-600"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};

export default PortionModal;
