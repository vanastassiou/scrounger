// =============================================================================
// STORES MODULE
// =============================================================================

import { state } from './state.js';
import { getAllStoreStats, getAllUserStores, createUserStore, getInventoryByStore } from './db.js';
import { showToast } from './ui.js';
import { $, formatCurrency, formatDate, escapeHtml, formatChainName, createFormHandler } from './utils.js';
import { getTierSortOrder } from './config.js';
import { openViewItemModal } from './inventory.js';
import { createLazyModal, createTableController, renderDetailSections } from './components.js';

let storesData = [];
let statsMap = new Map();
let storesTableCtrl = null;

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initStores() {
  await loadStores();
  setupTableController();
  setupOtherHandlers();
}

export async function loadStores() {
  // Load all stores from IndexedDB (synced from Google Drive)
  const allStores = await getAllUserStores();
  state.stores = allStores;

  // Filter out hidden stores for display
  storesData = allStores.filter(s => !s.hidden);

  statsMap = await getAllStoreStats();
  if (storesTableCtrl) {
    storesTableCtrl.render();
  }
}

function setupTableController() {
  storesTableCtrl = createTableController({
    tableSelector: '#stores-table',
    tbodySelector: '#stores-tbody',
    getData: () => storesData,
    filterItem: (store, filters, search) => {
      // Filter by tier
      if (filters.tier && store.tier !== filters.tier) return false;
      // Filter by search
      if (search) {
        const name = store.name?.toLowerCase() || '';
        const address = store.address?.toLowerCase() || '';
        if (!name.includes(search) && !address.includes(search)) return false;
      }
      return true;
    },
    getColumnValue: (store, col) => {
      const stats = statsMap.get(store.id);
      switch (col) {
        case 'name': return store.name.toLowerCase();
        case 'tier': return getTierSortOrder(store.tier);
        case 'visits': return stats?.total_visits ?? 0;
        case 'hit_rate': return stats?.hit_rate ?? 0;
        default: return store.name.toLowerCase();
      }
    },
    createRow: (store) => createStoreRow(store, statsMap.get(store.id)),
    emptyState: { colspan: 4, icon: 'S', message: 'No stores found' },
    searchSelector: '#store-search',
    countSelector: '#store-count',
    countTemplate: '{count} store{s}',
    defaultSort: { column: 'name', direction: 'asc' },
    filterButtons: [{ selector: '.filter-btn[data-tier]', dataAttr: 'tier', key: 'tier' }],
    clickHandlers: {
      // External links - return true to allow default navigation
      '.store-address': () => true,
      // Store row/name click - open detail modal
      'tr[data-store-id]': (el) => openViewStoreModal(el.dataset.storeId)
    }
  });

  storesTableCtrl.init();
}

function setupOtherHandlers() {
  // Add store button
  const addBtn = $('#add-store-btn');
  if (addBtn) {
    addBtn.addEventListener('click', openAddStoreModal);
  }

  // Store form handler
  createFormHandler({
    formSelector: '#store-form',
    validate: (formData) => {
      const name = formData.get('name')?.trim();
      const tier = formData.get('tier');
      if (!name) return { valid: false, errors: ['Name is required'] };
      if (!tier) return { valid: false, errors: ['Tier is required'] };
      return { valid: true };
    },
    transform: (formData) => ({
      name: formData.get('name')?.trim(),
      address: formData.get('address')?.trim() || null,
      tier: formData.get('tier'),
      phone: formData.get('phone')?.trim() || null,
      notes: formData.get('notes')?.trim() || null
    }),
    onSubmit: (store) => createUserStore(store),
    onSuccess: async () => {
      showToast('Store saved');
      addStoreModal.close();
      await loadStores();
    },
    onError: (err) => showToast(err.message),
    resetOnSuccess: false
  });
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
    <tr class="store-row" data-store-id="${store.id}">
      <td>
        <div class="row-mobile">
          <div class="store-row__title">
            <a href="#" class="store-row__name table-link">${escapeHtml(store.name)}</a>
            <div class="store-row__meta">
              <span class="badge badge--compact badge--tier-${store.tier.toLowerCase()}">${store.tier}</span>
              ${addressHtml}
            </div>
          </div>
          <div class="store-row__stats">
            <span class="store-row__stat">Visits: <span class="store-row__stat-value">${visitCount}</span></span>
            <span class="store-row__stat">Hit rate: <span class="store-row__stat-value">${hitRate}</span></span>
          </div>
        </div>
        <div class="row-desktop">
          <a href="#" class="store-name table-link">${escapeHtml(store.name)}</a>
          ${addressHtml}
        </div>
      </td>
      <td data-label="Tier"><span class="badge badge--compact badge--tier-${store.tier.toLowerCase()}">${store.tier}</span></td>
      <td data-label="Visits">${visitCount}</td>
      <td data-label="Hit Rate">${hitRate}</td>
    </tr>
  `;
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

let viewStoreClickHandlerSetup = false;

const viewStoreModal = createLazyModal('#view-store-dialog', {
  onOpen: (dialog, { store, stats, items }) => {
    // Setup click handler for item links (once)
    if (!viewStoreClickHandlerSetup) {
      viewStoreClickHandlerSetup = true;
      const contentEl = dialog.querySelector('#view-store-content');
      if (contentEl) {
        contentEl.addEventListener('click', (e) => {
          const link = e.target.closest('.table-link');
          if (link) {
            e.preventDefault();
            openViewItemModal(link.dataset.id);
          }
        });
      }
    }

    // Update modal title
    const titleEl = dialog.querySelector('#view-store-title');
    if (titleEl) {
      titleEl.textContent = store.name;
    }

    // Render content
    const contentEl = dialog.querySelector('#view-store-content');
    if (contentEl) {
      contentEl.innerHTML = renderStoreDetails(store, stats, items);
    }
  }
});

export async function openViewStoreModal(storeId) {
  const store = state.getStore(storeId);
  if (!store) {
    showToast('Store not found');
    return;
  }

  const stats = statsMap.get(storeId);
  const items = await getInventoryByStore(storeId);

  viewStoreModal.open({ store, stats, items });
}

function renderStoreDetails(store, stats, items) {
  const sections = [];

  // Store info section
  const addressHtml = store.address
    ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}" target="_blank" rel="noopener" class="table-link" title="${escapeHtml(store.address)}">📍</a>`
    : null;

  sections.push({
    title: 'Store Info',
    content: [
      { dt: 'Address', dd: addressHtml },
      { dt: 'Tier', dd: `<span class="badge badge--compact badge--tier-${store.tier.toLowerCase()}">${store.tier}</span>` },
      { dt: 'Phone', dd: store.phone ? escapeHtml(store.phone) : null },
      { dt: 'Chain', dd: store.chain ? escapeHtml(formatChainName(store.chain)) : null },
      { dt: 'Notes', dd: store.notes ? escapeHtml(store.notes) : null }
    ]
  });

  // Stats section
  if (stats) {
    sections.push({
      title: 'Statistics',
      content: [
        { dt: 'Total visits', dd: stats.total_visits },
        { dt: 'Hit rate', dd: `${Math.round(stats.hit_rate * 100)}%` },
        { dt: 'Total spent', dd: formatCurrency(stats.total_spent) },
        { dt: 'Items acquired', dd: stats.total_items },
        { dt: 'Last visit', dd: stats.last_visit_date ? formatDate(stats.last_visit_date) : null }
      ]
    });
  }

  // Inventory section
  if (items.length > 0) {
    const sortedItems = [...items].sort((a, b) =>
      (b.metadata?.acquisition?.date || '').localeCompare(a.metadata?.acquisition?.date || '')
    );

    let itemsHtml = '<table class="table table--mini"><thead><tr><th>Item</th><th>Date</th><th>Price</th></tr></thead><tbody>';
    for (const item of sortedItems) {
      const title = item.title || 'Untitled item';
      const date = item.metadata?.acquisition?.date ? formatDate(item.metadata.acquisition.date) : '-';
      const price = item.metadata?.acquisition?.price != null ? formatCurrency(item.metadata.acquisition.price) : '-';
      itemsHtml += `<tr><td><a href="#" class="table-link" data-id="${item.id}">${escapeHtml(title)}</a></td><td>${date}</td><td>${price}</td></tr>`;
    }
    itemsHtml += '</tbody></table>';
    sections.push({ title: `Inventory (${items.length})`, content: itemsHtml });
  } else {
    sections.push({ title: 'Inventory', content: '<p class="text-muted">No items acquired from this store yet.</p>' });
  }

  return renderDetailSections(sections);
}

// =============================================================================
// ADD STORE MODAL
// =============================================================================

const addStoreModal = createLazyModal('#add-store-dialog', {
  onOpen: (dialog) => {
    const form = dialog.querySelector('#store-form');
    if (form) form.reset();
  }
});

function openAddStoreModal() {
  addStoreModal.open();
}

