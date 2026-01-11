// =============================================================================
// SYNC SERVICE
// =============================================================================
// Google Drive sync for backup/restore.
// Sync pattern:
// 1. On app open: Pull latest JSON from Drive, merge with local
// 2. On local change: Mark dirty, queue background sync
// 3. Background sync: Push local state to Drive, clear dirty flag

import { state } from './state.js';
import { SYNC_FILE_NAME, DRIVE_FOLDER_NAME } from './config.js';
import {
  getAllInventory,
  getAllVisits,
  getDirtyInventory,
  getDirtyVisits,
  markInventorySynced,
  markVisitsSynced,
  importData
} from './db.js';
import { updateSyncStatus } from './ui.js';
import { nowISO } from './utils.js';

let fileId = null;
let syncInProgress = false;
let syncQueued = false;

// =============================================================================
// PUBLIC API
// =============================================================================

export function isAuthenticated() {
  return !!state.accessToken;
}

export function setAccessToken(token) {
  state.accessToken = token;
}

export function markDirty() {
  state.syncState = { isDirty: true };
  updateSyncStatus(state.syncState);
  queueSync();
}

/**
 * Called on app open to pull latest from Drive.
 */
export async function syncOnOpen() {
  if (!isAuthenticated()) return;

  try {
    updateState({ syncInProgress: true, error: null });
    syncInProgress = true;

    await ensureSyncFile();

    const remoteData = await pullFromDrive();
    if (remoteData) {
      await mergeRemoteData(remoteData);
    }

    await pushToDrive();

    updateState({
      lastSyncAt: nowISO(),
      isDirty: false,
      syncInProgress: false
    });
  } catch (err) {
    updateState({ syncInProgress: false, error: err.message });
    console.error('Sync on open failed:', err);
  } finally {
    syncInProgress = false;
  }
}

// =============================================================================
// INTERNAL
// =============================================================================

function updateState(updates) {
  state.syncState = updates;
  updateSyncStatus(state.syncState);
}

function queueSync() {
  if (!isAuthenticated()) return;

  if (syncInProgress) {
    syncQueued = true;
    return;
  }

  setTimeout(() => performSync(), 2000);
}

async function performSync() {
  if (!isAuthenticated()) return;

  try {
    updateState({ syncInProgress: true, error: null });
    syncInProgress = true;

    await ensureSyncFile();
    await pushToDrive();

    updateState({
      lastSyncAt: nowISO(),
      isDirty: false,
      syncInProgress: false
    });

    if (syncQueued) {
      syncQueued = false;
      queueSync();
    }
  } catch (err) {
    updateState({ syncInProgress: false, error: err.message });
    console.error('Background sync failed:', err);
  } finally {
    syncInProgress = false;
  }
}

async function ensureSyncFile() {
  if (fileId) return;

  const folderId = await findOrCreateFolder(DRIVE_FOLDER_NAME);

  const query = `name='${SYNC_FILE_NAME}' and '${folderId}' in parents and trashed=false`;
  const response = await driveRequest(
    `files?q=${encodeURIComponent(query)}&fields=files(id,name)`
  );
  const data = await response.json();

  if (data.files && data.files.length > 0) {
    fileId = data.files[0].id;
    return;
  }

  // Create new file
  const metadata = {
    name: SYNC_FILE_NAME,
    mimeType: 'application/json',
    parents: [folderId]
  };

  const initialData = {
    version: 1,
    exported_at: nowISO(),
    inventory: [],
    visits: []
  };

  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  formData.append(
    'file',
    new Blob([JSON.stringify(initialData)], { type: 'application/json' })
  );

  const createResponse = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${state.accessToken}` },
      body: formData
    }
  );

  if (!createResponse.ok) {
    throw new Error(`Failed to create sync file: ${createResponse.status}`);
  }

  const createData = await createResponse.json();
  fileId = createData.id;
}

async function findOrCreateFolder(name) {
  const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const response = await driveRequest(
    `files?q=${encodeURIComponent(query)}&fields=files(id,name)`
  );
  const data = await response.json();

  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  const createResponse = await driveRequest('files', {
    method: 'POST',
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  const createData = await createResponse.json();
  return createData.id;
}

async function pullFromDrive() {
  if (!fileId) return null;

  const response = await driveRequest(`files/${fileId}?alt=media`);
  if (!response.ok) {
    if (response.status === 404) {
      fileId = null;
      return null;
    }
    throw new Error(`Failed to pull from Drive: ${response.status}`);
  }

  return response.json();
}

async function mergeRemoteData(remote) {
  const dirtyInventory = await getDirtyInventory();
  const dirtyVisits = await getDirtyVisits();

  const dirtyInventoryIds = new Set(dirtyInventory.map(i => i.id));
  const dirtyVisitIds = new Set(dirtyVisits.map(v => v.id));

  // Merge: keep local dirty items, take remote for non-dirty
  const localInventory = await getAllInventory();
  const localInventoryMap = new Map(localInventory.map(i => [i.id, i]));

  const mergedInventory = [];

  for (const remoteItem of remote.inventory || []) {
    if (dirtyInventoryIds.has(remoteItem.id)) {
      mergedInventory.push(localInventoryMap.get(remoteItem.id));
    } else {
      mergedInventory.push({ ...remoteItem, dirty: false });
    }
  }

  for (const localItem of dirtyInventory) {
    if (!remote.inventory?.some(r => r.id === localItem.id)) {
      mergedInventory.push(localItem);
    }
  }

  // Same for visits
  const localVisits = await getAllVisits();
  const localVisitsMap = new Map(localVisits.map(v => [v.id, v]));

  const mergedVisits = [];

  for (const remoteVisit of remote.visits || []) {
    if (dirtyVisitIds.has(remoteVisit.id)) {
      mergedVisits.push(localVisitsMap.get(remoteVisit.id));
    } else {
      mergedVisits.push({ ...remoteVisit, dirty: false });
    }
  }

  for (const localVisit of dirtyVisits) {
    if (!remote.visits?.some(r => r.id === localVisit.id)) {
      mergedVisits.push(localVisit);
    }
  }

  // Import merged data
  await importData({
    version: 1,
    inventory: mergedInventory,
    visits: mergedVisits
  }, false);
}

async function pushToDrive() {
  if (!fileId) return;

  const inventory = await getAllInventory();
  const visits = await getAllVisits();

  const data = {
    version: 1,
    exported_at: nowISO(),
    inventory,
    visits
  };

  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${state.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to push to Drive: ${response.status}`);
  }

  // Mark synced
  const dirtyInventoryIds = inventory.filter(i => i.dirty).map(i => i.id);
  const dirtyVisitIds = visits.filter(v => v.dirty).map(v => v.id);

  if (dirtyInventoryIds.length > 0) {
    await markInventorySynced(dirtyInventoryIds);
  }
  if (dirtyVisitIds.length > 0) {
    await markVisitsSynced(dirtyVisitIds);
  }
}

async function driveRequest(endpoint, options = {}) {
  if (!state.accessToken) {
    throw new Error('Not authenticated');
  }

  return fetch(`https://www.googleapis.com/drive/v3/${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
}
