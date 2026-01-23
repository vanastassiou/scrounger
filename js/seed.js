// =============================================================================
// SEED DATA MODULE
// =============================================================================
// Generates realistic test data for development and testing.

import {
  createInventoryItem,
  createTrip,
  createExpense,
  createUserStore,
  upsertBrandKnowledge,
  clearAllData
} from './db.js';
import { showToast } from './ui.js';

// =============================================================================
// TEST DATA DEFINITIONS
// =============================================================================

const STORES = [
  {
    name: 'Value Village - Langley',
    chain: 'value_village',
    tier: 'A',
    address: '20202 66 Ave, Langley, BC',
    notes: 'Good selection of vintage, restock Tuesdays'
  },
  {
    name: 'Salvation Army - Surrey',
    chain: 'salvation_army',
    tier: 'B',
    address: '10776 King George Blvd, Surrey, BC',
    notes: 'Large store, inconsistent quality'
  },
  {
    name: 'MCC Thrift - Abbotsford',
    chain: 'mcc',
    tier: 'A',
    address: '33324 S Fraser Way, Abbotsford, BC',
    notes: 'Best prices, great designer finds'
  }
];

const BRANDS = [
  { name: 'Escada', tier: 'premium' },
  { name: 'St. John', tier: 'premium' },
  { name: 'Pendleton', tier: 'heritage' },
  { name: 'Burberry', tier: 'luxury' },
  { name: 'Coach', tier: 'mid' },
  { name: 'Ralph Lauren', tier: 'mid' },
  { name: 'Banana Republic', tier: 'contemporary' },
  { name: 'J. Crew', tier: 'contemporary' },
  { name: 'Roots', tier: 'heritage' },
  { name: 'Aritzia', tier: 'contemporary' }
];

const COLOURS = ['black', 'navy', 'cream', 'red', 'burgundy', 'camel', 'grey', 'white', 'green', 'brown'];
const CONDITIONS = ['excellent', 'good', 'fair'];
const MATERIALS_CLOTHING = ['wool', 'silk', 'cashmere', 'cotton', 'linen', 'polyester'];
const MATERIALS_SHOES = ['leather', 'suede', 'patent_leather'];
const MATERIALS_JEWELRY = ['gold', 'silver', 'gold_plated'];

const CLOTHING_TYPES = ['blazer', 'coat', 'dress', 'blouse', 'skirt', 'pants', 'sweater', 'cardigan'];
const SHOE_TYPES = ['heels', 'boots', 'flats', 'loafers', 'sandals'];
const JEWELRY_TYPES = ['necklace', 'bracelet', 'earrings', 'brooch', 'ring'];
const ACCESSORY_TYPES = ['handbag', 'scarf', 'belt', 'wallet'];

const SIZES_CLOTHING = ['XS', 'S', 'M', 'L', 'XL', '2', '4', '6', '8', '10', '12'];
const SIZES_SHOES = ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'];

const STATUSES = [
  'in_collection', 'in_collection', 'in_collection', 'in_collection', // 40%
  'needs_photo', 'needs_photo', // 10%
  'unlisted', 'unlisted', // 10%
  'listed', 'listed', 'listed', // 15%
  'shipped', 'shipped', // 10%
  'sold', 'sold', 'sold' // 15%
];

const PLATFORMS = ['ebay', 'poshmark'];
const EXPENSE_CATEGORIES = ['fuel', 'packaging', 'shipping_supplies', 'platform_fees', 'other'];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPrice(min, max) {
  return Math.round(randomInt(min * 100, max * 100)) / 100;
}

function generateDate(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
}

function generateItemData(storeId, tripId, index) {
  // Weighted category selection: clothing 60%, shoes 25%, jewelry 10%, accessories 5%
  const categoryRoll = Math.random();
  let category, subcategory, materials, sizes;

  if (categoryRoll < 0.60) {
    category = 'clothing';
    subcategory = randomElement(CLOTHING_TYPES);
    materials = MATERIALS_CLOTHING;
    sizes = SIZES_CLOTHING;
  } else if (categoryRoll < 0.85) {
    category = 'shoes';
    subcategory = randomElement(SHOE_TYPES);
    materials = MATERIALS_SHOES;
    sizes = SIZES_SHOES;
  } else if (categoryRoll < 0.95) {
    category = 'jewelry';
    subcategory = randomElement(JEWELRY_TYPES);
    materials = MATERIALS_JEWELRY;
    sizes = null;
  } else {
    category = 'accessories';
    subcategory = randomElement(ACCESSORY_TYPES);
    materials = MATERIALS_CLOTHING;
    sizes = null;
  }

  const brand = randomElement(BRANDS);
  const status = randomElement(STATUSES);
  const purchasePrice = randomPrice(5, 35);
  const estimatedValue = purchasePrice * randomInt(3, 8);
  const daysAgo = randomInt(1, 90);
  const acquisitionDate = generateDate(daysAgo);

  const item = {
    brand: brand.name,
    category: {
      primary: category,
      secondary: subcategory
    },
    colour: {
      primary: randomElement(COLOURS),
      secondary: Math.random() > 0.7 ? randomElement(COLOURS) : null
    },
    material: {
      primary: randomElement(materials),
      secondary: null
    },
    size: sizes ? {
      label: {
        gender: category === 'shoes' ? 'women' : null,
        value: randomElement(sizes)
      },
      measurements: null
    } : null,
    era: Math.random() > 0.5 ? `${randomInt(1980, 2020)}s` : null,
    condition: {
      overall_condition: randomElement(CONDITIONS),
      flaws: null,
      repairs_completed: null,
      repairs_needed: null,
      condition_notes: null
    },
    pricing: {
      estimated_resale_value: estimatedValue,
      minimum_acceptable_price: estimatedValue * 0.6,
      brand_premium_multiplier: null
    },
    metadata: {
      acquisition: {
        date: acquisitionDate,
        price: purchasePrice,
        store_id: storeId,
        trip_id: tripId,
        packaging: null
      },
      status: status
    }
  };

  // Add listing data for items in pipeline
  if (['listed', 'shipped', 'sold'].includes(status)) {
    const listedPrice = estimatedValue * randomInt(80, 120) / 100;
    const platform = randomElement(PLATFORMS);
    item.listing_status = {
      list_platform: platform,
      list_date: generateDate(daysAgo - randomInt(1, 14)),
      listed_price: listedPrice,
      listing_url: null
    };

    if (status === 'shipped' || status === 'sold') {
      const soldPrice = listedPrice * randomInt(85, 100) / 100;
      const fees = soldPrice * (platform === 'ebay' ? 0.13 : 0.20);
      item.listing_status.sold_date = generateDate(daysAgo - randomInt(1, 7));
      item.listing_status.sold_price = soldPrice;
      item.listing_status.sold_platform = platform;
      item.listing_status.platform_fees = Math.round(fees * 100) / 100;
      item.listing_status.shipping_cost = randomPrice(8, 18);
    }
  }

  return item;
}

// =============================================================================
// SEED FUNCTIONS
// =============================================================================

/**
 * Seed the database with test data.
 * Creates stores, trips, items, expenses, and knowledge entries.
 */
export async function seedDatabase() {
  console.log('Starting database seed...');

  try {
    // 1. Create stores
    console.log('Creating stores...');
    const createdStores = [];
    for (const storeData of STORES) {
      const store = await createUserStore(storeData);
      createdStores.push(store);
    }
    console.log(`Created ${createdStores.length} stores`);

    // 2. Create trips (10 trips over last 60 days)
    console.log('Creating trips...');
    const createdTrips = [];
    for (let i = 0; i < 10; i++) {
      const daysAgo = randomInt(1, 60);
      const store = randomElement(createdStores);
      const tripData = {
        date: generateDate(daysAgo),
        stores: [{
          storeId: store.id,
          storeName: store.name,
          arrived: `${randomInt(9, 14)}:${randomInt(0, 5)}0`,
          departed: `${randomInt(10, 16)}:${randomInt(0, 5)}0`
        }],
        notes: Math.random() > 0.7 ? 'Good finds today' : null
      };
      const trip = await createTrip(tripData);
      createdTrips.push({ ...trip, storeId: store.id });
    }
    console.log(`Created ${createdTrips.length} trips`);

    // 3. Create inventory items (48 items)
    console.log('Creating inventory items...');
    let itemCount = 0;
    for (let i = 0; i < 48; i++) {
      // Link about half the items to trips
      const trip = Math.random() > 0.5 ? randomElement(createdTrips) : null;
      const store = trip ? createdStores.find(s => s.id === trip.storeId) : randomElement(createdStores);

      const itemData = generateItemData(store.id, trip?.id, i);
      await createInventoryItem(itemData);
      itemCount++;
    }
    console.log(`Created ${itemCount} inventory items`);

    // 4. Create expenses (20 expenses)
    console.log('Creating expenses...');
    let expenseCount = 0;
    for (let i = 0; i < 20; i++) {
      const trip = Math.random() > 0.5 ? randomElement(createdTrips) : null;
      const category = randomElement(EXPENSE_CATEGORIES);

      let amount;
      switch (category) {
        case 'fuel': amount = randomPrice(20, 60); break;
        case 'packaging': amount = randomPrice(5, 25); break;
        case 'shipping_supplies': amount = randomPrice(10, 40); break;
        case 'platform_fees': amount = randomPrice(5, 30); break;
        default: amount = randomPrice(5, 20);
      }

      const expenseData = {
        date: generateDate(randomInt(1, 60)),
        category: category,
        amount: amount,
        tripId: trip?.id || null,
        notes: Math.random() > 0.8 ? `${category} expense` : null
      };
      await createExpense(expenseData);
      expenseCount++;
    }
    console.log(`Created ${expenseCount} expenses`);

    // 5. Create knowledge entries (5 brand entries)
    console.log('Creating knowledge entries...');
    const knowledgeEntries = [
      {
        key: 'escada',
        data: {
          name: 'Escada',
          notes: 'Margaretha Ley era (pre-1992) most valuable. Look for quality silk prints and structured blazers.',
          priceRange: { low: 40, high: 200 },
          tips: ['Check label for era dating', 'Silk pieces command premium']
        }
      },
      {
        key: 'st-john',
        data: {
          name: 'St. John',
          notes: 'Santana knit pieces most valuable. Check for moth damage carefully.',
          priceRange: { low: 30, high: 150 },
          tips: ['Santana knit is the premium line', 'Inspect seams for pulls']
        }
      },
      {
        key: 'pendleton',
        data: {
          name: 'Pendleton',
          notes: 'Made in USA labels command premium. Wool blanket shirts from 70s-90s sought after.',
          priceRange: { low: 25, high: 100 },
          tips: ['Vintage tags = higher value', 'Board shirts very collectible']
        }
      },
      {
        key: 'burberry',
        data: {
          name: 'Burberry',
          notes: 'Look for "Burberrys" (with S) for vintage. Nova check lining authenticates.',
          priceRange: { low: 50, high: 400 },
          tips: ['Check stitching quality', 'Trench coats always sell']
        }
      },
      {
        key: 'roots',
        data: {
          name: 'Roots',
          notes: 'Canadian heritage brand. Leather goods and vintage sweatshirts popular.',
          priceRange: { low: 15, high: 80 },
          tips: ['Made in Canada = premium', 'Olympic editions collectible']
        }
      }
    ];

    for (const entry of knowledgeEntries) {
      await upsertBrandKnowledge(entry.key, entry.data);
    }
    console.log(`Created ${knowledgeEntries.length} knowledge entries`);

    console.log('Database seed complete!');
    showToast(`Seeded: ${createdStores.length} stores, ${createdTrips.length} trips, ${itemCount} items`);

    return {
      stores: createdStores.length,
      trips: createdTrips.length,
      items: itemCount,
      expenses: expenseCount,
      knowledge: knowledgeEntries.length
    };
  } catch (err) {
    console.error('Seed failed:', err);
    showToast('Seed failed: ' + err.message);
    throw err;
  }
}

/**
 * Clear all seed data (clears entire database).
 */
export async function clearSeedData() {
  console.log('Clearing all data...');
  try {
    await clearAllData();
    console.log('All data cleared');
    showToast('All data cleared');
    return { success: true };
  } catch (err) {
    console.error('Clear failed:', err);
    showToast('Clear failed: ' + err.message);
    throw err;
  }
}

// =============================================================================
// REGISTER ON WINDOW FOR DEV TOOLS
// =============================================================================

if (typeof window !== 'undefined') {
  window.seedDatabase = seedDatabase;
  window.clearSeedData = clearSeedData;
  window.clearAllData = clearSeedData; // Alias for compatibility with CLAUDE.md docs
}
