// ============================================================================
// ALDAFFA PERFUMES ERP — MOBILE COMPANION APP LOGIC
// ============================================================================

const state = {
  products: [],
  categories: [],
  cart: [],
  activeCategory: 'all',
  selectedPaymentType: 'cash',
  user: {
    fullName: 'المدير العام',
    role: 'manager',
    permissions: {}
  },
  sessionToken: '',
  pairingToken: new URLSearchParams(window.location.search).get('token') || '',
  cameraStream: null,
  isScanning: false,
  scannedProduct: null
};

// Sound effects using Web Audio API
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playBeep(freq = 1200, duration = 0.08) {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
    if ('vibrate' in navigator) navigator.vibrate(50);
  } catch (e) {}
}

// ----------------------------------------------------
// API REQUEST HELPER
// ----------------------------------------------------
async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Pairing-Token': state.pairingToken,
    'Authorization': state.sessionToken ? `Bearer ${state.sessionToken}` : '',
    ...(options.headers || {})
  };
  const res = await fetch(path, { ...options, headers });
  return await res.json();
}

// ----------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();
  setupNavigation();
  setupEventListeners();
  await loadProducts();
  await loadDashboard();
});

// ----------------------------------------------------
// NAVIGATION ROUTER
// ----------------------------------------------------
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const views = ['viewPOS', 'viewStocktaking', 'viewDashboard', 'viewSettings'];

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active-nav-tab', 'text-[#fbbf24]'));
      tabs.forEach(t => t.classList.add('text-[#768390]'));
      tab.classList.add('active-nav-tab', 'text-[#fbbf24]');
      tab.classList.remove('text-[#768390]');

      const targetId = tab.dataset.target;
      views.forEach(v => {
        const el = document.getElementById(v);
        if (el) el.classList.toggle('hidden', v !== targetId);
      });

      if (targetId === 'viewStocktaking') {
        startCameraScanner();
      } else {
        stopCameraScanner();
      }

      if (targetId === 'viewDashboard') {
        loadDashboard();
      }
    });
  });
}

// ----------------------------------------------------
// PRODUCTS & POS RENDER
// ----------------------------------------------------
async function loadProducts() {
  try {
    const res = await api('/api/products');
    if (res.success) {
      state.products = res.products || [];
      state.categories = res.categories || [];
      renderCategories();
      renderProducts();
    }
  } catch (err) {
    console.error('Failed to load products:', err);
  }
}

function renderCategories() {
  const container = document.getElementById('categoriesList');
  if (!container) return;

  container.innerHTML = `
    <button class="category-pill whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
      state.activeCategory === 'all' ? 'bg-[#fbbf24] text-[#0d1117]' : 'bg-[#161b22] text-[#adbac7] border border-white/5'
    }" data-cat="all">الكل</button>
  `;

  state.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `category-pill whitespace-nowrap px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
      state.activeCategory === cat.id ? 'bg-[#fbbf24] text-[#0d1117]' : 'bg-[#161b22] text-[#adbac7] border border-white/5'
    }`;
    btn.textContent = cat.name;
    btn.dataset.cat = cat.id;
    btn.addEventListener('click', () => {
      state.activeCategory = cat.id;
      renderCategories();
      renderProducts();
    });
    container.appendChild(btn);
  });

  const allBtn = container.querySelector('[data-cat="all"]');
  if (allBtn) {
    allBtn.addEventListener('click', () => {
      state.activeCategory = 'all';
      renderCategories();
      renderProducts();
    });
  }
}

function renderProducts() {
  const grid = document.getElementById('productsGrid');
  const query = (document.getElementById('inputSearchProduct')?.value || '').trim().toLowerCase();
  if (!grid) return;

  const filtered = state.products.filter(p => {
    const matchCat = state.activeCategory === 'all' || p.category_id === state.activeCategory;
    const matchQuery = !query || p.name.toLowerCase().includes(query) || (p.barcode && p.barcode.includes(query));
    return matchCat && matchQuery;
  });

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="col-span-2 text-center py-10 text-[#768390] text-xs">
        <i data-lucide="package-search" class="w-8 h-8 mx-auto mb-2 opacity-50"></i>
        لم يتم العثور على منتجات مطابقة
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="glass-card p-3 flex flex-col justify-between space-y-2 hover:border-[#fbbf24]/30 transition-all cursor-pointer select-none active:scale-[0.98]" onclick="addToCart('${p.id}')">
      <div>
        <div class="flex items-start justify-between gap-1 mb-1">
          <span class="text-[9px] font-mono text-[#768390]">${p.barcode || '—'}</span>
          <span class="text-[9px] px-1.5 py-0.5 rounded ${p.stock_quantity <= (p.min_stock_alert || 5) ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'} font-bold">
            ${p.stock_quantity} ${p.unit || 'قطعة'}
          </span>
        </div>
        <h4 class="text-xs font-bold text-[#e6edf3] line-clamp-2 leading-tight">${p.name}</h4>
      </div>

      <div class="flex items-center justify-between pt-1 border-t border-white/5">
        <span class="text-xs font-black text-[#fbbf24]">${Number(p.price).toFixed(2)} ر.س</span>
        <button class="w-6 h-6 rounded-lg bg-[#fbbf24]/15 border border-[#fbbf24]/30 text-[#fbbf24] flex items-center justify-center text-xs font-bold">
          +
        </button>
      </div>
    </div>
  `).join('');

  if (window.lucide) window.lucide.createIcons();
}

// ----------------------------------------------------
// CART MANAGEMENT
// ----------------------------------------------------
window.addToCart = function(productId, qty = 1) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  const existing = state.cart.find(c => c.productId === productId);
  if (existing) {
    existing.quantity += qty;
  } else {
    state.cart.push({
      productId: prod.id,
      name: prod.name,
      unitPrice: prod.price,
      costPrice: prod.cost_price || 0,
      quantity: qty
    });
  }

  playBeep(1400, 0.05);
  updateCartUI();
};

function updateCartUI() {
  const badge = document.getElementById('cartBadge');
  const list = document.getElementById('cartItemsList');
  const totalEl = document.getElementById('cartTotalAmount');

  const totalCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = state.cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  if (badge) badge.textContent = totalCount;
  if (totalEl) totalEl.textContent = `${totalAmount.toFixed(2)} ر.س`;

  if (list) {
    if (!state.cart.length) {
      list.innerHTML = `<div class="text-center py-8 text-xs text-[#768390]">السلة فارغة</div>`;
      return;
    }

    list.innerHTML = state.cart.map((item, idx) => `
      <div class="p-2.5 bg-[#0d1117] rounded-xl border border-white/5 flex items-center justify-between gap-2 text-xs">
        <div class="flex-1 min-w-0">
          <div class="font-bold text-[#e6edf3] truncate">${item.name}</div>
          <div class="text-[10px] text-[#fbbf24]">${Number(item.unitPrice).toFixed(2)} ر.س × ${item.quantity}</div>
        </div>

        <div class="flex items-center gap-1.5">
          <button class="w-6 h-6 rounded bg-[#161b22] text-rose-400 font-bold flex items-center justify-center" onclick="changeCartQty(${idx}, -1)">-</button>
          <span class="w-6 text-center font-bold text-xs">${item.quantity}</span>
          <button class="w-6 h-6 rounded bg-[#161b22] text-emerald-400 font-bold flex items-center justify-center" onclick="changeCartQty(${idx}, 1)">+</button>
        </div>
      </div>
    `).join('');
  }
}

window.changeCartQty = function(index, delta) {
  if (!state.cart[index]) return;
  state.cart[index].quantity += delta;
  if (state.cart[index].quantity <= 0) {
    state.cart.splice(index, 1);
  }
  updateCartUI();
};

// ----------------------------------------------------
// CAMERA BARCODE SCANNER (BARCODE DETECTOR / HTML5)
// ----------------------------------------------------
async function startCameraScanner() {
  const video = document.getElementById('cameraPreview');
  const statusEl = document.getElementById('cameraStatus');
  if (!video) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    state.cameraStream = stream;
    video.srcObject = stream;
    await video.play();
    state.isScanning = true;
    if (statusEl) statusEl.textContent = 'الكاميرا جاهزة — امسح الباركود';

    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: ['code_128', 'ean_13', 'ean_8', 'qr_code'] });
      scanLoop(detector, video);
    } else {
      if (statusEl) statusEl.textContent = 'قارئ الباركود النشط قيد التشغيل';
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'تعذر تشغيل الكاميرا: ' + err.message;
  }
}

async function scanLoop(detector, video) {
  if (!state.isScanning) return;
  try {
    const barcodes = await detector.detect(video);
    if (barcodes.length > 0) {
      const code = barcodes[0].rawValue;
      handleBarcodeDetected(code);
    }
  } catch (e) {}
  if (state.isScanning) {
    requestAnimationFrame(() => scanLoop(detector, video));
  }
}

function stopCameraScanner() {
  state.isScanning = false;
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach(t => t.stop());
    state.cameraStream = null;
  }
}

function handleBarcodeDetected(barcode) {
  const prod = state.products.find(p => p.barcode === barcode);
  if (prod) {
    playBeep(1800, 0.08);
    state.scannedProduct = prod;
    
    // Show in Stocktaking Card
    const card = document.getElementById('scannedProductCard');
    if (card) {
      card.classList.remove('hidden');
      document.getElementById('scannedBarcode').textContent = prod.barcode;
      document.getElementById('scannedName').textContent = prod.name;
      document.getElementById('scannedPrice').textContent = `السعر: ${Number(prod.price).toFixed(2)} ر.س`;
      document.getElementById('scannedCurrentStock').textContent = prod.stock_quantity;
      document.getElementById('inputNewStockQty').value = prod.stock_quantity;
    }
  }
}

// ----------------------------------------------------
// EXECUTIVE DASHBOARD LOADER
// ----------------------------------------------------
async function loadDashboard() {
  try {
    const res = await api('/api/dashboard/stats');
    if (res.success) {
      const { stats, topProducts } = res;
      document.getElementById('dashRevenue').textContent = `${Number(stats.revenue).toFixed(2)} ر.س`;
      document.getElementById('dashInvoices').textContent = `${stats.invoices} فاتورة`;
      document.getElementById('dashCashDrawer').textContent = `${Number(stats.cashDrawer).toFixed(2)} ر.س`;

      const list = document.getElementById('dashTopProductsList');
      if (list) {
        if (!topProducts || !topProducts.length) {
          list.innerHTML = `<div class="text-center py-4 text-[10px] text-[#768390]">لا توجد مبيعات مسجلة اليوم</div>`;
          return;
        }

        list.innerHTML = topProducts.map((p, idx) => `
          <div class="flex items-center justify-between p-2 bg-[#0d1117] rounded-xl border border-white/5 text-[11px]">
            <div class="flex items-center gap-2">
              <span class="w-4 h-4 rounded-full bg-[#fbbf24]/20 text-[#fbbf24] font-bold text-[9px] flex items-center justify-center">${idx + 1}</span>
              <span class="font-bold text-[#e6edf3]">${p.name}</span>
            </div>
            <span class="font-mono text-[#fbbf24]">${p.qtySold} مبيعة</span>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Failed to load dashboard:', e);
  }
}

// ----------------------------------------------------
// EVENT LISTENERS SETUP
// ----------------------------------------------------
function setupEventListeners() {
  // Search
  document.getElementById('inputSearchProduct')?.addEventListener('input', renderProducts);

  // Cart Drawer Open/Close
  document.getElementById('btnOpenCart')?.addEventListener('click', () => {
    document.getElementById('cartDrawer')?.classList.remove('hidden');
  });
  document.getElementById('btnCloseCart')?.addEventListener('click', () => {
    document.getElementById('cartDrawer')?.classList.add('hidden');
  });

  // Scanner trigger button
  document.getElementById('btnScannerTrigger')?.addEventListener('click', () => {
    const stockTab = document.querySelector('[data-target="viewStocktaking"]');
    if (stockTab) stockTab.click();
  });

  // Payment Type Selector
  document.querySelectorAll('.pay-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-type-btn').forEach(b => {
        b.classList.remove('border-[#fbbf24]', 'bg-[#fbbf24]/10', 'text-[#fbbf24]');
        b.classList.add('border-white/10', 'bg-[#0d1117]', 'text-[#adbac7]');
      });
      btn.classList.add('border-[#fbbf24]', 'bg-[#fbbf24]/10', 'text-[#fbbf24]');
      btn.classList.remove('border-white/10', 'bg-[#0d1117]', 'text-[#adbac7]');
      state.selectedPaymentType = btn.dataset.type;
    });
  });

  // Complete Checkout Button
  document.getElementById('btnCompleteCheckout')?.addEventListener('click', async () => {
    if (!state.cart.length) return alert('السلة فارغة!');

    const totalAmount = state.cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const customerName = document.getElementById('inputCustomerName')?.value || 'زبون جوال';

    const payload = {
      items: state.cart,
      totalAmount,
      paymentType: state.selectedPaymentType,
      customerName
    };

    try {
      const res = await api('/api/pos/checkout', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res.success) {
        playBeep(2000, 0.15);
        alert(`تم إتمام الفاتورة ${res.invoiceId} بنجاح!`);
        state.cart = [];
        updateCartUI();
        document.getElementById('cartDrawer')?.classList.add('hidden');
        await loadProducts();
        await loadDashboard();
      } else {
        alert('فشل حفظ الفاتورة: ' + (res.error || 'خطأ غير معروف'));
      }
    } catch (err) {
      alert('خطأ أثناء إرسال الفاتورة: ' + err.message);
    }
  });

  // Stock Audit Increment/Decrement
  document.getElementById('btnIncrementStock')?.addEventListener('click', () => {
    const input = document.getElementById('inputNewStockQty');
    if (input) input.value = Number(input.value || 0) + 1;
  });
  document.getElementById('btnDecrementStock')?.addEventListener('click', () => {
    const input = document.getElementById('inputNewStockQty');
    if (input) input.value = Math.max(0, Number(input.value || 0) - 1);
  });

  // Save Stock Audit
  document.getElementById('btnSaveStockAudit')?.addEventListener('click', async () => {
    if (!state.scannedProduct) return;
    const newQty = Number(document.getElementById('inputNewStockQty')?.value);

    try {
      const res = await api('/api/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({
          productId: state.scannedProduct.id,
          newQuantity: newQty
        })
      });

      if (res.success) {
        playBeep(1600, 0.1);
        alert(`تم تحديث رصيد ${res.productName} إلى ${res.newQuantity}`);
        document.getElementById('scannedCurrentStock').textContent = res.newQuantity;
        await loadProducts();
      }
    } catch (err) {
      alert('خطأ أثناء تحديث الرصيد: ' + err.message);
    }
  });

  // User PIN Login
  document.getElementById('btnLoginPin')?.addEventListener('click', async () => {
    const pin = document.getElementById('inputUserPin')?.value;
    if (!pin) return alert('الرجاء كتابة رمز PIN');

    try {
      const res = await api('/api/auth/pin', {
        method: 'POST',
        body: JSON.stringify({ pin })
      });

      if (res.success) {
        state.sessionToken = res.sessionToken;
        state.user = res.user;
        document.getElementById('activeUserName').textContent = res.user.fullName || res.user.username;
        document.getElementById('activeUserRole').textContent = `الدور: ${res.user.role}`;
        alert('تم تسجيل الدخول بنجاح');
      } else {
        alert('فشل الدخول: ' + res.error);
      }
    } catch (e) {
      alert('خطأ أثناء تسجيل الدخول: ' + e.message);
    }
  });
}
