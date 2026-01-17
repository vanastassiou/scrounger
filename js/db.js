// =============================================================================
// DATABASE MODULE
// =============================================================================
// Native IndexedDB wrapper. No external dependencies.

import { DB_NAME, DB_VERSION } from './config.js';
import { generateId, generateSlug, canGenerateSlug, isUuidFormat, nowISO, handleError } from './utils.js';
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
    const stores = ['inventory', 'visits', 'stores', 'settings', 'attachments', 'archive'];
    const tx = db.transaction(stores, 'readwrite');

    const clearStoreInTx = (storeName) => new Promise((resolve, reject) => {
      const req = tx.objectStore(storeName).clear();
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });

    await Promise.all(stores.map(clearStoreInTx));
    return { success: true };
  } catch (err) {
    return handleError(err, 'Failed to clear data', { success: false });
  }
}

/**
 * Migrate an item from old flat schema to new nested schema (v4 → v5).
 * Transforms flat fields into nested objects.
 * Handles partially-migrated items by checking for nested colour field.
 */
function migrateItemToNestedSchema(item) {
  // Skip if already fully migrated (has nested colour object with primary)
  // This is the definitive check since colour.primary is required in the new schema
  if (item.colour?.primary !== undefined) return item;

  const migrated = {
    id: item.id,
    brand: item.brand || null,
    category: {
      primary: item.category?.primary ?? item.category ?? null,
      secondary: item.category?.secondary ?? item.subcategory ?? null
    },
    colour: {
      primary: item.primary_colour || null,
      secondary: item.secondary_colour || null
    },
    material: {
      primary: item.primary_material || null,
      secondary: item.secondary_materials || null
    },
    size: {
      label: {
        gender: null, // New field - will be null for existing items
        value: item.labeled_size || null
      },
      measurements: item.measurements || null
    },
    country_of_manufacture: item.country_of_manufacture || null,
    era: item.era || null,
    notes: item.notes || null,
    description: item.description || null,
    condition: {
      overall_condition: item.overall_condition || null,
      flaws: item.flaws || null,
      repairs_completed: item.repairs_completed || null,
      repairs_needed: item.repairs_needed || null,
      condition_notes: item.condition_notes || null
    },
    intent: item.intent ? {
      intent: item.intent,
      resale_platform_target: item.resale_platform_target || null
    } : null,
    pricing: {
      estimated_resale_value: item.estimated_resale_value || null,
      minimum_acceptable_price: item.minimum_acceptable_price || null,
      brand_premium_multiplier: item.brand_premium_multiplier || null
    },
    listing_status: {
      listing_date: item.listing_date || null,
      sold_date: item.sold_date || null,
      sold_price: item.sold_price || null,
      sold_platform: item.sold_platform || null,
      shipping_cost: item.shipping_cost || null,
      platform_fees: item.platform_fees || null
    },
    jewelry_specific: item.category?.primary === 'jewelry' ? {
      metal_type: item.metal_type || null,
      closure_type: item.closure_type || null,
      hallmarks: item.hallmarks || null,
      stones: item.stones || null,
      tested_with: item.tested_with || null,
      ring_size: item.ring_size || null
    } : null,
    shoes_specific: item.category?.primary === 'shoes' ? {
      width: item.width || null
    } : null,
    photos: item.photos || null,
    // title is deprecated - computed on-the-fly via getItemTitle()
    source: item.source || null,
    tax_paid: item.tax_paid || null,
    metadata: {
      acquisition: {
        date: item.acquisition_date || null,
        price: item.purchase_price || null,
        store_id: item.store_id || null,
        packaging: item.packaging || null
      },
      status: item.status || 'in_collection',
      created: item.created_at || new Date().toISOString(),
      updated: item.updated_at || new Date().toISOString(),
      sync: {
        unsynced: item.unsynced ?? false,
        synced_at: item.synced_at || null
      }
    }
  };

  // Clean up null nested objects
  if (!migrated.intent?.intent) migrated.intent = null;
  if (!migrated.jewelry_specific?.metal_type && !migrated.jewelry_specific?.closure_type) {
    migrated.jewelry_specific = null;
  }
  if (!migrated.shoes_specific?.width) migrated.shoes_specific = null;

  return migrated;
}

/**
 * Migrate items with old flat category format to nested format.
 * Converts: { category: "shoes", subcategory: "boots" }
 * To: { category: { primary: "shoes", secondary: "boots" } }
 * @returns {Promise<{migrated: number, total: number}>}
 */
export async function migrateCategoryFormat() {
  const db = await openDB();
  const tx = db.transaction('inventory', 'readwrite');
  const store = tx.objectStore('inventory');

  return new Promise((resolve, reject) => {
    const items = [];
    const request = store.openCursor();

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        items.push(cursor.value);
        cursor.continue();
      } else {
        // All items collected, now migrate
        let migrated = 0;
        const updates = [];

        for (const item of items) {
          if (typeof item.category === 'string') {
            const newCategory = {
              primary: item.category.toLowerCase(),
              secondary: item.subcategory?.toLowerCase() || null
            };
            item.category = newCategory;
            delete item.subcategory;
            item.metadata = item.metadata || {};
            item.metadata.updated = new Date().toISOString();
            updates.push(store.put(item));
            migrated++;
          }
        }

        if (updates.length === 0) {
          resolve({ migrated: 0, total: items.length });
          return;
        }

        // Wait for all updates
        Promise.all(updates.map(req => new Promise((res, rej) => {
          req.onsuccess = res;
          req.onerror = () => rej(req.error);
        }))).then(() => {
          resolve({ migrated, total: items.length });
        }).catch(reject);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Remove deprecated 'title' field from all inventory and archive items.
 * Title is now computed on-the-fly via getItemTitle().
 * @returns {Promise<{migrated: number, total: number}>}
 */
export async function migrateRemoveTitle() {
  const db = await openDB();
  let totalMigrated = 0;
  let totalItems = 0;

  // Process both inventory and archive stores
  for (const storeName of ['inventory', 'archive']) {
    if (!db.objectStoreNames.contains(storeName)) continue;

    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    await new Promise((resolve, reject) => {
      const items = [];
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          // All items collected, now migrate
          const updates = [];

          for (const item of items) {
            if ('title' in item) {
              delete item.title;
              item.metadata = item.metadata || {};
              item.metadata.updated = new Date().toISOString();
              item.metadata.sync = item.metadata.sync || {};
              item.metadata.sync.unsynced = true; // Mark for sync
              updates.push(store.put(item));
              totalMigrated++;
            }
          }
          totalItems += items.length;

          if (updates.length === 0) {
            resolve();
            return;
          }

          // Wait for all updates
          Promise.all(updates.map(req => new Promise((res, rej) => {
            req.onsuccess = res;
            req.onerror = () => rej(req.error);
          }))).then(resolve).catch(reject);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  return { migrated: totalMigrated, total: totalItems };
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

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      const oldVersion = event.oldVersion;

      // Create stores if they don't exist (fresh install)
      if (!db.objectStoreNames.contains('inventory')) {
        const inventoryStore = db.createObjectStore('inventory', { keyPath: 'id' });
        // New nested indexes for v5 schema
        inventoryStore.createIndex('category.primary', 'category.primary', { unique: false });
        inventoryStore.createIndex('metadata.status', 'metadata.status', { unique: false });
        inventoryStore.createIndex('metadata.acquisition.store_id', 'metadata.acquisition.store_id', { unique: false });
        inventoryStore.createIndex('metadata.acquisition.date', 'metadata.acquisition.date', { unique: false });
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

      // Migrate from v4 to v5: Update indexes and migrate items
      if (oldVersion > 0 && oldVersion < 5) {
        const inventoryStore = transaction.objectStore('inventory');

        // Delete old indexes if they exist
        if (inventoryStore.indexNames.contains('category')) {
          inventoryStore.deleteIndex('category');
        }
        if (inventoryStore.indexNames.contains('status')) {
          inventoryStore.deleteIndex('status');
        }
        if (inventoryStore.indexNames.contains('store_id')) {
          inventoryStore.deleteIndex('store_id');
        }
        if (inventoryStore.indexNames.contains('acquisition_date')) {
          inventoryStore.deleteIndex('acquisition_date');
        }

        // Create new nested indexes
        if (!inventoryStore.indexNames.contains('category.primary')) {
          inventoryStore.createIndex('category.primary', 'category.primary', { unique: false });
        }
        if (!inventoryStore.indexNames.contains('metadata.status')) {
          inventoryStore.createIndex('metadata.status', 'metadata.status', { unique: false });
        }
        if (!inventoryStore.indexNames.contains('metadata.acquisition.store_id')) {
          inventoryStore.createIndex('metadata.acquisition.store_id', 'metadata.acquisition.store_id', { unique: false });
        }
        if (!inventoryStore.indexNames.contains('metadata.acquisition.date')) {
          inventoryStore.createIndex('metadata.acquisition.date', 'metadata.acquisition.date', { unique: false });
        }

        // Migrate all items to new schema using cursor
        const cursorRequest = inventoryStore.openCursor();
        cursorRequest.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const item = cursor.value;
            // migrateItemToNestedSchema handles the check internally
            const migrated = migrateItemToNestedSchema(item);
            // Only update if migration occurred (different reference)
            if (migrated !== item) {
              cursor.update(migrated);
            }
            cursor.continue();
          }
        };
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
        unsynced: false
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
      const storeId = item.metadata?.acquisition?.store_id;
      const acqDate = item.metadata?.acquisition?.date;
      if (!storeId || !acqDate) continue;

      const key = `${storeId}__${acqDate}`;
      if (!visitsMap.has(key)) {
        visitsMap.set(key, {
          store_id: storeId,
          date: acqDate,
          purchases_count: 0,
          total_spent: 0,
          items: []
        });
      }

      const visit = visitsMap.get(key);
      visit.purchases_count++;
      visit.total_spent += (item.metadata?.acquisition?.price || 0) + (item.tax_paid || 0);
      visit.items.push({
        id: item.id,
        // title deprecated - use getItemTitle(item) with full item object
        purchase_price: item.metadata?.acquisition?.price,
        category: item.category?.primary
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

    // Generate slug ID if all required fields are present, else fall back to UUID
    let id;
    if (canGenerateSlug(data)) {
      try {
        id = generateSlug(data);
      } catch (err) {
        console.warn('Slug generation failed, using UUID:', err.message);
        id = generateId();
      }
    } else {
      id = generateId();
    }

    // Ensure metadata structure exists with proper defaults
    const metadata = data.metadata || {};
    metadata.created = metadata.created || now;
    metadata.updated = now;
    metadata.sync = metadata.sync || { unsynced: true, synced_at: null };
    metadata.sync.unsynced = true;

    const item = {
      ...data,
      id,
      source: data.source || 'user',
      metadata
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

    // Deep merge metadata if present in updates
    let mergedMetadata = existing.metadata || {};
    if (updates.metadata) {
      mergedMetadata = {
        ...mergedMetadata,
        ...updates.metadata,
        acquisition: { ...mergedMetadata.acquisition, ...updates.metadata.acquisition },
        sync: { ...mergedMetadata.sync, ...updates.metadata.sync }
      };
    }
    mergedMetadata.updated = nowISO();
    mergedMetadata.sync = mergedMetadata.sync || {};
    mergedMetadata.sync.unsynced = true;

    // Deep merge listing_status if present in updates
    let mergedListingStatus = existing.listing_status || {};
    if (updates.listing_status) {
      mergedListingStatus = { ...mergedListingStatus, ...updates.listing_status };
    }

    // Deep merge condition if present in updates
    let mergedCondition = existing.condition || {};
    if (updates.condition) {
      mergedCondition = { ...mergedCondition, ...updates.condition };
    }

    // Deep merge pricing if present in updates
    let mergedPricing = existing.pricing || {};
    if (updates.pricing) {
      mergedPricing = { ...mergedPricing, ...updates.pricing };
    }

    // Deep merge size if present in updates
    let mergedSize = existing.size || {};
    if (updates.size) {
      mergedSize = {
        ...mergedSize,
        ...updates.size,
        label: { ...mergedSize.label, ...updates.size?.label },
        measurements: { ...mergedSize.measurements, ...updates.size?.measurements }
      };
    }

    const updated = {
      ...existing,
      ...updates,
      metadata: mergedMetadata,
      listing_status: mergedListingStatus,
      condition: mergedCondition,
      pricing: mergedPricing,
      size: mergedSize
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
    return items.sort((a, b) => (b.metadata?.created || '').localeCompare(a.metadata?.created || ''));
  } catch (err) {
    return handleError(err, 'Failed to get inventory', []);
  }
}

export async function getInventoryByCategory(category) {
  try {
    const store = await getStore('inventory');
    const index = store.index('category.primary');
    return promisify(index.getAll(category));
  } catch (err) {
    return handleError(err, `Failed to get inventory by category ${category}`, []);
  }
}

export async function getInventoryByStatus(status) {
  try {
    const store = await getStore('inventory');
    const index = store.index('metadata.status');
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
      const category = item.category?.primary;
      const status = item.metadata?.status;
      if (stats.byCategory[category] !== undefined) {
        stats.byCategory[category]++;
      }
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
      stats.totalInvested += (item.metadata?.acquisition?.price || 0) + (item.tax_paid || 0);
      if (status === 'sold' && item.listing_status?.sold_price) {
        stats.totalSold += item.listing_status.sold_price;
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
      'needs_photo', 'unlisted', 'listed', 'sold', 'packaged', 'shipped', 'confirmed_received'
    ];

    return items.filter(item => pipelineStatuses.includes(item.metadata?.status))
      .sort((a, b) => new Date(b.metadata?.created || 0) - new Date(a.metadata?.created || 0));
  } catch (err) {
    return handleError(err, 'Failed to get pipeline inventory', []);
  }
}

export async function getItemsNotInPipeline() {
  try {
    const items = await getAllFromStore('inventory');
    const pipelineStatuses = [
      'needs_photo', 'unlisted', 'listed', 'sold', 'packaged', 'shipped', 'confirmed_received'
    ];

    return items.filter(item => !pipelineStatuses.includes(item.metadata?.status))
      .sort((a, b) => new Date(b.metadata?.created || 0) - new Date(a.metadata?.created || 0));
  } catch (err) {
    return handleError(err, 'Failed to get non-pipeline inventory', []);
  }
}

export async function getSellingAnalytics(dateRange = null) {
  try {
    const store = await getStore('inventory');
    const statusIndex = store.index('metadata.status');
    const soldItems = await promisify(statusIndex.getAll('sold'));

    // Apply date filter if provided
    let filtered = soldItems;
    if (dateRange) {
      const { startDate, endDate } = dateRange;
      filtered = soldItems.filter(item => {
        const soldDate = item.listing_status?.sold_date;
        if (!soldDate) return false;
        const date = new Date(soldDate);
        return date >= startDate && date <= endDate;
      });
    }

    // Calculate metrics
    const revenue = filtered.reduce((sum, item) => sum + (item.listing_status?.sold_price || 0), 0);
    const cost = filtered.reduce((sum, item) => {
      const purchaseCost = (item.metadata?.acquisition?.price || 0) + (item.tax_paid || 0);
      const expenses = (item.listing_status?.shipping_cost || 0) + (item.listing_status?.platform_fees || 0);
      const repairCosts = item.condition?.repairs_completed?.reduce((s, r) => s + (r.repair_cost || 0), 0) || 0;
      return sum + purchaseCost + expenses + repairCosts;
    }, 0);

    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    // Platform breakdown
    const platformBreakdown = {};
    filtered.forEach(item => {
      const platform = item.listing_status?.sold_platform || 'unknown';
      if (!platformBreakdown[platform]) {
        platformBreakdown[platform] = { count: 0, revenue: 0, profit: 0 };
      }
      platformBreakdown[platform].count++;
      platformBreakdown[platform].revenue += item.listing_status?.sold_price || 0;
    });

    // Category breakdown
    const categoryBreakdown = {};
    filtered.forEach(item => {
      const cat = item.category?.primary || 'unknown';
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = { count: 0, revenue: 0, profit: 0 };
      }
      categoryBreakdown[cat].count++;
      categoryBreakdown[cat].revenue += item.listing_status?.sold_price || 0;
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
    const item = await getInventoryItem(itemId);
    if (!item) throw new Error('Item not found');

    // Update nested structures
    return await updateInventoryItem(itemId, {
      metadata: {
        ...item.metadata,
        status: 'sold'
      },
      listing_status: {
        ...item.listing_status,
        sold_date,
        sold_price,
        sold_platform,
        shipping_cost: shipping_cost || 0,
        platform_fees: platform_fees || 0
      }
    });
  } catch (err) {
    return handleError(err, `Failed to mark item ${itemId} as sold`, null);
  }
}

export async function getInventoryByPlatform(platform) {
  try {
    const items = await getAllFromStore('inventory');
    return items.filter(item =>
      item.metadata?.status === 'sold' && item.listing_status?.sold_platform === platform
    );
  } catch (err) {
    return handleError(err, `Failed to get inventory by platform ${platform}`, []);
  }
}

export async function getInventoryForVisit(storeId, date) {
  try {
    const items = await getAllFromStore('inventory');
    return items.filter(item =>
      item.metadata?.acquisition?.store_id === storeId && item.metadata?.acquisition?.date === date
    );
  } catch (err) {
    return handleError(err, `Failed to get inventory for visit`, []);
  }
}

export async function getInventoryByStore(storeId) {
  try {
    const store = await getStore('inventory');
    const index = store.index('metadata.acquisition.store_id');
    return promisify(index.getAll(storeId));
  } catch (err) {
    return handleError(err, `Failed to get inventory by store ${storeId}`, []);
  }
}

/**
 * Migrate an item from UUID ID to slug ID.
 * Updates the item's ID and re-links all attachments.
 * @param {string} oldId - Current UUID ID
 * @returns {Promise<Object>} Updated item with new slug ID
 */
export async function migrateItemToSlug(oldId) {
  const db = await openDB();

  // Get the item
  const inventoryStore = db.transaction('inventory').objectStore('inventory');
  const item = await promisify(inventoryStore.get(oldId));
  if (!item) throw new Error('Item not found');

  // Check if it can be migrated
  if (!canGenerateSlug(item)) {
    throw new Error('Item is missing required fields for slug generation (colour, material, or type)');
  }

  // Generate new slug ID
  const newId = generateSlug(item);

  // Transaction to update item and attachments atomically
  const tx = db.transaction(['inventory', 'attachments'], 'readwrite');
  const invStore = tx.objectStore('inventory');
  const attStore = tx.objectStore('attachments');

  // Delete old item record
  await promisify(invStore.delete(oldId));

  // Add with new slug ID
  const updatedItem = {
    ...item,
    id: newId,
    updated_at: nowISO(),
    unsynced: true
  };
  await promisify(invStore.add(updatedItem));

  // Update all attachments to point to new ID and mark for re-sync
  const attachmentsIndex = attStore.index('itemId');
  const attachments = await promisify(attachmentsIndex.getAll(oldId));

  for (const att of attachments) {
    // Delete old attachment record
    await promisify(attStore.delete(att.id));
    // Add updated attachment with new itemId
    const updatedAtt = {
      ...att,
      itemId: newId,
      synced: false, // Re-sync to move to new folder
      updated_at: nowISO()
    };
    await promisify(attStore.add(updatedAtt));
  }

  // Wait for transaction to complete
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  return updatedItem;
}

/**
 * Get items that need slug migration (have UUID ID but all required fields).
 * @returns {Promise<Array>} Items that can be migrated
 */
export async function getItemsNeedingMigration() {
  const items = await getAllInventory();
  return items.filter(item => isUuidFormat(item.id) && canGenerateSlug(item));
}

/**
 * Get items with UUID IDs that are missing required fields for slug.
 * @returns {Promise<Array>} Items with missing fields and what's missing
 */
export async function getItemsMissingSlugFields() {
  const items = await getAllInventory();
  return items
    .filter(item => isUuidFormat(item.id) && !canGenerateSlug(item))
    .map(item => {
      const missing = [];
      if (!item.colour?.primary) missing.push('colour');
      const primaryMaterial = item.material?.primary;
      const hasMaterial = typeof primaryMaterial === 'object'
        ? !!primaryMaterial?.name
        : !!primaryMaterial;
      if (!hasMaterial) missing.push('material');
      if (!item.category?.secondary) missing.push('type');
      return { ...item, missingFields: missing };
    });
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
      unsynced: true
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

// =============================================================================
// EXPORT/IMPORT
// =============================================================================

export async function exportAllData() {
  try {
    const inventory = await getAllFromStore('inventory');
    const stores = await getAllFromStore('stores');
    const archive = await getAllFromStore('archive');

    return {
      version: 2,
      exported_at: nowISO(),
      inventory,
      stores,
      archive
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
    const tx = db.transaction(['inventory', 'stores', 'archive'], 'readwrite');

    const inventoryStore = tx.objectStore('inventory');
    const storesStore = tx.objectStore('stores');
    const archiveStore = tx.objectStore('archive');

    if (!merge) {
      await promisify(inventoryStore.clear());
      await promisify(storesStore.clear());
      await promisify(archiveStore.clear());
    }

    if (data.inventory) {
      for (const item of data.inventory) {
        // Apply schema migration to ensure nested format
        const migrated = migrateItemToNestedSchema(item);
        inventoryStore.put(migrated);
      }
    }

    if (data.stores) {
      for (const store of data.stores) {
        storesStore.put(store);
      }
    }

    if (data.archive) {
      for (const item of data.archive) {
        // Apply schema migration to ensure nested format
        const migrated = migrateItemToNestedSchema(item);
        archiveStore.put(migrated);
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
// UNSYNCED TRACKING (for sync)
// =============================================================================

export async function getUnsyncedInventory() {
  const items = await getAllFromStore('inventory');
  return items.filter(i => i.metadata?.sync?.unsynced);
}

export async function getUnsyncedVisits() {
  const visits = await getAllFromStore('visits');
  return visits.filter(v => v.unsynced);
}

export async function markInventorySynced(ids) {
  const db = await openDB();
  const tx = db.transaction('inventory', 'readwrite');
  const store = tx.objectStore('inventory');

  for (const id of ids) {
    const item = await promisify(store.get(id));
    if (item) {
      // Update nested sync structure
      if (!item.metadata) item.metadata = {};
      if (!item.metadata.sync) item.metadata.sync = {};
      item.metadata.sync.unsynced = false;
      item.metadata.sync.synced_at = nowISO();
      item.metadata.updated = nowISO();
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

// =============================================================================
// ATTACHMENTS CRUD (for photo sync)
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
      type: type, // e.g. 'front', 'back', 'label', 'flaw', 'delivery_confirmation'
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

export async function findAttachmentByItemAndFilename(itemId, filename) {
  const attachments = await getAttachmentsByItem(itemId);
  return attachments.find(a => a.filename === filename) || null;
}

export async function upsertAttachmentFromSync(itemId, filename, blob, mimeType, driveFileId, type = null) {
  const existing = await findAttachmentByItemAndFilename(itemId, filename);

  if (existing) {
    // Update existing - preserve local ID, update driveFileId
    const store = await getStore('attachments', 'readwrite');
    const updated = { ...existing, blob, driveFileId, synced: true, updated_at: nowISO() };
    await promisify(store.put(updated));
    return updated;
  }

  // Create new, already marked as synced
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
    // Don't re-upload files that already have a driveFileId (even if synced flag is false)
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
    if (item.metadata?.status !== 'sold') {
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
