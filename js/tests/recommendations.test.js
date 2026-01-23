/**
 * Recommendations Module Tests
 * Run in browser console after importing:
 *   import('/js/tests/recommendations.test.js').then(m => m.runAllTests())
 *
 * Or run individual tests:
 *   import('/js/tests/recommendations.test.js').then(m => m.testFlawAdjustment())
 */

import {
  getBasePriceRange,
  calculateMaterialMultiplier,
  getClothingSizeMultiplier,
  getShoeSizeMultiplier,
  getJewelrySizeMultiplier,
  getSizeMultiplier,
  calculateFlawAdjustment,
  getPlatformFitModifier,
  rankPlatformsForItem,
  calculateTrendMultiplier,
  calculateAdjustedPrice,
  calculateEnhancedResaleValue,
  generateSellingRecommendations,
  formatPlatformName
} from '../recommendations.js';

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

function logSection(name) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(50));
}

// =============================================================================
// TEST DATA HELPERS
// =============================================================================

function createTestItem(overrides = {}) {
  return {
    brand: 'Escada',
    category: {
      primary: 'clothing',
      secondary: 'blazer'
    },
    colour: {
      primary: 'black',
      secondary: null
    },
    material: {
      primary: { name: 'wool', percentage: 100 }
    },
    size: {
      label: { value: 'M' },
      measurements: {}
    },
    condition: {
      overall_condition: 'excellent',
      flaws: []
    },
    era: null,
    description: '',
    metadata: {
      acquisition: {
        price: 25.00,
        tax_paid: 2.50
      }
    },
    ...overrides
  };
}

// =============================================================================
// CLOTHING SIZE MULTIPLIER TESTS
// =============================================================================

export async function testClothingSizeMultiplier() {
  logSection('CLOTHING SIZE MULTIPLIER TESTS');

  // Premium sizes (XS, S, 0-4)
  console.log('\n Testing premium sizes...');
  const xsResult = getClothingSizeMultiplier('XS');
  assert(xsResult.multiplier > 1.0, 'XS has premium multiplier');
  assert(xsResult.tier === 'premium', 'XS tier is premium');

  const sResult = getClothingSizeMultiplier('S');
  assert(sResult.multiplier > 1.0, 'S has premium multiplier');

  const size2Result = getClothingSizeMultiplier('2');
  assert(size2Result.multiplier > 1.0, 'Size 2 has premium multiplier');

  // Standard sizes (M, L, 6-12)
  console.log('\n Testing standard sizes...');
  const mResult = getClothingSizeMultiplier('M');
  assert(mResult.multiplier === 1.0, 'M has neutral multiplier');
  assert(mResult.tier === 'standard', 'M tier is standard');

  const lResult = getClothingSizeMultiplier('L');
  assert(lResult.multiplier === 1.0, 'L has neutral multiplier');

  // Extended sizes (XL, 1X, 14-16)
  console.log('\n Testing extended sizes...');
  const xlResult = getClothingSizeMultiplier('XL');
  assert(xlResult.multiplier < 1.0, 'XL has reduced multiplier');
  assert(xlResult.tier === 'extended', 'XL tier is extended');

  // Outlier sizes (3XL+, 22+)
  console.log('\n Testing outlier sizes...');
  const xxxlResult = getClothingSizeMultiplier('3XL');
  assert(xxxlResult.multiplier < xlResult.multiplier, '3XL multiplier lower than XL');
  assert(xxxlResult.tier === 'outlier', '3XL tier is outlier');

  // Unknown size
  console.log('\n Testing unknown size...');
  const unknownResult = getClothingSizeMultiplier(null);
  assert(unknownResult.multiplier === 1.0, 'Unknown size has neutral multiplier');
  assert(unknownResult.tier === 'unknown', 'Unknown tier is unknown');

  console.log('\n✅ All CLOTHING SIZE MULTIPLIER tests passed!');
  return true;
}

// =============================================================================
// SHOE SIZE MULTIPLIER TESTS
// =============================================================================

export async function testShoeSizeMultiplier() {
  logSection('SHOE SIZE MULTIPLIER TESTS');

  // Premium sizes (7-9 with standard width)
  console.log('\n Testing premium shoe sizes...');
  const size8 = getShoeSizeMultiplier('8', 'standard');
  assert(size8.multiplier > 1.0, 'Size 8 standard has premium multiplier');
  assert(size8.tier === 'premium', 'Size 8 tier is premium');

  const size7_5 = getShoeSizeMultiplier('7.5', 'wide');
  assert(size7_5.tier === 'premium', 'Size 7.5 wide is premium');

  // Standard sizes (6-10)
  console.log('\n Testing standard shoe sizes...');
  const size6 = getShoeSizeMultiplier('6', 'standard');
  assert(size6.tier === 'standard' || size6.tier === 'premium', 'Size 6 is standard or premium');

  const size10 = getShoeSizeMultiplier('10', 'standard');
  assert(size10.multiplier >= 0.9, 'Size 10 has reasonable multiplier');

  // Narrow market sizes (outside 6-10)
  console.log('\n Testing narrow market shoe sizes...');
  const size5 = getShoeSizeMultiplier('5', 'standard');
  assert(size5.multiplier < 1.0, 'Size 5 has reduced multiplier');
  assert(size5.tier === 'narrow_market', 'Size 5 tier is narrow_market');

  const size12 = getShoeSizeMultiplier('12', 'standard');
  assert(size12.tier === 'narrow_market', 'Size 12 tier is narrow_market');

  // Unknown/invalid size
  console.log('\n Testing unknown shoe size...');
  const unknown = getShoeSizeMultiplier('abc', 'standard');
  assert(unknown.multiplier === 1.0, 'Invalid size has neutral multiplier');
  assert(unknown.tier === 'unknown', 'Invalid tier is unknown');

  console.log('\n✅ All SHOE SIZE MULTIPLIER tests passed!');
  return true;
}

// =============================================================================
// JEWELRY SIZE MULTIPLIER TESTS
// =============================================================================

export async function testJewelrySizeMultiplier() {
  logSection('JEWELRY SIZE MULTIPLIER TESTS');

  // Adjustable jewelry
  console.log('\n Testing adjustable jewelry...');
  const adjustable = getJewelrySizeMultiplier({
    jewelry_specific: { closure_type: 'adjustable_chain' }
  });
  assert(adjustable.multiplier > 1.0, 'Adjustable has premium multiplier');
  assert(adjustable.tier === 'adjustable', 'Adjustable tier correct');

  // Adjustable in description
  const descAdjustable = getJewelrySizeMultiplier({
    description: 'Beautiful adjustable bracelet',
    jewelry_specific: {}
  });
  assert(descAdjustable.tier === 'adjustable', 'Adjustable detected in description');

  // Premium ring sizes
  console.log('\n Testing ring sizes...');
  const ringSize7 = getJewelrySizeMultiplier({
    category: { secondary: 'ring' },
    size: { measurements: { ring_size: '7' } }
  });
  assert(ringSize7.multiplier > 1.0, 'Size 7 ring has premium multiplier');

  // Standard ring sizes
  const ringSize5 = getJewelrySizeMultiplier({
    category: { secondary: 'ring' },
    size: { measurements: { ring_size: '5' } }
  });
  assert(ringSize5.tier === 'ring_standard', 'Size 5 ring is standard');

  // Narrow market ring sizes
  const ringSize11 = getJewelrySizeMultiplier({
    category: { secondary: 'ring' },
    size: { measurements: { ring_size: '11' } }
  });
  assert(ringSize11.multiplier < 1.0, 'Size 11 ring has reduced multiplier');

  // Standard jewelry (no special sizing)
  console.log('\n Testing standard jewelry...');
  const standard = getJewelrySizeMultiplier({
    category: { secondary: 'brooch' }
  });
  assert(standard.multiplier === 1.0, 'Standard jewelry has neutral multiplier');

  console.log('\n✅ All JEWELRY SIZE MULTIPLIER tests passed!');
  return true;
}

// =============================================================================
// FLAW ADJUSTMENT TESTS
// =============================================================================

export async function testFlawAdjustment() {
  logSection('FLAW ADJUSTMENT TESTS');

  // No flaws
  console.log('\n Testing no flaws...');
  const noFlaws = calculateFlawAdjustment([]);
  assert(noFlaws.adjustment === 0, 'No flaws = no adjustment');
  assert(noFlaws.details.length === 0, 'No flaw details');

  const nullFlaws = calculateFlawAdjustment(null);
  assert(nullFlaws.adjustment === 0, 'Null flaws = no adjustment');

  // Minor flaw
  console.log('\n Testing minor flaw...');
  const minorFlaw = calculateFlawAdjustment([
    { flaw_type: 'light_wear', severity: 'minor' }
  ]);
  assert(minorFlaw.adjustment < 0, 'Minor flaw has negative adjustment');
  assert(minorFlaw.adjustment >= -0.05, 'Minor flaw adjustment is small');
  assert(minorFlaw.details.length === 1, 'One flaw detail');

  // Moderate flaw
  console.log('\n Testing moderate flaw...');
  const moderateFlaw = calculateFlawAdjustment([
    { flaw_type: 'stain', severity: 'moderate' }
  ]);
  assert(moderateFlaw.adjustment < minorFlaw.adjustment, 'Moderate worse than minor');

  // Major flaw
  console.log('\n Testing major flaw...');
  const majorFlaw = calculateFlawAdjustment([
    { flaw_type: 'tear', severity: 'major' }
  ]);
  assert(majorFlaw.adjustment < moderateFlaw.adjustment, 'Major worse than moderate');

  // Flaw affecting wearability
  console.log('\n Testing flaw affecting wearability...');
  const wearabilityFlaw = calculateFlawAdjustment([
    { flaw_type: 'broken_zipper', severity: 'moderate', affects_wearability: true }
  ]);
  assert(wearabilityFlaw.adjustment < moderateFlaw.adjustment, 'Wearability impact adds penalty');

  // Repairable flaw
  console.log('\n Testing repairable flaw...');
  const repairableFlaw = calculateFlawAdjustment([
    { flaw_type: 'loose_button', severity: 'minor', repairable: true }
  ]);
  assert(Math.abs(repairableFlaw.adjustment) < Math.abs(minorFlaw.adjustment), 'Repairable reduces penalty');

  // Multiple flaws
  console.log('\n Testing multiple flaws...');
  const multipleFlaws = calculateFlawAdjustment([
    { flaw_type: 'light_wear', severity: 'minor' },
    { flaw_type: 'small_stain', severity: 'minor' },
    { flaw_type: 'pilling', severity: 'minor' }
  ]);
  assert(multipleFlaws.adjustment < minorFlaw.adjustment, 'Multiple flaws compound');
  assert(multipleFlaws.details.length === 3, 'Three flaw details');

  // Penalty cap
  console.log('\n Testing penalty cap...');
  const manyFlaws = calculateFlawAdjustment([
    { flaw_type: 'tear', severity: 'major' },
    { flaw_type: 'stain', severity: 'major' },
    { flaw_type: 'odor', severity: 'major', affects_wearability: true }
  ]);
  assert(manyFlaws.adjustment >= -0.30, 'Penalty capped at max');

  console.log('\n✅ All FLAW ADJUSTMENT tests passed!');
  return true;
}

// =============================================================================
// PLATFORM FIT MODIFIER TESTS
// =============================================================================

export async function testPlatformFitModifier() {
  logSection('PLATFORM FIT MODIFIER TESTS');

  // Unknown platform
  console.log('\n Testing unknown platform...');
  const unknown = getPlatformFitModifier(
    createTestItem(),
    'unknown_platform',
    { material: { multiplier: 1.0, tier: 'medium' }, size: { multiplier: 1.0, tier: 'standard' } }
  );
  assert(unknown.modifier === 1.0, 'Unknown platform = neutral modifier');
  assert(unknown.adjustments.length === 0, 'No adjustments for unknown platform');

  // Poshmark with small sizes
  console.log('\n Testing Poshmark with small size...');
  const poshmarkSmall = getPlatformFitModifier(
    createTestItem(),
    'poshmark',
    { material: { multiplier: 1.0, tier: 'medium' }, size: { multiplier: 1.1, tier: 'premium' } }
  );
  // Poshmark may have size adjustments
  assert(typeof poshmarkSmall.modifier === 'number', 'Poshmark returns numeric modifier');

  // Depop with trendy items
  console.log('\n Testing Depop...');
  const depop = getPlatformFitModifier(
    createTestItem(),
    'depop',
    { material: { multiplier: 0.8, tier: 'low' }, size: { multiplier: 1.0, tier: 'standard' } }
  );
  assert(typeof depop.modifier === 'number', 'Depop returns numeric modifier');

  // Vestiaire with premium materials
  console.log('\n Testing Vestiaire with premium material...');
  const vestiaire = getPlatformFitModifier(
    createTestItem(),
    'vestiaire_collective',
    { material: { multiplier: 1.4, tier: 'highest' }, size: { multiplier: 1.0, tier: 'standard' } }
  );
  assert(typeof vestiaire.modifier === 'number', 'Vestiaire returns numeric modifier');

  console.log('\n✅ All PLATFORM FIT MODIFIER tests passed!');
  return true;
}

// =============================================================================
// PLATFORM RANKING TESTS
// =============================================================================

export async function testPlatformRanking() {
  logSection('PLATFORM RANKING TESTS');

  // Luxury item
  console.log('\n Testing luxury item ranking...');
  const luxuryItem = createTestItem({ brand: 'Chanel' });
  const luxuryRanking = rankPlatformsForItem(luxuryItem, 500, 4.5);
  assert(Array.isArray(luxuryRanking), 'Returns array of platforms');
  assert(luxuryRanking.length > 0, 'At least one platform recommended');
  assert(luxuryRanking.some(p => p.platformId === 'vestiaire_collective' || p.platformId === 'therealreal'),
    'Luxury platforms recommended for luxury item');

  // Vintage item
  console.log('\n Testing vintage item ranking...');
  const vintageItem = createTestItem({ era: '1970s' });
  const vintageRanking = rankPlatformsForItem(vintageItem, 75, 2.0);
  assert(vintageRanking.some(p => p.platformId === 'etsy' || p.platformId === 'ebay'),
    'Vintage platforms recommended');

  // Jewelry item
  console.log('\n Testing jewelry item ranking...');
  const jewelryItem = createTestItem({
    category: { primary: 'jewelry', secondary: 'necklace' }
  });
  const jewelryRanking = rankPlatformsForItem(jewelryItem, 100, 2.0);
  assert(jewelryRanking.some(p => p.platformId === 'etsy' || p.platformId === 'ebay'),
    'Jewelry platforms recommended');

  // Budget item
  console.log('\n Testing budget item ranking...');
  const budgetItem = createTestItem({ brand: 'H&M' });
  const budgetRanking = rankPlatformsForItem(budgetItem, 25, 1.0);
  assert(budgetRanking.some(p => p.platformId === 'poshmark' || p.platformId === 'depop'),
    'Budget platforms recommended');

  // High-value item
  console.log('\n Testing high-value item ranking...');
  const highValueItem = createTestItem({ brand: 'Hermes' });
  const highValueRanking = rankPlatformsForItem(highValueItem, 800, 5.0);
  assert(highValueRanking[0].score > 0, 'Top platform has positive score');

  // Reasons included
  console.log('\n Testing reasons included...');
  assert(luxuryRanking[0].reasons.length > 0, 'Reasons provided for recommendations');

  console.log('\n✅ All PLATFORM RANKING tests passed!');
  return true;
}

// =============================================================================
// BASE PRICE RANGE TESTS
// =============================================================================

export async function testBasePriceRange() {
  logSection('BASE PRICE RANGE TESTS');

  // Clothing item
  console.log('\n Testing clothing base price range...');
  const dressItem = createTestItem({
    category: { primary: 'clothing', secondary: 'dress' }
  });
  const dressRange = await getBasePriceRange(dressItem);
  if (dressRange) {
    assert(dressRange.min > 0, 'Dress has positive min price');
    assert(dressRange.max > dressRange.min, 'Dress max > min');
    assert(dressRange.category === 'dress', 'Dress category correct');
  }

  // Shoes item
  console.log('\n Testing shoes base price range...');
  const shoesItem = createTestItem({
    category: { primary: 'shoes', secondary: 'heels' }
  });
  const shoesRange = await getBasePriceRange(shoesItem);
  if (shoesRange) {
    assert(shoesRange.category === 'shoes', 'Shoes category correct');
  }

  // Jewelry item
  console.log('\n Testing jewelry base price range...');
  const jewelryItem = createTestItem({
    category: { primary: 'jewelry', secondary: 'necklace' },
    jewelry_specific: { metal_type: 'sterling_silver' }
  });
  const jewelryRange = await getBasePriceRange(jewelryItem);
  assert(jewelryRange !== null, 'Jewelry has price range');
  assert(jewelryRange.category.includes('jewelry'), 'Jewelry category detected');

  // Gold jewelry
  console.log('\n Testing gold jewelry range...');
  const goldItem = createTestItem({
    category: { primary: 'jewelry', secondary: 'bracelet' },
    jewelry_specific: { metal_type: '14k gold' }
  });
  const goldRange = await getBasePriceRange(goldItem);
  assert(goldRange !== null, 'Gold jewelry has price range');
  assert(goldRange.min > jewelryRange.min, 'Gold has higher min than silver');

  console.log('\n✅ All BASE PRICE RANGE tests passed!');
  return true;
}

// =============================================================================
// MATERIAL MULTIPLIER TESTS
// =============================================================================

export async function testMaterialMultiplier() {
  logSection('MATERIAL MULTIPLIER TESTS');

  // Single high-value material
  console.log('\n Testing high-value material (silk)...');
  const silkItem = createTestItem({
    material: { primary: { name: 'silk', percentage: 100 } }
  });
  const silkResult = await calculateMaterialMultiplier(silkItem);
  assert(silkResult.multiplier > 1.0, 'Silk has positive multiplier');
  assert(['high', 'highest'].includes(silkResult.tier), 'Silk is high tier');

  // Single low-value material
  console.log('\n Testing low-value material (polyester)...');
  const polyItem = createTestItem({
    material: { primary: { name: 'polyester', percentage: 100 } }
  });
  const polyResult = await calculateMaterialMultiplier(polyItem);
  assert(polyResult.multiplier < 1.0, 'Polyester has reduced multiplier');

  // Mixed materials
  console.log('\n Testing mixed materials...');
  const mixedItem = createTestItem({
    material: {
      primary: { name: 'wool', percentage: 70 },
      secondary: [{ name: 'cashmere', percentage: 30 }]
    }
  });
  const mixedResult = await calculateMaterialMultiplier(mixedItem);
  assert(mixedResult.breakdown.length === 2, 'Two materials in breakdown');
  assert(mixedResult.multiplier > 1.0, 'Quality mix has positive multiplier');

  // No material
  console.log('\n Testing no material...');
  const noMaterialItem = createTestItem({ material: {} });
  const noMaterialResult = await calculateMaterialMultiplier(noMaterialItem);
  assert(noMaterialResult.multiplier === 1.0, 'No material = neutral multiplier');
  assert(noMaterialResult.tier === 'unknown', 'Unknown tier for no material');

  console.log('\n✅ All MATERIAL MULTIPLIER tests passed!');
  return true;
}

// =============================================================================
// ENHANCED RESALE VALUE TESTS
// =============================================================================

export async function testEnhancedResaleValue() {
  logSection('ENHANCED RESALE VALUE TESTS');

  // Standard item
  console.log('\n Testing standard item resale value...');
  const item = createTestItem({
    condition: { overall_condition: 'excellent' }
  });
  const result = await calculateEnhancedResaleValue(item);

  if (result) {
    assert(result.value > 0, 'Resale value is positive');
    assert(result.range.min > 0, 'Range min is positive');
    assert(result.range.max >= result.range.min, 'Range max >= min');
    assert(result.breakdown.conditionFactor > 0, 'Condition factor present');
    assert(result.breakdown.brandMultiplier > 0, 'Brand multiplier present');
  }

  // With comp price
  console.log('\n Testing with comp price...');
  const compResult = await calculateEnhancedResaleValue(item, 150);
  assert(compResult !== null, 'Comp price result not null');
  assert(compResult.breakdown.baseSource === 'comp_price', 'Base source is comp_price');
  assert(compResult.breakdown.base === 150, 'Base matches comp price');

  // Poor condition
  console.log('\n Testing poor condition impact...');
  const poorItem = createTestItem({
    condition: { overall_condition: 'fair' }
  });
  const poorResult = await calculateEnhancedResaleValue(poorItem);
  if (poorResult && result) {
    assert(poorResult.breakdown.conditionFactor < result.breakdown.conditionFactor,
      'Poor condition has lower factor');
  }

  // Vintage era bonus
  console.log('\n Testing era bonus...');
  const vintageItem = createTestItem({ era: '1970s' });
  const vintageResult = await calculateEnhancedResaleValue(vintageItem);
  if (vintageResult) {
    assert(vintageResult.breakdown.eraBonus >= 1.0, 'Vintage has era bonus');
  }

  console.log('\n✅ All ENHANCED RESALE VALUE tests passed!');
  return true;
}

// =============================================================================
// FULL RECOMMENDATION TESTS
// =============================================================================

export async function testFullRecommendations() {
  logSection('FULL RECOMMENDATION TESTS');

  // Standard item
  console.log('\n Testing full recommendations for standard item...');
  const item = createTestItem({
    brand: 'Escada',
    category: { primary: 'clothing', secondary: 'blazer' },
    condition: { overall_condition: 'excellent' },
    metadata: { acquisition: { price: 25.00, tax_paid: 2.50 } }
  });

  const result = await generateSellingRecommendations(item);

  if (result) {
    assert(result.suggestedPrice > 0, 'Has suggested price');
    assert(result.priceRange.min > 0, 'Has price range min');
    assert(result.priceRange.max >= result.priceRange.min, 'Range max >= min');
    assert(Array.isArray(result.recommendedPlatforms), 'Has recommended platforms');
    assert(result.recommendedPlatforms.length > 0, 'At least one platform');

    // Check platform data
    const topPlatform = result.recommendedPlatforms[0];
    assert(topPlatform.platformId, 'Platform has ID');
    assert(typeof topPlatform.score === 'number', 'Platform has score');
    assert(typeof topPlatform.netPayout === 'number', 'Platform has net payout');
    assert(typeof topPlatform.profit === 'number', 'Platform has profit');

    // Check profit estimate
    if (result.profitEstimate) {
      assert(result.profitEstimate.platformId, 'Profit estimate has platform');
      assert(typeof result.profitEstimate.profit === 'number', 'Profit is numeric');
    }
  }

  // With comp price
  console.log('\n Testing recommendations with comp price...');
  const compResult = await generateSellingRecommendations(item, 200);
  if (compResult) {
    assert(compResult.priceBreakdown.baseSource === 'comp_price', 'Uses comp price as base');
  }

  console.log('\n✅ All FULL RECOMMENDATION tests passed!');
  return true;
}

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

export async function testUtilityFunctions() {
  logSection('UTILITY FUNCTION TESTS');

  // Format platform name
  console.log('\n Testing formatPlatformName...');
  assert(formatPlatformName('poshmark') === 'Poshmark', 'Poshmark formatted');
  assert(formatPlatformName('ebay') === 'eBay', 'eBay formatted');
  assert(formatPlatformName('vestiaire_collective') === 'Vestiaire', 'Vestiaire formatted');
  assert(formatPlatformName('therealreal') === 'TheRealReal', 'TheRealReal formatted');
  assert(formatPlatformName('unknown') === 'unknown', 'Unknown returned as-is');

  console.log('\n✅ All UTILITY FUNCTION tests passed!');
  return true;
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

export async function runAllTests() {
  console.log('\n🧪 RECOMMENDATIONS MODULE TEST SUITE\n');
  console.log('Testing pricing, multipliers, platform ranking, and recommendations...\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'Clothing Size Multiplier', fn: testClothingSizeMultiplier },
    { name: 'Shoe Size Multiplier', fn: testShoeSizeMultiplier },
    { name: 'Jewelry Size Multiplier', fn: testJewelrySizeMultiplier },
    { name: 'Flaw Adjustment', fn: testFlawAdjustment },
    { name: 'Platform Fit Modifier', fn: testPlatformFitModifier },
    { name: 'Platform Ranking', fn: testPlatformRanking },
    { name: 'Base Price Range', fn: testBasePriceRange },
    { name: 'Material Multiplier', fn: testMaterialMultiplier },
    { name: 'Enhanced Resale Value', fn: testEnhancedResaleValue },
    { name: 'Full Recommendations', fn: testFullRecommendations },
    { name: 'Utility Functions', fn: testUtilityFunctions }
  ];

  for (const test of tests) {
    try {
      await test.fn();
      passed++;
    } catch (err) {
      console.error(`❌ ${test.name} tests failed:`, err.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`  TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return { passed, failed };
}

// Export for window access if needed
if (typeof window !== 'undefined') {
  window.recommendationsTests = {
    runAllTests,
    testClothingSizeMultiplier,
    testShoeSizeMultiplier,
    testJewelrySizeMultiplier,
    testFlawAdjustment,
    testPlatformFitModifier,
    testPlatformRanking,
    testBasePriceRange,
    testMaterialMultiplier,
    testEnhancedResaleValue,
    testFullRecommendations,
    testUtilityFunctions
  };
}
