import React, { useState, useEffect, useCallback } from 'react';
import { CategoriesRepository } from '../database/repositories/CategoriesRepository.js';
import { InventoryRepository } from '../database/repositories/InventoryRepository.js';
import { useUIStore } from '../stores/useUIStore.js';
import { generateId } from '../utils/helpers.js';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';

const categoriesRepo = new CategoriesRepository();
const inventoryRepo = new InventoryRepository();

const CategoriesModule = () => {
  const { showSuccess, showError, showWarning } = useUIStore();

  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');

  // Loading + confirmation states
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const predefinedIcons = [
    '🌸', '🌹', '💐', '🌺', '🌻', '🌼', '🌷', '🥀',
    '🧴', '💧', '✨', '💫', '⭐', '🌟', '💎', '👑',
    '🎁', '🎀', '🎊', '🎉', '🏷️', '📦', '🛍️', '🧺',
    '🔥', '❄️', '🌙', '☀️', '🌈', '☁️', '⚡', '💨'
  ];

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await categoriesRepo.findAll({}, 'name ASC');
      setCategories(data);
    } catch (error) {
      showError('خطأ في تحميل التصنيفات: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadCategories();

    const handleRefresh = () => {
      loadCategories();
    };
    window.addEventListener('aldaffa:data-refresh', handleRefresh);
    return () => window.removeEventListener('aldaffa:data-refresh', handleRefresh);
  }, [loadCategories]);

  const saveCategory = async () => {
    if (!name.trim()) {
      showWarning('يرجى إدخال اسم التصنيف');
      return;
    }

    setSaving(true);

    try {
      if (editingCategory) {
        await categoriesRepo.update(editingCategory.id, {
          name: name.trim(),
          icon
        });
        showSuccess('✅ تم تحديث التصنيف');
      } else {
        // Check duplicate before insert
        const existing = await categoriesRepo.findByName(name.trim());
        if (existing) {
          showWarning('هذا التصنيف موجود بالفعل');
          setSaving(false);
          return;
        }

        await categoriesRepo.create({
          id: generateId(),
          name: name.trim(),
          icon
        });
        showSuccess('✅ تم إضافة التصنيف');
      }

      resetForm();
      await loadCategories();
    } catch (error) {
      if (error.message.includes('UNIQUE')) {
        showWarning('هذا التصنيف موجود بالفعل');
      } else {
        showError('خطأ في حفظ التصنيف: ' + error.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async () => {
    const category = pendingDelete;
    setPendingDelete(null);
    if (!category) return;

    try {
      // Check if category has products
      const productCount = await inventoryRepo.count({ category: category.name });

      if (productCount > 0) {
        showWarning(`لا يمكن حذف التصنيف "${category.name}"\nيحتوي على ${productCount} منتج`);
        return;
      }

      await categoriesRepo.delete(category.id);
      await loadCategories();
      showSuccess('✅ تم حذف التصنيف');
    } catch (error) {
      showError('خطأ في حذف التصنيف: ' + error.message);
    }
  };

  const editCategory = (category) => {
    setEditingCategory(category);
    setName(category.name);
    setIcon(category.icon || '📦');
    setShowModal(true);
  };

  const resetForm = () => {
    setEditingCategory(null);
    setName('');
    setIcon('📦');
    setShowModal(false);
  };

  return (
    <div className="h-full flex flex-col glass-card p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>🏷️</span>
          <span>إدارة التصنيفات</span>
        </h2>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="btn-gold px-4 py-2"
        >
          ➕ تصنيف جديد
        </button>
      </div>

      <div className="bg-blue-600/10 border border-blue-400/30 p-3 rounded-lg mb-4">
        <div className="text-sm text-blue-400">
          💡 التصنيفات تظهر تلقائياً في كل أنحاء النظام (المخزون، المبيعات، التقارير)
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="glass-card p-4 animate-pulse">
                <div className="w-14 h-14 rounded-full bg-gray-700 mx-auto mb-3"></div>
                <div className="h-4 bg-gray-700 rounded w-2/3 mx-auto"></div>
              </div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            لا توجد تصنيفات مسجلة
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map(category => (
              <div
                key={category.id}
                className="glass-card p-4 hover:border-gold/50 transition-all cursor-pointer group"
                onClick={() => editCategory(category)}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="text-5xl">{category.icon || '📦'}</div>
                  <div className="text-center">
                    <h3 className="font-bold text-gold mb-1">{category.name}</h3>
                    <div className="text-xs text-gray-500">انقر للتعديل</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(category);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-400 text-sm"
                  >
                    🗑️ حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[600px] max-h-[90vh] overflow-y-auto scrollbar-thin">
            <h2 className="text-2xl font-bold text-gold mb-4">
              {editingCategory ? 'تعديل التصنيف' : 'تصنيف جديد'}
            </h2>
            <div className="space-y-4 mb-6">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">اسم التصنيف *</label>
                <input
                  type="text"
                  placeholder="مثال: عطور نسائية، عطور رجالية..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm text-gray-400 mb-2 block">الأيقونة</label>
                <div className="bg-gray-800 p-4 rounded-lg mb-3 flex items-center justify-center">
                  <div className="text-6xl">{icon}</div>
                </div>
                <div className="grid grid-cols-8 gap-2">
                  {predefinedIcons.map((emoji, index) => (
                    <button
                      key={index}
                      onClick={() => setIcon(emoji)}
                      className={`text-3xl p-2 rounded-lg transition-all ${
                        icon === emoji
                          ? 'bg-gold/20 border-2 border-gold scale-110'
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="أو أدخل رمز emoji مخصص..."
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg border border-gold/30 text-center text-2xl"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={saveCategory}
                disabled={saving}
                className="flex-1 btn-gold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '⏳ جاري الحفظ...' : (editingCategory ? '✅ تحديث' : '✅ حفظ')}
              </button>
              <button
                onClick={resetForm}
                className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg font-bold hover:bg-gray-600"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        open={!!pendingDelete}
        title="حذف التصنيف"
        icon="🗑️"
        message={pendingDelete
          ? `هل أنت متأكد من حذف التصنيف "${pendingDelete.name}"؟`
          : ''}
        confirmLabel="🗑️ حذف"
        cancelLabel="إلغاء"
        onConfirm={deleteCategory}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};

export default CategoriesModule;
