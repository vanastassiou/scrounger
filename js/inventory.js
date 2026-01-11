// =============================================================================
// INVENTORY MODULE
// =============================================================================

import { state } from './state.js';
import { getAllInventory, getInventoryStats, getInventoryItem, createInventoryItem, deleteInventoryItem } from './db.js';
import { showToast, createModalController } from './ui.js';
import { $, $$, formatCurrency, formatDate, capitalize, formatStatus } from './utils.js';
import {
  CATEGORIES, SUBCATEGORIES, STATUS_OPTIONS, CONDITION_OPTIONS, ERA_OPTIONS,
  INTENT_OPTIONS, RESALE_PLATFORMS, METAL_TYPES, CLOSURE_TYPES, JEWELRY_TESTS,
  FLAW_TYPES, FLAW_SEVERITY, WIDTH_OPTIONS, MEASUREMENT_FIELDS
} from './config.js';

let inventoryData = [];
let sortColumn = 'created_at';
let sortDirection = 'desc';
let filterCategory = null;
let searchTerm = '';
let currentFlaws = [];

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initInventory() {
  await loadInventory();
  setupEventHandlers();
  setupFormOptions();
}

async function loadInventory() {
  inventoryData = await getAllInventory();
  renderInventoryTable();
}

function setupEventHandlers() {
  // Search
  const searchInput = $('#inventory-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.toLowerCase();
      renderInventoryTable();
    });
  }

  // Category filter
  const filterBtns = $$('.filter-btn[data-category]');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.category;
      filterCategory = cat === 'all' ? null : cat;
      renderInventoryTable();
    });
  });

  // Table click delegation (sorting + item links)
  const table = $('#inventory-table');
  if (table) {
    table.addEventListener('click', (e) => {
      // Header sorting
      const th = e.target.closest('th[data-sort]');
      if (th) {
        const col = th.dataset.sort;
        if (sortColumn === col) {
          sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          sortColumn = col;
          sortDirection = 'asc';
        }
        renderInventoryTable();
        return;
      }

      // Item link click
      const link = e.target.closest('.item-link');
      if (link) {
        e.preventDefault();
        const itemId = link.dataset.id;
        openViewItemModal(itemId);
      }
    });
  }

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

  // Intent change - show/hide resale platforms
  const intentSelect = $('#item-intent');
  if (intentSelect) {
    intentSelect.addEventListener('change', handleIntentChange);
  }

  // Flaw select - add flaw
  const flawSelect = $('#add-flaw-select');
  if (flawSelect) {
    flawSelect.addEventListener('change', handleAddFlaw);
  }

  // Cancel button
  const cancelBtn = $('#item-form-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => addItemModal?.close());
  }
}

// =============================================================================
// FORM OPTIONS SETUP
// =============================================================================

function setupFormOptions() {
  // Category
  populateSelect('#item-category', CATEGORIES, capitalize);

  // Era
  populateSelect('#item-era', ERA_OPTIONS, formatEra);

  // Store
  populateStoreSelect();

  // Status
  populateSelect('#item-status', STATUS_OPTIONS, formatStatus);

  // Condition
  populateSelect('#item-condition', CONDITION_OPTIONS, formatStatus);

  // Intent
  populateSelect('#item-intent', INTENT_OPTIONS, formatStatus);

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

  // Resale platforms checkboxes
  renderCheckboxGroup('#platforms-checkboxes', RESALE_PLATFORMS, 'resale_platform', formatPlatform);
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
  const storeSelect = $('#item-store');
  const allStores = state.getAllStores();
  if (storeSelect && allStores.length > 0) {
    storeSelect.innerHTML = '<option value="">Select store...</option>';

    // Sort stores alphabetically by name
    const sorted = [...allStores].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    );

    sorted.forEach(store => {
      const opt = document.createElement('option');
      opt.value = store.id;
      opt.textContent = store.name;
      storeSelect.appendChild(opt);
    });
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

function formatPlatform(platform) {
  const map = {
    'poshmark': 'Poshmark',
    'ebay': 'eBay',
    'etsy': 'Etsy',
    'depop': 'Depop',
    'facebook_marketplace': 'Facebook Marketplace',
    'local_consignment': 'Local Consignment',
    'other': 'Other'
  };
  return map[platform] || platform;
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

function handleIntentChange(e) {
  const intent = e.target.value;
  const platformsGroup = $('#resale-platforms-group');
  if (platformsGroup) {
    platformsGroup.hidden = intent !== 'resale';
  }
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
// RENDERING
// =============================================================================

function renderInventoryTable() {
  const tbody = $('#inventory-tbody');
  if (!tbody) return;

  // Filter
  let filtered = inventoryData;

  if (filterCategory) {
    filtered = filtered.filter(i => i.category === filterCategory);
  }

  if (searchTerm) {
    filtered = filtered.filter(i =>
      i.title?.toLowerCase().includes(searchTerm) ||
      i.brand?.toLowerCase().includes(searchTerm) ||
      i.description?.toLowerCase().includes(searchTerm)
    );
  }

  // Sort
  filtered.sort((a, b) => {
    let aVal = a[sortColumn];
    let bVal = b[sortColumn];

    // Handle nulls
    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';

    // Numeric comparison for price
    if (sortColumn === 'purchase_price') {
      aVal = Number(aVal) || 0;
      bVal = Number(bVal) || 0;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Render
  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          <div class="empty-icon">I</div>
          <p>No items found</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => `
    <tr data-id="${item.id}">
      <td><a href="#" class="item-link" data-id="${item.id}">${escapeHtml(item.title || '-')}</a></td>
      <td>${capitalize(item.category)}</td>
      <td>${escapeHtml(item.brand || '-')}</td>
      <td>${formatCurrency(item.purchase_price || 0)}</td>
      <td><span class="status status--${item.status}">${formatStatus(item.status)}</span></td>
      <td>${formatDate(item.acquisition_date)}</td>
    </tr>
  `).join('');

  // Update count
  const countEl = $('#inventory-count');
  if (countEl) {
    countEl.textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;
  }
}

export async function renderInventoryStats() {
  const stats = await getInventoryStats();

  const totalEl = $('#stat-total-items');
  const investedEl = $('#stat-total-invested');
  const soldEl = $('#stat-total-sold');

  if (totalEl) totalEl.textContent = stats.total;
  if (investedEl) investedEl.textContent = formatCurrency(stats.totalInvested);
  if (soldEl) soldEl.textContent = formatCurrency(stats.totalSold);
}

// =============================================================================
// ADD ITEM MODAL
// =============================================================================

let addItemModal = null;

export function openAddItemModal() {
  const dialog = $('#add-item-dialog');
  if (!dialog) return;

  if (!addItemModal) {
    addItemModal = createModalController(dialog);
  }

  // Ensure stores are populated (may have loaded after initial setup)
  populateStoreSelect();

  // Reset form
  resetItemForm();

  addItemModal.open();
}

function resetItemForm() {
  const form = $('#item-form');
  if (!form) return;

  form.reset();

  // Reset flaws
  currentFlaws = [];
  renderFlawsList();

  // Set defaults
  const today = new Date().toISOString().split('T')[0];
  const dateInput = $('#item-acquisition-date');
  if (dateInput) dateInput.value = today;

  const statusInput = $('#item-status');
  if (statusInput) statusInput.value = 'unlisted';

  const intentInput = $('#item-intent');
  if (intentInput) intentInput.value = 'undecided';

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

  const platformsGroup = $('#resale-platforms-group');
  if (platformsGroup) platformsGroup.hidden = true;

  const measurementsGrid = $('#measurements-grid');
  if (measurementsGrid) measurementsGrid.innerHTML = '';

  // Uncheck all checkboxes in checkbox groups
  $$('#jewelry-tests-group input[type="checkbox"]').forEach(cb => cb.checked = false);
  $$('#platforms-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
}

async function handleItemSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);
  const category = formData.get('category');

  // Build item object
  const item = {
    // Basic info
    title: formData.get('title')?.trim(),
    category: category,
    subcategory: formData.get('subcategory')?.trim() || null,
    brand: formData.get('brand')?.trim() || null,
    era: formData.get('era') || null,

    // Acquisition
    store_id: formData.get('store_id'),
    acquisition_date: formData.get('acquisition_date'),
    purchase_price: parseFloat(formData.get('purchase_price')) || 0,
    tax_paid: parseFloat(formData.get('tax_paid')) || 0,

    // Sizing
    labeled_size: formData.get('labeled_size')?.trim() || null,
    modern_size_equivalent: formData.get('modern_size_equivalent')?.trim() || null,
    measurements: collectMeasurements(formData, category),

    // Materials
    primary_material: formData.get('primary_material')?.trim() || null,
    secondary_materials: formData.get('secondary_materials')?.trim() || null,
    material_verified: formData.get('material_verified') === 'on',
    material_notes: formData.get('material_notes')?.trim() || null,

    // Condition
    overall_condition: formData.get('condition') || null,
    condition_notes: formData.get('condition_notes')?.trim() || null,
    flaws: currentFlaws.length > 0 ? [...currentFlaws] : null,

    // Intent & Pricing
    intent: formData.get('intent') || null,
    resale_platform_target: collectCheckedValues(formData, 'resale_platform[]'),
    estimated_resale_value: parseFloat(formData.get('estimated_resale_value')) || null,
    minimum_acceptable_price: parseFloat(formData.get('minimum_acceptable_price')) || null,
    brand_premium_multiplier: parseFloat(formData.get('brand_premium_multiplier')) || 1.0,

    // Status
    status: formData.get('status') || 'unlisted',

    // Description
    description: formData.get('description')?.trim() || null
  };

  // Add category-specific fields
  if (category === 'jewelry') {
    item.metal_type = formData.get('metal_type') || null;
    item.closure_type = formData.get('closure_type') || null;
    item.hallmarks = formData.get('hallmarks')?.trim() || null;
    item.stones = formData.get('stones')?.trim() || null;
    item.tested_with = collectCheckedValues(formData, 'tested_with[]');
    item.ring_size = formData.get('ring_size')?.trim() || null;
  }

  if (category === 'shoes') {
    item.width = formData.get('width') || null;
  }

  // Validation
  if (!item.title) {
    showToast('Title is required');
    return;
  }
  if (!item.category) {
    showToast('Category is required');
    return;
  }
  if (!item.store_id) {
    showToast('Store is required');
    return;
  }

  try {
    await createInventoryItem(item);
    showToast('Item saved');
    addItemModal.close();
    await loadInventory();
    await renderInventoryStats();
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

let viewItemModal = null;

async function openViewItemModal(itemId) {
  const dialog = $('#view-item-dialog');
  if (!dialog) return;

  if (!viewItemModal) {
    viewItemModal = createModalController(dialog);
  }

  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  // Update title
  const titleEl = $('#view-item-title');
  if (titleEl) {
    titleEl.textContent = item.title || 'Item Details';
  }

  // Render content
  const contentEl = $('#view-item-content');
  if (contentEl) {
    contentEl.innerHTML = renderItemDetails(item);
  }

  viewItemModal.open();
}

function renderItemDetails(item) {
  const store = state.getStore(item.store_id);
  const storeName = store?.name || item.store_id || '-';

  const sections = [];

  // Basic info
  sections.push(`
    <section class="detail-section">
      <h3 class="detail-section-title">Basic info</h3>
      <dl class="detail-grid">
        <dt>Category</dt><dd>${capitalize(item.category)}</dd>
        ${item.subcategory ? `<dt>Type</dt><dd>${formatStatus(item.subcategory)}</dd>` : ''}
        ${item.brand ? `<dt>Brand</dt><dd>${escapeHtml(item.brand)}</dd>` : ''}
        ${item.era ? `<dt>Era</dt><dd>${formatEra(item.era)}</dd>` : ''}
        <dt>Status</dt><dd><span class="status status--${item.status}">${formatStatus(item.status)}</span></dd>
      </dl>
    </section>
  `);

  // Acquisition
  const totalCost = (item.purchase_price || 0) + (item.tax_paid || 0);
  sections.push(`
    <section class="detail-section">
      <h3 class="detail-section-title">Acquisition</h3>
      <dl class="detail-grid">
        <dt>Store</dt><dd>${escapeHtml(storeName)}</dd>
        <dt>Date</dt><dd>${formatDate(item.acquisition_date)}</dd>
        <dt>Price</dt><dd>${formatCurrency(item.purchase_price || 0)}</dd>
        ${item.tax_paid ? `<dt>Tax</dt><dd>${formatCurrency(item.tax_paid)}</dd>` : ''}
        <dt>Total cost</dt><dd><strong>${formatCurrency(totalCost)}</strong></dd>
      </dl>
    </section>
  `);

  // Sizing (if present)
  if (item.labeled_size || item.modern_size_equivalent || item.measurements) {
    let sizingHtml = '<dl class="detail-grid">';
    if (item.labeled_size) sizingHtml += `<dt>Labeled size</dt><dd>${escapeHtml(item.labeled_size)}</dd>`;
    if (item.modern_size_equivalent) sizingHtml += `<dt>Modern equivalent</dt><dd>${escapeHtml(item.modern_size_equivalent)}</dd>`;
    if (item.width) sizingHtml += `<dt>Width</dt><dd>${capitalize(item.width)}</dd>`;
    if (item.ring_size) sizingHtml += `<dt>Ring size</dt><dd>${escapeHtml(item.ring_size)}</dd>`;
    if (item.measurements) {
      const fields = MEASUREMENT_FIELDS[item.category] || [];
      for (const field of fields) {
        if (item.measurements[field.key]) {
          sizingHtml += `<dt>${field.label}</dt><dd>${item.measurements[field.key]}${field.unit}</dd>`;
        }
      }
    }
    sizingHtml += '</dl>';
    sections.push(`<section class="detail-section"><h3 class="detail-section-title">Sizing</h3>${sizingHtml}</section>`);
  }

  // Materials (if present)
  if (item.primary_material || item.metal_type) {
    let materialsHtml = '<dl class="detail-grid">';
    if (item.primary_material) materialsHtml += `<dt>Primary</dt><dd>${escapeHtml(item.primary_material)}</dd>`;
    if (item.secondary_materials) materialsHtml += `<dt>Secondary</dt><dd>${escapeHtml(item.secondary_materials)}</dd>`;
    if (item.metal_type) materialsHtml += `<dt>Metal type</dt><dd>${formatMetalType(item.metal_type)}</dd>`;
    if (item.material_verified) materialsHtml += `<dt>Verified</dt><dd>Yes</dd>`;
    if (item.material_notes) materialsHtml += `<dt>Notes</dt><dd>${escapeHtml(item.material_notes)}</dd>`;
    materialsHtml += '</dl>';
    sections.push(`<section class="detail-section"><h3 class="detail-section-title">Materials</h3>${materialsHtml}</section>`);
  }

  // Jewelry details (if present)
  if (item.category === 'jewelry' && (item.hallmarks || item.stones || item.closure_type || item.tested_with)) {
    let jewelryHtml = '<dl class="detail-grid">';
    if (item.closure_type) jewelryHtml += `<dt>Closure</dt><dd>${formatStatus(item.closure_type)}</dd>`;
    if (item.hallmarks) jewelryHtml += `<dt>Hallmarks</dt><dd>${escapeHtml(item.hallmarks)}</dd>`;
    if (item.stones) jewelryHtml += `<dt>Stones</dt><dd>${escapeHtml(item.stones)}</dd>`;
    if (item.tested_with?.length) jewelryHtml += `<dt>Tested with</dt><dd>${item.tested_with.map(formatStatus).join(', ')}</dd>`;
    jewelryHtml += '</dl>';
    sections.push(`<section class="detail-section"><h3 class="detail-section-title">Jewelry details</h3>${jewelryHtml}</section>`);
  }

  // Condition (if present)
  if (item.overall_condition || item.flaws?.length) {
    let conditionHtml = '<dl class="detail-grid">';
    if (item.overall_condition) conditionHtml += `<dt>Condition</dt><dd>${formatStatus(item.overall_condition)}</dd>`;
    if (item.condition_notes) conditionHtml += `<dt>Notes</dt><dd>${escapeHtml(item.condition_notes)}</dd>`;
    conditionHtml += '</dl>';
    if (item.flaws?.length) {
      conditionHtml += '<div class="flaws-summary"><strong>Flaws:</strong><ul>';
      for (const flaw of item.flaws) {
        conditionHtml += `<li>${formatStatus(flaw.type)} (${flaw.severity})${flaw.location ? ` - ${flaw.location}` : ''}${flaw.repairable ? ' [repairable]' : ''}</li>`;
      }
      conditionHtml += '</ul></div>';
    }
    sections.push(`<section class="detail-section"><h3 class="detail-section-title">Condition</h3>${conditionHtml}</section>`);
  }

  // Pricing (if resale intent)
  if (item.intent === 'resale' || item.estimated_resale_value) {
    let pricingHtml = '<dl class="detail-grid">';
    if (item.intent) pricingHtml += `<dt>Intent</dt><dd>${formatStatus(item.intent)}</dd>`;
    if (item.estimated_resale_value) pricingHtml += `<dt>Est. value</dt><dd>${formatCurrency(item.estimated_resale_value)}</dd>`;
    if (item.minimum_acceptable_price) pricingHtml += `<dt>Min. price</dt><dd>${formatCurrency(item.minimum_acceptable_price)}</dd>`;
    if (item.resale_platform_target?.length) pricingHtml += `<dt>Platforms</dt><dd>${item.resale_platform_target.map(formatPlatform).join(', ')}</dd>`;
    pricingHtml += '</dl>';
    sections.push(`<section class="detail-section"><h3 class="detail-section-title">Pricing</h3>${pricingHtml}</section>`);
  }

  // Description (if present)
  if (item.description) {
    sections.push(`
      <section class="detail-section">
        <h3 class="detail-section-title">Description</h3>
        <p class="item-description">${escapeHtml(item.description)}</p>
      </section>
    `);
  }

  return sections.join('');
}

// =============================================================================
// UTILITIES
// =============================================================================

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
