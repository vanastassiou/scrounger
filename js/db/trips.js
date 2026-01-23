// =============================================================================
// TRIPS DATABASE OPERATIONS
// =============================================================================

import {
  openDB,
  promisify,
  getStore,
  getAllFromStore,
  getByKey,
  addRecord,
  deleteRecord
} from './core.js';
import { generateId, nowISO, handleError } from '../utils.js';
import { showToast } from '../ui.js';
import { getExpensesByTrip } from './expenses.js';

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate trip data before create/update.
 * @param {Object} data - Trip data
 * @throws {Error} If validation fails
 */
function validateTripData(data) {
  // Date validation (YYYY-MM-DD format)
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    throw new Error('Invalid date format (YYYY-MM-DD required)');
  }

  // Stores array validation (if provided)
  if (data.stores !== undefined) {
    if (!Array.isArray(data.stores)) {
      throw new Error('Stores must be an array');
    }
    for (const store of data.stores) {
      if (!store.storeId || typeof store.storeId !== 'string') {
        throw new Error('Each store must have a valid storeId');
      }
    }
  }
}

// =============================================================================
// TRIPS CRUD
// =============================================================================

export async function createTrip(data) {
  try {
    // Validate before creating
    validateTripData(data);

    const now = nowISO();
    const trip = {
      ...data,
      id: generateId(),
      created_at: now,
      updated_at: now,
      unsynced: true
    };
    await addRecord('trips', trip);
    return trip;
  } catch (err) {
    console.error('Failed to create trip:', err);
    showToast(err.message.startsWith('Invalid') ? err.message : 'Failed to save trip');
    throw err;
  }
}

export async function updateTrip(id, updates) {
  try {
    const store = await getStore('trips', 'readwrite');
    const existing = await promisify(store.get(id));
    if (!existing) throw new Error('Trip not found');

    const updated = {
      ...existing,
      ...updates,
      updated_at: nowISO(),
      unsynced: true
    };
    await promisify(store.put(updated));
    return updated;
  } catch (err) {
    console.error('Failed to update trip:', err);
    showToast('Failed to update trip');
    throw err;
  }
}

/**
 * Check if a trip can be safely deleted.
 * Returns dependent records that would be orphaned.
 * @param {string} id - Trip ID
 * @returns {Promise<{canDelete: boolean, dependents: {items: Array, expenses: Array}}>}
 */
export async function canDeleteTrip(id) {
  try {
    // Check for linked items (via trip_id in metadata.acquisition)
    const { getInventoryByTrip } = await import('./inventory.js');
    const items = await getInventoryByTrip(id);

    // Check for linked expenses
    const expenses = await getExpensesByTrip(id);

    return {
      canDelete: items.length === 0 && expenses.length === 0,
      dependents: { items, expenses }
    };
  } catch (err) {
    console.error('Failed to check trip dependents:', err);
    return { canDelete: false, dependents: { items: [], expenses: [] }, error: err.message };
  }
}

export async function deleteTrip(id, force = false) {
  try {
    if (!force) {
      const { canDelete, dependents } = await canDeleteTrip(id);
      if (!canDelete) {
        const itemCount = dependents.items?.length || 0;
        const expenseCount = dependents.expenses?.length || 0;
        throw new Error(`Cannot delete trip: ${itemCount} item(s) and ${expenseCount} expense(s) are linked to it`);
      }
    }
    await deleteRecord('trips', id);
  } catch (err) {
    console.error('Failed to delete trip:', err);
    showToast(err.message.startsWith('Cannot delete') ? err.message : 'Failed to delete trip');
    throw err;
  }
}

export async function getTrip(id) {
  try {
    return await getByKey('trips', id);
  } catch (err) {
    return handleError(err, `Failed to get trip ${id}`, null);
  }
}

export async function getAllTrips() {
  try {
    const trips = await getAllFromStore('trips');
    return trips.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } catch (err) {
    return handleError(err, 'Failed to get trips', []);
  }
}

export async function getTripsByDate(date) {
  try {
    const store = await getStore('trips');
    const index = store.index('date');
    return promisify(index.getAll(date));
  } catch (err) {
    return handleError(err, `Failed to get trips for date ${date}`, []);
  }
}

// =============================================================================
// UNSYNCED TRACKING
// =============================================================================

export async function getUnsyncedTrips() {
  const trips = await getAllFromStore('trips');
  return trips.filter(t => t.unsynced);
}

export async function markTripsSynced(ids) {
  const db = await openDB();
  const tx = db.transaction('trips', 'readwrite');
  const store = tx.objectStore('trips');

  for (const id of ids) {
    const trip = await promisify(store.get(id));
    if (trip) {
      trip.unsynced = false;
      trip.synced_at = nowISO();
      store.put(trip);
    }
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
