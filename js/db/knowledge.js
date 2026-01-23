// =============================================================================
// KNOWLEDGE DATABASE OPERATIONS
// =============================================================================

import {
  getByKey,
  putRecord
} from './core.js';
import { nowISO, handleError } from '../utils.js';
import { showToast } from '../ui.js';

// =============================================================================
// KNOWLEDGE CRUD
// =============================================================================

const DEFAULT_KNOWLEDGE = {
  id: 'knowledge-base',
  brands: {},
  platformTips: {},
  stores: {},
  created_at: null,
  updated_at: null,
  unsynced: false
};

/**
 * Get the knowledge base document.
 */
export async function getKnowledge() {
  try {
    const doc = await getByKey('knowledge', 'knowledge-base');
    return doc || { ...DEFAULT_KNOWLEDGE, created_at: nowISO() };
  } catch (err) {
    return handleError(err, 'Failed to get knowledge base', { ...DEFAULT_KNOWLEDGE });
  }
}

/**
 * Update the knowledge base with deep merge.
 */
export async function updateKnowledge(updates) {
  try {
    const existing = await getKnowledge();
    const now = nowISO();

    const updated = {
      ...existing,
      brands: { ...existing.brands, ...updates.brands },
      platformTips: { ...existing.platformTips, ...updates.platformTips },
      stores: { ...existing.stores, ...updates.stores },
      updated_at: now,
      unsynced: true
    };

    await putRecord('knowledge', updated);
    return updated;
  } catch (err) {
    console.error('Failed to update knowledge base:', err);
    showToast('Failed to update knowledge');
    throw err;
  }
}

/**
 * Add or update a brand entry in the knowledge base.
 */
export async function upsertBrandKnowledge(brandKey, brandData) {
  try {
    const existing = await getKnowledge();
    const now = nowISO();

    const updated = {
      ...existing,
      brands: {
        ...existing.brands,
        [brandKey]: {
          ...existing.brands[brandKey],
          ...brandData,
          updated_at: now
        }
      },
      updated_at: now,
      unsynced: true
    };

    await putRecord('knowledge', updated);
    return updated.brands[brandKey];
  } catch (err) {
    console.error('Failed to upsert brand knowledge:', err);
    showToast('Failed to save brand knowledge');
    throw err;
  }
}

/**
 * Get a specific brand from the knowledge base.
 */
export async function getBrandKnowledge(brandKey) {
  try {
    const knowledge = await getKnowledge();
    return knowledge.brands[brandKey] || null;
  } catch (err) {
    return handleError(err, `Failed to get brand knowledge for ${brandKey}`, null);
  }
}

/**
 * Delete a brand entry from the knowledge base.
 */
export async function deleteBrandKnowledge(brandKey) {
  try {
    const existing = await getKnowledge();
    const { [brandKey]: removed, ...remainingBrands } = existing.brands;

    const updated = {
      ...existing,
      brands: remainingBrands,
      updated_at: nowISO(),
      unsynced: true
    };

    await putRecord('knowledge', updated);
    return true;
  } catch (err) {
    console.error('Failed to delete brand knowledge:', err);
    showToast('Failed to delete brand knowledge');
    throw err;
  }
}

// =============================================================================
// UNSYNCED TRACKING
// =============================================================================

export async function getUnsyncedKnowledge() {
  const doc = await getKnowledge();
  return doc.unsynced ? [doc] : [];
}

export async function markKnowledgeSynced() {
  try {
    const existing = await getKnowledge();
    const updated = {
      ...existing,
      unsynced: false,
      synced_at: nowISO()
    };
    await putRecord('knowledge', updated);
  } catch (err) {
    console.error('Failed to mark knowledge synced:', err);
  }
}
