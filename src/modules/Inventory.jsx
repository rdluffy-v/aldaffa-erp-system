import React, { useState, useEffect } from 'react';
import { db, generateId, formatCurrency } from '../db';

const InventoryModule = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterLowStock, setFilterLowStock] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    qty: 0,
    cost: 0,
    price: 0,
    wholesale_price: 0,
    unit: 'piece',
    capacity: 0
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    const data = await db.query('SELECT * FROM inventory ORDER BY name');
    setProducts(data);
  };

  const addProduct = async () => {
    if (!formData.name.trim()) {
      alert('يرجى إدخال اسم المنتج');
      return;
    }

    try {
      const id = generateId();
      await db.run(
        `INSERT INTO inventory (id, name, category, qty, cost, price, wholesale_price, unit, capacity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          formData.name.trim(),
          formData.category,
          formData.qty,
          formData.cost,
          formData.price,
          formData.wholesale_price,
          formData.unit,
          formData.capacity
        ]
      );

      setFormData({
        name: '',
        category: '',
        qty: 0,
        cost: 0,
        price: 0,
        wholesale_price: 0,
        unit: 'piece',
        capacity: 0
      });
      setShowAddProduct(false);
      loadProducts();

      alert('✅ تم إضافة المنتج بنجاح');
    } catch (error) {
      alert('خطأ في إضافة المنتج: ' + error.message);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full flex flex-col glass-card p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gold flex items-center gap-2">
          <span>📦</span>
          <span>المخزون</span>
        </h2>
        <button
          onClick={() => setShowAddProduct(true)}
          className="btn-gold px-4 py-2"
        >
          ➕ منتج جديد
        </button>
      </div>

      <input
        type="text"
        placeholder="🔍 بحث..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30 focus:outline-none focus:border-gold mb-4"
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <table className="w-full">
          <thead className="bg-gray-800 sticky top-0">
            <tr>
              <th className="text-right p-3 text-gold">المنتج</th>
              <th className="text-right p-3 text-gold">الفئة</th>
              <th className="text-right p-3 text-gold">الكمية</th>
              <th className="text-right p-3 text-gold">التكلفة</th>
              <th className="text-right p-3 text-gold">سعر التجزئة</th>
              <th className="text-right p-3 text-gold">سعر الجملة</th>
              <th className="text-right p-3 text-gold">السعة</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(product => (
              <tr key={product.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                <td className="p-3 font-bold">{product.name}</td>
                <td className="p-3 text-gray-400">{product.category || '-'}</td>
                <td className="p-3">
                  <span className={product.qty <= 10 ? 'text-red-400' : 'text-green-400'}>
                    {product.qty} {product.unit}
                  </span>
                </td>
                <td className="p-3">{formatCurrency(product.cost)}</td>
                <td className="p-3 font-bold text-gold">{formatCurrency(product.price)}</td>
                <td className="p-3">{formatCurrency(product.wholesale_price)}</td>
                <td className="p-3 text-gray-400">
                  {product.capacity > 0 ? `${product.capacity}ml` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAddProduct && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" dir="rtl">
          <div className="glass-card p-6 w-[600px] max-h-[90vh] overflow-y-auto scrollbar-thin">
            <h2 className="text-2xl font-bold text-gold mb-4">إضافة منتج جديد</h2>
            <div className="space-y-3 mb-6">
              <input
                type="text"
                placeholder="اسم المنتج *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                autoFocus
              />
              <input
                type="text"
                placeholder="الفئة"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="الكمية"
                  value={formData.qty}
                  onChange={(e) => setFormData({ ...formData, qty: parseFloat(e.target.value) || 0 })}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                  step="0.1"
                />
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                >
                  <option value="piece">قطعة</option>
                  <option value="bottle">زجاجة</option>
                  <option value="box">علبة</option>
                  <option value="ml">مل</option>
                </select>
              </div>
              <input
                type="number"
                placeholder="التكلفة"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                step="0.01"
              />
              <input
                type="number"
                placeholder="سعر التجزئة"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                step="0.01"
              />
              <input
                type="number"
                placeholder="سعر الجملة"
                value={formData.wholesale_price}
                onChange={(e) => setFormData({ ...formData, wholesale_price: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                step="0.01"
              />
              <input
                type="number"
                placeholder="السعة (ml) - للعطور"
                value={formData.capacity}
                onChange={(e) => setFormData({ ...formData, capacity: parseFloat(e.target.value) || 0 })}
                className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg border border-gold/30"
                step="1"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={addProduct}
                className="flex-1 btn-gold py-3"
              >
                ✅ حفظ
              </button>
              <button
                onClick={() => {
                  setShowAddProduct(false);
                  setFormData({
                    name: '',
                    category: '',
                    qty: 0,
                    cost: 0,
                    price: 0,
                    wholesale_price: 0,
                    unit: 'piece',
                    capacity: 0
                  });
                }}
                className="flex-1 bg-gray-700 text-white px-4 py-3 rounded-lg font-bold hover:bg-gray-600"
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

export default InventoryModule;
