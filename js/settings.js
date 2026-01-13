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
  removeFolder,
  getLastSync,
  getSyncStatus,
  syncNow
} from './sync.js';
import { clearAllData, exportAllData, importData } from './db.js';
import { showToast } from './ui.js';
import { formatRelativeTime } from './utils.js';

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initSettings() {
  // Initialize sync module
  const syncEnabled = await initSync();

  // Bind event handlers
  bindSettingsEvents();

  // Update UI state
  updateSettingsUI();

  // If sync is enabled and configured, update status periodically
  if (syncEnabled) {
    setInterval(updateSettingsUI, 30000); // Every 30 seconds
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
  const setFolderBtn = document.getElementById('btn-set-folder');
  const pickFolderBtn = document.getElementById('btn-pick-folder');
  const removeFolderBtn = document.getElementById('btn-remove-folder');

  if (step2) {
    step2.classList.toggle('sync-step--disabled', !connected);
  }

  if (folderInput) {
    folderInput.disabled = !connected;
    if (folder) {
      folderInput.value = folder.name;
    }
  }

  if (setFolderBtn) setFolderBtn.disabled = !connected;
  if (pickFolderBtn) pickFolderBtn.disabled = !connected;
  if (removeFolderBtn) {
    removeFolderBtn.disabled = !connected || !folderConfigured;
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
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function bindSettingsEvents() {
  // Connect/Disconnect button
  document.getElementById('btn-connect')?.addEventListener('click', handleConnectClick);

  // Folder management
  document.getElementById('btn-set-folder')?.addEventListener('click', handleSetFolder);
  document.getElementById('btn-pick-folder')?.addEventListener('click', handlePickFolder);
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

async function handleSetFolder() {
  const input = document.getElementById('sync-folder-input');
  const folderName = input?.value.trim();

  if (!folderName) {
    showToast('Enter a folder name', 'error');
    return;
  }

  const btn = document.getElementById('btn-set-folder');
  if (btn) btn.disabled = true;

  try {
    await setFolder(folderName);
    updateSettingsUI();
  } finally {
    if (btn) btn.disabled = false;
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

async function handleExportData() {
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

async function handleImportData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';

  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!confirm(`Import ${data.inventory?.length || 0} items and ${data.visits?.length || 0} visits? This will replace existing data.`)) {
        return;
      }

      await importData(data, false);
      showToast('Data imported');

      // Reload the page to refresh all data
      window.location.reload();
    } catch (err) {
      console.error('Import failed:', err);
      showToast('Import failed: ' + err.message, 'error');
    }
  };

  input.click();
}

async function handleClearData() {
  if (!confirm('Clear ALL data? This cannot be undone.')) return;
  if (!confirm('Are you sure? All inventory, visits, and stores will be deleted.')) return;

  try {
    await clearAllData();
    showToast('All data cleared');

    // Reload the page
    window.location.reload();
  } catch (err) {
    console.error('Clear failed:', err);
    showToast('Clear failed', 'error');
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { updateSettingsUI };
