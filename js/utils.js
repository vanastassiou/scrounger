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
 * Convert a string to a URL-safe slug.
 * @param {string} str - Input string
 * @returns {string} Lowercase, hyphenated, alphanumeric slug
 */
export function slugify(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate a human-readable slug ID for an item.
 * Format: {brand}-{colour}-{material}-{type}-{short_uuid}
 * Example: pendleton-red-wool-sweater-a7b3c9d2
 *
 * @param {Object} item - Item data
 * @param {string} [item.brand] - Brand name (optional, uses 'unbranded')
 * @param {Object} item.colour - Colour object with primary/secondary
 * @param {Object} item.material - Material object with primary/secondary
 * @param {Object} item.category - Category object with primary/secondary
 * @returns {string} URL-safe slug ID
 * @throws {Error} If required fields are missing
 */
export function generateSlug(item) {
  const parts = [];

  // Brand (use 'unbranded' if missing)
  const brand = item.brand?.trim() || 'unbranded';
  parts.push(slugify(brand));

  // Colour (required) - nested path
  const primaryColour = item.colour?.primary;
  if (!primaryColour) {
    throw new Error('colour.primary is required for slug generation');
  }
  parts.push(slugify(primaryColour));

  // Material (handle object or string) - nested path
  const primaryMaterial = item.material?.primary;
  let materialName;
  if (typeof primaryMaterial === 'object' && primaryMaterial?.name) {
    materialName = primaryMaterial.name;
  } else if (typeof primaryMaterial === 'string') {
    materialName = primaryMaterial;
  }
  if (!materialName) {
    throw new Error('material.primary is required for slug generation');
  }
  parts.push(slugify(materialName));

  // Type/subcategory (required) - nested path
  const subcategory = item.category?.secondary;
  if (!subcategory) {
    throw new Error('category.secondary is required for slug generation');
  }
  parts.push(slugify(subcategory));

  // Short UUID suffix (8 chars for uniqueness)
  const shortUuid = crypto.randomUUID().substring(0, 8);
  parts.push(shortUuid);

  return parts.join('-');
}

/**
 * Check if an ID is a UUID (legacy format) vs a slug (new format).
 * UUIDs are hex strings with specific patterns; slugs contain words.
 * @param {string} id - Item ID
 * @returns {boolean} True if UUID format
 */
export function isUuidFormat(id) {
  if (!id) return false;
  // UUID pattern: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (standard or variant)
  // Slugs contain words with letters beyond a-f and end with 8-char hex
  return /^[0-9a-f]{8}-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+-[0-9a-f]+$/i.test(id);
}

/**
 * Check if an item has all required fields for slug generation.
 * @param {Object} item - Item object
 * @returns {boolean} True if slug can be generated
 */
export function canGenerateSlug(item) {
  if (!item) return false;
  const primaryMaterial = item.material?.primary;
  const hasMaterial = typeof primaryMaterial === 'object'
    ? !!primaryMaterial?.name
    : !!primaryMaterial;
  return !!(item.colour?.primary && hasMaterial && item.category?.secondary);
}

/**
 * Check if an item needs slug migration.
 * @param {Object} item - Item object
 * @returns {boolean} True if item has UUID ID but could have slug
 */
export function needsSlugMigration(item) {
  return isUuidFormat(item?.id) && canGenerateSlug(item);
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
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffSecs < 60) return 'a few seconds ago';
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
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

  const purchaseCost = (item.metadata?.acquisition?.price || 0) + (item.tax_paid || 0);
  const expenses = (item.listing_status?.shipping_cost || 0) + (item.listing_status?.platform_fees || 0);
  const repairCosts = item.condition?.repairs_completed?.reduce((sum, r) => sum + (r.repair_cost || 0), 0) || 0;
  const totalCost = purchaseCost + expenses + repairCosts;

  const revenue = item.listing_status?.sold_price || 0;
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
  let className = 'value--neutral';
  if (profit > 0) className = 'value--positive';
  if (profit < 0) className = 'value--negative';

  return { formatted, className };
}

/**
 * Render a profit waterfall breakdown.
 * Shows: Sale → Fees → Payout → Cost → Profit
 * @param {Object} data
 * @param {number} data.salePrice - Sale price
 * @param {number} data.fees - Total platform fees
 * @param {number} data.payout - Net payout (salePrice - fees)
 * @param {number} data.costBasis - Total cost (purchase + tax + repairs)
 * @param {number} data.profit - Final profit (payout - costBasis)
 * @param {string} [data.feeDetails] - Optional fee breakdown text
 * @param {string} [data.costDetails] - Optional cost breakdown text
 * @param {Object} [options]
 * @param {boolean} [options.showDetails=false] - Show fee/cost details
 * @param {boolean} [options.compact=false] - Use compact styling
 * @returns {string} HTML string
 */
export function renderProfitWaterfall(data, options = {}) {
  const { salePrice, fees, payout, costBasis, profit, feeDetails, costDetails } = data;
  const { showDetails = false, compact = false } = options;

  const compactClass = compact ? ' profit-waterfall--compact' : '';
  let html = `<div class="profit-waterfall${compactClass}">`;

  // Sale
  html += `<div class="profit-waterfall__line">
    <span class="profit-waterfall__label">Sale</span>
    <span class="profit-waterfall__value">${formatCurrency(salePrice)}</span>
  </div>`;

  // Fees (with optional inline details)
  const feesLabel = showDetails && feeDetails ? `Fees (${escapeHtml(feeDetails)})` : 'Fees';
  html += `<div class="profit-waterfall__line">
    <span class="profit-waterfall__label">${feesLabel}</span>
    <span class="profit-waterfall__value profit-waterfall__value--negative">${formatCurrency(-fees)}</span>
  </div>`;

  // Payout subtotal
  html += `<div class="profit-waterfall__line profit-waterfall__line--subtotal">
    <span class="profit-waterfall__label">Payout</span>
    <span class="profit-waterfall__value">${formatCurrency(payout)}</span>
  </div>`;

  // Cost
  html += `<div class="profit-waterfall__line">
    <span class="profit-waterfall__label">Cost</span>
    <span class="profit-waterfall__value profit-waterfall__value--negative">${formatCurrency(-costBasis)}</span>
  </div>`;

  if (showDetails && costDetails) {
    html += `<div class="profit-waterfall__details">${escapeHtml(costDetails)}</div>`;
  }

  // Profit total
  const profitClass = profit >= 0 ? 'value--positive' : 'value--negative';
  html += `<div class="profit-waterfall__line profit-waterfall__line--total">
    <span class="profit-waterfall__label">Profit</span>
    <span class="profit-waterfall__value ${profitClass}">${formatCurrency(profit)}</span>
  </div>`;

  html += '</div>';
  return html;
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
 * Update sort indicator classes on table headers and mobile sort dropdown.
 * @param {HTMLElement} table - Table element
 * @param {string} sortColumn - Current sort column
 * @param {string} sortDirection - 'asc' or 'desc'
 */
export function updateSortIndicators(table, sortColumn, sortDirection) {
  const headers = table.querySelectorAll('th[data-sort]');
  headers.forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === sortColumn) {
      th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });

  // Sync mobile sort dropdown if present
  const container = table.closest('.table-container');
  if (container) {
    const dropdown = container.querySelector('.mobile-sort__select');
    if (dropdown && sortColumn) {
      dropdown.value = `${sortColumn}-${sortDirection}`;
    }
  }
}

/**
 * Create mobile sort dropdown for responsive tables.
 * Generates a dropdown from table headers with data-sort attributes.
 * @param {HTMLElement} table - Table element with sortable headers
 * @param {Object} config - Same config as createSortableTable
 * @param {Function} config.getState - Returns { sortColumn, sortDirection }
 * @param {Function} config.setState - Updates { sortColumn, sortDirection }
 * @param {Function} config.onSort - Called after sort state changes
 */
export function createMobileSortDropdown(table, { getState, setState, onSort }) {
  const container = table.closest('.table-container');
  if (!container) return;

  // Check if dropdown already exists
  if (container.querySelector('.mobile-sort')) return;

  const headers = table.querySelectorAll('th[data-sort]');
  // Skip if no sortable columns or only one (redundant)
  if (headers.length <= 1) return;

  // Build options from headers
  const options = Array.from(headers).map(th => {
    const col = th.dataset.sort;
    const label = th.textContent.trim();
    return { col, label };
  });

  // Create dropdown HTML
  const wrapper = document.createElement('div');
  wrapper.className = 'mobile-sort';
  wrapper.innerHTML = `
    <label class="mobile-sort__label">Sort by</label>
    <select class="form-select form-select--sm mobile-sort__select">
      ${options.map(opt => `
        <option value="${opt.col}-asc">${opt.label} (A-Z)</option>
        <option value="${opt.col}-desc">${opt.label} (Z-A)</option>
      `).join('')}
    </select>
  `;

  // Insert before table
  container.insertBefore(wrapper, container.firstChild);

  // Set initial value
  const { sortColumn, sortDirection } = getState();
  const select = wrapper.querySelector('select');
  if (sortColumn) {
    select.value = `${sortColumn}-${sortDirection}`;
  }

  // Handle changes
  select.addEventListener('change', () => {
    const [col, dir] = select.value.split('-');
    setState({ sortColumn: col, sortDirection: dir });
    onSort();
  });
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

// =============================================================================
// FORM HANDLER
// =============================================================================

/**
 * Create a form submission handler with validation, transformation, and callbacks.
 * Replaces repeated form handling patterns across modules.
 *
 * Usage:
 *   const handler = createFormHandler({
 *     formSelector: '#store-form',
 *     validate: (formData) => ({ valid: !!formData.get('name'), errors: ['Name is required'] }),
 *     transform: (formData) => ({ name: formData.get('name').trim(), tier: formData.get('tier') }),
 *     onSubmit: async (data) => await db.addStore(data),
 *     onSuccess: () => { showToast('Saved'); modal.close(); },
 *     onError: (err) => showToast('Failed to save')
 *   });
 *
 * @param {Object} config
 * @param {string} config.formSelector - CSS selector for form element
 * @param {Function} [config.validate] - (formData) => { valid: boolean, errors: string[] }
 * @param {Function} [config.transform] - (formData) => object to pass to onSubmit
 * @param {Function} config.onSubmit - Async (data) => void, called with transformed data
 * @param {Function} [config.onSuccess] - Called after successful submission
 * @param {Function} [config.onError] - Called with error if submission fails
 * @param {boolean} [config.resetOnSuccess=true] - Whether to reset form after success
 * @returns {Object} Handler with reset(), getForm() methods
 */
export function createFormHandler(config) {
  const form = $(config.formSelector);
  if (!form) return null;

  async function handleSubmit(e) {
    e.preventDefault();

    const formData = new FormData(form);

    // Validate
    if (config.validate) {
      const validation = config.validate(formData);
      if (!validation.valid) {
        if (config.onError) {
          config.onError(new Error(validation.errors?.[0] || 'Validation failed'));
        }
        return;
      }
    }

    // Transform
    const data = config.transform
      ? config.transform(formData)
      : Object.fromEntries(formData);

    // Submit
    try {
      await config.onSubmit(data);
      if (config.resetOnSuccess !== false) {
        form.reset();
      }
      if (config.onSuccess) config.onSuccess();
    } catch (err) {
      console.error('Form submission error:', err);
      if (config.onError) config.onError(err);
    }
  }

  form.addEventListener('submit', handleSubmit);

  return {
    reset: () => form.reset(),
    getForm: () => form,
    destroy: () => form.removeEventListener('submit', handleSubmit)
  };
}
