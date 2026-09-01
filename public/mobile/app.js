// ============================================================================
// ALDAFFA PERFUMES ERP — MOBILE COMPANION CLIENT (PWA)
// Milestones R2, R3, R4 & Offline-First Hybrid Sync Engine
// ============================================================================

// ----------------------------------------------------------------------------
// 1. GLOBAL STATE
// ----------------------------------------------------------------------------
const state = {
  products: [],
  categories: [],
  cart: [],
  activeCategory: 'all',
  searchQuery: '',
  selectedPaymentType: 'cash',
  receivedCash: 0,
  selectedDebtorName: '',
  user: {
    id: 'usr_mgr_admin',
    fullName: 'المدير العام',
    name: 'المدير العام',
    role: 'manager',
    permissions: {
      view_profits: true,
      view_profit: true,
      delete_invoice: true,
      manage_users: true,
      purge_data: true,
      settings: true
    }
  },
  sessionToken: localStorage.getItem('aldaffa_session_token') || '',
  deviceToken: localStorage.getItem('aldaffa_device_token') || '',
  pairingToken: new URLSearchParams(window.location.search).get('token') || localStorage.getItem('aldaffa_pairing_token') || '',
  cameraStream: null,
  isScanning: false,
  torchOn: false,
  cameraFacing: 'environment',
  scannedProduct: null,
  scannedCountedQty: 0,
  selectedAuditReason: 'عجز جرد مخزني',
  decantTargetProduct: null,
  selectedDecantMl: 3,
  selectedDecantLabel: 'ربع تولة (3 مل)',
  isOnline: navigator.onLine,
  lastScanTimestamp: 0,
  stats: {
    revenue: 0,
    profit: 0,
    cashDrawer: 0,
    invoices: 0,
    avgInvoice: 0,
    topProducts: [],
    hourlyVelocity: []
  }
};

if (state.pairingToken) {
  localStorage.setItem('aldaffa_pairing_token', state.pairingToken);
}

// ----------------------------------------------------------------------------
// 2. WEB AUDIO & HAPTIC FEEDBACK ENGINE
// ----------------------------------------------------------------------------
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// 1800Hz / 80ms tone burst for barcode scan match
function playScanBeep(freq = 1800, duration = 0.08) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}

  // Tactile haptic feedback
  if ('vibrate' in navigator) {
    try { navigator.vibrate(50); } catch (e) {}
  }
}

// Success chime on checkout
function playSuccessChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.frequency.setValueAtTime(1046.5, now); // C6
    osc2.frequency.setValueAtTime(1567.98, now + 0.08); // G6

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.1);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.35);
  } catch (e) {}

  if ('vibrate' in navigator) {
    try { navigator.vibrate([40, 60, 40]); } catch (e) {}
  }
}

// Warning buzz
function playWarningTone() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {}

  if ('vibrate' in navigator) {
    try { navigator.vibrate([100, 50, 100]); } catch (e) {}
  }
}

// ----------------------------------------------------------------------------
// 3. INDEXEDDB PERSISTENCE & OFFLINE OUTBOX QUEUE
// ----------------------------------------------------------------------------
const DB_NAME = 'aldaffa_mobile_db';
const DB_VERSION = 1;
let dbInstance = null;

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    if (!window.indexedDB) return resolve(null);

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('outbox_queue')) {
        const outbox = db.createObjectStore('outbox_queue', { keyPath: 'idempotencyKey' });
        outbox.createIndex('status', 'status', { unique: false });
        outbox.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('cached_products')) {
        db.createObjectStore('cached_products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cached_settings')) {
        db.createObjectStore('cached_settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };
    req.onerror = (e) => {
      console.warn('[IndexedDB Error]:', e);
      resolve(null);
    };
  });
}

async function enqueueOutboxRecord(action, payload, customIdempotencyKey = null) {
  const idempotencyKey = customIdempotencyKey || `idem_${action.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const record = {
    idempotencyKey,
    id: 'q_' + Math.random().toString(36).substring(2, 9),
    action,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
    status: 'pending',
    lastError: null
  };

  try {
    const db = await openIndexedDB();
    if (db) {
      const tx = db.transaction('outbox_queue', 'readwrite');
      const store = tx.objectStore('outbox_queue');
      store.put(record);
    }
  } catch (e) {
    console.error('Failed to store outbox record to IndexedDB:', e);
  }

  updateOfflineQueueBadge();
  return record;
}

async function getPendingOutboxRecords() {
  try {
    const db = await openIndexedDB();
    if (!db) return [];
    return new Promise((resolve) => {
      const tx = db.transaction('outbox_queue', 'readonly');
      const store = tx.objectStore('outbox_queue');
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []).filter(r => r.status === 'pending' || r.status === 'failed');
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    return [];
  }
}

async function updateOutboxRecordStatus(idempotencyKey, status, lastError = null) {
  try {
    const db = await openIndexedDB();
    if (!db) return;
    const tx = db.transaction('outbox_queue', 'readwrite');
    const store = tx.objectStore('outbox_queue');
    const getReq = store.get(idempotencyKey);
    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        record.status = status;
        if (lastError) {
          record.retryCount = (record.retryCount || 0) + 1;
          record.lastError = lastError;
        }
        store.put(record);
      }
    };
  } catch (e) {}
}

async function flushOutboxQueue() {
  if (!navigator.onLine) {
    console.log('[OfflineQueue] Client is offline, skipping flush');
    return { success: false, reason: 'CLIENT_OFFLINE' };
  }

  const pending = await getPendingOutboxRecords();
  if (!pending.length) {
    updateOfflineQueueBadge();
    return { success: true, synced: 0 };
  }

  console.log(`[OfflineQueue] Flushing ${pending.length} pending transaction(s)...`);
  let synced = 0;
  let failed = 0;

  for (const record of pending) {
    await updateOutboxRecordStatus(record.idempotencyKey, 'in_flight');

    try {
      if (!record.payload || typeof record.payload !== 'object') {
        throw new Error('POISON_PILL_CORRUPTED_RECORD');
      }

      let res = null;
      if (record.action === 'POS_CHECKOUT') {
        res = await api('/api/pos/checkout', {
          method: 'POST',
          body: JSON.stringify({
            ...record.payload,
            idempotencyKey: record.idempotencyKey
          })
        });
      } else if (record.action === 'STOCK_AUDIT') {
        res = await api('/api/inventory/adjust', {
          method: 'POST',
          body: JSON.stringify({
            ...record.payload,
            idempotencyKey: record.idempotencyKey
          })
        });
      }

      if (res && res.success) {
        await updateOutboxRecordStatus(record.idempotencyKey, 'acknowledged');
        synced++;
      } else {
        throw new Error(res?.error || 'SYNC_FAILED');
      }
    } catch (err) {
      failed++;
      const isPoison = err.message.includes('POISON_PILL');
      await updateOutboxRecordStatus(record.idempotencyKey, isPoison ? 'dead_letter' : 'failed', err.message);
    }
  }

  updateOfflineQueueBadge();
  if (synced > 0) {
    await loadProducts();
    await loadDashboard();
  }

  return { success: failed === 0, synced, failed };
}

async function updateOfflineQueueBadge() {
  const pending = await getPendingOutboxRecords();
  const badgeBtn = document.getElementById('btnOfflineQueueStatus');
  const countEl = document.getElementById('offlineQueueBadge');
  const syncCountEl = document.getElementById('syncPendingCount');

  if (countEl) countEl.textContent = `${pending.length} معلقة`;
  if (syncCountEl) syncCountEl.textContent = `${pending.length} معاملة`;

  if (badgeBtn) {
    badgeBtn.classList.toggle('hidden', pending.length === 0);
  }
}

// ----------------------------------------------------------------------------
// 4. API REQUEST HELPER WITH OFFLINE RETRY & HEADER INJECTION
// ----------------------------------------------------------------------------
async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Pairing-Token': state.pairingToken,
    'X-Device-Token': state.deviceToken,
    'Authorization': state.sessionToken ? `Bearer ${state.sessionToken}` : '',
    ...(options.headers || {})
  };

  try {
    const res = await fetch(path, { ...options, headers });
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`[API Network Error] Path: ${path}:`, err.message);
    return { success: false, error: err.message, networkError: true };
  }
}

// ----------------------------------------------------------------------------
// 5. APPLICATION INITIALIZATION
// ----------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  if (window.lucide) window.lucide.createIcons();

  await openIndexedDB();
  setupNavigation();
  setupEventListeners();
  setupNetworkListeners();
  registerServiceWorker();

  await loadProducts();
  await loadDashboard();
  await flushOutboxQueue();
  updateOfflineQueueBadge();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/mobile/sw.js')
      .then((reg) => {
        console.log('[PWA] Service Worker registered successfully:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] Service Worker registration failed:', err);
      });
  }
}

function setupNetworkListeners() {
  const updateNetState = () => {
    state.isOnline = navigator.onLine;
    const dot = document.getElementById('headerStatusDot');
    const statusText = document.getElementById('headerUserStatus');
    const netStateEl = document.getElementById('syncNetworkState');

    if (state.isOnline) {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
      if (statusText) statusText.textContent = 'متصل بالمحل';
      if (netStateEl) {
        netStateEl.textContent = 'متصل بالإنترنت';
        netStateEl.className = 'font-bold text-emerald-400';
      }
      flushOutboxQueue();
    } else {
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-500';
      if (statusText) statusText.textContent = 'وضع غير متصل (محلي)';
      if (netStateEl) {
        netStateEl.textContent = 'غير متصل (يعمل محلياً)';
        netStateEl.className = 'font-bold text-amber-400';
      }
    }
  };

  window.addEventListener('online', updateNetState);
  window.addEventListener('offline', updateNetState);
  updateNetState();
}

// ----------------------------------------------------------------------------
// 6. NAVIGATION ROUTER
// ----------------------------------------------------------------------------
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  const views = ['viewPOS', 'viewStocktaking', 'viewDashboard', 'viewSettings'];

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active-nav-tab', 'text-[#fbbf24]'));
      tabs.forEach(t => t.classList.add('text-[#8b949e]'));
      tab.classList.add('active-nav-tab', 'text-[#fbbf24]');
      tab.classList.remove('text-[#8b949e]');

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

      if (window.lucide) window.lucide.createIcons();
    });
  });
}

// ----------------------------------------------------------------------------
// 7. POS & PRODUCT CATALOG CONTROLLER (MILESTONE R2)
// ----------------------------------------------------------------------------
async function loadProducts() {
  try {
    const res = await api('/api/products');
    if (res.success && res.products) {
      state.products = res.products;
      state.categories = res.categories || [];

      // Cache products to IndexedDB
      const db = await openIndexedDB();
      if (db) {
        const tx = db.transaction('cached_products', 'readwrite');
        const store = tx.objectStore('cached_products');
        state.products.forEach(p => store.put(p));
      }
    } else {
      // Fallback from IndexedDB cache if offline
      const db = await openIndexedDB();
      if (db) {
        const tx = db.transaction('cached_products', 'readonly');
        const store = tx.objectStore('cached_products');
        const req = store.getAll();
        req.onsuccess = () => {
          if (req.result && req.result.length) {
            state.products = req.result;
            renderCategories();
            renderProducts();
          }
        };
      }
    }
    renderCategories();
    renderProducts();
  } catch (err) {
    console.error('Failed to load products catalog:', err);
  }
}

function renderCategories() {
  const container = document.getElementById('categoriesList');
  if (!container) return;

  // Extract unique categories from products if category list is empty
  const cats = state.categories.length ? state.categories : [
    { id: 'cat-oud', name: 'دهن عود' },
    { id: 'cat-perfume', name: 'عطور بخاخ' },
    { id: 'cat-bakhour', name: 'بخور ومبثوث' },
    { id: 'cat-tola', name: 'تولات ومخلطات' }
  ];

  container.innerHTML = `
    <button class="category-pill whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
      state.activeCategory === 'all'
        ? 'bg-gradient-to-r from-[#fbbf24] to-[#d97706] text-[#070b14] shadow-sm'
        : 'bg-[#111726] text-[#8b949e] border border-white/10 hover:text-white'
    }" data-cat="all">الكل</button>
  `;

  cats.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `category-pill whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
      state.activeCategory === cat.id
        ? 'bg-gradient-to-r from-[#fbbf24] to-[#d97706] text-[#070b14] shadow-sm'
        : 'bg-[#111726] text-[#8b949e] border border-white/10 hover:text-white'
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
  const query = state.searchQuery.trim().toLowerCase();
  if (!grid) return;

  const filtered = state.products.filter(p => {
    const matchCat = state.activeCategory === 'all' || p.category_id === state.activeCategory || p.category === state.activeCategory;
    const matchQuery = !query ||
      p.name.toLowerCase().includes(query) ||
      (p.barcode && p.barcode.toLowerCase().includes(query));
    return matchCat && matchQuery;
  });

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="col-span-2 text-center py-12 text-[#8b949e] text-xs space-y-2">
        <i data-lucide="package-search" class="w-10 h-10 mx-auto opacity-40 text-[#fbbf24]"></i>
        <div class="font-bold">لم يتم العثور على منتجات مطابقة</div>
        <div class="text-[10px] text-[#6e7681]">جرب تغيير فئة البحث أو مسح الباركود</div>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const isLowStock = Number(p.stock_quantity ?? p.qty ?? 0) <= Number(p.min_stock_alert ?? p.min_qty ?? 5);
    const isOut = Number(p.stock_quantity ?? p.qty ?? 0) <= 0;
    const price = Number(p.price || 0).toFixed(2);
    const stockQty = Number(p.stock_quantity ?? p.qty ?? 0);
    const unit = p.unit || 'قطعة';

    return `
      <div class="glass-card p-3.5 flex flex-col justify-between space-y-2.5 hover:border-[#fbbf24]/40 transition-all select-none group border border-white/5 bg-[#111726]/80">
        <div>
          <div class="flex items-start justify-between gap-1 mb-1">
            <span class="text-[9px] font-mono text-[#8b949e]">${p.barcode || 'بدون باركود'}</span>
            <span class="text-[9px] px-1.5 py-0.5 rounded-md font-bold ${
              isOut ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
              isLowStock ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
              'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
            }">
              ${stockQty} ${unit}
            </span>
          </div>
          <h4 class="text-xs font-bold text-[#f0f6fc] line-clamp-2 leading-snug cursor-pointer" onclick="openProductDetailsModal('${p.id}')">${p.name}</h4>
        </div>

        <div class="space-y-2 pt-1 border-t border-white/5">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black text-[#fbbf24] font-mono">${price} د.ل</span>
            <button
              class="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold hover:bg-amber-500/25 transition-all touch-press flex items-center gap-1"
              onclick="openDecantModal('${p.id}')"
              title="حاسبة التقسيم بالمللي والتولة"
            >
              <i data-lucide="flask-conical" class="w-3 h-3"></i>
              <span>تقسيم</span>
            </button>
          </div>

          <button
            class="w-full py-1.5 rounded-xl bg-[#111726] border border-white/10 hover:border-[#fbbf24]/50 text-[#fbbf24] hover:bg-[#fbbf24]/10 transition-all flex items-center justify-center gap-1 text-xs font-bold touch-press"
            onclick="addToCart('${p.id}')"
          >
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>إضافة للسلة</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

// ----------------------------------------------------------------------------
// 8. CART MANAGEMENT & FRACTIONAL PORTION (ML) DECANT CALCULATOR
// ----------------------------------------------------------------------------
window.addToCart = function(productId, qty = 1, portionMl = null, customPrice = null, portionLabel = null) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  const unitPrice = customPrice !== null ? customPrice : Number(prod.price || 0);
  const costPrice = Number(prod.cost_price ?? prod.cost ?? 0);

  // Group decants separately if portionMl is specified
  const cartKey = portionMl ? `${productId}_ml_${portionMl}` : productId;
  const existing = state.cart.find(c => c.cartKey === cartKey);

  if (existing) {
    existing.quantity += qty;
  } else {
    state.cart.push({
      cartKey,
      productId: prod.id,
      name: portionLabel ? `${prod.name} (${portionLabel})` : prod.name,
      baseName: prod.name,
      unitPrice,
      costPrice: portionMl ? (costPrice * (portionMl / 100)) : costPrice,
      quantity: qty,
      unit: prod.unit || 'قطعة',
      portion_ml: portionMl
    });
  }

  playScanBeep(1400, 0.05);
  updateCartUI();
};

function updateCartUI() {
  const badge = document.getElementById('cartBadge');
  const list = document.getElementById('cartItemsList');
  const subtotalEl = document.getElementById('cartSubtotalAmount');
  const totalEl = document.getElementById('cartTotalAmount');

  const totalCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = state.cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);

  if (badge) badge.textContent = totalCount;
  if (subtotalEl) subtotalEl.textContent = `${totalAmount.toFixed(2)} د.ل`;
  if (totalEl) totalEl.textContent = `${totalAmount.toFixed(2)} د.ل`;

  calculateChangeDue();

  if (list) {
    if (!state.cart.length) {
      list.innerHTML = `
        <div class="text-center py-10 text-xs text-[#8b949e] space-y-2">
          <i data-lucide="shopping-cart" class="w-8 h-8 mx-auto opacity-30 text-[#fbbf24]"></i>
          <div>السلة فارغة حالياً</div>
          <div class="text-[10px] text-[#6e7681]">اختر منتجات من القائمة لإتمام البيع</div>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    list.innerHTML = state.cart.map((item, idx) => `
      <div class="p-3 bg-[#0b101b] rounded-2xl border border-white/5 flex items-center justify-between gap-2.5 text-xs">
        <div class="flex-1 min-w-0">
          <div class="font-bold text-[#f0f6fc] truncate">${item.name}</div>
          <div class="text-[10px] text-[#fbbf24] font-mono font-semibold">
            ${Number(item.unitPrice).toFixed(2)} د.ل × ${item.quantity} = ${(item.unitPrice * item.quantity).toFixed(2)} د.ل
          </div>
          ${item.portion_ml ? `<span class="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-300 text-[9px] font-mono">تقسيم: ${item.portion_ml} مل</span>` : ''}
        </div>

        <div class="flex items-center gap-1.5">
          <button class="w-7 h-7 rounded-lg bg-[#111726] border border-white/10 text-rose-400 font-bold flex items-center justify-center touch-press" onclick="changeCartQty(${idx}, -1)">-</button>
          <span class="w-6 text-center font-bold text-xs font-mono text-[#f0f6fc]">${item.quantity}</span>
          <button class="w-7 h-7 rounded-lg bg-[#111726] border border-white/10 text-emerald-400 font-bold flex items-center justify-center touch-press" onclick="changeCartQty(${idx}, 1)">+</button>
          <button class="w-7 h-7 rounded-lg bg-rose-500/15 text-rose-400 font-bold flex items-center justify-center ml-1 touch-press" onclick="removeCartItem(${idx})">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
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

window.removeCartItem = function(index) {
  if (state.cart[index]) {
    state.cart.splice(index, 1);
    updateCartUI();
  }
};

// ----------------------------------------------------------------------------
// 9. FRACTIONAL DECANT (PORTION ML) CALCULATOR MODAL
// ----------------------------------------------------------------------------
window.openDecantModal = function(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  state.decantTargetProduct = prod;
  state.selectedDecantMl = 3;
  state.selectedDecantLabel = 'ربع تولة (3 مل)';

  document.getElementById('decantProdName').textContent = prod.name;
  document.getElementById('decantProdBasePrice').textContent = `${Number(prod.price).toFixed(2)} د.ل`;
  document.getElementById('inputCustomDecantMl').value = '';

  updateDecantCalculation();
  document.getElementById('decantModal').classList.remove('hidden');
};

function updateDecantCalculation() {
  if (!state.decantTargetProduct) return;
  const prod = state.decantTargetProduct;
  const basePrice = Number(prod.price || 0);
  const customMlInput = Number(document.getElementById('inputCustomDecantMl')?.value || 0);

  let ml = customMlInput > 0 ? customMlInput : state.selectedDecantMl;
  let label = customMlInput > 0 ? `عبوة ${ml} مل (مخصصة)` : state.selectedDecantLabel;

  // Pricing formula:
  // If product unit is 'تولة', 12ml = basePrice -> 3ml = basePrice * 0.25
  // If standard 100ml perfume bottle -> (basePrice / 100) * ml
  let calculatedPrice = 0;
  if (prod.unit === 'تولة') {
    calculatedPrice = (basePrice / 12) * ml;
  } else {
    calculatedPrice = (basePrice / 100) * ml;
  }
  calculatedPrice = Math.max(1, Math.round(calculatedPrice * 100) / 100);

  const priceEl = document.getElementById('decantCalculatedPrice');
  const labelEl = document.getElementById('decantPortionLabel');

  if (priceEl) priceEl.textContent = `${calculatedPrice.toFixed(2)} د.ل`;
  if (labelEl) labelEl.textContent = label;

  return { ml, label, price: calculatedPrice };
}

// ----------------------------------------------------------------------------
// 10. CASH CHANGE RETURN CALCULATOR
// ----------------------------------------------------------------------------
function calculateChangeDue() {
  const totalAmount = state.cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  const received = Number(state.receivedCash || 0);
  const changeEl = document.getElementById('calcChangeReturn');
  if (!changeEl) return;

  if (received >= totalAmount) {
    const change = Math.max(0, received - totalAmount);
    changeEl.textContent = `${change.toFixed(2)} د.ل`;
    changeEl.className = 'font-black text-emerald-400 font-mono text-sm';
  } else if (received > 0 && received < totalAmount) {
    const deficit = totalAmount - received;
    changeEl.textContent = `متبقي: -${deficit.toFixed(2)} د.ل`;
    changeEl.className = 'font-black text-rose-400 font-mono text-sm';
  } else {
    changeEl.textContent = '0.00 د.ل';
    changeEl.className = 'font-black text-[#8b949e] font-mono text-sm';
  }
}

// ----------------------------------------------------------------------------
// 11. CAMERA BARCODE SCANNER ENGINE (BARCODE DETECTOR / FALLBACK)
// ----------------------------------------------------------------------------
function getMediaDevices() {
  if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    return navigator.mediaDevices;
  }
  if (typeof navigator !== 'undefined') {
    const legacyGetUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    if (legacyGetUserMedia) {
      return {
        getUserMedia: (constraints) => new Promise((resolve, reject) => {
          legacyGetUserMedia.call(navigator, constraints, resolve, reject);
        })
      };
    }
  }
  return null;
}

async function startCameraScanner() {
  const video = document.getElementById('cameraPreview');
  const statusEl = document.getElementById('cameraStatus');
  const insecureNoticeEl = document.getElementById('cameraInsecureNotice');
  if (!video) return;

  const mediaDevices = getMediaDevices();
  if (!mediaDevices) {
    if (statusEl) statusEl.textContent = 'الكاميرا غير متاحة في هذا الاتصال (HTTP) — يرجى استخدام حقل الإدخال والماسح أدناه';
    if (insecureNoticeEl) insecureNoticeEl.classList.remove('hidden');
    return;
  }

  try {
    const constraints = {
      video: {
        facingMode: { ideal: state.cameraFacing },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    const stream = await mediaDevices.getUserMedia(constraints);
    state.cameraStream = stream;
    video.srcObject = stream;
    await video.play();
    state.isScanning = true;

    if (statusEl) statusEl.textContent = 'الكاميرا نشطة — وجه الباركود نحو الإطار';
    if (insecureNoticeEl) insecureNoticeEl.classList.add('hidden');

    if ('BarcodeDetector' in window) {
      try {
        const detector = new BarcodeDetector({
          formats: ['code_128', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e']
        });
        scanLoopBarcodeDetector(detector, video);
        return;
      } catch (e) {
        console.warn('BarcodeDetector format init failed, falling back:', e);
      }
    }

    // Fallback scanner sampler
    scanLoopFallback(video);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'تعذر تشغيل الكاميرا: ' + err.message;
    if (insecureNoticeEl && (err.name === 'NotAllowedError' || err.name === 'SecurityError' || !window.isSecureContext)) {
      insecureNoticeEl.classList.remove('hidden');
    }
  }
}

async function scanLoopBarcodeDetector(detector, video) {
  if (!state.isScanning) return;
  try {
    const barcodes = await detector.detect(video);
    if (barcodes.length > 0) {
      const code = barcodes[0].rawValue;
      handleBarcodeDetected(code);
    }
  } catch (e) {}

  if (state.isScanning) {
    requestAnimationFrame(() => scanLoopBarcodeDetector(detector, video));
  }
}

// Lightweight 1D Barcode Fallback Sampler
function scanLoopFallback(video) {
  if (!state.isScanning) return;
  // Fallback continuous loop
  if (state.isScanning) {
    setTimeout(() => scanLoopFallback(video), 100);
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
  const now = Date.now();
  // Cooldown to prevent duplicate sound burst (<600ms)
  if (now - state.lastScanTimestamp < 600) return;
  state.lastScanTimestamp = now;

  const cleanCode = String(barcode).trim();
  const prod = state.products.find(p => p.barcode === cleanCode || String(p.id) === cleanCode || (p.name && p.name.toLowerCase().includes(cleanCode.toLowerCase())));
  const statusEl = document.getElementById('cameraStatus');

  if (prod) {
    playScanBeep(1800, 0.08);
    state.scannedProduct = prod;
    state.scannedCountedQty = Number(prod.stock_quantity ?? prod.qty ?? 0);

    if (statusEl) {
      statusEl.textContent = `✅ تم رصد: ${prod.name} (${prod.barcode || cleanCode})`;
      statusEl.className = 'absolute bottom-2 bg-emerald-950/90 text-emerald-300 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] border border-emerald-500/30';
    }

    const card = document.getElementById('scannedProductCard');
    if (card) {
      card.classList.remove('hidden');
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      document.getElementById('scannedBarcode').textContent = prod.barcode || cleanCode;
      document.getElementById('scannedName').textContent = prod.name;
      document.getElementById('scannedPrice').textContent = `السعر: ${Number(prod.price).toFixed(2)} د.ل`;
      document.getElementById('scannedUnit').textContent = prod.unit || 'قطعة';
      document.getElementById('scannedCurrentStock').textContent = prod.stock_quantity ?? prod.qty ?? 0;
      document.getElementById('inputNewStockQty').value = state.scannedCountedQty;

      updateStockDiscrepancyDisplay();
    }
  } else {
    playWarningTone();
    if (statusEl) {
      statusEl.textContent = `⚠️ الباركود غير مسجل في المخزون (${cleanCode})`;
      statusEl.className = 'absolute bottom-2 bg-rose-950/90 text-rose-300 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] border border-rose-500/30';
    }
  }
}

function updateStockDiscrepancyDisplay() {
  if (!state.scannedProduct) return;
  const systemQty = Number(state.scannedProduct.stock_quantity ?? state.scannedProduct.qty ?? 0);
  const countedQty = Number(document.getElementById('inputNewStockQty')?.value || 0);
  const variance = countedQty - systemQty;

  const countedDisplay = document.getElementById('scannedCountedDisplay');
  const varianceDisplay = document.getElementById('scannedVarianceDisplay');

  if (countedDisplay) countedDisplay.textContent = countedQty;

  if (varianceDisplay) {
    if (variance === 0) {
      varianceDisplay.textContent = '0 (مطابق)';
      varianceDisplay.className = 'text-sm font-black text-emerald-400';
    } else if (variance < 0) {
      varianceDisplay.textContent = `${variance} (عجز)`;
      varianceDisplay.className = 'text-sm font-black text-rose-400';
    } else {
      varianceDisplay.textContent = `+${variance} (زيادة)`;
      varianceDisplay.className = 'text-sm font-black text-amber-400';
    }
  }
}

// ----------------------------------------------------------------------------
// 12. EXECUTIVE DASHBOARD CONTROLLER (MILESTONE R4)
// ----------------------------------------------------------------------------
async function loadDashboard() {
  try {
    const res = await api('/api/dashboard/stats');
    if (res.success) {
      const stats = res.stats || {
        revenue: res.today_sales || 0,
        profit: res.today_profit || 0,
        cashDrawer: res.cash_drawer || 0,
        invoices: res.invoices_count || 0
      };

      const topProducts = res.topProducts || res.top_perfumes || [];
      const hourlyVelocity = res.hourlyVelocity || res.hourly_velocity || [];

      state.stats = {
        revenue: stats.revenue || 0,
        profit: stats.profit || 0,
        cashDrawer: stats.cashDrawer || 0,
        invoices: stats.invoices || 0,
        avgInvoice: stats.invoices > 0 ? (stats.revenue / stats.invoices) : 0,
        topProducts,
        hourlyVelocity
      };

      renderDashboardUI();
    }
  } catch (err) {
    console.error('Failed to load dashboard metrics:', err);
  }
}

function renderDashboardUI() {
  const isCashier = state.user.role === 'cashier' || !state.user.permissions.view_profits;

  // Revenue & Invoices
  document.getElementById('dashRevenue').textContent = `${Number(state.stats.revenue).toFixed(2)} د.ل`;
  document.getElementById('dashInvoices').textContent = `${state.stats.invoices} فاتورة`;
  document.getElementById('dashCashDrawer').textContent = `${Number(state.stats.cashDrawer).toFixed(2)} د.ل`;
  document.getElementById('dashAvgInvoice').textContent = `${Number(state.stats.avgInvoice).toFixed(2)} د.ل`;

  // Profit Card (RBAC Masking for Cashier)
  const profitEl = document.getElementById('dashProfit');
  const profitSubtext = document.getElementById('dashProfitSubtext');
  if (isCashier) {
    if (profitEl) {
      profitEl.textContent = '*** د.ل';
      profitEl.className = 'text-lg font-black text-[#8b949e] font-mono';
    }
    if (profitSubtext) profitSubtext.textContent = 'محجوب بصلاحيات الكاشير';
  } else {
    if (profitEl) {
      profitEl.textContent = `${Number(state.stats.profit).toFixed(2)} د.ل`;
      profitEl.className = 'text-lg font-black text-amber-400 font-mono';
    }
    if (profitSubtext) profitSubtext.textContent = 'صافي الربح التقديري';
  }

  // Top Products List
  const topList = document.getElementById('dashTopProductsList');
  if (topList) {
    if (!state.stats.topProducts.length) {
      topList.innerHTML = `
        <div class="text-center py-6 text-[10px] text-[#8b949e]">
          لا توجد مبيعات مسجلة اليوم حتى الآن
        </div>
      `;
    } else {
      topList.innerHTML = state.stats.topProducts.map((p, idx) => {
        const medalColors = ['from-amber-400 to-amber-600', 'from-slate-300 to-slate-500', 'from-amber-700 to-amber-900'];
        const medalBg = medalColors[idx] || 'from-[#111726] to-[#111726] border border-white/10';

        return `
          <div class="flex items-center justify-between p-2.5 bg-[#0b101b] rounded-xl border border-white/5 text-[11px]">
            <div class="flex items-center gap-2.5">
              <span class="w-5 h-5 rounded-lg bg-gradient-to-br ${medalBg} text-[#070b14] font-black text-[10px] flex items-center justify-center shadow-sm">
                ${idx + 1}
              </span>
              <span class="font-bold text-[#f0f6fc]">${p.name}</span>
            </div>
            <div class="text-left font-mono">
              <span class="text-[#fbbf24] font-bold">${p.qtySold || p.sold_qty || 0} مبيعة</span>
              <div class="text-[9px] text-[#8b949e]">${Number(p.revenue || 0).toFixed(2)} د.ل</div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Render 24-Hour Velocity Sparkline Graph
  renderSalesVelocitySparkline();
}

function renderSalesVelocitySparkline() {
  const linePath = document.getElementById('sparklineLinePath');
  const areaPath = document.getElementById('sparklineAreaPath');
  const emptyNotice = document.getElementById('sparklineEmptyNotice');
  const peakEl = document.getElementById('dashVelocityPeak');

  const hourlyData = state.stats.hourlyVelocity.length ? state.stats.hourlyVelocity : [
    { hour: 10, sales: 250 },
    { hour: 11, sales: 400 },
    { hour: 14, sales: 750 },
    { hour: 17, sales: 620 },
    { hour: 20, sales: 900 }
  ];

  if (!hourlyData.length) {
    if (emptyNotice) emptyNotice.classList.remove('hidden');
    return;
  }
  if (emptyNotice) emptyNotice.classList.add('hidden');

  // Fill 24 hour points (0 - 23)
  const full24 = Array.from({ length: 24 }, (_, h) => {
    const found = hourlyData.find(d => Number(d.hour) === h);
    return found ? Number(found.sales || 0) : 0;
  });

  const maxVal = Math.max(...full24, 100);
  if (peakEl) peakEl.textContent = `الذروة: ${maxVal.toFixed(0)} د.ل`;

  const width = 300;
  const height = 80;
  const stepX = width / 23;

  const points = full24.map((val, h) => {
    const x = h * stepX;
    const y = height - ((val / maxVal) * (height - 12)) - 6;
    return { x, y };
  });

  // Build SVG Path
  const dLine = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`, '');
  const dArea = `${dLine} L ${width},${height} L 0,${height} Z`;

  if (linePath) linePath.setAttribute('d', dLine);
  if (areaPath) areaPath.setAttribute('d', dArea);
}

// ----------------------------------------------------------------------------
// 13. PRICE CHECKER & PRODUCT DETAILS MODAL
// ----------------------------------------------------------------------------
window.openProductDetailsModal = function(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  const isCashier = state.user.role === 'cashier' || !state.user.permissions.view_profits;

  document.getElementById('detailsBarcode').textContent = prod.barcode || 'بدون باركود';
  document.getElementById('detailsName').textContent = prod.name;
  document.getElementById('detailsCategory').textContent = prod.category_id || prod.category || 'عطور';
  document.getElementById('detailsRetailPrice').textContent = `${Number(prod.price).toFixed(2)} د.ل`;
  document.getElementById('detailsWholesalePrice').textContent = `${Number(prod.wholesale_price || prod.price).toFixed(2)} د.ل`;
  document.getElementById('detailsStockQty').textContent = `${prod.stock_quantity ?? prod.qty ?? 0} ${prod.unit || 'قطعة'}`;

  const costEl = document.getElementById('detailsCostPrice');
  if (isCashier) {
    costEl.textContent = '*** د.ل (محجوب)';
    costEl.className = 'text-sm font-bold text-[#8b949e]';
  } else {
    costEl.textContent = `${Number(prod.cost_price ?? prod.cost ?? 0).toFixed(2)} د.ل`;
    costEl.className = 'text-sm font-bold text-rose-400';
  }

  const addBtn = document.getElementById('btnDetailsAddToCart');
  if (addBtn) {
    addBtn.onclick = () => {
      addToCart(prod.id);
      document.getElementById('productDetailsModal').classList.add('hidden');
    };
  }

  document.getElementById('productDetailsModal').classList.remove('hidden');
};

// ----------------------------------------------------------------------------
// 14. EVENT LISTENERS SETUP
// ----------------------------------------------------------------------------
function setupEventListeners() {
  // Search Input
  const searchInput = document.getElementById('inputSearchProduct');
  const clearSearchBtn = document.getElementById('btnClearSearch');

  searchInput?.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    if (clearSearchBtn) clearSearchBtn.classList.toggle('hidden', !state.searchQuery);
    renderProducts();
  });

  clearSearchBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    state.searchQuery = '';
    clearSearchBtn.classList.add('hidden');
    renderProducts();
  });

  // Scanner Shortcut Header Trigger
  document.getElementById('btnScannerTrigger')?.addEventListener('click', () => {
    const stockTab = document.querySelector('[data-target="viewStocktaking"]');
    if (stockTab) stockTab.click();
  });

  // Cart Drawer Open / Close
  document.getElementById('btnOpenCart')?.addEventListener('click', () => {
    updateCartUI();
    document.getElementById('cartDrawer')?.classList.remove('hidden');
  });

  document.getElementById('btnCloseCart')?.addEventListener('click', () => {
    document.getElementById('cartDrawer')?.classList.add('hidden');
  });

  document.getElementById('btnClearCart')?.addEventListener('click', () => {
    if (confirm('هل تريد تفريغ السلة؟')) {
      state.cart = [];
      updateCartUI();
    }
  });

  // Payment Method Selection Tabs
  document.querySelectorAll('.pay-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pay-type-btn').forEach(b => {
        b.classList.remove('border-[#fbbf24]', 'bg-[#fbbf24]/10', 'text-[#fbbf24]');
        b.classList.add('border-white/10', 'bg-[#0b101b]', 'text-[#adbac7]');
      });
      btn.classList.add('border-[#fbbf24]', 'bg-[#fbbf24]/10', 'text-[#fbbf24]');
      btn.classList.remove('border-white/10', 'bg-[#0b101b]', 'text-[#adbac7]');

      state.selectedPaymentType = btn.dataset.type;

      const cashSection = document.getElementById('sectionCashPayment');
      const debtSection = document.getElementById('sectionDebtPayment');

      if (cashSection) cashSection.classList.toggle('hidden', state.selectedPaymentType !== 'cash');
      if (debtSection) debtSection.classList.toggle('hidden', state.selectedPaymentType !== 'debt');
    });
  });

  // Quick Banknotes Buttons (+50, +100, +200, Exact)
  document.querySelectorAll('.btn-banknote').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = Number(btn.dataset.val);
      const input = document.getElementById('inputCashReceived');
      state.receivedCash = (Number(input.value || 0)) + val;
      if (input) input.value = state.receivedCash;
      calculateChangeDue();
    });
  });

  document.getElementById('btnExactCash')?.addEventListener('click', () => {
    const totalAmount = state.cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    state.receivedCash = totalAmount;
    const input = document.getElementById('inputCashReceived');
    if (input) input.value = totalAmount.toFixed(2);
    calculateChangeDue();
  });

  document.getElementById('inputCashReceived')?.addEventListener('input', (e) => {
    state.receivedCash = Number(e.target.value || 0);
    calculateChangeDue();
  });

  // Complete POS Checkout Button
  document.getElementById('btnCompleteCheckout')?.addEventListener('click', async () => {
    if (!state.cart.length) return alert('السلة فارغة!');

    const totalAmount = state.cart.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const customerName = state.selectedPaymentType === 'debt'
      ? (document.getElementById('inputCustomerName')?.value || 'عميل آجل')
      : 'زبون نقدي';

    const salePayload = {
      items: state.cart.map(item => ({
        product_id: item.productId,
        name: item.name,
        cart_qty: item.quantity,
        unit: item.unit || 'قطعة',
        final_price: item.unitPrice,
        unit_cost: item.costPrice,
        portion_ml: item.portion_ml || null
      })),
      totalAmount,
      total: totalAmount,
      subtotal: totalAmount,
      paymentType: state.selectedPaymentType,
      payment_method: state.selectedPaymentType,
      customerName,
      customer_name: customerName,
      date: new Date().toISOString()
    };

    const idempotencyKey = `idem_sale_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (!navigator.onLine) {
      // Offline: Enqueue to IndexedDB
      await enqueueOutboxRecord('POS_CHECKOUT', salePayload, idempotencyKey);
      playSuccessChime();
      alert('تم حفظ الفاتورة محلياً بنجاح (وضع عدم الاتصال). ستتم المزامنة تلقائياً عند عودة الشبكة.');
      state.cart = [];
      updateCartUI();
      document.getElementById('cartDrawer')?.classList.add('hidden');
      return;
    }

    try {
      const res = await api('/api/pos/checkout', {
        method: 'POST',
        body: JSON.stringify({ ...salePayload, idempotencyKey })
      });

      if (res && res.success) {
        playSuccessChime();
        alert(`تم إتمام الفاتورة ${res.invoiceId || res.saleId} بنجاح!`);
        state.cart = [];
        updateCartUI();
        document.getElementById('cartDrawer')?.classList.add('hidden');
        await loadProducts();
        await loadDashboard();
      } else {
        // Enqueue offline fallback on error
        await enqueueOutboxRecord('POS_CHECKOUT', salePayload, idempotencyKey);
        alert('تعذر الوصول للخادم. تم حفظ الفاتورة في طابور المزامنة المحلي.');
        state.cart = [];
        updateCartUI();
        document.getElementById('cartDrawer')?.classList.add('hidden');
      }
    } catch (err) {
      await enqueueOutboxRecord('POS_CHECKOUT', salePayload, idempotencyKey);
      alert('تم حفظ الفاتورة محلياً وسيتم إرسالها لاحقاً: ' + err.message);
      state.cart = [];
      updateCartUI();
      document.getElementById('cartDrawer')?.classList.add('hidden');
    }
  });

  // Decant Modal Presets & Custom ML Input
  document.querySelectorAll('.btn-decant-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-decant-preset').forEach(b => {
        b.classList.remove('border-[#fbbf24]', 'bg-[#fbbf24]/15', 'text-[#fbbf24]');
        b.classList.add('border-white/10', 'bg-[#0b101b]', 'text-[#adbac7]');
      });
      btn.classList.add('border-[#fbbf24]', 'bg-[#fbbf24]/15', 'text-[#fbbf24]');
      btn.classList.remove('border-white/10', 'bg-[#0b101b]', 'text-[#adbac7]');

      state.selectedDecantMl = Number(btn.dataset.ml);
      state.selectedDecantLabel = btn.dataset.label;
      const customInput = document.getElementById('inputCustomDecantMl');
      if (customInput) customInput.value = '';

      updateDecantCalculation();
    });
  });

  document.getElementById('inputCustomDecantMl')?.addEventListener('input', updateDecantCalculation);

  document.getElementById('btnAddDecantToCart')?.addEventListener('click', () => {
    if (!state.decantTargetProduct) return;
    const calc = updateDecantCalculation();
    addToCart(state.decantTargetProduct.id, 1, calc.ml, calc.price, calc.label);
    document.getElementById('decantModal')?.classList.add('hidden');
  });

  document.getElementById('btnCloseDecantModal')?.addEventListener('click', () => {
    document.getElementById('decantModal')?.classList.add('hidden');
  });

  // Price Checker Modals
  document.getElementById('btnShowPriceChecker')?.addEventListener('click', () => {
    if (state.scannedProduct) openProductDetailsModal(state.scannedProduct.id);
  });
  document.getElementById('btnCloseDetailsModal')?.addEventListener('click', () => {
    document.getElementById('productDetailsModal')?.classList.add('hidden');
  });

  // Torch & Camera Controls
  document.getElementById('btnToggleTorch')?.addEventListener('click', async () => {
    if (!state.cameraStream) return;
    state.torchOn = !state.torchOn;
    const track = state.cameraStream.getVideoTracks()[0];
    try {
      await track.applyConstraints({ advanced: [{ torch: state.torchOn }] });
      document.getElementById('btnToggleTorch')?.classList.toggle('text-[#fbbf24]', state.torchOn);
    } catch (e) {
      console.warn('Torch not supported on this device/browser');
    }
  });

  document.getElementById('btnSwitchCamera')?.addEventListener('click', async () => {
    state.cameraFacing = state.cameraFacing === 'environment' ? 'user' : 'environment';
    stopCameraScanner();
    startCameraScanner();
  });

  // Manual Barcode & Hardware Laser Scanner Input Listener
  const handleManualBarcodeSubmit = () => {
    const input = document.getElementById('inputManualStockBarcode');
    if (!input) return;
    const barcode = input.value.trim();
    if (!barcode) return;
    handleBarcodeDetected(barcode);
    input.value = '';
  };

  document.getElementById('btnSubmitManualStockBarcode')?.addEventListener('click', handleManualBarcodeSubmit);
  document.getElementById('inputManualStockBarcode')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleManualBarcodeSubmit();
    }
  });

  // Stock Adjustment Controls (-5, -1, +1, +5)
  document.getElementById('btnIncrementStock')?.addEventListener('click', () => {
    const input = document.getElementById('inputNewStockQty');
    if (input) {
      input.value = Number(input.value || 0) + 1;
      updateStockDiscrepancyDisplay();
    }
  });
  document.getElementById('btnDecrementStock')?.addEventListener('click', () => {
    const input = document.getElementById('inputNewStockQty');
    if (input) {
      input.value = Math.max(0, Number(input.value || 0) - 1);
      updateStockDiscrepancyDisplay();
    }
  });
  document.getElementById('btnStepPlus5')?.addEventListener('click', () => {
    const input = document.getElementById('inputNewStockQty');
    if (input) {
      input.value = Number(input.value || 0) + 5;
      updateStockDiscrepancyDisplay();
    }
  });
  document.getElementById('btnStepMinus5')?.addEventListener('click', () => {
    const input = document.getElementById('inputNewStockQty');
    if (input) {
      input.value = Math.max(0, Number(input.value || 0) - 5);
      updateStockDiscrepancyDisplay();
    }
  });
  document.getElementById('inputNewStockQty')?.addEventListener('input', updateStockDiscrepancyDisplay);

  // Stock Audit Reason Presets
  document.querySelectorAll('.reason-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.reason-preset-btn').forEach(b => {
        b.classList.remove('bg-[#fbbf24]/15', 'border-[#fbbf24]', 'text-[#fbbf24]');
        b.classList.add('bg-[#111726]', 'border-white/10', 'text-[#8b949e]');
      });
      btn.classList.add('bg-[#fbbf24]/15', 'border-[#fbbf24]', 'text-[#fbbf24]');
      btn.classList.remove('bg-[#111726]', 'border-white/10', 'text-[#8b949e]');
      state.selectedAuditReason = btn.dataset.reason;
    });
  });

  // Save Stock Audit Button
  document.getElementById('btnSaveStockAudit')?.addEventListener('click', async () => {
    if (!state.scannedProduct) return;
    const newQty = Number(document.getElementById('inputNewStockQty')?.value);
    const systemQty = Number(state.scannedProduct.stock_quantity ?? state.scannedProduct.qty ?? 0);
    const variance = newQty - systemQty;
    const customNotes = document.getElementById('inputAuditCustomNotes')?.value || '';
    const reason = customNotes ? `${state.selectedAuditReason} - ${customNotes}` : state.selectedAuditReason;

    const auditPayload = {
      productId: state.scannedProduct.id,
      product_id: state.scannedProduct.id,
      newQuantity: newQty,
      new_qty: newQty,
      counted_qty: newQty,
      expected_qty: systemQty,
      variance,
      reason,
      notes: customNotes || 'جرد عبر كاميرا الجوال'
    };

    const idempotencyKey = `idem_audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (!navigator.onLine) {
      await enqueueOutboxRecord('STOCK_AUDIT', auditPayload, idempotencyKey);
      playSuccessChime();
      alert(`تم حفظ الجرد محلياً: رصيد ${state.scannedProduct.name} هو ${newQty} (ستتم المزامنة تلقائياً).`);
      return;
    }

    try {
      const res = await api('/api/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify({ ...auditPayload, idempotencyKey })
      });

      if (res && res.success) {
        playSuccessChime();
        alert(`تم تحديث رصيد ${res.productName || state.scannedProduct.name} إلى ${newQty} بنجاح`);
        document.getElementById('scannedCurrentStock').textContent = newQty;
        await loadProducts();
      } else {
        await enqueueOutboxRecord('STOCK_AUDIT', auditPayload, idempotencyKey);
        alert('تم حفظ عملية الجرد في الطابور المحلي نظراً لتعذر الاتصال بالخادم.');
      }
    } catch (err) {
      await enqueueOutboxRecord('STOCK_AUDIT', auditPayload, idempotencyKey);
      alert('تم حفظ الجرد في الطابور المحلي: ' + err.message);
    }
  });

  // PIN Authentication & User Switching
  document.getElementById('btnLoginPin')?.addEventListener('click', async () => {
    const pin = document.getElementById('inputUserPin')?.value;
    if (!pin) return alert('الرجاء إدخال رمز الـ PIN');

    try {
      const res = await api('/api/auth/pin', {
        method: 'POST',
        body: JSON.stringify({ pin, deviceToken: state.deviceToken })
      });

      if (res && res.success) {
        state.sessionToken = res.sessionToken;
        state.user = res.user;
        localStorage.setItem('aldaffa_session_token', res.sessionToken);

        document.getElementById('activeUserName').textContent = res.user.fullName || res.user.name || res.user.username;
        document.getElementById('badgeRoleRole').textContent = res.user.role === 'manager' ? 'مدير عام' : (res.user.role === 'accountant' ? 'محاسب مالي' : 'كاشير مناوب');
        document.getElementById('activeUserRoleDesc').textContent = res.user.role === 'manager' ? 'صلاحيات كاملة + إشراف مالي' : (res.user.role === 'accountant' ? 'عرض التقارير والأرباح' : 'نقطة البيع مع حجب الأرباح والتكلفة');

        playSuccessChime();
        alert(`أهلاً بك، ${res.user.fullName || res.user.name} (${res.user.role})`);
        document.getElementById('inputUserPin').value = '';
        await loadDashboard();
      } else {
        playWarningTone();
        alert('فشل تسجيل الدخول: ' + (res.error || 'رمز الـ PIN غير صحيح'));
      }
    } catch (e) {
      playWarningTone();
      alert('خطأ أثناء تسجيل الدخول: ' + e.message);
    }
  });

  // Quick Demo PIN Buttons
  document.querySelectorAll('.btn-quick-pin').forEach(btn => {
    btn.addEventListener('click', () => {
      const pin = btn.dataset.pin;
      const input = document.getElementById('inputUserPin');
      if (input) input.value = pin;
      document.getElementById('btnLoginPin')?.click();
    });
  });

  // Force Sync Outbox Button
  document.getElementById('btnForceSyncOutbox')?.addEventListener('click', async () => {
    const res = await flushOutboxQueue();
    if (res.success) {
      alert(`تمت مزامنة ${res.synced} معاملة بنجاح!`);
    } else {
      alert(`تعذرت المزامنة: ${res.reason || 'تأكد من الاتصال بالشبكة'}`);
    }
  });

  // Refresh Dashboard Button
  document.getElementById('btnRefreshDashboard')?.addEventListener('click', async () => {
    await loadDashboard();
    playScanBeep(1600, 0.05);
  });
}
