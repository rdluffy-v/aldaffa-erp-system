/**
 * ============================================================================
 * WITHDRAWALS & PAYROLL MODULE - REFACTORED WITH REPOSITORY PATTERN + UI STORE
 * ============================================================================
 *
 * Features:
 * - Sub-tabs: General Expenses (المصروفات العامة), Salaries (المرتبات والأجور),
 *   Capital Assets (المصروفات الرأسمالية والأصول), All (الكل)
 * - Flexible Multi-Month & Multi-Payment Payroll Engine:
 *   * Past Months (متأخرات e.g. شهر 9) vs Current Month (شهر 10) vs Future/Advance Months (مقدماً e.g. شهر 11)
 *   * Single Month vs Multi-Month Bundles (أشهر متعددة دفعة واحدة)
 *   * Multiple Payments for Same Month (سلفيات، دفعات جزئية، متبقي راتب، مكافآت)
 *   * Batch Multi-Employee Payroll Modal (مسير رواتب جماعي لعدة عمال دفعة واحدة)
 *   * Exact Delivery Timestamp on Cash Movement (تسجيل دقيق لتاريخ وساعة خروج ودخول النقدية)
 *   * Daily Cash Outflow Timeline (سجل حركة الأموال اليومية بالتاريخ)
 *   * Live Employee List Selection from registered users & records (حسب الأسماء الموجودة)
 *   * Printable Official Salary Voucher (سند صرف وتسليم راتب موظف)
 *   * UTF-8 BOM CSV Export for Payroll and Expenses
 * - Strict Financial Separation:
 *   * Drawer withdrawals deduct from daily physical shift cash
 *   * Safe withdrawals & Capital Assets do not penalize cashier drawer closing
 * ============================================================================
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DollarSign,
  Users,
  Building2,
  Wallet,
  Landmark,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  Printer,
  Download,
  UserCheck,
  AlertTriangle,
  ChevronDown,
  Check,
  UserPlus,
  Clock,
  Briefcase,
  Layers,
  ArrowRight,
  TrendingDown,
  History
} from 'lucide-react';
import { WithdrawalsRepository } from '../database/repositories/WithdrawalsRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useAuthStore } from '../stores/useAuthStore.js';
import { formatCurrency, formatDate, generateId, safeParseFloat } from '../utils/helpers.js';
import useDebounce from '../hooks/useDebounce.js';

const withdrawalsRepo = new WithdrawalsRepository();

export const ARABIC_MONTHS = [
  { value: '01', name: 'يناير' },
  { value: '02', name: 'فبراير' },
  { value: '03', name: 'مارس' },
  { value: '04', name: 'أبريل' },
  { value: '05', name: 'مايو' },
  { value: '06', name: 'يونيو' },
  { value: '07', name: 'يوليو' },
  { value: '08', name: 'أغسطس' },
  { value: '09', name: 'سبتمبر' },
  { value: '10', name: 'أكتوبر' },
  { value: '11', name: 'نوفمبر' },
  { value: '12', name: 'ديسمبر' }
];

export const PAYMENT_TYPES = [
  { id: 'salary_full', label: 'مرتب كامل (كامل المستحق)', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { id: 'salary_advance', label: 'سلفة / دفعة مقدماً من المرتب', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { id: 'salary_remaining', label: 'متبقي الراتب (تكملة المستحق)', badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  { id: 'salary_prepaid', label: 'مرتب شهر قادم (مقدماً)', badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { id: 'salary_arrears', label: 'متأخرات عن شهر سابق', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { id: 'salary_bonus', label: 'مكافأة / حافز إضافي مع الراتب', badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30' }
];

export const formatSingleMonth = (monthStr) => {
  if (!monthStr) return 'غير محدد';
  const parts = String(monthStr).trim().split('-');
  if (parts.length < 2) return monthStr;
  const year = parts[0];
  const m = parts[1];
  const found = ARABIC_MONTHS.find((x) => x.value === m);
  return found ? `${found.name} ${year}` : monthStr;
};

export const formatSalaryMonth = (monthStr) => {
  if (!monthStr) return 'غير محدد';
  const tokens = String(monthStr).split(',').map((s) => s.trim()).filter(Boolean);
  if (tokens.length === 1) return formatSingleMonth(tokens[0]);
  return tokens.map((t) => formatSingleMonth(t)).join(' + ');
};

const getCurrentMonthYear = () => {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return { year, month };
};

// Calculate relative month string (offset = -1 for prev, 0 for current, +1 for next)
const getRelativeMonthYear = (offset = 0) => {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = String(target.getFullYear());
  const month = String(target.getMonth() + 1).padStart(2, '0');
  return { year, month, key: `${year}-${month}` };
};

// Convert a YYYY-MM-DD date input into an ISO datetime (start/end of day)
const toStartISO = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

const toEndISO = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T23:59:59.999`);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

const toDateInputValue = (date) => {
  const d = new Date(date);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

// Generate precise timestamp matching the delivery date to preserve active shift timing
const makeTransactionTimestamp = (dateStr) => {
  const now = new Date();
  const todayStr = toDateInputValue(now);
  if (!dateStr || dateStr === todayStr) {
    return now.toISOString();
  }
  const parts = dateStr.split('-').map(Number);
  if (parts.length === 3) {
    const target = new Date(parts[0], parts[1] - 1, parts[2], now.getHours(), now.getMinutes(), now.getSeconds());
    return isNaN(target.getTime()) ? now.toISOString() : target.toISOString();
  }
  return now.toISOString();
};

const WithdrawalsModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();
  const loadUsers = useAuthStore((s) => s.loadUsers);

  // Active sub-tab: 'all' | 'general' | 'salary' | 'capital_asset'
  const [activeTab, setActiveTab] = useState('all');

  // Sub-view mode in salaries tab: 'records' | 'daily_flow'
  const [salaryViewMode, setSalaryViewMode] = useState('records');

  // Data
  const [withdrawals, setWithdrawals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  // Registered employees list from DB
  const [employeesList, setEmployeesList] = useState([]);

  // Date range filter
  const [startDate, setStartDate] = useState(() => toDateInputValue(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState(() => toDateInputValue(Date.now()));

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('all');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState('all');

  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalCategory, setModalCategory] = useState('general'); // 'general' | 'salary' | 'capital_asset'
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('drawer'); // 'drawer' | 'safe'
  const [assetName, setAssetName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Salary specific form states
  const [employeeName, setEmployeeName] = useState('');
  const [isCustomEmployee, setIsCustomEmployee] = useState(false);
  const [customEmployeeName, setCustomEmployeeName] = useState('');
  const [salaryYear, setSalaryYear] = useState(() => getCurrentMonthYear().year);
  const [salaryMonth, setSalaryMonth] = useState(() => getCurrentMonthYear().month);
  const [deliveryDate, setDeliveryDate] = useState(() => toDateInputValue(Date.now()));
  const [paymentType, setPaymentType] = useState('salary_full');

  // Multi-month bundle mode in modal
  const [isMultiMonth, setIsMultiMonth] = useState(false);
  const [selectedMultiMonths, setSelectedMultiMonths] = useState([]);

  // Batch Multi-Employee Payroll Modal
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchMonth, setBatchMonth] = useState(() => getCurrentMonthYear().month);
  const [batchYear, setBatchYear] = useState(() => getCurrentMonthYear().year);
  const [batchDeliveryDate, setBatchDeliveryDate] = useState(() => toDateInputValue(Date.now()));
  const [batchSource, setBatchSource] = useState('drawer');
  const [batchRows, setBatchRows] = useState({});

  // Confirm delete modal
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Salary Voucher / Receipt Modal state
  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState(null);

  // ---------------------------------------------------------------
  // Load withdrawals + summary in the selected range
  // ---------------------------------------------------------------
  const loadWithdrawals = useCallback(async () => {
    const startISO = toStartISO(startDate);
    const endISO = toEndISO(endDate);
    if (!startISO || !endISO) {
      showError('يرجى اختيار نطاق تاريخ صحيح');
      return;
    }

    setLoading(true);
    try {
      const [data, sum] = await Promise.all([
        withdrawalsRepo.getWithdrawalsInRange(startISO, endISO),
        withdrawalsRepo.getWithdrawalsSummary(startISO, endISO)
      ]);
      setWithdrawals(data || []);
      setSummary(sum);
    } catch (error) {
      showError(`خطأ في تحميل السحوبات: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, showError]);

  // Load employee list from users and past withdrawals
  const loadEmployees = useCallback(async () => {
    try {
      const list = await withdrawalsRepo.getEmployeesList();
      setEmployeesList(list || []);
    } catch (err) {
      console.warn('Failed to load employees list:', err);
    }
  }, []);

  useEffect(() => {
    loadWithdrawals();
    loadEmployees();
    if (loadUsers) loadUsers();

    const handleRefresh = () => {
      loadWithdrawals();
      loadEmployees();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, [loadWithdrawals, loadEmployees, loadUsers]);

  // Relative month presets for instant selection
  const prevMonthInfo = useMemo(() => getRelativeMonthYear(-1), []);
  const currentMonthInfo = useMemo(() => getRelativeMonthYear(0), []);
  const nextMonthInfo = useMemo(() => getRelativeMonthYear(1), []);
  const afterNextMonthInfo = useMemo(() => getRelativeMonthYear(2), []);

  // Quick preset month handler
  const setQuickMonth = (target) => {
    setIsMultiMonth(false);
    setSalaryYear(target.year);
    setSalaryMonth(target.month);

    // Auto-select smart payment type based on relation to current month
    if (target.key < currentMonthInfo.key) {
      setPaymentType('salary_arrears');
    } else if (target.key > currentMonthInfo.key) {
      setPaymentType('salary_prepaid');
    } else {
      setPaymentType('salary_full');
    }
  };

  // Toggle month in multi-month selection
  const toggleMultiMonth = (monthKey) => {
    setSelectedMultiMonths((prev) =>
      prev.includes(monthKey) ? prev.filter((m) => m !== monthKey) : [...prev, monthKey].sort()
    );
  };

  // Previous payments info for current selected employee and month
  const existingPaymentsForSelectedMonth = useMemo(() => {
    if (modalCategory !== 'salary') return [];
    const effName = (isCustomEmployee ? customEmployeeName : employeeName).trim().toLowerCase();
    if (!effName) return [];

    const targetKey = isMultiMonth
      ? selectedMultiMonths.join(', ')
      : `${salaryYear}-${salaryMonth}`;

    if (!targetKey) return [];

    return withdrawals.filter((w) => {
      if (w.category !== 'salary') return false;
      const wName = (w.employee_name || w.recipient || '').trim().toLowerCase();
      if (wName !== effName) return false;
      const wMonth = w.salary_month || (w.date ? w.date.slice(0, 7) : '');
      return wMonth.includes(targetKey) || targetKey.includes(wMonth);
    });
  }, [
    modalCategory,
    employeeName,
    customEmployeeName,
    isCustomEmployee,
    salaryYear,
    salaryMonth,
    isMultiMonth,
    selectedMultiMonths,
    withdrawals
  ]);

  const totalPreviouslyPaidForMonth = useMemo(() => {
    return existingPaymentsForSelectedMonth.reduce(
      (sum, p) => sum + safeParseFloat(p.amount, 0),
      0
    );
  }, [existingPaymentsForSelectedMonth]);

  // Open Add Modal preset for current tab
  const handleOpenAddModal = (presetCategory = null, presetEmployee = null) => {
    const targetCategory = presetCategory || (activeTab !== 'all' ? activeTab : 'general');
    setModalCategory(targetCategory);
    if (targetCategory === 'capital_asset') {
      setSource('safe');
    } else {
      setSource('drawer');
    }

    const currentMY = getCurrentMonthYear();
    setSalaryYear(currentMY.year);
    setSalaryMonth(currentMY.month);
    setDeliveryDate(toDateInputValue(Date.now()));
    setPaymentType('salary_full');
    setIsMultiMonth(false);
    setSelectedMultiMonths([`${currentMY.year}-${currentMY.month}`]);
    setAmount('');
    setAssetName('');
    setRecipient('');
    setReason('');
    setNotes('');

    if (presetEmployee) {
      setEmployeeName(presetEmployee);
      setIsCustomEmployee(false);
      setCustomEmployeeName('');
    } else {
      if (employeesList.length > 0) {
        setEmployeeName(employeesList[0].name);
        setIsCustomEmployee(false);
      } else {
        setEmployeeName('');
        setIsCustomEmployee(true);
      }
      setCustomEmployeeName('');
    }

    setShowAddModal(true);
  };

  // Open Batch Multi-Employee Modal
  const handleOpenBatchModal = () => {
    const currentMY = getCurrentMonthYear();
    setBatchMonth(currentMY.month);
    setBatchYear(currentMY.year);
    setBatchDeliveryDate(toDateInputValue(Date.now()));
    setBatchSource('drawer');

    // Initialize rows for all employees
    const initial = {};
    employeesList.forEach((emp) => {
      initial[emp.name] = {
        selected: true,
        amount: '',
        notes: ''
      };
    });
    setBatchRows(initial);
    setShowBatchModal(true);
  };

  // ---------------------------------------------------------------
  // Add Single Withdrawal / Salary
  // ---------------------------------------------------------------
  const addWithdrawal = async () => {
    const amt = safeParseFloat(amount, NaN);
    if (isNaN(amt) || amt <= 0) {
      showError('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    let finalReason = reason.trim();
    let finalRecipient = recipient.trim();
    const finalAssetName = assetName.trim();
    const finalNotes = notes.trim();

    let finalEmployeeName = '';
    let targetSalaryMonth = null;
    const finalDeliveryDate = deliveryDate || toDateInputValue(Date.now());

    if (modalCategory === 'salary') {
      finalEmployeeName = (isCustomEmployee ? customEmployeeName : employeeName).trim();
      if (!finalEmployeeName) {
        showError('يرجى تحديد أو إدخال اسم الموظف');
        return;
      }

      if (isMultiMonth) {
        if (selectedMultiMonths.length === 0) {
          showError('يرجى اختيار شهر واحد على الأقل من قائمة الأشهر المتعددة');
          return;
        }
        targetSalaryMonth = selectedMultiMonths.join(', ');
      } else {
        targetSalaryMonth = `${salaryYear}-${salaryMonth}`;
      }

      const monthLabel = formatSalaryMonth(targetSalaryMonth);
      const paymentTypeMeta = PAYMENT_TYPES.find((p) => p.id === paymentType);
      const typeLabel = paymentTypeMeta ? paymentTypeMeta.label.split('(')[0].trim() : 'مرتب';

      finalReason = finalReason || `${typeLabel}: ${monthLabel} - ${finalEmployeeName}`;
      finalRecipient = finalRecipient || finalEmployeeName;
    } else if (modalCategory === 'capital_asset') {
      if (!finalAssetName) {
        showError('يرجى إدخال اسم الأصل الرأسمالي أو الآلة والمعدات');
        return;
      }
      finalReason = finalReason || `شراء أصل رأسمالي: ${finalAssetName}`;
    } else {
      if (!finalReason) {
        showError('يرجى إدخال سبب المصروف');
        return;
      }
    }

    const finalSource = modalCategory === 'capital_asset' ? 'safe' : source;
    // Generate precise timestamp on the delivery date
    const recordISO = makeTransactionTimestamp(finalDeliveryDate);

    try {
      await withdrawalsRepo.create({
        id: generateId(),
        date: recordISO,
        delivery_date: finalDeliveryDate,
        salary_month: targetSalaryMonth,
        payment_type: modalCategory === 'salary' ? paymentType : null,
        amount: amt,
        category: modalCategory,
        source: finalSource,
        employee_name: finalEmployeeName || null,
        asset_name: finalAssetName || null,
        recipient: finalRecipient || null,
        reason: finalReason,
        notes: finalNotes || null
      });

      setShowAddModal(false);
      setAmount('');
      setEmployeeName('');
      setCustomEmployeeName('');
      setAssetName('');
      setRecipient('');
      setReason('');
      setNotes('');

      await loadWithdrawals();
      await loadEmployees();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
      }

      const categoryLabel =
        modalCategory === 'salary'
          ? `مرتب الموظف (${finalEmployeeName})`
          : modalCategory === 'capital_asset'
          ? 'الأصل الرأسمالي'
          : 'المصروف';
      const sourceLabel = finalSource === 'drawer' ? 'درج الكاشير اليومي' : 'الخزينة العامة / رأس المال';

      showSuccess(`✅ تم تسجيل ${categoryLabel} بنجاح\nالمبلغ: ${formatCurrency(amt)}\nالمصدر: ${sourceLabel}\nالتاريخ: ${finalDeliveryDate}`);
    } catch (error) {
      showError(`خطأ في تسجيل السحب: ${error.message}`);
    }
  };

  // ---------------------------------------------------------------
  // Batch Disburse Multiple Salaries (Multi-Employee Payroll)
  // ---------------------------------------------------------------
  const submitBatchSalaries = async () => {
    const targetMonth = `${batchYear}-${batchMonth}`;
    const monthLabel = formatSalaryMonth(targetMonth);
    const finalDeliveryDate = batchDeliveryDate || toDateInputValue(Date.now());
    const recordISO = makeTransactionTimestamp(finalDeliveryDate);

    const itemsToSave = [];
    let totalBatchAmount = 0;

    Object.keys(batchRows).forEach((empName) => {
      const row = batchRows[empName];
      if (row.selected) {
        const amt = safeParseFloat(row.amount, 0);
        if (amt > 0) {
          itemsToSave.push({
            id: generateId(),
            date: recordISO,
            delivery_date: finalDeliveryDate,
            salary_month: targetMonth,
            payment_type: 'salary_full',
            amount: amt,
            category: 'salary',
            source: batchSource,
            employee_name: empName,
            recipient: empName,
            reason: `مسير رواتب: شهر ${monthLabel} - ${empName}`,
            notes: row.notes ? row.notes.trim() : 'صرف مسير رواتب جماعي'
          });
          totalBatchAmount += amt;
        }
      }
    });

    if (itemsToSave.length === 0) {
      showError('يرجى تحديد موظف واحد على الأقل وإدخال مبلغ راتب صحيح');
      return;
    }

    try {
      await withdrawalsRepo.batchCreateSalaries(itemsToSave);
      setShowBatchModal(false);
      await loadWithdrawals();
      await loadEmployees();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
      }

      const sourceLabel = batchSource === 'drawer' ? 'درج الكاشير' : 'الخزينة العامة';
      showSuccess(`✅ تم صرف مسير الرواتب بنجاح لـ (${itemsToSave.length}) موظف\nالإجمالي: ${formatCurrency(totalBatchAmount)}\nالمصدر: ${sourceLabel}`);
    } catch (error) {
      showError(`فشل في صرف المسير الجماعي: ${error.message}`);
    }
  };

  // ---------------------------------------------------------------
  // Delete withdrawal
  // ---------------------------------------------------------------
  const deleteWithdrawal = (withdrawal) => {
    setConfirmDelete({
      message: `هل أنت متأكد من حذف السجل بمبلغ ${formatCurrency(withdrawal.amount)} (${withdrawal.reason || withdrawal.employee_name || withdrawal.asset_name})؟`,
      onConfirm: async () => {
        try {
          await withdrawalsRepo.delete(withdrawal.id);
          setConfirmDelete(null);
          await loadWithdrawals();
          await loadEmployees();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('aldaffa:data-refresh'));
          }
          showSuccess('✅ تم حذف السجل بنجاح');
        } catch (error) {
          setConfirmDelete(null);
          showError(`خطأ في حذف السجل: ${error.message}`);
        }
      }
    });
  };

  // ---------------------------------------------------------------
  // Export CSV with UTF-8 BOM
  // ---------------------------------------------------------------
  const handleExportCSV = () => {
    if (filteredWithdrawals.length === 0) {
      showWarning('لا توجد بيانات متاحة للتصدير في هذا النطاق');
      return;
    }

    const isSalariesOnly = activeTab === 'salary';
    const filename = isSalariesOnly
      ? `aldaffa_salaries_payroll_${startDate}_to_${endDate}.csv`
      : `aldaffa_withdrawals_report_${startDate}_to_${endDate}.csv`;

    const headers = isSalariesOnly
      ? ['معرف السجل', 'تاريخ التسليم', 'شهر المرتب المستحق', 'نوع الدفعة', 'اسم الموظف', 'المبلغ (د.ل)', 'جهة الصرف', 'البيان', 'ملاحظات']
      : ['معرف السجل', 'تاريخ الحركة', 'التصنيف', 'المستلم / الموظف', 'الأصل الرأسمالي', 'المبلغ (د.ل)', 'جهة الصرف', 'البيان', 'ملاحظات'];

    const rows = filteredWithdrawals.map((w) => {
      const delivery = w.delivery_date || (w.date ? w.date.slice(0, 10) : '');
      const sMonth = formatSalaryMonth(w.salary_month || (w.date ? w.date.slice(0, 7) : ''));
      const srcLabel = w.source === 'safe' ? 'الخزينة العامة' : 'درج الكاشير';
      const typeMeta = PAYMENT_TYPES.find((p) => p.id === w.payment_type);
      const typeLabel = typeMeta ? typeMeta.label.split('(')[0].trim() : 'مرتب';

      if (isSalariesOnly) {
        return [
          `"${w.id || ''}"`,
          `"${delivery}"`,
          `"${sMonth}"`,
          `"${typeLabel}"`,
          `"${(w.employee_name || w.recipient || '').replace(/"/g, '""')}"`,
          Number(w.amount || 0).toFixed(2),
          `"${srcLabel}"`,
          `"${(w.reason || '').replace(/"/g, '""')}"`,
          `"${(w.notes || '').replace(/"/g, '""')}"`
        ];
      } else {
        const catLabel = w.category === 'salary' ? 'مرتب موظف' : w.category === 'capital_asset' ? 'أصل رأسمالي' : 'مصروف عام';
        return [
          `"${w.id || ''}"`,
          `"${delivery}"`,
          `"${catLabel}"`,
          `"${(w.employee_name || w.recipient || '').replace(/"/g, '""')}"`,
          `"${(w.asset_name || '').replace(/"/g, '""')}"`,
          Number(w.amount || 0).toFixed(2),
          `"${srcLabel}"`,
          `"${(w.reason || '').replace(/"/g, '""')}"`,
          `"${(w.notes || '').replace(/"/g, '""')}"`
        ];
      }
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSuccess(`✅ تم تصدير كشف ${isSalariesOnly ? 'مسير الرواتب' : 'المصروفات'} بنجاح`);
  };

  // Open Salary Voucher Print Modal
  const handleOpenVoucher = (withdrawal) => {
    setSelectedVoucher(withdrawal);
    setShowVoucherModal(true);
  };

  // ---------------------------------------------------------------
  // Financial metrics calculations
  // ---------------------------------------------------------------
  const {
    generalTotal,
    salaryTotal,
    capitalTotal,
    drawerTotal,
    safeTotal,
    generalCount,
    salaryCount,
    capitalCount,
    distinctEmployeesCount
  } = useMemo(() => {
    let generalSum = 0;
    let salarySum = 0;
    let capitalSum = 0;
    let drawerSum = 0;
    let safeSum = 0;
    let gCount = 0;
    let sCount = 0;
    let cCount = 0;
    const paidEmployees = new Set();

    for (const w of withdrawals) {
      const amt = safeParseFloat(w.amount, 0);
      const cat = w.category || 'general';
      const src = w.source || 'drawer';

      if (cat === 'salary') {
        salarySum += amt;
        sCount++;
        const name = (w.employee_name || w.recipient || '').trim();
        if (name) paidEmployees.add(name.toLowerCase());
      } else if (cat === 'capital_asset') {
        capitalSum += amt;
        cCount++;
      } else {
        generalSum += amt;
        gCount++;
      }

      if (src === 'drawer' && cat !== 'capital_asset') {
        drawerSum += amt;
      } else {
        safeSum += amt;
      }
    }

    return {
      generalTotal: generalSum,
      salaryTotal: salarySum,
      capitalTotal: capitalSum,
      drawerTotal: drawerSum,
      safeTotal: safeSum,
      generalCount: gCount,
      salaryCount: sCount,
      capitalCount: cCount,
      distinctEmployeesCount: paidEmployees.size
    };
  }, [withdrawals]);

  // Employee Salary Matrix Status Overview
  const salariesEmployeeSummary = useMemo(() => {
    const salaries = withdrawals.filter((w) => w.category === 'salary');
    const summaryMap = new Map();

    employeesList.forEach((emp) => {
      summaryMap.set(emp.name.toLowerCase(), {
        name: emp.name,
        role: emp.role,
        isUser: emp.isUser,
        count: 0,
        total: 0,
        lastMonth: null,
        lastDeliveryDate: null
      });
    });

    salaries.forEach((w) => {
      const name = (w.employee_name || w.recipient || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      let record = summaryMap.get(key);
      if (!record) {
        record = {
          name,
          role: 'موظف',
          isUser: false,
          count: 0,
          total: 0,
          lastMonth: null,
          lastDeliveryDate: null
        };
        summaryMap.set(key, record);
      }
      record.count += 1;
      record.total += safeParseFloat(w.amount, 0);

      const wDate = w.delivery_date || (w.date ? w.date.slice(0, 10) : '');
      if (!record.lastDeliveryDate || wDate > record.lastDeliveryDate) {
        record.lastDeliveryDate = wDate;
        record.lastMonth = w.salary_month || (w.date ? w.date.slice(0, 7) : null);
      }
    });

    return Array.from(summaryMap.values()).sort((a, b) => b.total - a.total);
  }, [withdrawals, employeesList]);

  // Distinct salary months present in withdrawals for filtering
  const availableSalaryMonths = useMemo(() => {
    const set = new Set();
    withdrawals.forEach((w) => {
      if (w.category === 'salary') {
        const m = w.salary_month || (w.date ? w.date.slice(0, 7) : null);
        if (m) {
          m.split(',').forEach((token) => set.add(token.trim()));
        }
      }
    });
    return Array.from(set).sort().reverse();
  }, [withdrawals]);

  // Daily Cash Movement Timeline
  const dailyCashFlowData = useMemo(() => {
    const map = new Map();

    withdrawals.forEach((w) => {
      const flowDate = w.delivery_date || (w.date ? w.date.slice(0, 10) : '');
      if (!flowDate) return;

      if (!map.has(flowDate)) {
        map.set(flowDate, {
          date: flowDate,
          drawerOut: 0,
          safeOut: 0,
          totalOut: 0,
          salariesCount: 0,
          expensesCount: 0,
          items: []
        });
      }

      const day = map.get(flowDate);
      const amt = safeParseFloat(w.amount, 0);
      day.totalOut += amt;
      if (w.source === 'drawer' && w.category !== 'capital_asset') {
        day.drawerOut += amt;
      } else {
        day.safeOut += amt;
      }

      if (w.category === 'salary') day.salariesCount++;
      else day.expensesCount++;

      day.items.push(w);
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [withdrawals]);

  // Tab, filter, and search filtering
  const filteredWithdrawals = useMemo(() => {
    let list = withdrawals;

    // Filter by tab
    if (activeTab === 'general') {
      list = list.filter((w) => !w.category || w.category === 'general');
    } else if (activeTab === 'salary') {
      list = list.filter((w) => w.category === 'salary');

      // Filter by selected employee
      if (selectedEmployeeFilter !== 'all') {
        list = list.filter(
          (w) => (w.employee_name || w.recipient || '').trim().toLowerCase() === selectedEmployeeFilter.toLowerCase()
        );
      }

      // Filter by selected target salary month
      if (selectedMonthFilter !== 'all') {
        list = list.filter((w) => {
          const m = w.salary_month || (w.date ? w.date.slice(0, 7) : '');
          return m.includes(selectedMonthFilter);
        });
      }
    } else if (activeTab === 'capital_asset') {
      list = list.filter((w) => w.category === 'capital_asset');
    }

    // Filter by search term
    if (!debouncedSearch) return list;
    const term = debouncedSearch.toLowerCase();
    return list.filter(
      (w) =>
        (w.reason || '').toLowerCase().includes(term) ||
        (w.recipient || '').toLowerCase().includes(term) ||
        (w.employee_name || '').toLowerCase().includes(term) ||
        (w.asset_name || '').toLowerCase().includes(term) ||
        (w.salary_month || '').toLowerCase().includes(term) ||
        formatSalaryMonth(w.salary_month).toLowerCase().includes(term) ||
        (w.notes || '').toLowerCase().includes(term)
    );
  }, [withdrawals, activeTab, selectedEmployeeFilter, selectedMonthFilter, debouncedSearch]);

  // ===============================================================
  // RENDER
  // ===============================================================
  return (
    <div className="h-full flex flex-col glass-card p-6" dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>💸</span>
          <span>المصروفات والسحوبات وتخليص المرتبات</span>
        </h2>
        <div className="flex gap-2.5 flex-wrap items-center">
          {/* Date range filter */}
          <div className="flex items-center gap-2 bg-gray-800 p-2 rounded-lg border border-gold/30">
            <Calendar className="w-4 h-4 text-gold" />
            <span className="text-sm text-gray-400">من</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm focus:outline-none focus:border-gold"
            />
            <span className="text-sm text-gray-400">إلى</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-gray-700 text-white px-2 py-1 rounded text-sm focus:outline-none focus:border-gold"
            />
          </div>

          <button
            onClick={loadWithdrawals}
            title="تحديث البيانات"
            className="bg-gray-700 px-3 py-2 rounded-lg hover:bg-gray-600 transition-colors text-gray-200 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleExportCSV}
            title="تصدير ملف CSV"
            className="bg-slate-800 hover:bg-slate-700 border border-gold/40 text-gold px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>تصدير CSV</span>
          </button>

          {activeTab === 'salary' ? (
            <div className="flex gap-2">
              <button
                onClick={handleOpenBatchModal}
                className="bg-teal-700 hover:bg-teal-600 text-white px-3.5 py-2 flex items-center gap-1.5 text-sm font-bold rounded-lg shadow-md cursor-pointer transition-colors"
                title="صرف مسير رواتب لعدة عمال دفعة واحدة"
              >
                <Layers className="w-4 h-4" />
                <span>مسير جماعي</span>
              </button>
              <button
                onClick={() => handleOpenAddModal('salary')}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 flex items-center gap-2 text-sm font-bold rounded-lg shadow-md cursor-pointer transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>تسليم مرتب</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleOpenAddModal()}
              className="btn-gold px-4 py-2 flex items-center gap-2 text-sm font-bold shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تسجيل جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="flex items-center gap-2 mb-4 border-b border-gray-700/60 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'all'
              ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
              : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>الكل</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === 'all' ? 'bg-slate-950/30 text-slate-950 font-bold' : 'bg-gray-700 text-gray-400'
            }`}
          >
            {withdrawals.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'general'
              ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
              : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>المصروفات العامة</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === 'general' ? 'bg-slate-950/30 text-slate-950 font-bold' : 'bg-gray-700 text-gray-400'
            }`}
          >
            {generalCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('salary')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'salary'
              ? 'bg-emerald-600 text-white font-extrabold shadow-md'
              : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>المرتبات والأجور</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === 'salary' ? 'bg-emerald-800 text-white font-bold' : 'bg-gray-700 text-gray-400'
            }`}
          >
            {salaryCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('capital_asset')}
          className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'capital_asset'
              ? 'bg-amber-500 text-slate-950 font-extrabold shadow-md'
              : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>المصروفات الرأسمالية والأصول</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === 'capital_asset' ? 'bg-slate-950/30 text-slate-950 font-bold' : 'bg-gray-700 text-gray-400'
            }`}
          >
            {capitalCount}
          </span>
        </button>
      </div>

      {/* Summary Stat Cards */}
      {activeTab === 'salary' ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="bg-emerald-950/40 border border-emerald-500/40 p-4 rounded-xl">
            <div className="flex items-center justify-between text-xs text-emerald-400 mb-1">
              <span>إجمالي الرواتب المسلمة</span>
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400">{formatCurrency(salaryTotal)}</div>
            <div className="text-[11px] text-gray-400 mt-1">{salaryCount} مسيرات ودفعات مستلمة</div>
          </div>

          <div className="bg-gray-800/90 border border-gray-700/60 p-4 rounded-xl">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>الموظفين المستلمين</span>
              <UserCheck className="w-4 h-4 text-gold" />
            </div>
            <div className="text-2xl font-black text-white">{distinctEmployeesCount} موظف</div>
            <div className="text-[11px] text-gray-400 mt-1">من أصل {employeesList.length} مسجل بالمنظومة</div>
          </div>

          <div className="bg-gray-800/90 border border-gray-700/60 p-4 rounded-xl">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>من درج الكاشير (يخصم من الوردية)</span>
              <Wallet className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400">
              {formatCurrency(
                withdrawals
                  .filter((w) => w.category === 'salary' && (w.source || 'drawer') === 'drawer')
                  .reduce((acc, curr) => acc + safeParseFloat(curr.amount, 0), 0)
              )}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">يؤثر مباشرة على الكاش عند التقفيل</div>
          </div>

          <div className="bg-gray-800/90 border border-blue-500/30 p-4 rounded-xl">
            <div className="flex items-center justify-between text-xs text-blue-400 mb-1">
              <span>من الخزينة العامة (لا يخصم من الوردية)</span>
              <Landmark className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-blue-400">
              {formatCurrency(
                withdrawals
                  .filter((w) => w.category === 'salary' && w.source === 'safe')
                  .reduce((acc, curr) => acc + safeParseFloat(curr.amount, 0), 0)
              )}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">مصروف من رأس المال والخزينة</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-800/90 border border-gray-700/60 p-4 rounded-xl">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>المصروفات العامة</span>
              <FileText className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-xl font-extrabold text-rose-400">{formatCurrency(generalTotal)}</div>
            <div className="text-[11px] text-gray-400 mt-1">{generalCount} عمليات تسجيل</div>
          </div>

          <div className="bg-gray-800/90 border border-gray-700/60 p-4 rounded-xl">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>المرتبات والأجور</span>
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-extrabold text-emerald-400">{formatCurrency(salaryTotal)}</div>
            <div className="text-[11px] text-gray-400 mt-1">{salaryCount} رواتب مسجلة</div>
          </div>

          <div className="bg-gray-800/90 border border-gray-700/60 p-4 rounded-xl">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>الأصول الرأسمالية والآلات</span>
              <Building2 className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xl font-extrabold text-purple-400">{formatCurrency(capitalTotal)}</div>
            <div className="text-[11px] text-gray-400 mt-1">{capitalCount} أصول مسجلة (رأس المال)</div>
          </div>

          <div className="bg-gray-800/90 border border-amber-500/30 p-4 rounded-xl">
            <div className="flex items-center justify-between text-xs text-amber-400/90 mb-1">
              <span>مسحوبات درج الكاشير</span>
              <Wallet className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-extrabold text-amber-400">{formatCurrency(drawerTotal)}</div>
            <div className="text-[11px] text-gray-400 mt-1">تخصم من تقفيل الوردية اليومية</div>
          </div>
        </div>
      )}

      {/* Salary Tab Specific: View Mode Switcher & Quick Employee Matrix */}
      {activeTab === 'salary' && (
        <div className="mb-4 space-y-3">
          {/* View Mode Toggle: All Records vs Daily Cash Timeline */}
          <div className="flex items-center justify-between bg-gray-900/80 p-1.5 rounded-xl border border-gray-700/70">
            <div className="flex gap-1.5">
              <button
                onClick={() => setSalaryViewMode('records')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  salaryViewMode === 'records'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>سجلات ورواتب الموظفين</span>
              </button>
              <button
                onClick={() => setSalaryViewMode('daily_flow')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  salaryViewMode === 'daily_flow'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>حركة خروج النقدية اليومية بالتاريخ ({dailyCashFlowData.length} يوم)</span>
              </button>
            </div>
            <div className="text-[11px] text-emerald-400 hidden sm:block">
              كل يوم تخرج فيه أموال يتوثق باليوم والساعة والمصدر بدقة 100%
            </div>
          </div>

          {/* Registered Employees Status Matrix Cards */}
          {salariesEmployeeSummary.length > 0 && salaryViewMode === 'records' && (
            <div className="bg-gray-900/60 border border-emerald-500/20 p-3.5 rounded-xl">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4" />
                  <span>لوحة موظفي المنظومة وحالة صرف المرتبات</span>
                </span>
                <span className="text-[11px] text-gray-400">انقر على الموظف للتصفية أو الصرف الفوري</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {salariesEmployeeSummary.map((emp) => {
                  const isSelected = selectedEmployeeFilter.toLowerCase() === emp.name.toLowerCase();
                  return (
                    <div
                      key={emp.name}
                      className={`p-2.5 rounded-lg border transition-all text-right flex flex-col justify-between ${
                        isSelected
                          ? 'bg-emerald-950/60 border-emerald-400 shadow-md ring-1 ring-emerald-400'
                          : 'bg-gray-800/80 border-gray-700/70 hover:border-emerald-500/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-bold text-xs text-white truncate" title={emp.name}>
                            {emp.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-gray-700 text-gray-300 rounded shrink-0">
                            {emp.role === 'manager'
                              ? 'مدير'
                              : emp.role === 'cashier'
                              ? 'كاشير'
                              : emp.role === 'accountant'
                              ? 'محاسب'
                              : 'موظف'}
                          </span>
                        </div>

                        <div className="text-[11px] text-gray-300 mb-1">
                          {emp.lastMonth ? (
                            <span className="text-emerald-400 font-medium">
                              آخر شهر: {formatSalaryMonth(emp.lastMonth)}
                            </span>
                          ) : (
                            <span className="text-gray-500">لم يصرف له بعد</span>
                          )}
                        </div>

                        {emp.lastDeliveryDate && (
                          <div className="text-[10px] text-gray-400 mb-2">تسليم: {formatDate(emp.lastDeliveryDate)}</div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-gray-700/50 flex gap-1 items-center justify-between">
                        <button
                          onClick={() =>
                            setSelectedEmployeeFilter(isSelected ? 'all' : emp.name)
                          }
                          className={`text-[10px] px-2 py-1 rounded font-bold cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          {isSelected ? 'إلغاء الفرز' : 'عرض السجلات'}
                        </button>
                        <button
                          onClick={() => handleOpenAddModal('salary', emp.name)}
                          className="text-[10px] bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 px-2 py-1 rounded font-bold cursor-pointer transition-colors"
                          title={`صرف مرتب جديد لـ ${emp.name}`}
                        >
                          + صرف
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-3" />
          <input
            type="text"
            placeholder={
              activeTab === 'salary'
                ? '🔍 بحث في المرتبات (اسم الموظف، الشهر، نوع الدفعة، البيان)...'
                : '🔍 بحث في السحوبات (السبب، اسم الموظف، الأصل، الملاحظات)...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-800 text-white pr-10 pl-4 py-2.5 rounded-lg border border-gold/30 focus:outline-none focus:border-gold text-sm"
          />
        </div>

        {activeTab === 'salary' && (
          <div>
            <select
              value={selectedEmployeeFilter}
              onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
              className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg border border-emerald-500/40 focus:outline-none focus:border-emerald-400 text-sm cursor-pointer"
            >
              <option value="all">👤 جميع الموظفين المسجلين ({employeesList.length})</option>
              {employeesList.map((emp) => (
                <option key={emp.name} value={emp.name}>
                  {emp.name} ({emp.role === 'manager' ? 'مدير' : emp.role === 'cashier' ? 'كاشير' : 'موظف'})
                </option>
              ))}
            </select>
          </div>
        )}

        {activeTab === 'salary' && (
          <div>
            <select
              value={selectedMonthFilter}
              onChange={(e) => setSelectedMonthFilter(e.target.value)}
              className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg border border-emerald-500/40 focus:outline-none focus:border-emerald-400 text-sm cursor-pointer"
            >
              <option value="all">📅 جميع شهور الاستحقاق (سابق / حالي / قادم)</option>
              {availableSalaryMonths.map((m) => (
                <option key={m} value={m}>
                  مرتب شهر: {formatSalaryMonth(m)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="h-5 bg-gray-700 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-gray-700 rounded w-1/2 mb-3"></div>
                <div className="h-8 bg-gray-700 rounded"></div>
              </div>
            ))}
          </div>
        ) : activeTab === 'salary' && salaryViewMode === 'daily_flow' ? (
          /* Daily Cash Flow Timeline View */
          <div className="space-y-3">
            {dailyCashFlowData.length === 0 ? (
              <div className="text-center py-12 text-gray-500">لا توجد حركات نقدية في هذا النطاق</div>
            ) : (
              dailyCashFlowData.map((day) => (
                <div key={day.date} className="glass-card p-4 rounded-xl border border-gray-700/60 space-y-2.5">
                  <div className="flex items-center justify-between border-b border-gray-700/50 pb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 font-bold">
                        📅 {formatDate(day.date)}
                      </span>
                      <span className="text-xs text-gray-400">({day.items.length} حركة نقدية خرجت في هذا اليوم)</span>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded font-bold">
                        خرج من الدرج: {formatCurrency(day.drawerOut)}
                      </span>
                      <span className="text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded font-bold">
                        خرج من الخزينة: {formatCurrency(day.safeOut)}
                      </span>
                      <span className="text-white bg-slate-800 px-3 py-1 rounded font-black border border-gold/30">
                        إجمالي الخارج: {formatCurrency(day.totalOut)}
                      </span>
                    </div>
                  </div>

                  {/* Day items breakdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                    {day.items.map((item) => {
                      const isSal = item.category === 'salary';
                      return (
                        <div key={item.id} className="bg-gray-800/60 p-2.5 rounded-lg border border-gray-700/40 text-xs flex justify-between items-center">
                          <div>
                            <div className="font-bold text-white flex items-center gap-1.5">
                              {isSal ? <UserCheck className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5 text-rose-400" />}
                              <span>{item.employee_name || item.recipient || item.reason}</span>
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              {isSal ? `عن شهر: ${formatSalaryMonth(item.salary_month)}` : item.reason}
                            </div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {item.source === 'drawer' ? 'درج الكاشير' : 'الخزينة العامة'}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-gold text-sm block">{formatCurrency(item.amount)}</span>
                            <span className="text-[10px] text-gray-400">{item.date ? item.date.slice(11, 16) : ''}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : filteredWithdrawals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 py-12">
            <div className="text-5xl mb-3">💸</div>
            <p className="text-lg font-bold text-gray-400 mb-1">
              {debouncedSearch || selectedEmployeeFilter !== 'all' || selectedMonthFilter !== 'all'
                ? 'لا توجد نتائج مطابقة للفرز والبحث'
                : 'لا توجد عمليات مسجلة في هذا التبويب والفترة'}
            </p>
            <p className="text-xs text-gray-500">
              {debouncedSearch
                ? 'جرب كلمة بحث أخرى أو أعد ضبط الفلاتر'
                : activeTab === 'salary'
                ? 'اضغط على تسليم مرتب أو مسير جماعي لصرف أول راتب'
                : 'غيّر نطاق التاريخ أو اضغط على تسجيل جديد'}
            </p>
          </div>
        ) : (
          /* Cards List View */
          <div className="space-y-2.5">
            {filteredWithdrawals.map((withdrawal) => {
              const category = withdrawal.category || 'general';
              const isSalary = category === 'salary';
              const isCapital = category === 'capital_asset';
              const isDrawer = (withdrawal.source || 'drawer') === 'drawer' && !isCapital;
              const actualDeliveryDate = withdrawal.delivery_date || (withdrawal.date ? withdrawal.date.slice(0, 10) : '');
              const targetMonth = withdrawal.salary_month || (withdrawal.date ? withdrawal.date.slice(0, 7) : '');
              const paymentMeta = PAYMENT_TYPES.find((p) => p.id === withdrawal.payment_type);

              return (
                <div
                  key={withdrawal.id}
                  className={`glass-card p-4 transition-all rounded-xl border ${
                    isSalary
                      ? 'border-emerald-500/30 hover:border-emerald-400/60 bg-slate-900/40'
                      : 'border-gray-700/50 hover:border-gold/50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2.5 flex-wrap gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-2xl font-bold text-gold">
                          {formatCurrency(withdrawal.amount)}
                        </span>

                        {/* Category & Salary Badges */}
                        {isSalary && (
                          <>
                            <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              <span>مرتب موظف</span>
                            </span>

                            {/* Payment Type Badge (Advance, Full, Arrears, etc.) */}
                            {paymentMeta && (
                              <span className={`text-[11px] border px-2 py-0.5 rounded font-bold ${paymentMeta.badge}`}>
                                {paymentMeta.label.split('(')[0].trim()}
                              </span>
                            )}

                            {/* Target Entitled Month Badge */}
                            <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-emerald-400" />
                              <span>عن شهر: {formatSalaryMonth(targetMonth)}</span>
                            </span>

                            {/* Exact Handover / Delivery Date Badge */}
                            <span className="text-xs bg-blue-950/60 text-blue-300 border border-blue-500/40 px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                              <Clock className="w-3 h-3 text-blue-400" />
                              <span>تاريخ التسليم: {formatDate(actualDeliveryDate)}</span>
                            </span>
                          </>
                        )}

                        {isCapital && (
                          <span className="text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            <span>أصل رأسمالي / معدات</span>
                          </span>
                        )}

                        {!isSalary && !isCapital && (
                          <span className="text-xs bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            <span>مصروف عام</span>
                          </span>
                        )}

                        {/* Source badge */}
                        {isDrawer ? (
                          <span className="text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                            <Wallet className="w-3 h-3" />
                            <span>درج الكاشير (يخصم من الوردية)</span>
                          </span>
                        ) : (
                          <span className="text-[11px] bg-blue-500/15 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded font-medium flex items-center gap-1">
                            <Landmark className="w-3 h-3" />
                            <span>الخزينة العامة / رأس المال (لا يخصم من الوردية)</span>
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-gray-400 flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        <span>تاريخ وحركة التسجيل: {formatDate(withdrawal.date)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isSalary && (
                        <button
                          onClick={() => handleOpenVoucher(withdrawal)}
                          className="bg-slate-800 hover:bg-slate-700 text-gold border border-gold/40 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                          title="طباعة سند استلام راتب"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>سند استلام</span>
                        </button>
                      )}

                      <button
                        onClick={() => deleteWithdrawal(withdrawal)}
                        className="text-red-400/80 hover:text-red-300 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                        title="حذف السجل"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 bg-gray-800/60 p-3 rounded-lg text-xs">
                    {isSalary && (
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400 min-w-[90px] font-bold">اسم الموظف:</span>
                        <span className="font-extrabold text-white text-sm flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4 text-emerald-400" />
                          <span>{withdrawal.employee_name || withdrawal.recipient || 'غير محدد'}</span>
                        </span>
                      </div>
                    )}

                    {isCapital && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 min-w-[90px] font-medium">اسم الأصل / الآلة:</span>
                        <span className="font-bold text-white text-sm">
                          {withdrawal.asset_name || withdrawal.reason}
                        </span>
                      </div>
                    )}

                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 min-w-[90px] font-medium">البيان / السبب:</span>
                      <span className="font-bold text-gray-200">{withdrawal.reason}</span>
                    </div>

                    {!isSalary && withdrawal.recipient && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 min-w-[90px] font-medium">المستلم:</span>
                        <span className="text-gray-200">{withdrawal.recipient}</span>
                      </div>
                    )}

                    {withdrawal.notes && (
                      <div className="flex items-start gap-2 pt-1 border-t border-gray-700/50 text-gray-300">
                        <span className="text-gray-400 min-w-[90px] font-medium">ملاحظات:</span>
                        <span className="italic">{withdrawal.notes}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Settle Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="glass-card p-6 w-full max-w-lg border border-gold/30 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gold mb-3 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              <span>
                {modalCategory === 'salary'
                  ? 'تسليم وتخليص مرتب موظف'
                  : modalCategory === 'capital_asset'
                  ? 'تسجيل أصل رأسمالي / معدات'
                  : 'تسجيل مصروف عام'}
              </span>
            </h2>

            {/* Category Selector Tabs */}
            <div className="grid grid-cols-3 gap-2 mb-4 bg-gray-900/60 p-1.5 rounded-xl border border-gray-700/60">
              <button
                type="button"
                onClick={() => {
                  setModalCategory('general');
                  setSource('drawer');
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                  modalCategory === 'general'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                مصروف عام
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalCategory('salary');
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                  modalCategory === 'salary'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                مرتب موظف
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalCategory('capital_asset');
                  setSource('safe');
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer ${
                  modalCategory === 'capital_asset'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                أصل رأسمالي / آلة
              </button>
            </div>

            <div className="space-y-3.5 mb-6">
              {/* Category-Specific: SALARY ENHANCED DISBURSEMENT FIELDS */}
              {modalCategory === 'salary' && (
                <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3.5 space-y-3.5">
                  {/* 1. Employee Name Selector from Existing Names */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        <span>اسم الموظف / العامل المستلم *</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomEmployee(!isCustomEmployee);
                          if (!isCustomEmployee) {
                            setCustomEmployeeName('');
                          } else if (employeesList.length > 0) {
                            setEmployeeName(employeesList[0].name);
                          }
                        }}
                        className="text-[11px] text-gold hover:underline cursor-pointer"
                      >
                        {isCustomEmployee ? '← الاختيار من الأسماء المسجلة' : '+ كتابة اسم موظف جديد'}
                      </button>
                    </div>

                    {!isCustomEmployee ? (
                      <select
                        value={employeeName}
                        onChange={(e) => setEmployeeName(e.target.value)}
                        className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg border border-emerald-500/40 focus:outline-none focus:border-emerald-400 text-sm font-bold cursor-pointer"
                      >
                        {employeesList.length === 0 && (
                          <option value="">لا توجد أسماء مسجلة - اكتب اسم الموظف</option>
                        )}
                        {employeesList.map((emp) => (
                          <option key={emp.name} value={emp.name}>
                            {emp.name} ({emp.role === 'manager' ? 'مدير' : emp.role === 'cashier' ? 'كاشير' : emp.role === 'accountant' ? 'محاسب' : 'موظف'})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        placeholder="أدخل اسم الموظف الجديد..."
                        value={customEmployeeName}
                        onChange={(e) => setCustomEmployeeName(e.target.value)}
                        className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg border border-emerald-500/40 focus:outline-none focus:border-emerald-400 text-sm font-bold"
                        autoFocus
                      />
                    )}
                  </div>

                  {/* 2. Target Month Selector: Quick Presets (Past, Current, Future, Multi) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>شهر الاستحقاق (سابق / حالي / قادم مقدماً) *</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsMultiMonth(!isMultiMonth)}
                        className="text-[11px] text-teal-400 hover:underline cursor-pointer"
                      >
                        {isMultiMonth ? '← العودة لاختيار شهر واحد' : '➕ اختيار أشهر متعددة دفعة واحدة'}
                      </button>
                    </div>

                    {!isMultiMonth ? (
                      <div className="space-y-2">
                        {/* 1-Click Fast Presets */}
                        <div className="grid grid-cols-4 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setQuickMonth(prevMonthInfo)}
                            className={`py-1.5 px-1 rounded text-xs font-bold transition-all text-center cursor-pointer border ${
                              `${salaryYear}-${salaryMonth}` === prevMonthInfo.key
                                ? 'bg-purple-600 text-white border-purple-400 shadow'
                                : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500'
                            }`}
                            title="صرف متأخرات شهر سابق"
                          >
                            ⏪ شهر سابق ({formatSingleMonth(prevMonthInfo.key).split(' ')[0]})
                          </button>

                          <button
                            type="button"
                            onClick={() => setQuickMonth(currentMonthInfo)}
                            className={`py-1.5 px-1 rounded text-xs font-bold transition-all text-center cursor-pointer border ${
                              `${salaryYear}-${salaryMonth}` === currentMonthInfo.key
                                ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                                : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500'
                            }`}
                            title="صرف مرتب الشهر الجاري"
                          >
                            ⏺️ الحالي ({formatSingleMonth(currentMonthInfo.key).split(' ')[0]})
                          </button>

                          <button
                            type="button"
                            onClick={() => setQuickMonth(nextMonthInfo)}
                            className={`py-1.5 px-1 rounded text-xs font-bold transition-all text-center cursor-pointer border ${
                              `${salaryYear}-${salaryMonth}` === nextMonthInfo.key
                                ? 'bg-blue-600 text-white border-blue-400 shadow'
                                : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500'
                            }`}
                            title="صرف مرتب شهر قادم مقدماً"
                          >
                            ⏩ قادم مقدماً ({formatSingleMonth(nextMonthInfo.key).split(' ')[0]})
                          </button>

                          <button
                            type="button"
                            onClick={() => setQuickMonth(afterNextMonthInfo)}
                            className={`py-1.5 px-1 rounded text-xs font-bold transition-all text-center cursor-pointer border ${
                              `${salaryYear}-${salaryMonth}` === afterNextMonthInfo.key
                                ? 'bg-indigo-600 text-white border-indigo-400 shadow'
                                : 'bg-gray-800 text-gray-300 border-gray-700 hover:border-gray-500'
                            }`}
                            title="صرف مرتب مقدماً بعد القادم"
                          >
                            ⏩⏩ {formatSingleMonth(afterNextMonthInfo.key).split(' ')[0]}
                          </button>
                        </div>

                        {/* Custom Month Dropdowns */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <select
                            value={salaryMonth}
                            onChange={(e) => setSalaryMonth(e.target.value)}
                            className="bg-gray-800 text-white px-3 py-2 rounded-lg border border-emerald-500/40 text-sm font-bold cursor-pointer"
                          >
                            {ARABIC_MONTHS.map((m) => (
                              <option key={m.value} value={m.value}>
                                شهر {m.name} ({m.value})
                              </option>
                            ))}
                          </select>

                          <select
                            value={salaryYear}
                            onChange={(e) => setSalaryYear(e.target.value)}
                            className="bg-gray-800 text-white px-3 py-2 rounded-lg border border-emerald-500/40 text-sm font-bold cursor-pointer"
                          >
                            {[2024, 2025, 2026, 2027, 2028].map((yr) => (
                              <option key={yr} value={String(yr)}>
                                سنة {yr}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      /* Multi-Month Checkbox Selection */
                      <div className="bg-gray-900/80 p-2.5 rounded-lg border border-teal-500/30 space-y-2">
                        <div className="text-[11px] text-gray-300">اختر الشهور التي يشملها هذا الصرف:</div>
                        <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto">
                          {[
                            prevMonthInfo.key,
                            currentMonthInfo.key,
                            nextMonthInfo.key,
                            afterNextMonthInfo.key,
                            `${currentMonthInfo.year}-12`,
                            `${Number(currentMonthInfo.year) + 1}-01`
                          ].map((k) => {
                            const isChecked = selectedMultiMonths.includes(k);
                            return (
                              <label
                                key={k}
                                className={`flex items-center gap-1.5 p-1.5 rounded cursor-pointer text-xs border ${
                                  isChecked
                                    ? 'bg-teal-950 border-teal-400 text-teal-200 font-bold'
                                    : 'bg-gray-800 border-gray-700 text-gray-400'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleMultiMonth(k)}
                                  className="accent-teal-400"
                                />
                                <span className="truncate">{formatSingleMonth(k)}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="mt-1.5 flex items-center justify-between text-xs text-emerald-300 bg-emerald-950/60 p-2 rounded border border-emerald-500/30">
                      <span>📅 شهر الاستحقاق:</span>
                      <strong className="text-white font-extrabold">
                        {isMultiMonth
                          ? selectedMultiMonths.map(formatSingleMonth).join(' + ') || 'لم يتم تحديد أشهر'
                          : formatSalaryMonth(`${salaryYear}-${salaryMonth}`)}
                      </strong>
                    </div>
                  </div>

                  {/* 3. Payment Nature / Type (Full, Advance, Remaining, etc.) */}
                  <div>
                    <label className="text-xs font-bold text-emerald-400 mb-1 block">
                      نوع الدفعة / السداد *
                    </label>
                    <select
                      value={paymentType}
                      onChange={(e) => setPaymentType(e.target.value)}
                      className="w-full bg-gray-800 text-white px-3.5 py-2 rounded-lg border border-emerald-500/40 text-xs font-bold cursor-pointer"
                    >
                      {PAYMENT_TYPES.map((pt) => (
                        <option key={pt.id} value={pt.id}>
                          {pt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 4. Multi-payment history alert for this employee & month */}
                  {existingPaymentsForSelectedMonth.length > 0 && (
                    <div className="p-2.5 bg-amber-950/70 border border-amber-500/50 rounded-lg text-xs text-amber-200 space-y-1 animate-in fade-in">
                      <div className="flex items-center gap-1.5 font-bold text-amber-300">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>تنبيه دفعات سابقة:</span>
                      </div>
                      <div className="text-[11px] leading-relaxed">
                        استلم هذا الموظف مسبقاً لهذا الشهر إجمالي{' '}
                        <strong className="text-white font-extrabold">{formatCurrency(totalPreviouslyPaidForMonth)}</strong> عبر ({existingPaymentsForSelectedMonth.length}) دفعة.
                        هذه العملية ستُسجل كدفعة إضافية / تسوية متبقي دون أي مشاكل.
                      </div>
                    </div>
                  )}

                  {/* 5. Exact Delivery Date Picker */}
                  <div>
                    <label className="text-xs font-bold text-emerald-400 mb-1 block flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>تاريخ التسليم وخروج النقدية الفعلي *</span>
                    </label>
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="w-full bg-gray-800 text-white px-3.5 py-2 rounded-lg border border-emerald-500/40 text-sm focus:outline-none focus:border-emerald-400 font-bold"
                    />
                    <span className="text-[10px] text-gray-400 mt-0.5 block">
                      سيتم تسجيل خروج النقدية بهذا التاريخ بدقة ويظهر فوراً في تقفيل الوردية.
                    </span>
                  </div>
                </div>
              )}

              {/* Capital Asset fields */}
              {modalCategory === 'capital_asset' && (
                <div>
                  <label className="text-xs font-bold text-purple-400 mb-1 block">
                    اسم الأصل / الآلة أو المعدات *
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: ماكينة كبس العطور الهيدروليكية..."
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg border border-purple-500/40 focus:outline-none focus:border-purple-400 text-sm"
                    autoFocus
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    💡 الأصول الرأسمالية تُسجل كقيمة أصول ولا تؤثر على الوردية اليومية، وتظهر في القوائم المالية.
                  </p>
                </div>
              )}

              {/* Amount Field */}
              <div>
                <label className="text-xs font-bold text-gray-300 mb-1 block">المبلغ المسلم (د.ل) *</label>
                <input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-gray-800 text-white px-3.5 py-2.5 rounded-lg border border-gold/30 focus:outline-none focus:border-gold text-lg font-bold"
                  min="0"
                  step="0.01"
                  autoFocus={modalCategory === 'general'}
                />
              </div>

              {/* Source Selection (Drawer vs Safe) */}
              <div>
                <label className="text-xs font-bold text-gray-300 mb-1.5 block">
                  جهة السحب / الصرف *
                </label>
                {modalCategory === 'capital_asset' ? (
                  <div className="bg-purple-950/30 border border-purple-500/30 rounded-lg p-3 text-xs text-purple-200 flex items-center gap-2">
                    <Landmark className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>
                      <strong>الخزينة العامة / رأس المال:</strong> الأصول الرأسمالية تُصرف حصراً من الخزينة ولا تُخصم من درج الكاشير اليومي.
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                        source === 'drawer'
                          ? 'bg-amber-500/20 border-amber-400 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs mb-1">
                        <input
                          type="radio"
                          name="source"
                          checked={source === 'drawer'}
                          onChange={() => setSource('drawer')}
                          className="accent-amber-400"
                        />
                        <Wallet className="w-3.5 h-3.5 text-amber-400" />
                        <span>درج الكاشير اليومي</span>
                      </div>
                      <span className="text-[10px] text-gray-300">
                        يُخصم من مبيعات الوردية الحالية عند التقفيل.
                      </span>
                    </label>

                    <label
                      className={`flex flex-col p-3 rounded-lg border cursor-pointer transition-all ${
                        source === 'safe'
                          ? 'bg-blue-500/20 border-blue-400 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs mb-1">
                        <input
                          type="radio"
                          name="source"
                          checked={source === 'safe'}
                          onChange={() => setSource('safe')}
                          className="accent-blue-400"
                        />
                        <Landmark className="w-3.5 h-3.5 text-blue-400" />
                        <span>الخزينة العامة / رأس المال</span>
                      </div>
                      <span className="text-[10px] text-gray-300">
                        لا يخصم من الوردية اليومية للكاشير.
                      </span>
                    </label>
                  </div>
                )}
              </div>

              {/* General Category specific fields */}
              {modalCategory === 'general' && (
                <>
                  <div>
                    <label className="text-xs font-bold text-gray-300 mb-1 block">المستلم (اختياري)</label>
                    <input
                      type="text"
                      placeholder="اسم الشخص أو الجهة المستلمة..."
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      className="w-full bg-gray-800 text-white px-3.5 py-2 rounded-lg border border-gold/30 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-300 mb-1 block">السبب / البيان *</label>
                    <input
                      type="text"
                      placeholder="مثال: فاتورة كهرباء، ضيافة المحل، تنظيفات..."
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="w-full bg-gray-800 text-white px-3.5 py-2 rounded-lg border border-gold/30 text-xs"
                    />
                  </div>
                </>
              )}

              {/* Notes for all categories */}
              <div>
                <label className="text-xs font-bold text-gray-300 mb-1 block">
                  ملاحظات إضافية <span className="text-gray-500 font-normal">(اختياري)</span>
                </label>
                <textarea
                  placeholder={
                    modalCategory === 'salary'
                      ? 'أي تفاصيل، سلفيات، مكافأة، خصم ساعات...'
                      : 'أي تفاصيل أو ملاحظات إضافية...'
                  }
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-gray-800 text-white px-3.5 py-2 rounded-lg border border-gold/30 h-16 resize-none text-xs"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={addWithdrawal}
                className={`flex-1 py-2.5 text-sm font-bold cursor-pointer rounded-lg transition-colors ${
                  modalCategory === 'salary'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'
                    : 'btn-gold'
                }`}
              >
                ✅ تأكيد وحفظ
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setAmount('');
                  setEmployeeName('');
                  setCustomEmployeeName('');
                  setAssetName('');
                  setRecipient('');
                  setReason('');
                  setNotes('');
                }}
                className="flex-1 bg-gray-700 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-gray-600 text-sm cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Multi-Employee Payroll Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="glass-card p-6 w-full max-w-2xl border border-teal-500/40 shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in">
            <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-teal-500/20 rounded-lg text-teal-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">صرف مسير رواتب جماعي لعدة عمال</h3>
                  <p className="text-xs text-gray-400">تخليص رواتب متعددة دفعة واحدة وتوثيقها بالتاريخ</p>
                </div>
              </div>
              <button onClick={() => setShowBatchModal(false)} className="text-gray-400 hover:text-white p-1 text-xl cursor-pointer">
                ✕
              </button>
            </div>

            {/* Batch Config Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 bg-gray-900/80 p-3 rounded-xl border border-gray-700/60 text-xs">
              <div>
                <label className="text-gray-300 font-bold block mb-1">شهر الاستحقاق:</label>
                <div className="flex gap-1.5">
                  <select
                    value={batchMonth}
                    onChange={(e) => setBatchMonth(e.target.value)}
                    className="bg-gray-800 text-white px-2 py-1.5 rounded border border-teal-500/40 flex-1 font-bold"
                  >
                    {ARABIC_MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        شهر {m.name} ({m.value})
                      </option>
                    ))}
                  </select>
                  <select
                    value={batchYear}
                    onChange={(e) => setBatchYear(e.target.value)}
                    className="bg-gray-800 text-white px-2 py-1.5 rounded border border-teal-500/40 font-bold"
                  >
                    {[2025, 2026, 2027].map((yr) => (
                      <option key={yr} value={String(yr)}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-gray-300 font-bold block mb-1">تاريخ التسليم الفعلي:</label>
                <input
                  type="date"
                  value={batchDeliveryDate}
                  onChange={(e) => setBatchDeliveryDate(e.target.value)}
                  className="w-full bg-gray-800 text-white px-2 py-1.5 rounded border border-teal-500/40 font-bold"
                />
              </div>

              <div>
                <label className="text-gray-300 font-bold block mb-1">جهة الصرف:</label>
                <select
                  value={batchSource}
                  onChange={(e) => setBatchSource(e.target.value)}
                  className="w-full bg-gray-800 text-white px-2 py-1.5 rounded border border-teal-500/40 font-bold cursor-pointer"
                >
                  <option value="drawer">درج الكاشير اليومي (يخصم من الوردية)</option>
                  <option value="safe">الخزينة العامة (لا يخصم من الوردية)</option>
                </select>
              </div>
            </div>

            {/* Employees Batch Table */}
            <div className="flex-1 overflow-y-auto border border-gray-700/60 rounded-xl mb-4">
              <table className="w-full text-right text-xs">
                <thead className="bg-gray-900/90 text-gray-300 border-b border-gray-700 sticky top-0">
                  <tr>
                    <th className="p-2.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={Object.values(batchRows).every((r) => r.selected)}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setBatchRows((prev) => {
                            const updated = { ...prev };
                            Object.keys(updated).forEach((k) => (updated[k].selected = val));
                            return updated;
                          });
                        }}
                        className="accent-teal-400"
                      />
                    </th>
                    <th className="p-2.5">اسم الموظف / الصفة</th>
                    <th className="p-2.5 w-32">المبلغ (د.ل) *</th>
                    <th className="p-2.5">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {employeesList.map((emp) => {
                    const row = batchRows[emp.name] || { selected: false, amount: '', notes: '' };
                    return (
                      <tr key={emp.name} className={row.selected ? 'bg-teal-950/20' : 'opacity-60'}>
                        <td className="p-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) => {
                              const val = e.target.checked;
                              setBatchRows((prev) => ({
                                ...prev,
                                [emp.name]: { ...row, selected: val }
                              }));
                            }}
                            className="accent-teal-400 cursor-pointer"
                          />
                        </td>
                        <td className="p-2.5">
                          <span className="font-bold text-white block">{emp.name}</span>
                          <span className="text-[10px] text-gray-400">
                            {emp.role === 'manager' ? 'مدير' : emp.role === 'cashier' ? 'كاشير' : 'موظف'}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="number"
                            placeholder="0.00"
                            value={row.amount}
                            disabled={!row.selected}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBatchRows((prev) => ({
                                ...prev,
                                [emp.name]: { ...row, amount: val }
                              }));
                            }}
                            className="w-full bg-gray-800 text-white px-2 py-1 rounded border border-gray-600 focus:border-teal-400 font-bold"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            placeholder="اختياري..."
                            value={row.notes}
                            disabled={!row.selected}
                            onChange={(e) => {
                              const val = e.target.value;
                              setBatchRows((prev) => ({
                                ...prev,
                                [emp.name]: { ...row, notes: val }
                              }));
                            }}
                            className="w-full bg-gray-800 text-white px-2 py-1 rounded border border-gray-600 text-xs"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Total Footer & Actions */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-700">
              <div className="text-sm font-bold text-teal-400">
                إجمالي مسير الرواتب المحددة:{' '}
                <span className="text-xl font-black text-white">
                  {formatCurrency(
                    Object.values(batchRows)
                      .filter((r) => r.selected)
                      .reduce((sum, r) => sum + safeParseFloat(r.amount, 0), 0)
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={submitBatchSalaries}
                  className="bg-teal-600 hover:bg-teal-500 text-white px-5 py-2 rounded-lg font-bold text-sm cursor-pointer shadow-md transition-colors"
                >
                  ✅ تأكيد وصرف المسير
                </button>
                <button
                  onClick={() => setShowBatchModal(false)}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Salary Voucher / Receipt Modal */}
      {showVoucherModal && selectedVoucher && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="glass-card p-6 w-full max-w-lg border border-gold/40 shadow-2xl relative">
            <div className="flex justify-between items-center border-b border-gray-700/60 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-gold/10 rounded-lg text-gold">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">سند صرف وتسليم راتب موظف</h3>
                  <p className="text-xs text-gray-400">الدفة للعطور - سند استلام رسمي</p>
                </div>
              </div>
              <button
                onClick={() => setShowVoucherModal(false)}
                className="text-gray-400 hover:text-white p-1 text-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-900/90 border border-gold/20 rounded-xl p-5 mb-5 space-y-3 text-sm">
              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <span className="text-gray-400 text-xs">رقم السند:</span>
                <span className="font-mono font-bold text-gold text-xs">
                  #SAL-{selectedVoucher.id.slice(0, 8).toUpperCase()}
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <span className="text-gray-400">اسم الموظف / العامل:</span>
                <span className="font-extrabold text-white text-base">
                  {selectedVoucher.employee_name || selectedVoucher.recipient}
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <span className="text-gray-400">عن شهر الاستحقاق:</span>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full font-bold text-xs">
                  📅 {formatSalaryMonth(selectedVoucher.salary_month || (selectedVoucher.date ? selectedVoucher.date.slice(0, 7) : ''))}
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <span className="text-gray-400">تاريخ التسليم الفعلي:</span>
                <span className="text-gray-200 font-medium">
                  🤝 {formatDate(selectedVoucher.delivery_date || selectedVoucher.date)}
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <span className="text-gray-400">المبلغ المسلم:</span>
                <span className="text-2xl font-black text-gold">
                  {formatCurrency(selectedVoucher.amount)}
                </span>
              </div>

              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <span className="text-gray-400">جهة الصرف:</span>
                <span className="text-gray-300 font-medium text-xs">
                  {selectedVoucher.source === 'safe'
                    ? 'الخزينة العامة / رأس المال'
                    : 'درج الكاشير اليومي'}
                </span>
              </div>

              {selectedVoucher.notes && (
                <div className="pt-1 text-xs">
                  <span className="text-gray-400 block mb-1">ملاحظات:</span>
                  <span className="text-gray-300 italic bg-gray-800/50 p-2 rounded block">
                    {selectedVoucher.notes}
                  </span>
                </div>
              )}

              <div className="pt-4 grid grid-cols-2 gap-4 border-t border-gray-800 text-center text-xs">
                <div>
                  <span className="text-gray-400 block mb-6">توقيع المستلم (الموظف)</span>
                  <div className="border-b border-gray-700 mx-4"></div>
                </div>
                <div>
                  <span className="text-gray-400 block mb-6">توقيع الإدارة / المحاسب</span>
                  <div className="border-b border-gray-700 mx-4"></div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => window.print()}
                className="flex-1 btn-gold py-2.5 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة السند</span>
              </button>
              <button
                onClick={() => setShowVoucherModal(false)}
                className="flex-1 bg-gray-700 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-gray-600 text-sm cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[60] p-4" dir="rtl">
          <div className="glass-card p-6 w-full max-w-md border border-red-500/30">
            <h2 className="text-lg font-bold text-gold mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span>تأكيد الحذف</span>
            </h2>
            <p className="text-gray-300 mb-6 text-sm leading-relaxed">{confirmDelete.message}</p>
            <div className="flex gap-3">
              <button
                onClick={confirmDelete.onConfirm}
                className="flex-1 bg-red-600 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-red-700 transition-colors text-sm cursor-pointer"
              >
                نعم، حذف
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 bg-gray-700 text-white px-4 py-2.5 rounded-lg font-bold hover:bg-gray-600 text-sm cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WithdrawalsModule;
