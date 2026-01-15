// =============================================================================
// SELLING RECOMMENDATIONS MODULE
// =============================================================================
// Generates platform, price, and profit recommendations for the Start Selling flow

import { CONDITION_MULTIPLIERS, ERA_BONUSES } from './config.js';
import { calculatePlatformFees } from './fees.js';

let brandsLookup = null;

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
