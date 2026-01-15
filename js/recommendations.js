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
  FLAW_IMPACT,
  COLOR_TREND_MULTIPLIERS,
  CUT_TREND_MULTIPLIERS,
  STYLE_TREND_MULTIPLIERS,
  CUT_KEYWORDS,
  STYLE_KEYWORDS,
  TREND_WEIGHTS,
  MAX_TREND_ADJUSTMENT
} from './config.js';
import { calculatePlatformFees, round } from './fees.js';
import { getCurrentMonthKey } from './seasonal.js';
import {
  normalizeForLookup,
  loadBrandsLookup,
  loadBrandsDataFull,
  getBrandMultiplier,
  loadMaterialsLookup,
  getMaterialValueTier,
  getMaterialTierMultiplier,
  loadSeasonalData,
  loadPlatformsData
} from './data-loaders.js';


// =============================================================================
// BASE RESALE PRICE RANGES
// =============================================================================

// Subcategory to base range category mapping
const SUBCATEGORY_TO_BASE_CATEGORY = {
  // Clothing - blouse
  blouse: 'blouse',
  shirt: 'blouse',
  tank: 'blouse',
  // Clothing - dress
  dress: 'dress',
  gown: 'dress',
  jumpsuit: 'dress',
  romper: 'dress',
  // Clothing - coat
  coat: 'coat',
  jacket: 'jacket',
  blazer: 'jacket',
  vest: 'jacket',
  // Clothing - pants
  pants: 'pants',
  jeans: 'pants',
  trousers: 'pants',
  shorts: 'pants',
  // Clothing - skirt
  skirt: 'skirt',
  // Clothing - sweater
  sweater: 'sweater',
  cardigan: 'sweater',
  hoodie: 'sweater',
  // Shoes
  heels: 'shoes',
  flats: 'shoes',
  boots: 'shoes',
  sandals: 'shoes',
  sneakers: 'shoes',
  loafers: 'shoes',
  oxfords: 'shoes',
  mules: 'shoes',
  // Jewelry - use own ranges
  necklace: 'jewelry',
  bracelet: 'jewelry',
  earrings: 'jewelry',
  ring: 'jewelry',
  brooch: 'jewelry',
  pendant: 'jewelry'
};

// Jewelry-specific base ranges (not in the brands file)
const JEWELRY_BASE_RANGES = {
  costume: [10, 35],
  silver: [25, 75],
  gold: [50, 200],
  fine: [100, 500]
};

/**
 * Get base resale price range for an item based on its subcategory.
 * @param {object} item - Inventory item
 * @returns {Promise<{min: number, max: number, category: string}|null>}
 */
export async function getBasePriceRange(item) {
  const data = await loadBrandsDataFull();
  const baseRanges = data?.meta?.pricing_notes?.base_resale_ranges_cad;

  if (!baseRanges && item.category !== 'jewelry') {
    return null;
  }

  // Map subcategory to base category
  const subcategory = item.subcategory?.toLowerCase();
  let baseCategory = SUBCATEGORY_TO_BASE_CATEGORY[subcategory];

  // Fallback to category-based defaults
  if (!baseCategory) {
    if (item.category === 'clothing') baseCategory = 'dress'; // Default
    else if (item.category === 'shoes') baseCategory = 'shoes';
    else if (item.category === 'jewelry') baseCategory = 'jewelry';
    else return null;
  }

  // Handle jewelry separately
  if (baseCategory === 'jewelry') {
    const metalType = item.metal_type || 'costume';
    let jewelryTier = 'costume';
    if (metalType.includes('gold') && !metalType.includes('plated') && !metalType.includes('filled')) {
      jewelryTier = 'gold';
    } else if (metalType.includes('silver') || metalType === 'sterling_silver') {
      jewelryTier = 'silver';
    } else if (metalType === 'platinum' || metalType === 'palladium') {
      jewelryTier = 'fine';
    }

    const range = JEWELRY_BASE_RANGES[jewelryTier];
    return { min: range[0], max: range[1], category: `jewelry_${jewelryTier}` };
  }

  // Get range from brands data
  const range = baseRanges[baseCategory];
  if (!range) return null;

  return { min: range[0], max: range[1], category: baseCategory };
}

// =============================================================================
// MATERIAL CALCULATIONS
// =============================================================================

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
    multiplier: round(weightedMultiplier),
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
      penalty: round(penalty)
    });
  }

  // Cap the penalty at max
  const finalPenalty = Math.max(totalPenalty, FLAW_IMPACT.max_penalty);

  return {
    adjustment: round(finalPenalty),
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
      adjustments.push({ factor: 'size', adjustment: round(diff), reason: 'Size matters less' });
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
      adjustments.push({ factor: 'material', adjustment: round(diff), reason: 'Trend over material' });
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
    modifier: round(modifier),
    adjustments
  };
}

// =============================================================================
// TREND MATCHING
// =============================================================================

/**
 * Normalize color name for comparison.
 */
function normalizeColor(color) {
  if (!color) return null;
  return color.toLowerCase().replace(/[_-]/g, '').trim();
}

/**
 * Check if a color is a neutral (always safe).
 */
function isNeutralColor(color) {
  const neutrals = ['black', 'white', 'grey', 'gray', 'navy', 'cream', 'beige', 'tan', 'camel', 'brown', 'charcoal', 'ivory', 'khaki', 'nude', 'taupe'];
  const normalized = normalizeColor(color);
  return neutrals.some(n => normalized?.includes(n));
}

/**
 * Match item colors to seasonal trends.
 * @param {object} item - Inventory item
 * @param {string} monthKey - Current month key (e.g., 'january')
 * @returns {{multiplier: number, tier: string, matchedColors: string[], summary: string}}
 */
async function matchItemToColorTrends(item, monthKey) {
  const data = await loadSeasonalData();
  if (!data?.months?.[monthKey]) {
    return { multiplier: 1.0, tier: 'neutral', matchedColors: [], summary: 'No data' };
  }

  const monthData = data.months[monthKey];
  const itemColors = [item.primary_colour, item.secondary_colour]
    .filter(Boolean)
    .map(c => normalizeColor(c));

  if (itemColors.length === 0) {
    return { multiplier: 1.0, tier: 'neutral', matchedColors: [], summary: 'No color' };
  }

  // Get color trends for the month
  const hotColors = (monthData.colour_trends?.hot || []).map(normalizeColor);
  const emergingColors = (monthData.colour_trends?.emerging || []).map(normalizeColor);
  const decliningColors = (monthData.colour_trends?.declining || []).map(normalizeColor);

  // Also get colors from hot_categories for this month
  const categoryColors = (monthData.hot_categories || [])
    .flatMap(cat => cat.colours || [])
    .map(normalizeColor);

  const allHotColors = [...new Set([...hotColors, ...categoryColors])];

  // Check for matches
  const hotMatches = itemColors.filter(c => allHotColors.some(h => c?.includes(h) || h?.includes(c)));
  const emergingMatches = itemColors.filter(c => emergingColors.some(e => c?.includes(e) || e?.includes(c)));
  const decliningMatches = itemColors.filter(c => decliningColors.some(d => c?.includes(d) || d?.includes(c)));

  if (hotMatches.length > 0) {
    return {
      multiplier: COLOR_TREND_MULTIPLIERS.hot,
      tier: 'hot',
      matchedColors: hotMatches,
      summary: `Hot color: ${hotMatches[0]}`
    };
  }

  if (emergingMatches.length > 0) {
    return {
      multiplier: COLOR_TREND_MULTIPLIERS.emerging,
      tier: 'emerging',
      matchedColors: emergingMatches,
      summary: `Trending: ${emergingMatches[0]}`
    };
  }

  if (decliningMatches.length > 0) {
    return {
      multiplier: COLOR_TREND_MULTIPLIERS.declining,
      tier: 'declining',
      matchedColors: decliningMatches,
      summary: `Off-trend color`
    };
  }

  // Check if it's a neutral (always safe)
  if (itemColors.some(c => isNeutralColor(c))) {
    return {
      multiplier: COLOR_TREND_MULTIPLIERS.neutral,
      tier: 'neutral',
      matchedColors: [],
      summary: 'Neutral color'
    };
  }

  // Not matching any trend = slight penalty
  return {
    multiplier: 0.95,
    tier: 'off_season',
    matchedColors: [],
    summary: 'Off-season'
  };
}

/**
 * Infer cut/silhouette from item description and subcategory.
 * @param {object} item - Inventory item
 * @returns {string[]} Array of detected cuts
 */
function inferCutsFromItem(item) {
  const text = `${item.description || ''} ${item.title || ''} ${item.subcategory || ''}`.toLowerCase();
  const detectedCuts = [];

  for (const [cut, keywords] of Object.entries(CUT_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      detectedCuts.push(cut);
    }
  }

  return detectedCuts.length > 0 ? detectedCuts : ['classic'];
}

/**
 * Match item cuts to seasonal trends and platform preferences.
 * @param {object} item - Inventory item
 * @param {string} monthKey - Current month key
 * @param {string} platformId - Target platform
 * @returns {{multiplier: number, tier: string, matchedCuts: string[], summary: string}}
 */
async function matchItemToCutTrends(item, monthKey, platformId) {
  const [seasonal, platforms] = await Promise.all([loadSeasonalData(), loadPlatformsData()]);
  const itemCuts = inferCutsFromItem(item);

  // Get trending cuts for the month
  const monthData = seasonal?.months?.[monthKey];
  const trendingCuts = (monthData?.hot_categories || [])
    .flatMap(cat => cat.cuts || [])
    .map(c => c.toLowerCase().replace(/[_-]/g, ''));

  // Get platform preferred cuts
  const platformPrefs = platforms?.platforms?.[platformId]?.style_preferences;
  const platformCuts = (platformPrefs?.preferred_cuts || [])
    .map(c => c.toLowerCase().replace(/[_-]/g, ''));

  // Check for matches
  const normalizedItemCuts = itemCuts.map(c => c.toLowerCase().replace(/[_-]/g, ''));

  const trendingMatches = normalizedItemCuts.filter(c => trendingCuts.includes(c));
  const platformMatches = normalizedItemCuts.filter(c => platformCuts.includes(c));

  if (trendingMatches.length > 0 && platformMatches.length > 0) {
    return {
      multiplier: CUT_TREND_MULTIPLIERS.trending,
      tier: 'trending',
      matchedCuts: trendingMatches,
      summary: `Trending cut: ${trendingMatches[0]}`
    };
  }

  if (platformMatches.length > 0) {
    return {
      multiplier: CUT_TREND_MULTIPLIERS.platform_match,
      tier: 'platform_match',
      matchedCuts: platformMatches,
      summary: `Good fit: ${platformMatches[0]}`
    };
  }

  if (trendingMatches.length > 0) {
    return {
      multiplier: 1.05,
      tier: 'seasonal',
      matchedCuts: trendingMatches,
      summary: `Seasonal: ${trendingMatches[0]}`
    };
  }

  // Check if classic (no penalty)
  const classicCuts = ['classic', 'tailored', 'structured', 'aline', 'straight', 'fitted'];
  if (normalizedItemCuts.some(c => classicCuts.includes(c))) {
    return {
      multiplier: CUT_TREND_MULTIPLIERS.classic,
      tier: 'classic',
      matchedCuts: [],
      summary: 'Classic cut'
    };
  }

  return {
    multiplier: 1.0,
    tier: 'neutral',
    matchedCuts: [],
    summary: 'Standard'
  };
}

/**
 * Infer style/aesthetic from item attributes.
 * @param {object} item - Inventory item
 * @returns {string[]} Array of detected styles
 */
function inferStylesFromItem(item) {
  const text = `${item.description || ''} ${item.title || ''} ${item.brand || ''}`.toLowerCase();
  const detectedStyles = [];

  // Check keywords
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) {
      detectedStyles.push(style);
    }
  }

  // Infer from era
  const era = item.era;
  if (era === '1990s' || era === '2000s') {
    detectedStyles.push('y2k');
  } else if (era === '1970s') {
    detectedStyles.push('boho');
  } else if (era === '1980s') {
    detectedStyles.push('vintage_authentic');
  } else if (['pre_1920s', '1920s', '1930s', '1940s', '1950s', '1960s'].includes(era)) {
    detectedStyles.push('vintage_authentic');
  }

  return [...new Set(detectedStyles)];
}

/**
 * Match item styles to platform preferences and seasonal aesthetics.
 * @param {object} item - Inventory item
 * @param {string} monthKey - Current month key
 * @param {string} platformId - Target platform
 * @returns {{multiplier: number, tier: string, matchedStyles: string[], summary: string}}
 */
async function matchItemToStyleTrends(item, monthKey, platformId) {
  const [seasonal, platforms] = await Promise.all([loadSeasonalData(), loadPlatformsData()]);
  const itemStyles = inferStylesFromItem(item);

  // Get trending aesthetics for the month
  const monthData = seasonal?.months?.[monthKey];
  const trendingAesthetics = (monthData?.trending_aesthetics || [])
    .map(s => s.toLowerCase().replace(/[_-]/g, ''));

  // Get platform preferred styles
  const platformPrefs = platforms?.platforms?.[platformId]?.style_preferences;
  const platformStyles = (platformPrefs?.preferred_styles || [])
    .map(s => s.toLowerCase().replace(/[_-]/g, ''));
  const avoidStyles = (platformPrefs?.avoid || [])
    .map(s => s.toLowerCase().replace(/[_-]/g, ''));

  // Normalize item styles
  const normalizedItemStyles = itemStyles.map(s => s.toLowerCase().replace(/[_-]/g, ''));

  // Check for mismatches (avoid styles)
  const avoidMatches = normalizedItemStyles.filter(s => avoidStyles.some(a => s.includes(a) || a.includes(s)));
  if (avoidMatches.length > 0) {
    return {
      multiplier: STYLE_TREND_MULTIPLIERS.platform_mismatch,
      tier: 'platform_mismatch',
      matchedStyles: avoidMatches,
      summary: `Not ideal for ${platformId}`
    };
  }

  // Check for platform match
  const platformMatches = normalizedItemStyles.filter(s => platformStyles.some(p => s.includes(p) || p.includes(s)));
  if (platformMatches.length > 0) {
    // Also check if it's a hot aesthetic
    const hotMatches = platformMatches.filter(s => trendingAesthetics.some(t => s.includes(t) || t.includes(s)));
    if (hotMatches.length > 0) {
      return {
        multiplier: STYLE_TREND_MULTIPLIERS.hot_aesthetic,
        tier: 'hot_aesthetic',
        matchedStyles: hotMatches,
        summary: `Hot: ${hotMatches[0]}`
      };
    }
    return {
      multiplier: STYLE_TREND_MULTIPLIERS.platform_match,
      tier: 'platform_match',
      matchedStyles: platformMatches,
      summary: `Good fit: ${platformMatches[0]}`
    };
  }

  // Check for seasonal match only
  const seasonalMatches = normalizedItemStyles.filter(s => trendingAesthetics.some(t => s.includes(t) || t.includes(s)));
  if (seasonalMatches.length > 0) {
    return {
      multiplier: STYLE_TREND_MULTIPLIERS.seasonal_match,
      tier: 'seasonal_match',
      matchedStyles: seasonalMatches,
      summary: `Trending: ${seasonalMatches[0]}`
    };
  }

  return {
    multiplier: STYLE_TREND_MULTIPLIERS.neutral,
    tier: 'neutral',
    matchedStyles: [],
    summary: 'Standard'
  };
}

/**
 * Calculate combined trend multiplier for an item.
 * @param {object} item - Inventory item
 * @param {string} platformId - Target platform
 * @returns {Promise<{totalMultiplier: number, color: object, cut: object, style: object, summary: string}>}
 */
export async function calculateTrendMultiplier(item, platformId) {
  const monthKey = getCurrentMonthKey();

  const [colorResult, cutResult, styleResult] = await Promise.all([
    matchItemToColorTrends(item, monthKey),
    matchItemToCutTrends(item, monthKey, platformId),
    matchItemToStyleTrends(item, monthKey, platformId)
  ]);

  // Weighted combination
  const combined = (
    (colorResult.multiplier * TREND_WEIGHTS.color) +
    (cutResult.multiplier * TREND_WEIGHTS.cut) +
    (styleResult.multiplier * TREND_WEIGHTS.style)
  );

  // Cap the adjustment
  const cappedMultiplier = Math.max(
    1 - MAX_TREND_ADJUSTMENT,
    Math.min(1 + MAX_TREND_ADJUSTMENT, combined)
  );

  // Generate summary
  const summaries = [colorResult.summary, cutResult.summary, styleResult.summary]
    .filter(s => s && s !== 'Standard' && s !== 'No data' && s !== 'No color');
  const summary = summaries.length > 0 ? summaries[0] : 'Standard';

  return {
    totalMultiplier: round(cappedMultiplier),
    color: colorResult,
    cut: cutResult,
    style: styleResult,
    summary
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

  // 6. Trend multiplier (color, cut, style)
  const trendResult = await calculateTrendMultiplier(item, platformId);

  // Calculate final adjusted price
  const adjustedPrice = Math.round(
    baseListingPrice *
    materialResult.multiplier *
    sizeResult.multiplier *
    conditionMultiplier *
    flawMultiplier *
    platformFit.modifier *
    trendResult.totalMultiplier *
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
      },
      trends: {
        multiplier: trendResult.totalMultiplier,
        color: trendResult.color,
        cut: trendResult.cut,
        style: trendResult.style,
        summary: trendResult.summary
      }
    }
  };
}

// =============================================================================
// PRICE CALCULATION
// =============================================================================

/**
 * Calculate enhanced resale value using brand-tier category ranges.
 * Uses base resale price ranges by subcategory, adjusted by brand tier.
 * @param {object} item - Inventory item
 * @param {number} compPrice - Optional user-provided comparable price to use as base
 * @returns {Promise<{value: number, breakdown: object, range: {min: number, max: number}}|null>}
 */
export async function calculateEnhancedResaleValue(item, compPrice = null) {
  // Get brand multiplier
  const brandInfo = await getBrandMultiplier(item.brand);
  const brandMultiplier = brandInfo?.multiplier || 1.5; // Default fallback

  // Get base price range for this item type
  const baseRange = await getBasePriceRange(item);
  if (!baseRange && !compPrice) return null;

  // Condition and era factors
  const conditionFactor = CONDITION_MULTIPLIERS[item.overall_condition] || 0.85;
  const eraBonus = ERA_BONUSES[item.era] || 1.0;

  // Calculate base price:
  // If user provided comp price, use that
  // Otherwise, use midpoint of the category range
  let basePrice;
  let baseSource;

  if (compPrice && compPrice > 0) {
    basePrice = compPrice;
    baseSource = 'comp_price';
  } else if (baseRange) {
    // Use midpoint of range as base, then apply brand multiplier
    basePrice = (baseRange.min + baseRange.max) / 2;
    baseSource = 'category_range';
  } else {
    return null;
  }

  // Calculate suggested value
  // For category range: base × brand multiplier × condition × era
  // For comp price: comp × condition × era (brand already factored into comp)
  let suggestedValue;
  if (baseSource === 'comp_price') {
    // Comp price is already market-based, just adjust for condition
    suggestedValue = round(basePrice * conditionFactor * eraBonus);
  } else {
    // Category range needs full brand multiplier
    suggestedValue = round(basePrice * brandMultiplier * conditionFactor * eraBonus);
  }

  // Calculate the full range (min/max with all multipliers applied)
  let rangeMin, rangeMax;
  if (baseRange) {
    rangeMin = round(baseRange.min * brandMultiplier * conditionFactor * eraBonus);
    rangeMax = round(baseRange.max * brandMultiplier * conditionFactor * eraBonus);
  } else {
    // If using comp price with no range, estimate ±20%
    rangeMin = round(suggestedValue * 0.8);
    rangeMax = round(suggestedValue * 1.2);
  }

  return {
    value: suggestedValue,
    range: {
      min: rangeMin,
      max: rangeMax
    },
    breakdown: {
      base: basePrice,
      baseSource,
      baseCategory: baseRange?.category || 'comp',
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
export async function generateSellingRecommendations(item, compPrice = null) {
  // Calculate enhanced resale value using brand-tier ranges (or comp price if provided)
  const priceResult = await calculateEnhancedResaleValue(item, compPrice);
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
      netPayout: round(netPayout),
      profit: round(profit),
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
    priceRange: priceResult.range,
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
