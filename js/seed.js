// =============================================================================
// SEED DATA - Run once to populate mock data
// =============================================================================

import { createInventoryItem, createVisit } from './db.js';

const MOCK_ITEMS = [
  {
    title: 'Vintage Pendleton wool blazer',
    category: 'clothing',
    subcategory: 'jacket',
    brand: 'Pendleton',
    era: '1970s',
    store_id: 'vv_victoria',
    acquisition_date: '2026-01-05',
    purchase_price: 18.99,
    tax_paid: 2.47,
    labeled_size: '40R',
    modern_size_equivalent: 'M',
    measurements: { bust_inches: 42, shoulder_width_inches: 18, sleeve_length_inches: 24, length_inches: 30 },
    primary_material: 'Wool',
    material_verified: true,
    material_notes: 'Heavy virgin wool, excellent quality',
    overall_condition: 'excellent',
    condition_notes: 'Minor wear on cuffs, easily repairable',
    flaws: [{ type: 'pilling', severity: 'minor', location: 'cuffs', repairable: true }],
    intent: 'resale',
    resale_platform_target: ['ebay', 'poshmark'],
    estimated_resale_value: 85,
    minimum_acceptable_price: 55,
    brand_premium_multiplier: 1.5,
    status: 'photographed',
    description: 'Classic 1970s Pendleton wool blazer in forest green. Union label present. Made in USA.'
  },
  {
    title: 'Sterling silver Art Deco brooch',
    category: 'jewelry',
    subcategory: 'brooch',
    brand: null,
    era: '1930s',
    store_id: 'sa_mount_pleasant',
    acquisition_date: '2026-01-03',
    purchase_price: 4.99,
    tax_paid: 0.65,
    primary_material: 'Sterling silver',
    material_verified: true,
    material_notes: 'Tested with acid, confirmed .925',
    metal_type: 'sterling_silver',
    closure_type: 'brooch_pin',
    hallmarks: '925, unclear maker mark',
    stones: 'Marcasite accents',
    tested_with: ['magnet', 'loupe_10x', 'acid_test'],
    overall_condition: 'very_good',
    condition_notes: 'Light tarnish, cleaned up nicely',
    flaws: [{ type: 'tarnish', severity: 'minor', location: 'back', repairable: true }],
    intent: 'resale',
    resale_platform_target: ['etsy', 'ebay'],
    estimated_resale_value: 65,
    minimum_acceptable_price: 40,
    status: 'listed',
    description: 'Beautiful Art Deco geometric brooch with marcasite details. Sterling silver.'
  },
  {
    title: 'Ferragamo leather pumps',
    category: 'shoes',
    subcategory: 'pumps',
    brand: 'Salvatore Ferragamo',
    era: '1990s',
    store_id: 'vv_burnaby',
    acquisition_date: '2026-01-07',
    purchase_price: 12.99,
    tax_paid: 1.69,
    labeled_size: '7.5B',
    modern_size_equivalent: '7.5',
    measurements: { insole_length_cm: 25.5, heel_height_inches: 2.5 },
    width: 'standard',
    primary_material: 'Leather',
    material_verified: true,
    overall_condition: 'good',
    condition_notes: 'Some sole wear, heels in good shape',
    flaws: [
      { type: 'sole_wear', severity: 'moderate', location: 'ball of foot', repairable: true },
      { type: 'scuffs', severity: 'minor', location: 'toe', repairable: true }
    ],
    intent: 'resale',
    resale_platform_target: ['poshmark', 'ebay'],
    estimated_resale_value: 75,
    minimum_acceptable_price: 45,
    brand_premium_multiplier: 2.0,
    status: 'unlisted',
    description: 'Classic Ferragamo pumps in black leather. Made in Italy. Minor wear.'
  },
  {
    title: 'Silk scarf with equestrian print',
    category: 'accessories',
    subcategory: 'scarf',
    brand: null,
    era: '1980s',
    store_id: 'vv_coquitlam_barnet',
    acquisition_date: '2026-01-02',
    purchase_price: 3.99,
    tax_paid: 0.52,
    primary_material: 'Silk',
    material_verified: false,
    material_notes: 'Hand roll edges, feels like silk but no label',
    overall_condition: 'excellent',
    intent: 'personal_keep',
    status: 'kept',
    description: 'Beautiful equestrian print silk scarf. Rich jewel tones. Hand-rolled edges.'
  },
  {
    title: '14K gold rope chain necklace',
    category: 'jewelry',
    subcategory: 'necklace',
    brand: null,
    era: '1980s',
    store_id: 'mcc_vancouver',
    acquisition_date: '2026-01-08',
    purchase_price: 8.99,
    tax_paid: 1.17,
    primary_material: '14K Gold',
    material_verified: true,
    material_notes: 'Tested positive for 14K, weighs 4.2g',
    metal_type: 'gold_14k',
    closure_type: 'lobster_claw',
    hallmarks: '14K, Italy',
    tested_with: ['magnet', 'loupe_10x', 'acid_test', 'weight_comparison'],
    measurements: { chain_length_inches: 18, weight_grams: 4.2 },
    overall_condition: 'like_new',
    intent: 'resale',
    resale_platform_target: ['ebay'],
    estimated_resale_value: 180,
    minimum_acceptable_price: 150,
    status: 'listed',
    description: 'Solid 14K gold rope chain, 18 inches. Italian made. Excellent condition.'
  }
];

// Visits match inventory: total_spent = purchase_price + tax_paid for items on that date/store
const MOCK_VISITS = [
  {
    store_id: 'vv_victoria',
    date: '2026-01-05',
    purchases_count: 1,
    total_spent: 21.46, // Pendleton blazer: 18.99 + 2.47
    notes: 'Great finds today. Wool section was well stocked. Found the Pendleton blazer.'
  },
  {
    store_id: 'sa_mount_pleasant',
    date: '2026-01-03',
    purchases_count: 1,
    total_spent: 5.64, // Sterling brooch: 4.99 + 0.65
    notes: 'Jewelry case had some good pieces. Sterling brooch was a steal.'
  },
  {
    store_id: 'vv_burnaby',
    date: '2026-01-07',
    purchases_count: 1,
    total_spent: 14.68, // Ferragamo pumps: 12.99 + 1.69
    notes: 'Shoe section picked over but found the Ferragamos hidden in the back.'
  },
  {
    store_id: 'vv_coquitlam_barnet',
    date: '2026-01-02',
    purchases_count: 1,
    total_spent: 4.51, // Silk scarf: 3.99 + 0.52
    notes: 'First visit of the year. Accessories well organized. Good silk scarf selection.'
  },
  {
    store_id: 'mcc_vancouver',
    date: '2026-01-08',
    purchases_count: 1,
    total_spent: 10.16, // 14K gold chain: 8.99 + 1.17
    notes: 'Lucky find - 14K gold chain was priced as costume jewelry!'
  }
];

export async function seedDatabase() {
  console.log('Seeding database with mock data...');

  let itemCount = 0;
  let visitCount = 0;

  for (const item of MOCK_ITEMS) {
    try {
      await createInventoryItem(item);
      itemCount++;
      console.log(`Created item: ${item.title}`);
    } catch (err) {
      console.error(`Failed to create item: ${item.title}`, err);
    }
  }

  for (const visit of MOCK_VISITS) {
    try {
      await createVisit(visit);
      visitCount++;
      console.log(`Created visit: ${visit.store_id} on ${visit.date}`);
    } catch (err) {
      console.error(`Failed to create visit: ${visit.store_id}`, err);
    }
  }

  console.log(`Seeding complete: ${itemCount} items, ${visitCount} visits`);
  return { itemCount, visitCount };
}

// Manual seeding only - call seedDatabase() from console or UI button
