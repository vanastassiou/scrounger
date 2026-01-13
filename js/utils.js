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
 * Format packaging enum value for display.
 * @param {string} packaging
 * @returns {string}
 */
export function formatPackaging(packaging) {
  if (!packaging) return '';
  const labels = {
    poly_mailer: 'Poly mailer',
    poly_mailer_large: 'Poly mailer (large)',
    box_12x8x4: '12" × 8" × 4" box',
    box_12x10x4: '12" × 10" × 4" box',
    box_14x10x4: '14" × 10" × 4" box',
    box_14x10x5: '14" × 10" × 5" box',
    box_16x8x6_boot: '16" × 8" × 6" boot box',
    box_16x12x4: '16" × 12" × 4" box',
    box_16x14x6: '16" × 14" × 6" box'
  };
  return labels[packaging] || formatStatus(packaging);
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
 * Format profit with appropriate colour class.
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

/**
 * Escape HTML special characters to prevent XSS.
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// =============================================================================
// TABLE UTILITIES
// =============================================================================

/**
 * Create a sortable table click handler.
 * Returns a function that handles header clicks for sorting.
 * @param {Object} config
 * @param {Function} config.getState - Returns { sortColumn, sortDirection }
 * @param {Function} config.setState - Updates { sortColumn, sortDirection }
 * @param {Function} config.onSort - Called after sort state changes (typically re-renders)
 * @returns {Function} Click handler that returns true if handled
 */
export function createSortableTable({ getState, setState, onSort }) {
  return function handleTableClick(e) {
    const th = e.target.closest('th[data-sort]');
    if (!th) return false;

    const col = th.dataset.sort;
    const { sortColumn, sortDirection } = getState();

    if (sortColumn === col) {
      setState({ sortColumn: col, sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' });
    } else {
      setState({ sortColumn: col, sortDirection: 'asc' });
    }

    onSort();
    return true;
  };
}

/**
 * Generic sort comparator with custom column value extraction.
 * @param {Array} data - Array to sort (sorts in place)
 * @param {string} sortColumn
 * @param {string} sortDirection - 'asc' or 'desc'
 * @param {Function} getColumnValue - (item, column) => value
 * @returns {Array} Sorted array (same reference)
 */
export function sortData(data, sortColumn, sortDirection, getColumnValue) {
  return data.sort((a, b) => {
    let aVal = getColumnValue(a, sortColumn);
    let bVal = getColumnValue(b, sortColumn);

    // Null handling
    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Create filter button controller.
 * @param {Object} config
 * @param {string} config.selector - Selector for filter buttons
 * @param {string} config.dataAttr - Data attribute name (e.g., 'category', 'tier')
 * @param {string} [config.allValue='all'] - Value that means "show all"
 * @param {Function} config.onFilter - Called with new filter value (null for 'all')
 */
export function createFilterButtons({ selector, dataAttr, allValue = 'all', onFilter }) {
  const buttons = document.querySelectorAll(selector);

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const value = btn.dataset[dataAttr];
      onFilter(value === allValue ? null : value);
    });
  });
}

/**
 * Generate empty state table row HTML.
 * @param {Object} config
 * @param {number} config.colspan - Number of columns to span
 * @param {string} config.icon - Icon/emoji to display
 * @param {string} config.message - Message text
 * @returns {string} HTML string
 */
export function emptyStateRow({ colspan, icon, message }) {
  return `
    <tr>
      <td colspan="${colspan}" class="empty-state">
        <div class="empty-icon">${icon}</div>
        <p>${message}</p>
      </td>
    </tr>
  `;
}

// =============================================================================
// CHAIN/STORE DROPDOWN
// =============================================================================

/**
 * Format chain identifier for display.
 * @param {string} chain
 * @returns {string}
 */
export function formatChainName(chain) {
  if (!chain) return '';
  const names = {
    value_village: 'Value Village',
    salvation_army: 'Salvation Army',
    hospital_auxiliary: 'Hospital Auxiliary',
    mcc: 'MCC (Mennonite)',
    animal_charity: 'Animal Charity',
    church: 'Church',
    community: 'Community'
  };
  return names[chain] || formatStatus(chain);
}

/**
 * Extract location name from store.
 * @param {Object} store
 * @returns {string}
 */
export function getLocationName(store) {
  // Extract location from store name (e.g., "Value Village - Langley" -> "Langley")
  const parts = store.name.split(' - ');
  if (parts.length > 1) {
    return parts.slice(1).join(' - ');
  }
  // If no dash, try to extract from address
  if (store.address) {
    const cityMatch = store.address.match(/,\s*([^,]+),\s*BC/);
    if (cityMatch) return cityMatch[1].trim();
  }
  return store.name;
}

/**
 * Create cascading chain/store dropdown controller.
 * @param {Object} config
 * @param {string} config.chainSelector - Chain dropdown selector
 * @param {string} config.storeSelector - Store dropdown selector
 * @param {Function} config.getAllStores - Returns array of store objects
 */
export function createChainStoreDropdown({ chainSelector, storeSelector, getAllStores }) {
  const chainSelect = document.querySelector(chainSelector);
  const storeSelect = document.querySelector(storeSelector);
  const allStores = getAllStores();

  if (!chainSelect || !storeSelect || allStores.length === 0) return;

  // Filter out hidden stores
  const visibleStores = allStores.filter(s => !s.hidden);

  // Get unique chains sorted alphabetically
  const chains = [...new Set(visibleStores.map(s => s.chain).filter(Boolean))]
    .sort((a, b) => formatChainName(a).localeCompare(formatChainName(b)));

  // Populate chain dropdown
  chainSelect.innerHTML = '<option value="">Select chain...</option>';
  chains.forEach(chain => {
    const opt = document.createElement('option');
    opt.value = chain;
    opt.textContent = formatChainName(chain);
    chainSelect.appendChild(opt);
  });

  // Handle chain selection change
  chainSelect.addEventListener('change', () => {
    const selectedChain = chainSelect.value;
    storeSelect.innerHTML = '<option value="">Select location...</option>';

    if (!selectedChain) {
      storeSelect.disabled = true;
      return;
    }

    // Get stores for selected chain
    const chainStores = visibleStores
      .filter(s => s.chain === selectedChain)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    if (chainStores.length === 1) {
      // Single location - auto-select and enable
      const store = chainStores[0];
      storeSelect.innerHTML = `<option value="${store.id}" selected>${getLocationName(store)}</option>`;
      storeSelect.disabled = false;
    } else {
      // Multiple locations - populate dropdown
      chainStores.forEach(store => {
        const opt = document.createElement('option');
        opt.value = store.id;
        opt.textContent = getLocationName(store);
        storeSelect.appendChild(opt);
      });
      storeSelect.disabled = false;
    }
  });
}

// =============================================================================
// IMAGE UTILITIES
// =============================================================================

/**
 * Compress and resize an image file.
 * @param {File} file - Image file to compress
 * @param {number} [maxDimension=1200] - Maximum width or height
 * @param {number} [quality=0.85] - JPEG quality (0-1)
 * @returns {Promise<Blob>} Compressed image blob
 */
export function compressImage(file, maxDimension = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      let { width, height } = img;

      // Scale down if needed
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = (height / width) * maxDimension;
          width = maxDimension;
        } else {
          width = (width / height) * maxDimension;
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
