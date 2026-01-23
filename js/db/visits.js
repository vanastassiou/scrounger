// =============================================================================
// VISITS DATABASE OPERATIONS
// =============================================================================

import {
  openDB,
  promisify,
  getStore,
  getAllFromStore,
  addRecord,
  deleteRecord
} from './core.js';
import { generateId, nowISO, handleError } from '../utils.js';
import { showToast } from '../ui.js';
import { computeVisitsFromInventory } from './inventory.js';

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate visit data before create/update.
 * @param {Object} data - Visit data
 * @throws {Error} If validation fails
 */
function validateVisitData(data) {
  // Store ID is required
  if (!data.store_id || typeof data.store_id !== 'string') {
    throw new Error('Store ID is required');
  }

  // Date validation (YYYY-MM-DD format)
  if (!data.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    throw new Error('Invalid date format (YYYY-MM-DD required)');
  }

  // Numeric field validation
  if (data.purchases_count !== undefined && (typeof data.purchases_count !== 'number' || data.purchases_count < 0)) {
    throw new Error('Purchases count must be a non-negative number');
  }
  if (data.total_spent !== undefined && (typeof data.total_spent !== 'number' || data.total_spent < 0)) {
    throw new Error('Total spent must be a non-negative number');
  }
}

// =============================================================================
// VISITS CRUD
// =============================================================================

export async function createVisit(data) {
  try {
    // Validate before creating
    validateVisitData(data);

    const now = nowISO();
    const visit = {
      ...data,
      id: generateId(),
      created_at: now,
      updated_at: now,
      unsynced: true
    };
    await addRecord('visits', visit);
    return visit;
  } catch (err) {
    console.error('Failed to create visit:', err);
    const isValidationError = err.message.startsWith('Store ID') ||
                              err.message.startsWith('Invalid') ||
                              err.message.startsWith('Purchases') ||
                              err.message.startsWith('Total spent');
    showToast(isValidationError ? err.message : 'Failed to save visit');
    throw err;
  }
}

export async function updateVisit(id, updates) {
  try {
    const store = await getStore('visits', 'readwrite');
    const existing = await promisify(store.get(id));
    if (!existing) throw new Error('Visit not found');

    const updated = {
      ...existing,
      ...updates,
      updated_at: nowISO(),
      unsynced: true
    };
    await promisify(store.put(updated));
    return updated;
  } catch (err) {
    console.error('Failed to update visit:', err);
    showToast('Failed to update visit');
    throw err;
  }
}

export async function deleteVisit(id) {
  try {
    await deleteRecord('visits', id);
  } catch (err) {
    console.error('Failed to delete visit:', err);
    showToast('Failed to delete visit');
    throw err;
  }
}

export async function getAllVisits() {
  try {
    const visits = await getAllFromStore('visits');
    return visits.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } catch (err) {
    return handleError(err, 'Failed to get visits', []);
  }
}

export async function getVisitsByStore(storeId) {
  try {
    const store = await getStore('visits');
    const index = store.index('store_id');
    const visits = await promisify(index.getAll(storeId));
    return visits.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } catch (err) {
    return handleError(err, `Failed to get visits for store ${storeId}`, []);
  }
}

/**
 * Calculate stats from a list of visits.
 * @param {string} storeId - Store ID
 * @param {Array} visits - Array of visit records (sorted by date descending)
 * @returns {Object} Stats object
 */
function calculateStatsFromVisits(storeId, visits) {
  const totalVisits = visits.length;
  const totalSpent = visits.reduce((sum, v) => sum + (v.total_spent || 0), 0);
  const totalItems = visits.reduce((sum, v) => sum + (v.purchases_count || 0), 0);
  const hitRate = totalVisits > 0
    ? visits.filter(v => v.purchases_count > 0).length / totalVisits
    : 0;

  const lastVisit = visits[0];
  const daysSinceLast = lastVisit
    ? Math.floor((Date.now() - new Date(lastVisit.date).getTime()) / (1000 * 60 * 60 * 24))
    : Infinity;

  return {
    store_id: storeId,
    total_visits: totalVisits,
    total_spent: totalSpent,
    total_items: totalItems,
    hit_rate: hitRate,
    avg_spend_per_visit: totalVisits > 0 ? totalSpent / totalVisits : 0,
    last_visit_date: lastVisit?.date,
    days_since_last_visit: daysSinceLast
  };
}

export async function getStoreStats(storeId) {
  const visits = await getVisitsByStore(storeId);
  return calculateStatsFromVisits(storeId, visits);
}

export async function getAllStoreStats() {
  const visits = await computeVisitsFromInventory();
  const statsMap = new Map();

  // Group visits by store
  const storeVisits = new Map();
  for (const visit of visits) {
    const existing = storeVisits.get(visit.store_id) || [];
    existing.push(visit);
    storeVisits.set(visit.store_id, existing);
  }

  // Calculate stats for each store
  for (const [storeId, storeVisitList] of storeVisits) {
    statsMap.set(storeId, calculateStatsFromVisits(storeId, storeVisitList));
  }

  return statsMap;
}

// =============================================================================
// UNSYNCED TRACKING
// =============================================================================

export async function getUnsyncedVisits() {
  const visits = await getAllFromStore('visits');
  return visits.filter(v => v.unsynced);
}

export async function markVisitsSynced(ids) {
  const db = await openDB();
  const tx = db.transaction('visits', 'readwrite');
  const store = tx.objectStore('visits');

  for (const id of ids) {
    const visit = await promisify(store.get(id));
    if (visit) {
      visit.unsynced = false;
      visit.synced_at = nowISO();
      store.put(visit);
    }
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
