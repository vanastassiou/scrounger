// =============================================================================
// MAIN APPLICATION
// =============================================================================

import { state } from './state.js';
import { createTabController, updateSyncStatus, showToast } from './ui.js';
import { initInventory, renderInventoryStats, openAddItemModal } from './inventory.js';
import { initStores, renderStoreCount } from './stores.js';
import { initVisits, loadVisits, openLogVisitModal } from './visits.js';
import { initSelling } from './selling.js';
import { initDashboardActions } from './dashboard-actions.js';
import { syncOnOpen, isAuthenticated } from './sync.js';
import { seedDatabase } from './seed.js';
import { clearAllData } from './db.js';

// =============================================================================
// INITIALIZATION
// =============================================================================

async function init() {
  console.log('Thrift Inventory starting...');

  // Load stores data first (needed by other modules)
  await loadStoresData();

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

  // Dev tools
  document.getElementById('seed-data-btn')?.addEventListener('click', handleSeedData);
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

async function handleSeedData() {
  const btn = document.getElementById('seed-data-btn');
  if (btn) btn.disabled = true;

  try {
    const result = await seedDatabase();
    showToast(`Seeded ${result.itemCount} items, ${result.visitCount} visits`);

    // Reload data
    await Promise.all([
      initInventory(),
      loadVisits()
    ]);
    await renderDashboardStats();
  } catch (err) {
    console.error('Seed failed:', err);
    showToast('Seed failed');
  } finally {
    if (btn) btn.disabled = false;
  }
}

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
window.seedDatabase = seedDatabase;
window.clearAllData = clearAllData;

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
