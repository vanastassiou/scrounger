// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Generate a UUID v4.
 * @returns {string}
 */
export function generateId() {
  return crypto.randomUUID();
}

/**
 * Get current ISO timestamp.
 * @returns {string}
 */
export function nowISO() {
  return new Date().toISOString();
}

/**
 * Get today's date as YYYY-MM-DD.
 * @returns {string}
 */
export function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Format currency for display (CAD).
 * @param {number} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount);
}

/**
 * Format date for display.
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format relative time (e.g., "3 days ago").
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
export function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Capitalize first letter.
 * @param {string} str
 * @returns {string}
 */
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format status for display (replace underscores, capitalize).
 * @param {string} status
 * @returns {string}
 */
export function formatStatus(status) {
  if (!status) return '';
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Shorthand selector.
 * @param {string} selector
 * @param {Element} [context=document]
 * @returns {Element|null}
 */
export function $(selector, context = document) {
  return context.querySelector(selector);
}

/**
 * Shorthand selector all.
 * @param {string} selector
 * @param {Element} [context=document]
 * @returns {NodeList}
 */
export function $$(selector, context = document) {
  return context.querySelectorAll(selector);
}

/**
 * Handle errors with logging and optional fallback.
 * @param {Error} err
 * @param {string} message
 * @param {*} [fallback]
 * @returns {*}
 */
export function handleError(err, message, fallback) {
  console.error(message, err);
  return fallback;
}

/**
 * Calculate profit for an inventory item.
 * @param {Object} item - Inventory item
 * @returns {Object} { profit, margin, revenue, totalCost }
 */
export function calculateProfit(item) {
  if (!item) return { profit: 0, margin: 0, revenue: 0, totalCost: 0 };

  const purchaseCost = (item.purchase_price || 0) + (item.tax_paid || 0);
  const expenses = (item.shipping_cost || 0) + (item.platform_fees || 0);
  const repairCosts = item.repairs_completed?.reduce((sum, r) => sum + (r.repair_cost || 0), 0) || 0;
  const totalCost = purchaseCost + expenses + repairCosts;

  const revenue = item.sold_price || 0;
  const profit = revenue - totalCost;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  return { profit, margin, revenue, totalCost };
}

/**
 * Format profit with appropriate color class.
 * @param {number} profit - Profit amount
 * @returns {Object} { formatted, className }
 */
export function formatProfitDisplay(profit) {
  const formatted = formatCurrency(profit);
  let className = 'profit--neutral';
  if (profit > 0) className = 'profit--positive';
  if (profit < 0) className = 'profit--negative';

  return { formatted, className };
}
