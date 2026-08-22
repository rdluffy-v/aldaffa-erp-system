/**
 * ============================================================================
 * AI ADVISOR & OPERATIONAL CO-PILOT MODULE
 * Supports ANY Provider: OpenRouter, DeepSeek, Google Gemini, OpenAI, Groq, Ollama, LM Studio, Custom
 * ============================================================================
 */

import React, { useState, useEffect, useRef } from 'react';
import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { DebtorsRepository } from '../database/repositories/DebtorsRepository.js';
import { BaseRepository } from '../database/repositories/BaseRepository.js';
import { db } from '../database/connection.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate, generateId } from '../utils/helpers.js';
import {
  Sparkles,
  Send,
  Bot,
  User,
  CheckCircle,
  Settings as SettingsIcon,
  Zap,
  Eye,
  EyeOff,
  Server,
  Key,
  Cpu,
  RefreshCw,
  HelpCircle,
  Globe
} from 'lucide-react';

const salesRepo = new SalesRepository();
const inventoryRepo = new InventoryRepository();
const debtorsRepo = new DebtorsRepository();
const settingsRepo = new BaseRepository('settings');

const AI_PROVIDERS = [
  {
    id: 'openrouter',
    name: 'OpenRouter (يدعم جميع النماذج: Claude, DeepSeek, GPT, Gemini)',
    defaultUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openrouter/auto',
    requiresKey: true,
    hint: 'يوفر الوصول لكافة النماذج العالمية بمفتاح واحد (DeepSeek R1, Claude 3.7, GPT-4o)'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek Official API (فائق الذكاء واقتصادي جداً)',
    defaultUrl: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-chat',
    requiresKey: true,
    hint: 'المزود الرسمي لـ DeepSeek V3 و DeepSeek R1'
  },
  {
    id: 'gemini',
    name: 'Google Gemini (سريع ومجاني للبداية)',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-1.5-flash',
    requiresKey: true,
    hint: 'يدعم مفاتيح Google AI Studio الرسمية (AIzaSy...)'
  },
  {
    id: 'groq',
    name: 'Groq (استجابة فورية فائقة السرعة)',
    defaultUrl: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresKey: true,
    hint: 'أسرع محرك استدلال في العالم لنماذج Llama 3.3 مفتوحة المصدر'
  },
  {
    id: 'openai',
    name: 'OpenAI ChatGPT (GPT-4o / GPT-4o-mini)',
    defaultUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    requiresKey: true,
    hint: 'حسابات OpenAI الرسمية'
  },
  {
    id: 'ollama',
    name: 'Ollama (محلي 100% أوفلاين بدون إنترنت وبدون مفتاح)',
    defaultUrl: 'http://localhost:11434/v1/chat/completions',
    defaultModel: 'llama3',
    requiresKey: false,
    hint: 'تشغيل النماذج محلياً على جهازك دون الحاجة لمفتاح أو اتصال خارجي'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio / LocalAI (محلي على الحاسوب)',
    defaultUrl: 'http://localhost:1234/v1/chat/completions',
    defaultModel: 'local-model',
    requiresKey: false,
    hint: 'خادم محلي عبر تطبيق LM Studio'
  },
  {
    id: 'custom',
    name: 'مزود مخصص (Any Custom OpenAI-Compatible Provider)',
    defaultUrl: 'https://api.together.xyz/v1/chat/completions',
    defaultModel: 'meta-llama/Llama-3-70b-chat-hf',
    requiresKey: true,
    hint: 'أي رابط API متوافق مع معايير OpenAI Chat Completions'
  }
];

const SYSTEM_KNOWLEDGE_MANUAL = `
أنت المساعد الذكي والمستشار التشغيلي الخبير لمنظومة "الدفة للعطور" (Aldaffa Perfumes ERP).
المنظومة مصممة خصيصاً لمتاجر ومصانع العطور في ليبيا (العملة: د.ل).

دليلك التشغيلي الشامل لكافة وحدات المنظومة:
1. نقاط البيع (POS): بيع مباشر، باركود (F1)، خصم نسبة % أو مبلغ د.ل، دفع نقدي/بطاقة/تحويل/دين (آجل).
2. مبيعات الأونلاين (Online Sales): إدارة وتتبع شحنات التوصيل مع نافذة 30 ساعة.
3. المرتجعات (Returns): استرجاع جزئي أو كلي لفواتير المحل أو الأونلاين وإعادة الكميات للمخزون فوراً.
4. الفواتير (Invoices): أرشيف وتدقيق وإعادة طباعة فواتير المحل والأونلاين والمشتريات.
5. الديون والعملاء (Debtors): متابعة أرصدة العملاء، تسديد الدفعات، وسجل الحركات المالية.
6. المخزون (Inventory): متابعة كميات العطور والزجاجات، جرد يومي/أسبوعي/سنوي/مخصص، تسوية الفوارق.
7. المشتريات (Purchases): تسجيل فواتير التوريد، إضافة أصناف جديدة فورياً، توليد باركود تلقائي، وطباعة ملصقات الباركود.
8. مختبر تركيب العطور (Mix Lab): تركيب خلطات عطرية مخصصة، حساب نسب الزيت والكحول والزجاجة، وخصم المكونات آلياً من المخزون.
9. إغلاق الوردية (Shift Close): مطابقة النقدية الفعلية مع المتوقع، تسجيل العجز/الفائض، وحفظ الإغلاق في السجلات.
10. السحوبات والضخ الرأسمالي والخسائر والهدايا: تسجيل حركة الأموال والمصاريف والتوالف بدقة.

يمكنك تنفيذ عمليات حقيقية في قاعدة البيانات بأمان عندما يطلب المستخدم ذلك، والإجابة عن الأسئلة التشغيلية بدقة واحترافية وبلهجة ودية وواضحة.
`;

const AIAdvisorModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'مرحباً بك! أنا المستشار الذكي لمنظومة الدفة للعطور 🌿\nأنا متوافق الآن مع أي مزود ذكاء اصطناعي (OpenRouter, DeepSeek, Gemini, Groq, Ollama, OpenAI).\nكيف يمكنني مساعدتك اليوم؟ يمكنك سؤالي عن النظام، أو طلب تنفيذ عمليات مباشرة (مثل فحص النواقص، تقرير المبيعات، إضافة منتج، أو تسجيل دفعة دين).'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Settings
  const [selectedProvider, setSelectedProvider] = useState('openrouter');
  const [apiUrl, setApiUrl] = useState('https://openrouter.ai/api/v1/chat/completions');
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('openrouter/auto');
  const [showConfig, setShowConfig] = useState(false);
  const [showKeyPassword, setShowKeyPassword] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const loadSettings = async () => {
    try {
      const url = await settingsRepo.findOne({ key: 'ai_api_url' });
      const key = await settingsRepo.findOne({ key: 'ai_api_key' });
      const model = await settingsRepo.findOne({ key: 'ai_model_name' });
      const prov = await settingsRepo.findOne({ key: 'ai_provider' });
      const gemini = await settingsRepo.findOne({ key: 'gemini_api_key' });

      if (url?.value) setApiUrl(url.value);
      if (key?.value) setApiKey(key.value);
      else if (gemini?.value) setApiKey(gemini.value);
      if (model?.value) setModelName(model.value);
      if (prov?.value) setSelectedProvider(prov.value);
    } catch (e) {
      console.warn('loadSettings error:', e);
    }
  };

  const handleProviderSelect = (providerId) => {
    setSelectedProvider(providerId);
    const target = AI_PROVIDERS.find((p) => p.id === providerId);
    if (target) {
      setApiUrl(target.defaultUrl);
      setModelName(target.defaultModel);
    }
  };

  const normalizeApiEndpoint = (rawUrl) => {
    let clean = (rawUrl || '').trim();
    if (!clean) return 'https://openrouter.ai/api/v1/chat/completions';

    // Remove trailing slash
    clean = clean.replace(/\/+$/, '');

    // If user provided base URL without /chat/completions
    if (!clean.endsWith('/chat/completions') && !clean.endsWith('/generateContent')) {
      if (clean.includes('generativelanguage.googleapis.com')) {
        if (!clean.includes('/openai')) {
          clean = `${clean}/openai/chat/completions`;
        } else {
          clean = `${clean}/chat/completions`;
        }
      } else {
        clean = `${clean}/chat/completions`;
      }
    }
    return clean;
  };

  const saveSettings = async () => {
    try {
      const finalUrl = normalizeApiEndpoint(apiUrl);
      setApiUrl(finalUrl);

      const queries = [
        { sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', params: ['ai_api_url', finalUrl] },
        { sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', params: ['ai_api_key', apiKey.trim()] },
        { sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', params: ['ai_model_name', modelName.trim()] },
        { sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', params: ['ai_provider', selectedProvider] }
      ];
      await db.transaction(queries);
      showSuccess('✅ تم حفظ إعدادات محرك الذكاء الاصطناعي بنجاح');
      setShowConfig(false);
    } catch (e) {
      showError(`فشل حفظ الإعدادات: ${e.message}`);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const endpoint = normalizeApiEndpoint(apiUrl);
      const headers = {
        'Content-Type': 'application/json'
      };

      if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      if (endpoint.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = 'https://aldaffa-erp.local';
        headers['X-Title'] = 'Aldaffa Perfumes ERP';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName.trim() || 'openrouter/auto',
          messages: [{ role: 'user', content: 'رد بكلمة واحدة فقط: جاهز' }],
          max_tokens: 10,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        let errBody = '';
        try {
          const errData = await response.json();
          errBody = errData?.error?.message || JSON.stringify(errData);
        } catch (e) {
          errBody = `رمز الاستجابة ${response.status} (${response.statusText})`;
        }
        throw new Error(errBody);
      }

      const data = await response.json();
      const reply = data?.choices?.[0]?.message?.content || data?.candidates?.[0]?.content?.parts?.[0]?.text || 'متصل بنجاح';
      showSuccess(`✅ تم الاتصال بنجاح بمحرك الذكاء الاصطناعي! استجابة النموذج: "${reply.trim()}"`);
    } catch (err) {
      showError(`❌ فشل الاتصال بالمحرك: ${err.message}`);
    } finally {
      setTestingConnection(false);
    }
  };

  // AI Tool Executors (Function Calling Handler)
  const executeAITool = async (toolName, params) => {
    try {
      if (toolName === 'add_product') {
        const { name, cost_price, sell_price, stock_quantity, category } = params;
        const autoBarcode = `AL${Date.now().toString().slice(-6)}${Math.floor(100 + Math.random() * 900)}`;
        await inventoryRepo.create({
          name: name.trim(),
          category: category || 'عطور',
          cost: parseFloat(cost_price) || 0,
          price: parseFloat(sell_price) || (parseFloat(cost_price) * 1.4),
          qty: parseFloat(stock_quantity) || 0,
          unit: 'قطعة',
          barcode: autoBarcode,
          min_qty: 5
        });
        return { success: true, message: `تمت إضافة المنتج "${name}" بنجاح في المخزون بالباركود ${autoBarcode} وسعر ${sell_price} د.ل` };
      }

      if (toolName === 'check_low_stock') {
        const items = await inventoryRepo.getLowStock(10);
        if (items.length === 0) {
          return { success: true, message: 'جميع المنتجات متوفرة بكميات كافية (لا توجد نواقص أقل من 10 قطع)' };
        }
        const summary = items.slice(0, 10).map((p) => `• ${p.name}: المتبقي ${p.qty} ${p.unit} (الحد الأدنى: ${p.min_qty})`).join('\n');
        return { success: true, message: `تنبيه: يوجد ${items.length} منتج منخفض في المخزون:\n${summary}` };
      }

      if (toolName === 'query_sales_summary') {
        const fromDate = params.from_date || new Date().toISOString().split('T')[0];
        const toDate = params.to_date || new Date().toISOString().split('T')[0];
        const summary = await salesRepo.getSalesSummary(
          new Date(fromDate).toISOString(),
          new Date(toDate + 'T23:59:59').toISOString()
        );
        return {
          success: true,
          message: `تقرير المبيعات من ${fromDate} إلى ${toDate}:\n• عدد الفواتير: ${summary?.total_sales || 0}\n• إجمالي الإيرادات: ${formatCurrency(summary?.total_revenue || 0)}\n• إجمالي الأرباح: ${formatCurrency(summary?.total_profit || 0)}`
        };
      }

      if (toolName === 'record_debt_payment') {
        const { customer_name, amount } = params;
        const debtors = await debtorsRepo.findAll({ name: customer_name.trim() });
        if (debtors.length === 0) {
          return { success: false, message: `لم يتم العثور على عميل باسم "${customer_name}" في سجل الديون` };
        }
        const debtor = debtors[0];
        await debtorsRepo.addDebtTransaction(debtor.id, {
          debtor_id: debtor.id,
          type: 'payment',
          amount: parseFloat(amount),
          date: new Date().toISOString(),
          notes: 'تسديد دفعة عبر المساعد الذكي'
        });
        return { success: true, message: `تم تسجيل سداد مبلغ ${formatCurrency(amount)} للعميل "${customer_name}". الرصيد المتبقي: ${formatCurrency(debtor.total_debt - parseFloat(amount))}` };
      }

      return { success: false, message: 'أمر غير معروف' };
    } catch (err) {
      return { success: false, message: `خطأ أثناء تنفيذ العملية: ${err.message}` };
    }
  };

  // Send Message & Process Response
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const userText = inputMessage.trim();
    if (!userText || loading) return;

    const newMsg = { id: generateId(), role: 'user', text: userText };
    setMessages((prev) => [...prev, newMsg]);
    setInputMessage('');
    setLoading(true);

    const requiresKey = AI_PROVIDERS.find((p) => p.id === selectedProvider)?.requiresKey ?? true;

    // Fallback if no API key provided for providers that require one: Smart local rule-based assistance
    if (requiresKey && !apiKey.trim()) {
      setTimeout(async () => {
        let localReply = '';
        const lower = userText.toLowerCase();

        if (lower.includes('نواقص') || lower.includes('مخزون') || lower.includes('ناقص')) {
          const res = await executeAITool('check_low_stock', {});
          localReply = `🔍 ${res.message}`;
        } else if (lower.includes('مبيعات اليوم') || lower.includes('ارباح اليوم') || lower.includes('تقرير اليوم')) {
          const today = new Date().toISOString().split('T')[0];
          const res = await executeAITool('query_sales_summary', { from_date: today, to_date: today });
          localReply = `📊 ${res.message}`;
        } else if (lower.includes('كيف') || lower.includes('طريقة') || lower.includes('شرح')) {
          localReply = `💡 دليل منظومة الدفة:\nيمكنك التنقل بين الشاشات عبر القبة العلوية المقوسة. تدعم المنظومة تسجيل المبيعات (F3)، إضافة المشتريات وتوليد الباركود، خلطات العطور في المختبر، وجرد المخزون.\n\nلتفعيل الذكاء الاصطناعي التوليدي الكامل، يرجى إدخال مفتاح API في زر ⚙️ إعدادات المحرك بالأعلى.`;
        } else {
          localReply = `أهلاً بك! أنا أعمل في الوضع المحلي التلقائي. للإجابة الذكية وتنفيذ الأوامر، تفضل بضبط مفتاح API في إعدادات المحرك ⚙️ بالأعلى. يدعم النظام OpenRouter، DeepSeek، Gemini، Groq، وOllama المحلي.`;
        }

        setMessages((prev) => [
          ...prev,
          { id: generateId(), role: 'assistant', text: localReply }
        ]);
        setLoading(false);
      }, 400);
      return;
    }

    try {
      const endpoint = normalizeApiEndpoint(apiUrl);
      const historyPayload = messages.slice(-8).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.text
      }));

      const toolsDefinition = `
You have access to the following operational tools to execute actions on the ERP database:
1. add_product(name, cost_price, sell_price, stock_quantity, category)
2. check_low_stock()
3. query_sales_summary(from_date, to_date)
4. record_debt_payment(customer_name, amount)

If the user wants you to execute one of these tools, respond with a JSON action tag in this exact format:
:::ACTION:{"tool":"tool_name","params":{}}:::
Followed by a friendly Arabic explanation. Otherwise, reply directly with helpful Arabic advice based on the system manual.
`;

      const headers = {
        'Content-Type': 'application/json'
      };

      if (apiKey && apiKey.trim()) {
        headers['Authorization'] = `Bearer ${apiKey.trim()}`;
      }

      if (endpoint.includes('openrouter.ai')) {
        headers['HTTP-Referer'] = 'https://aldaffa-erp.local';
        headers['X-Title'] = 'Aldaffa Perfumes ERP';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: modelName.trim() || 'openrouter/auto',
          messages: [
            { role: 'system', content: `${SYSTEM_KNOWLEDGE_MANUAL}\n${toolsDefinition}` },
            ...historyPayload,
            { role: 'user', content: userText }
          ],
          temperature: 0.4
        })
      });

      if (!response.ok) {
        let errMsg = '';
        try {
          const errJson = await response.json();
          errMsg = errJson?.error?.message || JSON.stringify(errJson);
        } catch (e) {
          errMsg = `خطأ في خادم المزود (${response.status}: ${response.statusText})`;
        }
        throw new Error(errMsg);
      }

      const data = await response.json();
      const aiReply =
        data?.choices?.[0]?.message?.content ||
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        data?.content?.[0]?.text ||
        'عذراً، لم أتمكن من الحصول على إجابة. يرجى مراجعة إعدادات المفتاح والنموذج.';

      // Check for action tool invocation
      const actionMatch = aiReply.match(/:::ACTION:(\{[\s\S]*?\})\:::/);
      if (actionMatch) {
        try {
          const actionData = JSON.parse(actionMatch[1]);
          const cleanText = aiReply.replace(/:::ACTION:[\s\S]*?\:::/, '').trim();
          const toolResult = await executeAITool(actionData.tool, actionData.params || {});

          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: 'assistant',
              text: cleanText ? `${cleanText}\n\n⚡ **نتيجة العملية:**\n${toolResult.message}` : toolResult.message,
              toolAction: actionData.tool
            }
          ]);
          setLoading(false);
          return;
        } catch (actionErr) {
          console.warn('Action parsing error:', actionErr);
        }
      }

      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: 'assistant', text: aiReply }
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: generateId(), role: 'assistant', text: `⚠️ تعذر الاتصال بمحرك الذكاء الاصطناعي: ${err.message}\n\nتأكد من صحة الرابط ومفتاح الـ API في الإعدادات ⚙️` }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-3.5">
      {/* Top Header */}
      <div className="atelier-card p-3.5 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold shadow-sm">
            <Sparkles className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-[#2D2424] dark:text-white">المستشار الذكي (Universal AI Co-Pilot)</h1>
            <p className="text-[11px] text-[#5C524F] dark:text-slate-400">
              متوافق مع جميع المزودين: OpenRouter, DeepSeek, Gemini, OpenAI, Groq, Ollama
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`btn-atelier-secondary py-1.5 px-3.5 text-xs flex items-center gap-1.5 font-bold cursor-pointer transition-all ${
              showConfig ? 'bg-amber-500 text-slate-950 shadow-sm' : ''
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>⚙️ إعدادات المحرك ومزودي الـ AI</span>
          </button>
        </div>
      </div>

      {/* Universal Configuration Drawer */}
      {showConfig && (
        <div className="atelier-card p-4 border border-amber-500/30 bg-amber-50/60 dark:bg-slate-800/90 rounded-2xl space-y-3 text-xs animate-in fade-in duration-200 shadow-lg">
          <div className="flex justify-between items-center border-b border-amber-500/20 pb-2">
            <div className="flex items-center gap-2 font-bold text-[#2D2424] dark:text-amber-300">
              <Globe className="w-4 h-4 text-amber-500" />
              <span>تخصيص مزود الذكاء الاصطناعي (AI Provider Settings)</span>
            </div>
            <span className="text-[10px] text-gray-500">اختر المزود المناسب أو أدخل أي رابط مخصص</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Provider Selector */}
            <div className="md:col-span-3">
              <label className="block font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                اختر مزود الذكاء الاصطناعي:
              </label>
              <select
                value={selectedProvider}
                onChange={(e) => handleProviderSelect(e.target.value)}
                className="input-atelier w-full text-xs font-bold"
              >
                {AI_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                💡 {AI_PROVIDERS.find((p) => p.id === selectedProvider)?.hint}
              </div>
            </div>

            {/* Base URL */}
            <div>
              <label className="block font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                رابط نقطة الاتصال (API Endpoint URL):
              </label>
              <div className="relative">
                <Server className="w-3.5 h-3.5 text-gray-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="input-atelier w-full ps-8 text-xs font-mono"
                  dir="ltr"
                  placeholder="https://openrouter.ai/api/v1/chat/completions"
                />
              </div>
            </div>

            {/* Model Name */}
            <div>
              <label className="block font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                اسم النموذج (Model Name):
              </label>
              <div className="relative">
                <Cpu className="w-3.5 h-3.5 text-gray-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="input-atelier w-full ps-8 text-xs font-mono"
                  dir="ltr"
                  placeholder="openrouter/auto أو deepseek-chat"
                />
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="block font-bold text-[#5C524F] dark:text-slate-300 mb-1">
                مفتاح الـ API (API Key):
              </label>
              <div className="relative">
                <Key className="w-3.5 h-3.5 text-gray-400 absolute start-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showKeyPassword ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="input-atelier w-full ps-8 pe-8 text-xs font-mono"
                  dir="ltr"
                  placeholder={
                    selectedProvider === 'ollama' || selectedProvider === 'lmstudio'
                      ? '(غير مطلوب للمحركات المحلية)'
                      : 'sk-or-v1-...'
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowKeyPassword(!showKeyPassword)}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showKeyPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-amber-500/15">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="btn-atelier-secondary py-1.5 px-3.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-500 ${testingConnection ? 'animate-spin' : ''}`} />
              <span>{testingConnection ? 'جاري الفحص...' : '⚡ اختبار الاتصال بالمحرك'}</span>
            </button>

            <button
              type="button"
              onClick={saveSettings}
              className="btn-atelier-primary py-1.5 px-6 text-xs font-bold cursor-pointer shadow-md"
            >
              ✅ حفظ الإعدادات
            </button>
          </div>
        </div>
      )}

      {/* Main Chat Interface */}
      <div className="atelier-card flex-1 p-4 flex flex-col justify-between overflow-hidden">
        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3.5 pr-1 pl-1">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-amber-600 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-[80%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-none shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-[#2D2424] dark:text-slate-200 rounded-tl-none border border-amber-500/15 shadow-sm whitespace-pre-wrap'
                }`}
              >
                {msg.text}
                {msg.toolAction && (
                  <div className="mt-2 pt-2 border-t border-amber-500/20 text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>تم تنفيذ العملية في قاعدة البيانات: {msg.toolAction}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-400 animate-pulse">
              <Bot className="w-4 h-4 text-emerald-600" />
              <span>جاري التحليل والاستجابة الذكية...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Action Chips */}
        <div className="py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-[11px]">
          <span className="text-gray-400 shrink-0 font-bold">أمثلة سريعة:</span>
          <button
            onClick={() => setInputMessage('ما هي المنتجات منخفضة المخزون حالياً؟')}
            className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-slate-800 hover:bg-amber-500/10 text-gray-700 dark:text-slate-300 transition-colors shrink-0 cursor-pointer"
          >
            🔍 فحص النواقص
          </button>
          <button
            onClick={() => setInputMessage('أعطني ملخص مبيعات اليوم')}
            className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-slate-800 hover:bg-amber-500/10 text-gray-700 dark:text-slate-300 transition-colors shrink-0 cursor-pointer"
          >
            📊 مبيعات اليوم
          </button>
          <button
            onClick={() => setInputMessage('كيف أقوم بإجراء جرد للمخزون وتسوية الفوارق؟')}
            className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-slate-800 hover:bg-amber-500/10 text-gray-700 dark:text-slate-300 transition-colors shrink-0 cursor-pointer"
          >
            📖 طريقة الجرد
          </button>
          <button
            onClick={() => setInputMessage('أضف منتج جديد باسم عطر ميراندا الملكي بسعر تكلفة 45 وسعر بيع 75 وكمية 20')}
            className="px-2.5 py-1 rounded-full bg-gray-100 dark:bg-slate-800 hover:bg-amber-500/10 text-gray-700 dark:text-slate-300 transition-colors shrink-0 cursor-pointer"
          >
            ➕ إضافة منتج آلياً
          </button>
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="flex gap-2 pt-2 border-t border-amber-500/15">
          <input
            type="text"
            placeholder="اكتب سؤالك أو اطلب عملية من المستشار الذكي..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={loading}
            className="input-atelier flex-1 text-xs"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || loading}
            className="btn-atelier-primary px-5 py-2 text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <Send className="w-3.5 h-3.5" />
            <span>إرسال</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default AIAdvisorModule;
