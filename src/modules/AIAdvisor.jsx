import React, { useState, useEffect, useCallback } from 'react';
import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { PurchasesRepository } from '../database/repositories/PurchasesRepository.js';
import { WithdrawalsRepository } from '../database/repositories/WithdrawalsRepository.js';
import { CapitalRepository } from '../database/repositories/CapitalRepository.js';
import { LossesRepository } from '../database/repositories/LossesRepository.js';
import { CategoriesRepository } from '../database/repositories/CategoriesRepository.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { SettingsRepository } from '../database/repositories/SettingsRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency } from '../utils/helpers.js';

const salesRepo = new SalesRepository();
const purchasesRepo = new PurchasesRepository();
const withdrawalsRepo = new WithdrawalsRepository();
const capitalRepo = new CapitalRepository();
const lossesRepo = new LossesRepository();
const categoriesRepo = new CategoriesRepository();
const inventoryRepo = new InventoryRepository();
const settingsRepo = new SettingsRepository();

// Far-future upper bound used with get*InRange to emulate `date >= cutoff`
const END_OF_TIME = new Date(8640000000000000).toISOString();

const AIAdvisorModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [geminiKey, setGeminiKey] = useState('');
  const [dateRange, setDateRange] = useState(30);

  const loadGeminiKey = useCallback(async () => {
    try {
      const value = await settingsRepo.getSetting('gemini_api_key');
      if (value !== null) {
        setGeminiKey(value);
      }
    } catch (error) {
      showError('خطأ في تحميل مفتاح Gemini: ' + error.message);
    }
  }, [showError]);

  useEffect(() => {
    loadGeminiKey();
  }, [loadGeminiKey]);

  const generateAnalysis = async () => {
    if (!geminiKey) {
      showWarning('يرجى إدخال مفتاح Gemini API في إعدادات المشتريات أولاً');
      return;
    }

    setLoading(true);

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - dateRange);
      const cutoffIso = cutoffDate.toISOString();

      // Gather business data via repositories
      const [sales, inventory, purchases, withdrawals, capitalInjections, losses, categories] =
        await Promise.all([
          salesRepo.getSalesInRange(cutoffIso, END_OF_TIME),
          inventoryRepo.findAll(),
          purchasesRepo.getPurchasesInRange(cutoffIso, END_OF_TIME),
          withdrawalsRepo.getWithdrawalsInRange(cutoffIso, END_OF_TIME),
          capitalRepo.getInjectionsInRange(cutoffIso, END_OF_TIME),
          lossesRepo.getLossesInRange(cutoffIso, END_OF_TIME),
          categoriesRepo.findAll()
        ]);

      // Calculate metrics
      const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
      const totalProfit = sales.reduce((sum, s) => sum + s.profit, 0);
      const totalPurchases = purchases.reduce((sum, p) => sum + p.total, 0);
      const totalWithdrawals = withdrawals.reduce((sum, w) => sum + w.amount, 0);
      const totalCapital = capitalInjections.reduce((sum, c) => sum + c.amount, 0);
      const totalLosses = losses.reduce((sum, l) => sum + l.cost_value, 0);
      const inventoryValue = inventory.reduce((sum, p) => sum + (p.cost * p.qty), 0);

      // Category performance
      const categoryPerformance = {};
      for (const cat of categories) {
        const catProducts = inventory.filter(p => p.category === cat.name);
        const catSales = sales.filter(s => {
          const items = JSON.parse(s.items_json || '[]');
          return items.some(item => catProducts.find(p => p.id === item.product_id));
        });

        categoryPerformance[cat.name] = {
          revenue: catSales.reduce((sum, s) => sum + s.total, 0),
          profit: catSales.reduce((sum, s) => sum + s.profit, 0),
          inventoryValue: catProducts.reduce((sum, p) => sum + (p.cost * p.qty), 0),
          lowStockCount: catProducts.filter(p => p.qty <= 10).length
        };
      }

      // Prepare AI prompt
      const prompt = `أنت مستشار مالي خبير لمحل عطور "الدفة". قم بتحليل البيانات التالية وقدم توصيات استراتيجية:

البيانات المالية (آخر ${dateRange} يوم):
- إجمالي الإيرادات: ${formatCurrency(totalRevenue)}
- إجمالي الأرباح: ${formatCurrency(totalProfit)}
- هامش الربح: ${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%
- المشتريات: ${formatCurrency(totalPurchases)}
- السحوبات النقدية: ${formatCurrency(totalWithdrawals)}
- الضخ الرأسمالي: ${formatCurrency(totalCapital)}
- الخسائر والتالف: ${formatCurrency(totalLosses)}
- قيمة المخزون الحالية: ${formatCurrency(inventoryValue)}

أداء الفئات:
${Object.entries(categoryPerformance).map(([name, perf]) =>
  `- ${name}: إيرادات ${formatCurrency(perf.revenue)}, أرباح ${formatCurrency(perf.profit)}, مخزون ${formatCurrency(perf.inventoryValue)}, ${perf.lowStockCount} منتج منخفض`
).join('\n')}

عدد المنتجات: ${inventory.length}
المنتجات منخفضة المخزون: ${inventory.filter(p => p.qty <= 10).length}

قدم تحليلاً شاملاً يتضمن:
1. تقييم الوضع المالي الحالي
2. توصيات لتوزيع رأس المال على الفئات
3. تحذيرات من المخاطر المحتملة
4. فرص النمو والتوسع
5. نصائح لتحسين هامش الربح

اجعل التحليل عملياً وقابلاً للتنفيذ، بأرقام محددة.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      });

      const data = await response.json();

      if (data.candidates && data.candidates[0]) {
        const aiResponse = data.candidates[0].content.parts[0].text;

        setAnalysis({
          generatedAt: new Date().toISOString(),
          dateRange,
          metrics: {
            totalRevenue,
            totalProfit,
            profitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0,
            totalPurchases,
            totalWithdrawals,
            totalCapital,
            totalLosses,
            inventoryValue
          },
          categoryPerformance,
          aiInsights: aiResponse
        });

        showSuccess('✅ تم إكمال التحليل بنجاح');
      } else {
        throw new Error('فشل في الحصول على استجابة من AI');
      }
    } catch (error) {
      showError('خطأ في التحليل: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col glass-card p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>🤖</span>
          <span>المستشار الاستراتيجي بالذكاء الاصطناعي</span>
        </h2>
        <div className="flex gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(parseInt(e.target.value))}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30"
          >
            <option value={7}>آخر 7 أيام</option>
            <option value={30}>آخر 30 يوم</option>
            <option value={90}>آخر 90 يوم</option>
            <option value={365}>السنة كاملة</option>
          </select>
          <button
            onClick={generateAnalysis}
            disabled={loading}
            className="btn-gold px-6 py-2 disabled:opacity-50"
          >
            {loading ? '⏳ جاري التحليل...' : '🤖 تحليل الأعمال'}
          </button>
        </div>
      </div>

      <div className="bg-purple-600/10 border border-purple-400/30 p-4 rounded-lg mb-4">
        <div className="text-sm text-purple-400 space-y-1">
          <div>🧠 تحليل ذكي لوضعك المالي وأداء الفئات</div>
          <div>💡 توصيات لتوزيع رأس المال الأمثل</div>
          <div>📈 استراتيجيات لزيادة الأرباح وتقليل المخاطر</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && !analysis ? (
          <div className="space-y-4">
            <div className="glass-card p-4 animate-pulse">
              <div className="h-5 bg-gray-700 rounded mb-4 w-1/4"></div>
              <div className="grid grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-gray-800 p-3 rounded h-20"></div>
                ))}
              </div>
            </div>
            <div className="glass-card p-4 animate-pulse">
              <div className="h-5 bg-gray-700 rounded mb-4 w-1/4"></div>
              <div className="h-20 bg-gray-700 rounded"></div>
            </div>
          </div>
        ) : !analysis ? (
          <div className="text-center text-gray-500 py-12">
            <div className="text-6xl mb-4">🤖</div>
            <div className="text-lg mb-2">انقر على "تحليل الأعمال" للحصول على رؤى استراتيجية</div>
            <div className="text-sm">مدعوم بذكاء Gemini الاصطناعي</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Metrics Summary */}
            <div className="glass-card p-4">
              <h3 className="text-xl font-bold text-gold mb-4">ملخص الأداء</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-800 p-3 rounded">
                  <div className="text-xs text-gray-400">الإيرادات</div>
                  <div className="text-lg font-bold text-green-400">
                    {formatCurrency(analysis.metrics.totalRevenue)}
                  </div>
                </div>
                <div className="bg-gray-800 p-3 rounded">
                  <div className="text-xs text-gray-400">الأرباح</div>
                  <div className="text-lg font-bold text-gold">
                    {formatCurrency(analysis.metrics.totalProfit)}
                  </div>
                </div>
                <div className="bg-gray-800 p-3 rounded">
                  <div className="text-xs text-gray-400">هامش الربح</div>
                  <div className="text-lg font-bold text-blue-400">
                    {analysis.metrics.profitMargin.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-gray-800 p-3 rounded">
                  <div className="text-xs text-gray-400">قيمة المخزون</div>
                  <div className="text-lg font-bold text-purple-400">
                    {formatCurrency(analysis.metrics.inventoryValue)}
                  </div>
                </div>
              </div>
            </div>

            {/* Category Performance */}
            <div className="glass-card p-4">
              <h3 className="text-xl font-bold text-gold mb-4">أداء الفئات</h3>
              <div className="space-y-2">
                {Object.keys(analysis.categoryPerformance).length === 0 ? (
                  <div className="text-center text-gray-500 py-6">
                    لا توجد فئات مسجلة
                  </div>
                ) : (
                  Object.entries(analysis.categoryPerformance).map(([name, perf]) => (
                    <div key={name} className="bg-gray-800 p-3 rounded">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-bold">{name}</h4>
                        <span className="text-sm text-gold">{formatCurrency(perf.revenue)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-gray-400">أرباح: </span>
                          <span className="text-green-400">{formatCurrency(perf.profit)}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">مخزون: </span>
                          <span>{formatCurrency(perf.inventoryValue)}</span>
                        </div>
                        <div>
                          <span className="text-gray-400">منخفض: </span>
                          <span className="text-red-400">{perf.lowStockCount}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* AI Insights */}
            <div className="glass-card p-4">
              <h3 className="text-xl font-bold text-gold mb-4 flex items-center gap-2">
                <span>🧠</span>
                <span>توصيات الذكاء الاصطناعي</span>
              </h3>
              <div className="prose prose-invert max-w-none">
                <div className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {analysis.aiInsights}
                </div>
              </div>
            </div>

            <div className="text-xs text-gray-500 text-center">
              تم التحليل في: {new Date(analysis.generatedAt).toLocaleString('ar-SD')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAdvisorModule;
