// =============================================================================
// STORES MODULE
// =============================================================================

import { state } from './state.js';
import { getAllStoreStats, getAllUserStores, createUserStore, getInventoryByStore } from './db.js';
import { showToast, createModalController } from './ui.js';
import {
  $, $$, formatCurrency, formatDate, escapeHtml,
  createSortableTable, createFilterButtons, emptyStateRow, formatChainName, updateSortIndicators
} from './utils.js';
import { getTierSortOrder } from './config.js';
import { openViewItemModal } from './inventory.js';

let storesData = [];
let statsMap = new Map();
let filterTier = null;
let sortColumn = 'name';
let sortDirection = 'asc';
let searchQuery = '';
let viewStoreModal = null;

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initStores() {
  await loadStores();
  setupEventHandlers();
}

export async function loadStores() {
  // Load all stores from IndexedDB (synced from Google Drive)
  const allStores = await getAllUserStores();
  state.stores = allStores;

  // Filter out hidden stores for display
  storesData = allStores.filter(s => !s.hidden);

  statsMap = await getAllStoreStats();
  renderStoresTable();
}

function setupEventHandlers() {
  // Search handler
  const searchInput = $('#store-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderStoresTable();
    });
  }

  // Tier filter buttons
  createFilterButtons({
    selector: '.filter-btn[data-tier]',
    dataAttr: 'tier',
    onFilter: (value) => {
      filterTier = value;
      renderStoresTable();
    }
  });

  // Table header sorting and row clicks
  const table = $('#stores-table');
  if (table) {
    const sortHandler = createSortableTable({
      getState: () => ({ sortColumn, sortDirection }),
      setState: (s) => { sortColumn = s.sortColumn; sortDirection = s.sortDirection; },
      onSort: renderStoresTable
    });

    table.addEventListener('click', (e) => {
      // Header sorting
      if (sortHandler(e)) return;

      // External links (address) - let them navigate normally
      const externalLink = e.target.closest('.store-address');
      if (externalLink) return;

      // Row/store name click - open store detail
      const row = e.target.closest('tr[data-store-id]');
      if (row) {
        e.preventDefault();
        const storeId = row.dataset.storeId;
        openViewStoreModal(storeId);
      }
    });
  }

  // Add store button
  const addBtn = $('#add-store-btn');
  if (addBtn) {
    addBtn.addEventListener('click', openAddStoreModal);
  }

  // Store form submission
  const form = $('#store-form');
  if (form) {
    form.addEventListener('submit', handleStoreSubmit);
  }
}

// =============================================================================
// RENDERING
// =============================================================================

function renderStoresTable() {
  const tbody = $('#stores-tbody');
  if (!tbody) return;

  // Filter by search query
  let filtered = storesData;
  if (searchQuery) {
    filtered = filtered.filter(s => {
      const name = s.name?.toLowerCase() || '';
      const address = s.address?.toLowerCase() || '';
      return name.includes(searchQuery) || address.includes(searchQuery);
    });
  }

  // Filter by tier
  if (filterTier) {
    filtered = filtered.filter(s => s.tier === filterTier);
  }

  // Sort
  filtered = [...filtered].sort((a, b) => {
    const statsA = statsMap.get(a.id);
    const statsB = statsMap.get(b.id);

    let aVal, bVal;

    switch (sortColumn) {
      case 'name':
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
        break;
      case 'tier':
        aVal = getTierSortOrder(a.tier);
        bVal = getTierSortOrder(b.tier);
        break;
      case 'visits':
        aVal = statsA?.total_visits ?? 0;
        bVal = statsB?.total_visits ?? 0;
        break;
      case 'hit_rate':
        aVal = statsA?.hit_rate ?? 0;
        bVal = statsB?.hit_rate ?? 0;
        break;
      default:
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = emptyStateRow({ colspan: 4, icon: 'S', message: 'No stores found' });
    updateStoreCount(0);
    return;
  }

  tbody.innerHTML = filtered.map(store => createStoreRow(store, statsMap.get(store.id))).join('');

  // Update sort indicators
  const table = $('#stores-table');
  if (table) updateSortIndicators(table, sortColumn, sortDirection);

  updateStoreCount(filtered.length);
}

function createStoreRow(store, stats) {
  const visitCount = stats?.total_visits ?? 0;
  const hitRate = stats ? `${Math.round(stats.hit_rate * 100)}%` : '-';

  let addressHtml = '';
  if (store.address) {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`;
    addressHtml = `<a href="${mapsUrl}" target="_blank" rel="noopener" class="store-address table-link" title="${escapeHtml(store.address)}">📍</a>`;
  }

  return `
    <tr data-store-id="${store.id}">
      <td>
        <div class="store-info">
          <a href="#" class="store-name table-link">${escapeHtml(store.name)}</a>
          ${addressHtml}
        </div>
      </td>
      <td data-label="Tier"><span class="tier tier--${store.tier}">${store.tier}</span></td>
      <td data-label="Visits">${visitCount}</td>
      <td data-label="Hit Rate">${hitRate}</td>
    </tr>
  `;
}

function updateStoreCount(count) {
  const countEl = $('#store-count');
  if (countEl) {
    countEl.textContent = `${count} store${count !== 1 ? 's' : ''}`;
  }
}

export function renderStoreCount() {
  const countEl = $('#stat-stores-visited');
  if (countEl) {
    // Count stores with at least one visit
    let visitedCount = 0;
    for (const stats of statsMap.values()) {
      if (stats.total_visits > 0) visitedCount++;
    }
    countEl.textContent = visitedCount;
  }
}

// =============================================================================
// VIEW STORE MODAL
// =============================================================================

export async function openViewStoreModal(storeId) {
  const dialog = $('#view-store-dialog');
  if (!dialog) return;

  if (!viewStoreModal) {
    viewStoreModal = createModalController(dialog);

    // Add click handler for item links (once)
    const contentEl = $('#view-store-content');
    if (contentEl) {
      contentEl.addEventListener('click', (e) => {
        const link = e.target.closest('.table-link');
        if (link) {
          e.preventDefault();
          const itemId = link.dataset.id;
          openViewItemModal(itemId);
        }
      });
    }
  }

  const store = state.getStore(storeId);
  if (!store) {
    showToast('Store not found');
    return;
  }

  const stats = statsMap.get(storeId);
  const items = await getInventoryByStore(storeId);

  // Update modal title
  const titleEl = $('#view-store-title');
  if (titleEl) {
    titleEl.textContent = store.name;
  }

  // Render content
  const contentEl = $('#view-store-content');
  if (contentEl) {
    contentEl.innerHTML = renderStoreDetails(store, stats, items);
  }

  viewStoreModal.open();
}

function renderStoreDetails(store, stats, items) {
  const sections = [];

  // Store info section
  let infoHtml = '<dl class="detail-grid">';
  if (store.address) {
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`;
    infoHtml += `<dt>Address</dt><dd><a href="${mapsUrl}" target="_blank" rel="noopener" class="table-link" title="${escapeHtml(store.address)}">📍</a></dd>`;
  }
  infoHtml += `<dt>Tier</dt><dd><span class="tier tier--${store.tier}">${store.tier}</span></dd>`;
  if (store.phone) infoHtml += `<dt>Phone</dt><dd>${escapeHtml(store.phone)}</dd>`;
  if (store.chain) infoHtml += `<dt>Chain</dt><dd>${escapeHtml(formatChainName(store.chain))}</dd>`;
  if (store.notes) infoHtml += `<dt>Notes</dt><dd>${escapeHtml(store.notes)}</dd>`;
  infoHtml += '</dl>';
  sections.push(`<section class="detail-section"><h3 class="detail-section-title">Store Info</h3>${infoHtml}</section>`);

  // Stats section
  if (stats) {
    let statsHtml = '<dl class="detail-grid">';
    statsHtml += `<dt>Total visits</dt><dd>${stats.total_visits}</dd>`;
    statsHtml += `<dt>Hit rate</dt><dd>${Math.round(stats.hit_rate * 100)}%</dd>`;
    statsHtml += `<dt>Total spent</dt><dd>${formatCurrency(stats.total_spent)}</dd>`;
    statsHtml += `<dt>Items acquired</dt><dd>${stats.total_items}</dd>`;
    if (stats.last_visit_date) {
      statsHtml += `<dt>Last visit</dt><dd>${formatDate(stats.last_visit_date)}</dd>`;
    }
    statsHtml += '</dl>';
    sections.push(`<section class="detail-section"><h3 class="detail-section-title">Statistics</h3>${statsHtml}</section>`);
  }

  // Inventory section
  if (items.length > 0) {
    // Sort items by acquisition date (most recent first)
    const sortedItems = [...items].sort((a, b) =>
      (b.acquisition_date || '').localeCompare(a.acquisition_date || '')
    );

    let itemsHtml = '<table class="mini-table"><thead><tr>';
    itemsHtml += '<th>Item</th><th>Date</th><th>Price</th>';
    itemsHtml += '</tr></thead><tbody>';

    for (const item of sortedItems) {
      const title = item.title || 'Untitled item';
      const date = item.acquisition_date ? formatDate(item.acquisition_date) : '-';
      const price = item.purchase_price != null ? formatCurrency(item.purchase_price) : '-';
      itemsHtml += `<tr>`;
      itemsHtml += `<td><a href="#" class="table-link" data-id="${item.id}">${escapeHtml(title)}</a></td>`;
      itemsHtml += `<td>${date}</td>`;
      itemsHtml += `<td>${price}</td>`;
      itemsHtml += `</tr>`;
    }

    itemsHtml += '</tbody></table>';
    sections.push(`<section class="detail-section"><h3 class="detail-section-title">Inventory (${items.length})</h3>${itemsHtml}</section>`);
  } else {
    sections.push(`<section class="detail-section"><h3 class="detail-section-title">Inventory</h3><p class="text-muted">No items acquired from this store yet.</p></section>`);
  }

  return sections.join('');
}

// =============================================================================
// ADD STORE MODAL
// =============================================================================

let addStoreModal = null;

function openAddStoreModal() {
  const dialog = $('#add-store-dialog');
  if (!dialog) return;

  if (!addStoreModal) {
    addStoreModal = createModalController(dialog);
  }

  // Reset form
  const form = $('#store-form');
  if (form) {
    form.reset();
  }

  addStoreModal.open();
}

async function handleStoreSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);

  const store = {
    name: formData.get('name')?.trim(),
    address: formData.get('address')?.trim() || null,
    tier: formData.get('tier'),
    phone: formData.get('phone')?.trim() || null,
    notes: formData.get('notes')?.trim() || null
  };

  // Validation
  if (!store.name) {
    showToast('Name is required');
    return;
  }
  if (!store.tier) {
    showToast('Tier is required');
    return;
  }

  try {
    await createUserStore(store);
    showToast('Store saved');
    addStoreModal.close();
    await loadStores();
  } catch (err) {
    console.error('Failed to save store:', err);
  }
}

