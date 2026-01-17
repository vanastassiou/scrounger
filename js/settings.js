// =============================================================================
// SETTINGS MODULE
// =============================================================================
// Settings tab controller for sync configuration and data management.

import {
  initSync,
  isSyncEnabled,
  isConnected,
  getAccountEmail,
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
  listDriveFiles,
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
let createFolderModal = null;
let drivePickerModal = null;

// Pending import data
let pendingImportData = null;
let importMode = 'restore'; // 'restore' (replace all) or 'merge' (add to existing)

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

  // Create folder modal
  const createFolderDialog = document.getElementById('create-folder-dialog');
  if (createFolderDialog) {
    createFolderModal = createModalController(createFolderDialog);
    document.getElementById('create-folder-cancel')?.addEventListener('click', () => {
      createFolderModal.close();
    });
    document.getElementById('btn-pick-parent')?.addEventListener('click', handlePickParent);
    document.getElementById('btn-create-folder')?.addEventListener('click', handleCreateFolder);
  }

  // Drive file picker modal
  const drivePickerDialog = document.getElementById('drive-file-picker-dialog');
  if (drivePickerDialog) {
    drivePickerModal = createModalController(drivePickerDialog);
    document.getElementById('drive-picker-cancel')?.addEventListener('click', () => {
      drivePickerModal.close();
    });
  }
}

// =============================================================================
// UI UPDATES
// =============================================================================

async function updateSettingsUI() {
  const syncEnabled = isSyncEnabled();
  const connected = isConnected();
  const folderConfigured = isFolderConfigured();
  const folder = getFolder();
  const lastSync = getLastSync();
  const canSync = connected && folderConfigured;

  // Row 1: Account
  const accountValue = document.getElementById('sync-account-value');
  const connectBtn = document.getElementById('btn-connect');

  if (accountValue) {
    if (!syncEnabled) {
      accountValue.textContent = 'not configured';
    } else if (connected) {
      const email = await getAccountEmail();
      accountValue.textContent = email || '(signed in)';
    } else {
      accountValue.textContent = 'none';
    }
  }

  if (connectBtn) {
    if (!syncEnabled) {
      connectBtn.textContent = 'Configure';
      connectBtn.disabled = true;
    } else if (connected) {
      connectBtn.textContent = 'Disconnect';
      connectBtn.disabled = false;
    } else {
      connectBtn.textContent = 'Connect';
      connectBtn.disabled = false;
    }
  }

  // Row 2: Folder
  const folderRow = document.getElementById('sync-row-folder');
  const folderValue = document.getElementById('sync-folder-value');
  const folderMenuBtn = document.getElementById('btn-folder-menu');
  const removeFolderBtn = document.getElementById('btn-remove-folder');
  const parentFolderName = document.getElementById('sync-parent-folder-name');

  if (folderRow) {
    folderRow.classList.toggle('sync-row--disabled', !connected);
  }

  if (folderValue) {
    folderValue.textContent = folder ? folder.name : 'none';
  }

  if (folderMenuBtn) {
    folderMenuBtn.textContent = folder ? 'Change' : 'Select folder';
  }

  if (removeFolderBtn) {
    removeFolderBtn.disabled = !folderConfigured;
  }

  // Update parent folder display in create folder modal
  if (parentFolderName) {
    parentFolderName.textContent = selectedParentFolder ? selectedParentFolder.name : 'My Drive (root)';
  }

  // Row 3: Sync
  const syncRow = document.getElementById('sync-row-sync');
  const lastValue = document.getElementById('sync-last-value');
  const syncNowBtn = document.getElementById('btn-sync-now');

  if (syncRow) {
    syncRow.classList.toggle('sync-row--disabled', !canSync);
  }

  if (lastValue) {
    lastValue.textContent = lastSync ? formatRelativeTime(new Date(lastSync)) : 'Never';
  }

  if (syncNowBtn) {
    const status = getSyncStatus();
    syncNowBtn.disabled = !canSync || status.status === 'syncing';
    syncNowBtn.textContent = status.status === 'syncing' ? 'Syncing...' : 'Sync now';
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

  // Folder dropdown menu
  document.getElementById('btn-folder-menu')?.addEventListener('click', handleFolderMenuToggle);
  document.getElementById('btn-pick-folder')?.addEventListener('click', handlePickFolder);
  document.getElementById('btn-create-folder-open')?.addEventListener('click', handleCreateFolderOpen);
  document.getElementById('btn-remove-folder')?.addEventListener('click', handleRemoveFolder);

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('folder-dropdown-menu');
    const menuBtn = document.getElementById('btn-folder-menu');
    if (dropdown && !dropdown.hidden && !dropdown.contains(e.target) && e.target !== menuBtn) {
      dropdown.hidden = true;
    }
  });

  // Sync button
  document.getElementById('btn-sync-now')?.addEventListener('click', handleSyncNow);

  // Data management
  document.getElementById('btn-export-data')?.addEventListener('click', handleExportData);
  document.getElementById('btn-restore-backup')?.addEventListener('click', () => openImportModal('restore'));
  document.getElementById('btn-import-merge')?.addEventListener('click', () => openImportModal('merge'));
  document.getElementById('btn-clear-data')?.addEventListener('click', handleClearData);
}

function handleFolderMenuToggle() {
  const dropdown = document.getElementById('folder-dropdown-menu');
  if (dropdown) {
    dropdown.hidden = !dropdown.hidden;
  }
}

function handleCreateFolderOpen() {
  // Close dropdown
  const dropdown = document.getElementById('folder-dropdown-menu');
  if (dropdown) dropdown.hidden = true;

  // Reset state
  selectedParentFolder = null;
  const input = document.getElementById('create-folder-name');
  if (input) input.value = '';
  updateSettingsUI();

  // Open modal
  if (createFolderModal) {
    createFolderModal.open();
  }
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
  // Close dropdown
  const dropdown = document.getElementById('folder-dropdown-menu');
  if (dropdown) dropdown.hidden = true;

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
  const input = document.getElementById('create-folder-name');
  const folderName = input?.value.trim();

  if (!folderName) {
    showToast('Enter a folder name');
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
      // Close the modal
      if (createFolderModal) createFolderModal.close();
    }
    updateSettingsUI();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function handleRemoveFolder() {
  // Close dropdown
  const dropdown = document.getElementById('folder-dropdown-menu');
  if (dropdown) dropdown.hidden = true;

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
  } finally {
    updateSettingsUI();
  }
}

function handleExportData() {
  if (exportModal) {
    updateSettingsUI(); // Update Drive button state
    exportModal.open();
  }
}

function openImportModal(mode) {
  importMode = mode;

  // Update modal text based on mode
  const titleEl = document.getElementById('import-dialog-title');
  const descEl = document.getElementById('import-dialog-description');
  const localTitleEl = document.getElementById('import-local-title');
  const localDescEl = document.getElementById('import-local-description');
  const driveTitleEl = document.getElementById('import-drive-title');

  if (mode === 'restore') {
    if (titleEl) titleEl.textContent = 'Restore from backup';
    if (descEl) descEl.textContent = 'Choose a backup source:';
    if (localTitleEl) localTitleEl.textContent = 'Select backup file';
    if (localDescEl) localDescEl.textContent = 'Choose a JSON backup file from your computer';
    if (driveTitleEl) driveTitleEl.textContent = 'Google Drive backup';
  } else {
    if (titleEl) titleEl.textContent = 'Import & merge';
    if (descEl) descEl.textContent = 'Choose files to merge with your existing data:';
    if (localTitleEl) localTitleEl.textContent = 'Select files';
    if (localDescEl) localDescEl.textContent = 'Import inventory.json, stores.json, or backup files';
    if (driveTitleEl) driveTitleEl.textContent = 'Import from Google Drive';
  }

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
    showToast('Export failed');
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
    showToast('Export to Drive failed: ' + err.message);
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
      showToast('Import failed: ' + err.message);
    }
  };

  input.click();
}

/**
 * Validate if data matches a known backup/import schema.
 * @param {object} data - Parsed JSON data
 * @param {string} mode - 'restore' (backup only) or 'merge' (all formats)
 * @returns {boolean} True if the data is valid for the given mode
 */
function isValidImportSchema(data, mode) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Standard backup format: { version, inventory, stores }
  // Valid for both restore and merge
  if (data.version !== undefined && data.inventory) {
    return Array.isArray(data.inventory);
  }

  // For restore mode, only standard backups are valid
  if (mode === 'restore') {
    return false;
  }

  // Below formats are only valid for merge mode

  // inventory.json format: { meta: {...}, items: [...] }
  if (data.items && Array.isArray(data.items)) {
    return true;
  }

  // stores.json format: { stores: [...] } without inventory
  if (data.stores && Array.isArray(data.stores) && !data.inventory) {
    return true;
  }

  // Raw array format - check if looks like inventory or stores
  if (Array.isArray(data) && data.length > 0) {
    const sample = data[0];
    if (sample && typeof sample === 'object') {
      // Looks like inventory items (title deprecated, check other fields)
      if (sample.brand || sample.category || sample.purchase_price !== undefined) {
        return true;
      }
      // Looks like stores
      if (sample.tier || sample.address || sample.chain) {
        return true;
      }
    }
  }

  return false;
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
        if (sample.brand || sample.category || sample.purchase_price !== undefined) {
          // Looks like inventory items (title deprecated)
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

  // Update picker title based on mode
  const titleEl = document.getElementById('drive-picker-title');
  const descEl = document.getElementById('drive-picker-description');

  if (importMode === 'restore') {
    if (titleEl) titleEl.textContent = 'Select backup to restore';
    if (descEl) descEl.textContent = 'Choose a backup file from Google Drive:';
  } else {
    if (titleEl) titleEl.textContent = 'Select file to import';
    if (descEl) descEl.textContent = 'Choose a file to import from Google Drive:';
  }

  // Show loading state
  const loadingEl = document.getElementById('drive-picker-loading');
  const listEl = document.getElementById('drive-picker-list');
  const emptyEl = document.getElementById('drive-picker-empty');

  if (loadingEl) loadingEl.style.display = 'block';
  if (listEl) {
    listEl.style.display = 'none';
    listEl.innerHTML = '';
  }
  if (emptyEl) emptyEl.style.display = 'none';

  if (drivePickerModal) drivePickerModal.open();

  try {
    // Fetch both backups and root files
    const [backups, rootFiles] = await Promise.all([
      listDriveBackups(),
      listDriveFiles()
    ]);

    // Combine and categorize files
    const allFiles = [
      ...backups.map(f => ({ ...f, category: 'backup' })),
      ...rootFiles.map(f => ({ ...f, category: 'root' }))
    ];

    if (allFiles.length === 0) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    // Download and validate each file's content
    const validationResults = await Promise.all(
      allFiles.map(async (file) => {
        try {
          const data = await importFromDrive(file.id);
          return { file, valid: isValidImportSchema(data, importMode) };
        } catch {
          return { file, valid: false };
        }
      })
    );

    // Filter to only valid files
    const validFiles = validationResults
      .filter(r => r.valid)
      .map(r => r.file);

    if (loadingEl) loadingEl.style.display = 'none';

    if (validFiles.length === 0) {
      if (emptyEl) {
        emptyEl.textContent = importMode === 'restore'
          ? 'No backup files found.'
          : 'No valid files found.';
        emptyEl.style.display = 'block';
      }
      return;
    }

    // Render file list
    if (listEl) {
      listEl.innerHTML = validFiles.map(file => {
        const icon = file.category === 'backup' ? '💾' : '📄';
        const date = file.createdTime ? new Date(file.createdTime).toLocaleDateString() : '';
        const size = file.size ? formatFileSize(parseInt(file.size, 10)) : '';
        const meta = [date, size].filter(Boolean).join(' · ');

        return `
          <li class="file-list-item" data-file-id="${file.id}" data-file-name="${file.name}">
            <span class="file-list-item__icon">${icon}</span>
            <div class="file-list-item__info">
              <div class="file-list-item__name">${file.name}</div>
              <div class="file-list-item__meta">${meta}</div>
            </div>
          </li>
        `;
      }).join('');

      // Add click handlers
      listEl.querySelectorAll('.file-list-item').forEach(item => {
        item.addEventListener('click', () => handleDriveFileSelect(item.dataset.fileId, item.dataset.fileName));
      });

      listEl.style.display = 'block';
    }
  } catch (err) {
    console.error('Failed to list Drive files:', err);
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyEl) {
      emptyEl.textContent = 'Failed to load files from Google Drive.';
      emptyEl.style.display = 'block';
    }
  }
}

async function handleDriveFileSelect(fileId, fileName) {
  if (drivePickerModal) drivePickerModal.close();

  try {
    const data = await importFromDrive(fileId);
    const normalized = normalizeImportData([{ name: fileName, data }]);
    showImportConfirm(normalized, fileName);
  } catch (err) {
    console.error('Import from Drive failed:', err);
    showToast('Import from Drive failed: ' + err.message);
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function showImportConfirm(data, sourceName = 'local file') {
  pendingImportData = data;

  // Update confirm dialog text based on mode
  const titleEl = document.getElementById('import-confirm-title');
  const introEl = document.getElementById('import-confirm-intro');
  const warningEl = document.getElementById('import-confirm-warning');
  const confirmBtn = document.getElementById('import-confirm-ok');

  if (importMode === 'restore') {
    if (titleEl) titleEl.textContent = 'Confirm restore';
    if (introEl) introEl.textContent = 'This will restore:';
    if (warningEl) {
      warningEl.innerHTML = '<strong>This will replace all your existing data.</strong>';
      warningEl.className = 'text-danger';
    }
    if (confirmBtn) confirmBtn.textContent = 'Restore';
  } else {
    if (titleEl) titleEl.textContent = 'Confirm import';
    if (introEl) introEl.textContent = 'This will add to your existing data:';
    if (warningEl) {
      warningEl.innerHTML = '<strong>Duplicate items will be overwritten.</strong>';
      warningEl.className = 'text-muted';
    }
    if (confirmBtn) confirmBtn.textContent = 'Import';
  }

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

  const merge = importMode === 'merge';
  const actionText = merge ? 'Importing' : 'Restoring';
  const buttonText = merge ? 'Import' : 'Restore';

  const confirmBtn = document.getElementById('import-confirm-ok');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = `${actionText}...`;
  }

  try {
    await importData(pendingImportData, merge);
    showToast(merge ? 'Data merged' : 'Data restored');
    window.location.reload();
  } catch (err) {
    console.error('Import failed:', err);
    showToast(`${buttonText} failed: ${err.message}`);
    if (importConfirmModal) importConfirmModal.close();
  } finally {
    pendingImportData = null;
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = buttonText;
    }
  }
}

function handleClearData() {
  if (clearDataModal) {
    // Update UI based on Drive connection state
    const driveSection = document.getElementById('clear-data-drive-section');
    const noDriveMsg = document.getElementById('clear-data-no-drive');
    const checkbox = document.getElementById('clear-data-disconnect');

    const connected = isConnected();
    if (driveSection) driveSection.hidden = !connected;
    if (noDriveMsg) noDriveMsg.hidden = connected;
    if (checkbox) checkbox.checked = true;

    clearDataModal.open();
  }
}

async function executeClearData() {
  const confirmBtn = document.getElementById('clear-data-confirm');
  const checkbox = document.getElementById('clear-data-disconnect');

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';
  }

  try {
    const shouldDisconnect = checkbox?.checked && isConnected();

    await clearAllData();

    if (shouldDisconnect) {
      disconnect();
    }

    showToast('All data cleared');

    // Reload the page
    window.location.reload();
  } catch (err) {
    console.error('Clear failed:', err);
    showToast('Clear failed');
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
