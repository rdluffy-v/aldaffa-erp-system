/**
 * ============================================================================
 * ALDAFFA ERP - APPLICATION SHELL (v2.0.0)
 * ============================================================================
 *
 * Clean Architecture integration point:
 * - MainLayout (Header + Navigation + content) from components/layout
 * - All 21 feature modules registered with Lucide icons
 * - Role-Based Access Control (RBAC) & Dynamic Module Authorization
 * - Full-screen PIN LockScreenModal & QuickUserSwitchModal
 * - Global ToastContainer for unified notifications
 * - Module switching via state (activeModule)
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from './stores/useSettingsStore.js';
import { useAuthStore } from './stores/useAuthStore.js';
import { useLabelsStore } from './stores/useLabelsStore.js';

// Lucide icons
import {
  LayoutDashboard,
  ShoppingCart,
  Smartphone,
  Undo2,
  CreditCard,
  Package,
  ShoppingBag,
  Wallet,
  Banknote,
  Gift,
  HeartCrack,
  FlaskConical,
  Tag,
  Folder,
  StickyNote,
  Sparkles,
  Lock,
  FileText,
  QrCode,
  SettingsIcon,
  BarChart3
} from 'lucide-react';

// Layout & Modals
import MainLayout from './components/layout/MainLayout.jsx';
import ToastContainer from './components/ui/ToastContainer.jsx';
import LockScreenModal from './components/auth/LockScreenModal.jsx';
import QuickUserSwitchModal from './components/auth/QuickUserSwitchModal.jsx';

// Feature modules
import DashboardModule from './modules/Dashboard.jsx';
import POSModule from './modules/POS.jsx';
import OnlineSalesModule from './modules/OnlineSales.jsx';
import ReturnsModule from './modules/Returns.jsx';
import InvoicesModule from './modules/Invoices.jsx';
import DebtorsModule from './modules/Debtors.jsx';
import InventoryFullModule from './modules/InventoryFull.jsx';
import PurchasesModule from './modules/Purchases.jsx';
import BarcodeStudioModule from './modules/BarcodeStudio.jsx';
import WithdrawalsModule from './modules/Withdrawals.jsx';
import CapitalInjectionsModule from './modules/CapitalInjections.jsx';
import GiftsModule from './modules/Gifts.jsx';
import LossesModule from './modules/Losses.jsx';
import PerfumeMixLabModule from './modules/PerfumeMixLab.jsx';
import DiscountsModule from './modules/Discounts.jsx';
import CategoriesModule from './modules/Categories.jsx';
import NotesModule from './modules/Notes.jsx';
import AIAdvisorModule from './modules/AIAdvisor.jsx';
import ShiftCloseModule from './modules/ShiftClose.jsx';
import SettingsModule from './modules/Settings.jsx';
import AnalyticsModule from './modules/Analytics.jsx';

/**
 * Raw Module definitions (id, defaultLabel, icon, component)
 */
const MODULE_DEFINITIONS = [
  { id: 'dashboard', defaultLabel: 'الرئيسية', icon: LayoutDashboard, component: DashboardModule },
  { id: 'analytics', defaultLabel: 'التحليلات والتقارير', icon: BarChart3, component: AnalyticsModule },
  { id: 'pos', defaultLabel: 'نقاط البيع', icon: ShoppingCart, component: POSModule },
  { id: 'online', defaultLabel: 'أونلاين', icon: Smartphone, component: OnlineSalesModule },
  { id: 'returns', defaultLabel: 'المرتجعات', icon: Undo2, component: ReturnsModule },
  { id: 'invoices', defaultLabel: 'الفواتير', icon: FileText, component: InvoicesModule },
  { id: 'debtors', defaultLabel: 'الديون', icon: CreditCard, component: DebtorsModule },
  { id: 'inventory', defaultLabel: 'المخزون', icon: Package, component: InventoryFullModule },
  { id: 'purchases', defaultLabel: 'المشتريات', icon: ShoppingBag, component: PurchasesModule },
  { id: 'barcodes', defaultLabel: 'استوديو الباركود', icon: QrCode, component: BarcodeStudioModule },
  { id: 'withdrawals', defaultLabel: 'السحوبات', icon: Wallet, component: WithdrawalsModule },
  { id: 'capital', defaultLabel: 'الضخ', icon: Banknote, component: CapitalInjectionsModule },
  { id: 'gifts', defaultLabel: 'الهدايا', icon: Gift, component: GiftsModule },
  { id: 'losses', defaultLabel: 'الفاقد', icon: HeartCrack, component: LossesModule },
  { id: 'mixlab', defaultLabel: 'المختبر', icon: FlaskConical, component: PerfumeMixLabModule },
  { id: 'discounts', defaultLabel: 'الخصومات', icon: Tag, component: DiscountsModule },
  { id: 'categories', defaultLabel: 'التصنيفات', icon: Folder, component: CategoriesModule },
  { id: 'notes', defaultLabel: 'الملاحظات', icon: StickyNote, component: NotesModule },
  { id: 'advisor', defaultLabel: 'المستشار AI', icon: Sparkles, component: AIAdvisorModule },
  { id: 'shift', defaultLabel: 'إغلاق الوردية', icon: Lock, component: ShiftCloseModule },
  { id: 'settings', defaultLabel: 'الإعدادات', icon: SettingsIcon, component: SettingsModule }
];

const App = () => {
  const [activeModule, setActiveModule] = useState('settings');
  const customLabels = useLabelsStore((state) => state.labels);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const loadUsers = useAuthStore((state) => state.loadUsers);
  const canAccessModule = useAuthStore((state) => state.canAccessModule);
  const currentUser = useAuthStore((state) => state.currentUser);
  const isLocked = useAuthStore((state) => state.isLocked);

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, [loadSettings, loadUsers]);

  // Filter modules based on current user role and granular permissions
  const allowedModules = useMemo(() => {
    return MODULE_DEFINITIONS.filter((mod) => canAccessModule(mod.id)).map((mod) => ({
      ...mod,
      label: customLabels[mod.id] || mod.defaultLabel
    }));
  }, [canAccessModule, customLabels, currentUser]);

  // If current activeModule is not authorized, automatically redirect to pos or first available
  useEffect(() => {
    if (allowedModules.length > 0) {
      const isCurrentAllowed = allowedModules.some((m) => m.id === activeModule);
      if (!isCurrentAllowed) {
        const fallback = allowedModules.find((m) => m.id === 'pos') || allowedModules[0];
        if (fallback) {
          setActiveModule(fallback.id);
        }
      }
    }
  }, [allowedModules, activeModule]);

  const handleSelect = useCallback((id) => {
    setActiveModule(id);
  }, []);

  const activeConfig = allowedModules.find((m) => m.id === activeModule);
  const ActiveComponent = activeConfig?.component;

  return (
    <>
      <MainLayout
        modules={allowedModules}
        activeModule={activeModule}
        onSelect={handleSelect}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeModule}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="h-full"
          >
            {ActiveComponent ? <ActiveComponent /> : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                لا تملك صلاحية للوصول إلى هذا القسم.
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </MainLayout>

      {/* Full-Screen PIN Lock Modal */}
      {isLocked && <LockScreenModal />}

      {/* Quick User Switcher Modal */}
      <QuickUserSwitchModal />

      {/* Global toast notifications */}
      <ToastContainer />
    </>
  );
};

export default App;