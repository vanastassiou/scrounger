// =============================================================================
// SELLING RECOMMENDATIONS MODULE
// =============================================================================
// Generates platform, price, and profit recommendations for the Start Selling flow

import {
  CONDITION_MULTIPLIERS,
  ERA_BONUSES,
  MATERIAL_TIER_MULTIPLIERS,
  CLOTHING_SIZE_TIERS,
  SHOE_SIZE_TIERS,
  JEWELRY_SIZE_RULES,
  PLATFORM_FIT_ADJUSTMENTS,
  FLAW_IMPACT
} from './config.js';
import { calculatePlatformFees } from './fees.js';

let brandsLookup = null;
let materialsLookup = null;

// =============================================================================
// BRAND LOOKUP
// =============================================================================

/**
 * Load brands data and build a lookup map.
 */
async function loadBrandsLookup() {
  if (brandsLookup) return brandsLookup;

  try {
    const response = await fetch('/data/brands-clothing-shoes.json');
    const data = await response.json();
    brandsLookup = new Map();

    function extractBrands(obj, path = '') {
      if (!obj || typeof obj !== 'object') return;

      if (typeof obj.m === 'number') {
        const brandName = path.split('.').pop();
        if (brandName) {
          const normalized = normalizeBrandName(brandName);
          brandsLookup.set(normalized, { multiplier: obj.m, tips: obj.tips || null });

          if (obj.alt && Array.isArray(obj.alt)) {
            for (const alt of obj.alt) {
              brandsLookup.set(normalizeBrandName(alt), { multiplier: obj.m, tips: obj.tips || null });
            }
          }
        }
        return;
      }

      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null) {
          extractBrands(value, path ? `${path}.${key}` : key);
        }
      }
    }

    extractBrands(data);
    return brandsLookup;
  } catch (err) {
    console.error('Failed to load brands data:', err);
    return new Map();
  }
}

function normalizeBrandName(name) {
  return name.toLowerCase()
    .replace(/[_\-\s]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Look up a brand and return its multiplier and tips.
 */
export async function getBrandMultiplier(brand) {
  if (!brand) return null;

  const lookup = await loadBrandsLookup();
  const normalized = normalizeBrandName(brand);

  if (lookup.has(normalized)) {
    return lookup.get(normalized);
  }

  for (const [key, value] of lookup) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  return null;
}

// =============================================================================
// MATERIAL LOOKUP
// =============================================================================

/**
 * Load materials data and build a lookup map of material name → value_tier.
 */
async function loadMaterialsLookup() {
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
          const normalized = normalizeMaterialName(materialName);
          materialsLookup.set(normalized, obj.value_tier);

          // Also index label_terms if present
          if (obj.label_terms && Array.isArray(obj.label_terms)) {
            for (const term of obj.label_terms) {
              materialsLookup.set(normalizeMaterialName(term), obj.value_tier);
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

function normalizeMaterialName(name) {
  return name.toLowerCase()
    .replace(/[_\-\s]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Look up a material's value tier.
 * @param {string} materialName - Material name
 * @returns {Promise<string|null>} Value tier or null
 */
export async function getMaterialValueTier(materialName) {
  if (!materialName) return null;

  const lookup = await loadMaterialsLookup();
  const normalized = normalizeMaterialName(materialName);

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

/**
 * Calculate weighted material multiplier from item composition.
 * @param {object} item - Item with primary_material and secondary_materials
 * @returns {Promise<{multiplier: number, breakdown: Array, tier: string}>}
 */
export async function calculateMaterialMultiplier(item) {
  const materials = [];

  // Primary material
  if (item.primary_material?.name) {
    const pct = item.primary_material.percentage || 100;
    const mult = await getMaterialTierMultiplier(item.primary_material.name);
    const tier = await getMaterialValueTier(item.primary_material.name);
    materials.push({
      name: item.primary_material.name,
      percentage: pct,
      multiplier: mult,
      tier: tier || 'medium'
    });
  }

  // Secondary materials
  if (item.secondary_materials?.length > 0) {
    for (const mat of item.secondary_materials) {
      if (mat.name) {
        const mult = await getMaterialTierMultiplier(mat.name);
        const tier = await getMaterialValueTier(mat.name);
        materials.push({
          name: mat.name,
          percentage: mat.percentage || 0,
          multiplier: mult,
          tier: tier || 'medium'
        });
      }
    }
  }

  // Default if no materials
  if (materials.length === 0) {
    return { multiplier: 1.0, breakdown: [], tier: 'unknown' };
  }

  // Normalize percentages if they don't sum to 100
  const totalPct = materials.reduce((sum, m) => sum + m.percentage, 0);
  if (totalPct > 0 && totalPct !== 100) {
    materials.forEach(m => {
      m.percentage = (m.percentage / totalPct) * 100;
    });
  }

  // Calculate weighted average
  const weightedMultiplier = materials.reduce(
    (sum, m) => sum + (m.multiplier * m.percentage / 100),
    0
  );

  // Determine overall tier based on primary material
  const primaryTier = materials[0]?.tier || 'medium';

  return {
    multiplier: Math.round(weightedMultiplier * 100) / 100,
    breakdown: materials,
    tier: primaryTier
  };
}

// =============================================================================
// SIZE MULTIPLIERS
// =============================================================================

/**
 * Get size multiplier for clothing items.
 * @param {string} labeledSize - Size label
 * @returns {{multiplier: number, tier: string}}
 */
export function getClothingSizeMultiplier(labeledSize) {
  if (!labeledSize) return { multiplier: 1.0, tier: 'unknown' };

  const normalized = labeledSize.toUpperCase().trim();

  for (const [tierName, config] of Object.entries(CLOTHING_SIZE_TIERS)) {
    if (config.sizes.some(s => normalized.includes(s) || normalized === s)) {
      return { multiplier: config.multiplier, tier: tierName };
    }
  }

  return { multiplier: 1.0, tier: 'standard' };
}

/**
 * Get size multiplier for shoe items.
 * @param {string} labeledSize - Size label
 * @param {string} width - Width option
 * @returns {{multiplier: number, tier: string}}
 */
export function getShoeSizeMultiplier(labeledSize, width) {
  if (!labeledSize) return { multiplier: 1.0, tier: 'unknown' };

  const size = parseFloat(labeledSize);
  if (isNaN(size)) return { multiplier: 1.0, tier: 'unknown' };

  const w = width || 'standard';
  const { premium, standard, narrow_market } = SHOE_SIZE_TIERS;

  // Premium: sizes 7-9 with standard or wide width
  if (size >= premium.minSize && size <= premium.maxSize) {
    if (premium.widths.includes(w)) {
      return { multiplier: premium.multiplier, tier: 'premium' };
    }
  }

  // Standard: sizes 6-10
  if (size >= standard.minSize && size <= standard.maxSize) {
    return { multiplier: standard.multiplier, tier: 'standard' };
  }

  // Narrow market: everything else
  return { multiplier: narrow_market.multiplier, tier: 'narrow_market' };
}

/**
 * Get size multiplier for jewelry items.
 * @param {object} item - Item with subcategory, closure_type, ring_size, measurements
 * @returns {{multiplier: number, tier: string}}
 */
export function getJewelrySizeMultiplier(item) {
  const { adjustable, ring_premium, ring_standard, ring_narrow, necklace_premium, necklace_standard } = JEWELRY_SIZE_RULES;

  // Check for adjustable closure
  if (item.closure_type && adjustable.closures.includes(item.closure_type)) {
    return { multiplier: adjustable.multiplier, tier: 'adjustable' };
  }

  // Check description for "adjustable" keyword
  if (item.description?.toLowerCase().includes('adjustable')) {
    return { multiplier: adjustable.multiplier, tier: 'adjustable' };
  }

  // Ring sizing
  if (item.subcategory === 'ring' && item.ring_size) {
    const size = item.ring_size.toString();
    if (ring_premium.sizes.includes(size)) {
      return { multiplier: ring_premium.multiplier, tier: 'ring_premium' };
    }
    if (ring_standard.sizes.includes(size)) {
      return { multiplier: ring_standard.multiplier, tier: 'ring_standard' };
    }
    return { multiplier: ring_narrow.multiplier, tier: 'ring_narrow' };
  }

  // Necklace/pendant chain length
  if ((item.subcategory === 'necklace' || item.subcategory === 'pendant') &&
      item.measurements?.chain_length_inches) {
    const length = item.measurements.chain_length_inches;
    if (necklace_premium.lengths.includes(length)) {
      return { multiplier: necklace_premium.multiplier, tier: 'necklace_premium' };
    }
    if (necklace_standard.lengths.includes(length)) {
      return { multiplier: necklace_standard.multiplier, tier: 'necklace_standard' };
    }
  }

  return { multiplier: 1.0, tier: 'standard' };
}

/**
 * Get size multiplier based on item category.
 * @param {object} item - Full inventory item
 * @returns {{multiplier: number, tier: string, category: string}}
 */
export function getSizeMultiplier(item) {
  let result;

  switch (item.category) {
    case 'clothing':
      result = getClothingSizeMultiplier(item.labeled_size);
      break;
    case 'shoes':
      result = getShoeSizeMultiplier(item.labeled_size, item.width);
      break;
    case 'jewelry':
      result = getJewelrySizeMultiplier(item);
      break;
    default:
      result = { multiplier: 1.0, tier: 'n/a' };
  }

  return { ...result, category: item.category || 'unknown' };
}

// =============================================================================
// FLAW ADJUSTMENT
// =============================================================================

/**
 * Calculate flaw-based adjustment to condition.
 * @param {Array} flaws - Array of flaw objects
 * @returns {{adjustment: number, details: Array}}
 */
export function calculateFlawAdjustment(flaws) {
  if (!flaws || flaws.length === 0) {
    return { adjustment: 0, details: [] };
  }

  let totalPenalty = 0;
  const details = [];

  for (const flaw of flaws) {
    let penalty = FLAW_IMPACT.severity[flaw.severity] || -0.03;

    if (flaw.affects_wearability) {
      penalty += FLAW_IMPACT.affects_wearability;
    }

    if (flaw.repairable) {
      penalty *= FLAW_IMPACT.repairable_discount;
    }

    totalPenalty += penalty;
    details.push({
      type: flaw.flaw_type,
      severity: flaw.severity,
      penalty: Math.round(penalty * 100) / 100
    });
  }

  // Cap the penalty at max
  const finalPenalty = Math.max(totalPenalty, FLAW_IMPACT.max_penalty);

  return {
    adjustment: Math.round(finalPenalty * 100) / 100,
    details
  };
}

// =============================================================================
// PLATFORM FIT
// =============================================================================

/**
 * Get platform-specific fit modifier based on item attributes.
 * @param {object} item - Full inventory item
 * @param {string} platformId - Platform identifier
 * @param {object} factors - Pre-calculated factors { material, size }
 * @returns {{modifier: number, adjustments: Array}}
 */
export function getPlatformFitModifier(item, platformId, factors) {
  const config = PLATFORM_FIT_ADJUSTMENTS[platformId];
  if (!config) {
    return { modifier: 1.0, adjustments: [] };
  }

  let modifier = 1.0;
  const adjustments = [];

  // Size adjustments
  if (config.size_small_bonus && factors.size.tier === 'premium') {
    modifier += config.size_small_bonus;
    adjustments.push({ factor: 'size', adjustment: config.size_small_bonus, reason: 'Small sizes preferred' });
  }

  if (config.size_large_penalty && (factors.size.tier === 'extended' || factors.size.tier === 'outlier')) {
    modifier += config.size_large_penalty;
    adjustments.push({ factor: 'size', adjustment: config.size_large_penalty, reason: 'Larger sizes less demand' });
  }

  if (config.size_outlier_penalty && factors.size.tier === 'outlier') {
    // Replace default outlier penalty with platform-specific one
    const defaultPenalty = CLOTHING_SIZE_TIERS.outlier.multiplier - 1; // -0.12
    const platformPenalty = config.size_outlier_penalty;
    const diff = platformPenalty - defaultPenalty;
    modifier += diff;
    adjustments.push({ factor: 'size', adjustment: diff, reason: 'Platform size tolerance' });
  }

  if (config.size_compress) {
    // Compress size multiplier toward 1.0
    const sizeDeviation = factors.size.multiplier - 1.0;
    const compressed = sizeDeviation * (1 - config.size_compress);
    const diff = compressed - sizeDeviation;
    modifier += diff;
    if (Math.abs(diff) > 0.01) {
      adjustments.push({ factor: 'size', adjustment: Math.round(diff * 100) / 100, reason: 'Size matters less' });
    }
  }

  // Material adjustments
  if (config.material_compress) {
    // Compress material multiplier toward 1.0
    const matDeviation = factors.material.multiplier - 1.0;
    const compressed = matDeviation * (1 - config.material_compress);
    const diff = compressed - matDeviation;
    modifier += diff;
    if (Math.abs(diff) > 0.01) {
      adjustments.push({ factor: 'material', adjustment: Math.round(diff * 100) / 100, reason: 'Trend over material' });
    }
  }

  if (config.material_low_extra_penalty && ['low', 'avoid'].includes(factors.material.tier)) {
    modifier += config.material_low_extra_penalty;
    adjustments.push({ factor: 'material', adjustment: config.material_low_extra_penalty, reason: 'Premium expected' });
  }

  if (config.natural_fiber_bonus && ['high', 'highest'].includes(factors.material.tier)) {
    modifier += config.natural_fiber_bonus;
    adjustments.push({ factor: 'material', adjustment: config.natural_fiber_bonus, reason: 'Eco-conscious buyers' });
  }

  return {
    modifier: Math.round(modifier * 100) / 100,
    adjustments
  };
}

// =============================================================================
// ADJUSTED PRICE CALCULATION
// =============================================================================

/**
 * Calculate adjusted listing price from user's base comp price.
 * @param {number} baseListingPrice - User-provided comp-based price
 * @param {object} item - Full inventory item
 * @param {string} platformId - Target platform
 * @returns {Promise<{adjustedPrice: number, breakdown: object}>}
 */
export async function calculateAdjustedPrice(baseListingPrice, item, platformId) {
  // 1. Material multiplier
  const materialResult = await calculateMaterialMultiplier(item);

  // 2. Size multiplier
  const sizeResult = getSizeMultiplier(item);

  // 3. Condition multiplier (existing)
  const conditionMultiplier = CONDITION_MULTIPLIERS[item.overall_condition] || 0.85;

  // 4. Flaw adjustment
  const flawResult = calculateFlawAdjustment(item.flaws);
  const flawMultiplier = 1.0 + flawResult.adjustment;

  // 5. Platform fit modifier
  const platformFit = getPlatformFitModifier(item, platformId, {
    material: materialResult,
    size: sizeResult
  });

  // Calculate final adjusted price
  const adjustedPrice = Math.round(
    baseListingPrice *
    materialResult.multiplier *
    sizeResult.multiplier *
    conditionMultiplier *
    flawMultiplier *
    platformFit.modifier *
    100
  ) / 100;

  return {
    adjustedPrice,
    breakdown: {
      baseListingPrice,
      material: {
        multiplier: materialResult.multiplier,
        tier: materialResult.tier,
        composition: materialResult.breakdown
      },
      size: {
        multiplier: sizeResult.multiplier,
        tier: sizeResult.tier,
        category: sizeResult.category
      },
      condition: {
        multiplier: conditionMultiplier,
        level: item.overall_condition
      },
      flaws: {
        multiplier: flawMultiplier,
        adjustment: flawResult.adjustment,
        details: flawResult.details
      },
      platformFit: {
        modifier: platformFit.modifier,
        platformId,
        adjustments: platformFit.adjustments
      }
    }
  };
}

// =============================================================================
// PRICE CALCULATION
// =============================================================================

/**
 * Calculate enhanced resale value factoring in condition and era.
 * @param {object} item - Inventory item
 * @returns {Promise<{value: number, breakdown: object}|null>}
 */
export async function calculateEnhancedResaleValue(item) {
  const purchaseCost = (item.purchase_price || 0) + (item.tax_paid || 0);
  if (!purchaseCost) return null;

  const brandInfo = await getBrandMultiplier(item.brand);
  const brandMultiplier = brandInfo?.multiplier || 1.5; // Default fallback

  const conditionFactor = CONDITION_MULTIPLIERS[item.overall_condition] || 0.85;
  const eraBonus = ERA_BONUSES[item.era] || 1.0;

  const suggestedValue = Math.round(purchaseCost * brandMultiplier * conditionFactor * eraBonus * 100) / 100;

  return {
    value: suggestedValue,
    breakdown: {
      base: purchaseCost,
      brandMultiplier,
      conditionFactor,
      eraBonus,
      brandTips: brandInfo?.tips || null
    }
  };
}

// =============================================================================
// PLATFORM MATCHING
// =============================================================================

// Subcategories that indicate menswear
const MENSWEAR_SUBCATEGORIES = ['suit', 'trousers', 'shirt', 'oxfords', 'loafers', 'sneakers'];

// Known streetwear brands (lowercase normalized)
const STREETWEAR_BRANDS = ['supreme', 'bape', 'palace', 'stussy', 'offwhite', 'kith', 'fearofgod', 'yeezy'];

/**
 * Check if an era qualifies as "true vintage" (20+ years, Etsy policy).
 */
function isTrueVintage(era) {
  const vintageEras = ['pre_1920s', '1920s', '1930s', '1940s', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s'];
  return vintageEras.includes(era);
}

/**
 * Check if an era is vintage (pre-contemporary).
 */
function isVintage(era) {
  const vintageEras = ['pre_1920s', '1920s', '1930s', '1940s', '1950s', '1960s', '1970s', '1980s', '1990s'];
  return vintageEras.includes(era);
}

/**
 * Check if brand is a streetwear brand.
 */
function isStreetwearBrand(brand) {
  if (!brand) return false;
  const normalized = normalizeBrandName(brand);
  return STREETWEAR_BRANDS.some(sw => normalized.includes(sw));
}

/**
 * Rank platforms for an item based on attributes.
 * @param {object} item - Inventory item
 * @param {number} suggestedPrice - Suggested sale price
 * @param {number} brandMultiplier - Brand's multiplier value
 * @returns {Array<{platformId: string, score: number, reasons: string[]}>}
 */
export function rankPlatformsForItem(item, suggestedPrice, brandMultiplier) {
  const platforms = ['poshmark', 'ebay', 'etsy', 'depop', 'vestiaire_collective', 'therealreal', 'grailed', 'starluv'];
  const scores = {};
  const reasons = {};

  platforms.forEach(p => {
    scores[p] = 0;
    reasons[p] = [];
  });

  // 1. Brand tier scoring
  const multiplier = brandMultiplier || 1.5;

  if (multiplier >= 4.0) {
    // Tier S luxury
    scores.vestiaire_collective += 30;
    scores.therealreal += 25;
    scores.ebay += 10;
    reasons.vestiaire_collective.push('Luxury brand — authentication included');
    reasons.therealreal.push('Luxury brand — hands-off consignment');
  } else if (multiplier >= 2.5) {
    // Tier A designer
    scores.vestiaire_collective += 20;
    scores.ebay += 15;
    scores.poshmark += 15;
    reasons.vestiaire_collective.push('Designer brand');
    reasons.ebay.push('Strong designer market');
  } else if (multiplier < 1.5) {
    // Budget/fast fashion
    scores.poshmark += 20;
    scores.depop += 20;
    scores.starluv += 15;
    reasons.poshmark.push('Good for mid-range brands');
    reasons.starluv.push('Lowest fees for budget items');
  }

  // 2. Vintage scoring
  if (isTrueVintage(item.era)) {
    scores.etsy += 30;
    scores.ebay += 20;
    reasons.etsy.push('True vintage (20+ years) — Etsy specialty');
    reasons.ebay.push('Vintage collectors');
  } else if (isVintage(item.era)) {
    scores.depop += 20;
    scores.ebay += 15;
    reasons.depop.push('90s/Y2K vintage appeal');
  }

  // 3. Category scoring
  if (item.category === 'jewelry') {
    scores.etsy += 25;
    scores.ebay += 20;
    reasons.etsy.push('Jewelry performs well');
    reasons.ebay.push('Strong jewelry market');

    if (multiplier >= 3.0) {
      scores.vestiaire_collective += 15;
      reasons.vestiaire_collective.push('High-end jewelry');
    }
  }

  // 4. Menswear detection
  if (MENSWEAR_SUBCATEGORIES.includes(item.subcategory)) {
    scores.grailed += 25;
    scores.ebay += 10;
    reasons.grailed.push("Men's fashion specialist");
  }

  // 5. Streetwear detection
  if (isStreetwearBrand(item.brand)) {
    scores.grailed += 20;
    scores.depop += 20;
    reasons.grailed.push('Streetwear brand');
    reasons.depop.push('Young streetwear audience');
  }

  // 6. Price-based adjustments
  if (suggestedPrice < 50) {
    scores.poshmark -= 10; // High % fee hurts margins on cheap items
    scores.starluv += 10;  // Flat fee better for low prices
    reasons.starluv.push('Low fees on budget items');
  }
  if (suggestedPrice > 500) {
    scores.vestiaire_collective += 15;
    scores.therealreal += 10;
    reasons.vestiaire_collective.push('High-value items authenticate well');
  }

  // Sort by score and return top platforms
  return platforms
    .map(p => ({ platformId: p, score: scores[p], reasons: reasons[p] }))
    .filter(p => p.score > 0 || p.platformId === 'poshmark') // Always include poshmark as fallback
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// =============================================================================
// MAIN RECOMMENDATION FUNCTION
// =============================================================================

/**
 * Generate complete selling recommendations for an item.
 * @param {object} item - Full inventory item
 * @returns {Promise<{
 *   suggestedPrice: number,
 *   priceBreakdown: object,
 *   recommendedPlatforms: Array,
 *   profitEstimate: object
 * }|null>}
 */
export async function generateSellingRecommendations(item) {
  // Calculate enhanced resale value
  const priceResult = await calculateEnhancedResaleValue(item);
  if (!priceResult) return null;

  const suggestedPrice = priceResult.value;
  const brandMultiplier = priceResult.breakdown.brandMultiplier;

  // Rank platforms
  const rankedPlatforms = rankPlatformsForItem(item, suggestedPrice, brandMultiplier);

  // Calculate fees and profit for each recommended platform
  const costBasis = (item.purchase_price || 0) + (item.tax_paid || 0);
  const repairCosts = item.repairs_completed?.reduce((sum, r) => sum + (r.repair_cost || 0), 0) || 0;
  const totalCost = costBasis + repairCosts;

  const platformsWithFees = rankedPlatforms.map(p => {
    const fees = calculatePlatformFees(p.platformId, suggestedPrice);
    const netPayout = fees?.netPayout || suggestedPrice * 0.85; // Estimate if fees unavailable
    const profit = netPayout - totalCost;
    const feePercent = fees ? Math.round((fees.totalFees / suggestedPrice) * 100) : 15;

    return {
      ...p,
      fees,
      netPayout: Math.round(netPayout * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      feePercent
    };
  });

  // Get top platform's profit estimate
  const topPlatform = platformsWithFees[0];
  const profitEstimate = topPlatform ? {
    platformId: topPlatform.platformId,
    netPayout: topPlatform.netPayout,
    totalFees: topPlatform.fees?.totalFees || 0,
    profit: topPlatform.profit,
    costBasis: totalCost
  } : null;

  return {
    suggestedPrice,
    priceBreakdown: priceResult.breakdown,
    recommendedPlatforms: platformsWithFees,
    profitEstimate
  };
}

// =============================================================================
// UTILITY
// =============================================================================

const PLATFORM_NAMES = {
  poshmark: 'Poshmark',
  ebay: 'eBay',
  etsy: 'Etsy',
  depop: 'Depop',
  vestiaire_collective: 'Vestiaire',
  therealreal: 'TheRealReal',
  grailed: 'Grailed',
  starluv: 'Starluv',
  other: 'Other'
};

/**
 * Format platform ID to display name.
 */
export function formatPlatformName(platformId) {
  return PLATFORM_NAMES[platformId] || platformId;
}
