// =============================================================================
// DATABASE CORE
// =============================================================================
// IndexedDB infrastructure: open, CRUD helpers, migrations.
// All domain-specific operations import from this module.

import { DB_NAME, DB_VERSION } from '../config.js';
import { handleError, nowISO } from '../utils.js';

let dbInstance = null;

/**
 * Reset the database instance (for testing).
 */
export function resetDB() {
  dbInstance = null;
}

/**
 * Promisify an IDB request.
 * @param {IDBRequest} request
 * @returns {Promise<*>}
 */
export function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a transaction and store.
 * @param {string} storeName
 * @param {'readonly'|'readwrite'} mode
 * @returns {Promise<IDBObjectStore>}
 */
export async function getStore(storeName, mode = 'readonly') {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

/**
 * Get all records from a store.
 * @param {string} storeName
 * @returns {Promise<Array>}
 */
export async function getAllFromStore(storeName) {
  const store = await getStore(storeName);
  return promisify(store.getAll());
}

/**
 * Get a single record by key.
 * @param {string} storeName
 * @param {*} key
 * @returns {Promise<*>}
 */
export async function getByKey(storeName, key) {
  const store = await getStore(storeName);
  return promisify(store.get(key));
}

/**
 * Add a record (fails if key exists).
 * @param {string} storeName
 * @param {Object} record
 * @returns {Promise<*>}
 */
export async function addRecord(storeName, record) {
  const store = await getStore(storeName, 'readwrite');
  return promisify(store.add(record));
}

/**
 * Put a record (add or update).
 * @param {string} storeName
 * @param {Object} record
 * @returns {Promise<*>}
 */
export async function putRecord(storeName, record) {
  const store = await getStore(storeName, 'readwrite');
  return promisify(store.put(record));
}

/**
 * Delete a record by key.
 * @param {string} storeName
 * @param {*} key
 * @returns {Promise<void>}
 */
export async function deleteRecord(storeName, key) {
  const store = await getStore(storeName, 'readwrite');
  return promisify(store.delete(key));
}

/**
 * Clear all records from a store.
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export async function clearStore(storeName) {
  const store = await getStore(storeName, 'readwrite');
  return promisify(store.clear());
}

/**
 * Clear all data from the database.
 * @returns {Promise<{success: boolean}>}
 */
export async function clearAllData() {
  try {
    const db = await openDB();
    const stores = ['inventory', 'visits', 'stores', 'settings', 'attachments', 'archive', 'trips', 'expenses', 'knowledge', 'chatLogs'];
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

// =============================================================================
// SCHEMA MIGRATION
// =============================================================================

/**
 * Migrate an item from old flat schema to new nested schema (v4 → v5).
 */
function migrateItemToNestedSchema(item) {
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
        gender: null,
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
    source: item.source || null,
    tax_paid: item.tax_paid || null,
    metadata: {
      acquisition: {
        date: item.acquisition_date || null,
        price: item.purchase_price || null,
        store_id: item.store_id || null,
        trip_id: item.trip_id || null,
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

  if (!migrated.intent?.intent) migrated.intent = null;
  if (!migrated.jewelry_specific?.metal_type && !migrated.jewelry_specific?.closure_type) {
    migrated.jewelry_specific = null;
  }
  if (!migrated.shoes_specific?.width) migrated.shoes_specific = null;

  return migrated;
}

/**
 * Migrate items with old flat category format to nested format.
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
 * @returns {Promise<{migrated: number, total: number}>}
 */
export async function migrateRemoveTitle() {
  const db = await openDB();
  let totalMigrated = 0;
  let totalItems = 0;

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
          const updates = [];

          for (const item of items) {
            if ('title' in item) {
              delete item.title;
              item.metadata = item.metadata || {};
              item.metadata.updated = new Date().toISOString();
              item.metadata.sync = item.metadata.sync || {};
              item.metadata.sync.unsynced = true;
              updates.push(store.put(item));
              totalMigrated++;
            }
          }
          totalItems += items.length;

          if (updates.length === 0) {
            resolve();
            return;
          }

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

// =============================================================================
// DATABASE OPEN
// =============================================================================

/**
 * Open the database, creating/upgrading stores as needed.
 * @returns {Promise<IDBDatabase>}
 */
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

      if (!db.objectStoreNames.contains('trips')) {
        const tripsStore = db.createObjectStore('trips', { keyPath: 'id' });
        tripsStore.createIndex('date', 'date', { unique: false });
      }

      if (!db.objectStoreNames.contains('expenses')) {
        const expensesStore = db.createObjectStore('expenses', { keyPath: 'id' });
        expensesStore.createIndex('date', 'date', { unique: false });
        expensesStore.createIndex('category', 'category', { unique: false });
        expensesStore.createIndex('tripId', 'tripId', { unique: false });
        expensesStore.createIndex('itemId', 'itemId', { unique: false });
      }

      if (!db.objectStoreNames.contains('knowledge')) {
        db.createObjectStore('knowledge', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('chatLogs')) {
        const chatLogsStore = db.createObjectStore('chatLogs', { keyPath: 'date' });
        chatLogsStore.createIndex('updated_at', 'updated_at', { unique: false });
      }

      // Migrate from v4 to v5
      if (oldVersion > 0 && oldVersion < 5) {
        const inventoryStore = transaction.objectStore('inventory');

        // Delete old indexes
        for (const idx of ['category', 'status', 'store_id', 'acquisition_date']) {
          if (inventoryStore.indexNames.contains(idx)) {
            inventoryStore.deleteIndex(idx);
          }
        }

        // Create new nested indexes
        for (const idx of ['category.primary', 'metadata.status', 'metadata.acquisition.store_id', 'metadata.acquisition.date']) {
          if (!inventoryStore.indexNames.contains(idx)) {
            inventoryStore.createIndex(idx, idx, { unique: false });
          }
        }

        // Migrate items
        const cursorRequest = inventoryStore.openCursor();
        cursorRequest.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            const item = cursor.value;
            const migrated = migrateItemToNestedSchema(item);
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

// Alias for backward compatibility
export { openDB as db };
