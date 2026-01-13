// =============================================================================
// MAIN APPLICATION
// =============================================================================

import { state } from './state.js';
import { createTabController, updateSyncStatus, showToast, createModalController } from './ui.js';
import { initInventory, renderInventoryStats, openAddItemModal } from './inventory.js';
import { initStores, renderStoreCount } from './stores.js';
import { initVisits, loadVisits, openLogVisitModal } from './visits.js';
import { initSelling, listItemForSale } from './selling.js';
import { initDashboardActions } from './dashboard-actions.js';
import { syncOnOpen, isAuthenticated } from './sync.js';
import { clearAllData, importBaselineInventory, getItemsNotInPipeline } from './db.js';
import { escapeHtml } from './utils.js';

// =============================================================================
// INITIALIZATION
// =============================================================================

async function init() {
  console.log('Thrift Inventory starting...');

  // Load stores data first (needed by other modules)
  await loadStoresData();

  // Load baseline inventory data (runs once per version)
  await loadBaselineData();

  // Initialize tab controller
  createTabController('.tab', '.page', {
    storageKey: 'activeTab',
    onActivate: handleTabActivate
  });

  // Initialize modules
  await Promise.all([
    initInventory(),
    initStores(),
    initVisits(),
    initSelling(),
    initDashboardActions()
  ]);

  // Render dashboard stats
  await renderDashboardStats();

  // Dashboard action buttons
  document.getElementById('add-item-btn')?.addEventListener('click', openAddItemModal);
  document.getElementById('log-visit-btn')?.addEventListener('click', openLogVisitModal);
  document.getElementById('list-for-sale-btn')?.addEventListener('click', openSelectItemDialog);

  // Item picker modal event handlers
  initSelectItemDialog();

  // Dev tools
  document.getElementById('clear-data-btn')?.addEventListener('click', handleClearData);

  // Check for stored auth and sync
  if (isAuthenticated()) {
    syncOnOpen().catch(console.error);
  } else {
    updateSyncStatus(state.syncState);
  }

  // Handle online/offline
  window.addEventListener('online', () => {
    if (isAuthenticated()) {
      syncOnOpen().catch(console.error);
    }
  });

  console.log('Thrift Inventory ready');
}

async function loadStoresData() {
  try {
    const response = await fetch('data/stores.json');
    state.storesDB = await response.json();
  } catch (err) {
    console.error('Failed to load stores:', err);
  }
}

async function loadBaselineData() {
  try {
    const response = await fetch('data/inventory.json');
    const data = await response.json();
    const result = await importBaselineInventory(data.items, data.meta.version);
    if (result.imported > 0) {
      console.log(`Imported ${result.imported} baseline inventory items`);
    }
  } catch (err) {
    console.error('Failed to load baseline data:', err);
  }
}

function handleTabActivate(tabId) {
  // Could trigger lazy loading or refresh data here
  console.log('Tab activated:', tabId);
}

async function renderDashboardStats() {
  await renderInventoryStats();
  renderStoreCount();
}

// =============================================================================
// DEV TOOLS
// =============================================================================

async function handleClearData() {
  if (!confirm('Clear all inventory and visit data?')) return;

  const btn = document.getElementById('clear-data-btn');
  if (btn) btn.disabled = true;

  try {
    await clearAllData();
    showToast('Data cleared');

    // Reload data
    await Promise.all([
      initInventory(),
      loadVisits()
    ]);
    await renderDashboardStats();
  } catch (err) {
    console.error('Clear failed:', err);
    showToast('Clear failed');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Expose for console access
window.clearAllData = clearAllData;

// =============================================================================
// SELECT ITEM DIALOG (List for Sale)
// =============================================================================

const selectItemModal = createModalController(document.getElementById('select-item-dialog'));
let selectItemData = [];

function initSelectItemDialog() {
  const searchInput = document.getElementById('item-picker-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      renderItemPickerList(e.target.value.toLowerCase());
    });
  }

  const listEl = document.getElementById('item-picker-list');
  if (listEl) {
    listEl.addEventListener('click', async (e) => {
      const itemEl = e.target.closest('.item-picker-item');
      if (itemEl) {
        const itemId = parseInt(itemEl.dataset.id);
        await listItemForSale(itemId);
        selectItemModal.close();
        // Refresh dashboard
        await initDashboardActions();
        await renderDashboardStats();
      }
    });
  }
}

async function openSelectItemDialog() {
  // Load items not in pipeline
  selectItemData = await getItemsNotInPipeline();

  // Reset search
  const searchInput = document.getElementById('item-picker-search');
  if (searchInput) searchInput.value = '';

  // Render list
  renderItemPickerList('');

  selectItemModal.open();
}

function renderItemPickerList(searchTerm) {
  const listEl = document.getElementById('item-picker-list');
  if (!listEl) return;

  let filtered = selectItemData;

  if (searchTerm) {
    filtered = selectItemData.filter(item => {
      const title = (item.title || '').toLowerCase();
      const brand = (item.brand || '').toLowerCase();
      return title.includes(searchTerm) || brand.includes(searchTerm);
    });
  }

  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="text-muted">No items available to list</p>';
    return;
  }

  listEl.innerHTML = filtered.map(item => `
    <div class="item-picker-item" data-id="${item.id}">
      <div class="item-picker-title">${escapeHtml(item.title || 'Untitled')}</div>
      <div class="item-picker-meta">
        ${item.brand ? `<span>${escapeHtml(item.brand)}</span>` : ''}
        ${item.status ? `<span class="status status--${item.status}">${item.status}</span>` : ''}
      </div>
    </div>
  `).join('');
}

// =============================================================================
// SERVICE WORKER
// =============================================================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.error('Service worker registration failed:', err);
    });
  });
}

// =============================================================================
// START
// =============================================================================

init().catch(console.error);
