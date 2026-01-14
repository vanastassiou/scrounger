// =============================================================================
// DATABASE MODULE
// =============================================================================
// Native IndexedDB wrapper. No external dependencies.

import { DB_NAME, DB_VERSION } from './config.js';
import { generateId, nowISO, handleError } from './utils.js';
import { showToast } from './ui.js';

let dbInstance = null;

/**
 * Reset the database instance (for testing).
 */
export function resetDB() {
  dbInstance = null;
}

/**
 * Clear all data from the database.
 */
export async function clearAllData() {
  try {
    const db = await openDB();
    const tx = db.transaction(['inventory', 'visits', 'stores', 'settings', 'attachments', 'archive'], 'readwrite');

    await Promise.all([
      new Promise((resolve, reject) => {
        const req = tx.objectStore('inventory').clear();
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
      }),
      new Promise((resolve, reject) => {
        const req = tx.objectStore('visits').clear();
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
      }),
      new Promise((resolve, reject) => {
        const req = tx.objectStore('stores').clear();
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
      }),
      new Promise((resolve, reject) => {
        const req = tx.objectStore('settings').clear();
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
      }),
      new Promise((resolve, reject) => {
        const req = tx.objectStore('attachments').clear();
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
      }),
      new Promise((resolve, reject) => {
        const req = tx.objectStore('archive').clear();
        req.onsuccess = resolve;
        req.onerror = () => reject(req.error);
      })
    ]);

    return { success: true };
  } catch (err) {
    return handleError(err, 'Failed to clear data', { success: false });
  }
}

export function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains('inventory')) {
        const inventoryStore = db.createObjectStore('inventory', { keyPath: 'id' });
        inventoryStore.createIndex('category', 'category', { unique: false });
        inventoryStore.createIndex('status', 'status', { unique: false });
        inventoryStore.createIndex('store_id', 'store_id', { unique: false });
        inventoryStore.createIndex('acquisition_date', 'acquisition_date', { unique: false });
      }

      if (!db.objectStoreNames.contains('visits')) {
        const visitStore = db.createObjectStore('visits', { keyPath: 'id' });
        visitStore.createIndex('store_id', 'store_id', { unique: false });
        visitStore.createIndex('date', 'date', { unique: false });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('stores')) {
        const storeStore = db.createObjectStore('stores', { keyPath: 'id' });
        storeStore.createIndex('tier', 'tier', { unique: false });
        storeStore.createIndex('name', 'name', { unique: false });
      }

      if (!db.objectStoreNames.contains('attachments')) {
        const attachmentStore = db.createObjectStore('attachments', { keyPath: 'id' });
        attachmentStore.createIndex('itemId', 'itemId', { unique: false });
        attachmentStore.createIndex('synced', 'synced', { unique: false });
      }

      if (!db.objectStoreNames.contains('archive')) {
        db.createObjectStore('archive', { keyPath: 'id' });
      }
    };
  });
}

// Promisify IDB request
function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Get a transaction and store
async function getStore(storeName, mode = 'readonly') {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

// Get all records from a store
async function getAllFromStore(storeName) {
  const store = await getStore(storeName);
  return promisify(store.getAll());
}

// Get a single record by key
async function getByKey(storeName, key) {
  const store = await getStore(storeName);
  return promisify(store.get(key));
}

// Add a record
async function addRecord(storeName, record) {
  const store = await getStore(storeName, 'readwrite');
  return promisify(store.add(record));
}

// Put a record (add or update)
async function putRecord(storeName, record) {
  const store = await getStore(storeName, 'readwrite');
  return promisify(store.put(record));
}

// Delete a record
async function deleteRecord(storeName, key) {
  const store = await getStore(storeName, 'readwrite');
  return promisify(store.delete(key));
}

// Clear a store
async function clearStore(storeName) {
  const store = await getStore(storeName, 'readwrite');
  return promisify(store.clear());
}

// Export db opener for direct access when needed
export { openDB as db };

// =============================================================================
// SETTINGS HELPERS
// =============================================================================

export async function getSetting(key) {
  try {
    return await getByKey('settings', key);
  } catch (err) {
    return handleError(err, `Failed to get setting ${key}`, null);
  }
}

export async function setSetting(key, value) {
  try {
    const record = { id: key, value, updated_at: nowISO() };
    await putRecord('settings', record);
    return record;
  } catch (err) {
    console.error('Failed to set setting:', err);
    throw err;
  }
}

// =============================================================================
// BASELINE DATA IMPORT
// =============================================================================

/**
 * Import baseline inventory from JSON data (runs once per version).
 * Uses stable IDs from the JSON file for sync compatibility.
 */
export async function importBaselineInventory(items, version) {
  try {
    const currentVersion = await getSetting('inventory_baseline_version');
    if (currentVersion?.value === version) {
      return { imported: 0, skipped: true, reason: 'version_match' };
    }

    const existingItems = await getAllFromStore('inventory');
    const existingIds = new Set(existingItems.map(i => i.id));

    const now = nowISO();
    let imported = 0;

    for (const item of items) {
      if (!item.id || existingIds.has(item.id)) continue;

      const record = {
        ...item,
        created_at: now,
        updated_at: now,
        dirty: false
      };
      await addRecord('inventory', record);
      imported++;
    }

    await setSetting('inventory_baseline_version', version);
    return { imported, skipped: false };
  } catch (err) {
    return handleError(err, 'Failed to import baseline inventory', { imported: 0, error: err.message });
  }
}

/**
 * Compute visits dynamically from inventory items.
 * Aggregates by store_id + acquisition_date.
 */
export async function computeVisitsFromInventory() {
  try {
    const items = await getAllFromStore('inventory');
    const visitsMap = new Map();

    for (const item of items) {
      if (!item.store_id || !item.acquisition_date) continue;

      const key = `${item.store_id}__${item.acquisition_date}`;
      if (!visitsMap.has(key)) {
        visitsMap.set(key, {
          store_id: item.store_id,
          date: item.acquisition_date,
          purchases_count: 0,
          total_spent: 0,
          items: []
        });
      }

      const visit = visitsMap.get(key);
      visit.purchases_count++;
      visit.total_spent += (item.purchase_price || 0) + (item.tax_paid || 0);
      visit.items.push({
        id: item.id,
        title: item.title,
        purchase_price: item.purchase_price,
        category: item.category
      });
    }

    return Array.from(visitsMap.values())
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } catch (err) {
    return handleError(err, 'Failed to compute visits from inventory', []);
  }
}

// =============================================================================
// INVENTORY CRUD
// =============================================================================

export async function createInventoryItem(data) {
  try {
    const now = nowISO();
    const item = {
      ...data,
      id: generateId(),
      source: data.source || 'user',
      created_at: now,
      updated_at: now,
      dirty: true
    };
    await addRecord('inventory', item);
    return item;
  } catch (err) {
    console.error('Failed to create inventory item:', err);
    showToast('Failed to save item');
    throw err;
  }
}

export async function updateInventoryItem(id, updates) {
  try {
    const store = await getStore('inventory', 'readwrite');
    const existing = await promisify(store.get(id));
    if (!existing) throw new Error('Item not found');

    const updated = {
      ...existing,
      ...updates,
      updated_at: nowISO(),
      dirty: true
    };
    await promisify(store.put(updated));
    return updated;
  } catch (err) {
    console.error('Failed to update inventory item:', err);
    showToast('Failed to update item');
    throw err;
  }
}

export async function deleteInventoryItem(id) {
  try {
    await deleteRecord('inventory', id);
  } catch (err) {
    console.error('Failed to delete inventory item:', err);
    showToast('Failed to delete item');
    throw err;
  }
}

export async function getInventoryItem(id) {
  try {
    return await getByKey('inventory', id);
  } catch (err) {
    return handleError(err, `Failed to get item ${id}`, null);
  }
}

export async function getAllInventory() {
  try {
    const items = await getAllFromStore('inventory');
    return items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  } catch (err) {
    return handleError(err, 'Failed to get inventory', []);
  }
}

export async function getInventoryByCategory(category) {
  try {
    const store = await getStore('inventory');
    const index = store.index('category');
    return promisify(index.getAll(category));
  } catch (err) {
    return handleError(err, `Failed to get inventory by category ${category}`, []);
  }
}

export async function getInventoryByStatus(status) {
  try {
    const store = await getStore('inventory');
    const index = store.index('status');
    return promisify(index.getAll(status));
  } catch (err) {
    return handleError(err, `Failed to get inventory by status ${status}`, []);
  }
}

export async function getInventoryStats() {
  try {
    const items = await getAllFromStore('inventory');

    const stats = {
      total: items.length,
      byCategory: { clothing: 0, shoes: 0, jewelry: 0, accessories: 0 },
      byStatus: {},
      totalInvested: 0,
      totalSold: 0
    };

    for (const item of items) {
      if (stats.byCategory[item.category] !== undefined) {
        stats.byCategory[item.category]++;
      }
      stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1;
      stats.totalInvested += (item.purchase_price || 0) + (item.tax_paid || 0);
      if (item.status === 'sold' && item.sold_price) {
        stats.totalSold += item.sold_price;
      }
    }

    return stats;
  } catch (err) {
    return handleError(err, 'Failed to get inventory stats', {
      total: 0,
      byCategory: {},
      byStatus: {},
      totalInvested: 0,
      totalSold: 0
    });
  }
}

// =============================================================================
// SELLING PIPELINE FUNCTIONS
// =============================================================================

export async function getInventoryInPipeline() {
  try {
    const items = await getAllFromStore('inventory');
    const pipelineStatuses = [
      'unlisted', 'photographed', 'listed', 'pending_sale',
      'packaged', 'shipped', 'confirmed_received', 'sold'
    ];

    return items.filter(item => pipelineStatuses.includes(item.status))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (err) {
    return handleError(err, 'Failed to get pipeline inventory', []);
  }
}

export async function getItemsNotInPipeline() {
  try {
    const items = await getAllFromStore('inventory');
    const pipelineStatuses = [
      'unlisted', 'photographed', 'listed', 'pending_sale',
      'packaged', 'shipped', 'confirmed_received', 'sold'
    ];

    return items.filter(item => !pipelineStatuses.includes(item.status))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (err) {
    return handleError(err, 'Failed to get non-pipeline inventory', []);
  }
}

export async function getSellingAnalytics(dateRange = null) {
  try {
    const store = await getStore('inventory');
    const statusIndex = store.index('status');
    const soldItems = await promisify(statusIndex.getAll('sold'));

    // Apply date filter if provided
    let filtered = soldItems;
    if (dateRange) {
      const { startDate, endDate } = dateRange;
      filtered = soldItems.filter(item => {
        if (!item.sold_date) return false;
        const date = new Date(item.sold_date);
        return date >= startDate && date <= endDate;
      });
    }

    // Calculate metrics
    const revenue = filtered.reduce((sum, item) => sum + (item.sold_price || 0), 0);
    const cost = filtered.reduce((sum, item) => {
      const purchaseCost = (item.purchase_price || 0) + (item.tax_paid || 0);
      const expenses = (item.shipping_cost || 0) + (item.platform_fees || 0);
      const repairCosts = item.repairs_completed?.reduce((s, r) => s + (r.repair_cost || 0), 0) || 0;
      return sum + purchaseCost + expenses + repairCosts;
    }, 0);

    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    // Platform breakdown
    const platformBreakdown = {};
    filtered.forEach(item => {
      const platform = item.sold_platform || 'unknown';
      if (!platformBreakdown[platform]) {
        platformBreakdown[platform] = { count: 0, revenue: 0, profit: 0 };
      }
      platformBreakdown[platform].count++;
      platformBreakdown[platform].revenue += item.sold_price || 0;
    });

    // Category breakdown
    const categoryBreakdown = {};
    filtered.forEach(item => {
      const cat = item.category || 'unknown';
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { count: 0, revenue: 0, profit: 0 };
      }
      categoryBreakdown[cat].count++;
      categoryBreakdown[cat].revenue += item.sold_price || 0;
    });

    return {
      itemsSold: filtered.length,
      totalRevenue: revenue,
      totalCost: cost,
      totalProfit: profit,
      profitMargin: margin,
      averageSalePrice: filtered.length > 0 ? revenue / filtered.length : 0,
      averageProfit: filtered.length > 0 ? profit / filtered.length : 0,
      platformBreakdown,
      categoryBreakdown
    };
  } catch (err) {
    return handleError(err, 'Failed to get selling analytics', {
      itemsSold: 0,
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0,
      profitMargin: 0,
      averageSalePrice: 0,
      averageProfit: 0,
      platformBreakdown: {},
      categoryBreakdown: {}
    });
  }
}

export async function markItemAsSold(itemId, soldData) {
  try {
    const { sold_date, sold_price, sold_platform, shipping_cost, platform_fees } = soldData;

    return await updateInventoryItem(itemId, {
      status: 'sold',
      sold_date,
      sold_price,
      sold_platform,
      shipping_cost: shipping_cost || 0,
      platform_fees: platform_fees || 0
    });
  } catch (err) {
    return handleError(err, `Failed to mark item ${itemId} as sold`, null);
  }
}

export async function getInventoryByPlatform(platform) {
  try {
    const items = await getAllFromStore('inventory');
    return items.filter(item =>
      item.status === 'sold' && item.sold_platform === platform
    );
  } catch (err) {
    return handleError(err, `Failed to get inventory by platform ${platform}`, []);
  }
}

export async function getInventoryForVisit(storeId, date) {
  try {
    const items = await getAllFromStore('inventory');
    return items.filter(item =>
      item.store_id === storeId && item.acquisition_date === date
    );
  } catch (err) {
    return handleError(err, `Failed to get inventory for visit`, []);
  }
}

export async function getInventoryByStore(storeId) {
  try {
    const store = await getStore('inventory');
    const index = store.index('store_id');
    return promisify(index.getAll(storeId));
  } catch (err) {
    return handleError(err, `Failed to get inventory by store ${storeId}`, []);
  }
}

// =============================================================================
// VISITS CRUD
// =============================================================================

export async function createVisit(data) {
  try {
    const now = nowISO();
    const visit = {
      ...data,
      id: generateId(),
      created_at: now,
      updated_at: now,
      dirty: true
    };
    await addRecord('visits', visit);
    return visit;
  } catch (err) {
    console.error('Failed to create visit:', err);
    showToast('Failed to save visit');
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
      dirty: true
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

export async function getStoreStats(storeId) {
  const visits = await getVisitsByStore(storeId);

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

export async function getAllStoreStats() {
  // Use computed visits from inventory for accurate stats
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
    const totalVisits = storeVisitList.length;
    const totalSpent = storeVisitList.reduce((sum, v) => sum + (v.total_spent || 0), 0);
    const totalItems = storeVisitList.reduce((sum, v) => sum + (v.purchases_count || 0), 0);
    const hitRate = totalVisits > 0
      ? storeVisitList.filter(v => v.purchases_count > 0).length / totalVisits
      : 0;

    const lastVisit = storeVisitList[0];
    const daysSinceLast = lastVisit
      ? Math.floor((Date.now() - new Date(lastVisit.date).getTime()) / (1000 * 60 * 60 * 24))
      : Infinity;

    statsMap.set(storeId, {
      store_id: storeId,
      total_visits: totalVisits,
      total_spent: totalSpent,
      total_items: totalItems,
      hit_rate: hitRate,
      avg_spend_per_visit: totalVisits > 0 ? totalSpent / totalVisits : 0,
      last_visit_date: lastVisit?.date,
      days_since_last_visit: daysSinceLast
    });
  }

  return statsMap;
}

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
      dirty: true
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
      dirty: true
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

// =============================================================================
// EXPORT/IMPORT
// =============================================================================

export async function exportAllData() {
  try {
    const inventory = await getAllFromStore('inventory');
    const visits = await getAllFromStore('visits');
    const stores = await getAllFromStore('stores');

    return {
      version: 1,
      exported_at: nowISO(),
      inventory,
      visits,
      stores
    };
  } catch (err) {
    console.error('Failed to export data:', err);
    throw err;
  }
}

export async function importData(data, merge = false) {
  if (!data.inventory && !data.stores) {
    throw new Error('Invalid import file - no inventory or stores found');
  }

  try {
    const db = await openDB();
    const tx = db.transaction(['inventory', 'stores'], 'readwrite');

    const inventoryStore = tx.objectStore('inventory');
    const storesStore = tx.objectStore('stores');

    if (!merge) {
      await promisify(inventoryStore.clear());
      await promisify(storesStore.clear());
    }

    if (data.inventory) {
      for (const item of data.inventory) {
        inventoryStore.put(item);
      }
    }

    if (data.stores) {
      for (const store of data.stores) {
        storesStore.put(store);
      }
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Failed to import data:', err);
    throw err;
  }
}

// =============================================================================
// DIRTY TRACKING (for sync)
// =============================================================================

export async function getDirtyInventory() {
  const items = await getAllFromStore('inventory');
  return items.filter(i => i.dirty);
}

export async function getDirtyVisits() {
  const visits = await getAllFromStore('visits');
  return visits.filter(v => v.dirty);
}

export async function markInventorySynced(ids) {
  const db = await openDB();
  const tx = db.transaction('inventory', 'readwrite');
  const store = tx.objectStore('inventory');

  for (const id of ids) {
    const item = await promisify(store.get(id));
    if (item) {
      item.dirty = false;
      item.synced_at = nowISO();
      store.put(item);
    }
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

export async function markVisitsSynced(ids) {
  const db = await openDB();
  const tx = db.transaction('visits', 'readwrite');
  const store = tx.objectStore('visits');

  for (const id of ids) {
    const visit = await promisify(store.get(id));
    if (visit) {
      visit.dirty = false;
      visit.synced_at = nowISO();
      store.put(visit);
    }
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// =============================================================================
// ATTACHMENTS CRUD (for photo sync)
// =============================================================================

export async function createAttachment(itemId, filename, blob, mimeType) {
  try {
    const now = nowISO();
    const attachment = {
      id: generateId(),
      itemId,
      filename,
      blob,
      mimeType: mimeType || 'application/octet-stream',
      synced: false,
      driveFileId: null,
      created_at: now,
      updated_at: now
    };
    await addRecord('attachments', attachment);
    return attachment;
  } catch (err) {
    console.error('Failed to create attachment:', err);
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

export async function getPendingAttachments() {
  try {
    const all = await getAllFromStore('attachments');
    return all.filter(att => !att.synced);
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
    throw err;
  }
}

export async function deleteAttachment(id) {
  try {
    await deleteRecord('attachments', id);
  } catch (err) {
    console.error('Failed to delete attachment:', err);
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

// =============================================================================
// ARCHIVE CRUD
// =============================================================================

/**
 * Archive a sold item. Moves it from inventory to archive store.
 * Item must have status 'sold' before archiving.
 */
export async function archiveItem(itemId) {
  try {
    const item = await getInventoryItem(itemId);
    if (!item) {
      throw new Error('Item not found');
    }
    if (item.status !== 'sold') {
      throw new Error('Item must be sold before archiving');
    }

    const archivedItem = {
      ...item,
      archived_at: nowISO()
    };

    await addRecord('archive', archivedItem);
    await deleteInventoryItem(itemId);
    return archivedItem;
  } catch (err) {
    console.error('Failed to archive item:', err);
    throw err;
  }
}

/**
 * Get all archived items.
 */
export async function getAllArchived() {
  try {
    const items = await getAllFromStore('archive');
    return items.sort((a, b) => (b.archived_at || '').localeCompare(a.archived_at || ''));
  } catch (err) {
    return handleError(err, 'Failed to get archived items', []);
  }
}

/**
 * Export archive as JSON for inventory-archive.json
 */
export async function exportArchive() {
  try {
    const items = await getAllFromStore('archive');
    return {
      meta: {
        version: '1.0',
        document_type: 'inventory_archive',
        exported_at: nowISO(),
        item_count: items.length
      },
      items
    };
  } catch (err) {
    console.error('Failed to export archive:', err);
    throw err;
  }
}
