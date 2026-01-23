// =============================================================================
// SYNC SERVICE
// =============================================================================
// Google Drive sync using core modules from seneschal pattern.

import { createGoogleDriveProvider } from './core/google-drive.js';
import { createSyncEngine, SyncStatus } from './core/sync-engine.js';
import { hasOAuthCallback } from './core/oauth.js';
import { exportAllData, importData } from './db/export.js';
import { getPendingAttachments, markAttachmentSynced, getAllAttachments, upsertAttachmentFromSync } from './db/attachments.js';
import { getInventoryItem, getAllInventory, markInventorySynced } from './db/inventory.js';
import { getUnsyncedChatLogs, markChatLogSynced, importChatLog, getChatLog } from './db/chat-logs.js';
import { getAllVisits, markVisitsSynced } from './db/visits.js';
import { getAllTrips, markTripsSynced } from './db/trips.js';
import { getAllExpenses, markExpensesSynced } from './db/expenses.js';
import { markKnowledgeSynced } from './db/knowledge.js';
import { updateSyncStatus, showToast } from './ui.js';

// Configuration - will be loaded dynamically
let googleConfig = null;
let provider = null;
let syncEngine = null;
let syncTimeout = null;
let isSyncing = false;

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

    // Listen for background sync messages from service worker
    setupBackgroundSyncListener();

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
  if (isSyncing) {
    console.log('Sync already in progress, skipping');
    return { success: false, error: 'Sync already in progress' };
  }

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

  isSyncing = true;
  try {
    const result = await syncEngine.sync();

    if (result.success) {
      // Sync attachments and chat logs after data sync
      await syncAttachments();
      await syncChatLogs();
      // Clear unsynced flags after successful sync to prevent duplicate pushes
      await clearAllUnsyncedFlags();
      showToast('Sync complete');
    } else {
      showToast('Sync failed: ' + result.error);
    }

    return result;
  } finally {
    isSyncing = false;
  }
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
    if (isSyncing) {
      console.log('Sync already in progress, skipping queued sync');
      return;
    }

    isSyncing = true;
    try {
      const result = await syncEngine.sync();
      if (result.success) {
        await syncAttachments();
        await syncChatLogs();
        await clearAllUnsyncedFlags();
      }
    } catch (err) {
      console.error('Auto-sync failed:', err);
    } finally {
      isSyncing = false;
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

  if (isSyncing) {
    console.log('Sync already in progress, skipping sync on open');
    return;
  }

  isSyncing = true;
  try {
    const result = await syncEngine.sync();
    if (result.success) {
      await syncAttachments();
      await syncChatLogs();
      await clearAllUnsyncedFlags();
    }
  } catch (err) {
    console.error('Sync on open failed:', err);
  } finally {
    isSyncing = false;
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
// CHAT LOG SYNC
// =============================================================================

/**
 * Sync chat logs with Google Drive.
 * - Push unsynced local logs
 * - Pull remote logs not in local cache
 */
async function syncChatLogs() {
  if (!provider || !provider.isFolderConfigured()) {
    return;
  }

  try {
    // 1. Push unsynced local logs
    const unsyncedLogs = await getUnsyncedChatLogs();
    for (const log of unsyncedLogs) {
      try {
        // Download remote version first for merge
        const remote = await provider.downloadChatLog(log.date);

        if (remote) {
          // Merge: combine conversations by ID (remote wins for conflicts, consistent with main sync engine)
          const mergedConvs = new Map();
          for (const c of log.conversations || []) mergedConvs.set(c.id, c);  // local first
          for (const c of remote.conversations || []) mergedConvs.set(c.id, c);  // remote overwrites

          log.conversations = Array.from(mergedConvs.values())
            .sort((a, b) => (a.started || '').localeCompare(b.started || ''));
        }

        await provider.uploadChatLog(log.date, {
          date: log.date,
          conversations: log.conversations,
          updated_at: new Date().toISOString()
        });

        await markChatLogSynced(log.date);
      } catch (err) {
        console.error(`Failed to sync chat log ${log.date}:`, err);
      }
    }

    // 2. Pull recent remote logs (last 7 days)
    const remoteFiles = await provider.listChatLogFiles();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    for (const file of remoteFiles) {
      const dateStr = file.name.replace('.json', '');
      if (dateStr < cutoffStr) continue;

      const local = await getChatLog(dateStr);
      if (!local || new Date(file.modifiedTime) > new Date(local.synced_at || 0)) {
        try {
          const remoteData = await provider.downloadChatLog(dateStr);
          if (remoteData) {
            await importChatLog(dateStr, remoteData);
          }
        } catch (err) {
          console.error(`Failed to pull chat log ${dateStr}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('Chat log sync failed:', err);
  }
}

// =============================================================================
// INTERNAL
// =============================================================================

/**
 * Clear unsynced flags on all records after successful sync.
 * This ensures that items don't get pushed again in future syncs.
 */
async function clearAllUnsyncedFlags() {
  try {
    // Get all records and mark them as synced
    const [inventory, visits, trips, expenses] = await Promise.all([
      getAllInventory(),
      getAllVisits(),
      getAllTrips(),
      getAllExpenses()
    ]);

    // Mark all as synced in parallel
    await Promise.all([
      inventory.length > 0 ? markInventorySynced(inventory.map(i => i.id)) : Promise.resolve(),
      visits.length > 0 ? markVisitsSynced(visits.map(v => v.id)) : Promise.resolve(),
      trips.length > 0 ? markTripsSynced(trips.map(t => t.id)) : Promise.resolve(),
      expenses.length > 0 ? markExpensesSynced(expenses.map(e => e.id)) : Promise.resolve(),
      markKnowledgeSynced()
    ]);

    console.log('Cleared all unsynced flags after successful sync');
  } catch (err) {
    console.error('Failed to clear unsynced flags:', err);
    // Don't throw - this is a cleanup operation that shouldn't block the sync
  }
}

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
    archive: data.archive || [],
    trips: data.trips || [],
    expenses: data.expenses || [],
    knowledge: data.knowledge || null
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
// BACKGROUND SYNC
// =============================================================================

/**
 * Setup listener for background sync messages from service worker.
 */
function setupBackgroundSyncListener() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', async (event) => {
      if (event.data?.type === 'SYNC_REQUESTED') {
        console.log('Background sync triggered by service worker');
        try {
          if (syncEngine?.canSync()) {
            await syncEngine.sync();
            await syncAttachments();
            await syncChatLogs();
          }
        } catch (err) {
          console.error('Background sync failed:', err);
        }
      }
    });
  }
}

/**
 * Request background sync when coming back online.
 * Call this when data changes while offline.
 */
export async function requestBackgroundSync() {
  if ('serviceWorker' in navigator && 'sync' in window.SyncManager?.prototype) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration.sync) {
        await registration.sync.register('thrift-sync');
      }
    } catch (err) {
      // Background sync not supported or failed, fall back to immediate sync
      console.warn('Background sync registration failed:', err);
      if (navigator.onLine && syncEngine?.canSync()) {
        queueSync();
      }
    }
  } else if (navigator.onLine && syncEngine?.canSync()) {
    // No background sync support, do immediate sync
    queueSync();
  }
}

// =============================================================================
// EXPORTS FOR SETTINGS UI
// =============================================================================

export { provider, syncEngine };
