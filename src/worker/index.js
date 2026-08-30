/**
 * ============================================================================
 * ALDAFFA PERFUMES ERP — CLOUDFLARE HYBRID SYNC WORKER
 * ============================================================================
 * Cloudflare Worker Backend managing:
 * - KV Pairing Token lifecycle (10m TTL)
 * - Device Token issuance and authorization
 * - D1 Relational Mirror & Delta Sync Protocol (pull/push)
 * - Remote POS Checkout, Stocktaking Adjustments, & Executive Telemetry
 */

import { D1Client } from './d1-client.js';

// Default CORS headers for mobile PWA & Desktop client
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-Token, X-Pairing-Token, X-Store-Id, Idempotency-Key, X-User-Pin',
  'Access-Control-Max-Age': '86400'
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS
    }
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
}

// User RBAC definitions for PIN authentication
const ROLE_PERMISSIONS = {
  manager: {
    view_profits: true,
    view_profit: true,
    delete_invoice: true,
    manage_users: true,
    purge_data: true,
    apply_discount: true,
    change_price: true,
    edit_settings: true
  },
  accountant: {
    view_profits: true,
    view_profit: true,
    delete_invoice: false,
    manage_users: false,
    purge_data: false,
    apply_discount: true,
    change_price: false,
    edit_settings: false
  },
  cashier: {
    view_profits: false,
    view_profit: false,
    delete_invoice: false,
    manage_users: false,
    purge_data: false,
    apply_discount: true,
    change_price: false,
    edit_settings: false
  }
};

const DEFAULT_USERS_BY_PIN = {
  '1234': { id: 'usr_mgr_1', name: 'المدير العام', role: 'manager' },
  '9999': { id: 'usr_mgr_admin', name: 'المدير العام (الرئيسي)', role: 'manager' },
  '2222': { id: 'usr_acc_1', name: 'المحاسب المالي', role: 'accountant' },
  '3333': { id: 'usr_csh_1', name: 'الكاشير المناوب', role: 'cashier' }
};

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;
    const client = new D1Client(env.DB);

    try {
      // ----------------------------------------------------------------------
      // ROUTE: Health Check
      // ----------------------------------------------------------------------
      if (pathname === '/' || pathname === '/health' || pathname === '/api/v1/health') {
        return jsonResponse({
          status: 'ok',
          service: 'Aldaffa Perfumes ERP Cloudflare Hybrid Sync Engine',
          version: '2.3.26',
          timestamp: new Date().toISOString()
        });
      }

      // ----------------------------------------------------------------------
      // ROUTE: POST /api/v1/pairing/create (Desktop generates pairing token)
      // ----------------------------------------------------------------------
      if (pathname === '/api/v1/pairing/create' || pathname === '/api/pairing/create') {
        if (request.method !== 'POST') return errorResponse('Method Not Allowed', 405);
        const body = await request.json().catch(() => ({}));
        const { storeId = 'aldaffa_store_main', storeName = 'الدفة للعطور', token, ttlSeconds = 600 } = body;

        const pairingToken = token || `pair_${crypto.randomUUID().replace(/-/g, '')}`;
        const now = Date.now();
        const payload = {
          storeId,
          storeName,
          token: pairingToken,
          createdAt: now,
          expiresAt: now + (ttlSeconds * 1000)
        };

        if (env.KV) {
          await env.KV.put(`pair:${pairingToken}`, JSON.stringify(payload), {
            expirationTtl: ttlSeconds
          });
        }

        // Ensure store exists in D1
        await client.upsertStore({ id: storeId, name: storeName });

        return jsonResponse({
          success: true,
          token: pairingToken,
          storeId,
          storeName,
          expiresAt: payload.expiresAt
        });
      }

      // ----------------------------------------------------------------------
      // ROUTE: POST /api/v1/pairing/claim (Mobile scans QR to obtain device token)
      // ----------------------------------------------------------------------
      if (pathname === '/api/v1/pairing/claim' || pathname === '/api/pairing/claim') {
        if (request.method !== 'POST') return errorResponse('Method Not Allowed', 405);
        const body = await request.json().catch(() => ({}));
        const token = body.token || request.headers.get('X-Pairing-Token') || url.searchParams.get('token');
        const deviceName = body.deviceName || 'هاتف كاشير جوال';
        const deviceId = body.deviceId || `dev_${crypto.randomUUID().substring(0, 8)}`;

        if (!token) {
          return errorResponse('رمز الاقتران مطلوب (Missing pairing token)', 400);
        }

        let storeInfo = { id: 'aldaffa_store_main', name: 'الدفة للعطور', currency: 'د.ل' };

        // Verify in KV if available
        if (env.KV) {
          const kvData = await env.KV.get(`pair:${token}`);
          if (!kvData) {
            return errorResponse('رمز الاقتران غير صالح أو منتهي الصلاحية', 401);
          }
          if (kvData) {
            try {
              const parsed = JSON.parse(kvData);
              storeInfo.id = parsed.storeId || storeInfo.id;
              storeInfo.name = parsed.storeName || storeInfo.name;
              // Clean up claimed token
              await env.KV.delete(`pair:${token}`);
            } catch (e) {}
          }
        }

        // Generate persistent deviceToken
        const deviceToken = `dev_tok_${crypto.randomUUID().replace(/-/g, '')}`;

        // Ensure Store & Device in D1
        await client.upsertStore(storeInfo);
        await client.registerDevice({
          id: deviceId,
          storeId: storeInfo.id,
          name: deviceName,
          deviceToken
        });

        // Cache Device in KV
        if (env.KV) {
          await env.KV.put(`device:${deviceToken}`, JSON.stringify({
            deviceId,
            deviceName,
            storeId: storeInfo.id,
            createdAt: Date.now()
          }));
        }

        return jsonResponse({
          success: true,
          deviceToken,
          deviceId,
          storeInfo
        });
      }

      // ----------------------------------------------------------------------
      // ROUTE: POST /api/v1/auth/pin (4-digit PIN Authentication & RBAC)
      // ----------------------------------------------------------------------
      if (pathname === '/api/v1/auth/pin' || pathname === '/api/auth/pin') {
        if (request.method !== 'POST') return errorResponse('Method Not Allowed', 405);
        const body = await request.json().catch(() => ({}));
        const pin = body.pin || request.headers.get('X-User-Pin');

        if (!pin) {
          return errorResponse('الرجاء إدخال رمز الـ PIN', 400);
        }

        const userRecord = DEFAULT_USERS_BY_PIN[pin] || (pin === '0000' ? { id: 'usr_guest', name: 'مستخدم تجريبي', role: 'cashier' } : null);

        if (!userRecord) {
          return errorResponse('رمز الـ PIN غير صحيح أو الحساب غير موجود', 401);
        }

        const role = userRecord.role || 'cashier';
        const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.cashier;
        const sessionToken = `ses_${crypto.randomUUID().replace(/-/g, '')}`;

        return jsonResponse({
          success: true,
          sessionToken,
          user: {
            id: userRecord.id,
            username: userRecord.name,
            fullName: userRecord.name,
            name: userRecord.name,
            role,
            permissions
          }
        });
      }

      // ----------------------------------------------------------------------
      // ROUTE: GET /api/v1/sync/pull (Pull sequence-vector deltas)
      // ----------------------------------------------------------------------
      if (pathname === '/api/v1/sync/pull' || pathname === '/api/sync/pull') {
        const storeId = url.searchParams.get('storeId') || request.headers.get('X-Store-Id') || 'aldaffa_store_main';
        const sinceVersion = parseInt(url.searchParams.get('sinceVersion') || '0', 10);
        const sinceDate = url.searchParams.get('sinceDate') || null;

        const deltas = await client.pullDeltas({ storeId, sinceVersion, sinceDate });
        return jsonResponse({
          success: true,
          ...deltas
        });
      }

      // ----------------------------------------------------------------------
      // ROUTE: POST /api/v1/sync/push (Push incoming deltas & sequence increments)
      // ----------------------------------------------------------------------
      if (pathname === '/api/v1/sync/push' || pathname === '/api/sync/push') {
        if (request.method !== 'POST') return errorResponse('Method Not Allowed', 405);
        const body = await request.json().catch(() => ({}));
        const idempotencyKey = request.headers.get('Idempotency-Key') || body.idempotencyKey;

        // Check idempotency deduplication
        if (idempotencyKey) {
          const cached = await client.getIdempotencyRecord(idempotencyKey);
          if (cached) {
            return jsonResponse(cached);
          }
        }

        const storeId = body.storeId || request.headers.get('X-Store-Id') || 'aldaffa_store_main';
        const deviceId = body.deviceId || null;
        const events = body.events || [];

        const pushResult = await client.pushDeltaEvents({ storeId, deviceId, events });
        const responseData = {
          success: true,
          ...pushResult
        };

        if (idempotencyKey) {
          await client.saveIdempotencyRecord(idempotencyKey, responseData);
        }

        return jsonResponse(responseData);
      }

      // ----------------------------------------------------------------------
      // ROUTE: POST /api/v1/pos/checkout (Cloud POS Checkout)
      // ----------------------------------------------------------------------
      if (pathname === '/api/v1/pos/checkout' || pathname === '/api/pos/checkout') {
        if (request.method !== 'POST') return errorResponse('Method Not Allowed', 405);
        const body = await request.json().catch(() => ({}));
        const idempotencyKey = request.headers.get('Idempotency-Key') || body.idempotencyKey;

        if (idempotencyKey) {
          const cached = await client.getIdempotencyRecord(idempotencyKey);
          if (cached) return jsonResponse(cached);
        }

        const storeId = body.storeId || request.headers.get('X-Store-Id') || 'aldaffa_store_main';
        const deviceId = body.deviceId || null;

        const result = await client.processCheckout({
          storeId,
          deviceId,
          saleData: body,
          idempotencyKey
        });

        return jsonResponse(result);
      }

      // ----------------------------------------------------------------------
      // ROUTE: POST /api/v1/inventory/adjust (Camera Stocktaking Adjustment)
      // ----------------------------------------------------------------------
      if (pathname === '/api/v1/inventory/adjust' || pathname === '/api/inventory/adjust') {
        if (request.method !== 'POST') return errorResponse('Method Not Allowed', 405);
        const body = await request.json().catch(() => ({}));
        const storeId = body.storeId || request.headers.get('X-Store-Id') || 'aldaffa_store_main';
        const productId = body.productId || body.product_id;
        const newQuantity = body.newQuantity ?? body.counted_qty ?? body.new_qty;
        const reason = body.reason || 'جرد عبر كاميرا الجوال';

        if (!productId || newQuantity === undefined) {
          return errorResponse('بيانات الجرد غير مكتملة (Missing productId or newQuantity)', 400);
        }

        const result = await client.adjustProductStock({
          storeId,
          deviceId: body.deviceId || null,
          productId,
          newQuantity,
          reason
        });

        return jsonResponse(result);
      }

      // ----------------------------------------------------------------------
      // ROUTE: GET /api/v1/products (Catalog lookup)
      // ----------------------------------------------------------------------
      if (pathname === '/api/v1/products' || pathname === '/api/products') {
        const storeId = url.searchParams.get('storeId') || 'aldaffa_store_main';
        const products = await client.all('SELECT * FROM products WHERE store_id = ? AND is_active = 1 ORDER BY name ASC', storeId);
        return jsonResponse({
          success: true,
          products,
          categories: []
        });
      }

      // ----------------------------------------------------------------------
      // ROUTE: GET /api/v1/dashboard/stats (Live Financial Dashboard & RBAC)
      // ----------------------------------------------------------------------
      if (pathname === '/api/v1/dashboard/stats' || pathname === '/api/dashboard/stats') {
        const storeId = url.searchParams.get('storeId') || 'aldaffa_store_main';
        const date = url.searchParams.get('date');
        const userRole = url.searchParams.get('role') || 'manager';

        const stats = await client.getDashboardStats({ storeId, date, userRole });
        return jsonResponse(stats);
      }

      // Default 404
      return errorResponse('المسار غير متوفر (Endpoint Not Found)', 404);
    } catch (err) {
      console.error('[Cloudflare Sync Worker Error]:', err);
      return errorResponse(`خطأ في خادم المزامنة: ${err.message}`, 500);
    }
  }
};
