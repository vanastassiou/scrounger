/**
 * Visits Module Tests
 * Run in browser console after importing:
 *   import('/js/tests/visits.test.js').then(m => m.runAllTests())
 *
 * Or run individual tests:
 *   import('/js/tests/visits.test.js').then(m => m.testVisitsCRUD())
 */

import {
  createVisit,
  updateVisit,
  deleteVisit,
  getAllVisits,
  getVisitsByStore,
  getStoreStats,
  getAllStoreStats,
  getUnsyncedVisits,
  markVisitsSynced
} from '../db/visits.js';
import { computeVisitsFromInventory } from '../db/inventory.js';
import { createUserStore, deleteUserStore } from '../db/stores.js';
import { createInventoryItem, deleteInventoryItem } from '../db/inventory.js';

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
// VISITS CRUD TESTS
// =============================================================================

export async function testVisitsCRUD() {
  logSection('VISITS CRUD TESTS');

  // Create visit
  console.log('\n Creating visit...');
  const visit = await createVisit({
    store_id: 'test-store-001',
    date: '2025-01-21',
    purchases_count: 3,
    total_spent: 45.00,
    notes: 'Great finds today!'
  });

  assert(visit.id, 'Visit has ID');
  assert(visit.store_id === 'test-store-001', 'Visit has correct store_id');
  assert(visit.date === '2025-01-21', 'Visit has correct date');
  assert(visit.purchases_count === 3, 'Visit has correct purchases_count');
  assert(visit.total_spent === 45.00, 'Visit has correct total_spent');
  assert(visit.notes === 'Great finds today!', 'Visit has correct notes');
  assert(visit.created_at, 'Visit has created_at');
  assert(visit.updated_at, 'Visit has updated_at');
  assert(visit.unsynced === true, 'Visit marked as unsynced');

  // Get all visits
  console.log('\n Getting all visits...');
  const allVisits = await getAllVisits();
  assert(allVisits.find(v => v.id === visit.id), 'Created visit in all visits');

  // Update visit
  console.log('\n Updating visit...');
  const updated = await updateVisit(visit.id, {
    purchases_count: 4,
    total_spent: 55.00,
    notes: 'Updated notes'
  });
  assert(updated.purchases_count === 4, 'Visit purchases_count updated');
  assert(updated.total_spent === 55.00, 'Visit total_spent updated');
  assert(updated.notes === 'Updated notes', 'Visit notes updated');
  assert(updated.store_id === 'test-store-001', 'Original store_id preserved');
  assert(updated.updated_at > visit.updated_at, 'Updated_at timestamp changed');

  // Delete visit
  console.log('\n Deleting visit...');
  await deleteVisit(visit.id);
  const afterDelete = await getAllVisits();
  assert(!afterDelete.find(v => v.id === visit.id), 'Visit deleted');

  console.log('\n✅ All VISITS CRUD tests passed!');
  return true;
}

// =============================================================================
// VISITS BY STORE TESTS
// =============================================================================

export async function testVisitsByStore() {
  logSection('VISITS BY STORE TESTS');

  // Create visits for different stores
  console.log('\n Creating visits for different stores...');
  const visit1 = await createVisit({
    store_id: 'store-A',
    date: '2025-01-20',
    purchases_count: 2,
    total_spent: 30.00
  });

  const visit2 = await createVisit({
    store_id: 'store-A',
    date: '2025-01-21',
    purchases_count: 1,
    total_spent: 15.00
  });

  const visit3 = await createVisit({
    store_id: 'store-B',
    date: '2025-01-20',
    purchases_count: 3,
    total_spent: 50.00
  });

  // Get visits by store
  console.log('\n Getting visits by store...');
  const storeAVisits = await getVisitsByStore('store-A');
  assert(storeAVisits.length === 2, 'Store A has 2 visits');
  assert(storeAVisits.find(v => v.id === visit1.id), 'Visit 1 found');
  assert(storeAVisits.find(v => v.id === visit2.id), 'Visit 2 found');
  assert(!storeAVisits.find(v => v.id === visit3.id), 'Visit 3 not in store A results');

  const storeBVisits = await getVisitsByStore('store-B');
  assert(storeBVisits.length === 1, 'Store B has 1 visit');
  assert(storeBVisits[0].id === visit3.id, 'Visit 3 found in store B');

  // Visits sorted by date descending
  console.log('\n Testing visit sorting...');
  assert(storeAVisits[0].date === '2025-01-21', 'Most recent visit first');
  assert(storeAVisits[1].date === '2025-01-20', 'Older visit second');

  // Cleanup
  await deleteVisit(visit1.id);
  await deleteVisit(visit2.id);
  await deleteVisit(visit3.id);

  console.log('\n✅ All VISITS BY STORE tests passed!');
  return true;
}

// =============================================================================
// STORE STATS TESTS
// =============================================================================

export async function testStoreStatsCalculation() {
  logSection('STORE STATS CALCULATION TESTS');

  // Create visits with varied data
  console.log('\n Creating visits for stats calculation...');
  const visit1 = await createVisit({
    store_id: 'stats-store',
    date: '2025-01-15',
    purchases_count: 2,
    total_spent: 40.00
  });

  const visit2 = await createVisit({
    store_id: 'stats-store',
    date: '2025-01-18',
    purchases_count: 0,  // No purchases = "miss"
    total_spent: 0
  });

  const visit3 = await createVisit({
    store_id: 'stats-store',
    date: '2025-01-20',
    purchases_count: 3,
    total_spent: 60.00
  });

  // Get store stats
  console.log('\n Calculating store stats...');
  const stats = await getStoreStats('stats-store');

  assert(stats.store_id === 'stats-store', 'Stats for correct store');
  assert(stats.total_visits === 3, 'Total visits = 3');
  assert(stats.total_spent === 100.00, 'Total spent = 40 + 0 + 60 = 100');
  assert(stats.total_items === 5, 'Total items = 2 + 0 + 3 = 5');

  // Hit rate: 2 out of 3 visits had purchases
  const expectedHitRate = 2 / 3;
  assert(Math.abs(stats.hit_rate - expectedHitRate) < 0.01, `Hit rate = ${expectedHitRate.toFixed(2)}`);

  // Average spend per visit: 100 / 3
  const expectedAvg = 100 / 3;
  assert(Math.abs(stats.avg_spend_per_visit - expectedAvg) < 0.01, 'Avg spend per visit calculated');

  // Last visit date
  assert(stats.last_visit_date === '2025-01-20', 'Last visit date is most recent');

  // Days since last visit (will vary based on current date)
  assert(typeof stats.days_since_last_visit === 'number', 'Days since last visit is a number');

  // Cleanup
  await deleteVisit(visit1.id);
  await deleteVisit(visit2.id);
  await deleteVisit(visit3.id);

  console.log('\n✅ All STORE STATS CALCULATION tests passed!');
  return true;
}

// =============================================================================
// COMPUTED VISITS TESTS
// =============================================================================

export async function testComputeVisitsFromInventory() {
  logSection('COMPUTE VISITS FROM INVENTORY TESTS');

  // Create inventory items that will be used to compute visits
  console.log('\n Creating inventory items...');
  const item1 = await createInventoryItem({
    brand: 'Computed Visit Item 1',
    category: { primary: 'clothing', secondary: 'dress' },
    colour: { primary: 'blue' },
    material: { primary: { name: 'cotton', percentage: 100 } },
    size: { label: { value: 'M' } },
    condition: { overall_condition: 'excellent' },
    metadata: {
      status: 'in_collection',
      acquisition: {
        store_id: 'compute-store',
        date: '2025-01-15',
        price: 20.00
      }
    },
    tax_paid: 2.00
  });

  const item2 = await createInventoryItem({
    brand: 'Computed Visit Item 2',
    category: { primary: 'shoes', secondary: 'boots' },
    colour: { primary: 'brown' },
    material: { primary: { name: 'leather', percentage: 100 } },
    size: { label: { value: '9' } },
    condition: { overall_condition: 'very_good' },
    metadata: {
      status: 'in_collection',
      acquisition: {
        store_id: 'compute-store',
        date: '2025-01-15',
        price: 35.00
      }
    },
    tax_paid: 3.50
  });

  const item3 = await createInventoryItem({
    brand: 'Computed Visit Item 3',
    category: { primary: 'jewelry', secondary: 'bracelet' },
    colour: { primary: 'silver' },
    material: { primary: { name: 'silver', percentage: 100 } },
    size: {},
    condition: { overall_condition: 'excellent' },
    metadata: {
      status: 'in_collection',
      acquisition: {
        store_id: 'compute-store',
        date: '2025-01-20',
        price: 10.00
      }
    }
  });

  // Compute visits from inventory
  console.log('\n Computing visits from inventory...');
  const computedVisits = await computeVisitsFromInventory();

  // Find our computed visits
  const visit1 = computedVisits.find(v =>
    v.store_id === 'compute-store' && v.date === '2025-01-15'
  );
  const visit2 = computedVisits.find(v =>
    v.store_id === 'compute-store' && v.date === '2025-01-20'
  );

  assert(visit1, 'First computed visit found');
  assert(visit1.purchases_count === 2, 'First visit has 2 purchases');
  assert(visit1.total_spent === 60.50, 'First visit total = 20+2+35+3.50 = 60.50');
  assert(visit1.items.length === 2, 'First visit has 2 item records');

  assert(visit2, 'Second computed visit found');
  assert(visit2.purchases_count === 1, 'Second visit has 1 purchase');
  assert(visit2.total_spent === 10.00, 'Second visit total = 10');

  // Verify items array content
  const itemRecord = visit1.items.find(i => i.id === item1.id);
  assert(itemRecord, 'Item record found in visit');
  assert(itemRecord.purchase_price === 20.00, 'Item purchase price recorded');
  assert(itemRecord.category === 'clothing', 'Item category recorded');

  // Cleanup
  await deleteInventoryItem(item1.id);
  await deleteInventoryItem(item2.id);
  await deleteInventoryItem(item3.id);

  console.log('\n✅ All COMPUTE VISITS FROM INVENTORY tests passed!');
  return true;
}

// =============================================================================
// ALL STORE STATS TESTS
// =============================================================================

export async function testGetAllStoreStats() {
  logSection('GET ALL STORE STATS TESTS');

  // Create inventory items for multiple stores
  console.log('\n Creating inventory for multiple stores...');
  const item1 = await createInventoryItem({
    brand: 'All Stats Item 1',
    category: { primary: 'clothing', secondary: 'top' },
    colour: { primary: 'red' },
    material: { primary: { name: 'silk', percentage: 100 } },
    size: { label: { value: 'S' } },
    condition: { overall_condition: 'excellent' },
    metadata: {
      status: 'in_collection',
      acquisition: {
        store_id: 'all-stats-store-1',
        date: '2025-01-15',
        price: 25.00
      }
    }
  });

  const item2 = await createInventoryItem({
    brand: 'All Stats Item 2',
    category: { primary: 'shoes', secondary: 'flats' },
    colour: { primary: 'navy' },
    material: { primary: { name: 'leather', percentage: 100 } },
    size: { label: { value: '7' } },
    condition: { overall_condition: 'good' },
    metadata: {
      status: 'sold',
      acquisition: {
        store_id: 'all-stats-store-2',
        date: '2025-01-16',
        price: 15.00
      }
    },
    listing_status: {
      sold_price: 55.00
    }
  });

  // Get all store stats
  console.log('\n Getting all store stats...');
  const allStats = await getAllStoreStats();

  assert(allStats instanceof Map, 'Returns a Map');
  assert(allStats.has('all-stats-store-1'), 'Stats for store 1 present');
  assert(allStats.has('all-stats-store-2'), 'Stats for store 2 present');

  const stats1 = allStats.get('all-stats-store-1');
  assert(stats1.total_visits >= 1, 'Store 1 has at least 1 visit');
  assert(stats1.total_spent >= 25.00, 'Store 1 spent >= 25');

  const stats2 = allStats.get('all-stats-store-2');
  assert(stats2.total_visits >= 1, 'Store 2 has at least 1 visit');
  assert(stats2.total_spent >= 15.00, 'Store 2 spent >= 15');

  // Cleanup
  await deleteInventoryItem(item1.id);
  await deleteInventoryItem(item2.id);

  console.log('\n✅ All GET ALL STORE STATS tests passed!');
  return true;
}

// =============================================================================
// UNSYNCED TRACKING TESTS
// =============================================================================

export async function testUnsyncedTracking() {
  logSection('VISITS UNSYNCED TRACKING TESTS');

  // Create visit (should be unsynced)
  console.log('\n Creating visit...');
  const visit = await createVisit({
    store_id: 'unsynced-store',
    date: '2025-01-21',
    purchases_count: 1,
    total_spent: 20.00
  });

  assert(visit.unsynced === true, 'New visit is unsynced');

  // Get unsynced visits
  console.log('\n Getting unsynced visits...');
  const unsynced = await getUnsyncedVisits();
  assert(unsynced.find(v => v.id === visit.id), 'Visit in unsynced list');

  // Mark as synced
  console.log('\n Marking visit as synced...');
  await markVisitsSynced([visit.id]);

  const unsyncedAfter = await getUnsyncedVisits();
  assert(!unsyncedAfter.find(v => v.id === visit.id), 'Visit no longer in unsynced list');

  // Update should mark as unsynced again
  console.log('\n Updating visit...');
  const updated = await updateVisit(visit.id, { notes: 'Updated notes' });
  assert(updated.unsynced === true, 'Updated visit is unsynced again');

  // Cleanup
  await deleteVisit(visit.id);

  console.log('\n✅ All UNSYNCED TRACKING tests passed!');
  return true;
}

// =============================================================================
// EDGE CASES TESTS
// =============================================================================

export async function testEdgeCases() {
  logSection('VISITS EDGE CASES TESTS');

  // Store with no visits
  console.log('\n Testing store with no visits...');
  const emptyStats = await getStoreStats('non-existent-store');
  assert(emptyStats.total_visits === 0, 'No visits for non-existent store');
  assert(emptyStats.total_spent === 0, 'No spend for non-existent store');
  assert(emptyStats.hit_rate === 0, 'Zero hit rate for non-existent store');
  assert(emptyStats.days_since_last_visit === Infinity, 'Infinity days since last visit');

  // Visit with zero purchases (miss)
  console.log('\n Testing zero-purchase visit...');
  const missVisit = await createVisit({
    store_id: 'miss-store',
    date: '2025-01-21',
    purchases_count: 0,
    total_spent: 0
  });

  const missStats = await getStoreStats('miss-store');
  assert(missStats.total_visits === 1, 'Miss visit counted');
  assert(missStats.hit_rate === 0, 'Zero hit rate for miss-only store');

  // Cleanup
  await deleteVisit(missVisit.id);

  // Update non-existent visit
  console.log('\n Testing update non-existent visit...');
  let updateError = null;
  try {
    await updateVisit('non-existent-visit', { notes: 'test' });
  } catch (err) {
    updateError = err;
  }
  assert(updateError !== null, 'Update non-existent visit throws error');

  console.log('\n✅ All EDGE CASES tests passed!');
  return true;
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

export async function runAllTests() {
  console.log('\n🧪 VISITS MODULE TEST SUITE\n');
  console.log('Testing visits CRUD, stats, computed visits, and edge cases...\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'Visits CRUD', fn: testVisitsCRUD },
    { name: 'Visits By Store', fn: testVisitsByStore },
    { name: 'Store Stats Calculation', fn: testStoreStatsCalculation },
    { name: 'Compute Visits From Inventory', fn: testComputeVisitsFromInventory },
    { name: 'Get All Store Stats', fn: testGetAllStoreStats },
    { name: 'Unsynced Tracking', fn: testUnsyncedTracking },
    { name: 'Edge Cases', fn: testEdgeCases }
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
  window.visitsTests = {
    runAllTests,
    testVisitsCRUD,
    testVisitsByStore,
    testStoreStatsCalculation,
    testComputeVisitsFromInventory,
    testGetAllStoreStats,
    testUnsyncedTracking,
    testEdgeCases
  };
}
