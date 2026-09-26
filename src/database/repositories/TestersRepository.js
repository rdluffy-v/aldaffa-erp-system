/**
 * Testers & Sampling Management Repository
 * Handles non-revenue internal tester deductions, compounding samples,
 * marketing spend derivation, and stock tracking without inventory shrinkage.
 */

import { BaseRepository } from './BaseRepository.js';
import { db } from '../connection.js';
import { generateId, safeParseFloat } from '../../utils/helpers.js';

export class TestersRepository extends BaseRepository {
  constructor() {
    super('perfume_testers');
  }

  /**
   * Record ready perfume tester dispensing
   * Accurately deduces proportional bottle capacity and cost
   */
  async recordReadyPerfumeTester({
    productId,
    product_id,
    sampleVolumeMl,
    sample_volume_ml,
    reason = 'عرض المحل والتجربة للزبائن',
    dispensedBy,
    dispensed_by,
    notes = '',
    is_demo = 0
  }) {
    const id = generateId();
    const pid = productId || product_id;
    const volume = safeParseFloat(sampleVolumeMl ?? sample_volume_ml);
    const staff = dispensedBy || dispensed_by || 'الكاشير';

    if (!pid) {
      throw new Error('يجب تحديد العطر الجاهز');
    }
    if (volume <= 0) {
      throw new Error('يجب أن يكون حجم العينة أكبر من صفر');
    }

    // Retrieve product from inventory
    const products = await db.query('SELECT * FROM inventory WHERE id = ?', [pid]);
    if (!products || products.length === 0) {
      throw new Error('المنتج المحدد غير موجود في المخزون');
    }
    const product = products[0];

    const bottleCost = safeParseFloat(product.cost);
    const bottleCapacity = safeParseFloat(product.capacity);
    const isVolumeUnit = product.unit === 'ml' || product.unit === 'gram';

    // Calculate deduction quantity and cost per ml
    let qtyToDeduct;
    let costPerMl;

    if (isVolumeUnit) {
      qtyToDeduct = volume;
      costPerMl = bottleCost; // cost per ml/gram directly
    } else if (bottleCapacity > 0) {
      qtyToDeduct = volume / bottleCapacity;
      costPerMl = bottleCost / bottleCapacity;
    } else {
      qtyToDeduct = volume / 100; // fallback standard 100ml flacon
      costPerMl = bottleCost / 100;
    }

    const totalCost = Number((volume * costPerMl).toFixed(4));
    const nowIso = new Date().toISOString();

    // Atomic execution: Inventory decrement + Tester record
    const queries = [
      {
        sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?',
        params: [qtyToDeduct, pid]
      },
      {
        sql: `INSERT INTO perfume_testers (
          id, source_type, sample_volume_ml, total_cost, finished_product_id,
          product_name, reason, dispensed_by, notes, created_at, is_demo
        ) VALUES (?, 'ready_perfume', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          id,
          volume,
          totalCost,
          pid,
          product.name,
          reason,
          staff,
          notes || '',
          nowIso,
          product.is_demo || is_demo ? 1 : 0
        ]
      }
    ];

    await db.transaction(queries);

    return {
      success: true,
      id,
      source_type: 'ready_perfume',
      product_id: pid,
      product_name: product.name,
      sample_volume_ml: volume,
      total_cost: totalCost,
      qty_deducted: qtyToDeduct
    };
  }

  /**
   * Record real-time compounded mix sample dispensing
   * Deduces raw fragrance oil & alcohol immediately from stock
   */
  async recordCompoundedTester({
    fragranceOilId,
    fragrance_oil_id,
    oilVolumeMl,
    oil_volume_ml,
    oilCostPerMl,
    oil_cost_per_ml,
    alcoholId,
    alcohol_id,
    alcoholVolumeMl,
    alcohol_volume_ml,
    alcoholCostPerMl,
    alcohol_cost_per_ml,
    bottleId,
    bottle_id,
    bottleQty,
    bottle_qty,
    bottleCost,
    bottle_cost,
    reason = 'تركيب عينة وتجربة شذية للزبون',
    dispensedBy,
    dispensed_by,
    notes = '',
    is_demo = 0
  }) {
    const id = generateId();
    const fOilId = fragranceOilId || fragrance_oil_id;
    const fAlcId = alcoholId || alcohol_id;
    const fBottleId = bottleId || bottle_id;
    const oilVol = safeParseFloat(oilVolumeMl ?? oil_volume_ml);
    const alcVol = safeParseFloat(alcoholVolumeMl ?? alcohol_volume_ml);
    const bQty = safeParseFloat(bottleQty ?? bottle_qty ?? (fBottleId ? 1 : 0));
    const staff = dispensedBy || dispensed_by || 'الكاشير';

    if (!fOilId && !fAlcId) {
      throw new Error('يجب اختيار الزيت العطري أو الكحول لتركيب العينة');
    }
    if (oilVol <= 0 && alcVol <= 0) {
      throw new Error('يجب تحديد كمية من الزيت أو الكحول أكبر من صفر');
    }

    let oilProduct = null;
    let alcProduct = null;
    let bottleProduct = null;
    const queries = [];

    // Resolve oil details & deduction
    let derivedOilCostPerMl = safeParseFloat(oilCostPerMl ?? oil_cost_per_ml);
    let oilDeductQty = 0;
    if (fOilId && oilVol > 0) {
      const oilRows = await db.query('SELECT * FROM inventory WHERE id = ?', [fOilId]);
      if (oilRows && oilRows.length > 0) {
        oilProduct = oilRows[0];
        const oilCap = safeParseFloat(oilProduct.capacity);
        const isOilVolumeUnit = oilProduct.unit === 'ml' || oilProduct.unit === 'gram';

        if (derivedOilCostPerMl <= 0) {
          derivedOilCostPerMl = isOilVolumeUnit
            ? safeParseFloat(oilProduct.cost)
            : oilCap > 0
            ? safeParseFloat(oilProduct.cost) / oilCap
            : safeParseFloat(oilProduct.cost);
        }

        oilDeductQty = isOilVolumeUnit
          ? oilVol
          : oilCap > 0
          ? oilVol / oilCap
          : oilVol;

        queries.push({
          sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?',
          params: [oilDeductQty, fOilId]
        });
      }
    }

    // Resolve alcohol details & deduction
    let derivedAlcCostPerMl = safeParseFloat(alcoholCostPerMl ?? alcohol_cost_per_ml);
    let alcDeductQty = 0;
    if (fAlcId && alcVol > 0) {
      const alcRows = await db.query('SELECT * FROM inventory WHERE id = ?', [fAlcId]);
      if (alcRows && alcRows.length > 0) {
        alcProduct = alcRows[0];
        const alcCap = safeParseFloat(alcProduct.capacity);
        const isAlcVolumeUnit = alcProduct.unit === 'ml' || alcProduct.unit === 'gram';

        if (derivedAlcCostPerMl <= 0) {
          derivedAlcCostPerMl = isAlcVolumeUnit
            ? safeParseFloat(alcProduct.cost)
            : alcCap > 0
            ? safeParseFloat(alcProduct.cost) / alcCap
            : safeParseFloat(alcProduct.cost);
        }

        alcDeductQty = isAlcVolumeUnit
          ? alcVol
          : alcCap > 0
          ? alcVol / alcCap
          : alcVol;

        queries.push({
          sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?',
          params: [alcDeductQty, fAlcId]
        });
      }
    }

    // Resolve optional bottle / packaging details & deduction
    let derivedBottleCost = safeParseFloat(bottleCost ?? bottle_cost);
    let bottleDeductQty = 0;
    if (fBottleId && bQty > 0) {
      const bRows = await db.query('SELECT * FROM inventory WHERE id = ?', [fBottleId]);
      if (bRows && bRows.length > 0) {
        bottleProduct = bRows[0];
        if (derivedBottleCost <= 0) {
          derivedBottleCost = safeParseFloat(bottleProduct.cost);
        }
        bottleDeductQty = bQty;
        queries.push({
          sql: 'UPDATE inventory SET qty = MAX(0, qty - ?) WHERE id = ?',
          params: [bottleDeductQty, fBottleId]
        });
      }
    }

    const totalOilCost = Number((oilVol * derivedOilCostPerMl).toFixed(4));
    const totalAlcCost = Number((alcVol * derivedAlcCostPerMl).toFixed(4));
    const totalBottleCost = Number((bottleDeductQty * derivedBottleCost).toFixed(4));
    const totalCost = Number((totalOilCost + totalAlcCost + totalBottleCost).toFixed(4));
    const totalSampleVolume = Number((oilVol + alcVol).toFixed(2));
    const oilConcentration = totalSampleVolume > 0 ? Number(((oilVol / totalSampleVolume) * 100).toFixed(1)) : 0;
    const nowIso = new Date().toISOString();

    const isDemoRecord = (oilProduct?.is_demo || alcProduct?.is_demo || bottleProduct?.is_demo || is_demo) ? 1 : 0;

    queries.push({
      sql: `INSERT INTO perfume_testers (
        id, source_type, sample_volume_ml, total_cost,
        fragrance_oil_id, fragrance_oil_name, oil_volume_ml, oil_cost_per_ml,
        alcohol_id, alcohol_name, alcohol_volume_ml, alcohol_cost_per_ml,
        bottle_id, bottle_name, bottle_cost, bottle_qty,
        reason, dispensed_by, notes, created_at, is_demo
      ) VALUES (?, 'compounded_mix', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        id,
        totalSampleVolume,
        totalCost,
        fOilId || null,
        oilProduct?.name || 'زيت عطري غير مسمى',
        oilVol,
        derivedOilCostPerMl,
        fAlcId || null,
        alcProduct?.name || 'كحول إيثانول نقي',
        alcVol,
        derivedAlcCostPerMl,
        fBottleId || null,
        bottleProduct?.name || null,
        derivedBottleCost,
        bottleDeductQty,
        reason,
        staff,
        notes || '',
        nowIso,
        isDemoRecord
      ]
    });

    await db.transaction(queries);

    return {
      success: true,
      id,
      source_type: 'compounded_mix',
      sample_volume_ml: totalSampleVolume,
      total_cost: totalCost,
      oil_volume_ml: oilVol,
      oil_cost_per_ml: derivedOilCostPerMl,
      alcohol_volume_ml: alcVol,
      alcohol_cost_per_ml: derivedAlcCostPerMl,
      bottle_id: fBottleId || null,
      bottle_name: bottleProduct?.name || null,
      bottle_cost: derivedBottleCost,
      bottle_qty: bottleDeductQty,
      oil_concentration: oilConcentration,
      oil_name: oilProduct?.name,
      alcohol_name: alcProduct?.name
    };
  }

  /**
   * Fetch tester log entries with comprehensive search and filtering
   */
  async getAllTesterLogs(filters = {}) {
    let sql = 'SELECT * FROM perfume_testers';
    const params = [];
    const conditions = [];

    if (filters.source_type && filters.source_type !== 'all') {
      conditions.push('source_type = ?');
      params.push(filters.source_type);
    }

    if (filters.search && filters.search.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        '(product_name LIKE ? OR fragrance_oil_name LIKE ? OR alcohol_name LIKE ? OR dispensed_by LIKE ? OR reason LIKE ? OR notes LIKE ?)'
      );
      params.push(term, term, term, term, term, term);
    }

    if (filters.from_date) {
      conditions.push("created_at >= ?");
      params.push(filters.from_date);
    }

    if (filters.to_date) {
      conditions.push("created_at <= ?");
      params.push(filters.to_date);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY created_at DESC';

    return await db.query(sql, params);
  }

  /**
   * Analytics & KPI engine for Testers / Discovery Samples
   */
  async getTesterAnalytics(period = 'month') {
    // 1. Overall stats
    const overallRows = await db.query(
      `SELECT 
        COALESCE(SUM(total_cost), 0) as total_spend,
        COALESCE(SUM(sample_volume_ml), 0) as total_ml,
        COUNT(*) as total_samples
       FROM perfume_testers`
    );
    const overall = overallRows && overallRows.length > 0 ? overallRows[0] : { total_spend: 0, total_ml: 0, total_samples: 0 };

    // 2. Current Month Spend
    const monthRows = await db.query(
      `SELECT 
        COALESCE(SUM(total_cost), 0) as month_spend,
        COALESCE(SUM(sample_volume_ml), 0) as month_ml,
        COUNT(*) as month_samples
       FROM perfume_testers
       WHERE created_at >= date('now', 'start of month')`
    );
    const monthStats = monthRows && monthRows.length > 0 ? monthRows[0] : { month_spend: 0, month_ml: 0, month_samples: 0 };

    // 3. Source type breakdown
    const sourceRows = await db.query(
      `SELECT 
        source_type,
        COUNT(*) as count,
        COALESCE(SUM(total_cost), 0) as spend,
        COALESCE(SUM(sample_volume_ml), 0) as volume_ml
       FROM perfume_testers
       GROUP BY source_type`
    );

    // 4. Leaderboard: Most Sampled Fragrances
    const leaderboard = await db.query(
      `SELECT 
        COALESCE(product_name, fragrance_oil_name, 'عطر تجريبي') as fragrance_name,
        source_type,
        COUNT(*) as sample_count,
        COALESCE(SUM(sample_volume_ml), 0) as total_ml,
        COALESCE(SUM(total_cost), 0) as total_spend
       FROM perfume_testers
       GROUP BY fragrance_name
       ORDER BY sample_count DESC, total_ml DESC
       LIMIT 10`
    );

    return {
      total_spend: Number(safeParseFloat(overall.total_spend).toFixed(2)),
      total_volume_ml: Number(safeParseFloat(overall.total_ml).toFixed(1)),
      total_volume_liters: Number((safeParseFloat(overall.total_ml) / 1000).toFixed(3)),
      total_samples: Number(overall.total_samples || 0),
      month_spend: Number(safeParseFloat(monthStats.month_spend).toFixed(2)),
      month_volume_ml: Number(safeParseFloat(monthStats.month_ml).toFixed(1)),
      month_samples: Number(monthStats.month_samples || 0),
      source_breakdown: sourceRows || [],
      leaderboard: leaderboard || []
    };
  }

  /**
   * Export tester logs to CSV formatted with UTF-8 BOM
   */
  async exportTesterLogsCSV(filters = {}) {
    const logs = await this.getAllTesterLogs(filters);

    const headers = [
      'المعرف',
      'التاريخ والوقت',
      'نوع المصدر',
      'اسم العطر / الزيت',
      'حجم العينة (مل)',
      'العبوة / الزجاجة',
      'تكلفة العبوة (د.ل)',
      'التكلفة الإجمالية (د.ل)',
      'سياق وسبب الصرف',
      'الموظف المسئول',
      'الملاحظات'
    ];

    const escapeCell = (val) => {
      const str = String(val ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const rows = logs.map((log) => {
      const sourceLabel = log.source_type === 'ready_perfume' ? 'عطر جاهز' : 'تركيب وتخليط';
      const fragranceName = log.product_name || log.fragrance_oil_name || '—';
      const bottleInfo = log.bottle_name ? `${log.bottle_name} (×${log.bottle_qty || 1})` : 'بدون عبوة';
      const bottleCostStr = log.bottle_cost ? safeParseFloat(log.bottle_cost * (log.bottle_qty || 1)).toFixed(2) : '0.00';
      const dateFormatted = log.created_at ? new Date(log.created_at).toLocaleString('ar-LY') : '—';

      return [
        log.id,
        dateFormatted,
        sourceLabel,
        fragranceName,
        log.sample_volume_ml,
        bottleInfo,
        bottleCostStr,
        safeParseFloat(log.total_cost).toFixed(2),
        log.reason || 'عرض المحل',
        log.dispensed_by || '—',
        log.notes || ''
      ].map(escapeCell).join(',');
    });

    // Prepend UTF-8 BOM
    return '\uFEFF' + [headers.map(escapeCell).join(','), ...rows].join('\n');
  }
}
