/**
 * ============================================================================
 * BACKWARD-COMPATIBLE DATABASE ACCESS LAYER
 * ============================================================================
 *
 * This file re-exports from the new architecture to maintain backward
 * compatibility for any module not yet migrated to the repository pattern.
 *
 * New code should import from:
 *   - src/database/connection.js  (db instance)
 *   - src/utils/helpers.js         (generateId, formatCurrency, formatDate)
 *   - src/database/repositories/*  (typed repositories)
 */

import { db } from './database/connection.js';
import { generateId, formatCurrency, formatDate } from './utils/helpers.js';

export { db, generateId, formatCurrency, formatDate };

export default db;
