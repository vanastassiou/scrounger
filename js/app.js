// =============================================================================
// MAIN APPLICATION
// =============================================================================

import { createTabController, createModalController, showToast } from './ui.js';
import { initInventory, renderInventoryStats, openAddItemModal, createInventoryRow } from './inventory.js';
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
  getAccountEmail,
  getFolder,
  connect,
  disconnect,
  selectFolder,
  syncOnOpen
} from './sync.js';
import { getItemsNotInPipeline } from './db.js';

// =============================================================================
// INITIALIZATION
// =============================================================================

async function init() {
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

  // Item picker modal event handlers
  initSelectItemDialog();

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

  // Elements
  const stepAccount = document.getElementById('setup-step-account');
  const stepFolder = document.getElementById('setup-step-folder');
  const connectBtn = document.getElementById('setup-connect-btn');
  const folderBtn = document.getElementById('setup-folder-btn');
  const doneBtn = document.getElementById('setup-done-btn');
  const accountEmail = document.getElementById('setup-account-email');
  const accountChangeBtn = document.getElementById('setup-account-change');
  const folderName = document.getElementById('setup-folder-name');
  const folderChangeBtn = document.getElementById('setup-folder-change');
  const folderHint = document.getElementById('setup-folder-hint');

  async function updateWizardUI() {
    const syncEnabled = isSyncEnabled();
    const connected = isConnected();
    const folderConfigured = isFolderConfigured();

    // Step 1: Account
    if (!syncEnabled) {
      stepAccount.dataset.state = 'pending';
      connectBtn.textContent = 'Sync not available';
      connectBtn.disabled = true;
    } else if (connected) {
      stepAccount.dataset.state = 'complete';
      const email = await getAccountEmail();
      accountEmail.textContent = email || 'Connected';
    } else {
      stepAccount.dataset.state = 'active';
      connectBtn.textContent = 'Connect Google Drive';
      connectBtn.disabled = false;
    }

    // Step 2: Folder
    if (!connected) {
      stepFolder.dataset.state = 'pending';
      folderHint.textContent = syncEnabled ? 'Connect your account first' : 'Sync not available';
      folderBtn.disabled = true;
    } else if (folderConfigured) {
      stepFolder.dataset.state = 'complete';
      const folder = getFolder();
      folderName.textContent = folder?.name || 'Selected';
    } else {
      stepFolder.dataset.state = 'active';
      folderBtn.textContent = 'Select Folder';
      folderBtn.disabled = false;
    }

    // Done button - enabled if sync complete OR sync not available
    doneBtn.disabled = syncEnabled && (!connected || !folderConfigured);
  }

  // Initial UI state
  await updateWizardUI();

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

    // Account change button - disconnect and reset
    accountChangeBtn.addEventListener('click', () => {
      disconnect();
      updateWizardUI();
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
        await updateWizardUI();
      } catch (err) {
        dialog.showModal();
        showToast('Failed to select folder: ' + err.message);
        folderBtn.disabled = false;
        folderBtn.textContent = 'Select Folder';
      }
    });

    // Folder change button - open picker to select new folder
    folderChangeBtn.addEventListener('click', async () => {
      dialog.close();
      try {
        await selectFolder();
        dialog.showModal();
        await updateWizardUI();
      } catch (err) {
        dialog.showModal();
        showToast('Failed to select folder: ' + err.message);
      }
    });

    // Done button
    doneBtn.addEventListener('click', () => {
      dialog.close();
      resolve();
    });

    // Check if we just returned from OAuth
    if (isConnected()) {
      updateWizardUI(); // fire-and-forget, UI will update
    }
  });
}

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

  const tbody = document.getElementById('item-picker-tbody');
  if (tbody) {
    tbody.addEventListener('click', async (e) => {
      const row = e.target.closest('tr[data-id]');
      if (row) {
        const itemId = row.dataset.id;
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
  const tbody = document.getElementById('item-picker-tbody');
  if (!tbody) return;

  let filtered = selectItemData;

  if (searchTerm) {
    filtered = selectItemData.filter(item => {
      const title = (item.title || '').toLowerCase();
      const brand = (item.brand || '').toLowerCase();
      return title.includes(searchTerm) || brand.includes(searchTerm);
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td class="empty-state"><p class="text-muted">No items available to list</p></td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(item => createInventoryRow(item, { showActions: false })).join('');
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
