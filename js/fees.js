// =============================================================================
// FEE CALCULATION MODULE
// =============================================================================
// Calculates platform fees for resale based on platforms.json data

let platformsData = null;

/**
 * Initialize the fees module by loading platforms.json
 */
export async function initFees() {
  try {
    const response = await fetch('./data/platforms.json');
    platformsData = await response.json();
  } catch (err) {
    console.error('Failed to load platforms data:', err);
    platformsData = { platforms: {} };
  }
}

/**
 * Get loaded platforms data
 */
export function getPlatformsData() {
  return platformsData;
}

/**
 * Calculate fees for a given platform and sale price
 * @param {string} platformId - Platform identifier (e.g., 'poshmark', 'ebay')
 * @param {number} salePrice - Sale price in CAD
 * @returns {object|null} Fee calculation result or null if platform not found
 */
export function calculatePlatformFees(platformId, salePrice) {
  if (!platformsData?.platforms || !platformId || platformId === 'other') {
    return null;
  }

  const platform = platformsData.platforms[platformId];
  if (!platform) return null;

  const fees = platform.fees;
  let commission = 0;
  let paymentProcessing = 0;
  let listingFee = 0;
  const breakdown = {};
  const notes = [];

  // Handle TheRealReal's inverse model (seller_payout_percentage)
  if (platformId === 'therealreal') {
    return calculateTheRealRealFees(salePrice, fees);
  }

  // Calculate commission
  if (fees.commission_tiers) {
    const tierResult = calculateTieredCommission(salePrice, fees.commission_tiers);
    commission = tierResult.amount;
    breakdown.commission = tierResult.description;
  } else if (fees.commission !== undefined) {
    commission = salePrice * (fees.commission / 100);
    breakdown.commission = `${fees.commission}%`;
  }

  // Calculate payment processing
  if (fees.payment_processing && typeof fees.payment_processing === 'object') {
    const pp = fees.payment_processing;
    if (pp.percentage) {
      paymentProcessing = salePrice * (pp.percentage / 100);
      let desc = `${pp.percentage}%`;

      if (pp.flat_fee_cad) {
        paymentProcessing += pp.flat_fee_cad;
        desc += ` + $${pp.flat_fee_cad.toFixed(2)}`;
      }

      if (pp.minimum_cad && paymentProcessing < pp.minimum_cad) {
        paymentProcessing = pp.minimum_cad;
        desc += ` (min $${pp.minimum_cad.toFixed(2)})`;
      }

      breakdown.paymentProcessing = desc;
    } else if (pp.range_percentage) {
      // Grailed uses a range - use midpoint
      const midRate = (pp.range_percentage[0] + pp.range_percentage[1]) / 2;
      paymentProcessing = salePrice * (midRate / 100);
      breakdown.paymentProcessing = `~${midRate.toFixed(1)}%`;
    }
  } else if (fees.payment_processing === 'included' || fees.payment_processing === 'included_in_final_value') {
    breakdown.paymentProcessing = 'Included';
  }

  // Calculate listing fee
  if (fees.listing_fee?.per_listing_cad) {
    listingFee = fees.listing_fee.per_listing_cad;
    breakdown.listingFee = `$${listingFee.toFixed(2)}`;
  } else if (fees.listing_fee?.per_listing_after) {
    // Tiered listing fee (e.g., eBay: 250 free, then $0.30)
    // Include in estimate since most active sellers exceed free tier
    listingFee = fees.listing_fee.per_listing_after;
    const freeCount = fees.listing_fee.free_listings_per_month || 0;
    breakdown.listingFee = `$${listingFee.toFixed(2)}`;
    if (freeCount > 0) {
      notes.push(`${freeCount} free listings/month, then $${listingFee.toFixed(2)} each`);
    }
  }

  // Platform-specific notes
  if (platformId === 'vestiaire_collective' && fees.minimum_listing_price_cad) {
    if (salePrice < fees.minimum_listing_price_cad) {
      notes.push(`Minimum listing price: $${fees.minimum_listing_price_cad} CAD`);
    }
  }

  const totalFees = commission + paymentProcessing + listingFee;
  const netPayout = salePrice - totalFees;

  return {
    commission: round(commission),
    paymentProcessing: round(paymentProcessing),
    listingFee: round(listingFee),
    totalFees: round(totalFees),
    netPayout: round(netPayout),
    breakdown,
    notes,
    platformName: platform.name
  };
}

/**
 * Calculate tiered commission (Poshmark, Starluv, Vestiaire patterns)
 */
function calculateTieredCommission(salePrice, tiers) {
  for (const tier of tiers) {
    // Threshold-based tiers (Poshmark, Starluv): threshold_cad
    if ('threshold_cad' in tier) {
      if (tier.threshold_cad === null || salePrice > tier.threshold_cad) {
        if (tier.fee_type === 'percentage') {
          return {
            amount: salePrice * (tier.amount / 100),
            description: `${tier.amount}%`
          };
        }
      } else if (salePrice <= tier.threshold_cad) {
        if (tier.fee_type === 'flat') {
          return {
            amount: tier.amount_cad,
            description: `$${tier.amount_cad.toFixed(2)} flat`
          };
        }
      }
    }

    // Range-based tiers (Vestiaire): range_cad
    if ('range_cad' in tier) {
      const [min, max] = tier.range_cad;
      if (salePrice >= min && (max === null || salePrice < max)) {
        if (tier.fee_type === 'percentage') {
          return {
            amount: salePrice * (tier.amount / 100),
            description: `${tier.amount}%`
          };
        } else if (tier.fee_type === 'flat') {
          return {
            amount: tier.amount_cad,
            description: `$${tier.amount_cad.toFixed(2)} flat`
          };
        }
      }
    }

    // Category-based tiers (eBay): category
    if ('category' in tier && tier.fee_type === 'percentage') {
      // Use default category rate
      return {
        amount: salePrice * (tier.amount / 100),
        description: `${tier.amount}%`
      };
    }
  }

  return { amount: 0, description: 'Unknown' };
}

/**
 * Calculate TheRealReal fees (consignment model - shows what seller receives)
 */
function calculateTheRealRealFees(salePrice, fees) {
  const tiers = fees.commission_tiers;

  // Find applicable tier based on USD price (TRR uses USD)
  // Note: We're treating the input as USD for TRR since that's their currency
  let payoutPercent = 55; // Default middle tier

  for (const tier of tiers) {
    if ('range_usd' in tier) {
      const [min, max] = tier.range_usd;
      if (salePrice >= min && (max === null || salePrice < max)) {
        payoutPercent = tier.seller_payout_percentage;
        break;
      }
    }
  }

  const netPayout = salePrice * (payoutPercent / 100);
  const commission = salePrice - netPayout;

  return {
    commission: round(commission),
    paymentProcessing: 0,
    listingFee: 0,
    totalFees: round(commission),
    netPayout: round(netPayout),
    breakdown: {
      commission: `You keep ${payoutPercent}%`,
      paymentProcessing: 'Included'
    },
    notes: ['Prices in USD', 'TRR handles photography, listing, and shipping'],
    platformName: 'The RealReal',
    isConsignment: true,
    payoutPercent
  };
}

/**
 * Calculate estimated returns across multiple platforms for an item
 * @param {object} item - Inventory item with estimated_resale_value and cost info
 * @param {string[]} platforms - List of platform IDs to compare (default: main platforms)
 * @returns {object[]} Sorted array of platform returns (highest profit first)
 */
export function calculateEstimatedReturns(item, platforms = null) {
  if (!item?.estimated_resale_value) return [];

  const defaultPlatforms = ['poshmark', 'ebay', 'etsy', 'depop', 'grailed', 'starluv'];
  const platformList = platforms || defaultPlatforms;
  const resaleValue = item.estimated_resale_value;

  // Calculate cost basis
  const purchaseCost = (item.purchase_price || 0) + (item.tax_paid || 0);
  const repairCosts = item.repairs_completed?.reduce((sum, r) => sum + (r.repair_cost || 0), 0) || 0;
  const costBasis = purchaseCost + repairCosts;

  const results = [];

  for (const platformId of platformList) {
    const fees = calculatePlatformFees(platformId, resaleValue);
    if (!fees) continue;

    const profit = fees.netPayout - costBasis;
    const margin = fees.netPayout > 0 ? (profit / fees.netPayout) * 100 : 0;

    results.push({
      platformId,
      platformName: fees.platformName,
      netPayout: fees.netPayout,
      totalFees: fees.totalFees,
      profit: round(profit),
      margin: round(margin),
      feePercent: round((fees.totalFees / resaleValue) * 100)
    });
  }

  // Sort by profit (highest first)
  return results.sort((a, b) => b.profit - a.profit);
}

/**
 * Get shipping info for a platform
 */
export function getPlatformShipping(platformId) {
  if (!platformsData?.platforms?.[platformId]) return null;

  const fees = platformsData.platforms[platformId].fees;
  return fees?.shipping || null;
}

/**
 * Round to 2 decimal places
 */
export function round(num) {
  return Math.round(num * 100) / 100;
}
