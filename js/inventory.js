// =============================================================================
// INVENTORY MODULE
// =============================================================================

import { state } from './state.js';
import { getAllInventory, getInventoryStats, getInventoryItem, createInventoryItem, updateInventoryItem, deleteInventoryItem } from './db.js';
import { showToast, createModalController } from './ui.js';
import {
  $, $$, formatCurrency, formatDate, capitalize, formatStatus, formatPackaging, escapeHtml,
  createSortableTable, sortData, createFilterButtons, emptyStateRow,
  createChainStoreDropdown, formatChainName, getLocationName
} from './utils.js';
import {
  CATEGORIES, SUBCATEGORIES, STATUS_OPTIONS, CONDITION_OPTIONS, ERA_OPTIONS,
  METAL_TYPES, CLOSURE_TYPES, JEWELRY_TESTS,
  FLAW_TYPES, FLAW_SEVERITY, WIDTH_OPTIONS, MEASUREMENT_FIELDS,
  COLOUR_OPTIONS, MATERIAL_OPTIONS
} from './config.js';

let inventoryData = [];
let sortColumn = 'created_at';
let sortDirection = 'desc';
let filterCategory = null;
let searchTerm = '';
let currentFlaws = [];
let currentSecondaryMaterials = []; // For structured secondary materials
let editingItemId = null;
let modalOnSave = null;
let visitContext = null; // Stores storeId/date when opened from visit workflow

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initInventory() {
  await migrateMaterialsToStructured();
  await migrateItemTitles();
  await migrateFlawSpellings();
  await loadInventory();
  setupEventHandlers();
  setupFormOptions();
}

async function loadInventory() {
  inventoryData = await getAllInventory();
  renderInventoryTable();
}

// =============================================================================
// MIGRATION - Regenerate titles for existing items
// =============================================================================

async function migrateItemTitles() {
  const items = await getAllInventory();
  let migratedCount = 0;

  for (const item of items) {
    // Get material name (handle both structured and legacy string)
    let materialName = null;
    if (item.primary_material) {
      if (typeof item.primary_material === 'object' && item.primary_material.name) {
        materialName = item.primary_material.name;
      } else if (typeof item.primary_material === 'string') {
        // Try to normalize legacy string to a material option
        const normalized = item.primary_material.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
        if (MATERIAL_OPTIONS.includes(normalized)) {
          materialName = normalized;
        }
      }
    }

    // Generate new title
    const newTitle = generateItemTitle(
      item.brand,
      item.primary_colour,
      materialName,
      item.subcategory
    );

    // Only update if title changed and we have enough data to generate a meaningful title
    if (newTitle !== item.title && newTitle !== 'Untitled item') {
      await updateInventoryItem(item.id, { title: newTitle });
      migratedCount++;
    }
  }

  if (migratedCount > 0) {
    console.log(`Migrated ${migratedCount} item titles to new format`);
  }
}

// =============================================================================
// MIGRATION - Convert string materials to structured percentage format
// =============================================================================

async function migrateMaterialsToStructured() {
  const items = await getAllInventory();
  let migratedCount = 0;

  for (const item of items) {
    const updates = {};

    // Migrate primary_material if it's a string
    if (item.primary_material && typeof item.primary_material === 'string') {
      const parsed = parseMaterialString(item.primary_material);
      if (parsed) {
        updates.primary_material = parsed;
      }
    }

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await updateInventoryItem(item.id, updates);
      migratedCount++;
    }
  }

  if (migratedCount > 0) {
    console.log(`Migrated ${migratedCount} items to structured material format`);
  }
}

/**
 * Parse a material string into structured format.
 * Examples:
 *   "100% cashmere" → { name: "cashmere", percentage: 100 }
 *   "Cashmere" → { name: "cashmere", percentage: 100 }
 *   "100% Merino wool" → { name: "merino_wool", percentage: 100 }
 */
function parseMaterialString(str) {
  if (!str) return null;

  // Try to match "XX% material" pattern
  const percentMatch = str.match(/^(\d+)%\s*(.+)$/i);
  if (percentMatch) {
    const percentage = parseInt(percentMatch[1]);
    const materialName = normalizeMaterialName(percentMatch[2].trim());
    return { name: materialName, percentage };
  }

  // No percentage - assume 100%
  const materialName = normalizeMaterialName(str.trim());
  return { name: materialName, percentage: 100 };
}

/**
 * Normalize material name to snake_case format matching MATERIAL_OPTIONS.
 */
function normalizeMaterialName(str) {
  // Convert to lowercase and replace spaces/special chars with underscores
  let normalized = str.toLowerCase()
    .replace(/[']/g, '')  // Remove apostrophes (lamb's -> lambs)
    .replace(/\s+/g, '_')
    .replace(/[^a-z_]/g, '');

  // Map common variations to canonical names
  const aliases = {
    'lambs_wool': 'lambswool',
    'lamb_wool': 'lambswool',
    'merino': 'merino_wool',
    'patent': 'patent_leather',
    'pony': 'pony_hair'
  };

  return aliases[normalized] || normalized;
}

// =============================================================================
// MIGRATION - Update flaw types to Canadian spelling
// =============================================================================

async function migrateFlawSpellings() {
  const items = await getAllInventory();
  let migratedCount = 0;

  // Map American spellings to Canadian
  const spellingMap = {
    'discoloration': 'discolouration',
    'odor': 'odour'
  };

  for (const item of items) {
    if (!item.flaws || !Array.isArray(item.flaws)) continue;

    let needsUpdate = false;
    const updatedFlaws = item.flaws.map(flaw => {
      if (spellingMap[flaw.type]) {
        needsUpdate = true;
        return { ...flaw, type: spellingMap[flaw.type] };
      }
      return flaw;
    });

    if (needsUpdate) {
      await updateInventoryItem(item.id, { flaws: updatedFlaws });
      migratedCount++;
    }
  }

  if (migratedCount > 0) {
    console.log(`Migrated ${migratedCount} items to Canadian flaw spellings`);
  }
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
  createFilterButtons({
    selector: '.filter-btn[data-category]',
    dataAttr: 'category',
    onFilter: (value) => {
      filterCategory = value;
      renderInventoryTable();
    }
  });

  // Table click delegation (sorting + item links)
  const table = $('#inventory-table');
  if (table) {
    const sortHandler = createSortableTable({
      getState: () => ({ sortColumn, sortDirection }),
      setState: (s) => { sortColumn = s.sortColumn; sortDirection = s.sortDirection; },
      onSort: renderInventoryTable
    });

    table.addEventListener('click', (e) => {
      // Header sorting
      if (sortHandler(e)) return;

      // Item link click
      const link = e.target.closest('.table-link');
      if (link) {
        e.preventDefault();
        const itemId = link.dataset.id;
        openViewItemModal(itemId);
        return;
      }

      // Edit button click
      const editBtn = e.target.closest('.edit-item-btn');
      if (editBtn) {
        e.preventDefault();
        const itemId = editBtn.dataset.id;
        openEditItemModal(itemId, {
          onSave: async () => {
            await loadInventory();
            await renderInventoryStats();
          }
        });
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

  // Flaw select - add flaw
  const flawSelect = $('#add-flaw-select');
  if (flawSelect) {
    flawSelect.addEventListener('change', handleAddFlaw);
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

let storeDropdownInitialized = false;

function populateStoreSelect() {
  if (storeDropdownInitialized) return;
  storeDropdownInitialized = true;

  createChainStoreDropdown({
    chainSelector: '#item-chain',
    storeSelector: '#item-store',
    getAllStores: () => state.getAllStores()
  });
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

function formatColour(colour) {
  const map = {
    'royal_blue': 'Royal Blue',
    'powder_blue': 'Powder Blue',
    'multicolour': 'Multicolour'
  };
  return map[colour] || capitalize(colour);
}

function formatMaterial(material) {
  const map = {
    'merino_wool': 'Merino Wool',
    'patent_leather': 'Patent Leather',
    'pony_hair': 'Pony Hair'
  };
  return map[material] || material.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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

// Generate auto-title from item components
function generateItemTitle(brand, colour, material, subcategory) {
  const parts = [];
  if (brand) parts.push(brand);
  if (colour) parts.push(formatColour(colour).toLowerCase());
  if (material) parts.push(formatMaterial(material).toLowerCase());
  if (subcategory) parts.push(formatStatus(subcategory).toLowerCase());
  return parts.join(' ') || 'Untitled item';
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
  sortData(filtered, sortColumn, sortDirection, (item, col) => {
    if (col === 'purchase_price') return Number(item[col]) || 0;
    return item[col];
  });

  // Render
  if (filtered.length === 0) {
    tbody.innerHTML = emptyStateRow({ colspan: 4, icon: 'I', message: 'No items found' });
    return;
  }

  tbody.innerHTML = filtered.map(item => `
    <tr data-id="${item.id}">
      <td><a href="#" class="table-link" data-id="${item.id}">${escapeHtml(item.title || '-')}</a></td>
      <td>${formatCurrency(item.purchase_price || 0)}</td>
      <td><span class="status status--${item.status}">${formatStatus(item.status)}</span></td>
      <td class="table-actions">
        <button class="btn btn--sm edit-item-btn" data-id="${item.id}">Edit</button>
      </td>
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

export function openAddItemModal(context = null) {
  const dialog = $('#add-item-dialog');
  if (!dialog) return;

  if (!addItemModal) {
    addItemModal = createModalController(dialog);
  }

  // Ensure stores are populated (may have loaded after initial setup)
  populateStoreSelect();

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
    visitContext = { storeId: context.storeId, date: context.date };

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
  }

  addItemModal.open();
}

// =============================================================================
// EDIT ITEM MODAL
// =============================================================================

export async function openEditItemModal(itemId, context = null) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  const dialog = $('#add-item-dialog');
  if (!dialog) return;

  if (!addItemModal) {
    addItemModal = createModalController(dialog);
  }

  // Ensure stores are populated
  populateStoreSelect();

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
    visitContext = { storeId: item.store_id, date: item.acquisition_date };

    const storeGroup = $('#store-field-group');
    const dateGroup = $('#date-field-group');
    if (storeGroup) storeGroup.hidden = true;
    if (dateGroup) dateGroup.hidden = true;

    const storeSelect = $('#item-store');
    const dateInput = $('#item-acquisition-date');
    if (storeSelect) storeSelect.removeAttribute('required');
    if (dateInput) dateInput.removeAttribute('required');
  }

  addItemModal.open();
}

function populateFormWithItem(item) {
  // Basic info
  setValue('#item-title', item.title);
  setValue('#item-category', item.category);
  setValue('#item-brand', item.brand);
  setValue('#item-country', item.country_of_manufacture);
  setValue('#item-era', item.era);

  // Colours
  setValue('#item-primary-colour', item.primary_colour);
  setValue('#item-secondary-colour', item.secondary_colour);

  // Trigger category change to populate subcategory options
  if (item.category) {
    handleCategoryChange({ target: { value: item.category } });
    // After subcategory options are populated, set the value
    setTimeout(() => {
      setValue('#item-subcategory', item.subcategory);
      // Trigger subcategory change for ring size
      if (item.subcategory) {
        handleSubcategoryChange({ target: { value: item.subcategory } });
      }
    }, 0);
  }

  // Acquisition - set chain first, then location
  if (item.store_id) {
    const store = state.getStore(item.store_id);
    if (store?.chain) {
      setValue('#item-chain', store.chain);
      // Trigger change to populate locations
      const chainSelect = $('#item-chain');
      if (chainSelect) {
        chainSelect.dispatchEvent(new Event('change'));
        // Set location after dropdown is populated
        setTimeout(() => setValue('#item-store', item.store_id), 0);
      }
    } else {
      setValue('#item-store', item.store_id);
    }
  }
  setValue('#item-acquisition-date', item.acquisition_date);
  setValue('#item-price', item.purchase_price);
  setValue('#item-tax', item.tax_paid);

  // Sizing
  setValue('#item-labeled-size', item.labeled_size);
  setValue('#item-width', item.width);
  setValue('#item-ring-size', item.ring_size);

  // Populate measurements
  if (item.measurements && item.category) {
    const fields = MEASUREMENT_FIELDS[item.category] || [];
    fields.forEach(field => {
      if (item.measurements[field.key]) {
        setValue(`#item-${field.key}`, item.measurements[field.key]);
      }
    });
  }

  // Materials (handle both new structured format and legacy string format)
  if (item.primary_material && typeof item.primary_material === 'object') {
    setValue('#item-primary-material', item.primary_material.name);
    setValue('#item-primary-material-pct', item.primary_material.percentage);
  } else if (typeof item.primary_material === 'string') {
    // Legacy: try to find matching material option
    const materialLower = item.primary_material.toLowerCase().replace(/\s+/g, '_');
    if (MATERIAL_OPTIONS.includes(materialLower)) {
      setValue('#item-primary-material', materialLower);
    }
  }

  // Secondary materials (array of structured objects)
  if (Array.isArray(item.secondary_materials)) {
    currentSecondaryMaterials = item.secondary_materials.map(m => ({ ...m }));
  } else {
    currentSecondaryMaterials = [];
  }
  renderSecondaryMaterialsList();

  // Condition
  setValue('#item-condition', item.overall_condition);
  setValue('#item-condition-notes', item.condition_notes);

  // Flaws
  currentFlaws = item.flaws ? [...item.flaws] : [];
  renderFlawsList();

  // Pricing
  setValue('#item-status', item.status);
  setValue('#item-estimated-value', item.estimated_resale_value);
  setValue('#item-min-price', item.minimum_acceptable_price);
  setValue('#item-brand-multiplier', item.brand_premium_multiplier || 1.0);

  // Jewelry-specific
  if (item.category === 'jewelry') {
    setValue('#item-metal-type', item.metal_type);
    setValue('#item-closure-type', item.closure_type);
    setValue('#item-hallmarks', item.hallmarks);
    setValue('#item-stones', item.stones);
    setCheckboxGroup('tested_with[]', item.tested_with);
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

  // Clear visit context and restore store/date field visibility
  visitContext = null;
  const storeGroup = $('#store-field-group');
  const dateGroup = $('#date-field-group');
  const chainSelect = $('#item-chain');
  const storeSelect = $('#item-store');
  const dateInput = $('#item-acquisition-date');
  if (storeGroup) storeGroup.hidden = false;
  if (dateGroup) dateGroup.hidden = false;
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

  // Reset flaws
  currentFlaws = [];
  renderFlawsList();

  // Reset secondary materials
  currentSecondaryMaterials = [];
  renderSecondaryMaterialsList();

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
  if (statusInput) statusInput.value = 'unlisted';

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
  const category = formData.get('category');
  const subcategory = formData.get('subcategory')?.trim() || null;
  const brand = formData.get('brand')?.trim() || null;

  // Get new colour and material fields
  const primaryColour = formData.get('primary_colour') || null;
  const secondaryColour = formData.get('secondary_colour') || null;
  const primaryMaterialName = formData.get('primary_material_name') || null;
  const primaryMaterialPct = parseInt(formData.get('primary_material_percentage')) || 100;

  // Auto-generate title from components
  const title = generateItemTitle(brand, primaryColour, primaryMaterialName, subcategory);

  // Collect secondary materials
  const secondaryMaterials = collectSecondaryMaterials();

  // Build item object
  const item = {
    // Basic info (title is auto-generated)
    title: title,
    category: category,
    subcategory: subcategory,
    brand: brand,
    country_of_manufacture: formData.get('country_of_manufacture')?.trim() || null,
    era: formData.get('era') || null,

    // Colours
    primary_colour: primaryColour,
    secondary_colour: secondaryColour,

    // Acquisition
    store_id: visitContext?.storeId || formData.get('store_id'),
    acquisition_date: visitContext?.date || formData.get('acquisition_date') || new Date().toISOString().split('T')[0],
    purchase_price: parseFloat(formData.get('purchase_price')) || 0,
    tax_paid: parseFloat(formData.get('tax_paid')) || 0,

    // Sizing
    labeled_size: formData.get('labeled_size')?.trim() || null,
    measurements: collectMeasurements(formData, category),

    // Materials (structured)
    primary_material: primaryMaterialName ? {
      name: primaryMaterialName,
      percentage: primaryMaterialPct
    } : null,
    secondary_materials: secondaryMaterials.length > 0 ? secondaryMaterials : null,

    // Condition
    overall_condition: formData.get('condition') || null,
    condition_notes: formData.get('condition_notes')?.trim() || null,
    flaws: currentFlaws.length > 0 ? [...currentFlaws] : null,

    // Pricing
    estimated_resale_value: parseFloat(formData.get('estimated_resale_value')) || null,
    minimum_acceptable_price: parseFloat(formData.get('minimum_acceptable_price')) || null,
    brand_premium_multiplier: parseFloat(formData.get('brand_premium_multiplier')) || 1.0,

    // Status (auto-set to unlisted for new items)
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
  if (!item.category) {
    showToast('Category is required');
    return;
  }
  if (!item.subcategory) {
    showToast('Type is required');
    return;
  }
  if (!item.primary_colour) {
    showToast('Primary colour is required');
    return;
  }
  if (!item.primary_material) {
    showToast('Primary material is required');
    return;
  }
  if (!item.store_id) {
    showToast('Store is required');
    return;
  }

  try {
    if (editingItemId) {
      await updateInventoryItem(editingItemId, item);
      showToast('Item updated');
    } else {
      await createInventoryItem(item);
      showToast('Item saved');
    }

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

let viewItemModal = null;

export async function openViewItemModal(itemId) {
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
  const storeName = store?.name || '-';

  const sections = [];

  // Format category as: Primary (Secondary)
  const categoryDisplay = item.subcategory
    ? `${capitalize(item.category)} (${formatStatus(item.subcategory)})`
    : capitalize(item.category);

  // Format colours as: Primary (primary), Secondary
  let colourDisplay = '';
  if (item.primary_colour) {
    colourDisplay = `${formatColour(item.primary_colour)} (primary)`;
    if (item.secondary_colour) {
      colourDisplay += `, ${formatColour(item.secondary_colour)}`;
    }
  }

  // Basic info
  sections.push(`
    <section class="detail-section">
      <h3 class="detail-section-title">Basic info</h3>
      <dl class="detail-grid">
        <dt>Category</dt><dd>${categoryDisplay}</dd>
        ${item.brand ? `<dt>Brand</dt><dd>${escapeHtml(item.brand)}</dd>` : ''}
        ${item.country_of_manufacture ? `<dt>Country</dt><dd>${escapeHtml(item.country_of_manufacture)}</dd>` : ''}
        ${colourDisplay ? `<dt>Colours</dt><dd>${colourDisplay}</dd>` : ''}
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
  if (item.labeled_size || item.measurements) {
    let sizingHtml = '<dl class="detail-grid">';
    if (item.labeled_size) sizingHtml += `<dt>Labeled size</dt><dd>${escapeHtml(item.labeled_size)}</dd>`;
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
    // Build combined materials list with percentages
    const materialsList = [];

    // Handle primary material (both structured object and legacy string format)
    if (item.primary_material) {
      if (typeof item.primary_material === 'object') {
        const pct = item.primary_material.percentage || 100;
        materialsList.push(`${formatMaterial(item.primary_material.name)} (${pct}%)`);
      } else {
        // Parse string format like "100% cashmere" or "70% wool/30% cashmere"
        materialsList.push(formatMaterialString(item.primary_material));
      }
    }

    // Handle secondary materials (array of structured objects or legacy string)
    if (item.secondary_materials) {
      if (Array.isArray(item.secondary_materials)) {
        item.secondary_materials.forEach(m => {
          const pct = m.percentage ? ` (${m.percentage}%)` : '';
          materialsList.push(`${formatMaterial(m.name)}${pct}`);
        });
      } else {
        materialsList.push(formatMaterialString(item.secondary_materials));
      }
    }

    let materialsHtml = '<dl class="detail-grid">';
    if (materialsList.length > 0) {
      materialsHtml += `<dt>Materials</dt><dd>${materialsList.join(', ')}</dd>`;
    }
    if (item.metal_type) materialsHtml += `<dt>Metal type</dt><dd>${formatMetalType(item.metal_type)}</dd>`;
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

  // Pricing (if pricing info present)
  if (item.estimated_resale_value || item.minimum_acceptable_price) {
    let pricingHtml = '<dl class="detail-grid">';
    if (item.estimated_resale_value) pricingHtml += `<dt>Est. value</dt><dd>${formatCurrency(item.estimated_resale_value)}</dd>`;
    if (item.minimum_acceptable_price) pricingHtml += `<dt>Min. price</dt><dd>${formatCurrency(item.minimum_acceptable_price)}</dd>`;
    pricingHtml += '</dl>';
    sections.push(`<section class="detail-section"><h3 class="detail-section-title">Pricing</h3>${pricingHtml}</section>`);
  }

  // Packaging (if present)
  if (item.packaging) {
    sections.push(`
      <section class="detail-section">
        <h3 class="detail-section-title">Packaging</h3>
        <p>${formatPackaging(item.packaging)}</p>
      </section>
    `);
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
