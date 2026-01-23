// =============================================================================
// USER STORES DATABASE OPERATIONS
// =============================================================================

import {
  promisify,
  getStore,
  getAllFromStore,
  addRecord,
  deleteRecord
} from './core.js';
import { generateId, nowISO, handleError } from '../utils.js';
import { showToast } from '../ui.js';

// =============================================================================
// USER STORES CRUD
// =============================================================================

export async function createUserStore(data) {
  try {
    const now = nowISO();
    const store = {
      ...data,
      id: data.id || generateId(),
      created_at: now,
      updated_at: now,
      user_created: true,
      unsynced: true
    };
    await addRecord('stores', store);
    return store;
  } catch (err) {
    console.error('Failed to create store:', err);
    showToast('Failed to save store');
    throw err;
  }
}

export async function updateUserStore(id, updates) {
  try {
    const store = await getStore('stores', 'readwrite');
    const existing = await promisify(store.get(id));
    if (!existing) throw new Error('Store not found');

    const updated = {
      ...existing,
      ...updates,
      updated_at: nowISO(),
      unsynced: true
    };
    await promisify(store.put(updated));
    return updated;
  } catch (err) {
    console.error('Failed to update store:', err);
    showToast('Failed to update store');
    throw err;
  }
}

export async function deleteUserStore(id) {
  try {
    await deleteRecord('stores', id);
  } catch (err) {
    console.error('Failed to delete store:', err);
    showToast('Failed to delete store');
    throw err;
  }
}

export async function getAllUserStores() {
  try {
    const stores = await getAllFromStore('stores');
    return stores.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } catch (err) {
    return handleError(err, 'Failed to get user stores', []);
  }
}
