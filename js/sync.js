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
  createAttachment,
  getAttachment
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
      console.log('Sync disabled: google-config.js not found');
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
      showToast('Connected to Google Drive', 'success');
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
    showToast('Sync not configured', 'error');
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
 * Set sync folder by name
 */
export async function setFolder(folderName) {
  if (!provider) return null;
  try {
    const folder = await provider.setFolderByName(folderName);
    showToast(`Sync folder set to "${folder.name}"`);
    return folder;
  } catch (err) {
    showToast('Failed to set folder: ' + err.message, 'error');
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
    showToast('Failed to select folder: ' + err.message, 'error');
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
    showToast('Sync not configured', 'error');
    return { success: false, error: 'Sync not configured' };
  }

  if (!syncEngine.canSync()) {
    const error = !isConnected()
      ? 'Not connected to Google Drive'
      : 'No sync folder configured';
    showToast(error, 'error');
    return { success: false, error };
  }

  const result = await syncEngine.sync();

  if (result.success) {
    // Sync attachments after data sync
    await syncAttachments();
    showToast('Sync complete');
  } else {
    showToast('Sync failed: ' + result.error, 'error');
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
 * Sync attachments (photos) with Google Drive
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
        const driveId = await provider.uploadAttachment(
          att.id,
          att.filename,
          att.blob,
          att.mimeType
        );
        await markAttachmentSynced(att.id, driveId);
      } catch (err) {
        console.error(`Failed to upload attachment ${att.id}:`, err);
      }
    }

    // Download missing remote attachments
    const remoteList = await provider.listAttachments();
    for (const remote of remoteList) {
      const existing = await getAttachment(remote.id);
      if (!existing) {
        try {
          const blob = await provider.downloadAttachment(remote.remoteId);
          await createAttachment(
            remote.itemId || remote.id.split('-')[0], // Extract itemId from filename if not stored
            remote.filename,
            blob,
            remote.mimeType
          );
        } catch (err) {
          console.error(`Failed to download attachment ${remote.id}:`, err);
        }
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
    stores: data.stores || []
  }, false);
}

// =============================================================================
// EXPORTS FOR SETTINGS UI
// =============================================================================

export { provider, syncEngine };
