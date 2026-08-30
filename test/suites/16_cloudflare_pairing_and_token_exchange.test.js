/**
 * Suite 16: Cloudflare Pairing, Cryptographic Token Exchange & Multi-Role RBAC
 * 
 * Follows 4-Tier Verification Architecture:
 * - Tier 1: Category-Partition Equivalence Paths (Payload Gen, QR Format, Claim, PIN Auth)
 * - Tier 2: Boundary Value Analysis & Negative Security (TTL Expiry, Tampered HMAC, Invalid PIN, Revocation)
 * - Tier 3: Pairwise Combinatorial (Cross-Role Logins x Permissions Matrix, Multi-Device Pairing)
 * - Tier 4: Real-World Store Onboarding Workload (3 Devices + Master Secret Regeneration)
 */

import assert from 'assert';
import crypto from 'crypto';
import { MockCloudflareWorker } from '../harness/mock-cloudflare-worker.js';

export async function run() {
  const results = [];

  const test = async (name, fn) => {
    const start = Date.now();
    try {
      await fn();
      results.push({ name, passed: true, duration: Date.now() - start });
    } catch (err) {
      results.push({ name, passed: false, error: err, duration: Date.now() - start });
    }
  };

  // ==========================================================================
  // TIER 1: CATEGORY-PARTITION EQUIVALENCE PATHS
  // ==========================================================================

  await test('16.1.1 Pairing Payload Generation & Structure Integrity', async () => {
    const worker = new MockCloudflareWorker();
    const qrPayload = await worker.generatePairingQR(600); // 10 minutes

    assert.strictEqual(qrPayload.storeId, 'aldaffa_store_main');
    assert.strictEqual(qrPayload.storeName, 'الدفة للعطور - الفرع الرئيسي');
    assert(qrPayload.token.startsWith('pair_'), 'Token must have pair_ prefix');
    assert(qrPayload.token.length >= 20, 'Token must have cryptographic length');
    assert(qrPayload.expiresAt > Date.now(), 'expiresAt must be in the future');
    assert.strictEqual(typeof qrPayload.signature, 'string');
    assert.strictEqual(qrPayload.signature.length, 64, 'HMAC-SHA256 signature must be 64 hex chars');
    assert(qrPayload.lanUrl.includes(':4848'), 'LAN URL must specify desktop bridge port');
    assert(qrPayload.cloudUrl.startsWith('https://'), 'Cloud URL must use HTTPS');

    worker.close();
  });

  await test('16.1.2 QR Code Content JSON Serialization & Deserialization', async () => {
    const worker = new MockCloudflareWorker();
    const qrPayload = await worker.generatePairingQR(600);

    const serialized = JSON.stringify(qrPayload);
    const parsed = JSON.parse(serialized);

    assert.deepStrictEqual(parsed, qrPayload, 'Parsed QR payload must exactly match original object');
    assert.strictEqual(parsed.storeId, 'aldaffa_store_main');

    worker.close();
  });

  await test('16.1.3 Ephemeral Token Claim Flow Exchanges for Persistent Device Token', async () => {
    const worker = new MockCloudflareWorker();
    const qrPayload = await worker.generatePairingQR(600);

    const claimRes = await worker.claimPairing({
      token: qrPayload.token,
      deviceId: 'dev_iphone_pos_01',
      deviceName: 'iPhone 15 Pro - كاشير 1',
      signature: qrPayload.signature,
      storeId: qrPayload.storeId
    });

    assert.strictEqual(claimRes.success, true);
    assert.strictEqual(claimRes.status, 200);
    assert(claimRes.deviceToken.startsWith('dev_tok_'), 'Must return persistent device token');
    assert.strictEqual(claimRes.storeInfo.storeId, 'aldaffa_store_main');
    assert.strictEqual(claimRes.storeInfo.storeName, 'الدفة للعطور - الفرع الرئيسي');

    // Verify device record in D1
    const devRow = worker.db.prepare('SELECT * FROM devices WHERE id = ?').get('dev_iphone_pos_01');
    assert(devRow, 'Device must be recorded in D1');
    assert.strictEqual(devRow.device_name, 'iPhone 15 Pro - كاشير 1');
    assert.strictEqual(devRow.is_active, 1);

    worker.close();
  });

  await test('16.1.4 PIN Verification Authenticates User Session & RBAC Flags', async () => {
    const worker = new MockCloudflareWorker();
    const qrPayload = await worker.generatePairingQR(600);

    const claimRes = await worker.claimPairing({
      token: qrPayload.token,
      deviceId: 'dev_galaxy_01',
      deviceName: 'Samsung S24 POS',
      signature: qrPayload.signature
    });

    // Authenticate with Manager PIN '1234'
    const authRes = await worker.authenticatePin({
      pin: '1234',
      deviceToken: claimRes.deviceToken
    });

    assert.strictEqual(authRes.success, true);
    assert.strictEqual(authRes.status, 200);
    assert.strictEqual(authRes.user.id, 'usr_mgr');
    assert.strictEqual(authRes.user.role, 'manager');
    assert.strictEqual(authRes.user.permissions.view_profit, true);
    assert.strictEqual(authRes.user.permissions.settings, true);
    assert(authRes.sessionToken.startsWith('sess_'), 'Must issue authenticated session token');

    worker.close();
  });

  // ==========================================================================
  // TIER 2: BOUNDARY VALUE ANALYSIS (BVA) & NEGATIVE FAULT INJECTION
  // ==========================================================================

  await test('16.2.1 Expired Pairing Token (>10m TTL) is Strictly Rejected', async () => {
    const worker = new MockCloudflareWorker();
    
    // Generate token with 0 TTL (already expired)
    const qrPayload = await worker.generatePairingQR(-5);

    const claimRes = await worker.claimPairing({
      token: qrPayload.token,
      deviceId: 'dev_late_01',
      deviceName: 'Late Device',
      signature: qrPayload.signature
    });

    assert.strictEqual(claimRes.success, false);
    assert.strictEqual(claimRes.status, 401);
    assert(claimRes.error.includes('expired') || claimRes.error.includes('not found'));

    worker.close();
  });

  await test('16.2.2 Tampered HMAC-SHA256 Signature is Blocked with 403 Forbidden', async () => {
    const worker = new MockCloudflareWorker();
    const qrPayload = await worker.generatePairingQR(600);

    // Tamper with signature
    const corruptedSig = qrPayload.signature.substring(0, 60) + 'ffff';

    const claimRes = await worker.claimPairing({
      token: qrPayload.token,
      deviceId: 'dev_attacker_01',
      deviceName: 'Attacker Phone',
      signature: corruptedSig
    });

    assert.strictEqual(claimRes.success, false);
    assert.strictEqual(claimRes.status, 403);
    assert(claimRes.error.includes('signature') || claimRes.error.includes('tampered'));

    worker.close();
  });

  await test('16.2.3 Tampered Store ID in QR Payload Fails Claim Verification', async () => {
    const worker = new MockCloudflareWorker();
    const qrPayload = await worker.generatePairingQR(600);

    // Attempting to claim under different store ID with same signature
    const claimRes = await worker.claimPairing({
      token: qrPayload.token,
      deviceId: 'dev_spoof_01',
      deviceName: 'Spoofed Device',
      signature: qrPayload.signature,
      storeId: 'aldaffa_fake_store_99'
    });

    // Verification must fail because signature was calculated with original storeId
    assert.strictEqual(claimRes.success, false);
    assert.strictEqual(claimRes.status, 403);

    worker.close();
  });

  await test('16.2.4 Invalid PIN Code Rejection and Authentication Failure', async () => {
    const worker = new MockCloudflareWorker();
    const qrPayload = await worker.generatePairingQR(600);

    const claimRes = await worker.claimPairing({
      token: qrPayload.token,
      deviceId: 'dev_pin_test_01',
      deviceName: 'POS Terminal 1',
      signature: qrPayload.signature
    });

    const badPinRes = await worker.authenticatePin({
      pin: '9876', // Non-existent PIN
      deviceToken: claimRes.deviceToken
    });

    assert.strictEqual(badPinRes.success, false);
    assert.strictEqual(badPinRes.status, 401);
    assert(badPinRes.error.includes('Incorrect PIN'));

    worker.close();
  });

  await test('16.2.5 Revoked Mobile Device is Barred from PIN Auth and Sync Operations', async () => {
    const worker = new MockCloudflareWorker();
    const qrPayload = await worker.generatePairingQR(600);

    const claimRes = await worker.claimPairing({
      token: qrPayload.token,
      deviceId: 'dev_stolen_phone',
      deviceName: 'Stolen Cashier Phone',
      signature: qrPayload.signature
    });

    // Manager revokes the device
    await worker.revokeDevice('dev_stolen_phone');

    // Attempting PIN authentication with valid PIN on revoked device
    const authRes = await worker.authenticatePin({
      pin: '0000',
      deviceToken: claimRes.deviceToken
    });

    assert.strictEqual(authRes.success, false);
    assert.strictEqual(authRes.status, 403);
    assert(authRes.error.includes('revoked') || authRes.error.includes('inactive'));

    worker.close();
  });

  await test('16.2.6 Malformed Claim Requests (Missing Parameters) Return 400 Bad Request', async () => {
    const worker = new MockCloudflareWorker();

    const emptyRes = await worker.claimPairing({});
    assert.strictEqual(emptyRes.success, false);
    assert.strictEqual(emptyRes.status, 400);

    const missingNameRes = await worker.claimPairing({ token: 'pair_123', deviceId: 'dev_1' });
    assert.strictEqual(missingNameRes.success, false);
    assert.strictEqual(missingNameRes.status, 400);

    worker.close();
  });

  // ==========================================================================
  // TIER 3: PAIRWISE COMBINATORIAL & CONCURRENCY
  // ==========================================================================

  await test('16.3.1 Pairwise Cross-Role Login Matrix (Manager vs Accountant vs Cashier)', async () => {
    const worker = new MockCloudflareWorker();
    const qrPayload = await worker.generatePairingQR(600);

    const claimRes = await worker.claimPairing({
      token: qrPayload.token,
      deviceId: 'dev_pairwise_01',
      deviceName: 'Multi-User Terminal',
      signature: qrPayload.signature
    });

    // Test Manager (PIN '1234')
    const mgrAuth = await worker.authenticatePin({ pin: '1234', deviceToken: claimRes.deviceToken });
    assert.strictEqual(mgrAuth.user.role, 'manager');
    assert.strictEqual(mgrAuth.user.permissions.view_profit, true);
    assert.strictEqual(mgrAuth.user.permissions.settings, true);
    assert.strictEqual(mgrAuth.user.permissions.purge_data, true);

    // Test Accountant (PIN '5678')
    const accAuth = await worker.authenticatePin({ pin: '5678', deviceToken: claimRes.deviceToken });
    assert.strictEqual(accAuth.user.role, 'accountant');
    assert.strictEqual(accAuth.user.permissions.view_profit, true);
    assert.strictEqual(accAuth.user.permissions.analytics, true);
    assert.strictEqual(Boolean(accAuth.user.permissions.purge_data), false);

    // Test Cashier (PIN '0000')
    const cshAuth = await worker.authenticatePin({ pin: '0000', deviceToken: claimRes.deviceToken });
    assert.strictEqual(cshAuth.user.role, 'cashier');
    assert.strictEqual(Boolean(cshAuth.user.permissions.view_profit), false);
    assert.strictEqual(Boolean(cshAuth.user.permissions.settings), false);
    assert.strictEqual(Boolean(cshAuth.user.permissions.delete_invoice), false);
    assert.strictEqual(cshAuth.user.permissions.pos, true);

    worker.close();
  });

  await test('16.3.2 Multi-Device Concurrent Pairing on Same Store', async () => {
    const worker = new MockCloudflareWorker();
    const qrPayload = await worker.generatePairingQR(600);

    const deviceConfigs = [
      { id: 'dev_node_01', name: 'كاشير المدخل الرئيسي' },
      { id: 'dev_node_02', name: 'كاشير قسم العطور الشرقية' },
      { id: 'dev_node_03', name: 'جهاز الجرد والمستودع' },
      { id: 'dev_node_04', name: 'جهاز المدير المتنقل' }
    ];

    const pairedTokens = [];

    for (const dev of deviceConfigs) {
      const claim = await worker.claimPairing({
        token: qrPayload.token,
        deviceId: dev.id,
        deviceName: dev.name,
        signature: qrPayload.signature
      });
      assert.strictEqual(claim.success, true);
      assert(claim.deviceToken.length > 20);
      pairedTokens.push(claim.deviceToken);
    }

    // Ensure all 4 device tokens are unique
    const uniqueTokens = new Set(pairedTokens);
    assert.strictEqual(uniqueTokens.size, 4, 'All devices must receive distinct persistent tokens');

    // Ensure all 4 devices are recorded in D1
    const countRow = worker.db.prepare('SELECT COUNT(*) as cnt FROM devices WHERE is_active = 1').get();
    assert.strictEqual(countRow.cnt, 4, 'All 4 paired devices must be active in D1');

    worker.close();
  });

  // ==========================================================================
  // TIER 4: REAL-WORLD STORE ONBOARDING WORKLOAD
  // ==========================================================================

  await test('16.4.1 Real-World Store Onboarding & Master Secret Key Regeneration', async () => {
    const worker = new MockCloudflareWorker();

    // 1. Manager generates pairing QR on desktop screen
    const initialQR = await worker.generatePairingQR(600);

    // 2. Manager pairs 3 cashier phones
    const device1 = await worker.claimPairing({
      token: initialQR.token,
      deviceId: 'cashier_phone_1',
      deviceName: 'كاشير 1 - هاتف سامسونج',
      signature: initialQR.signature
    });

    const device2 = await worker.claimPairing({
      token: initialQR.token,
      deviceId: 'cashier_phone_2',
      deviceName: 'كاشير 2 - هاتف ايفون',
      signature: initialQR.signature
    });

    const device3 = await worker.claimPairing({
      token: initialQR.token,
      deviceId: 'cashier_phone_3',
      deviceName: 'كاشير 3 - تابلت لينوفو',
      signature: initialQR.signature
    });

    assert.strictEqual(device1.success, true);
    assert.strictEqual(device2.success, true);
    assert.strictEqual(device3.success, true);

    // 3. All 3 cashiers log in with their PINs
    const auth1 = await worker.authenticatePin({ pin: '0000', deviceToken: device1.deviceToken });
    const auth2 = await worker.authenticatePin({ pin: '0000', deviceToken: device2.deviceToken });
    const auth3 = await worker.authenticatePin({ pin: '0000', deviceToken: device3.deviceToken });

    assert.strictEqual(auth1.success, true);
    assert.strictEqual(auth2.success, true);
    assert.strictEqual(auth3.success, true);

    // 4. Manager regenerates Master Secret Key from Settings UI
    const regenRes = await worker.regenerateMasterToken();
    assert.strictEqual(regenRes.success, true);

    // 5. Verify that old unverified pairing token cannot be used by a new attacker device
    const lateClaim = await worker.claimPairing({
      token: initialQR.token,
      deviceId: 'unauthorized_attacker_phone',
      deviceName: 'Attacker Phone',
      signature: initialQR.signature
    });
    assert.strictEqual(lateClaim.success, false, 'Old unverified pairing token must be invalidated upon secret regeneration');

    // 6. Verify that already paired active devices continue to operate cleanly
    const existingSessionAuth = await worker.authenticatePin({ pin: '0000', deviceToken: device1.deviceToken });
    assert.strictEqual(existingSessionAuth.success, true, 'Active paired devices must maintain pairing validity');

    worker.close();
  });

  return results;
}
