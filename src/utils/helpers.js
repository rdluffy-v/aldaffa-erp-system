/**
 * ============================================================================
 * UTILITY FUNCTIONS - SHARED ACROSS APPLICATION
 * ============================================================================
 */

/**
 * Generate unique ID using timestamp + random
 * @returns {string} Unique ID
 */
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Format currency to Libyan Dinar (د.ل)
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency
 */
export const formatCurrency = (amount) => {
  const val = Number(amount) || 0;
  return `${val.toLocaleString('ar-LY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} د.ل`;
};

/**
 * Format date to Libyan Arabic locale
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date
 */
export const formatDate = (date) => {
  return new Intl.DateTimeFormat('ar-LY', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
};

/**
 * Format date to short format (date only)
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date
 */
export const formatDateShort = (date) => {
  return new Intl.DateTimeFormat('ar-LY', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(date));
};

/**
 * Calculate percentage
 * @param {number} value - Value
 * @param {number} total - Total
 * @returns {number} Percentage
 */
export const calculatePercentage = (value, total) => {
  if (total === 0) return 0;
  return (value / total) * 100;
};

/**
 * Debounce function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in ms
 * @returns {Function} Throttled function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * Clamp number between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export const clamp = (value, min, max) => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Deep clone object
 * @param {any} obj - Object to clone
 * @returns {any} Cloned object
 */
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Group array by key
 * @param {Array} array - Array to group
 * @param {string|Function} key - Key or function to group by
 * @returns {Object} Grouped object
 */
export const groupBy = (array, key) => {
  return array.reduce((result, item) => {
    const groupKey = typeof key === 'function' ? key(item) : item[key];
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
};

/**
 * Calculate Weighted Average Cost
 * @param {number} oldQty - Old quantity
 * @param {number} oldCost - Old cost per unit
 * @param {number} newQty - New quantity
 * @param {number} newCost - New cost per unit
 * @returns {number} Weighted average cost
 */
export const calculateWAC = (oldQty, oldCost, newQty, newCost) => {
  const totalQty = oldQty + newQty;
  if (totalQty === 0) return newCost;
  return (oldQty * oldCost + newQty * newCost) / totalQty;
};

/**
 * Validate required fields
 * @param {Object} data - Data to validate
 * @param {Array<string>} requiredFields - Required field names
 * @returns {Object} { valid: boolean, missing: string[] }
 */
export const validateRequired = (data, requiredFields) => {
  const missing = requiredFields.filter(field => !data[field]);
  return {
    valid: missing.length === 0,
    missing
  };
};

/**
 * Safe divide (returns 0 if divisor is 0)
 * @param {number} numerator
 * @param {number} denominator
 * @returns {number}
 */
export const safeDivide = (numerator, denominator) => {
  return denominator === 0 ? 0 : numerator / denominator;
};

/**
 * Format number with thousand separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export const formatNumber = (num) => {
  return new Intl.NumberFormat('ar-SD').format(num);
};

/**
 * Parse float safely
 * @param {any} value - Value to parse
 * @param {number} fallback - Fallback value if parse fails
 * @returns {number} Parsed number
 */
export const safeParseFloat = (value, fallback = 0) => {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
};

/**
 * Get date range for common periods
 * @param {string} period - 'today' | 'yesterday' | 'week' | 'month' | 'year'
 * @returns {Object} { start: string, end: string } ISO dates
 */
export const getDateRange = (period) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(end.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
};

/**
 * Generate a valid, scanner-compatible EAN-13 or standard numeric barcode
 * @param {string} prefix - 3-digit prefix (default: '628')
 * @returns {string} 13-digit standard valid barcode
 */
export const generateValidBarcode = (prefix = '628') => {
  const cleanPrefix = String(prefix).replace(/\D/g, '').slice(0, 3).padEnd(3, '6');
  const timePart = Date.now().toString().slice(-6);
  const randPart = Math.floor(100 + Math.random() * 900).toString();
  const raw12 = `${cleanPrefix}${timePart}${randPart}`.slice(0, 12).padEnd(12, '0');

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(raw12[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${raw12}${checkDigit}`;
};
