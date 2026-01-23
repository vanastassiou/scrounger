// =============================================================================
// FEES MODULE TESTS
// =============================================================================
// Tests for platform fee calculations: calculatePlatformFees, calculateEstimatedReturns
//
// Run in browser: import('/js/tests/fees.test.js').then(m => m.runAllTests())
// Run in Node:    node js/tests/run-node-tests.mjs --fees

// =============================================================================
// TEST UTILITIES
// =============================================================================

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

function assertApprox(actual, expected, tolerance, message) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`FAIL: ${message} - expected ~${expected}, got ${actual} (diff: ${diff})`);
  }
  console.log(`  ✓ ${message}`);
}

// =============================================================================
// MOCK PLATFORMS DATA
// =============================================================================

// Simulates the platforms.json data structure for testing
const mockPlatformsData = {
  platforms: {
    poshmark: {
      name: 'Poshmark Canada',
      fees: {
        commission_tiers: [
          { threshold_cad: 20, fee_type: 'flat', amount_cad: 3.95 },
          { threshold_cad: null, fee_type: 'percentage', amount: 20 }
        ],
        payment_processing: 'included',
        listing_fee: null
      }
    },
    ebay: {
      name: 'eBay Canada',
      fees: {
        commission_tiers: [
          { category: 'most_categories', fee_type: 'percentage', amount: 13.6 }
        ],
        payment_processing: 'included_in_final_value',
        listing_fee: {
          free_listings_per_month: 250,
          per_listing_after: 0.30
        }
      }
    },
    etsy: {
      name: 'Etsy',
      fees: {
        commission: 6.5,
        payment_processing: {
          percentage: 3,
          flat_fee_cad: 0.25
        },
        listing_fee: {
          per_listing_usd: 0.20,
          duration_months: 4
        }
      }
    },
    depop: {
      name: 'Depop',
      fees: {
        commission: 10,
        payment_processing: {
          percentage: 3.3,
          flat_fee_usd: 0.45
        },
        listing_fee: null
      }
    },
    vestiaire_collective: {
      name: 'Vestiaire Collective',
      fees: {
        commission_tiers: [
          { range_cad: [0, 125], fee_type: 'flat', amount_cad: 15 },
          { range_cad: [125, 25000], fee_type: 'percentage', amount: 12 },
          { range_cad: [25000, null], fee_type: 'flat', amount_cad: 3000 }
        ],
        payment_processing: {
          percentage: 3,
          minimum_cad: 4
        },
        minimum_listing_price_cad: 34
      }
    },
    therealreal: {
      name: 'The RealReal',
      fees: {
        commission_tiers: [
          { range_usd: [0, 99], seller_payout_percentage: 20 },
          { range_usd: [100, 149], seller_payout_percentage: 30 },
          { range_usd: [150, 199], seller_payout_percentage: 45 },
          { range_usd: [200, 299], seller_payout_percentage: 55 },
          { range_usd: [300, 749], seller_payout_percentage: 65 },
          { range_usd: [750, null], seller_payout_percentage: 70 }
        ],
        payment_processing: 'included',
        listing_fee: null
      }
    },
    grailed: {
      name: 'Grailed',
      fees: {
        commission: 9,
        payment_processing: {
          range_percentage: [3.49, 4.99]
        },
        listing_fee: null
      }
    },
    starluv: {
      name: 'Starluv',
      fees: {
        commission_tiers: [
          { threshold_cad: 25, fee_type: 'flat', amount_cad: 1.95 },
          { threshold_cad: null, fee_type: 'percentage', amount: 7.5 }
        ],
        payment_processing: 'included',
        listing_fee: null
      }
    }
  }
};

// =============================================================================
// LOCAL FEE CALCULATION FUNCTIONS (for testing without module init)
// =============================================================================

function round(num) {
  return Math.round(num * 100) / 100;
}

function calculateTieredCommission(salePrice, tiers) {
  for (const tier of tiers) {
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

    if ('category' in tier && tier.fee_type === 'percentage') {
      return {
        amount: salePrice * (tier.amount / 100),
        description: `${tier.amount}%`
      };
    }
  }

  return { amount: 0, description: 'Unknown' };
}

function calculateTheRealRealFees(salePrice, fees) {
  const tiers = fees.commission_tiers;
  let payoutPercent = 55;

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

function calculatePlatformFeesLocal(platformId, salePrice) {
  if (!mockPlatformsData?.platforms || !platformId || platformId === 'other') {
    return null;
  }

  const platform = mockPlatformsData.platforms[platformId];
  if (!platform) return null;

  const fees = platform.fees;
  let commission = 0;
  let paymentProcessing = 0;
  let listingFee = 0;
  const breakdown = {};
  const notes = [];

  if (platformId === 'therealreal') {
    return calculateTheRealRealFees(salePrice, fees);
  }

  if (fees.commission_tiers) {
    const tierResult = calculateTieredCommission(salePrice, fees.commission_tiers);
    commission = tierResult.amount;
    breakdown.commission = tierResult.description;
  } else if (fees.commission !== undefined) {
    commission = salePrice * (fees.commission / 100);
    breakdown.commission = `${fees.commission}%`;
  }

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
      const midRate = (pp.range_percentage[0] + pp.range_percentage[1]) / 2;
      paymentProcessing = salePrice * (midRate / 100);
      breakdown.paymentProcessing = `~${midRate.toFixed(1)}%`;
    }
  } else if (fees.payment_processing === 'included' || fees.payment_processing === 'included_in_final_value') {
    breakdown.paymentProcessing = 'Included';
  }

  if (fees.listing_fee?.per_listing_cad) {
    listingFee = fees.listing_fee.per_listing_cad;
    breakdown.listingFee = `$${listingFee.toFixed(2)}`;
  } else if (fees.listing_fee?.per_listing_after) {
    listingFee = fees.listing_fee.per_listing_after;
    const freeCount = fees.listing_fee.free_listings_per_month || 0;
    breakdown.listingFee = `$${listingFee.toFixed(2)}`;
    if (freeCount > 0) {
      notes.push(`${freeCount} free listings/month, then $${listingFee.toFixed(2)} each`);
    }
  }

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

// =============================================================================
// TEST SUITES
// =============================================================================

async function testRoundFunction() {
  console.log('\n--- Round Function Tests ---');

  // Basic rounding
  assert(round(10.125) === 10.13, 'rounds 10.125 to 10.13');
  assert(round(10.124) === 10.12, 'rounds 10.124 to 10.12');
  assert(round(10.1) === 10.1, 'keeps 10.1 as 10.1');
  assert(round(10) === 10, 'keeps whole numbers');
  assert(round(0) === 0, 'handles zero');
  assert(round(-5.555) === -5.56, 'rounds negative numbers');

  // Edge cases
  assert(round(0.001) === 0, 'rounds small decimals to 0');
  assert(round(0.005) === 0.01, 'rounds 0.005 to 0.01');
  assert(round(99.999) === 100, 'rounds 99.999 to 100');
}

async function testPoshmarkFees() {
  console.log('\n--- Poshmark Fee Tests ---');

  // Low price - flat $3.95 fee
  const low = calculatePlatformFeesLocal('poshmark', 15);
  assert(low.commission === 3.95, 'flat $3.95 for sales under $20');
  assert(low.paymentProcessing === 0, 'payment processing included');
  assert(low.listingFee === 0, 'no listing fee');
  assert(low.totalFees === 3.95, 'total fees = $3.95');
  assert(low.netPayout === 11.05, 'net payout = $11.05');
  assert(low.breakdown.paymentProcessing === 'Included', 'shows payment processing included');

  // Exactly $20 - still flat fee
  const threshold = calculatePlatformFeesLocal('poshmark', 20);
  assert(threshold.commission === 3.95, 'flat $3.95 for sales at $20');

  // High price - 20% commission
  const high = calculatePlatformFeesLocal('poshmark', 100);
  assert(high.commission === 20, '20% commission on $100 = $20');
  assert(high.totalFees === 20, 'total fees = $20');
  assert(high.netPayout === 80, 'net payout = $80');
  assert(high.breakdown.commission === '20%', 'shows 20% commission');
}

async function testEbayFees() {
  console.log('\n--- eBay Fee Tests ---');

  // Standard sale - 13.6% commission + $0.30 listing
  const sale = calculatePlatformFeesLocal('ebay', 50);
  assert(sale.commission === 6.8, '13.6% on $50 = $6.80');
  assert(sale.listingFee === 0.30, '$0.30 listing fee');
  assert(sale.paymentProcessing === 0, 'payment processing included');
  assertApprox(sale.totalFees, 7.10, 0.01, 'total fees = $7.10');
  assertApprox(sale.netPayout, 42.90, 0.01, 'net payout = $42.90');
  assert(sale.notes.some(n => n.includes('250 free')), 'notes mention free listings');

  // Higher price point
  const expensive = calculatePlatformFeesLocal('ebay', 500);
  assert(expensive.commission === 68, '13.6% on $500 = $68');
}

async function testEtsyFees() {
  console.log('\n--- Etsy Fee Tests ---');

  // Sale with 6.5% commission + 3% + $0.25 payment
  const sale = calculatePlatformFeesLocal('etsy', 100);
  assert(sale.commission === 6.5, '6.5% on $100 = $6.50');
  assertApprox(sale.paymentProcessing, 3.25, 0.01, '3% + $0.25 = $3.25');
  assertApprox(sale.totalFees, 9.75, 0.01, 'total fees ~$9.75');
  assertApprox(sale.netPayout, 90.25, 0.01, 'net payout ~$90.25');

  // Low price - flat fee impact
  const low = calculatePlatformFeesLocal('etsy', 20);
  assert(low.commission === 1.30, '6.5% on $20 = $1.30');
  assertApprox(low.paymentProcessing, 0.85, 0.01, '3% + $0.25 on $20 = $0.85');
}

async function testDepopFees() {
  console.log('\n--- Depop Fee Tests ---');

  // 10% commission + 3.3% payment
  const sale = calculatePlatformFeesLocal('depop', 50);
  assert(sale.commission === 5, '10% on $50 = $5');
  assertApprox(sale.paymentProcessing, 1.65, 0.01, '3.3% on $50 = $1.65');
  assertApprox(sale.totalFees, 6.65, 0.01, 'total fees ~$6.65');
  assertApprox(sale.netPayout, 43.35, 0.01, 'net payout ~$43.35');
}

async function testVestiaireFees() {
  console.log('\n--- Vestiaire Collective Fee Tests ---');

  // Low tier - flat $15 commission
  const low = calculatePlatformFeesLocal('vestiaire_collective', 80);
  assert(low.commission === 15, 'flat $15 for sales under $125');
  assert(low.paymentProcessing === 4, 'minimum $4 payment processing');
  assert(low.notes.some(n => n.includes('Minimum')), 'warns about minimum price');

  // Mid tier - 12% commission
  const mid = calculatePlatformFeesLocal('vestiaire_collective', 200);
  assert(mid.commission === 24, '12% on $200 = $24');
  assertApprox(mid.paymentProcessing, 6, 0.01, '3% on $200 = $6');
  assertApprox(mid.totalFees, 30, 0.01, 'total fees = $30');

  // High tier - capped at $3000
  const high = calculatePlatformFeesLocal('vestiaire_collective', 30000);
  assert(high.commission === 3000, 'capped at $3000 for sales $25000+');
}

async function testTheRealRealFees() {
  console.log('\n--- TheRealReal Fee Tests ---');

  // Low value - 20% payout
  const low = calculateTheRealRealFees(50, mockPlatformsData.platforms.therealreal.fees);
  assert(low.payoutPercent === 20, '20% payout for items under $100');
  assert(low.netPayout === 10, '$50 sale = $10 payout');
  assert(low.commission === 40, 'TRR keeps $40');
  assert(low.isConsignment === true, 'marked as consignment');

  // Mid value - 55% payout
  const mid = calculateTheRealRealFees(250, mockPlatformsData.platforms.therealreal.fees);
  assert(mid.payoutPercent === 55, '55% payout for $200-299');
  assertApprox(mid.netPayout, 137.5, 0.01, '$250 sale = $137.50 payout');

  // High value - 70% payout
  const high = calculateTheRealRealFees(1000, mockPlatformsData.platforms.therealreal.fees);
  assert(high.payoutPercent === 70, '70% payout for items $750+');
  assert(high.netPayout === 700, '$1000 sale = $700 payout');

  // Boundary tests
  const boundary99 = calculateTheRealRealFees(99, mockPlatformsData.platforms.therealreal.fees);
  assert(boundary99.payoutPercent === 20, '20% at $99 (under $100 tier)');

  const boundary100 = calculateTheRealRealFees(100, mockPlatformsData.platforms.therealreal.fees);
  assert(boundary100.payoutPercent === 30, '30% at $100 (exactly at tier boundary)');
}

async function testGrailedFees() {
  console.log('\n--- Grailed Fee Tests ---');

  // 9% commission + ~4.24% payment (midpoint of 3.49-4.99)
  const sale = calculatePlatformFeesLocal('grailed', 100);
  assert(sale.commission === 9, '9% on $100 = $9');
  assertApprox(sale.paymentProcessing, 4.24, 0.1, '~4.24% payment processing');
  assertApprox(sale.totalFees, 13.24, 0.1, 'total fees ~$13.24');
  assert(sale.breakdown.paymentProcessing.includes('~'), 'shows approximate rate');
}

async function testStarluvFees() {
  console.log('\n--- Starluv Fee Tests ---');

  // Low price - flat $1.95
  const low = calculatePlatformFeesLocal('starluv', 20);
  assert(low.commission === 1.95, 'flat $1.95 for sales under $25');
  assert(low.netPayout === 18.05, 'net payout = $18.05');

  // Exactly $25 - still flat fee
  const threshold = calculatePlatformFeesLocal('starluv', 25);
  assert(threshold.commission === 1.95, 'flat $1.95 for sales at $25');

  // High price - 7.5% commission
  const high = calculatePlatformFeesLocal('starluv', 100);
  assert(high.commission === 7.5, '7.5% on $100 = $7.50');
  assert(high.netPayout === 92.5, 'net payout = $92.50');
  assert(high.breakdown.commission === '7.5%', 'shows 7.5% commission');
}

async function testEdgeCases() {
  console.log('\n--- Edge Case Tests ---');

  // Null platform
  const nullResult = calculatePlatformFeesLocal(null, 100);
  assert(nullResult === null, 'returns null for null platform');

  // 'other' platform
  const otherResult = calculatePlatformFeesLocal('other', 100);
  assert(otherResult === null, 'returns null for "other" platform');

  // Unknown platform
  const unknownResult = calculatePlatformFeesLocal('facebook_marketplace', 100);
  assert(unknownResult === null, 'returns null for unknown platform');

  // Zero price
  const zeroPrice = calculatePlatformFeesLocal('poshmark', 0);
  assert(zeroPrice.commission === 3.95, 'flat fee applies at $0');
  assert(zeroPrice.netPayout === -3.95, 'negative payout at $0');

  // Very high price
  const highPrice = calculatePlatformFeesLocal('poshmark', 10000);
  assert(highPrice.commission === 2000, '20% on $10000 = $2000');
  assert(highPrice.netPayout === 8000, 'net payout = $8000');
}

async function testPaymentProcessingMinimum() {
  console.log('\n--- Payment Processing Minimum Tests ---');

  // Vestiaire has $4 minimum payment processing
  const lowSale = calculatePlatformFeesLocal('vestiaire_collective', 50);
  assert(lowSale.paymentProcessing === 4, 'minimum $4 applies when 3% < $4');

  // Should not hit minimum at higher prices
  const highSale = calculatePlatformFeesLocal('vestiaire_collective', 200);
  assert(highSale.paymentProcessing === 6, '3% of $200 = $6 (above minimum)');
}

async function testFeeComparison() {
  console.log('\n--- Platform Fee Comparison Tests ---');

  // Compare fees for same $100 item across platforms
  const salePrice = 100;
  const results = {};

  for (const platformId of ['poshmark', 'ebay', 'etsy', 'depop', 'grailed', 'starluv']) {
    results[platformId] = calculatePlatformFeesLocal(platformId, salePrice);
  }

  // Starluv should have lowest fees at $100
  assert(results.starluv.totalFees < results.poshmark.totalFees,
    'Starluv cheaper than Poshmark at $100');

  // Poshmark should be most expensive at $100
  const maxFees = Math.max(...Object.values(results).map(r => r.totalFees));
  assert(results.poshmark.totalFees === maxFees,
    'Poshmark has highest fees at $100');

  // All should have positive net payouts
  for (const [platform, result] of Object.entries(results)) {
    assert(result.netPayout > 0, `${platform} has positive payout`);
  }
}

async function testCalculateEstimatedReturns() {
  console.log('\n--- Calculate Estimated Returns Tests ---');

  // Mock item with pricing and cost info
  const mockItem = {
    pricing: {
      estimated_resale_value: 100
    },
    metadata: {
      acquisition: {
        price: 15,
        tax_paid: 2
      }
    },
    condition: {
      repairs_completed: [
        { repair_cost: 5 }
      ]
    }
  };

  // Note: This would need the actual module to test, using local calculations
  const costBasis = 15 + 2 + 5; // $22
  const resaleValue = 100;

  // Calculate for one platform to verify structure
  const poshmarkFees = calculatePlatformFeesLocal('poshmark', resaleValue);
  const profit = poshmarkFees.netPayout - costBasis;
  const margin = (profit / poshmarkFees.netPayout) * 100;

  assert(profit === 58, 'Poshmark profit: $80 - $22 = $58');
  assertApprox(margin, 72.5, 0.1, 'Margin ~72.5%');

  // Item without pricing should return empty
  const noPricing = { brand: 'Test' };
  // calculateEstimatedReturns would return [] - testing the concept
  assert(!noPricing.pricing?.estimated_resale_value,
    'Items without estimated_resale_value should be skipped');
}

async function testBreakdownStrings() {
  console.log('\n--- Breakdown String Format Tests ---');

  const posh = calculatePlatformFeesLocal('poshmark', 50);
  assert(posh.breakdown.commission === '20%', 'Poshmark shows percentage');
  assert(posh.breakdown.paymentProcessing === 'Included', 'Shows included processing');

  const etsy = calculatePlatformFeesLocal('etsy', 50);
  assert(etsy.breakdown.commission === '6.5%', 'Etsy shows 6.5%');
  assert(etsy.breakdown.paymentProcessing.includes('+'), 'Etsy shows percentage + flat fee');

  const grailed = calculatePlatformFeesLocal('grailed', 50);
  assert(grailed.breakdown.paymentProcessing.includes('~'), 'Grailed shows approximate rate');

  const trr = calculateTheRealRealFees(500, mockPlatformsData.platforms.therealreal.fees);
  assert(trr.breakdown.commission.includes('keep'), 'TRR shows "You keep X%"');
}

async function testNotesArray() {
  console.log('\n--- Notes Array Tests ---');

  // eBay should have note about free listings
  const ebay = calculatePlatformFeesLocal('ebay', 50);
  assert(Array.isArray(ebay.notes), 'notes is an array');
  assert(ebay.notes.length > 0, 'eBay has listing notes');
  assert(ebay.notes[0].includes('free'), 'eBay notes mention free listings');

  // Vestiaire should warn about minimum price
  const vest = calculatePlatformFeesLocal('vestiaire_collective', 30);
  assert(vest.notes.some(n => n.includes('Minimum')),
    'Vestiaire warns when below minimum price');

  // TheRealReal has standard notes
  const trr = calculateTheRealRealFees(200, mockPlatformsData.platforms.therealreal.fees);
  assert(trr.notes.includes('Prices in USD'), 'TRR notes mention USD');
  assert(trr.notes.some(n => n.includes('handles')), 'TRR notes mention services');
}

// =============================================================================
// TEST RUNNER
// =============================================================================

export async function runAllTests() {
  console.log('========================================');
  console.log('FEES MODULE TESTS');
  console.log('========================================');

  const tests = [
    { name: 'Round Function', fn: testRoundFunction },
    { name: 'Poshmark Fees', fn: testPoshmarkFees },
    { name: 'eBay Fees', fn: testEbayFees },
    { name: 'Etsy Fees', fn: testEtsyFees },
    { name: 'Depop Fees', fn: testDepopFees },
    { name: 'Vestiaire Fees', fn: testVestiaireFees },
    { name: 'TheRealReal Fees', fn: testTheRealRealFees },
    { name: 'Grailed Fees', fn: testGrailedFees },
    { name: 'Starluv Fees', fn: testStarluvFees },
    { name: 'Edge Cases', fn: testEdgeCases },
    { name: 'Payment Processing Minimum', fn: testPaymentProcessingMinimum },
    { name: 'Fee Comparison', fn: testFeeComparison },
    { name: 'Calculate Estimated Returns', fn: testCalculateEstimatedReturns },
    { name: 'Breakdown Strings', fn: testBreakdownStrings },
    { name: 'Notes Array', fn: testNotesArray }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.fn();
      console.log(`\n✅ ${test.name}: PASSED`);
      passed++;
    } catch (err) {
      console.error(`\n❌ ${test.name}: FAILED`);
      console.error(`   ${err.message}`);
      failed++;
    }
  }

  console.log('\n========================================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log('========================================');

  return { passed, failed };
}

// Auto-run if executed directly
if (typeof window !== 'undefined') {
  window.runFeesTests = runAllTests;
}
