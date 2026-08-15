import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FlaskConical, Check, DollarSign } from 'lucide-react';
import { formatCurrency } from '../utils/helpers.js';

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

  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        dir="rtl"
      >
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

        <motion.div
          className="relative w-full max-w-lg bg-[#111827] border border-[#d97706]/20 rounded-2xl p-6 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar text-[#e6edf3]"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-5 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/20">
                <FlaskConical className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#e6edf3]">اختيار جرعة الزيت / العطر</h2>
                <p className="text-xs text-[#fbbf24] font-semibold">{product.name}</p>
                <p className="text-[11px] text-[#768390]">السعة الإجمالية للعبوة: {product.capacity} مل</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#768390] hover:text-[#e6edf3] hover:bg-white/5 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Predefined Portions */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-[#adbac7] mb-2">الجرعات القياسية الجاهزة:</label>
            <div className="grid grid-cols-5 gap-2">
              {predefinedPortions.map((ml) => (
                <button
                  key={ml}
                  type="button"
                  onClick={() => {
                    setSelectedPortion(ml);
                    setCustomMl('');
                    setCustomPrice('');
                  }}
                  disabled={ml > product.capacity}
                  className={`py-2.5 rounded-xl font-bold text-xs transition-all border ${
                    selectedPortion === ml
                      ? 'bg-gradient-to-l from-[#fbbf24] to-[#f59e0b] text-[#0d1117] border-[#fbbf24] shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                      : ml > product.capacity
                      ? 'bg-[#161b22]/50 text-[#545d68] border-transparent cursor-not-allowed'
                      : 'bg-[#161b22] text-[#adbac7] border-white/5 hover:border-white/20'
                  }`}
                >
                  {ml} مل
                </button>
              ))}
            </div>
          </div>

          {/* Custom Portion */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-[#adbac7] mb-1.5">أو جرعة مخصصة (بالمل):</label>
            <div className="relative">
              <input
                type="number"
                placeholder={`أدخل الكمية (الحد الأقصى ${product.capacity} مل)`}
                value={customMl}
                onChange={(e) => {
                  setCustomMl(e.target.value);
                  setSelectedPortion('custom');
                  setCustomPrice('');
                }}
                className="w-full bg-[#161b22] text-[#e6edf3] px-3.5 py-2.5 rounded-xl border border-white/10 text-xs focus:border-[#fbbf24] focus:outline-none"
                min="1"
                max={product.capacity}
              />
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-[#768390] font-bold">مل</span>
            </div>
          </div>

          {/* Quantity */}
          <div className="mb-4">
            <label className="block text-xs font-bold text-[#adbac7] mb-1.5">عدد العبوات المطلوبة:</label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseFloat(e.target.value) || 1))}
              className="w-full bg-[#161b22] text-[#e6edf3] px-3.5 py-2 rounded-xl border border-white/10 text-xs focus:border-[#fbbf24] focus:outline-none"
              min="1"
              step="1"
            />
          </div>

          {/* Dynamic Cost & Pricing Calculation */}
          {activePortion ? (
            <div className="bg-[#161b22] border border-white/10 p-4 rounded-xl mb-5 space-y-2 text-xs">
              <div className="flex justify-between text-[#adbac7]">
                <span>الجرعة المحددة:</span>
                <span className="font-bold text-[#e6edf3]">{activePortion} مل</span>
              </div>
              <div className="flex justify-between text-[#adbac7]">
                <span>السعر النسبي المحسوب:</span>
                <span className="font-bold text-[#e6edf3]">{formatCurrency(calculatePortionPrice(activePortion))}</span>
              </div>
              <div className="flex justify-between text-[#adbac7]">
                <span>تكلفة الجرعة:</span>
                <span>{formatCurrency(calculatePortionCost(activePortion))}</span>
              </div>

              <div className="border-t border-white/10 pt-2 mt-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[#adbac7] font-bold">تعديل سعر البيع يدوياً:</span>
                  <input
                    type="number"
                    value={customPrice || calculatePortionPrice(activePortion)}
                    onChange={(e) => setCustomPrice(e.target.value)}
                    className="w-32 bg-[#0d1117] text-[#e6edf3] px-2.5 py-1.5 rounded-lg border border-white/10 text-left text-xs font-bold focus:border-[#fbbf24] focus:outline-none"
                    step="0.01"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-[#adbac7]">هامش الربح التقديري:</span>
                  <span className={`font-bold ${profit >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                    {formatCurrency(profit)} ({profitMargin.toFixed(1)}%)
                  </span>
                </div>
              </div>

              <div className="border-t border-[#fbbf24]/30 pt-2 flex justify-between items-center text-sm font-bold mt-2">
                <span className="text-[#fbbf24]">الإجمالي النهائي:</span>
                <span className="text-base font-extrabold text-[#fbbf24]">
                  {formatCurrency(activePrice * quantity)}
                </span>
              </div>
            </div>
          ) : null}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!activePortion}
              className="flex-1 btn-primary text-xs flex items-center justify-center gap-2 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              إضافة الجرعة للسلة
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary text-xs py-2.5"
            >
              إلغاء
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};

export default PortionModal;

