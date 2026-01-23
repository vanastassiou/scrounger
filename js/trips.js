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

// =============================================================================
// TRIPS CRUD
// =============================================================================

export async function createTrip(data) {
  try {
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
    showToast('Failed to save trip');
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

export async function deleteTrip(id) {
  try {
    await deleteRecord('trips', id);
  } catch (err) {
    console.error('Failed to delete trip:', err);
    showToast('Failed to delete trip');
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
