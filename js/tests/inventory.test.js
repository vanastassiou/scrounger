/**
 * Inventory Module Tests
 * Run in browser console after importing:
 *   import('/js/tests/inventory.test.js').then(m => m.runAllTests())
 *
 * Or run individual tests:
 *   import('/js/tests/inventory.test.js').then(m => m.testInventoryCRUD())
 */

import {
  createInventoryItem,
  getInventoryItem,
  getAllInventory,
  updateInventoryItem,
  deleteInventoryItem,
  getInventoryByCategory,
  getInventoryByStatus,
  getInventoryStats,
  getInventoryInPipeline,
  getItemsNotInPipeline,
  markItemAsSold,
  archiveItem,
  getAllArchived,
  getInventoryByStore,
  computeVisitsFromInventory,
  getUnsyncedInventory,
  markInventorySynced,
  getSellingAnalytics,
  getInventoryForVisit
} from '../db/inventory.js';

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

function createTestItemData(overrides = {}) {
  return {
    brand: 'Escada',
    category: {
      primary: 'clothing',
      secondary: 'blazer'
    },
    colour: {
      primary: 'black',
      pattern: 'solid'
    },
    material: {
      primary: { name: 'wool', percentage: 100 }
    },
    size: {
      label: { original: '38', normalized: 'M' },
      measurements: { chest: 40, length: 26 }
    },
    condition: {
      overall: 'excellent',
      flaws: [],
      repairs_completed: []
    },
    metadata: {
      acquisition: {
        store_id: 'store-test-001',
        date: '2025-01-20',
        price: 25.00
      },
      status: 'unlisted'
    },
    listing_status: {},
    pricing: {},
    ...overrides
  };
}

// =============================================================================
// INVENTORY CRUD TESTS
// =============================================================================

export async function testInventoryCRUD() {
  logSection('INVENTORY CRUD TESTS');

  // Create item
  console.log('\n Creating inventory item...');
  const itemData = createTestItemData();
  const item = await createInventoryItem(itemData);

  assert(item.id, 'Item has ID');
  assert(item.brand === 'Escada', 'Item has correct brand');
  assert(item.category.primary === 'clothing', 'Item has correct primary category');
  assert(item.category.secondary === 'blazer', 'Item has correct secondary category');
  assert(item.metadata.created, 'Item has created timestamp');
  assert(item.metadata.updated, 'Item has updated timestamp');
  assert(item.metadata.sync.unsynced === true, 'Item marked as unsynced');

  // Get item
  console.log('\n Getting item by ID...');
  const fetched = await getInventoryItem(item.id);
  assert(fetched.id === item.id, 'Fetched item matches created item');
  assert(fetched.brand === 'Escada', 'Fetched item has correct brand');

  // Get all inventory
  console.log('\n Getting all inventory...');
  const allItems = await getAllInventory();
  assert(allItems.length >= 1, 'getAllInventory returns at least 1 item');
  assert(allItems.find(i => i.id === item.id), 'Created item in all inventory');

  // Update item
  console.log('\n Updating item...');
  const updated = await updateInventoryItem(item.id, {
    brand: 'Escada Sport',
    condition: { overall: 'good' }
  });
  assert(updated.brand === 'Escada Sport', 'Item brand updated');
  assert(updated.condition.overall === 'good', 'Item condition updated');
  assert(updated.category.primary === 'clothing', 'Original category preserved');
  assert(updated.metadata.updated > item.metadata.updated, 'Updated timestamp changed');

  // Deep nested update
  console.log('\n Testing deep nested update...');
  const deepUpdated = await updateInventoryItem(item.id, {
    size: { measurements: { waist: 32 } }
  });
  assert(deepUpdated.size.measurements.waist === 32, 'Nested measurement updated');
  assert(deepUpdated.size.measurements.chest === 40, 'Original measurements preserved');
  assert(deepUpdated.size.label.original === '38', 'Original label preserved');

  // Delete item
  console.log('\n Deleting item...');
  await deleteInventoryItem(item.id);
  const deleted = await getInventoryItem(item.id);
  assert(!deleted, 'Item deleted successfully');

  console.log('\n✅ All INVENTORY CRUD tests passed!');
  return true;
}

// =============================================================================
// SCHEMA VALIDATION TESTS
// =============================================================================

export async function testNestedSchema() {
  logSection('NESTED SCHEMA VALIDATION TESTS');

  // Create item with full nested structure
  console.log('\n Creating item with full nested schema...');
  const item = await createInventoryItem({
    brand: 'St. John',
    category: {
      primary: 'clothing',
      secondary: 'knit_suit',
      tertiary: 'jacket'
    },
    colour: {
      primary: 'navy',
      secondary: 'gold',
      pattern: 'solid'
    },
    material: {
      primary: { name: 'santana_knit', percentage: 80 },
      secondary: [{ name: 'metallic_thread', percentage: 20 }]
    },
    size: {
      label: { original: '8', normalized: 'M', region: 'US' },
      measurements: { bust: 38, waist: 30, hips: 40, length: 24 }
    },
    condition: {
      overall: 'very_good',
      flaws: [{ type: 'minor_pilling', location: 'underarm', severity: 'minor' }],
      repairs_completed: [{ type: 'button_replaced', cost: 5.00, date: '2025-01-15' }]
    },
    metadata: {
      acquisition: {
        store_id: 'store-001',
        date: '2025-01-10',
        price: 45.00,
        trip_id: 'trip-001'
      },
      status: 'unlisted'
    },
    listing_status: {
      platforms: ['ebay', 'poshmark'],
      listing_date: '2025-01-12'
    },
    pricing: {
      cost_basis: 50.00,
      suggested_price: 150.00,
      minimum_price: 100.00
    }
  });

  assert(item.category.tertiary === 'jacket', 'Tertiary category saved');
  assert(item.colour.secondary === 'gold', 'Secondary colour saved');
  assert(item.material.secondary[0].name === 'metallic_thread', 'Secondary material saved');
  assert(item.size.measurements.hips === 40, 'Hip measurement saved');
  assert(item.condition.flaws.length === 1, 'Flaws array saved');
  assert(item.condition.flaws[0].type === 'minor_pilling', 'Flaw type saved');
  assert(item.condition.repairs_completed[0].cost === 5.00, 'Repair cost saved');
  assert(item.listing_status.platforms.length === 2, 'Platforms array saved');
  assert(item.pricing.suggested_price === 150.00, 'Suggested price saved');

  // Update nested arrays
  console.log('\n Updating nested arrays...');
  const updated = await updateInventoryItem(item.id, {
    condition: {
      flaws: [
        { type: 'minor_pilling', location: 'underarm', severity: 'minor' },
        { type: 'small_stain', location: 'hem', severity: 'minor' }
      ]
    }
  });
  assert(updated.condition.flaws.length === 2, 'Flaws array updated');
  assert(updated.condition.flaws[1].type === 'small_stain', 'New flaw added');

  // Cleanup
  await deleteInventoryItem(item.id);

  console.log('\n✅ All NESTED SCHEMA tests passed!');
  return true;
}

// =============================================================================
// PIPELINE STATUS TESTS
// =============================================================================

export async function testPipelineStatus() {
  logSection('PIPELINE STATUS TESTS');

  // Create items with different statuses
  console.log('\n Creating items with various pipeline statuses...');

  const needsPhotoItem = await createInventoryItem(createTestItemData({
    metadata: { status: 'needs_photo', acquisition: { store_id: 'store-001', date: '2025-01-20', price: 10 } }
  }));

  const unlistedItem = await createInventoryItem(createTestItemData({
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-001', date: '2025-01-20', price: 15 } }
  }));

  const listedItem = await createInventoryItem(createTestItemData({
    metadata: { status: 'listed', acquisition: { store_id: 'store-001', date: '2025-01-20', price: 20 } }
  }));

  const keepItem = await createInventoryItem(createTestItemData({
    metadata: { status: 'keep', acquisition: { store_id: 'store-001', date: '2025-01-20', price: 50 } }
  }));

  // Get items in pipeline
  console.log('\n Getting items in pipeline...');
  const pipelineItems = await getInventoryInPipeline();
  assert(pipelineItems.find(i => i.id === needsPhotoItem.id), 'needs_photo item in pipeline');
  assert(pipelineItems.find(i => i.id === unlistedItem.id), 'unlisted item in pipeline');
  assert(pipelineItems.find(i => i.id === listedItem.id), 'listed item in pipeline');
  assert(!pipelineItems.find(i => i.id === keepItem.id), 'keep item NOT in pipeline');

  // Get items not in pipeline
  console.log('\n Getting items not in pipeline...');
  const nonPipelineItems = await getItemsNotInPipeline();
  assert(nonPipelineItems.find(i => i.id === keepItem.id), 'keep item in non-pipeline list');
  assert(!nonPipelineItems.find(i => i.id === listedItem.id), 'listed item NOT in non-pipeline list');

  // Get items by status index
  console.log('\n Getting items by status...');
  const listedItems = await getInventoryByStatus('listed');
  assert(listedItems.find(i => i.id === listedItem.id), 'Item found by status index');

  // Cleanup
  await deleteInventoryItem(needsPhotoItem.id);
  await deleteInventoryItem(unlistedItem.id);
  await deleteInventoryItem(listedItem.id);
  await deleteInventoryItem(keepItem.id);

  console.log('\n✅ All PIPELINE STATUS tests passed!');
  return true;
}

// =============================================================================
// MARK AS SOLD TESTS
// =============================================================================

export async function testMarkAsSold() {
  logSection('MARK AS SOLD TESTS');

  // Create a listed item
  console.log('\n Creating listed item...');
  const item = await createInventoryItem(createTestItemData({
    metadata: { status: 'listed', acquisition: { store_id: 'store-001', date: '2025-01-15', price: 30.00 } },
    listing_status: {
      listing_date: '2025-01-16',
      platforms: ['ebay']
    }
  }));

  // Mark as sold
  console.log('\n Marking item as sold...');
  const soldItem = await markItemAsSold(item.id, {
    sold_date: '2025-01-21',
    sold_price: 95.00,
    sold_platform: 'ebay',
    shipping_cost: 8.50,
    platform_fees: 12.35
  });

  assert(soldItem.metadata.status === 'sold', 'Status changed to sold');
  assert(soldItem.listing_status.sold_date === '2025-01-21', 'Sold date recorded');
  assert(soldItem.listing_status.sold_price === 95.00, 'Sold price recorded');
  assert(soldItem.listing_status.sold_platform === 'ebay', 'Sold platform recorded');
  assert(soldItem.listing_status.shipping_cost === 8.50, 'Shipping cost recorded');
  assert(soldItem.listing_status.platform_fees === 12.35, 'Platform fees recorded');

  // Verify original listing data preserved
  assert(soldItem.listing_status.listing_date === '2025-01-16', 'Original listing date preserved');

  // Cleanup
  await deleteInventoryItem(item.id);

  console.log('\n✅ All MARK AS SOLD tests passed!');
  return true;
}

// =============================================================================
// ARCHIVE TESTS
// =============================================================================

export async function testArchive() {
  logSection('ARCHIVE TESTS');

  // Create and sell an item
  console.log('\n Creating and selling item for archive...');
  const item = await createInventoryItem(createTestItemData({
    metadata: { status: 'listed', acquisition: { store_id: 'store-001', date: '2025-01-15', price: 25.00 } }
  }));

  await markItemAsSold(item.id, {
    sold_date: '2025-01-20',
    sold_price: 75.00,
    sold_platform: 'poshmark'
  });

  // Archive the sold item
  console.log('\n Archiving sold item...');
  const archivedItem = await archiveItem(item.id);

  assert(archivedItem.id === item.id, 'Archived item has same ID');
  assert(archivedItem.archived_at, 'Archived item has archived_at timestamp');
  assert(archivedItem.listing_status.sold_price === 75.00, 'Archived item preserves sale data');

  // Verify item removed from inventory
  console.log('\n Verifying item removed from inventory...');
  const inventoryItem = await getInventoryItem(item.id);
  assert(!inventoryItem, 'Item removed from inventory');

  // Verify item in archive
  console.log('\n Verifying item in archive...');
  const archived = await getAllArchived();
  assert(archived.find(i => i.id === item.id), 'Item found in archive');

  // Test archive validation - cannot archive non-sold item
  console.log('\n Testing archive validation...');
  const unlistedItem = await createInventoryItem(createTestItemData({
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-001', date: '2025-01-15', price: 20.00 } }
  }));

  let archiveError = null;
  try {
    await archiveItem(unlistedItem.id);
  } catch (err) {
    archiveError = err;
  }
  assert(archiveError && archiveError.message.includes('sold'), 'Cannot archive non-sold item');

  // Cleanup
  await deleteInventoryItem(unlistedItem.id);

  console.log('\n✅ All ARCHIVE tests passed!');
  return true;
}

// =============================================================================
// STORE FILTERING TESTS
// =============================================================================

export async function testStoreFiltering() {
  logSection('STORE FILTERING TESTS');

  // Create items from different stores
  console.log('\n Creating items from different stores...');

  const store1Item1 = await createInventoryItem(createTestItemData({
    brand: 'Store1 Item1',
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-filter-001', date: '2025-01-20', price: 10 } }
  }));

  const store1Item2 = await createInventoryItem(createTestItemData({
    brand: 'Store1 Item2',
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-filter-001', date: '2025-01-20', price: 15 } }
  }));

  const store2Item = await createInventoryItem(createTestItemData({
    brand: 'Store2 Item',
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-filter-002', date: '2025-01-21', price: 20 } }
  }));

  // Get inventory by store
  console.log('\n Getting inventory by store...');
  const store1Items = await getInventoryByStore('store-filter-001');
  assert(store1Items.length === 2, 'Found 2 items from store 1');
  assert(store1Items.find(i => i.id === store1Item1.id), 'Store1 Item1 found');
  assert(store1Items.find(i => i.id === store1Item2.id), 'Store1 Item2 found');
  assert(!store1Items.find(i => i.id === store2Item.id), 'Store2 item NOT in store1 results');

  const store2Items = await getInventoryByStore('store-filter-002');
  assert(store2Items.length === 1, 'Found 1 item from store 2');
  assert(store2Items[0].id === store2Item.id, 'Correct store2 item found');

  // Get inventory for visit
  console.log('\n Getting inventory for specific visit...');
  const visitItems = await getInventoryForVisit('store-filter-001', '2025-01-20');
  assert(visitItems.length === 2, 'Found 2 items for visit');

  // Cleanup
  await deleteInventoryItem(store1Item1.id);
  await deleteInventoryItem(store1Item2.id);
  await deleteInventoryItem(store2Item.id);

  console.log('\n✅ All STORE FILTERING tests passed!');
  return true;
}

// =============================================================================
// COMPUTE VISITS TESTS
// =============================================================================

export async function testComputeVisits() {
  logSection('COMPUTE VISITS FROM INVENTORY TESTS');

  // Create items from multiple visits
  console.log('\n Creating items from multiple visits...');

  const visit1Item1 = await createInventoryItem(createTestItemData({
    brand: 'Visit1 Item1',
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-visits-001', date: '2025-01-15', price: 10.00 } },
    tax_paid: 1.00
  }));

  const visit1Item2 = await createInventoryItem(createTestItemData({
    brand: 'Visit1 Item2',
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-visits-001', date: '2025-01-15', price: 15.00 } },
    tax_paid: 1.50
  }));

  const visit2Item = await createInventoryItem(createTestItemData({
    brand: 'Visit2 Item',
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-visits-001', date: '2025-01-20', price: 25.00 } },
    tax_paid: 2.00
  }));

  const visit3Item = await createInventoryItem(createTestItemData({
    brand: 'Visit3 Item',
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-visits-002', date: '2025-01-20', price: 30.00 } }
  }));

  // Compute visits
  console.log('\n Computing visits from inventory...');
  const visits = await computeVisitsFromInventory();

  // Find our test visits
  const visit1 = visits.find(v => v.store_id === 'store-visits-001' && v.date === '2025-01-15');
  const visit2 = visits.find(v => v.store_id === 'store-visits-001' && v.date === '2025-01-20');
  const visit3 = visits.find(v => v.store_id === 'store-visits-002' && v.date === '2025-01-20');

  assert(visit1, 'Visit 1 computed');
  assert(visit1.purchases_count === 2, 'Visit 1 has 2 purchases');
  assert(visit1.total_spent === 27.50, 'Visit 1 total spent = 10+1+15+1.5 = 27.50');
  assert(visit1.items.length === 2, 'Visit 1 has 2 item records');

  assert(visit2, 'Visit 2 computed');
  assert(visit2.purchases_count === 1, 'Visit 2 has 1 purchase');
  assert(visit2.total_spent === 27.00, 'Visit 2 total spent = 25+2 = 27.00');

  assert(visit3, 'Visit 3 computed');
  assert(visit3.store_id === 'store-visits-002', 'Visit 3 has correct store');

  // Verify visits are sorted by date descending
  const visit1Index = visits.findIndex(v => v === visit1);
  const visit2Index = visits.findIndex(v => v === visit2);
  assert(visit2Index < visit1Index, 'Visits sorted by date descending');

  // Cleanup
  await deleteInventoryItem(visit1Item1.id);
  await deleteInventoryItem(visit1Item2.id);
  await deleteInventoryItem(visit2Item.id);
  await deleteInventoryItem(visit3Item.id);

  console.log('\n✅ All COMPUTE VISITS tests passed!');
  return true;
}

// =============================================================================
// UNSYNCED TRACKING TESTS
// =============================================================================

export async function testUnsyncedTracking() {
  logSection('UNSYNCED TRACKING TESTS');

  // Create item (should be unsynced)
  console.log('\n Creating item (should be unsynced)...');
  const item = await createInventoryItem(createTestItemData());

  assert(item.metadata.sync.unsynced === true, 'New item is unsynced');

  // Get unsynced inventory
  console.log('\n Getting unsynced inventory...');
  const unsynced = await getUnsyncedInventory();
  assert(unsynced.find(i => i.id === item.id), 'Item in unsynced list');

  // Mark as synced
  console.log('\n Marking item as synced...');
  await markInventorySynced([item.id]);

  const afterSync = await getInventoryItem(item.id);
  assert(afterSync.metadata.sync.unsynced === false, 'Item marked as synced');
  assert(afterSync.metadata.sync.synced_at, 'Item has synced_at timestamp');

  // Update should mark as unsynced again
  console.log('\n Updating item (should become unsynced)...');
  const updated = await updateInventoryItem(item.id, { brand: 'Updated Brand' });
  assert(updated.metadata.sync.unsynced === true, 'Updated item is unsynced again');

  // Cleanup
  await deleteInventoryItem(item.id);

  console.log('\n✅ All UNSYNCED TRACKING tests passed!');
  return true;
}

// =============================================================================
// STATS TESTS
// =============================================================================

export async function testInventoryStats() {
  logSection('INVENTORY STATS TESTS');

  // Create diverse inventory
  console.log('\n Creating diverse inventory for stats...');

  const clothingItem = await createInventoryItem(createTestItemData({
    category: { primary: 'clothing', secondary: 'dress' },
    metadata: { status: 'listed', acquisition: { store_id: 'store-001', date: '2025-01-10', price: 20.00 } }
  }));

  const shoesItem = await createInventoryItem(createTestItemData({
    category: { primary: 'shoes', secondary: 'heels' },
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-001', date: '2025-01-10', price: 15.00 } },
    tax_paid: 1.50
  }));

  const soldItem = await createInventoryItem(createTestItemData({
    category: { primary: 'clothing', secondary: 'blazer' },
    metadata: { status: 'sold', acquisition: { store_id: 'store-001', date: '2025-01-05', price: 25.00 } },
    listing_status: { sold_price: 85.00, sold_platform: 'ebay' }
  }));

  // Get inventory stats
  console.log('\n Getting inventory stats...');
  const stats = await getInventoryStats();

  assert(stats.total >= 3, 'Total count includes test items');
  assert(stats.byCategory.clothing >= 2, 'Clothing count includes 2 items');
  assert(stats.byCategory.shoes >= 1, 'Shoes count includes 1 item');
  assert(stats.byStatus.listed >= 1, 'Listed status count >= 1');
  assert(stats.byStatus.sold >= 1, 'Sold status count >= 1');
  assert(stats.totalInvested >= 61.50, 'Total invested includes test items (20+15+1.50+25)');
  assert(stats.totalSold >= 85.00, 'Total sold includes sold item');

  // Cleanup
  await deleteInventoryItem(clothingItem.id);
  await deleteInventoryItem(shoesItem.id);
  await deleteInventoryItem(soldItem.id);

  console.log('\n✅ All INVENTORY STATS tests passed!');
  return true;
}

// =============================================================================
// SELLING ANALYTICS TESTS
// =============================================================================

export async function testSellingAnalytics() {
  logSection('SELLING ANALYTICS TESTS');

  // Create sold items with full data
  console.log('\n Creating sold items for analytics...');

  const soldItem1 = await createInventoryItem(createTestItemData({
    category: { primary: 'clothing', secondary: 'dress' },
    metadata: { status: 'sold', acquisition: { store_id: 'store-001', date: '2025-01-05', price: 20.00 } },
    tax_paid: 2.00,
    condition: { repairs_completed: [{ repair_cost: 5.00 }] },
    listing_status: {
      sold_date: '2025-01-15',
      sold_price: 80.00,
      sold_platform: 'ebay',
      shipping_cost: 8.00,
      platform_fees: 10.00
    }
  }));

  const soldItem2 = await createInventoryItem(createTestItemData({
    category: { primary: 'shoes', secondary: 'boots' },
    metadata: { status: 'sold', acquisition: { store_id: 'store-002', date: '2025-01-08', price: 30.00 } },
    listing_status: {
      sold_date: '2025-01-18',
      sold_price: 120.00,
      sold_platform: 'poshmark',
      shipping_cost: 0,
      platform_fees: 24.00
    }
  }));

  // Get selling analytics
  console.log('\n Getting selling analytics...');
  const analytics = await getSellingAnalytics();

  assert(analytics.itemsSold >= 2, 'Item count includes test items');
  assert(analytics.totalRevenue >= 200.00, 'Revenue includes both sales (80+120)');

  // Check platform breakdown
  assert(analytics.platformBreakdown.ebay, 'eBay in platform breakdown');
  assert(analytics.platformBreakdown.poshmark, 'Poshmark in platform breakdown');
  assert(analytics.platformBreakdown.ebay.revenue >= 80.00, 'eBay revenue >= 80');
  assert(analytics.platformBreakdown.poshmark.revenue >= 120.00, 'Poshmark revenue >= 120');

  // Check category breakdown
  assert(analytics.categoryBreakdown.clothing, 'Clothing in category breakdown');
  assert(analytics.categoryBreakdown.shoes, 'Shoes in category breakdown');

  // Test date range filtering
  console.log('\n Testing date range filtering...');
  const rangeAnalytics = await getSellingAnalytics({
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-01-16')
  });

  // Only soldItem1 (sold on 2025-01-15) should be included
  assert(rangeAnalytics.itemsSold >= 1, 'At least one item in date range');

  // Cleanup
  await deleteInventoryItem(soldItem1.id);
  await deleteInventoryItem(soldItem2.id);

  console.log('\n✅ All SELLING ANALYTICS tests passed!');
  return true;
}

// =============================================================================
// CATEGORY FILTERING TESTS
// =============================================================================

export async function testCategoryFiltering() {
  logSection('CATEGORY FILTERING TESTS');

  // Create items in different categories
  console.log('\n Creating items in different categories...');

  const clothingItem = await createInventoryItem(createTestItemData({
    category: { primary: 'clothing', secondary: 'blazer' },
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-001', date: '2025-01-20', price: 30 } }
  }));

  const jewelryItem = await createInventoryItem(createTestItemData({
    category: { primary: 'jewelry', secondary: 'necklace' },
    metadata: { status: 'unlisted', acquisition: { store_id: 'store-001', date: '2025-01-20', price: 15 } }
  }));

  // Get by category
  console.log('\n Getting items by category...');
  const clothingItems = await getInventoryByCategory('clothing');
  assert(clothingItems.find(i => i.id === clothingItem.id), 'Clothing item found');
  assert(!clothingItems.find(i => i.id === jewelryItem.id), 'Jewelry item NOT in clothing results');

  const jewelryItems = await getInventoryByCategory('jewelry');
  assert(jewelryItems.find(i => i.id === jewelryItem.id), 'Jewelry item found');

  // Cleanup
  await deleteInventoryItem(clothingItem.id);
  await deleteInventoryItem(jewelryItem.id);

  console.log('\n✅ All CATEGORY FILTERING tests passed!');
  return true;
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

export async function runAllTests() {
  console.log('\n🧪 INVENTORY MODULE TEST SUITE\n');
  console.log('Testing inventory CRUD, schema, pipeline, archive, and analytics...\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'Inventory CRUD', fn: testInventoryCRUD },
    { name: 'Nested Schema', fn: testNestedSchema },
    { name: 'Pipeline Status', fn: testPipelineStatus },
    { name: 'Mark As Sold', fn: testMarkAsSold },
    { name: 'Archive', fn: testArchive },
    { name: 'Store Filtering', fn: testStoreFiltering },
    { name: 'Compute Visits', fn: testComputeVisits },
    { name: 'Unsynced Tracking', fn: testUnsyncedTracking },
    { name: 'Inventory Stats', fn: testInventoryStats },
    { name: 'Selling Analytics', fn: testSellingAnalytics },
    { name: 'Category Filtering', fn: testCategoryFiltering }
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
  window.inventoryTests = {
    runAllTests,
    testInventoryCRUD,
    testNestedSchema,
    testPipelineStatus,
    testMarkAsSold,
    testArchive,
    testStoreFiltering,
    testComputeVisits,
    testUnsyncedTracking,
    testInventoryStats,
    testSellingAnalytics,
    testCategoryFiltering
  };
}
