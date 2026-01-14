// =============================================================================
// SETTINGS MODULE
// =============================================================================
// Settings tab controller for sync configuration and data management.

import {
  initSync,
  isSyncEnabled,
  isConnected,
  isFolderConfigured,
  connect,
  disconnect,
  getFolder,
  setFolder,
  selectFolder,
  pickParentFolder,
  removeFolder,
  getLastSync,
  getSyncStatus,
  syncNow,
  exportToDrive,
  listDriveBackups,
  importFromDrive
} from './sync.js';
import { clearAllData, exportAllData, importData } from './db.js';
import { showToast, createModalController } from './ui.js';
import { formatRelativeTime } from './utils.js';

// State for create folder flow
let selectedParentFolder = null;

// Modals
let clearDataModal = null;
let exportModal = null;
let importModal = null;
let importConfirmModal = null;

// Pending import data
let pendingImportData = null;

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initSettings() {
  // Initialize sync module
  const syncEnabled = await initSync();

  // Initialize modals
  initModals();

  // Bind event handlers
  bindSettingsEvents();

  // Update UI state
  updateSettingsUI();

  // If sync is enabled and configured, update status periodically
  if (syncEnabled) {
    setInterval(updateSettingsUI, 30000); // Every 30 seconds
  }
}

function initModals() {
  // Clear data modal
  const clearDataDialog = document.getElementById('clear-data-dialog');
  if (clearDataDialog) {
    clearDataModal = createModalController(clearDataDialog);
    document.getElementById('clear-data-cancel')?.addEventListener('click', () => clearDataModal.close());
    document.getElementById('clear-data-confirm')?.addEventListener('click', executeClearData);
  }

  // Export modal
  const exportDialog = document.getElementById('export-dialog');
  if (exportDialog) {
    exportModal = createModalController(exportDialog);
    document.getElementById('export-local')?.addEventListener('click', handleExportLocal);
    document.getElementById('export-drive')?.addEventListener('click', handleExportDrive);
  }

  // Import modal
  const importDialog = document.getElementById('import-dialog');
  if (importDialog) {
    importModal = createModalController(importDialog);
    document.getElementById('import-local')?.addEventListener('click', handleImportLocal);
    document.getElementById('import-drive')?.addEventListener('click', handleImportDrive);
  }

  // Import confirm modal
  const importConfirmDialog = document.getElementById('import-confirm-dialog');
  if (importConfirmDialog) {
    importConfirmModal = createModalController(importConfirmDialog);
    document.getElementById('import-confirm-cancel')?.addEventListener('click', () => {
      pendingImportData = null;
      importConfirmModal.close();
    });
    document.getElementById('import-confirm-ok')?.addEventListener('click', executeImport);
  }
}

// =============================================================================
// UI UPDATES
// =============================================================================

function updateSettingsUI() {
  const syncEnabled = isSyncEnabled();
  const connected = isConnected();
  const folderConfigured = isFolderConfigured();
  const folder = getFolder();
  const lastSync = getLastSync();

  // Step 1: Connection status
  const connectBtn = document.getElementById('btn-connect');
  const connectStatus = document.getElementById('sync-connect-status');
  const step1Status = document.getElementById('sync-step-1-status');

  if (connectBtn) {
    if (!syncEnabled) {
      connectBtn.textContent = 'Not configured';
      connectBtn.disabled = true;
    } else if (connected) {
      connectBtn.textContent = 'Disconnect';
      connectBtn.disabled = false;
    } else {
      connectBtn.textContent = 'Connect to Google Drive';
      connectBtn.disabled = false;
    }
  }

  if (connectStatus) {
    if (!syncEnabled) {
      connectStatus.textContent = 'Sync not configured. Copy google-config.example.js to google-config.js and add your credentials.';
      connectStatus.className = 'sync-step-status sync-step-status--warning';
    } else if (connected) {
      connectStatus.textContent = 'Connected to Google Drive';
      connectStatus.className = 'sync-step-status sync-step-status--success';
    } else {
      connectStatus.textContent = 'Not connected';
      connectStatus.className = 'sync-step-status sync-step-status--pending';
    }
  }

  if (step1Status) {
    step1Status.textContent = connected ? 'Complete' : (syncEnabled ? 'Pending' : 'Disabled');
  }

  // Step 2: Folder configuration
  const step2 = document.getElementById('sync-step-2');
  const folderInput = document.getElementById('sync-folder-input');
  const folderStatus = document.getElementById('sync-folder-status');
  const step2Status = document.getElementById('sync-step-2-status');
  const pickFolderBtn = document.getElementById('btn-pick-folder');
  const removeFolderBtn = document.getElementById('btn-remove-folder');
  const pickParentBtn = document.getElementById('btn-pick-parent');
  const createFolderBtn = document.getElementById('btn-create-folder');
  const parentFolderName = document.getElementById('sync-parent-folder-name');

  if (step2) {
    step2.classList.toggle('sync-step--disabled', !connected);
  }

  if (folderInput) {
    folderInput.disabled = !connected;
  }

  if (pickFolderBtn) pickFolderBtn.disabled = !connected;
  if (pickParentBtn) pickParentBtn.disabled = !connected;
  if (createFolderBtn) createFolderBtn.disabled = !connected;
  if (removeFolderBtn) {
    removeFolderBtn.disabled = !connected || !folderConfigured;
  }

  // Update parent folder display
  if (parentFolderName) {
    parentFolderName.textContent = selectedParentFolder ? selectedParentFolder.name : 'My Drive (root)';
  }

  if (folderStatus) {
    if (folder) {
      folderStatus.textContent = `Syncing to: ${folder.name}`;
      folderStatus.className = 'sync-step-status sync-step-status--success';
    } else {
      folderStatus.textContent = 'No folder selected';
      folderStatus.className = 'sync-step-status sync-step-status--pending';
    }
  }

  if (step2Status) {
    step2Status.textContent = folderConfigured ? 'Complete' : 'Pending';
  }

  // Step 3: Sync status
  const step3 = document.getElementById('sync-step-3');
  const syncNowBtn = document.getElementById('btn-sync-now');
  const lastSyncEl = document.getElementById('last-sync-time');
  const syncStatusEl = document.getElementById('sync-current-status');
  const step3Status = document.getElementById('sync-step-3-status');

  const canSync = connected && folderConfigured;

  if (step3) {
    step3.classList.toggle('sync-step--disabled', !canSync);
  }

  if (syncNowBtn) {
    const status = getSyncStatus();
    syncNowBtn.disabled = !canSync || status.status === 'syncing';
    syncNowBtn.textContent = status.status === 'syncing' ? 'Syncing...' : 'Sync Now';
  }

  if (lastSyncEl) {
    if (lastSync) {
      lastSyncEl.textContent = formatRelativeTime(new Date(lastSync));
    } else {
      lastSyncEl.textContent = 'Never';
    }
  }

  if (syncStatusEl) {
    const status = getSyncStatus();
    if (status.error) {
      syncStatusEl.textContent = `Error: ${status.error}`;
      syncStatusEl.className = 'sync-step-status sync-step-status--error';
    } else if (status.status === 'syncing') {
      syncStatusEl.textContent = 'Syncing...';
      syncStatusEl.className = 'sync-step-status sync-step-status--syncing';
    } else if (lastSync) {
      syncStatusEl.textContent = 'Ready';
      syncStatusEl.className = 'sync-step-status sync-step-status--success';
    } else {
      syncStatusEl.textContent = 'Ready to sync';
      syncStatusEl.className = 'sync-step-status sync-step-status--pending';
    }
  }

  if (step3Status) {
    step3Status.textContent = lastSync ? 'Active' : 'Ready';
  }

  // Update export/import Drive buttons
  const exportDriveBtn = document.getElementById('export-drive');
  const importDriveBtn = document.getElementById('import-drive');
  const exportDriveStatus = document.getElementById('export-drive-status');
  const importDriveStatus = document.getElementById('import-drive-status');

  if (exportDriveBtn) {
    exportDriveBtn.disabled = !canSync;
  }
  if (importDriveBtn) {
    importDriveBtn.disabled = !canSync;
  }
  if (exportDriveStatus) {
    exportDriveStatus.textContent = canSync ? `Save to ${folder?.name || 'Google Drive'}` : 'Connect Google Drive first';
  }
  if (importDriveStatus) {
    importDriveStatus.textContent = canSync ? `Import from ${folder?.name || 'Google Drive'}` : 'Connect Google Drive first';
  }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function bindSettingsEvents() {
  // Connect/Disconnect button
  document.getElementById('btn-connect')?.addEventListener('click', handleConnectClick);

  // Folder management
  document.getElementById('btn-pick-folder')?.addEventListener('click', handlePickFolder);
  document.getElementById('btn-pick-parent')?.addEventListener('click', handlePickParent);
  document.getElementById('btn-create-folder')?.addEventListener('click', handleCreateFolder);
  document.getElementById('btn-remove-folder')?.addEventListener('click', handleRemoveFolder);

  // Sync button
  document.getElementById('btn-sync-now')?.addEventListener('click', handleSyncNow);

  // Data management
  document.getElementById('btn-export-data')?.addEventListener('click', handleExportData);
  document.getElementById('btn-import-data')?.addEventListener('click', handleImportData);
  document.getElementById('btn-clear-data')?.addEventListener('click', handleClearData);
}

async function handleConnectClick() {
  if (isConnected()) {
    disconnect();
    updateSettingsUI();
  } else {
    await connect();
    // OAuth redirects, so we won't get here directly
  }
}

async function handlePickFolder() {
  const btn = document.getElementById('btn-pick-folder');
  if (btn) btn.disabled = true;

  try {
    await selectFolder();
    updateSettingsUI();
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handlePickParent() {
  const btn = document.getElementById('btn-pick-parent');
  if (btn) btn.disabled = true;

  try {
    const folder = await pickParentFolder();
    if (folder) {
      selectedParentFolder = folder;
      updateSettingsUI();
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleCreateFolder() {
  const input = document.getElementById('sync-folder-input');
  const folderName = input?.value.trim();

  if (!folderName) {
    showToast('Enter a folder name', 'error');
    return;
  }

  const btn = document.getElementById('btn-create-folder');
  if (btn) btn.disabled = true;

  try {
    const parentId = selectedParentFolder?.id || undefined;
    const folder = await setFolder(folderName, parentId);
    if (folder) {
      // Reset state
      selectedParentFolder = null;
      if (input) input.value = '';
      // Close the details
      const details = document.getElementById('sync-create-folder-details');
      if (details) details.open = false;
    }
    updateSettingsUI();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function handleRemoveFolder() {
  if (confirm('Remove sync folder? Data will remain on Google Drive.')) {
    removeFolder();
    updateSettingsUI();
    showToast('Sync folder removed');
  }
}

async function handleSyncNow() {
  const btn = document.getElementById('btn-sync-now');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Syncing...';
  }

  try {
    await syncNow();
    updateSettingsUI();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sync Now';
    }
  }
}

function handleExportData() {
  if (exportModal) {
    updateSettingsUI(); // Update Drive button state
    exportModal.open();
  }
}

function handleImportData() {
  if (importModal) {
    updateSettingsUI(); // Update Drive button state
    importModal.open();
  }
}

async function handleExportLocal() {
  if (exportModal) exportModal.close();

  try {
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `thrifting-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast('Data exported');
  } catch (err) {
    console.error('Export failed:', err);
    showToast('Export failed', 'error');
  }
}

async function handleExportDrive() {
  if (exportModal) exportModal.close();

  const btn = document.getElementById('export-drive');
  if (btn) {
    btn.disabled = true;
  }

  try {
    const filename = await exportToDrive();
    showToast(`Backup saved to Google Drive: ${filename}`);
  } catch (err) {
    console.error('Export to Drive failed:', err);
    showToast('Export to Drive failed: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function handleImportLocal() {
  if (importModal) importModal.close();

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.multiple = true; // Allow selecting multiple files

  input.onchange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    try {
      // Parse all selected files
      const parsedFiles = await Promise.all(
        files.map(async (file) => {
          const text = await file.text();
          return { name: file.name, data: JSON.parse(text) };
        })
      );

      // Normalize and merge all files into one import
      const normalized = normalizeImportData(parsedFiles);
      showImportConfirm(normalized);
    } catch (err) {
      console.error('Import failed:', err);
      showToast('Import failed: ' + err.message, 'error');
    }
  };

  input.click();
}

/**
 * Normalize various JSON formats into standard import format.
 * Supports:
 * - inventory.json: { meta: {...}, items: [...] }
 * - stores.json: { stores: [...] }
 * - Standard backup: { version, inventory, stores }
 *
 * Note: Visits are not imported - they are derived from inventory data.
 */
function normalizeImportData(parsedFiles) {
  const result = {
    version: 1,
    inventory: [],
    stores: []
  };

  for (const { name, data } of parsedFiles) {
    // Detect format and extract data

    // inventory.json format: { meta: {...}, items: [...] }
    if (data.items && Array.isArray(data.items)) {
      result.inventory.push(...data.items);
      continue;
    }

    // stores.json format: { stores: [...] }
    if (data.stores && Array.isArray(data.stores) && !data.inventory) {
      result.stores.push(...data.stores);
      continue;
    }

    // Standard backup format: { version, inventory, stores }
    if (data.version !== undefined || data.inventory) {
      if (data.inventory) result.inventory.push(...data.inventory);
      if (data.stores) result.stores.push(...data.stores);
      // Visits intentionally ignored - derived from inventory
      continue;
    }

    // Unknown format - try to detect if it's an array of items or stores
    if (Array.isArray(data)) {
      // Check first item to guess type
      const sample = data[0];
      if (sample) {
        if (sample.title || sample.brand || sample.purchase_price !== undefined) {
          // Looks like inventory items
          result.inventory.push(...data);
        } else if (sample.tier || sample.address || sample.chain) {
          // Looks like stores
          result.stores.push(...data);
        }
      }
      continue;
    }

    console.warn(`Unknown format in ${name}, skipping`);
  }

  return result;
}

async function handleImportDrive() {
  if (importModal) importModal.close();

  try {
    const backups = await listDriveBackups();

    if (backups.length === 0) {
      showToast('No backups found in Google Drive', 'error');
      return;
    }

    // For now, use the most recent backup
    // TODO: Could add a picker to select from multiple backups
    const latestBackup = backups[0];

    const data = await importFromDrive(latestBackup.id);
    showImportConfirm(data, latestBackup.name);
  } catch (err) {
    console.error('Import from Drive failed:', err);
    showToast('Import from Drive failed: ' + err.message, 'error');
  }
}

function showImportConfirm(data, sourceName = 'local file') {
  pendingImportData = data;

  const summaryEl = document.getElementById('import-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <li><strong>${data.inventory?.length || 0}</strong> inventory items</li>
      <li><strong>${data.stores?.length || 0}</strong> stores</li>
    `;
  }

  if (importConfirmModal) {
    importConfirmModal.open();
  }
}

async function executeImport() {
  if (!pendingImportData) return;

  const confirmBtn = document.getElementById('import-confirm-ok');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Importing...';
  }

  try {
    await importData(pendingImportData, false);
    showToast('Data imported');
    window.location.reload();
  } catch (err) {
    console.error('Import failed:', err);
    showToast('Import failed: ' + err.message, 'error');
    if (importConfirmModal) importConfirmModal.close();
  } finally {
    pendingImportData = null;
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Import';
    }
  }
}

function handleClearData() {
  if (clearDataModal) {
    clearDataModal.open();
  }
}

async function executeClearData() {
  const confirmBtn = document.getElementById('clear-data-confirm');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';
  }

  try {
    await clearAllData();
    showToast('All data cleared');

    // Reload the page
    window.location.reload();
  } catch (err) {
    console.error('Clear failed:', err);
    showToast('Clear failed', 'error');
    if (clearDataModal) clearDataModal.close();
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete everything';
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { updateSettingsUI };
