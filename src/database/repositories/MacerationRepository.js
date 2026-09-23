/**
 * Maceration & Aging Management Repository
 * Handles batch compounding, WIP inventory deductions, maturation progress,
 * and graduation into saleable bulk or bottled stock.
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';
import { generateId, safeParseFloat } from '../../utils/helpers.js';

export class MacerationRepository extends BaseRepository {
  constructor() {
    super('maceration_batches');
  }

  /**
   * Automatically updates any aging batch that has passed its ready_date
   * to 'mature_pending_approval'.
   */
  async updateMaturityTriggers() {
    try {
      const today = new Date().toISOString().split('T')[0];
      await db.run(
        `UPDATE maceration_batches 
         SET status = 'mature_pending_approval', updated_at = datetime('now')
         WHERE status = 'aging' AND ready_date <= ?`,
        [today]
      );
    } catch (err) {
      console.warn('MacerationRepository: updateMaturityTriggers error:', err.message);
    }
  }

  /**
   * Generates sequential batch code: MCR-YYYY-XXXX
   */
  async generateNextBatchNumber() {
    const currentYear = new Date().getFullYear();
    const prefix = `MCR-${currentYear}-`;
    try {
      const rows = await db.query(
        `SELECT batch_number FROM maceration_batches 
         WHERE batch_number LIKE ? 
         ORDER BY batch_number DESC LIMIT 1`,
        [`${prefix}%`]
      );

      if (rows && rows.length > 0) {
        const lastSerial = rows[0].batch_number;
        const parts = lastSerial.split('-');
        if (parts.length === 3) {
          const num = parseInt(parts[2], 10);
          if (!isNaN(num)) {
            return `${prefix}${String(num + 1).padStart(4, '0')}`;
          }
        }
      }
      return `${prefix}0001`;
    } catch (err) {
      return `${prefix}${String(Math.floor(Math.random() * 9000) + 1000)}`;
    }
  }

  /**
   * Fetch all batches with dynamic progress and remaining days computation
   */
  async getAllBatches(filters = {}) {
    await this.updateMaturityTriggers();

    let sql = `SELECT * FROM maceration_batches`;
    const params = [];
    const conditions = [];

    if (filters.status && filters.status !== 'all') {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push('(blend_name LIKE ? OR batch_number LIKE ? OR category LIKE ?)');
      params.push(term, term, term);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY CASE status 
              WHEN 'mature_pending_approval' THEN 1 
              WHEN 'aging' THEN 2 
              WHEN 'ready_for_sale' THEN 3 
              WHEN 'bottled' THEN 4 
              ELSE 5 END, ready_date ASC, created_at DESC`;

    const batches = await db.query(sql, params);
    const todayMs = Date.now();

    return batches.map(b => {
      const startMs = new Date(b.start_date).getTime();
      const readyMs = new Date(b.ready_date).getTime();
      const totalDuration = Math.max(1, readyMs - startMs);
      const elapsed = todayMs - startMs;
      
      let progress = 0;
      if (b.status === 'ready_for_sale' || b.status === 'bottled') {
        progress = 100;
      } else if (todayMs >= readyMs) {
        progress = 100;
      } else if (elapsed > 0) {
        progress = Math.min(99, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
      }

      const daysRemaining = Math.ceil((readyMs - todayMs) / (1000 * 60 * 60 * 24));

      return {
        ...b,
        progress,
        days_remaining: daysRemaining,
        is_ready: b.status === 'mature_pending_approval' || (b.status === 'aging' && todayMs >= readyMs)
      };
    });
  }

  /**
   * Fetch single batch with all ingredient items
   */
  async getBatchById(id) {
    await this.updateMaturityTriggers();
    const batch = await db.get(`SELECT * FROM maceration_batches WHERE id = ?`, [id]);
    if (!batch) return null;

    const ingredients = await db.query(
      `SELECT * FROM maceration_batch_ingredients WHERE batch_id = ? ORDER BY created_at ASC`,
      [id]
    );

    const startMs = new Date(batch.start_date).getTime();
    const readyMs = new Date(batch.ready_date).getTime();
    const totalDuration = Math.max(1, readyMs - startMs);
    const elapsed = Date.now() - startMs;
    const progress = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
    const daysRemaining = Math.ceil((readyMs - Date.now()) / (1000 * 60 * 60 * 24));

    return {
      ...batch,
      ingredients,
      progress,
      days_remaining: daysRemaining
    };
  }

  /**
   * Creates a new aging batch and commits raw ingredients via atomic transaction
   */
  async createBatch(batchData, ingredients = []) {
    const id = batchData.id || generateId('mcr_');
    const batchNumber = batchData.batch_number || (await this.generateNextBatchNumber());

    const startDate = batchData.start_date || new Date().toISOString().split('T')[0];
    const macerationDays = Math.max(1, parseInt(batchData.maceration_days, 10) || 30);

    // Calculate ready date
    const startObj = new Date(startDate);
    const readyObj = new Date(startObj.getTime() + (macerationDays * 24 * 60 * 60 * 1000));
    const readyDate = readyObj.toISOString().split('T')[0];

    const targetVolumeMl = Math.max(0.1, safeParseFloat(batchData.target_volume_ml) || 1000);
    const vesselCost = batchData.vessel_absorbed !== false ? safeParseFloat(batchData.vessel_cost) : 0;

    // Calculate total ingredients cost
    let ingredientsTotalCost = 0;
    const preparedIngredients = ingredients.map(ing => {
      const ingId = generateId('mci_');
      const volumeMl = safeParseFloat(ing.volume_ml);
      const costPerMl = safeParseFloat(ing.cost_per_ml);
      const totalCost = Math.round(volumeMl * costPerMl * 100) / 100;
      ingredientsTotalCost += totalCost;

      return {
        id: ingId,
        batch_id: id,
        ingredient_type: ing.ingredient_type || 'oil',
        raw_material_id: ing.raw_material_id || null,
        ingredient_name: ing.ingredient_name || 'مكون عطري',
        volume_ml: volumeMl,
        cost_per_ml: costPerMl,
        total_cost: totalCost
      };
    });

    const totalBatchCost = Math.round((ingredientsTotalCost + vesselCost) * 100) / 100;
    const unitCostPerMl = Math.round((totalBatchCost / targetVolumeMl) * 10000) / 10000;

    const queries = [];

    // 1. Insert Maceration Batch
    queries.push({
      sql: `INSERT INTO maceration_batches (
              id, batch_number, blend_name, start_date, maceration_days, ready_date,
              target_volume_ml, actual_volume_ml, total_batch_cost, unit_cost_per_ml,
              status, vessel_item_id, vessel_cost, vessel_absorbed, category, qa_notes, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        batchNumber,
        batchData.blend_name || 'خلطة معتقة فاخرة',
        startDate,
        macerationDays,
        readyDate,
        targetVolumeMl,
        null, // actual_volume_ml (filled on graduation)
        totalBatchCost,
        unitCostPerMl,
        'aging',
        batchData.vessel_item_id || null,
        safeParseFloat(batchData.vessel_cost),
        batchData.vessel_absorbed !== false ? 1 : 0,
        batchData.category || 'Signature Blend',
        batchData.qa_notes || null,
        batchData.notes || null
      ]
    });

    // 2. Insert Ingredient Rows & Stock Deductions
    for (const ing of preparedIngredients) {
      queries.push({
        sql: `INSERT INTO maceration_batch_ingredients (
                id, batch_id, ingredient_type, raw_material_id, ingredient_name,
                volume_ml, cost_per_ml, total_cost
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          ing.id,
          ing.batch_id,
          ing.ingredient_type,
          ing.raw_material_id,
          ing.ingredient_name,
          ing.volume_ml,
          ing.cost_per_ml,
          ing.total_cost
        ]
      });

      // Stock deduction if raw material exists in inventory
      if (ing.raw_material_id) {
        queries.push({
          sql: `UPDATE inventory 
                SET qty = MAX(0, qty - ?) 
                WHERE id = ?`,
          params: [ing.volume_ml, ing.raw_material_id]
        });
      }
    }

    // 3. Deduct Vessel from inventory if consumable
    if (batchData.vessel_item_id && batchData.vessel_absorbed !== false) {
      queries.push({
        sql: `UPDATE inventory 
              SET qty = MAX(0, qty - 1) 
              WHERE id = ?`,
        params: [batchData.vessel_item_id]
      });
    }

    await db.transaction(queries);

    return await this.getBatchById(id);
  }

  /**
   * Extend maceration duration with additional days
   */
  async extendMaceration(batchId, extraDays = 15, notes = '') {
    const batch = await db.get(`SELECT * FROM maceration_batches WHERE id = ?`, [batchId]);
    if (!batch) throw new Error('الدفعة غير موجودة');

    const added = Math.max(1, parseInt(extraDays, 10) || 7);
    const newDays = batch.maceration_days + added;

    const readyObj = new Date(batch.ready_date);
    const newReadyObj = new Date(readyObj.getTime() + (added * 24 * 60 * 60 * 1000));
    const newReadyDate = newReadyObj.toISOString().split('T')[0];

    const currentNotes = batch.notes ? `${batch.notes}\n` : '';
    const extensionNote = `[${new Date().toLocaleDateString('ar-LY')}]: تم تمديد التعتيق +${added} يوماً. ${notes || ''}`.trim();
    const updatedNotes = `${currentNotes}${extensionNote}`;

    await db.run(
      `UPDATE maceration_batches 
       SET maceration_days = ?, ready_date = ?, status = 'aging', notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [newDays, newReadyDate, updatedNotes, batchId]
    );

    return await this.getBatchById(batchId);
  }

  /**
   * Update quality assessment / sensory notes
   */
  async updateQANotes(batchId, qaNotes) {
    await db.run(
      `UPDATE maceration_batches 
       SET qa_notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [qaNotes, batchId]
    );
    return await this.getBatchById(batchId);
  }

  /**
   * Graduate batch from WIP aging to active saleable inventory
   * Option A: Loose bulk perfume per ml
   * Option B: Bottled perfume into finished flacons with packaging boxes
   */
  async graduateBatch(batchId, options = {}) {
    const batch = await this.getBatchById(batchId);
    if (!batch) throw new Error('الدفعة غير موجودة');

    const actualVolumeMl = Math.max(0.1, safeParseFloat(options.actual_volume_ml) || batch.target_volume_ml);
    // Recalculate true unit cost per ml factoring in evaporation loss
    const finalUnitCostPerMl = Math.round((batch.total_batch_cost / actualVolumeMl) * 10000) / 10000;

    const queries = [];
    const notesAppend = options.notes ? `\n[تخريج الدفعة]: ${options.notes}` : '';
    const finalNotes = `${batch.notes || ''}${notesAppend}`.trim();

    if (options.actionType === 'bottling') {
      const bottleCapacity = Math.max(5, safeParseFloat(options.bottle_capacity) || 50);
      const bottleCount = Math.floor(actualVolumeMl / bottleCapacity);
      if (bottleCount <= 0) {
        throw new Error('كمية العطر لا تكفي لتعبئة زجاجة واحدة بهذه السعة');
      }

      const emptyBottleCost = safeParseFloat(options.bottle_cost) || 0;
      const boxCost = safeParseFloat(options.box_cost) || 0;
      const unitPerfumeCost = Math.round(((bottleCapacity * finalUnitCostPerMl) + emptyBottleCost + boxCost) * 100) / 100;
      const retailPrice = Math.max(0, safeParseFloat(options.retail_price) || Math.round(unitPerfumeCost * 1.6));
      const wholesalePrice = Math.max(0, safeParseFloat(options.wholesale_price) || Math.round(unitPerfumeCost * 1.3));

      const productId = options.product_id || generateId('prd_mcr_');
      const productName = options.product_name || `${batch.blend_name} ${bottleCapacity}مل (معتق)`;

      // Deduct empty bottles from stock
      if (options.bottle_item_id) {
        queries.push({
          sql: `UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`,
          params: [bottleCount, options.bottle_item_id]
        });
      }

      // Deduct packaging boxes if chosen
      if (options.box_item_id) {
        queries.push({
          sql: `UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?`,
          params: [bottleCount, options.box_item_id]
        });
      }

      // Insert finished perfume into active inventory
      queries.push({
        sql: `INSERT INTO inventory (
                id, name, category, qty, cost, price, wholesale_price, original_price,
                unit, capacity, item_type, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          productId,
          productName,
          batch.category || 'عطور معتقة فاخرة',
          bottleCount,
          unitPerfumeCost,
          retailPrice,
          wholesalePrice,
          retailPrice,
          'piece',
          bottleCapacity,
          'ready_perfume',
          `مخرّج من دفعة التعتيق رقم ${batch.batch_number}`
        ]
      });

      // Update batch status
      queries.push({
        sql: `UPDATE maceration_batches 
              SET actual_volume_ml = ?, unit_cost_per_ml = ?, status = 'bottled', notes = ?, updated_at = datetime('now')
              WHERE id = ?`,
        params: [actualVolumeMl, finalUnitCostPerMl, finalNotes, batchId]
      });

    } else {
      // Loose bulk perfume option
      const retailPricePerMl = Math.max(0, safeParseFloat(options.retail_price_per_ml) || Math.round(finalUnitCostPerMl * 2 * 100) / 100);
      const wholesalePricePerMl = Math.max(0, safeParseFloat(options.wholesale_price_per_ml) || Math.round(finalUnitCostPerMl * 1.5 * 100) / 100);
      const productId = options.product_id || generateId('prd_mcr_bulk_');
      const productName = options.product_name || `${batch.blend_name} (معتق سائب)`;

      // Insert bulk perfume into active inventory
      queries.push({
        sql: `INSERT INTO inventory (
                id, name, category, qty, cost, price, wholesale_price, original_price,
                unit, capacity, item_type, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          productId,
          productName,
          batch.category || 'عطور معتقة سائبة',
          actualVolumeMl,
          finalUnitCostPerMl,
          retailPricePerMl,
          wholesalePricePerMl,
          retailPricePerMl,
          'ml',
          actualVolumeMl,
          'ready_perfume',
          `عطر سائب مخرّج من دفعة التعتيق رقم ${batch.batch_number}`
        ]
      });

      // Update batch status
      queries.push({
        sql: `UPDATE maceration_batches 
              SET actual_volume_ml = ?, unit_cost_per_ml = ?, status = 'ready_for_sale', notes = ?, updated_at = datetime('now')
              WHERE id = ?`,
        params: [actualVolumeMl, finalUnitCostPerMl, finalNotes, batchId]
      });
    }

    await db.transaction(queries);
    return await this.getBatchById(batchId);
  }

  /**
   * Discards batch failing quality inspection
   */
  async discardBatch(batchId, reason = '') {
    const note = `[استبعاد مخبري]: ${reason || 'عينة تالفة / لم تجتز معايير النقاء والرائحة'}`;
    await db.run(
      `UPDATE maceration_batches 
       SET status = 'discarded', notes = coalesce(notes || '\n', '') || ?, updated_at = datetime('now')
       WHERE id = ?`,
      [note, batchId]
    );
    return await this.getBatchById(batchId);
  }

  /**
   * Delete batch record (and optionally restore raw materials if still in aging)
   */
  async deleteBatch(batchId, restoreStock = false) {
    const batch = await this.getBatchById(batchId);
    if (!batch) return false;

    const queries = [];

    if (restoreStock && batch.status === 'aging' && batch.ingredients) {
      for (const ing of batch.ingredients) {
        if (ing.raw_material_id) {
          queries.push({
            sql: `UPDATE inventory SET qty = qty + ? WHERE id = ?`,
            params: [ing.volume_ml, ing.raw_material_id]
          });
        }
      }
      if (batch.vessel_item_id && batch.vessel_absorbed) {
        queries.push({
          sql: `UPDATE inventory SET qty = qty + 1 WHERE id = ?`,
          params: [batch.vessel_item_id]
        });
      }
    }

    queries.push({
      sql: `DELETE FROM maceration_batches WHERE id = ?`,
      params: [batchId]
    });

    await db.transaction(queries);
    return true;
  }

  /**
   * Aggregate laboratory metrics for KPI cards
   */
  async getMetrics() {
    await this.updateMaturityTriggers();
    const today = new Date().toISOString().split('T')[0];

    // Total volume in aging (Liters)
    const volRow = await db.get(
      `SELECT COALESCE(SUM(target_volume_ml), 0) as total_ml 
       FROM maceration_batches 
       WHERE status = 'aging'`
    );
    const volumeLiters = Math.round(((volRow?.total_ml || 0) / 1000) * 10) / 10;

    // Total capital tied in aging
    const capRow = await db.get(
      `SELECT COALESCE(SUM(total_batch_cost), 0) as total_capital 
       FROM maceration_batches 
       WHERE status IN ('aging', 'mature_pending_approval')`
    );
    const capitalTied = Math.round((capRow?.total_capital || 0) * 100) / 100;

    // Batches maturing this week (between today and next 7 days)
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const weekRow = await db.get(
      `SELECT COUNT(*) as count 
       FROM maceration_batches 
       WHERE status = 'aging' AND ready_date BETWEEN ? AND ?`,
      [today, nextWeek]
    );

    // Batches ready for review
    const readyRow = await db.get(
      `SELECT COUNT(*) as count 
       FROM maceration_batches 
       WHERE status = 'mature_pending_approval'`
    );

    // Counts by status
    const statusCounts = await db.query(
      `SELECT status, COUNT(*) as count 
       FROM maceration_batches 
       GROUP BY status`
    );

    const counts = {
      aging: 0,
      mature_pending_approval: 0,
      ready_for_sale: 0,
      bottled: 0,
      discarded: 0
    };
    statusCounts.forEach(r => {
      if (counts[r.status] !== undefined) {
        counts[r.status] = r.count;
      }
    });

    return {
      volumeLiters,
      capitalTied,
      maturingThisWeek: weekRow?.count || 0,
      pendingApproval: readyRow?.count || 0,
      counts
    };
  }
}
