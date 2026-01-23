// =============================================================================
// ATTACHMENTS DATABASE OPERATIONS
// =============================================================================

import {
  promisify,
  getStore,
  getAllFromStore,
  getByKey,
  addRecord,
  deleteRecord
} from './core.js';
import { generateId, nowISO, handleError } from '../utils.js';
import { showToast } from '../ui.js';

// =============================================================================
// ATTACHMENTS CRUD
// =============================================================================

export async function createAttachment(itemId, filename, blob, mimeType, type = null) {
  try {
    const now = nowISO();
    const attachment = {
      id: generateId(),
      itemId,
      filename,
      blob,
      mimeType: mimeType || 'application/octet-stream',
      type, // e.g. 'front', 'back', 'label', 'flaw', 'delivery_confirmation'
      synced: false,
      driveFileId: null,
      created_at: now,
      updated_at: now
    };
    await addRecord('attachments', attachment);
    return attachment;
  } catch (err) {
    console.error('Failed to create attachment:', err);
    showToast('Failed to save attachment');
    throw err;
  }
}

export async function getAttachment(id) {
  try {
    return await getByKey('attachments', id);
  } catch (err) {
    return handleError(err, `Failed to get attachment ${id}`, null);
  }
}

export async function getAttachmentsByItem(itemId) {
  try {
    const store = await getStore('attachments');
    const index = store.index('itemId');
    return promisify(index.getAll(itemId));
  } catch (err) {
    return handleError(err, `Failed to get attachments for item ${itemId}`, []);
  }
}

export async function findAttachmentByItemAndFilename(itemId, filename) {
  const attachments = await getAttachmentsByItem(itemId);
  return attachments.find(a => a.filename === filename) || null;
}

export async function upsertAttachmentFromSync(itemId, filename, blob, mimeType, driveFileId, type = null) {
  const existing = await findAttachmentByItemAndFilename(itemId, filename);

  if (existing) {
    const store = await getStore('attachments', 'readwrite');
    const updated = { ...existing, blob, driveFileId, synced: true, updated_at: nowISO() };
    await promisify(store.put(updated));
    return updated;
  }

  const attachment = {
    id: generateId(),
    itemId,
    filename,
    blob,
    mimeType: mimeType || 'application/octet-stream',
    type,
    synced: true,
    driveFileId,
    created_at: nowISO(),
    updated_at: nowISO()
  };
  await addRecord('attachments', attachment);
  return attachment;
}

export async function getPendingAttachments() {
  try {
    const all = await getAllFromStore('attachments');
    return all.filter(att => !att.synced && !att.driveFileId);
  } catch (err) {
    return handleError(err, 'Failed to get pending attachments', []);
  }
}

export async function markAttachmentSynced(id, driveFileId) {
  try {
    const store = await getStore('attachments', 'readwrite');
    const existing = await promisify(store.get(id));
    if (!existing) throw new Error('Attachment not found');

    const updated = {
      ...existing,
      synced: true,
      driveFileId,
      updated_at: nowISO()
    };
    await promisify(store.put(updated));
    return updated;
  } catch (err) {
    console.error('Failed to mark attachment synced:', err);
    showToast('Failed to update attachment');
    throw err;
  }
}

export async function deleteAttachment(id) {
  try {
    await deleteRecord('attachments', id);
  } catch (err) {
    console.error('Failed to delete attachment:', err);
    showToast('Failed to delete attachment');
    throw err;
  }
}

export async function getAllAttachments() {
  try {
    return await getAllFromStore('attachments');
  } catch (err) {
    return handleError(err, 'Failed to get all attachments', []);
  }
}
