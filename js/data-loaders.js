// =============================================================================
// DATA LOADERS MODULE
// =============================================================================
// Centralized data loading and caching for reference data (brands, materials, etc.)

import { MATERIAL_TIER_MULTIPLIERS } from './config.js';
import { round } from './fees.js';

// Caches
let brandsLookup = null;
let brandsDataFull = null;
let materialsLookup = null;

// =============================================================================
// GENERIC NORMALIZATION
// =============================================================================

/**
 * Normalize a string for lookup matching (lowercase, remove special chars).
 * Used for brand names, material names, etc.
 * @param {string} name - Name to normalize
 * @returns {string} Normalized name
 */
export function normalizeForLookup(name) {
  return name.toLowerCase()
    .replace(/[_\-\s]+/g, '') // Remove underscores, hyphens, spaces
    .replace(/[^a-z0-9]/g, ''); // Remove other special chars
}

// =============================================================================
// BRAND DATA
// =============================================================================

/**
 * Load and flatten brands data for quick lookup.
 * Returns a Map of normalized brand names to their multipliers.
 */
export async function loadBrandsLookup() {
  if (brandsLookup) return brandsLookup;

  try {
    const response = await fetch('/data/brands-clothing-shoes.json');
    const data = await response.json();
    brandsLookup = new Map();

    // Recursively extract brand multipliers from nested structure
    function extractBrands(obj, path = '') {
      if (!obj || typeof obj !== 'object') return;

      // If this object has an 'm' property, it's a brand entry
      if (typeof obj.m === 'number') {
        const brandName = path.split('.').pop();
        if (brandName) {
          const normalized = normalizeForLookup(brandName);
          brandsLookup.set(normalized, { multiplier: obj.m, tips: obj.tips || null });

          // Also add alternate names if present
          if (obj.alt && Array.isArray(obj.alt)) {
            for (const alt of obj.alt) {
              brandsLookup.set(normalizeForLookup(alt), { multiplier: obj.m, tips: obj.tips || null });
            }
          }
        }
        return;
      }

      // Recurse into nested objects
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          extractBrands(value, path ? `${path}.${key}` : key);
        }
      }
    }

    extractBrands(data);
    console.log(`Loaded ${brandsLookup.size} brands for resale suggestions`);
    return brandsLookup;
  } catch (err) {
    console.error('Failed to load brands data:', err);
    return new Map();
  }
}

/**
 * Load full brands data including meta pricing info.
 */
export async function loadBrandsDataFull() {
  if (brandsDataFull) return brandsDataFull;
  try {
    const response = await fetch('/data/brands-clothing-shoes.json');
    brandsDataFull = await response.json();
    return brandsDataFull;
  } catch (err) {
    console.error('Failed to load brands data:', err);
    return null;
  }
}

/**
 * Look up a brand and return its multiplier and tips.
 * @param {string} brand - The brand name to look up
 * @returns {Promise<{multiplier: number, tips: string|null}|null>}
 */
export async function getBrandMultiplier(brand) {
  if (!brand) return null;

  const lookup = await loadBrandsLookup();
  const normalized = normalizeForLookup(brand);

  // Try exact match first
  if (lookup.has(normalized)) {
    return lookup.get(normalized);
  }

  // Try partial match (brand contains or is contained by a known brand)
  for (const [key, value] of lookup) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  return null;
}

/**
 * Calculate suggested resale value based on purchase price and brand multiplier.
 * @param {object} item - Inventory item with purchase_price, tax_paid, brand
 * @returns {Promise<{value: number, multiplier: number, tips: string|null}|null>}
 */
export async function calculateSuggestedResaleValue(item) {
  if (!item.purchase_price) return null;

  const brandInfo = await getBrandMultiplier(item.brand);
  if (!brandInfo) return null;

  const purchaseCost = (item.purchase_price || 0) + (item.tax_paid || 0);
  const suggestedValue = round(purchaseCost * brandInfo.multiplier);

  return {
    value: suggestedValue,
    multiplier: brandInfo.multiplier,
    tips: brandInfo.tips
  };
}

// =============================================================================
// MATERIAL DATA
// =============================================================================

/**
 * Load materials data and build a lookup map of material name → value_tier.
 */
export async function loadMaterialsLookup() {
  if (materialsLookup) return materialsLookup;

  try {
    const response = await fetch('/data/materials.json');
    const data = await response.json();
    materialsLookup = new Map();

    function extractMaterials(obj, path = '') {
      if (!obj || typeof obj !== 'object') return;

      // If this object has a value_tier, it's a material entry
      if (obj.value_tier) {
        const materialName = path.split('.').pop();
        if (materialName) {
          const normalized = normalizeForLookup(materialName);
          materialsLookup.set(normalized, obj.value_tier);

          // Also index label_terms if present
          if (obj.label_terms && Array.isArray(obj.label_terms)) {
            for (const term of obj.label_terms) {
              materialsLookup.set(normalizeForLookup(term), obj.value_tier);
            }
          }
        }
        return;
      }

      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && key !== 'meta') {
          extractMaterials(value, path ? `${path}.${key}` : key);
        }
      }
    }

    extractMaterials(data);
    return materialsLookup;
  } catch (err) {
    console.error('Failed to load materials data:', err);
    return new Map();
  }
}

/**
 * Look up a material's value tier.
 * @param {string} materialName - Material name
 * @returns {Promise<string|null>} Value tier or null
 */
export async function getMaterialValueTier(materialName) {
  if (!materialName) return null;

  const lookup = await loadMaterialsLookup();
  const normalized = normalizeForLookup(materialName);

  if (lookup.has(normalized)) {
    return lookup.get(normalized);
  }

  // Try partial matching
  for (const [key, tier] of lookup) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return tier;
    }
  }

  return null;
}

/**
 * Get numeric multiplier for a material's value tier.
 * @param {string} materialName - Material name
 * @returns {Promise<number>} Multiplier (defaults to 1.0)
 */
export async function getMaterialTierMultiplier(materialName) {
  const tier = await getMaterialValueTier(materialName);
  if (!tier) return 1.0;
  return MATERIAL_TIER_MULTIPLIERS[tier] || 1.0;
}

// =============================================================================
// PLATFORMS DATA
// =============================================================================

let platformsData = null;

/**
 * Load platforms data with caching.
 * @returns {Promise<object|null>} Platforms data or null on error
 */
export async function loadPlatformsData() {
  if (platformsData) return platformsData;
  try {
    const response = await fetch('/data/platforms.json');
    platformsData = await response.json();
    return platformsData;
  } catch (err) {
    console.error('Failed to load platforms data:', err);
    return null;
  }
}

// =============================================================================
// RE-EXPORTS FROM OTHER MODULES
// =============================================================================

// Re-export seasonal data loading from seasonal.js
export { loadSeasonalData, getCurrentMonthKey } from './seasonal.js';

// Re-export synchronous platforms data getter from fees.js (for when data is already loaded)
export { getPlatformsData } from './fees.js';
