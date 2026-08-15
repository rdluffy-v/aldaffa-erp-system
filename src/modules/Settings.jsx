import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Printer,
  FileText,
  Type,
  Database,
  Sparkles,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Save,
  RotateCcw,
  HardDrive,
  Sliders,
  ShieldCheck,
  Smartphone,
  Tag,
  Key,
  FolderArchive,
  ArrowRight,
  Info,
  Check
} from 'lucide-react';

import { SettingsRepository } from '../database/repositories/SettingsRepository.js';
import { useLabelsStore, DEFAULT_MODULE_LABELS } from '../stores/useLabelsStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate } from '../utils/helpers.js';
import Modal from '../components/ui/Modal.jsx';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';

const settingsRepo = new SettingsRepository();

// Default print configuration
const DEFAULT_PRINT_SETTINGS = {
  printMode: 'thermal', // 'thermal' | 'a4'
  storeName: 'الدفة للعطور',
  storeSubtitle: 'Aldaffa Perfumes - لأرقى العطور والخلطات',
  storePhone: '0123456789',
  storeAddress: 'ليبيا - مصراتة',
  receiptGreeting: 'شكراً لتسوقكم معنا .. نسعد بخدمتكم دائماً',
  receiptPolicy: 'سياسة الاستبدال والاسترجاع: خلال 30 ساعة مع الفاتورة الأصلية. المنتجات المفتوحة لا تسترجع.',
  showLogo: true,
  showBarcode: true,
  showCashier: true,
  showPhone: true,
  logoBase64: ''
};

const SettingsModule = () => {
  const { showSuccess, showError, showWarning, showInfo } = useUIStore();
  const { labels: customLabels, setLabel, setAllLabels, resetLabels } = useLabelsStore();

  const [activeTab, setActiveTab] = useState('print'); // 'print' | 'labels' | 'archive' | 'ai_updates'
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ----------------------------------------------------
  // SECTION 1: Print & Template Settings State
  // ----------------------------------------------------
  const [printSettings, setPrintSettings] = useState(DEFAULT_PRINT_SETTINGS);
  const fileInputRef = useRef(null);

  // ----------------------------------------------------
  // SECTION 2: Label Customizer State
  // ----------------------------------------------------
  const [editableLabels, setEditableLabels] = useState({ ...customLabels });

  // ----------------------------------------------------
  // SECTION 3: Archiving & Maintenance State
  // ----------------------------------------------------
  const [cutoffYear, setCutoffYear] = useState('2024');
  const [customCutoffDate, setCustomCutoffDate] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [shrinking, setShrinking] = useState(false);
  const [purgingCache, setPurgingCache] = useState(false);
  const [archivesList, setArchivesList] = useState([]);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [archiveViewerOpen, setArchiveViewerOpen] = useState(false);
  const [confirmShrinkOpen, setConfirmShrinkOpen] = useState(false);

  // ----------------------------------------------------
  // SECTION 4: AI & Auto-Updater State
  // ----------------------------------------------------
  const [aiProvider, setAiProvider] = useState('gemini');
  const [aiModel, setAiModel] = useState('gemini-2.0-flash');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);

  // Updater
  const [appVersion, setAppVersion] = useState('2.2.1');
  const [ghToken, setGhToken] = useState('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');
  const [showGhToken, setShowGhToken] = useState(false);
  const [updateStatus, setUpdateStatus] = useState({ status: 'idle', message: '' });
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);

  // Safe IPC invoke helper
  const invokeIpc = useCallback(async (channel, payload) => {
    try {
      if (typeof window !== 'undefined' && window.require) {
        const { ipcRenderer } = window.require('electron');
        return await ipcRenderer.invoke(channel, payload);
      }
      return { success: false, error: 'Electron IPC not available in this environment' };
    } catch (e) {
      console.error(`IPC error on ${channel}:`, e);
      return { success: false, error: e.message };
    }
  }, []);

  // ----------------------------------------------------
  // Load All Persisted Settings
  // ----------------------------------------------------
  const loadAllSettings = useCallback(async () => {
    setLoading(true);
    try {
      const allRows = await settingsRepo.getAllSettings();
      const settingsMap = {};
      allRows.forEach((r) => {
        settingsMap[r.key] = r.value;
      });

      // Load Print Settings
      setPrintSettings({
        printMode: settingsMap['print_mode'] || DEFAULT_PRINT_SETTINGS.printMode,
        storeName: settingsMap['store_name'] || DEFAULT_PRINT_SETTINGS.storeName,
        storeSubtitle: settingsMap['store_subtitle'] || DEFAULT_PRINT_SETTINGS.storeSubtitle,
        storePhone: settingsMap['store_phone'] || DEFAULT_PRINT_SETTINGS.storePhone,
        storeAddress: settingsMap['store_address'] || DEFAULT_PRINT_SETTINGS.storeAddress,
        receiptGreeting: settingsMap['receipt_greeting'] || DEFAULT_PRINT_SETTINGS.receiptGreeting,
        receiptPolicy: settingsMap['receipt_policy'] || DEFAULT_PRINT_SETTINGS.receiptPolicy,
        showLogo: settingsMap['show_logo'] !== undefined ? settingsMap['show_logo'] === 'true' : DEFAULT_PRINT_SETTINGS.showLogo,
        showBarcode: settingsMap['show_barcode'] !== undefined ? settingsMap['show_barcode'] === 'true' : DEFAULT_PRINT_SETTINGS.showBarcode,
        showCashier: settingsMap['show_cashier'] !== undefined ? settingsMap['show_cashier'] === 'true' : DEFAULT_PRINT_SETTINGS.showCashier,
        showPhone: settingsMap['show_phone'] !== undefined ? settingsMap['show_phone'] === 'true' : DEFAULT_PRINT_SETTINGS.showPhone,
        logoBase64: settingsMap['logo_base64'] || ''
      });

      // Load AI Settings
      if (settingsMap['gemini_api_key']) setGeminiApiKey(settingsMap['gemini_api_key']);
      if (settingsMap['openai_api_key']) setOpenaiApiKey(settingsMap['openai_api_key']);
      if (settingsMap['ai_provider']) setAiProvider(settingsMap['ai_provider']);
      if (settingsMap['ai_model']) setAiModel(settingsMap['ai_model']);

      // Load Updater Settings
      if (settingsMap['github_token']) setGhToken(settingsMap['github_token']);

      // Load Version
      const verRes = await invokeIpc('updater:get-version');
      if (verRes?.success && verRes.version) {
        setAppVersion(verRes.version);
      }

      // Load Archives List
      loadArchives();
    } catch (error) {
      showError('خطأ أثناء تحميل الإعدادات: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [showError, invokeIpc]);

  useEffect(() => {
    loadAllSettings();
    setEditableLabels({ ...customLabels });
  }, [loadAllSettings, customLabels]);

  // Setup updater event listeners
  useEffect(() => {
    if (typeof window !== 'undefined' && window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        const handleStatus = (event, data) => {
          setUpdateStatus(data);
          if (data.status === 'available') {
            showInfo('يوجد تحديث جديد متاح للتحميل!');
          } else if (data.status === 'downloaded') {
            showSuccess('تم تحميل التحديث بنجاح. جاهز للتثبيت.');
          } else if (data.status === 'not-available') {
            showSuccess('المنظومة محدثة إلى آخر إصدار.');
          } else if (data.status === 'error') {
            showError('خطأ في التحديث: ' + data.error);
          }
        };

        const handleProgress = (event, progress) => {
          setDownloadProgress(progress);
        };

        ipcRenderer.on('update-status', handleStatus);
        ipcRenderer.on('update-download-progress', handleProgress);

        return () => {
          ipcRenderer.removeListener('update-status', handleStatus);
          ipcRenderer.removeListener('update-download-progress', handleProgress);
        };
      } catch (e) {
        console.warn('IPC listener error:', e);
      }
    }
  }, [showInfo, showSuccess, showError]);

  // ----------------------------------------------------
  // PRINT HANDLERS
  // ----------------------------------------------------
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showWarning('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 2 ميجابايت');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPrintSettings((prev) => ({ ...prev, logoBase64: reader.result }));
      showSuccess('تم تحميل الشعار بنجاح');
    };
    reader.readAsDataURL(file);
  };

  const handleSavePrintSettings = async () => {
    setSaving(true);
    try {
      await Promise.all([
        settingsRepo.setSetting('print_mode', printSettings.printMode),
        settingsRepo.setSetting('store_name', printSettings.storeName),
        settingsRepo.setSetting('store_subtitle', printSettings.storeSubtitle),
        settingsRepo.setSetting('store_phone', printSettings.storePhone),
        settingsRepo.setSetting('store_address', printSettings.storeAddress),
        settingsRepo.setSetting('receipt_greeting', printSettings.receiptGreeting),
        settingsRepo.setSetting('receipt_policy', printSettings.receiptPolicy),
        settingsRepo.setSetting('show_logo', String(printSettings.showLogo)),
        settingsRepo.setSetting('show_barcode', String(printSettings.showBarcode)),
        settingsRepo.setSetting('show_cashier', String(printSettings.showCashier)),
        settingsRepo.setSetting('show_phone', String(printSettings.showPhone)),
        settingsRepo.setSetting('logo_base64', printSettings.logoBase64 || '')
      ]);
      showSuccess('تم حفظ إعدادات وقوالب الطباعة بنجاح');
    } catch (error) {
      showError('فشل حفظ إعدادات الطباعة: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestThermalPrint = async () => {
    try {
      showInfo('جاري إرسال الفاتورة التجريبية إلى الطابعة الحرارية...');
      const res = await invokeIpc('print:test-thermal', {
        title: printSettings.storeName,
        subtitle: printSettings.storeSubtitle,
        phone: printSettings.storePhone,
        address: printSettings.storeAddress,
        greeting: printSettings.receiptGreeting,
        policy: printSettings.receiptPolicy,
        showLogo: printSettings.showLogo,
        showBarcode: printSettings.showBarcode,
        showCashier: printSettings.showCashier,
        showPhone: printSettings.showPhone,
        logoBase64: printSettings.logoBase64
      });
      if (res?.success) {
        showSuccess('تمت المعالجة بنجاح');
      } else {
        showError('فشل في الطباعة: ' + (res?.error || 'خطأ غير معروف'));
      }
    } catch (error) {
      showError('خطأ أثناء الطباعة التجريبية: ' + error.message);
    }
  };

  const handleTestPdfExport = async () => {
    try {
      showInfo('جاري تصدير ومعاينة مستند A4 التجريبي...');
      const res = await invokeIpc('print:test-pdf', {
        title: printSettings.storeName,
        subtitle: printSettings.storeSubtitle,
        phone: printSettings.storePhone,
        address: printSettings.storeAddress,
        greeting: printSettings.receiptGreeting,
        policy: printSettings.receiptPolicy,
        showLogo: printSettings.showLogo,
        logoBase64: printSettings.logoBase64
      });
      if (res?.success) {
        showSuccess('تم تصدير المستند التجريبي بنجاح');
      } else {
        showError('فشل في التصدير: ' + (res?.error || 'خطأ غير معروف'));
      }
    } catch (error) {
      showError('خطأ أثناء تصدير مستند A4: ' + error.message);
    }
  };

  // ----------------------------------------------------
  // LABEL HANDLERS
  // ----------------------------------------------------
  const handleSaveLabels = async () => {
    setSaving(true);
    try {
      setAllLabels(editableLabels);
      await settingsRepo.setSetting('custom_labels', JSON.stringify(editableLabels));
      showSuccess('تم تطبيق وحفظ مسميات التبويبات بنجاح');
    } catch (error) {
      showError('فشل حفظ المسميات: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetLabels = async () => {
    resetLabels();
    setEditableLabels({ ...DEFAULT_MODULE_LABELS });
    await settingsRepo.deleteSetting('custom_labels');
    showSuccess('تمت استعادة المسميات الافتراضية');
  };

  // ----------------------------------------------------
  // ARCHIVING & MAINTENANCE HANDLERS
  // ----------------------------------------------------
  const loadArchives = async () => {
    const res = await invokeIpc('archive:list');
    if (res?.success && res.archives) {
      setArchivesList(res.archives);
    }
  };

  const handleExportArchive = async () => {
    setArchiving(true);
    try {
      const res = await invokeIpc('archive:export', {
        cutoffYear,
        cutoffDate: customCutoffDate || undefined
      });
      if (res?.success) {
        showSuccess(`تم ترحيل البيانات بنجاح إلى الملف:\n${res.file}`);
        loadArchives();
      } else {
        showError('فشل ترحيل البيانات: ' + (res?.error || 'خطأ غير معروف'));
      }
    } catch (error) {
      showError('خطأ أثناء الترحيل: ' + error.message);
    } finally {
      setArchiving(false);
    }
  };

  const handleShrinkDatabase = async () => {
    setShrinking(true);
    setConfirmShrinkOpen(false);
    try {
      const res = await invokeIpc('archive:shrink', {
        cutoffYear,
        cutoffDate: customCutoffDate || undefined
      });
      if (res?.success) {
        showSuccess(`تم تنظيف وحذف السجلات وتفريغ مساحة القرص بنجاح (VACUUM & Optimize).`);
      } else {
        showError('فشل تنظيف قاعدة البيانات: ' + (res?.error || 'خطأ غير معروف'));
      }
    } catch (error) {
      showError('خطأ أثناء التفريغ: ' + error.message);
    } finally {
      setShrinking(false);
    }
  };

  const handlePurgeCache = async () => {
    setPurgingCache(true);
    try {
      const res = await invokeIpc('system:purge-cache');
      if (res?.success) {
        showSuccess('تم مسح ملفات الكاش المؤقتة بأمان مع حماية قاعدة البيانات.');
      } else {
        showError('فشل مسح الكاش: ' + (res?.error || ''));
      }
    } catch (error) {
      showError('خطأ أثناء مسح الكاش: ' + error.message);
    } finally {
      setPurgingCache(false);
    }
  };

  const handleViewArchive = async (archive) => {
    try {
      const res = await invokeIpc('archive:view', { archiveFile: archive.filePath });
      if (res?.success && res.data) {
        setSelectedArchive(res.data);
        setArchiveViewerOpen(true);
      } else {
        showError('تعذر قراءة ملف الأرشيف: ' + (res?.error || ''));
      }
    } catch (error) {
      showError('خطأ أثناء استعراض الأرشيف: ' + error.message);
    }
  };

  // ----------------------------------------------------
  // AI & UPDATER HANDLERS
  // ----------------------------------------------------
  const handleSaveAiSettings = async () => {
    setSaving(true);
    try {
      await Promise.all([
        settingsRepo.setSetting('ai_provider', aiProvider),
        settingsRepo.setSetting('ai_model', aiModel),
        settingsRepo.setSetting('gemini_api_key', geminiApiKey),
        settingsRepo.setSetting('openai_api_key', openaiApiKey)
      ]);
      showSuccess('تم حفظ إعدادات الذكاء الاصطناعي بنجاح');
    } catch (error) {
      showError('فشل حفظ إعدادات AI: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUpdaterToken = async () => {
    try {
      await settingsRepo.setSetting('github_token', ghToken);
      await invokeIpc('updater:set-token', { token: ghToken });
      showSuccess('تم حفظ رمز الوصول للـ GitHub بنجاح');
    } catch (error) {
      showError('خطأ في حفظ الرمز: ' + error.message);
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    try {
      showInfo('جاري الاتصال بمستودع GitHub للتحقق من التحديثات...');
      const res = await invokeIpc('updater:check', { token: ghToken });
      if (res?.success) {
        // Status handled by update-status event
      } else {
        showError('فشل التحقق من التحديثات: ' + (res?.error || ''));
      }
    } catch (error) {
      showError('خطأ في الاتصال: ' + error.message);
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setDownloadingUpdate(true);
    try {
      showInfo('جاري بدء تحميل التحديث...');
      const res = await invokeIpc('updater:download');
      if (!res?.success) {
        showError('فشل بدء التحميل: ' + (res?.error || ''));
        setDownloadingUpdate(false);
      }
    } catch (error) {
      showError('خطأ أثناء التحميل: ' + error.message);
      setDownloadingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    try {
      await invokeIpc('updater:install');
    } catch (error) {
      showError('خطأ أثناء التثبيت: ' + error.message);
    }
  };

  // Tab configurations
  const TABS = [
    { id: 'print', label: 'استوديو وقوالب الطباعة', icon: Printer },
    { id: 'labels', label: 'التعديل الحر للمسميات', icon: Type },
    { id: 'archive', label: 'الترحيل وصيانة المنظومة', icon: Database },
    { id: 'ai_updates', label: 'المستشار الذكي والتحديثات', icon: Sparkles }
  ];

  return (
    <div className="h-full flex flex-col gap-5 overflow-hidden">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] flex items-center gap-2.5">
            <Sliders className="w-7 h-7 text-[#fbbf24]" />
            لوحة الإعدادات وتخصيص المنظومة
          </h1>
          <p className="text-xs text-[#768390] mt-1">
            إدارة الطباعة الحرارية والمستندات، تخصيص واجهة المستخدم، ترحيل البيانات، ومزامنة التحديثات
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#161b22] border border-white/10 rounded-xl">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-gradient-to-l from-[#fbbf24] to-[#f59e0b] text-[#0d1117] shadow-[0_0_12px_rgba(251,191,36,0.35)]'
                    : 'text-[#adbac7] hover:text-[#e6edf3] hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
        <AnimatePresence mode="wait">
          {/* ========================================================================= */}
          {/* TAB 1: PRINT & TEMPLATE STUDIO */}
          {/* ========================================================================= */}
          {activeTab === 'print' && (
            <motion.div
              key="print-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6"
            >
              {/* Form Controls (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-5">
                {/* Mode Selector */}
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#fbbf24] flex items-center gap-2 mb-3">
                    <Printer className="w-4 h-4" />
                    نمط الطباعة الافتراضي
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPrintSettings((p) => ({ ...p, printMode: 'thermal' }))}
                      className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                        printSettings.printMode === 'thermal'
                          ? 'border-[#fbbf24] bg-[#fbbf24]/10 text-[#fbbf24]'
                          : 'border-white/10 bg-[#161b22] text-[#adbac7] hover:border-white/20'
                      }`}
                    >
                      <Printer className="w-5 h-5" />
                      <div className="text-right">
                        <div className="text-xs font-bold">طابعة حرارية (80mm)</div>
                        <div className="text-[10px] text-[#768390]">فواتير الكاشير السريعة ونقاط البيع</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPrintSettings((p) => ({ ...p, printMode: 'a4' }))}
                      className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                        printSettings.printMode === 'a4'
                          ? 'border-[#fbbf24] bg-[#fbbf24]/10 text-[#fbbf24]'
                          : 'border-white/10 bg-[#161b22] text-[#adbac7] hover:border-white/20'
                      }`}
                    >
                      <FileText className="w-5 h-5" />
                      <div className="text-right">
                        <div className="text-xs font-bold">مستند A4 وتصدير PDF</div>
                        <div className="text-[10px] text-[#768390]">أوامر الشراء وتقارير الورديات الرسمية</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Header & Contact Information */}
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#e6edf3] mb-4">بيانات الترويسة والتواصل</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">اسم المتجر / الشركة</label>
                      <input
                        type="text"
                        value={printSettings.storeName}
                        onChange={(e) => setPrintSettings({ ...printSettings, storeName: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">العنوان الفرعي / الوصف</label>
                      <input
                        type="text"
                        value={printSettings.storeSubtitle}
                        onChange={(e) => setPrintSettings({ ...printSettings, storeSubtitle: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">رقم الهاتف والتواصل</label>
                      <input
                        type="text"
                        value={printSettings.storePhone}
                        onChange={(e) => setPrintSettings({ ...printSettings, storePhone: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">العنوان والموقع</label>
                      <input
                        type="text"
                        value={printSettings.storeAddress}
                        onChange={(e) => setPrintSettings({ ...printSettings, storeAddress: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer & Policies */}
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#e6edf3] mb-4">التذييل والسياسات</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">عبارة الترحيب والشكر</label>
                      <input
                        type="text"
                        value={printSettings.receiptGreeting}
                        onChange={(e) => setPrintSettings({ ...printSettings, receiptGreeting: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">سياسة الاستبدال والاسترجاع</label>
                      <textarea
                        rows={2}
                        value={printSettings.receiptPolicy}
                        onChange={(e) => setPrintSettings({ ...printSettings, receiptPolicy: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Visibility Toggles & Logo */}
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#e6edf3] mb-4">الشعار وخيارات العرض</h2>
                  
                  {/* Logo Selector (Dual: File + URL) */}
                  <div className="mb-5 space-y-3 bg-[#161b22] border border-white/5 p-3.5 rounded-xl">
                    <label className="block text-xs font-bold text-[#adbac7]">شعار المتجر (ملف محلي أو رابط مباشر):</label>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-secondary text-xs flex items-center gap-2"
                      >
                        <ImageIcon className="w-4 h-4 text-[#fbbf24]" />
                        اختيار ملف من الجهاز
                      </button>
                      <input
                        type="text"
                        placeholder="أو ضع رابط الشعار (https://...)"
                        value={printSettings.logoBase64?.startsWith('data:') ? '' : printSettings.logoBase64}
                        onChange={(e) => setPrintSettings((p) => ({ ...p, logoBase64: e.target.value }))}
                        className="flex-1 min-w-[200px] bg-[#0d1117] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                        dir="ltr"
                      />
                      {printSettings.logoBase64 && (
                        <button
                          type="button"
                          onClick={() => setPrintSettings((p) => ({ ...p, logoBase64: '' }))}
                          className="text-xs text-[#ef4444] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          حذف الشعار
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Switches */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { key: 'showLogo', label: 'إظهار الشعار' },
                      { key: 'showBarcode', label: 'إظهار الباركود' },
                      { key: 'showCashier', label: 'اسم الكاشير' },
                      { key: 'showPhone', label: 'هاتف المتجر' }
                    ].map((item) => (
                      <label
                        key={item.key}
                        className="flex items-center gap-2.5 p-2.5 bg-[#161b22] border border-white/5 rounded-lg cursor-pointer hover:border-white/15 transition-all"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(printSettings[item.key])}
                          onChange={(e) => setPrintSettings({ ...printSettings, [item.key]: e.target.checked })}
                          className="w-4 h-4 rounded text-[#fbbf24] focus:ring-0 accent-[#fbbf24]"
                        />
                        <span className="text-xs font-semibold text-[#adbac7]">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Save & Action Bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSavePrintSettings}
                    disabled={saving}
                    className="btn-primary text-xs flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'جاري الحفظ...' : 'حفظ إعدادات الطباعة'}
                  </button>

                  <button
                    type="button"
                    onClick={handleTestThermalPrint}
                    className="btn-secondary text-xs flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4 text-[#fbbf24]" />
                    طباعة تجريبية حرارية
                  </button>

                  <button
                    type="button"
                    onClick={handleTestPdfExport}
                    className="btn-secondary text-xs flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4 text-[#38bdf8]" />
                    تصدير تجريبي A4 PDF
                  </button>
                </div>
              </div>

              {/* Live Preview Card (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="glass-card p-5 sticky top-2">
                  <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2.5">
                    <h3 className="text-xs font-bold text-[#fbbf24] flex items-center gap-1.5">
                      <Eye className="w-4 h-4" />
                      معاينة حية للقالب ({printSettings.printMode === 'thermal' ? 'حراري 80mm' : 'مستند A4'})
                    </h3>
                    <span className="text-[10px] text-[#768390] bg-[#161b22] px-2 py-0.5 rounded border border-white/5">
                      تحديث فوري
                    </span>
                  </div>

                  {/* Simulated Receipt Container */}
                  <div className="bg-[#f9fafb] text-[#111827] rounded-xl p-4 shadow-xl font-mono text-[11px] leading-relaxed border border-gray-300 select-none max-h-[580px] overflow-y-auto custom-scrollbar">
                    {/* Logo area */}
                    {printSettings.showLogo && (
                      <div className="text-center mb-2">
                        {printSettings.logoBase64 ? (
                          <img
                            src={printSettings.logoBase64}
                            alt="Preview Logo"
                            className="max-h-12 mx-auto object-contain"
                          />
                        ) : (
                          <div className="inline-block bg-[#fbbf24] text-[#0d1117] font-bold px-3 py-1 rounded text-xs">
                            {printSettings.storeName}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="text-center font-bold text-sm text-black">{printSettings.storeName}</div>
                    {printSettings.storeSubtitle && (
                      <div className="text-center text-[9px] text-gray-600">{printSettings.storeSubtitle}</div>
                    )}
                    {printSettings.showPhone && printSettings.storePhone && (
                      <div className="text-center text-[10px] text-gray-700">📱 {printSettings.storePhone}</div>
                    )}
                    {printSettings.storeAddress && (
                      <div className="text-center text-[9px] text-gray-500">📍 {printSettings.storeAddress}</div>
                    )}

                    <div className="border-t border-dashed border-gray-400 my-2" />

                    <div className="flex justify-between text-[10px]">
                      <span>فاتورة: #INV-2026</span>
                      <span>{new Date().toLocaleDateString('ar-SD')}</span>
                    </div>
                    {printSettings.showCashier && (
                      <div className="flex justify-between text-[10px]">
                        <span>الكاشير:</span>
                        <span>المدير</span>
                      </div>
                    )}

                    <div className="border-t border-dashed border-gray-400 my-2" />

                    {/* Table items */}
                    <div className="space-y-1">
                      <div className="flex justify-between font-bold border-b border-gray-200 pb-1">
                        <span>الصنف</span>
                        <span>المجموع</span>
                      </div>
                      <div className="flex justify-between">
                        <span>عطر العود الملكي (50ml) x 1</span>
                        <span>15,000</span>
                      </div>
                      <div className="flex justify-between">
                        <span>زيت مسك الصندل (10ml) x 2</span>
                        <span>9,000</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-gray-400 my-2" />

                    <div className="space-y-0.5 text-[10px]">
                      <div className="flex justify-between">
                        <span>المجموع الفرعي:</span>
                        <span>24,000 ج.س</span>
                      </div>
                      <div className="flex justify-between text-red-600">
                        <span>الخصم (10%):</span>
                        <span>-2,400 ج.س</span>
                      </div>
                      <div className="flex justify-between font-bold text-xs pt-1 text-black">
                        <span>الإجمالي النهائي:</span>
                        <span>21,600 ج.س</span>
                      </div>
                    </div>

                    {printSettings.showBarcode && (
                      <div className="text-center my-3 text-[9px] tracking-widest bg-gray-100 py-1 rounded">
                        ||| | ||||| ||| |||| |||| ||
                        <div>*ALDAFFA-2026*</div>
                      </div>
                    )}

                    {printSettings.receiptPolicy && (
                      <div className="text-[8px] text-gray-500 text-center mt-2 leading-normal">
                        {printSettings.receiptPolicy}
                      </div>
                    )}

                    {printSettings.receiptGreeting && (
                      <div className="text-center font-bold text-[10px] text-gray-800 mt-2">
                        {printSettings.receiptGreeting}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: DYNAMIC LABEL CUSTOMIZER */}
          {/* ========================================================================= */}
          {activeTab === 'labels' && (
            <motion.div
              key="labels-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-5 pb-6"
            >
              <div className="glass-card p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-[#e6edf3] flex items-center gap-2">
                      <Type className="w-4 h-4 text-[#fbbf24]" />
                      وضع التعديل الحر للمسميات (Dynamic Navigation Labels)
                    </h2>
                    <p className="text-xs text-[#768390] mt-0.5">
                      يمكنك تعديل أسماء التبويبات والأقسام في الشريط العلوي لتناسب طبيعة عملك مع الحفظ التلقائي
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetLabels}
                      className="btn-secondary text-xs flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      استعادة الافتراضي
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveLabels}
                      disabled={saving}
                      className="btn-primary text-xs flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'جاري الحفظ...' : 'حفظ المسميات'}
                    </button>
                  </div>
                </div>

                {/* Grid of label editors */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {Object.entries(DEFAULT_MODULE_LABELS).map(([modId, defLabel]) => {
                    const currentVal = editableLabels[modId] ?? defLabel;
                    const isChanged = currentVal !== defLabel;

                    return (
                      <div
                        key={modId}
                        className={`p-3 bg-[#161b22] border rounded-xl flex items-center justify-between gap-3 transition-all ${
                          isChanged ? 'border-[#fbbf24]/50 bg-[#fbbf24]/5' : 'border-white/5'
                        }`}
                      >
                        <div className="shrink-0 text-right">
                          <span className="text-[11px] font-mono text-[#768390] block">{modId}</span>
                          <span className="text-xs font-bold text-[#adbac7]">{defLabel}</span>
                        </div>

                        <div className="flex-1">
                          <input
                            type="text"
                            value={currentVal}
                            onChange={(e) =>
                              setEditableLabels((prev) => ({
                                ...prev,
                                [modId]: e.target.value
                              }))
                            }
                            className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-[#e6edf3] font-bold focus:border-[#fbbf24] focus:outline-none text-left"
                            dir="rtl"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: DATA ARCHIVING & MAINTENANCE */}
          {/* ========================================================================= */}
          {activeTab === 'archive' && (
            <motion.div
              key="archive-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6"
            >
              {/* Archiving controls (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-5">
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#fbbf24] flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4" />
                    ترحيل البيانات القديمة (Data Archiving)
                  </h2>
                  <p className="text-xs text-[#768390] mb-4">
                    تصدير المبيعات والخسائر القديمة إلى ملف أرشيف آمن وتفريغ قاعدة البيانات لتسريع الأداء
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">
                        سنة الحد الفاصل (Cutoff Year)
                      </label>
                      <select
                        value={cutoffYear}
                        onChange={(e) => setCutoffYear(e.target.value)}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      >
                        <option value="2023">قبل 2023-01-01 (سجلات قديمة)</option>
                        <option value="2024">قبل 2024-01-01 (سجلات 2023 وما قبلها)</option>
                        <option value="2025">قبل 2025-01-01 (سجلات 2024 وما قبلها)</option>
                        <option value="2026">قبل 2026-01-01</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">
                        أو حدد تاريخاً فاصلاً مخصصاً
                      </label>
                      <input
                        type="date"
                        value={customCutoffDate}
                        onChange={(e) => setCustomCutoffDate(e.target.value)}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleExportArchive}
                      disabled={archiving}
                      className="btn-primary text-xs flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      {archiving ? 'جاري تصدير الأرشيف...' : '1. تصدير وترحيل الأرشيف (JSON)'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmShrinkOpen(true)}
                      disabled={shrinking}
                      className="btn-danger text-xs flex items-center gap-2 bg-[#ef4444]/20 border border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/30 px-4 py-2 rounded-lg font-bold"
                    >
                      <Trash2 className="w-4 h-4" />
                      {shrinking ? 'جاري التنظيف...' : '2. تفريغ وتنظيف المساحة (VACUUM)'}
                    </button>
                  </div>
                </div>

                {/* Cache purging and safe maintenance */}
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#e6edf3] flex items-center gap-2 mb-2">
                    <HardDrive className="w-4 h-4 text-[#38bdf8]" />
                    تنظيف الذاكرة المؤقتة (Safe Cache Cleaner)
                  </h2>
                  <p className="text-xs text-[#768390] mb-4">
                    مسح ملفات التخزين المؤقت لمتصفح Chromium (GPUCache, Code Cache) بأمان تام مع ضمان عدم المساس بقاعدة البيانات
                  </p>

                  <button
                    type="button"
                    onClick={handlePurgeCache}
                    disabled={purgingCache}
                    className="btn-secondary text-xs flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 text-[#38bdf8] ${purgingCache ? 'animate-spin' : ''}`} />
                    {purgingCache ? 'جاري تنظيف الكاش...' : 'تنظيف ملفات الكاش المؤقتة'}
                  </button>
                </div>
              </div>

              {/* Archives Browser (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="glass-card p-5">
                  <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2.5">
                    <h3 className="text-xs font-bold text-[#e6edf3] flex items-center gap-1.5">
                      <FolderArchive className="w-4 h-4 text-[#fbbf24]" />
                      سجلات الأرشيف التاريخية ({archivesList.length})
                    </h3>
                    <button
                      type="button"
                      onClick={loadArchives}
                      className="p-1 rounded text-[#768390] hover:text-[#e6edf3]"
                      title="تحديث القائمة"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {archivesList.length === 0 ? (
                    <div className="text-center py-8 text-xs text-[#768390]">
                      لا توجد ملفات أرشيف محفوظة بعد.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[460px] overflow-y-auto custom-scrollbar">
                      {archivesList.map((arch) => (
                        <div
                          key={arch.filename}
                          className="p-3 bg-[#161b22] border border-white/5 rounded-xl flex items-center justify-between gap-3 hover:border-white/15 transition-all"
                        >
                          <div className="overflow-hidden">
                            <div className="text-xs font-bold text-[#e6edf3] truncate" title={arch.filename}>
                              {arch.filename}
                            </div>
                            <div className="text-[10px] text-[#768390] mt-0.5">
                              {(arch.sizeBytes / 1024).toFixed(1)} KB &bull; {new Date(arch.createdAt).toLocaleDateString('ar-SD')}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleViewArchive(arch)}
                            className="btn-secondary text-[11px] px-2.5 py-1 flex items-center gap-1 shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#fbbf24]" />
                            استعراض
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: AI & AUTO-UPDATER */}
          {/* ========================================================================= */}
          {activeTab === 'ai_updates' && (
            <motion.div
              key="ai-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6"
            >
              {/* AI Advisor Configuration */}
              <div className="glass-card p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[#fbbf24] border-b border-white/10 pb-2.5">
                  <Sparkles className="w-4 h-4" />
                  إعدادات المستشار الذكي (AI Engine)
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#adbac7] mb-1.5">مزود الذكاء الاصطناعي</label>
                  <select
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value)}
                    className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                  >
                    <option value="gemini">Google Gemini (موصى به - فائق السرعة)</option>
                    <option value="openai">OpenAI (GPT-4o)</option>
                  </select>
                </div>

                {aiProvider === 'gemini' ? (
                  <div>
                    <label className="block text-xs font-bold text-[#adbac7] mb-1.5">Google Gemini API Key</label>
                    <div className="relative">
                      <input
                        type={showGeminiKey ? 'text' : 'password'}
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg pl-10 pr-3 py-2 text-xs text-[#e6edf3] font-mono focus:border-[#fbbf24] focus:outline-none text-left"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#768390] hover:text-[#e6edf3]"
                      >
                        {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-[#adbac7] mb-1.5">OpenAI API Key</label>
                    <div className="relative">
                      <input
                        type={showOpenAiKey ? 'text' : 'password'}
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg pl-10 pr-3 py-2 text-xs text-[#e6edf3] font-mono focus:border-[#fbbf24] focus:outline-none text-left"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#768390] hover:text-[#e6edf3]"
                      >
                        {showOpenAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSaveAiSettings}
                  disabled={saving}
                  className="btn-primary text-xs flex items-center justify-center gap-2 mt-2"
                >
                  <Save className="w-4 h-4" />
                  حفظ إعدادات الذكاء الاصطناعي
                </button>
              </div>

              {/* GitHub Private Updater */}
              <div className="glass-card p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#e6edf3]">
                    <ShieldCheck className="w-4 h-4 text-[#10b981]" />
                    التحديث التلقائي الآمن (GitHub Releases)
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/20">
                    الإصدار v{appVersion}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#adbac7] mb-1.5">
                    رمز الوصول الخاص (GitHub Personal Access Token)
                  </label>
                  <div className="relative">
                    <input
                      type={showGhToken ? 'text' : 'password'}
                      value={ghToken}
                      onChange={(e) => setGhToken(e.target.value)}
                      placeholder="ghp_..."
                      className="w-full bg-[#161b22] border border-white/10 rounded-lg pl-10 pr-3 py-2 text-xs text-[#e6edf3] font-mono focus:border-[#fbbf24] focus:outline-none text-left"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGhToken(!showGhToken)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#768390] hover:text-[#e6edf3]"
                    >
                      {showGhToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Update Status card */}
                <div className="p-3.5 bg-[#161b22] border border-white/5 rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[#adbac7]">حالة التحديث:</span>
                    <span className="font-bold text-[#e6edf3]">
                      {updateStatus.status === 'checking' && 'جاري التحقق...'}
                      {updateStatus.status === 'available' && 'تحديث جديد متوفر!'}
                      {updateStatus.status === 'downloaded' && 'التحديث جاهز للتثبيت!'}
                      {updateStatus.status === 'not-available' && 'المنظومة محدثة'}
                      {updateStatus.status === 'error' && 'حدث خطأ'}
                      {updateStatus.status === 'idle' && 'جاهز للتحقق'}
                    </span>
                  </div>

                  {downloadProgress && (
                    <div>
                      <div className="flex justify-between text-[10px] text-[#768390] mb-1">
                        <span>التقدم:</span>
                        <span>{Math.round(downloadProgress.percent || 0)}%</span>
                      </div>
                      <div className="w-full bg-[#0d1117] h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-l from-[#fbbf24] to-[#f59e0b] h-full transition-all duration-200"
                          style={{ width: `${downloadProgress.percent || 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCheckUpdates}
                    disabled={checkingUpdates}
                    className="btn-primary text-xs flex items-center gap-2 flex-1 justify-center"
                  >
                    <RefreshCw className={`w-4 h-4 ${checkingUpdates ? 'animate-spin' : ''}`} />
                    التحقق من التحديثات
                  </button>

                  {updateStatus.updateAvailable && (
                    <button
                      type="button"
                      onClick={handleDownloadUpdate}
                      disabled={downloadingUpdate}
                      className="btn-secondary text-xs flex items-center gap-2 text-[#fbbf24]"
                    >
                      <Download className="w-4 h-4" />
                      تحميل التحديث
                    </button>
                  )}

                  {updateStatus.updateDownloaded && (
                    <button
                      type="button"
                      onClick={handleInstallUpdate}
                      className="btn-primary text-xs flex items-center gap-2 bg-[#10b981] hover:bg-[#059669]"
                    >
                      <Check className="w-4 h-4" />
                      تثبيت وإعادة التشغيل
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ========================================================================= */}
      {/* ARCHIVE VIEWER MODAL */}
      {/* ========================================================================= */}
      <Modal
        open={archiveViewerOpen}
        onClose={() => setArchiveViewerOpen(false)}
        title="استعراض محتويات الأرشيف التاريخي"
        size="xl"
      >
        {selectedArchive ? (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-[#0d1117] border border-white/5 rounded-xl">
                <div className="text-[#768390]">تاريخ التصدير</div>
                <div className="text-sm font-bold text-[#e6edf3] mt-1">
                  {new Date(selectedArchive.exportedAt).toLocaleDateString('ar-SD')}
                </div>
              </div>
              <div className="p-3 bg-[#0d1117] border border-white/5 rounded-xl">
                <div className="text-[#768390]">عدد الفواتير المؤرشفة</div>
                <div className="text-sm font-bold text-[#fbbf24] mt-1">
                  {selectedArchive.counts?.sales || selectedArchive.sales?.length || 0}
                </div>
              </div>
              <div className="p-3 bg-[#0d1117] border border-white/5 rounded-xl">
                <div className="text-[#768390]">سجلات الخسائر</div>
                <div className="text-sm font-bold text-[#ef4444] mt-1">
                  {selectedArchive.counts?.losses || selectedArchive.losses?.length || 0}
                </div>
              </div>
              <div className="p-3 bg-[#0d1117] border border-white/5 rounded-xl">
                <div className="text-[#768390]">الملاحظات</div>
                <div className="text-sm font-bold text-[#38bdf8] mt-1">
                  {selectedArchive.counts?.notes || selectedArchive.notes?.length || 0}
                </div>
              </div>
            </div>

            {/* Sales table preview */}
            <div>
              <h4 className="font-bold text-[#e6edf3] mb-2">عينة من الفواتير المؤرشفة:</h4>
              <div className="max-h-60 overflow-y-auto custom-scrollbar border border-white/5 rounded-xl">
                <table className="w-full text-right">
                  <thead className="bg-[#0d1117] text-[#adbac7] sticky top-0">
                    <tr>
                      <th className="p-2">رقم الفاتورة</th>
                      <th className="p-2">التاريخ</th>
                      <th className="p-2">العميل</th>
                      <th className="p-2">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(selectedArchive.sales || []).slice(0, 50).map((sale) => (
                      <tr key={sale.id} className="hover:bg-white/5">
                        <td className="p-2 font-mono">#{sale.id}</td>
                        <td className="p-2">{new Date(sale.date).toLocaleDateString('ar-SD')}</td>
                        <td className="p-2">{sale.customer_name || 'عميل نقدي'}</td>
                        <td className="p-2 font-bold text-[#10b981]">{formatCurrency(sale.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ========================================================================= */}
      {/* CONFIRM SHRINK MODAL */}
      {/* ========================================================================= */}
      <ConfirmModal
        open={confirmShrinkOpen}
        onClose={() => setConfirmShrinkOpen(false)}
        onConfirm={handleShrinkDatabase}
        title="تأكيد تفريغ وتنظيف قاعدة البيانات (VACUUM)"
        message={`هل أنت متأكد من حذف السجلات القديمة الأقدم من (${customCutoffDate || cutoffYear}) نهائياً من قاعدة البيانات النشطة وتفريغ المساحة؟ تأكد من تصدير الأرشيف أولاً.`}
        confirmText="نعم، تفريغ وتنظيف الآن"
        cancelText="إلغاء"
        danger={true}
      />
    </div>
  );
};

export default SettingsModule;