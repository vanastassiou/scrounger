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
// VALIDATION
// =============================================================================

const VALID_TIERS = ['s', 'a', 'b', 'c', 'd', 'f', 'unrated'];

/**
 * Validate store data before create/update.
 * @param {Object} data - Store data
 * @throws {Error} If validation fails
 */
function validateStoreData(data) {
  // Name is required
  if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    throw new Error('Store name is required');
  }

  // Tier validation (if provided)
  if (data.tier !== undefined && !VALID_TIERS.includes(data.tier?.toLowerCase())) {
    throw new Error(`Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}`);
  }
}

// =============================================================================
// USER STORES CRUD
// =============================================================================

export async function createUserStore(data) {
  try {
    // Validate before creating
    validateStoreData(data);

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
    showToast(err.message.startsWith('Store name') || err.message.startsWith('Invalid tier')
      ? err.message : 'Failed to save store');
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

/**
 * Check if a store can be safely deleted.
 * Returns dependent records that would be orphaned.
 * @param {string} id - Store ID
 * @returns {Promise<{canDelete: boolean, dependents: {items: Array, visits: Array}}>}
 */
export async function canDeleteStore(id) {
  try {
    // Check for linked inventory items
    const { getInventoryByStore } = await import('./inventory.js');
    const items = await getInventoryByStore(id);

    // Check for linked visits
    const { getVisitsByStore } = await import('./visits.js');
    const visits = await getVisitsByStore(id);

    return {
      canDelete: items.length === 0 && visits.length === 0,
      dependents: { items, visits }
    };
  } catch (err) {
    console.error('Failed to check store dependents:', err);
    return { canDelete: false, dependents: { items: [], visits: [] }, error: err.message };
  }
}

export async function deleteUserStore(id, force = false) {
  try {
    if (!force) {
      const { canDelete, dependents } = await canDeleteStore(id);
      if (!canDelete) {
        const itemCount = dependents.items?.length || 0;
        const visitCount = dependents.visits?.length || 0;
        throw new Error(`Cannot delete store: ${itemCount} item(s) and ${visitCount} visit(s) are linked to it`);
      }
    }
    await deleteRecord('stores', id);
  } catch (err) {
    console.error('Failed to delete store:', err);
    showToast(err.message.startsWith('Cannot delete') ? err.message : 'Failed to delete store');
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
