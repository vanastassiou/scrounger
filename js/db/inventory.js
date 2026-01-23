// =============================================================================
// INVENTORY DATABASE OPERATIONS
// =============================================================================
// Inventory CRUD, selling pipeline, and related queries.

import {
  openDB,
  promisify,
  getStore,
  getAllFromStore,
  getByKey,
  addRecord,
  putRecord,
  deleteRecord
} from './core.js';
import { generateId, generateSlug, canGenerateSlug, isUuidFormat, nowISO, handleError } from '../utils.js';
import { showToast } from '../ui.js';

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

    let mergedListingStatus = existing.listing_status || {};
    if (updates.listing_status) {
      mergedListingStatus = { ...mergedListingStatus, ...updates.listing_status };
    }

    let mergedCondition = existing.condition || {};
    if (updates.condition) {
      mergedCondition = { ...mergedCondition, ...updates.condition };
    }

    let mergedPricing = existing.pricing || {};
    if (updates.pricing) {
      mergedPricing = { ...mergedPricing, ...updates.pricing };
    }

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

/**
 * Check if an inventory item can be safely deleted.
 * Returns dependent records that would be orphaned.
 * @param {string} id - Item ID
 * @returns {Promise<{canDelete: boolean, dependents: {attachments: Array, expenses: Array}}>}
 */
export async function canDeleteItem(id) {
  try {
    // Check for linked attachments
    const { getAttachmentsByItem } = await import('./attachments.js');
    const attachments = await getAttachmentsByItem(id);

    // Check for linked expenses
    const { getExpensesByItem } = await import('./expenses.js');
    const expenses = await getExpensesByItem(id);

    return {
      canDelete: attachments.length === 0 && expenses.length === 0,
      dependents: { attachments, expenses }
    };
  } catch (err) {
    console.error('Failed to check item dependents:', err);
    return { canDelete: false, dependents: { attachments: [], expenses: [] }, error: err.message };
  }
}

export async function deleteInventoryItem(id, force = false) {
  try {
    if (!force) {
      const { canDelete, dependents } = await canDeleteItem(id);
      if (!canDelete) {
        const attachmentCount = dependents.attachments?.length || 0;
        const expenseCount = dependents.expenses?.length || 0;
        throw new Error(`Cannot delete item: ${attachmentCount} attachment(s) and ${expenseCount} expense(s) are linked to it`);
      }
    }
    await deleteRecord('inventory', id);
  } catch (err) {
    console.error('Failed to delete inventory item:', err);
    showToast(err.message.startsWith('Cannot delete') ? err.message : 'Failed to delete item');
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
// SELLING PIPELINE
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

    const revenue = filtered.reduce((sum, item) => sum + (item.listing_status?.sold_price || 0), 0);
    const cost = filtered.reduce((sum, item) => {
      const purchaseCost = (item.metadata?.acquisition?.price || 0) + (item.tax_paid || 0);
      const expenses = (item.listing_status?.shipping_cost || 0) + (item.listing_status?.platform_fees || 0);
      const repairCosts = item.condition?.repairs_completed?.reduce((s, r) => s + (r.repair_cost || 0), 0) || 0;
      return sum + purchaseCost + expenses + repairCosts;
    }, 0);

    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    const platformBreakdown = {};
    filtered.forEach(item => {
      const platform = item.listing_status?.sold_platform || 'unknown';
      if (!platformBreakdown[platform]) {
        platformBreakdown[platform] = { count: 0, revenue: 0, profit: 0 };
      }
      platformBreakdown[platform].count++;
      platformBreakdown[platform].revenue += item.listing_status?.sold_price || 0;
    });

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

export async function getInventoryByTrip(tripId) {
  try {
    const items = await getAllFromStore('inventory');
    return items.filter(item => item.metadata?.acquisition?.trip_id === tripId);
  } catch (err) {
    return handleError(err, `Failed to get inventory by trip ${tripId}`, []);
  }
}

// =============================================================================
// SLUG MIGRATION
// =============================================================================

/**
 * Migrate an item from UUID ID to slug ID.
 */
export async function migrateItemToSlug(oldId) {
  const db = await openDB();

  const inventoryStore = db.transaction('inventory').objectStore('inventory');
  const item = await promisify(inventoryStore.get(oldId));
  if (!item) throw new Error('Item not found');

  if (!canGenerateSlug(item)) {
    throw new Error('Item is missing required fields for slug generation (colour, material, or type)');
  }

  const newId = generateSlug(item);

  const tx = db.transaction(['inventory', 'attachments'], 'readwrite');
  const invStore = tx.objectStore('inventory');
  const attStore = tx.objectStore('attachments');

  await promisify(invStore.delete(oldId));

  const updatedItem = {
    ...item,
    id: newId,
    updated_at: nowISO(),
    unsynced: true
  };
  await promisify(invStore.add(updatedItem));

  const attachmentsIndex = attStore.index('itemId');
  const attachments = await promisify(attachmentsIndex.getAll(oldId));

  for (const att of attachments) {
    await promisify(attStore.delete(att.id));
    const updatedAtt = {
      ...att,
      itemId: newId,
      synced: false,
      updated_at: nowISO()
    };
    await promisify(attStore.add(updatedAtt));
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });

  return updatedItem;
}

/**
 * Get items that need slug migration.
 */
export async function getItemsNeedingMigration() {
  const items = await getAllInventory();
  return items.filter(item => isUuidFormat(item.id) && canGenerateSlug(item));
}

/**
 * Get items with UUID IDs that are missing required fields for slug.
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
// UNSYNCED TRACKING
// =============================================================================

export async function getUnsyncedInventory() {
  const items = await getAllFromStore('inventory');
  return items.filter(i => i.metadata?.sync?.unsynced);
}

export async function markInventorySynced(ids) {
  const db = await openDB();
  const tx = db.transaction('inventory', 'readwrite');
  const store = tx.objectStore('inventory');

  for (const id of ids) {
    const item = await promisify(store.get(id));
    if (item) {
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

// =============================================================================
// ARCHIVE
// =============================================================================

/**
 * Archive a sold item.
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

export async function getAllArchived() {
  try {
    const items = await getAllFromStore('archive');
    return items.sort((a, b) => (b.archived_at || '').localeCompare(a.archived_at || ''));
  } catch (err) {
    return handleError(err, 'Failed to get archived items', []);
  }
}

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
