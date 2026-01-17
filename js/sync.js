// =============================================================================
// SYNC SERVICE
// =============================================================================
// Google Drive sync using core modules from seneschal pattern.

import { createGoogleDriveProvider } from './core/google-drive.js';
import { createSyncEngine, SyncStatus } from './core/sync-engine.js';
import { hasOAuthCallback } from './core/oauth.js';
import {
  exportAllData,
  importData,
  getPendingAttachments,
  markAttachmentSynced,
  getAllAttachments,
  upsertAttachmentFromSync,
  getInventoryItem
} from './db.js';
import { updateSyncStatus, showToast } from './ui.js';

// Configuration - will be loaded dynamically
let googleConfig = null;
let provider = null;
let syncEngine = null;
let syncTimeout = null;

const SYNC_DEBOUNCE_MS = 30000; // 30 seconds
const DOMAIN = 'thrifting';

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize sync with Google config.
 * Call this on app startup.
 */
export async function initSync() {
  try {
    // Try to load config
    const configModule = await import('./google-config.js').catch(() => null);
    if (!configModule?.googleConfig) {
      return false;
    }

    googleConfig = configModule.googleConfig;

    // Create provider
    provider = createGoogleDriveProvider({
      domain: DOMAIN,
      clientId: googleConfig.clientId,
      clientSecret: googleConfig.clientSecret,
      apiKey: googleConfig.apiKey,
      redirectUri: googleConfig.redirectUri || window.location.origin + '/'
    });

    // Create sync engine
    syncEngine = createSyncEngine({
      provider,
      domain: DOMAIN,
      getLocalData: exportAllData,
      setLocalData: importMergedData
    });

    // Subscribe to status changes
    syncEngine.onStatusChange((status, error) => {
      updateSyncStatus({
        syncInProgress: status === SyncStatus.SYNCING,
        error: error,
        lastSyncAt: syncEngine.getLastSync()
      });
    });

    // Handle OAuth callback if present
    if (hasOAuthCallback()) {
      await provider.handleAuthCallback();
      const email = await provider.getAccountEmail();
      showToast(email ? `Connected as ${email}` : 'Connected to Google Drive');
    }

    return true;
  } catch (err) {
    console.error('Failed to initialize sync:', err);
    return false;
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Check if sync is initialized
 */
export function isSyncEnabled() {
  return !!syncEngine;
}

/**
 * Check if connected to Google Drive
 */
export function isConnected() {
  return provider?.isConnected() || false;
}

/**
 * Get the connected Google account email
 */
export async function getAccountEmail() {
  return provider?.getAccountEmail() || null;
}

/**
 * Check if sync folder is configured
 */
export function isFolderConfigured() {
  return provider?.isFolderConfigured() || false;
}

/**
 * Start OAuth flow
 */
export async function connect() {
  if (!provider) {
    showToast('Sync not configured');
    return;
  }
  await provider.connect();
}

/**
 * Disconnect from Google Drive
 */
export function disconnect() {
  if (provider) {
    provider.disconnect();
    updateSyncStatus({ lastSyncAt: null, error: null });
    showToast('Disconnected from Google Drive');
  }
}

/**
 * Get current sync folder
 */
export function getFolder() {
  return provider?.getFolder() || null;
}

/**
 * Set sync folder by name (finds existing or creates new)
 * @param {string} folderName - Name of folder
 * @param {string} [parentId] - Parent folder ID (defaults to root)
 */
export async function setFolder(folderName, parentId) {
  if (!provider) return null;
  try {
    const folder = await provider.setFolderByName(folderName, parentId);
    showToast(`Sync folder set to "${folder.name}"`);
    return folder;
  } catch (err) {
    showToast('Failed to set folder: ' + err.message);
    return null;
  }
}

/**
 * Open folder picker
 */
export async function selectFolder() {
  if (!provider) return null;
  try {
    const folder = await provider.selectFolder();
    if (folder) {
      showToast(`Sync folder set to "${folder.name}"`);
    }
    return folder;
  } catch (err) {
    showToast('Failed to select folder: ' + err.message);
    return null;
  }
}

/**
 * Open folder picker to select a parent (doesn't set as sync folder)
 */
export async function pickParentFolder() {
  if (!provider) return null;
  try {
    return await provider.pickParentFolder();
  } catch (err) {
    showToast('Failed to pick folder: ' + err.message);
    return null;
  }
}

/**
 * Clear folder selection
 */
export function removeFolder() {
  if (provider) {
    provider.removeFolder();
  }
}

/**
 * Get last sync timestamp
 */
export function getLastSync() {
  return syncEngine?.getLastSync() || null;
}

/**
 * Get current sync status
 */
export function getSyncStatus() {
  if (!syncEngine) {
    return { status: 'disabled', error: null };
  }
  return {
    status: syncEngine.getStatus(),
    error: syncEngine.getError()
  };
}

/**
 * Perform sync now
 */
export async function syncNow() {
  if (!syncEngine) {
    showToast('Sync not configured');
    return { success: false, error: 'Sync not configured' };
  }

  if (!syncEngine.canSync()) {
    const error = !isConnected()
      ? 'Not connected to Google Drive'
      : 'No sync folder configured';
    showToast(error);
    return { success: false, error };
  }

  const result = await syncEngine.sync();

  if (result.success) {
    // Sync attachments after data sync
    await syncAttachments();
    showToast('Sync complete');
  } else {
    showToast('Sync failed: ' + result.error);
  }

  return result;
}

/**
 * Queue a debounced sync (called after data changes)
 */
export function queueSync() {
  if (!syncEngine || !syncEngine.canSync()) {
    return;
  }

  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      await syncEngine.sync();
      await syncAttachments();
    } catch (err) {
      console.error('Auto-sync failed:', err);
    }
  }, SYNC_DEBOUNCE_MS);
}

/**
 * Called on app open to sync if connected
 */
export async function syncOnOpen() {
  if (!syncEngine || !syncEngine.canSync()) {
    return;
  }

  try {
    await syncEngine.sync();
    await syncAttachments();
  } catch (err) {
    console.error('Sync on open failed:', err);
  }
}

// =============================================================================
// ATTACHMENT SYNC
// =============================================================================

/**
 * Sync attachments (photos) with Google Drive.
 * Stores in inventory/{item-id}/ folder structure.
 */
async function syncAttachments() {
  if (!provider || !provider.isFolderConfigured()) {
    return;
  }

  try {
    // Upload pending local attachments
    const pending = await getPendingAttachments();
    for (const att of pending) {
      try {
        // Get the item ID for folder organization
        const item = await getInventoryItem(att.itemId);
        const itemId = item?.id || null;

        const driveId = await provider.uploadAttachment(
          att.id,
          att.filename,
          att.blob,
          att.mimeType,
          itemId // Pass item ID for folder-based organization
        );
        await markAttachmentSynced(att.id, driveId);
      } catch (err) {
        console.error(`Failed to upload attachment ${att.id}:`, err);
      }
    }

    // Download missing remote attachments
    const remoteList = await provider.listAttachments();
    const allAttachments = await getAllAttachments();

    for (const remote of remoteList) {
      // Skip if we already have this Drive file
      if (allAttachments.some(a => a.driveFileId === remote.remoteId)) continue;

      try {
        const blob = await provider.downloadAttachment(remote.remoteId);
        const itemId = remote.itemId || remote.id.split('-')[0]; // Extract itemId from filename if not stored

        await upsertAttachmentFromSync(
          itemId,
          remote.filename,
          blob,
          remote.mimeType,
          remote.remoteId
        );
      } catch (err) {
        console.error(`Failed to download attachment ${remote.id}:`, err);
      }
    }
  } catch (err) {
    console.error('Attachment sync failed:', err);
  }
}

// =============================================================================
// INTERNAL
// =============================================================================

/**
 * Import merged data from sync engine
 */
async function importMergedData(data) {
  if (!data) return;

  await importData({
    version: data.version || 1,
    inventory: data.inventory || [],
    visits: data.visits || [],
    stores: data.stores || [],
    archive: data.archive || []
  }, false);
}

// =============================================================================
// BACKUP EXPORT/IMPORT
// =============================================================================

/**
 * Export data to Google Drive as a backup file.
 * Saves to backups/ folder.
 */
export async function exportToDrive() {
  if (!provider || !isConnected()) {
    throw new Error('Not connected to Google Drive');
  }

  if (!isFolderConfigured()) {
    throw new Error('No sync folder configured');
  }

  const data = await exportAllData();
  const filename = `thrifting-backup-${new Date().toISOString().split('T')[0]}.json`;

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  await provider.uploadBackup(filename, blob);
  return filename;
}

/**
 * List backup files in Google Drive backups/ folder
 */
export async function listDriveBackups() {
  if (!provider || !isConnected() || !isFolderConfigured()) {
    return [];
  }

  return provider.listBackups();
}

/**
 * List JSON files in root sync folder (for inventory/stores import)
 */
export async function listDriveFiles() {
  if (!provider || !isConnected() || !isFolderConfigured()) {
    return [];
  }

  return provider.listRootFiles();
}

/**
 * Import data from a Google Drive file
 */
export async function importFromDrive(fileId) {
  if (!provider || !isConnected()) {
    throw new Error('Not connected to Google Drive');
  }

  return provider.downloadFile(fileId);
}

// =============================================================================
// EXPORTS FOR SETTINGS UI
// =============================================================================

export { provider, syncEngine };
