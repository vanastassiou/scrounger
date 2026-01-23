// =============================================================================
// INVENTORY MODULE
// =============================================================================

import { state } from './state.js';
import { getAllInventory, getInventoryStats, getSellingAnalytics, getInventoryItem, createInventoryItem, updateInventoryItem, deleteInventoryItem } from './db/inventory.js';
import { createAttachment, getAttachmentsByItem } from './db/attachments.js';
import { getAllTrips, getTripsByDate } from './db/trips.js';
import { showToast, createModalController } from './ui.js';
import {
  $, $$, formatCurrency, formatDate, capitalize, formatStatus, formatPackaging, escapeHtml,
  sortData, createChainStoreDropdown, formatChainName, getLocationName, compressImage,
  formatProfitDisplay, renderProfitWaterfall, getItemTitle, formatColour, formatMaterial
} from './utils.js';
import { createSubTabController, initStoreDropdown, setVisible, createLazyModal, createTableController, renderDetailSection, renderDetailSections } from './components.js';
import {
  CATEGORIES, SUBCATEGORIES, STATUS_OPTIONS, CONDITION_OPTIONS, ERA_OPTIONS,
  METAL_TYPES, CLOSURE_TYPES, JEWELRY_TESTS,
  FLAW_TYPES, FLAW_SEVERITY, WIDTH_OPTIONS, MEASUREMENT_FIELDS,
  COLOUR_OPTIONS, MATERIAL_OPTIONS, PIPELINE_STATUSES, RESALE_PLATFORMS
} from './config.js';
import { queueSync } from './sync.js';
import { generateSellingRecommendations, formatPlatformName, calculateTrendMultiplier, calculateEnhancedResaleValue } from './recommendations.js';
import { initFees, calculatePlatformFees, calculateEstimatedReturns, round } from './fees.js';
import { calculateSuggestedResaleValue } from './data-loaders.js';
import { openPhotoManager, getPhotoStatusSync } from './photos.js';

let inventoryData = [];
let inventoryTableCtrl = null;
let currentFlaws = [];
let currentSecondaryMaterials = []; // For structured secondary materials
let pendingPhotos = []; // Array of {blob, filename, mimeType, type}
let editingItemId = null;
let modalOnSave = null;
let visitContext = null; // Stores storeId/date when opened from visit workflow
let estimatedPrices = new Map(); // Cached estimated sell prices by item ID

// Photo type options for the dropdown
const PHOTO_TYPES = ['front', 'back', 'detail', 'label', 'flaw', 'hallmark', 'closure', 'measurement', 'styled'];

// Start Selling modal state
let currentSellingItem = null; // Item being listed for sale

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function isInPipeline(status) {
  return PIPELINE_STATUSES.includes(status);
}

function navigateToSelling() {
  // Switch to inventory tab, then to selling sub-tab
  document.querySelector('.tab[data-tab="inventory"]')?.click();
  const sellingTab = document.querySelector('.sub-tab[data-inv-view="selling"]');
  if (sellingTab) sellingTab.click();
}

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initInventory() {
  await initFees(); // Ensure platforms data is loaded before calculating returns
  setupTableController();
  await loadInventory();
  setupEventHandlers();
  setupFormOptions();
  setupInventorySubTabs();
}

let inventorySubTabController = null;

function setupInventorySubTabs() {
  inventorySubTabController = createSubTabController({
    tabSelector: '.sub-tab[data-inv-view]',
    dataAttr: 'invView',
    views: {
      collection: '#inv-collection-view',
      selling: '#inv-selling-view',
      archive: '#inv-archive-view'
    },
    storageKey: 'inventorySubTab',
    htmlDataAttr: 'invSub',
    defaultView: 'collection',
    onActivate: async (viewId) => {
      // Reload pipeline data when switching to selling or archive view
      if (viewId === 'selling' || viewId === 'archive') {
        const { loadPipeline } = await import('./selling.js');
        await loadPipeline();
      }
    }
  });
}

async function loadInventory() {
  inventoryData = await getAllInventory();

  // Pre-calculate estimated sell prices for collection items
  const collectionItems = inventoryData.filter(item =>
    !isInPipeline(item.metadata?.status) && item.metadata?.status !== 'sold'
  );
  // Calculate prices and photo status in parallel
  await Promise.all(collectionItems.map(async (item) => {
    // Use existing estimated_resale_value if set
    if (item.pricing?.estimated_resale_value) {
      estimatedPrices.set(item.id, item.pricing.estimated_resale_value);
    } else {
      // Calculate using enhanced resale value logic
      try {
        const result = await calculateEnhancedResaleValue(item);
        if (result?.value) {
          estimatedPrices.set(item.id, result.value);
        }
      } catch (err) {
        // Silently fail - price will show as '-'
      }
    }

    // Pre-compute photo status
    try {
      const attachments = await getAttachmentsByItem(item.id);
      item._photoStatus = getPhotoStatusSync(item, attachments);
    } catch (err) {
      // Silently fail - photo indicator won't show
    }
  }));

  if (inventoryTableCtrl) {
    inventoryTableCtrl.render();
  }
}

function setupTableController() {
  inventoryTableCtrl = createTableController({
    tableSelector: '#inventory-table',
    tbodySelector: '#inventory-tbody',
    getData: () => inventoryData,
    filterItem: (item, filters, search) => {
      // Hide items in selling pipeline or sold
      if (isInPipeline(item.metadata?.status) || item.metadata?.status === 'sold') return false;
      if (filters.category && item.category?.primary !== filters.category) return false;
      if (search) {
        const inTitle = getItemTitle(item).toLowerCase().includes(search);
        const inBrand = item.brand?.toLowerCase().includes(search);
        const inDesc = item.description?.toLowerCase().includes(search);
        if (!inTitle && !inBrand && !inDesc) return false;
      }
      return true;
    },
    getColumnValue: (item, col) => {
      if (col === 'estimated_resale_value') {
        return estimatedPrices.get(item.id) || 0;
      }
      if (col === 'est_return') {
        return item._estReturn || 0;
      }
      return item[col];
    },
    createRow: createInventoryRow,
    emptyState: { colspan: 3, icon: '👗', message: 'No items found' },
    searchSelector: '#inventory-search',
    countSelector: '#inventory-count',
    countTemplate: '{count} item{s}',
    defaultSort: { column: 'created_at', direction: 'desc' },
    filterSelects: [{ selector: '#category-filter', key: 'category' }],
    clickHandlers: {
      '.table-link': (el) => openViewItemModal(el.dataset.id),
      '.edit-item-btn': (el) => openEditItemModal(el.dataset.id, {
        onSave: async () => {
          await loadInventory();
          await renderInventoryStats();
        }
      }),
      '.start-selling-btn': (el) => openStartSellingModal(el.dataset.id),
      '.view-in-selling-btn': () => navigateToSelling(),
      '.profit-badge': (el) => openProfitBreakdownModal(el.dataset.id)
    }
  });

  inventoryTableCtrl.init();
}

export function createInventoryRow(item, options = {}) {
  const { showActions = true } = options;

  // Get estimated price from cache (may be calculated if not on item)
  const estPrice = estimatedPrices.get(item.id) || item.pricing?.estimated_resale_value || 0;

  // Calculate estimated return range across platforms
  let estReturnHtml = '-';
  let estReturnValue = 0;
  if (estPrice > 0) {
    // Create temp item with cached price for calculation (nested under pricing)
    const itemWithPrice = { ...item, pricing: { ...item.pricing, estimated_resale_value: estPrice } };
    const estimates = calculateEstimatedReturns(itemWithPrice);
    if (estimates.length > 0) {
      const profits = estimates.map(e => e.profit);
      const minProfit = Math.min(...profits);
      const maxProfit = Math.max(...profits);
      estReturnValue = maxProfit; // Use max for sorting

      const profitClass = maxProfit >= 0 ? 'value--positive' : 'value--negative';
      const rangeText = minProfit === maxProfit
        ? formatCurrency(maxProfit)
        : `${formatCurrency(minProfit)} – ${formatCurrency(maxProfit)}`;
      estReturnHtml = `<span class="${profitClass}">${rangeText}</span>`;
    }
  }

  // Store for sorting
  item._estReturn = estReturnValue;

  return `
    <tr data-id="${item.id}" class="collection-row">
      <td>
        <a href="#" class="table-link" data-id="${item.id}">${escapeHtml(getItemTitle(item))}</a>
      </td>
      <td data-label="Est. Return" class="col-numeric">${estReturnHtml}</td>
      <td class="table-actions">
        <button class="btn btn--sm btn--ghost edit-item-btn" data-id="${item.id}">Edit</button>
        <button class="btn btn--sm btn--primary start-selling-btn" data-id="${item.id}">Sell</button>
      </td>
    </tr>
  `;
}

function setupEventHandlers() {
  // Item form submission
  const form = $('#item-form');
  if (form) {
    form.addEventListener('submit', handleItemSubmit);
  }

  // Category change - update subcategories and conditional fields
  const catSelect = $('#item-category');
  if (catSelect) {
    catSelect.addEventListener('change', handleCategoryChange);
  }

  // Subcategory change - for ring size visibility
  const subcatSelect = $('#item-subcategory');
  if (subcatSelect) {
    subcatSelect.addEventListener('change', handleSubcategoryChange);
  }

  // Flaw select - add flaw
  const flawSelect = $('#add-flaw-select');
  if (flawSelect) {
    flawSelect.addEventListener('change', handleAddFlaw);
  }

  // Date change - update trip dropdown to show matching trips
  const dateInput = $('#item-acquisition-date');
  if (dateInput) {
    dateInput.addEventListener('change', handleAcquisitionDateChange);
  }

  // Secondary materials - add material button
  const addMaterialBtn = $('#add-secondary-material');
  if (addMaterialBtn) {
    addMaterialBtn.addEventListener('click', handleAddSecondaryMaterial);
  }

  // Cancel button
  const cancelBtn = $('#item-form-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => addItemModal?.close());
  }

  // Photo capture
  initPhotoCapture();
}

// =============================================================================
// FORM OPTIONS SETUP
// =============================================================================

function setupFormOptions() {
  // Category
  populateSelect('#item-category', CATEGORIES, capitalize);

  // Era
  populateSelect('#item-era', ERA_OPTIONS, formatEra);

  // Colours
  populateSelect('#item-primary-colour', COLOUR_OPTIONS, formatColour);
  populateSelect('#item-secondary-colour', COLOUR_OPTIONS, formatColour);

  // Primary material
  populateSelect('#item-primary-material', MATERIAL_OPTIONS, formatMaterial);

  // Store
  populateStoreSelect();

  // Condition
  populateSelect('#item-condition', CONDITION_OPTIONS, formatStatus);

  // Metal type
  populateSelect('#item-metal-type', METAL_TYPES, formatMetalType);

  // Closure type
  populateSelect('#item-closure-type', CLOSURE_TYPES, formatStatus);

  // Width (shoes)
  populateSelect('#item-width', WIDTH_OPTIONS, capitalize);

  // Flaw select
  populateSelect('#add-flaw-select', FLAW_TYPES, formatStatus, '+ Add flaw...');

  // Jewelry tests checkboxes
  renderCheckboxGroup('#jewelry-tests-group', JEWELRY_TESTS, 'tested_with', formatStatus);
}

function populateSelect(selector, options, formatter, defaultLabel = 'Select...') {
  const select = $(selector);
  if (!select) return;

  // Keep existing options or set default
  if (select.options.length <= 1) {
    select.innerHTML = `<option value="">${defaultLabel}</option>`;

    // Sort options alphabetically by formatted display text
    const sorted = [...options].sort((a, b) => {
      const textA = formatter(a).toLowerCase();
      const textB = formatter(b).toLowerCase();
      return textA.localeCompare(textB);
    });

    sorted.forEach(opt => {
      const el = document.createElement('option');
      el.value = opt;
      el.textContent = formatter(opt);
      select.appendChild(el);
    });
  }
}

function populateStoreSelect() {
  initStoreDropdown({
    chainSelector: '#item-chain',
    storeSelector: '#item-store',
    getAllStores: () => state.getAllStores()
  }, createChainStoreDropdown);
}

/**
 * Populate trip dropdown with trips, optionally filtered by date.
 * @param {string} [dateFilter] - Optional date to filter trips (YYYY-MM-DD)
 * @param {string} [selectedTripId] - Optional trip ID to pre-select
 */
async function populateTripDropdown(dateFilter = null, selectedTripId = null) {
  const tripSelect = $('#item-trip');
  if (!tripSelect) return;

  // Get trips - either filtered by date or all
  let trips;
  if (dateFilter) {
    trips = await getTripsByDate(dateFilter);
  } else {
    trips = await getAllTrips();
  }

  // Build options
  tripSelect.innerHTML = '<option value="">No trip linked</option>';

  // Sort by date descending (most recent first)
  trips.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Limit to recent trips (last 30 days or 20 trips max)
  const recentTrips = trips.slice(0, 20);

  for (const trip of recentTrips) {
    const opt = document.createElement('option');
    opt.value = trip.id;

    // Build display text: date + store names
    const storeNames = (trip.stores || [])
      .map(s => {
        const store = state.getStore(s.storeId);
        return store?.name || s.storeId;
      })
      .join(', ');
    opt.textContent = `${formatDate(trip.date)}${storeNames ? ` - ${storeNames}` : ''}`;

    if (selectedTripId && trip.id === selectedTripId) {
      opt.selected = true;
    }
    tripSelect.appendChild(opt);
  }

  // If selected trip not in list, add it
  if (selectedTripId && !recentTrips.find(t => t.id === selectedTripId)) {
    const trips = await getAllTrips();
    const selectedTrip = trips.find(t => t.id === selectedTripId);
    if (selectedTrip) {
      const opt = document.createElement('option');
      opt.value = selectedTrip.id;
      const storeNames = (selectedTrip.stores || [])
        .map(s => {
          const store = state.getStore(s.storeId);
          return store?.name || s.storeId;
        })
        .join(', ');
      opt.textContent = `${formatDate(selectedTrip.date)}${storeNames ? ` - ${storeNames}` : ''}`;
      opt.selected = true;
      tripSelect.appendChild(opt);
    }
  }
}

function renderCheckboxGroup(selector, options, namePrefix, formatter) {
  const container = $(selector);
  if (!container) return;

  // Sort options alphabetically by formatted display text
  const sorted = [...options].sort((a, b) =>
    formatter(a).toLowerCase().localeCompare(formatter(b).toLowerCase())
  );

  container.innerHTML = sorted.map(opt => `
    <label class="form-checkbox form-checkbox--inline">
      <input type="checkbox" name="${namePrefix}[]" value="${opt}">
      <span>${formatter(opt)}</span>
    </label>
  `).join('');
}

// =============================================================================
// FORMATTERS
// =============================================================================

function formatEra(era) {
  if (era === 'unknown') return 'Unknown';
  if (era === 'pre_1920s') return 'Pre-1920s';
  if (era === 'contemporary') return 'Contemporary';
  return era;
}

function formatMetalType(type) {
  const map = {
    'gold_24k': '24K Gold',
    'gold_22k': '22K Gold',
    'gold_18k': '18K Gold',
    'gold_14k': '14K Gold',
    'gold_10k': '10K Gold',
    'gold_9k': '9K Gold',
    'gold_filled': 'Gold Filled',
    'gold_plated': 'Gold Plated',
    'rolled_gold': 'Rolled Gold',
    'vermeil': 'Vermeil',
    'sterling_silver': 'Sterling Silver',
    'coin_silver': 'Coin Silver',
    'silver_plated': 'Silver Plated',
    'platinum': 'Platinum',
    'palladium': 'Palladium',
    'brass': 'Brass',
    'copper': 'Copper',
    'bronze': 'Bronze',
    'pewter': 'Pewter',
    'stainless_steel': 'Stainless Steel',
    'base_metal': 'Base Metal',
    'unknown': 'Unknown'
  };
  return map[type] || formatStatus(type);
}

/**
 * Parse and format material strings with percentages.
 * Examples:
 *   "100% cashmere" → "Cashmere (100%)"
 *   "70% wool/30% cashmere" → "Wool (70%), Cashmere (30%)"
 *   "Cashmere" → "Cashmere (100%)"
 */
function formatMaterialString(str) {
  if (!str) return '';

  // Pattern to match "XX% material" segments
  const percentPattern = /(\d+%)\s*([^\/,]+)/g;
  const matches = [...str.matchAll(percentPattern)];

  if (matches.length > 0) {
    // Has percentage info - format as "Material (XX%)"
    return matches.map(m => {
      const pct = m[1];
      const material = m[2].trim();
      const formatted = material.replace(/\b\w/g, c => c.toUpperCase());
      return `${formatted} (${pct})`;
    }).join(', ');
  }

  // No percentages - assume 100% and capitalize
  const formatted = str.replace(/\b\w/g, c => c.toUpperCase());
  return `${formatted} (100%)`;
}

// =============================================================================
// SECONDARY MATERIALS HANDLERS
// =============================================================================

function handleAddSecondaryMaterial() {
  currentSecondaryMaterials.push({ name: '', percentage: null });
  renderSecondaryMaterialsList();
}

function renderSecondaryMaterialsList() {
  const container = $('#secondary-materials-list');
  if (!container) return;

  if (currentSecondaryMaterials.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = currentSecondaryMaterials.map((mat, idx) => `
    <div class="material-item" data-index="${idx}">
      <select class="form-select" data-material-idx="${idx}">
        <option value="">Select...</option>
        ${MATERIAL_OPTIONS.map(opt =>
          `<option value="${opt}" ${mat.name === opt ? 'selected' : ''}>${formatMaterial(opt)}</option>`
        ).join('')}
      </select>
      <input type="number" class="form-input form-input--narrow" data-pct-idx="${idx}"
             min="1" max="100" value="${mat.percentage || ''}" placeholder="%">
      <button type="button" class="btn btn--icon material-remove" data-remove-idx="${idx}">&times;</button>
    </div>
  `).join('');

  // Add event listeners for changes and removal
  container.querySelectorAll('[data-material-idx]').forEach(select => {
    select.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.materialIdx);
      currentSecondaryMaterials[idx].name = e.target.value;
    });
  });

  container.querySelectorAll('[data-pct-idx]').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.pctIdx);
      currentSecondaryMaterials[idx].percentage = parseInt(e.target.value) || null;
    });
  });

  container.querySelectorAll('[data-remove-idx]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.removeIdx);
      currentSecondaryMaterials.splice(idx, 1);
      renderSecondaryMaterialsList();
    });
  });
}

function collectSecondaryMaterials() {
  return currentSecondaryMaterials
    .filter(m => m.name)
    .map(m => ({ name: m.name, percentage: m.percentage }));
}

// =============================================================================
// CONDITIONAL FIELD HANDLERS
// =============================================================================

function handleCategoryChange(e) {
  const category = e.target.value;

  // Update subcategory options
  const subcatSelect = $('#item-subcategory');
  if (subcatSelect) {
    if (category && SUBCATEGORIES[category]) {
      subcatSelect.disabled = false;
      subcatSelect.innerHTML = '<option value="">Select...</option>';

      // Sort subcategories alphabetically
      const sorted = [...SUBCATEGORIES[category]].sort((a, b) =>
        formatStatus(a).toLowerCase().localeCompare(formatStatus(b).toLowerCase())
      );

      sorted.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub;
        opt.textContent = formatStatus(sub);
        subcatSelect.appendChild(opt);
      });
    } else {
      subcatSelect.disabled = true;
      subcatSelect.innerHTML = '<option value="">Select category first</option>';
    }
  }

  // Show/hide jewelry section
  const jewelrySection = $('#jewelry-section');
  if (jewelrySection) {
    jewelrySection.hidden = category !== 'jewelry';
  }

  // Show/hide shoe width
  const shoeWidthGroup = $('#shoe-width-group');
  if (shoeWidthGroup) {
    shoeWidthGroup.hidden = category !== 'shoes';
  }

  // Show/hide ring size (will be refined by subcategory)
  const ringSizeGroup = $('#ring-size-group');
  if (ringSizeGroup) {
    ringSizeGroup.hidden = true; // Default hidden, shown by subcategory
  }

  // Update measurements grid
  renderMeasurementsGrid(category);
}

function handleSubcategoryChange(e) {
  const subcategory = e.target.value;
  const category = $('#item-category')?.value;

  // Show ring size field only for rings
  const ringSizeGroup = $('#ring-size-group');
  if (ringSizeGroup) {
    ringSizeGroup.hidden = !(category === 'jewelry' && subcategory === 'ring');
  }
}

/**
 * Handle acquisition date change - filter trip dropdown to show matching trips.
 */
async function handleAcquisitionDateChange(e) {
  const selectedDate = e.target.value;
  const currentTripId = $('#item-trip')?.value || null;

  // Populate trips, prioritizing those matching the selected date
  await populateTripDropdown(selectedDate, currentTripId);
}

function renderMeasurementsGrid(category) {
  const grid = $('#measurements-grid');
  if (!grid) return;

  const fields = MEASUREMENT_FIELDS[category] || [];

  if (fields.length === 0) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = fields.map(field => `
    <div class="measurement-field">
      <label class="form-label" for="item-${field.key}">${field.label}</label>
      <div class="input-with-unit">
        <input type="number" class="form-input" id="item-${field.key}" name="${field.key}" step="0.25" min="0">
        <span class="input-unit">${field.unit}</span>
      </div>
    </div>
  `).join('');
}

// =============================================================================
// FLAW MANAGEMENT
// =============================================================================

function handleAddFlaw(e) {
  const flawType = e.target.value;
  if (!flawType) return;

  // Reset select
  e.target.value = '';

  // Check if already added
  if (currentFlaws.some(f => f.type === flawType)) {
    showToast('Flaw already added');
    return;
  }

  // Add flaw with default values
  currentFlaws.push({
    type: flawType,
    severity: 'minor',
    location: '',
    repairable: false,
    affects_wearability: false
  });

  renderFlawsList();
}

function renderFlawsList() {
  const container = $('#flaws-list');
  if (!container) return;

  if (currentFlaws.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = currentFlaws.map((flaw, idx) => `
    <div class="flaw-item" data-index="${idx}">
      <div class="flaw-item-header">
        <span class="flaw-type">${formatStatus(flaw.type)}</span>
        <button type="button" class="flaw-remove" data-index="${idx}">&times;</button>
      </div>
      <div class="flaw-item-fields">
        <select class="form-select form-select--sm" name="flaw_severity_${idx}">
          ${FLAW_SEVERITY.map(s => `<option value="${s}" ${flaw.severity === s ? 'selected' : ''}>${capitalize(s)}</option>`).join('')}
        </select>
        <input type="text" class="form-input form-input--sm" name="flaw_location_${idx}" placeholder="Location" value="${flaw.location}">
        <label class="form-checkbox form-checkbox--sm">
          <input type="checkbox" name="flaw_repairable_${idx}" ${flaw.repairable ? 'checked' : ''}>
          <span>Repairable</span>
        </label>
      </div>
    </div>
  `).join('');

  // Add remove handlers
  container.querySelectorAll('.flaw-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      currentFlaws.splice(idx, 1);
      renderFlawsList();
    });
  });

  // Update flaw data on change
  container.querySelectorAll('select, input').forEach(el => {
    el.addEventListener('change', () => updateFlawData());
  });
}

function updateFlawData() {
  currentFlaws.forEach((flaw, idx) => {
    const severityEl = $(`[name="flaw_severity_${idx}"]`);
    const locationEl = $(`[name="flaw_location_${idx}"]`);
    const repairableEl = $(`[name="flaw_repairable_${idx}"]`);

    if (severityEl) flaw.severity = severityEl.value;
    if (locationEl) flaw.location = locationEl.value;
    if (repairableEl) flaw.repairable = repairableEl.checked;
  });
}

// =============================================================================
// PHOTO CAPTURE
// =============================================================================

function initPhotoCapture() {
  const captureBtn = $('#photo-capture-btn');
  const uploadBtn = $('#photo-upload-btn');
  const fileInput = $('#photo-file-input');

  if (!fileInput) return;

  captureBtn?.addEventListener('click', () => {
    fileInput.setAttribute('capture', 'environment');
    fileInput.click();
  });

  uploadBtn?.addEventListener('click', () => {
    fileInput.removeAttribute('capture');
    fileInput.click();
  });

  fileInput.addEventListener('change', handlePhotoSelect);

  // Handle photo grid clicks (remove, type change)
  const grid = $('#photo-preview-grid');
  if (grid) {
    grid.addEventListener('click', handlePhotoGridClick);
    grid.addEventListener('change', handlePhotoTypeChange);
  }
}

async function handlePhotoSelect(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  for (const file of files) {
    try {
      const blob = await compressImage(file, 1200, 0.85);
      pendingPhotos.push({
        blob,
        filename: file.name.replace(/\.[^/.]+$/, '.jpg'), // Change extension to .jpg
        mimeType: 'image/jpeg',
        type: 'detail' // Default type
      });
    } catch (err) {
      console.error('Failed to compress image:', err);
      showToast('Failed to process image');
    }
  }

  renderPhotoPreview();
  e.target.value = ''; // Reset for re-selection
}

function handlePhotoGridClick(e) {
  const removeBtn = e.target.closest('.photo-remove-btn');
  if (removeBtn) {
    const index = parseInt(removeBtn.dataset.index, 10);
    // Revoke URL to prevent memory leak
    const photo = pendingPhotos[index];
    if (photo?._previewUrl) {
      URL.revokeObjectURL(photo._previewUrl);
    }
    pendingPhotos.splice(index, 1);
    renderPhotoPreview();
  }
}

function handlePhotoTypeChange(e) {
  const select = e.target.closest('.photo-type-select');
  if (select) {
    const index = parseInt(select.dataset.index, 10);
    if (pendingPhotos[index]) {
      pendingPhotos[index].type = select.value;
    }
  }
}

function renderPhotoPreview() {
  const grid = $('#photo-preview-grid');
  if (!grid) return;

  if (pendingPhotos.length === 0) {
    grid.innerHTML = '<p class="text-muted">No photos added</p>';
    return;
  }

  grid.innerHTML = pendingPhotos.map((photo, index) => {
    // Create preview URL if not exists
    if (!photo._previewUrl) {
      photo._previewUrl = URL.createObjectURL(photo.blob);
    }

    return `
      <div class="photo-preview-item" data-index="${index}">
        <img src="${photo._previewUrl}" alt="Photo ${index + 1}">
        <select class="photo-type-select" data-index="${index}">
          ${PHOTO_TYPES.map(type => `
            <option value="${type}" ${photo.type === type ? 'selected' : ''}>${capitalize(type)}</option>
          `).join('')}
        </select>
        <button type="button" class="photo-remove-btn" data-index="${index}">&times;</button>
      </div>
    `;
  }).join('');
}

function clearPendingPhotos() {
  // Revoke all preview URLs to prevent memory leaks
  pendingPhotos.forEach(photo => {
    if (photo._previewUrl) {
      URL.revokeObjectURL(photo._previewUrl);
    }
  });
  pendingPhotos = [];
  renderPhotoPreview();
}

// =============================================================================
// STATS
// =============================================================================

export async function renderInventoryStats() {
  const stats = await getInventoryStats();
  const analytics = await getSellingAnalytics();

  // Inventory stats
  const totalEl = $('#stat-total-items');
  const investedEl = $('#stat-total-invested');

  if (totalEl) totalEl.textContent = stats.total;
  if (investedEl) investedEl.textContent = formatCurrency(stats.totalInvested);

  // Selling stats
  const revenueEl = $('#stat-revenue');
  const profitEl = $('#stat-profit');
  const marginEl = $('#stat-margin');

  if (revenueEl) revenueEl.textContent = formatCurrency(analytics.totalRevenue);
  if (profitEl) {
    const { formatted, className } = formatProfitDisplay(analytics.totalProfit);
    profitEl.textContent = formatted;
    profitEl.className = `stat-value ${className}`;
  }
  if (marginEl) {
    const margin = analytics.profitMargin;
    marginEl.textContent = `${margin.toFixed(1)}%`;
    let marginClass = 'value--neutral';
    if (margin > 0) marginClass = 'value--positive';
    if (margin < 0) marginClass = 'value--negative';
    marginEl.className = `stat-value ${marginClass}`;
  }
}

// =============================================================================
// ADD/EDIT ITEM MODAL
// =============================================================================

const addItemModal = createLazyModal('#add-item-dialog', {
  onOpen: () => {
    // Ensure stores are populated (may have loaded after initial setup)
    populateStoreSelect();
    // Populate trips dropdown with recent trips
    const dateInput = $('#item-acquisition-date');
    populateTripDropdown(dateInput?.value || null);
  }
});

export function openAddItemModal(context = null) {
  // Reset form and editing state
  resetItemForm();
  editingItemId = null;
  modalOnSave = context?.onSave || null;

  // Update modal title
  const titleEl = $('#add-item-dialog .modal-header h2');
  if (titleEl) titleEl.textContent = 'Add item';

  // Apply context if provided (from visit workflow)
  // Hide store/date fields and store context values for submission
  if (context?.storeId && context?.date) {
    visitContext = {
      storeId: context.storeId,
      date: context.date,
      tripId: context.tripId || null
    };

    const storeGroup = $('#store-field-group');
    const dateGroup = $('#date-field-group');
    if (storeGroup) storeGroup.hidden = true;
    if (dateGroup) dateGroup.hidden = true;

    // Still set the values for form submission
    const chainSelect = $('#item-chain');
    const storeSelect = $('#item-store');
    const dateInput = $('#item-acquisition-date');
    // Set chain and location for hidden form submission
    const store = state.getStore(context.storeId);
    if (store?.chain && chainSelect) {
      chainSelect.value = store.chain;
      chainSelect.dispatchEvent(new Event('change'));
      chainSelect.removeAttribute('required');
    }
    if (storeSelect) {
      setTimeout(() => { storeSelect.value = context.storeId; }, 0);
      storeSelect.removeAttribute('required');
    }
    if (dateInput) {
      dateInput.value = context.date;
      dateInput.removeAttribute('required');
    }

    // Hide trip field if tripId is provided in context
    const tripGroup = $('#trip-field-group');
    if (context.tripId && tripGroup) {
      tripGroup.hidden = true;
    }
    // Populate trip dropdown with context tripId pre-selected
    populateTripDropdown(context.date, context.tripId);
  }

  addItemModal.open();
}

export async function openEditItemModal(itemId, context = null) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  // Reset form first
  resetItemForm();

  // Populate form with item data
  populateFormWithItem(item);

  // Set editing state
  editingItemId = itemId;
  modalOnSave = context?.onSave || null;

  // Update modal title
  const titleEl = $('#add-item-dialog .modal-header h2');
  if (titleEl) titleEl.textContent = 'Edit item';

  // Hide store/date if editing from visit workflow
  if (context?.lockStoreDate) {
    visitContext = {
      storeId: item.metadata?.acquisition?.store_id,
      date: item.metadata?.acquisition?.date
    };

    const storeGroup = $('#store-field-group');
    const dateGroup = $('#date-field-group');
    if (storeGroup) storeGroup.hidden = true;
    if (dateGroup) dateGroup.hidden = true;

    const storeSelect = $('#item-store');
    const dateInput = $('#item-acquisition-date');
    if (storeSelect) storeSelect.removeAttribute('required');
    if (dateInput) dateInput.removeAttribute('required');
  }

  // Mobile: collapse all sections by default when editing
  if (window.innerWidth <= 600) {
    const dialog = $('#add-item-dialog');
    dialog?.querySelectorAll('details.form-section--collapsible').forEach(d => {
      d.removeAttribute('open');
    });
  }

  addItemModal.open();
}

function populateFormWithItem(item) {
  // Basic info (title is computed from item properties, not stored)
  setValue('#item-category', item.category?.primary);
  setValue('#item-brand', item.brand);
  setValue('#item-country', item.country_of_manufacture);
  setValue('#item-era', item.era);

  // Colours (nested)
  setValue('#item-primary-colour', item.colour?.primary);
  setValue('#item-secondary-colour', item.colour?.secondary);

  // Trigger category change to populate subcategory options
  if (item.category?.primary) {
    handleCategoryChange({ target: { value: item.category.primary } });
    // After subcategory options are populated, set the value
    setTimeout(() => {
      setValue('#item-subcategory', item.category?.secondary);
      // Trigger subcategory change for ring size
      if (item.category?.secondary) {
        handleSubcategoryChange({ target: { value: item.category.secondary } });
      }
    }, 0);
  }

  // Acquisition - set chain first, then location (nested under metadata)
  const storeId = item.metadata?.acquisition?.store_id;
  if (storeId) {
    const store = state.getStore(storeId);
    if (store?.chain) {
      setValue('#item-chain', store.chain);
      // Trigger change to populate locations
      const chainSelect = $('#item-chain');
      if (chainSelect) {
        chainSelect.dispatchEvent(new Event('change'));
        // Set location after dropdown is populated
        setTimeout(() => setValue('#item-store', storeId), 0);
      }
    } else {
      setValue('#item-store', storeId);
    }
  }
  setValue('#item-acquisition-date', item.metadata?.acquisition?.date);
  setValue('#item-price', item.metadata?.acquisition?.price);
  setValue('#item-tax', item.tax_paid);

  // Trip linkage (populate dropdown and select)
  const tripId = item.metadata?.acquisition?.trip_id;
  const acqDate = item.metadata?.acquisition?.date;
  populateTripDropdown(acqDate, tripId);

  // Sizing (nested under size)
  setValue('#item-labeled-size', item.size?.label?.value);
  setValue('#item-size-gender', item.size?.label?.gender);
  setValue('#item-width', item.shoes_specific?.width);
  setValue('#item-ring-size', item.jewelry_specific?.ring_size);

  // Populate measurements
  const category = item.category?.primary;
  if (item.size?.measurements && category) {
    const fields = MEASUREMENT_FIELDS[category] || [];
    fields.forEach(field => {
      if (item.size.measurements[field.key]) {
        setValue(`#item-${field.key}`, item.size.measurements[field.key]);
      }
    });
  }

  // Materials (nested under material)
  const primaryMaterial = item.material?.primary;
  if (primaryMaterial && typeof primaryMaterial === 'object') {
    setValue('#item-primary-material', primaryMaterial.name);
    setValue('#item-primary-material-pct', primaryMaterial.percentage);
  } else if (typeof primaryMaterial === 'string') {
    // Legacy: try to find matching material option
    const materialLower = primaryMaterial.toLowerCase().replace(/\s+/g, '_');
    if (MATERIAL_OPTIONS.includes(materialLower)) {
      setValue('#item-primary-material', materialLower);
    }
  }

  // Secondary materials (nested under material.secondary)
  if (Array.isArray(item.material?.secondary)) {
    currentSecondaryMaterials = item.material.secondary.map(m => ({ ...m }));
  } else {
    currentSecondaryMaterials = [];
  }
  renderSecondaryMaterialsList();

  // Condition (nested)
  setValue('#item-condition', item.condition?.overall_condition);
  setValue('#item-condition-notes', item.condition?.condition_notes);

  // Flaws (nested under condition)
  currentFlaws = item.condition?.flaws ? [...item.condition.flaws] : [];
  renderFlawsList();

  // Status and pricing (nested)
  setValue('#item-status', item.metadata?.status);
  setValue('#item-estimated-value', item.pricing?.estimated_resale_value);
  setValue('#item-min-price', item.pricing?.minimum_acceptable_price);
  setValue('#item-brand-multiplier', item.pricing?.brand_premium_multiplier || 1.0);

  // Jewelry-specific (nested)
  if (category === 'jewelry') {
    setValue('#item-metal-type', item.jewelry_specific?.metal_type);
    setValue('#item-closure-type', item.jewelry_specific?.closure_type);
    setValue('#item-hallmarks', item.jewelry_specific?.hallmarks);
    setValue('#item-stones', item.jewelry_specific?.stones);
    setCheckboxGroup('tested_with[]', item.jewelry_specific?.tested_with);
  }

  // Description
  setValue('#item-description', item.description);
}

function setValue(selector, value) {
  const el = $(selector);
  if (el && value != null) {
    el.value = value;
  }
}

function setChecked(selector, checked) {
  const el = $(selector);
  if (el) {
    el.checked = !!checked;
  }
}

function setCheckboxGroup(name, values) {
  if (!values?.length) return;
  const checkboxes = $$(`input[name="${name}"]`);
  checkboxes.forEach(cb => {
    cb.checked = values.includes(cb.value);
  });
}

function resetItemForm() {
  const form = $('#item-form');
  if (!form) return;

  form.reset();

  // Clear visit context and restore store/date/trip field visibility
  visitContext = null;
  const storeGroup = $('#store-field-group');
  const dateGroup = $('#date-field-group');
  const tripGroup = $('#trip-field-group');
  const chainSelect = $('#item-chain');
  const storeSelect = $('#item-store');
  const dateInput = $('#item-acquisition-date');
  if (storeGroup) storeGroup.hidden = false;
  if (dateGroup) dateGroup.hidden = false;
  if (tripGroup) tripGroup.hidden = false;
  if (chainSelect) {
    chainSelect.value = '';
    chainSelect.setAttribute('required', '');
  }
  if (storeSelect) {
    storeSelect.innerHTML = '<option value="">Select location...</option>';
    storeSelect.disabled = true;
    storeSelect.setAttribute('required', '');
  }
  if (dateInput) {
    dateInput.disabled = false;
    dateInput.setAttribute('required', '');
  }

  // Reset trip dropdown
  const tripSelect = $('#item-trip');
  if (tripSelect) {
    tripSelect.innerHTML = '<option value="">No trip linked</option>';
  }

  // Reset flaws
  currentFlaws = [];
  renderFlawsList();

  // Reset secondary materials
  currentSecondaryMaterials = [];
  renderSecondaryMaterialsList();

  // Reset photos
  clearPendingPhotos();

  // Reset colour dropdowns
  const primaryColour = $('#item-primary-colour');
  const secondaryColour = $('#item-secondary-colour');
  if (primaryColour) primaryColour.value = '';
  if (secondaryColour) secondaryColour.value = '';

  // Reset material fields
  const primaryMaterial = $('#item-primary-material');
  const primaryMaterialPct = $('#item-primary-material-pct');
  if (primaryMaterial) primaryMaterial.value = '';
  if (primaryMaterialPct) primaryMaterialPct.value = '100';

  // Reset country field
  const countryInput = $('#item-country');
  if (countryInput) countryInput.value = '';

  // Set defaults
  const today = new Date().toISOString().split('T')[0];
  if (dateInput) dateInput.value = today;

  const statusInput = $('#item-status');
  if (statusInput) statusInput.value = 'in_collection';

  const conditionInput = $('#item-condition');
  if (conditionInput) conditionInput.value = 'good';

  const multiplierInput = $('#item-brand-multiplier');
  if (multiplierInput) multiplierInput.value = '1.0';

  // Reset conditional fields
  const subcatSelect = $('#item-subcategory');
  if (subcatSelect) {
    subcatSelect.disabled = true;
    subcatSelect.innerHTML = '<option value="">Select category first</option>';
  }

  const jewelrySection = $('#jewelry-section');
  if (jewelrySection) jewelrySection.hidden = true;

  const shoeWidthGroup = $('#shoe-width-group');
  if (shoeWidthGroup) shoeWidthGroup.hidden = true;

  const ringSizeGroup = $('#ring-size-group');
  if (ringSizeGroup) ringSizeGroup.hidden = true;

  const measurementsGrid = $('#measurements-grid');
  if (measurementsGrid) measurementsGrid.innerHTML = '';

  // Uncheck all checkboxes in checkbox groups
  $$('#jewelry-tests-group input[type="checkbox"]').forEach(cb => cb.checked = false);
}

async function handleItemSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const categoryPrimary = formData.get('category');
  const categorySecondary = formData.get('subcategory')?.trim() || null;
  const brand = formData.get('brand')?.trim() || null;

  // Get colour fields
  const primaryColour = formData.get('primary_colour') || null;
  const secondaryColour = formData.get('secondary_colour') || null;
  const primaryMaterialName = formData.get('primary_material_name') || null;
  const primaryMaterialPct = parseInt(formData.get('primary_material_percentage')) || 100;

  // Collect secondary materials
  const secondaryMaterials = collectSecondaryMaterials();

  // Get size for item
  const labeledSizeValue = formData.get('labeled_size')?.trim() || null;
  const sizeGender = formData.get('size_gender') || null;

  // Build item object with new nested schema (title is computed on-the-fly via getItemTitle)
  const item = {
    brand: brand,
    country_of_manufacture: formData.get('country_of_manufacture')?.trim() || null,
    era: formData.get('era') || null,
    description: formData.get('description')?.trim() || null,
    tax_paid: parseFloat(formData.get('tax_paid')) || 0,

    // Category (nested)
    category: {
      primary: categoryPrimary,
      secondary: categorySecondary
    },

    // Colours (nested)
    colour: {
      primary: primaryColour,
      secondary: secondaryColour
    },

    // Materials (nested)
    material: {
      primary: primaryMaterialName ? {
        name: primaryMaterialName,
        percentage: primaryMaterialPct
      } : null,
      secondary: secondaryMaterials.length > 0 ? secondaryMaterials : null
    },

    // Size (nested)
    size: {
      label: {
        gender: sizeGender,
        value: labeledSizeValue
      },
      measurements: collectMeasurements(formData, categoryPrimary)
    },

    // Condition (nested)
    condition: {
      overall_condition: formData.get('condition') || null,
      condition_notes: formData.get('condition_notes')?.trim() || null,
      flaws: currentFlaws.length > 0 ? [...currentFlaws] : null,
      repairs_completed: null,
      repairs_needed: null
    },

    // Pricing (nested)
    pricing: {
      estimated_resale_value: parseFloat(formData.get('estimated_resale_value')) || null,
      minimum_acceptable_price: parseFloat(formData.get('minimum_acceptable_price')) || null,
      brand_premium_multiplier: parseFloat(formData.get('brand_premium_multiplier')) || 1.0
    },

    // Metadata (nested)
    metadata: {
      acquisition: {
        store_id: visitContext?.storeId || formData.get('store_id'),
        trip_id: visitContext?.tripId || formData.get('trip_id') || null,
        date: visitContext?.date || formData.get('acquisition_date') || new Date().toISOString().split('T')[0],
        price: parseFloat(formData.get('purchase_price')) || 0,
        packaging: formData.get('packaging') || null
      },
      status: formData.get('status') || 'in_collection'
    }
  };

  // Add category-specific fields
  if (categoryPrimary === 'jewelry') {
    item.jewelry_specific = {
      metal_type: formData.get('metal_type') || null,
      closure_type: formData.get('closure_type') || null,
      hallmarks: formData.get('hallmarks')?.trim() || null,
      stones: formData.get('stones')?.trim() || null,
      tested_with: collectCheckedValues(formData, 'tested_with[]'),
      ring_size: formData.get('ring_size')?.trim() || null
    };
  }

  if (categoryPrimary === 'shoes') {
    item.shoes_specific = {
      width: formData.get('width') || null
    };
  }

  // Validation
  if (!item.category.primary) {
    showToast('Category is required');
    return;
  }
  if (!item.category.secondary) {
    showToast('Type is required');
    return;
  }
  if (!item.colour.primary) {
    showToast('Primary colour is required');
    return;
  }
  if (!item.material.primary) {
    showToast('Primary material is required');
    return;
  }
  if (!item.metadata.acquisition.store_id) {
    showToast('Store is required');
    return;
  }
  // Gender required for clothing and shoes
  if (['clothing', 'shoes'].includes(item.category.primary) && !item.size.label.gender) {
    showToast('Size gender is required for clothing and shoes');
    return;
  }

  try {
    let savedItem;
    if (editingItemId) {
      savedItem = await updateInventoryItem(editingItemId, item);
      showToast('Item updated');
    } else {
      savedItem = await createInventoryItem(item);
      showToast('Item saved');
    }

    // Save pending photos as attachments
    if (pendingPhotos.length > 0 && savedItem?.id) {
      const itemId = savedItem.id;
      for (const photo of pendingPhotos) {
        // Include photo type in filename: type_originalname.jpg
        const filename = `${photo.type}_${photo.filename}`;
        await createAttachment(itemId, filename, photo.blob, photo.mimeType);
      }
      // Queue sync for attachments
      queueSync();
    }
    clearPendingPhotos();

    // Restore store/date field visibility and required attribute
    visitContext = null;
    const storeGroup = $('#store-field-group');
    const dateGroup = $('#date-field-group');
    const storeSelect = $('#item-store');
    const dateInput = $('#item-acquisition-date');
    if (storeGroup) storeGroup.hidden = false;
    if (dateGroup) dateGroup.hidden = false;
    if (storeSelect) {
      storeSelect.disabled = false;
      storeSelect.setAttribute('required', '');
    }
    if (dateInput) {
      dateInput.disabled = false;
      dateInput.setAttribute('required', '');
    }

    addItemModal.close();

    // Call context callback or default refresh
    if (modalOnSave) {
      await modalOnSave();
    } else {
      await loadInventory();
      await renderInventoryStats();
    }

    // Reset editing state
    editingItemId = null;
    modalOnSave = null;
    const titleEl = $('#add-item-dialog .modal-header h2');
    if (titleEl) titleEl.textContent = 'Add item';
  } catch (err) {
    console.error('Failed to save item:', err);
  }
}

function collectMeasurements(formData, category) {
  const fields = MEASUREMENT_FIELDS[category] || [];
  if (fields.length === 0) return null;

  const measurements = {};
  let hasValue = false;

  fields.forEach(field => {
    const val = parseFloat(formData.get(field.key));
    if (!isNaN(val) && val > 0) {
      measurements[field.key] = val;
      hasValue = true;
    }
  });

  return hasValue ? measurements : null;
}

function collectCheckedValues(formData, name) {
  const values = formData.getAll(name);
  return values.length > 0 ? values : null;
}

// =============================================================================
// VIEW ITEM MODAL
// =============================================================================

let currentViewItem = null; // Track current item for photo button

const viewItemModal = createLazyModal('#view-item-dialog', {
  onOpen: (dialog, { item, photos }) => {
    currentViewItem = item;

    // Update title
    const titleEl = dialog.querySelector('#view-item-title');
    if (titleEl) {
      titleEl.textContent = getItemTitle(item);
    }

    // Render content
    const contentEl = dialog.querySelector('#view-item-content');
    if (contentEl) {
      contentEl.innerHTML = renderItemDetails(item, photos);

      // Setup photo button click handler
      const photoBtn = contentEl.querySelector('.add-photos-btn');
      if (photoBtn) {
        photoBtn.addEventListener('click', async () => {
          const itemId = currentViewItem?.id;
          if (itemId) {
            viewItemModal.close();
            await openPhotoManager(itemId, {
              onComplete: async () => {
                // Refresh the view
                await openViewItemModal(itemId);
                await loadInventory();
              }
            });
          }
        });
      }
    }
  },
  onClose: () => {
    currentViewItem = null;
  }
});

export async function openViewItemModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  const photos = await getAttachmentsByItem(itemId);
  viewItemModal.open({ item, photos });
}

// =============================================================================
// ITEM DETAIL SECTION HELPERS
// =============================================================================

function formatCategoryDisplay(item) {
  const primary = item.category?.primary;
  const secondary = item.category?.secondary;
  return secondary
    ? `${capitalize(primary)} (${formatStatus(secondary)})`
    : capitalize(primary);
}

function formatColourDisplay(item) {
  if (!item.colour?.primary) return null;
  let display = `${formatColour(item.colour.primary)} (primary)`;
  if (item.colour?.secondary) display += `, ${formatColour(item.colour.secondary)}`;
  return display;
}

function renderPhotoGallerySection(photos, item) {
  // Calculate photo status for the button
  const photoStatus = item ? getPhotoStatusSync(item, photos) : null;
  const buttonLabel = !photos.length ? 'Add photos' : (photoStatus?.complete ? 'Manage photos' : 'Add photos');
  const missingBadge = photoStatus && !photoStatus.complete && photoStatus.missing?.length
    ? `<span class="badge badge--warning">${photoStatus.missing.length} missing</span>`
    : '';

  const buttonHtml = `<button class="btn btn--sm btn--primary add-photos-btn">${buttonLabel} ${missingBadge}</button>`;

  if (!photos.length) {
    return `<div class="photo-empty-state">
      <p class="text-muted">No photos yet</p>
      ${buttonHtml}
    </div>`;
  }

  const galleryHtml = photos.map(photo => {
    const url = URL.createObjectURL(photo.blob);
    const typeMatch = photo.filename?.match(/^([^_]+)_/);
    const photoType = typeMatch ? capitalize(typeMatch[1]) : '';
    return `<div class="gallery-item">
      <img src="${url}" alt="${escapeHtml(photo.filename || 'Photo')}">
      ${photoType ? `<span class="gallery-item-type">${photoType}</span>` : ''}
    </div>`;
  }).join('');

  return `<div class="item-photo-gallery">${galleryHtml}</div>
    <div class="photo-actions">${buttonHtml}</div>`;
}

function renderSizingSection(item) {
  if (!item.size?.label?.value && !item.size?.measurements) return null;

  const fields = [
    { dt: 'Labeled size', dd: item.size?.label?.value ? escapeHtml(item.size.label.value) : null },
    { dt: 'Gender', dd: item.size?.label?.gender ? capitalize(item.size.label.gender) : null },
    { dt: 'Width', dd: item.shoes_specific?.width ? capitalize(item.shoes_specific.width) : null },
    { dt: 'Ring size', dd: item.jewelry_specific?.ring_size ? escapeHtml(item.jewelry_specific.ring_size) : null }
  ];

  // Add dynamic measurement fields
  if (item.size?.measurements) {
    const category = item.category?.primary;
    const measurementFields = MEASUREMENT_FIELDS[category] || [];
    for (const field of measurementFields) {
      if (item.size.measurements[field.key]) {
        fields.push({ dt: field.label, dd: `${item.size.measurements[field.key]}${field.unit}` });
      }
    }
  }

  return { title: 'Sizing', content: fields };
}

function renderMaterialsSection(item) {
  const primaryMaterial = item.material?.primary;
  const metalType = item.jewelry_specific?.metal_type;
  if (!primaryMaterial && !metalType) return null;

  const materialsList = [];

  // Handle primary material (object vs string format)
  if (primaryMaterial) {
    if (typeof primaryMaterial === 'object') {
      const pct = primaryMaterial.percentage || 100;
      materialsList.push(`${formatMaterial(primaryMaterial.name)} (${pct}%)`);
    } else {
      materialsList.push(formatMaterialString(primaryMaterial));
    }
  }

  // Handle secondary materials (array vs string) - nested under material.secondary
  const secondaryMaterials = item.material?.secondary;
  if (secondaryMaterials) {
    if (Array.isArray(secondaryMaterials)) {
      secondaryMaterials.forEach(m => {
        const pct = m.percentage ? ` (${m.percentage}%)` : '';
        materialsList.push(`${formatMaterial(m.name)}${pct}`);
      });
    } else {
      materialsList.push(formatMaterialString(secondaryMaterials));
    }
  }

  return { title: 'Materials', content: [
    { dt: 'Materials', dd: materialsList.length > 0 ? materialsList.join(', ') : null },
    { dt: 'Metal type', dd: metalType ? formatMetalType(metalType) : null }
  ]};
}

function renderConditionSection(item) {
  const condition = item.condition;
  if (!condition?.overall_condition && !condition?.flaws?.length) return null;

  // Build dl content
  let html = '<dl class="detail-grid">';
  if (condition?.overall_condition) html += `<dt>Condition</dt><dd>${formatStatus(condition.overall_condition)}</dd>`;
  if (condition?.condition_notes) html += `<dt>Notes</dt><dd>${escapeHtml(condition.condition_notes)}</dd>`;
  html += '</dl>';

  // Add flaws list if present
  if (condition?.flaws?.length) {
    html += '<div class="flaws-summary"><strong>Flaws:</strong><ul>' +
      condition.flaws.map(flaw =>
        `<li>${formatStatus(flaw.type)} (${flaw.severity})${flaw.location ? ` - ${flaw.location}` : ''}${flaw.repairable ? ' [repairable]' : ''}</li>`
      ).join('') + '</ul></div>';
  }

  return { title: 'Condition', content: html };
}

function renderItemDetails(item, photos = []) {
  const storeId = item.metadata?.acquisition?.store_id;
  const store = storeId ? state.getStore(storeId) : null;
  const storeName = store?.name || '-';
  const purchasePrice = item.metadata?.acquisition?.price || 0;
  const totalCost = purchasePrice + (item.tax_paid || 0);
  const status = item.metadata?.status;
  const category = item.category?.primary;
  const jewelrySpec = item.jewelry_specific;

  // Photos section (full width)
  const photosSection = renderDetailSection('Photos', renderPhotoGallerySection(photos, item));

  // Basic Info and Acquisition side-by-side on desktop
  const basicInfoSection = renderDetailSection('Basic info', [
    { dt: 'Category', dd: formatCategoryDisplay(item) },
    { dt: 'Brand', dd: item.brand ? escapeHtml(item.brand) : null },
    { dt: 'Country', dd: item.country_of_manufacture ? escapeHtml(item.country_of_manufacture) : null },
    { dt: 'Colours', dd: formatColourDisplay(item) },
    { dt: 'Era', dd: item.era ? formatEra(item.era) : null },
    { dt: 'Status', dd: `<span class="status status--${status}">${formatStatus(status)}</span>` }
  ]);

  const acquisitionSection = renderDetailSection('Acquisition', [
    { dt: 'Store', dd: escapeHtml(storeName) },
    { dt: 'Date', dd: item.metadata?.acquisition?.date ? formatDate(item.metadata.acquisition.date) : '-' },
    { dt: 'Price', dd: formatCurrency(purchasePrice) },
    { dt: 'Tax', dd: item.tax_paid ? formatCurrency(item.tax_paid) : null },
    { dt: 'Total cost', dd: `<strong>${formatCurrency(totalCost)}</strong>` }
  ]);

  const twoColumnRow = `<div class="detail-section-row">${basicInfoSection}${acquisitionSection}</div>`;

  // Remaining sections
  const remainingSections = renderDetailSections([
    // Sizing
    renderSizingSection(item),

    // Materials
    renderMaterialsSection(item),

    // Jewelry details (conditional)
    category === 'jewelry' && (jewelrySpec?.hallmarks || jewelrySpec?.stones || jewelrySpec?.closure_type || jewelrySpec?.tested_with)
      ? { title: 'Jewelry details', content: [
          { dt: 'Closure', dd: jewelrySpec?.closure_type ? formatStatus(jewelrySpec.closure_type) : null },
          { dt: 'Hallmarks', dd: jewelrySpec?.hallmarks ? escapeHtml(jewelrySpec.hallmarks) : null },
          { dt: 'Stones', dd: jewelrySpec?.stones ? escapeHtml(jewelrySpec.stones) : null },
          { dt: 'Tested with', dd: jewelrySpec?.tested_with?.length ? jewelrySpec.tested_with.map(formatStatus).join(', ') : null }
        ]}
      : null,

    // Condition
    renderConditionSection(item),

    // Pricing
    (item.pricing?.estimated_resale_value || item.pricing?.minimum_acceptable_price)
      ? { title: 'Pricing', content: [
          { dt: 'Est. value', dd: item.pricing?.estimated_resale_value ? formatCurrency(item.pricing.estimated_resale_value) : null },
          { dt: 'Min. price', dd: item.pricing?.minimum_acceptable_price ? formatCurrency(item.pricing.minimum_acceptable_price) : null }
        ]}
      : null,

    // Packaging
    item.metadata?.acquisition?.packaging ? { title: 'Packaging', content: `<p>${formatPackaging(item.metadata.acquisition.packaging)}</p>` } : null

  ].filter(Boolean));

  return photosSection + twoColumnRow + remainingSections;
}

// =============================================================================
// START SELLING MODAL
// =============================================================================

let startSellingHandlersSetup = false;

const startSellingModal = createLazyModal('#start-selling-dialog', {
  onOpen: (dialog, { item, recommendations, fallbackSuggestion }) => {
    // Setup event handlers (once)
    if (!startSellingHandlersSetup) {
      startSellingHandlersSetup = true;
      const form = dialog.querySelector('#start-selling-form');
      if (form) {
        form.addEventListener('submit', handleStartSellingSubmit);
      }
      const listingPriceInput = dialog.querySelector('#start-selling-listing-price');
      if (listingPriceInput) {
        listingPriceInput.addEventListener('input', handleListingPriceChange);
      }
    }

    // Store current item for recalculation
    currentSellingItem = item;

    // Populate form
    const itemIdInput = dialog.querySelector('#start-selling-item-id');
    const itemTitleEl = dialog.querySelector('#start-selling-item-title');
    const itemMetaEl = dialog.querySelector('#start-selling-item-meta');
    const listingPriceInput = dialog.querySelector('#start-selling-listing-price');
    const suggestionEl = dialog.querySelector('#start-selling-suggestion');
    const estValueInput = dialog.querySelector('#start-selling-est-value');

    if (itemIdInput) itemIdInput.value = item.id;
    if (itemTitleEl) itemTitleEl.textContent = getItemTitle(item);

    // Render item metadata (brand, category)
    if (itemMetaEl) {
      const parts = [];
      if (item.brand) parts.push(item.brand);
      if (item.category?.primary) parts.push(capitalize(item.category.primary));
      itemMetaEl.textContent = parts.join(' · ') || '';
    }

    // Set initial listing price from estimated value or suggestion
    const initialPrice = item.pricing?.estimated_resale_value || recommendations?.suggestedPrice || fallbackSuggestion?.value || '';
    if (listingPriceInput) listingPriceInput.value = initialPrice;
    if (estValueInput) estValueInput.value = initialPrice;

    // Show price suggestion hint
    if (suggestionEl) {
      if (recommendations?.priceRange) {
        const { min, max } = recommendations.priceRange;
        suggestionEl.textContent = `Suggested: ${formatCurrency(min)}–${formatCurrency(max)}`;
      } else if (fallbackSuggestion) {
        suggestionEl.textContent = `Suggested: ${formatCurrency(fallbackSuggestion.value)} (${fallbackSuggestion.multiplier}× brand tier)`;
      } else {
        suggestionEl.textContent = '';
      }
    }

    // Render recommendations
    if (initialPrice) {
      renderRecommendations(recommendations, item, initialPrice);
    }
  }
});

export async function openStartSellingModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  // Generate recommendations (async work done before opening)
  const recommendations = await generateSellingRecommendations(item);

  // Calculate fallback suggestion if no recommendations
  let fallbackSuggestion = null;
  if (!recommendations && !item.estimated_resale_value) {
    fallbackSuggestion = await calculateSuggestedResaleValue(item);
  }

  startSellingModal.open({ item, recommendations, fallbackSuggestion });
}

/**
 * Handle listing price input change - recalculate platform recommendations.
 */
async function handleListingPriceChange(e) {
  if (!currentSellingItem) return;

  const listingPrice = parseFloat(e.target.value) || null;
  if (!listingPrice) return;

  const recommendations = await generateSellingRecommendations(currentSellingItem, listingPrice);
  renderRecommendations(recommendations, currentSellingItem, listingPrice);

  // Sync to hidden estimated value field
  const estValueInput = $('#start-selling-est-value');
  if (estValueInput) {
    estValueInput.value = listingPrice;
  }
}

/**
 * Render recommendations in the Start Selling modal.
 */
function renderRecommendations(rec, item, basePrice) {
  const purchasePrice = item.metadata?.acquisition?.price || 0;
  const taxPaid = item.tax_paid || 0;
  const repairCosts = item.condition?.repairs_completed?.reduce((sum, r) => sum + (r.repair_cost || 0), 0) || 0;
  const costBasis = purchasePrice + taxPaid + repairCosts;
  const priceToUse = basePrice || rec?.suggestedPrice || item.pricing?.estimated_resale_value || 0;

  // Recommended platform
  const platformEl = $('#recommended-platform');
  const explanationEl = $('#platform-explanation');

  if (rec?.recommendedPlatforms?.length > 0) {
    const top = rec.recommendedPlatforms[0];
    if (platformEl) platformEl.textContent = formatPlatformName(top.platformId);

    // Build detailed explanation
    if (explanationEl) {
      const reasons = top.reasons || [];
      let explanation = reasons.length > 0
        ? reasons.slice(0, 3).join('. ') + '.'
        : `Best profit margin at this price point.`;
      explanationEl.textContent = explanation;
    }
  } else {
    if (platformEl) platformEl.textContent = '-';
    if (explanationEl) explanationEl.textContent = 'Enter a base price to see platform recommendations.';
  }

  // Profit waterfall
  const waterfallContainer = $('#selling-profit-waterfall');
  if (waterfallContainer) {
    if (rec?.profitEstimate) {
      const { netPayout, totalFees, profit } = rec.profitEstimate;
      waterfallContainer.innerHTML = renderProfitWaterfall({
        salePrice: priceToUse,
        fees: totalFees,
        payout: netPayout,
        costBasis,
        profit
      }, { compact: true });
    } else if (priceToUse > 0) {
      // Estimate with ~15% fees if no specific platform data
      const estFees = priceToUse * 0.15;
      const estPayout = priceToUse - estFees;
      const profit = estPayout - costBasis;
      waterfallContainer.innerHTML = renderProfitWaterfall({
        salePrice: priceToUse,
        fees: estFees,
        payout: estPayout,
        costBasis,
        profit
      }, { compact: true });
    } else {
      waterfallContainer.innerHTML = '';
    }
  }

  // Platform comparison table - show all platforms
  const recommendedPlatforms = rec?.recommendedPlatforms || [];
  renderPlatformComparison(recommendedPlatforms, costBasis, priceToUse, item);
}

/**
 * Format base category name for display.
 */
function formatBaseCategory(category) {
  const map = {
    blouse: 'Blouse',
    dress: 'Dress',
    coat: 'Coat',
    jacket: 'Jacket',
    pants: 'Pants',
    skirt: 'Skirt',
    sweater: 'Sweater',
    shoes: 'Shoes',
    jewelry_costume: 'Costume jewelry',
    jewelry_silver: 'Silver jewelry',
    jewelry_gold: 'Gold jewelry',
    jewelry_fine: 'Fine jewelry',
    comp: 'Comp price'
  };
  return map[category] || capitalize(category);
}

/**
 * Render the platform comparison table showing ALL platforms.
 */
async function renderPlatformComparison(recommendedPlatforms, costBasis, suggestedPrice, item) {
  const container = $('#platform-comparison');
  if (!container) return;

  // All platforms except 'other'
  const ALL_PLATFORMS = RESALE_PLATFORMS.filter(p => p !== 'other');

  // Build data for all platforms
  const allPlatformsData = await Promise.all(ALL_PLATFORMS.map(async (platformId) => {
    // Check if this platform is in the recommended list
    const existing = recommendedPlatforms.find(p => p.platformId === platformId);
    if (existing) {
      return { ...existing, isRecommended: true };
    }

    // Calculate for non-recommended platforms
    const fees = calculatePlatformFees(platformId, suggestedPrice);
    const netPayout = fees?.netPayout || suggestedPrice * 0.85;
    const profit = netPayout - costBasis;
    const feePercent = fees ? Math.round((fees.totalFees / suggestedPrice) * 100) : 15;

    // Get trend fit info
    let trendSummary = null;
    try {
      const trendResult = await calculateTrendMultiplier(item, platformId);
      if (trendResult.summary !== 'Standard') {
        trendSummary = trendResult.summary;
      }
    } catch (e) {
      // Ignore errors
    }

    return {
      platformId,
      score: 0,
      reasons: [],
      fees,
      netPayout: round(netPayout),
      profit: round(profit),
      feePercent,
      isRecommended: false,
      trendSummary
    };
  }));

  // Sort: recommended first, then by profit descending
  allPlatformsData.sort((a, b) => {
    if (a.isRecommended && !b.isRecommended) return -1;
    if (!a.isRecommended && b.isRecommended) return 1;
    return b.profit - a.profit;
  });

  // Render table
  container.innerHTML = `
    <table class="table table--compact platform-comparison-full">
      <thead>
        <tr>
          <th>Platform</th>
          <th class="col-numeric">Fee</th>
          <th class="col-numeric">Profit</th>
          <th>Why</th>
        </tr>
      </thead>
      <tbody>
        ${allPlatformsData.map(p => {
          const profitClass = p.profit >= 0 ? 'text-success' : 'text-danger';
          const rowClass = p.isRecommended ? 'platform-row--recommended' : '';
          const fitBadge = p.trendSummary ? `<span class="badge badge--muted">${escapeHtml(p.trendSummary)}</span>` : '<span class="text-muted">—</span>';

          return `
            <tr class="${rowClass}">
              <td>${formatPlatformName(p.platformId)}</td>
              <td class="col-numeric text-muted">~${p.feePercent}%</td>
              <td class="col-numeric ${profitClass}">${formatCurrency(p.profit)}</td>
              <td>${fitBadge}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function handleStartSellingSubmit(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const itemId = formData.get('item_id');
  const estimatedValue = parseFloat(formData.get('estimated_resale_value')) || null;

  try {
    // Use nested schema: status under metadata, estimated_resale_value under pricing
    const updates = { metadata: { status: 'needs_photo' } };
    if (estimatedValue !== null) {
      updates.pricing = { estimated_resale_value: estimatedValue };
    }

    await updateInventoryItem(itemId, updates);
    showToast('Item added to selling pipeline');
    startSellingModal.close();

    // Refresh inventory table
    await loadInventory();

    // Queue sync
    queueSync();

    // Navigate to Selling tab
    navigateToSelling();
  } catch (err) {
    console.error('Failed to start selling:', err);
    showToast('Failed to add item to pipeline');
  }
}

// =============================================================================
// PROFIT BREAKDOWN MODAL
// =============================================================================

const profitBreakdownModal = createLazyModal('#profit-breakdown-dialog');

/**
 * Open the profit breakdown modal for an item.
 */
async function openProfitBreakdownModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  const estSalePrice = estimatedPrices.get(item.id) || item.estimated_resale_value;
  if (!estSalePrice) {
    showToast('No estimated price available');
    return;
  }

  // Populate title
  const titleEl = $('#breakdown-item-title');
  if (titleEl) titleEl.textContent = getItemTitle(item);

  // Calculate cost basis
  const purchasePrice = item.purchase_price || 0;
  const taxPaid = item.tax_paid || 0;
  const repairCosts = item.repairs_completed?.reduce((sum, r) => sum + (r.repair_cost || 0), 0) || 0;
  const costBasis = purchasePrice + taxPaid + repairCosts;

  // Calculate all platform data
  const platformData = calculatePlatformBreakdowns(estSalePrice, costBasis);

  // Render best platform as highlighted card
  const bestContainer = $('#breakdown-best-waterfall');
  if (bestContainer && platformData.length > 0) {
    const best = platformData[0];
    bestContainer.innerHTML = renderPlatformCard(best, { highlighted: true });
  }

  // Render remaining platforms (skip the best one)
  const comparisonContainer = $('#breakdown-platform-comparison');
  if (comparisonContainer && platformData.length > 1) {
    comparisonContainer.innerHTML = platformData.slice(1)
      .map(p => renderPlatformCard(p))
      .join('');
  }

  profitBreakdownModal.open();
}

/**
 * Calculate platform fee breakdowns for all platforms.
 */
function calculatePlatformBreakdowns(salePrice, costBasis) {
  const platforms = ['poshmark', 'ebay', 'etsy', 'depop', 'grailed', 'starluv'];

  const platformData = platforms.map(platformId => {
    const fees = calculatePlatformFees(platformId, salePrice);
    const netPayout = fees?.netPayout || salePrice * 0.85;
    const profit = netPayout - costBasis;
    const totalFees = fees?.totalFees || salePrice * 0.15;

    return {
      platformId,
      name: formatPlatformName(platformId),
      totalFees,
      feePercent: Math.round((totalFees / salePrice) * 100),
      netPayout,
      profit,
      commission: fees?.commission || 0,
      paymentProcessing: fees?.paymentProcessing || 0,
      listingFee: fees?.listingFee || 0,
      breakdown: fees?.breakdown || {}
    };
  });

  // Sort by profit (highest first)
  platformData.sort((a, b) => b.profit - a.profit);
  return platformData;
}

/**
 * Render a single platform comparison card.
 */
function renderPlatformCard(p, options = {}) {
  const { highlighted = false } = options;
  const profitClass = p.profit >= 0 ? 'value--positive' : 'value--negative';
  const cardClass = highlighted ? 'platform-comparison-card platform-comparison-card--best' : 'platform-comparison-card';

  // Build fee breakdown lines
  const feeLines = [];
  if (p.commission > 0) {
    const desc = p.breakdown.commission ? ` (${p.breakdown.commission})` : '';
    feeLines.push(`<div class="platform-comparison-card__fee-line"><span>Commission</span><span>${formatCurrency(p.commission)}${desc}</span></div>`);
  }
  if (p.paymentProcessing > 0) {
    const desc = p.breakdown.paymentProcessing ? ` (${p.breakdown.paymentProcessing})` : '';
    feeLines.push(`<div class="platform-comparison-card__fee-line"><span>Payment processing</span><span>${formatCurrency(p.paymentProcessing)}${desc}</span></div>`);
  }
  if (p.listingFee > 0) {
    feeLines.push(`<div class="platform-comparison-card__fee-line"><span>Listing fee</span><span>${formatCurrency(p.listingFee)}</span></div>`);
  }

  return `
    <div class="${cardClass}">
      <div class="platform-comparison-card__name">${escapeHtml(p.name)}</div>
      <div class="platform-comparison-card__fees">
        ${feeLines.join('')}
        <div class="platform-comparison-card__fee-line platform-comparison-card__fee-total">
          <span>Total fees</span>
          <span>-${formatCurrency(p.totalFees)}</span>
        </div>
      </div>
      <div class="platform-comparison-card__detail">
        <span>Net payout</span>
        <span>${formatCurrency(p.netPayout)}</span>
      </div>
      <div class="platform-comparison-card__profit">
        <span>Est. profit</span>
        <span class="${profitClass}">${formatCurrency(p.profit)}</span>
      </div>
    </div>
  `;
}
