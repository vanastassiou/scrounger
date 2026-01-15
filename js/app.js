// =============================================================================
// MAIN APPLICATION
// =============================================================================

import { createTabController, createModalController, showToast } from './ui.js';
import { initInventory, renderInventoryStats, openAddItemModal } from './inventory.js';
import { initStores, renderStoreCount, loadStores } from './stores.js';
import { initVisits, openLogVisitModal } from './visits.js';
import { initSelling, listItemForSale } from './selling.js';
import { initDashboardActions } from './dashboard-actions.js';
import { initSettings } from './settings.js';
import { initReferences } from './references.js';
import {
  initSync,
  isSyncEnabled,
  isConnected,
  isFolderConfigured,
  connect,
  selectFolder,
  syncOnOpen
} from './sync.js';
import { clearAllData, getItemsNotInPipeline, exportArchive, getAllArchived, bulkUpdateStatus } from './db.js';
import { escapeHtml } from './utils.js';

// =============================================================================
// INITIALIZATION
// =============================================================================

async function init() {
  console.log('Thrift Inventory starting...');

  // Initialize sync module first (needed to check setup status)
  await initSync();

  // Check if Google Drive setup is complete
  const needsSetup = !isSyncEnabled() || !isConnected() || !isFolderConfigured();

  if (needsSetup) {
    // Show setup wizard and wait for completion
    await showSetupWizard();
  }

  // Initialize tab controller
  createTabController('.tab', '.page', {
    storageKey: 'activeTab'
  });

  // Initialize modules
  await Promise.all([
    initInventory(),
    initStores(),
    initVisits(),
    initSelling(),
    initDashboardActions(),
    initSettings(),
    initReferences()
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

  // Sync on app open
  if (isConnected() && isFolderConfigured()) {
    await syncOnOpen();
    // Reload stores after sync
    await loadStores();
    await renderDashboardStats();
  }

  // Handle online/offline
  window.addEventListener('online', async () => {
    if (isConnected() && isFolderConfigured()) {
      await syncOnOpen();
      await loadStores();
      await renderDashboardStats();
    }
  });

  console.log('Thrift Inventory ready');
}

async function renderDashboardStats() {
  await renderInventoryStats();
  renderStoreCount();
}

// =============================================================================
// SETUP WIZARD
// =============================================================================

async function showSetupWizard() {
  const dialog = document.getElementById('setup-wizard-dialog');
  if (!dialog) return;

  const step2 = document.getElementById('setup-step-2');
  const step1Status = document.getElementById('setup-step-1-status');
  const step2Status = document.getElementById('setup-step-2-status');
  const connectBtn = document.getElementById('setup-connect-btn');
  const folderBtn = document.getElementById('setup-folder-btn');
  const doneBtn = document.getElementById('setup-done-btn');

  function updateWizardUI() {
    const syncEnabled = isSyncEnabled();
    const connected = isConnected();
    const folderConfigured = isFolderConfigured();

    // Step 1: Connection
    if (!syncEnabled) {
      step1Status.textContent = 'Not configured';
      step1Status.className = 'sync-step-status sync-step-status--error';
      connectBtn.textContent = 'Sync not available';
      connectBtn.disabled = true;
    } else if (connected) {
      step1Status.textContent = 'Connected';
      step1Status.className = 'sync-step-status sync-step-status--success';
      connectBtn.textContent = 'Connected';
      connectBtn.disabled = true;
    } else {
      step1Status.textContent = 'Pending';
      step1Status.className = 'sync-step-status sync-step-status--pending';
      connectBtn.textContent = 'Connect to Google Drive';
      connectBtn.disabled = false;
    }

    // Step 2: Folder
    if (connected) {
      step2.classList.remove('sync-step--disabled');
      folderBtn.disabled = false;

      if (folderConfigured) {
        step2Status.textContent = 'Configured';
        step2Status.className = 'sync-step-status sync-step-status--success';
        folderBtn.textContent = 'Folder Selected';
        folderBtn.disabled = true;
      } else {
        step2Status.textContent = 'Pending';
        step2Status.className = 'sync-step-status sync-step-status--pending';
        folderBtn.textContent = 'Select Folder';
      }
    } else {
      step2.classList.add('sync-step--disabled');
      folderBtn.disabled = true;
    }

    // Done button
    doneBtn.disabled = !connected || !folderConfigured;
  }

  // Initial UI state
  updateWizardUI();

  // Prevent closing with Escape key
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
  });

  // Show the dialog (non-closable)
  dialog.showModal();

  // Return a promise that resolves when setup is complete
  return new Promise((resolve) => {
    // Connect button
    connectBtn.addEventListener('click', async () => {
      connectBtn.disabled = true;
      connectBtn.textContent = 'Connecting...';
      await connect();
      // OAuth will redirect, so this line won't execute until after redirect back
    });

    // Folder button
    folderBtn.addEventListener('click', async () => {
      folderBtn.disabled = true;
      folderBtn.textContent = 'Selecting...';
      // Hide dialog so Google Picker appears on top
      dialog.close();
      try {
        await selectFolder();
        dialog.showModal();
        updateWizardUI();
      } catch (err) {
        dialog.showModal();
        showToast('Failed to select folder: ' + err.message, 'error');
        folderBtn.disabled = false;
        folderBtn.textContent = 'Select Folder';
      }
    });

    // Done button
    doneBtn.addEventListener('click', () => {
      dialog.close();
      resolve();
    });

    // Check if we just returned from OAuth
    if (isConnected()) {
      updateWizardUI();
    }
  });
}

// =============================================================================
// DEV TOOLS
// =============================================================================

function handleClearData() {
  // Open the clear data modal (initialized by settings.js)
  const dialog = document.getElementById('clear-data-dialog');
  if (dialog) {
    dialog.showModal();
  }
}

// Expose for console access
window.clearAllData = clearAllData;
window.exportArchive = exportArchive;
window.getAllArchived = getAllArchived;
window.bulkUpdateStatus = bulkUpdateStatus;

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
