// =============================================================================
// SEASONAL SELLING MODULE
// =============================================================================

let seasonalData = null;

// =============================================================================
// DATA LOADING
// =============================================================================

export async function loadSeasonalData() {
  if (seasonalData) return seasonalData;

  try {
    const response = await fetch('./data/seasonal-selling.json');
    seasonalData = await response.json();
    return seasonalData;
  } catch (err) {
    console.error('Failed to load seasonal data:', err);
    return null;
  }
}

// =============================================================================
// CURRENT MONTH HELPERS
// =============================================================================

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

export function getCurrentMonthKey() {
  return MONTH_NAMES[new Date().getMonth()];
}

export function getNextMonthKey() {
  const nextMonth = (new Date().getMonth() + 1) % 12;
  return MONTH_NAMES[nextMonth];
}

export function getMonthLabel(monthKey) {
  return seasonalData?.months[monthKey]?.label || monthKey;
}

export function getCurrentMonthData() {
  if (!seasonalData) return null;
  return seasonalData.months[getCurrentMonthKey()];
}

export function getNextMonthData() {
  if (!seasonalData) return null;
  return seasonalData.months[getNextMonthKey()];
}

export function getAllMonthsData() {
  if (!seasonalData) return [];
  return MONTH_NAMES.map(key => ({
    key,
    ...seasonalData.months[key]
  }));
}

export function getColourSeason() {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

export function getSeasonalColours() {
  if (!seasonalData) return [];
  const season = getColourSeason();
  return seasonalData.colour_seasons[season] || [];
}

export function getSeasonalSources() {
  if (!seasonalData) return null;
  return seasonalData.sources || null;
}

// =============================================================================
// ITEM MATCHING
// =============================================================================

/**
 * Match inventory items to current seasonal opportunities.
 * Returns items sorted by match score with reasons.
 * @param {Array} items - Inventory items to match
 * @returns {Array<{item: Object, score: number, reasons: string[]}>}
 */
export function matchItemsToSeason(items) {
  if (!seasonalData || !items?.length) return [];

  const currentMonth = getCurrentMonthData();
  const nextMonth = getNextMonthData();
  const seasonalColours = getSeasonalColours();
  const leadTimeDays = seasonalData.lead_time_days || 14;

  const results = [];

  for (const item of items) {
    const { score, reasons } = scoreItem(item, currentMonth, nextMonth, seasonalColours, leadTimeDays);

    if (score >= 40) {
      results.push({ item, score, reasons });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Score a single item against seasonal criteria.
 */
function scoreItem(item, currentMonth, nextMonth, seasonalColours, leadTimeDays) {
  let score = 0;
  const reasons = [];

  const itemSubcategory = item.category?.secondary?.toLowerCase();
  const itemCategory = item.category?.primary?.toLowerCase();
  const itemMaterials = normalizeMaterials(item.material?.primary?.name || item.material?.primary);
  const itemColours = normalizeColours([item.colour?.primary, item.colour?.secondary].filter(Boolean));

  // Check current month hot categories
  if (currentMonth?.hot_categories) {
    for (const rule of currentMonth.hot_categories) {
      const ruleScore = matchRule(rule, itemSubcategory, itemCategory, itemMaterials, itemColours);
      if (ruleScore.matched) {
        score += ruleScore.points;
        reasons.push(rule.reason);
      }
    }
  }

  // Check next month (lead time bonus) - reduced points
  if (nextMonth?.hot_categories) {
    for (const rule of nextMonth.hot_categories) {
      const ruleScore = matchRule(rule, itemSubcategory, itemCategory, itemMaterials, itemColours);
      if (ruleScore.matched && !reasons.includes(rule.reason)) {
        score += Math.round(ruleScore.points * 0.6); // 60% for next month
        reasons.push(`List now for ${nextMonth.label}: ${rule.reason}`);
      }
    }
  }

  // Seasonal colour bonus
  if (itemColours.some(c => seasonalColours.some(sc => c.includes(sc) || sc.includes(c)))) {
    score += 10;
    if (reasons.length === 0) {
      reasons.push('Seasonal colour match');
    }
  }

  // Evergreen categories get small boost if nothing else matched
  if (score === 0 && seasonalData.evergreen_categories?.includes(itemSubcategory)) {
    score += 15;
    reasons.push('Always in demand');
  }

  return { score, reasons };
}

/**
 * Match a single rule against item properties.
 */
function matchRule(rule, itemSubcategory, itemCategory, itemMaterials, itemColours) {
  let points = 0;
  let matched = false;

  // Subcategory match (highest priority)
  if (rule.subcategories?.some(sub => itemSubcategory?.includes(sub) || sub.includes(itemSubcategory))) {
    points += 40;
    matched = true;
  }

  // Material match
  if (rule.materials?.some(mat => itemMaterials.some(im => im.includes(mat) || mat.includes(im)))) {
    points += 25;
    matched = true;
  }

  // Colour match
  if (rule.colours?.some(col => itemColours.some(ic => ic.includes(col) || col.includes(ic)))) {
    points += 20;
    matched = true;
  }

  // Category-level match (if no subcategory specified in rule but category matches)
  if (!rule.subcategories && itemCategory) {
    // Generic category boost if materials/colours matched
    if (matched) {
      points += 15;
    }
  }

  return { matched, points };
}

/**
 * Normalize materials to array of lowercase strings.
 */
function normalizeMaterials(materials) {
  if (!materials) return [];
  if (Array.isArray(materials)) {
    return materials.map(m => String(m).toLowerCase().replace(/_/g, ' '));
  }
  return [String(materials).toLowerCase().replace(/_/g, ' ')];
}

/**
 * Normalize colours to array of lowercase strings.
 */
function normalizeColours(colours) {
  if (!colours) return [];
  if (Array.isArray(colours)) {
    return colours.map(c => String(c).toLowerCase().replace(/_/g, ' '));
  }
  return [String(colours).toLowerCase().replace(/_/g, ' ')];
}

// =============================================================================
// EXPORTS FOR DASHBOARD
// =============================================================================

/**
 * Get seasonal opportunities for dashboard action items.
 * Includes collection items (intent != personal_keep) and early pipeline items.
 * @param {Array} items - All inventory items
 * @returns {Array<{item: Object, score: number, reasons: string[]}>}
 */
export function getSeasonalOpportunities(items) {
  // Consider items that could be listed:
  // - Collection items not marked for personal keep
  // - Early pipeline items (needs_photo, unlisted)
  const listableStatuses = ['in_collection', 'needs_photo', 'unlisted'];
  const listable = items.filter(i =>
    listableStatuses.includes(i.metadata?.status) && i.intent?.intent !== 'personal_keep'
  );

  return matchItemsToSeason(listable);
}
