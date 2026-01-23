// =============================================================================
// EXPORT/IMPORT DATABASE OPERATIONS
// =============================================================================

import {
  openDB,
  promisify,
  getAllFromStore,
  getByKey
} from './core.js';
import { nowISO } from '../utils.js';

// =============================================================================
// SCHEMA MIGRATION HELPER (for import)
// =============================================================================

/**
 * Migrate an item from old flat schema to new nested schema.
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
        packaging: item.packaging || null,
        source_type: item.source_type || item.metadata?.acquisition?.source_type || null
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

// =============================================================================
// EXPORT/IMPORT
// =============================================================================

export async function exportAllData() {
  try {
    const inventory = await getAllFromStore('inventory');
    const stores = await getAllFromStore('stores');
    const archive = await getAllFromStore('archive');
    const trips = await getAllFromStore('trips');
    const expenses = await getAllFromStore('expenses');
    const knowledge = await getByKey('knowledge', 'knowledge-base');

    return {
      version: 2,
      exported_at: nowISO(),
      inventory,
      stores,
      archive,
      trips,
      expenses,
      knowledge
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
    const tx = db.transaction(['inventory', 'stores', 'archive', 'trips', 'expenses', 'knowledge'], 'readwrite');

    const inventoryStore = tx.objectStore('inventory');
    const storesStore = tx.objectStore('stores');
    const archiveStore = tx.objectStore('archive');
    const tripsStore = tx.objectStore('trips');
    const expensesStore = tx.objectStore('expenses');
    const knowledgeStore = tx.objectStore('knowledge');

    if (!merge) {
      await promisify(inventoryStore.clear());
      await promisify(storesStore.clear());
      await promisify(archiveStore.clear());
      await promisify(tripsStore.clear());
      await promisify(expensesStore.clear());
      await promisify(knowledgeStore.clear());
    }

    if (data.inventory) {
      for (const item of data.inventory) {
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
        const migrated = migrateItemToNestedSchema(item);
        archiveStore.put(migrated);
      }
    }

    if (data.trips) {
      for (const trip of data.trips) {
        tripsStore.put(trip);
      }
    }

    if (data.expenses) {
      for (const expense of data.expenses) {
        expensesStore.put(expense);
      }
    }

    if (data.knowledge) {
      knowledgeStore.put(data.knowledge);
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
