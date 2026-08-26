import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SalesRepository } from '../database/repositories/SalesRepository.js';
import { PurchasesRepository } from '../database/repositories/PurchasesRepository.js';
import { BaseRepository } from '../database/repositories/BaseRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { useInventoryStore } from '../stores/useInventoryStore.js';
import { formatCurrency, formatDate } from '../utils/helpers.js';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';
import {
  FileText,
  Printer,
  Search,
  Download,
  Eye,
  RefreshCw,
  ShoppingCart,
  Smartphone,
  ShoppingBag,
  Trash2,
  AlertTriangle
} from 'lucide-react';

const salesRepo = new SalesRepository();
const purchasesRepo = new PurchasesRepository();
const saleItemsRepo = new BaseRepository('sale_items');

const InvoicesModule = () => {
  const { showSuccess, showError } = useUIStore();
  const { loadProducts } = useInventoryStore();

  const [activeTab, setActiveTab] = useState('pos'); // 'pos' | 'online' | 'purchases'
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [invoiceItems, setInvoiceItems] = useState([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Deletion modal state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allSales, allPurchases] = await Promise.all([
        salesRepo.findAll({}, 'date DESC'),
        purchasesRepo.findAll({}, 'date DESC')
      ]);
      setSales(allSales || []);
      setPurchases(allPurchases || []);
    } catch (err) {
      showError(`خطأ في تحميل الفواتير: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();

    const handleRefresh = () => {
      loadData();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, [loadData]);

  // Filter lists based on active tab & search
  const filteredList = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (activeTab === 'pos') {
      return sales
        .filter((s) => s.type !== 'online')
        .filter((s) => {
          if (!term) return true;
          return (
            String(s.id).includes(term) ||
            (s.customer_name && s.customer_name.toLowerCase().includes(term)) ||
            (s.notes && s.notes.toLowerCase().includes(term))
          );
        });
    }

    if (activeTab === 'online') {
      return sales
        .filter((s) => s.type === 'online')
        .filter((s) => {
          if (!term) return true;
          return (
            String(s.id).includes(term) ||
            (s.customer_name && s.customer_name.toLowerCase().includes(term)) ||
            (s.notes && s.notes.toLowerCase().includes(term))
          );
        });
    }

    // Purchases
    return purchases.filter((p) => {
      if (!term) return true;
      return (
        String(p.id).toLowerCase().includes(term) ||
        (p.supplier_name && p.supplier_name.toLowerCase().includes(term)) ||
        (p.invoice_ref && p.invoice_ref.toLowerCase().includes(term))
      );
    });
  }, [sales, purchases, activeTab, searchTerm]);

  // View invoice details
  const handleViewInvoice = async (invoice) => {
    setSelectedInvoice(invoice);
    if (activeTab === 'purchases') {
      try {
        const items = JSON.parse(invoice.items_json || '[]');
        setInvoiceItems(items);
      } catch (e) {
        setInvoiceItems([]);
      }
    } else {
      try {
        const items = await saleItemsRepo.findAll({ sale_id: invoice.id });
        setInvoiceItems(items || []);
      } catch (e) {
        setInvoiceItems([]);
      }
    }
    setPreviewOpen(true);
  };

  // Trigger Delete Confirmation
  const confirmDeleteInvoice = (invoice, tabType = activeTab) => {
    setDeleteTarget({ invoice, tabType });
  };

  // Perform Deletion
  const handleDeleteInvoice = async () => {
    if (!deleteTarget) return;
    const { invoice, tabType } = deleteTarget;
    setIsDeleting(true);

    try {
      if (tabType === 'purchases') {
        await purchasesRepo.deletePurchaseWithStockAdjustment(invoice.id);
        showSuccess(`✅ تم حذف فاتورة المشتريات وتعديل المخزون بنجاح`);
      } else {
        await salesRepo.deleteSaleWithStockRestore(invoice.id);
        showSuccess(`✅ تم حذف الفاتورة رقم #${invoice.id} واسترجاع الكميات للمخزون`);
      }

      // Reload global stock and invoice data
      await loadData();
      await loadProducts();

      // If this invoice is currently open in preview, close it
      if (selectedInvoice && selectedInvoice.id === invoice.id) {
        setPreviewOpen(false);
        setSelectedInvoice(null);
      }
    } catch (err) {
      showError(`فشل حذف الفاتورة: ${err.message}`);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Thermal Reprint
  const handleThermalPrint = async (invoice) => {
    try {
      const electron = window.require ? window.require('electron') : null;
      if (!electron) {
        window.print();
        return;
      }

      if (activeTab === 'purchases') {
        const items = JSON.parse(invoice.items_json || '[]');
        await electron.ipcRenderer.invoke('print:purchase-order', {
          orderId: invoice.id,
          date: invoice.date,
          supplier: invoice.supplier_name || 'غير محدد',
          items,
          total: invoice.total,
          notes: invoice.notes
        });
      } else {
        const items = await saleItemsRepo.findAll({ sale_id: invoice.id });
        await electron.ipcRenderer.invoke('print:receipt', {
          saleId: invoice.id,
          date: invoice.date,
          items,
          subtotal: invoice.subtotal || invoice.total,
          discount: invoice.discount || 0,
          total: invoice.total,
          paymentMethod: invoice.payment_method || 'cash',
          customerName: invoice.customer_name
        });
      }
      showSuccess('✅ تم إرسال الفاتورة للطباعة الحرارية');
    } catch (err) {
      showError(`فشل الطباعة: ${err.message}`);
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Top Bar Tabs & Actions */}
      <div className="atelier-card p-4 flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#2D2424] dark:text-white">مركز تدقيق وأرشيف الفواتير</h1>
            <p className="text-xs text-[#5C524F] dark:text-slate-400">استعراض، إعادة طباعة، تصدير، وحذف فواتير نقاط البيع، الأونلاين، والمشتريات</p>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="inline-flex rounded-full bg-gray-200 dark:bg-slate-800 p-1 border border-amber-500/20">
          <button
            type="button"
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'pos'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-[#5C524F] dark:text-slate-300 hover:text-[#2D2424] dark:hover:text-white'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>فواتير المحل (POS)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('online')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'online'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-[#5C524F] dark:text-slate-300 hover:text-[#2D2424] dark:hover:text-white'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>فواتير الأونلاين</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('purchases')}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'purchases'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-[#5C524F] dark:text-slate-300 hover:text-[#2D2424] dark:hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>فواتير المشتريات</span>
          </button>
        </div>

        {/* Search & Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute right-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="بحث برقم الفاتورة أو الاسم..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-amber-500/30 rounded-full pr-9 pl-4 py-1.5 text-xs text-[#2D2424] dark:text-white focus:outline-none focus:border-amber-500 w-64"
            />
          </div>
          <button
            onClick={loadData}
            className="btn-atelier-secondary p-2 text-xs cursor-pointer"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Invoices Table List */}
      <div className="atelier-card flex-1 p-4 overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-3">
          <div className="text-xs font-bold text-[#5C524F] dark:text-slate-400">
            عدد السجلات: <span className="text-amber-600 dark:text-amber-400">{filteredList.length}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <table className="w-full text-right text-xs">
            <thead className="sticky top-0 bg-[#F4EFEA] dark:bg-slate-900 text-[#5C524F] dark:text-slate-300 border-b border-amber-500/20 font-bold z-10">
              <tr>
                <th className="py-2.5 px-3">رقم الفاتورة</th>
                <th className="py-2.5 px-3">التاريخ والوقت</th>
                <th className="py-2.5 px-3">{activeTab === 'purchases' ? 'المورد' : 'العميل'}</th>
                <th className="py-2.5 px-3">{activeTab === 'purchases' ? 'طريقة الدفع' : 'طريقة السداد'}</th>
                <th className="py-2.5 px-3 text-left">الإجمالي</th>
                <th className="py-2.5 px-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-500/10 text-[#2D2424] dark:text-slate-200">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    لا توجد فواتير مطابقة
                  </td>
                </tr>
              ) : (
                filteredList.map((row) => (
                  <tr key={row.id} className="hover:bg-amber-500/5 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-700 dark:text-amber-400">
                      #{String(row.id).slice(0, 10)}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500 dark:text-gray-400">
                      {formatDate(row.date)}
                    </td>
                    <td className="py-2.5 px-3 font-medium">
                      {row.customer_name || row.supplier_name || '—'}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                        {row.payment_method === 'cash' ? 'نقدي' : row.payment_method === 'card' ? 'بطاقة' : row.payment_method === 'debt' ? 'آجل (دين)' : row.payment_method || (row.payment_type === 'cash' ? 'نقدي' : 'آجل')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-left text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(row.total)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleViewInvoice(row)}
                          className="btn-atelier-secondary py-1 px-2.5 text-[11px] cursor-pointer"
                          title="معاينة الفاتورة"
                        >
                          <Eye className="w-3.5 h-3.5 ml-1" />
                          <span>معاينة</span>
                        </button>
                        <button
                          onClick={() => handleThermalPrint(row)}
                          className="btn-atelier-primary py-1 px-2.5 text-[11px] cursor-pointer"
                          title="إعادة طباعة حرارية"
                        >
                          <Printer className="w-3.5 h-3.5 ml-1" />
                          <span>طباعة</span>
                        </button>
                        <button
                          onClick={() => confirmDeleteInvoice(row)}
                          className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                          title="حذف الفاتورة نهائياً"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Preview Modal */}
      {previewOpen && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="atelier-card bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-amber-500/20 pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#2D2424] dark:text-white">معاينة الفاتورة #{String(selectedInvoice.id).slice(0, 12)}</h3>
                <p className="text-xs text-gray-500">{formatDate(selectedInvoice.date)}</p>
              </div>
              <button
                onClick={() => setPreviewOpen(false)}
                className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-800 text-gray-600 dark:text-gray-300 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Customer / Supplier Header */}
            <div className="bg-amber-50/70 dark:bg-slate-800/60 rounded-2xl p-3.5 text-xs grid grid-cols-2 gap-2 border border-amber-200/50 dark:border-white/5">
              <div>
                <span className="text-gray-500">{activeTab === 'purchases' ? 'المورد:' : 'العميل:'}</span>{' '}
                <span className="font-bold text-[#2D2424] dark:text-white">{selectedInvoice.customer_name || selectedInvoice.supplier_name || 'عميل نقدي'}</span>
              </div>
              <div>
                <span className="text-gray-500">طريقة الدفع:</span>{' '}
                <span className="font-bold text-[#2D2424] dark:text-white">{selectedInvoice.payment_method || selectedInvoice.payment_type || 'نقدي'}</span>
              </div>
              {selectedInvoice.notes && (
                <div className="col-span-2">
                  <span className="text-gray-500">ملاحظات:</span> {selectedInvoice.notes}
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="border border-amber-500/20 rounded-2xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-[#F4EFEA] dark:bg-slate-800 font-bold text-[#5C524F] dark:text-slate-300">
                  <tr>
                    <th className="p-2.5">المنتج</th>
                    <th className="p-2.5 text-center">الكمية</th>
                    <th className="p-2.5 text-left">السعر</th>
                    <th className="p-2.5 text-left">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-500/10">
                  {invoiceItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 font-medium">{item.name}</td>
                      <td className="p-2.5 text-center">{item.cart_qty || item.quantity || 1}</td>
                      <td className="p-2.5 text-left">{formatCurrency(item.final_price || item.cost_per_unit || 0)}</td>
                      <td className="p-2.5 text-left font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency((item.final_price || item.cost_per_unit || 0) * (item.cart_qty || item.quantity || 1))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="bg-[#F8F6F0] dark:bg-slate-800/80 p-3.5 rounded-2xl flex justify-between items-center text-sm font-bold border border-amber-500/20">
              <span>المجموع الكلي:</span>
              <span className="text-lg text-emerald-600 dark:text-emerald-400 font-extrabold">{formatCurrency(selectedInvoice.total)}</span>
            </div>

            {/* Footer buttons */}
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleThermalPrint(selectedInvoice)}
                className="flex-1 btn-atelier-primary py-2.5 text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>إعادة طباعة حرارية (80mm)</span>
              </button>

              <button
                onClick={() => confirmDeleteInvoice(selectedInvoice)}
                className="btn-atelier-secondary py-2.5 px-4 text-xs text-rose-600 hover:bg-rose-500 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>حذف الفاتورة</span>
              </button>

              <button
                onClick={() => setPreviewOpen(false)}
                className="btn-atelier-secondary py-2.5 px-5 text-xs cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        isOpen={Boolean(deleteTarget)}
        title="تأكيد حذف الفاتورة"
        message={
          deleteTarget?.tabType === 'purchases'
            ? `هل أنت متأكد من حذف فاتورة المشتريات للمورد "${deleteTarget?.invoice?.supplier_name || 'غير محدد'}" بقيمة ${formatCurrency(deleteTarget?.invoice?.total)}؟ سيتم خصم الكميات المشتراة من المخزون تلقائياً.`
            : `هل أنت متأكد من حذف الفاتورة رقم #${deleteTarget?.invoice?.id} بقيمة ${formatCurrency(deleteTarget?.invoice?.total)}؟ سيتم استرجاع الكميات المباعة إلى رصيد المخزون وتسوية أي ديون مرتبطة بها.`
        }
        confirmText="نعم، حذف نهائياً"
        cancelText="إلغاء"
        type="danger"
        danger={true}
        isLoading={isDeleting}
        onConfirm={handleDeleteInvoice}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default InvoicesModule;

