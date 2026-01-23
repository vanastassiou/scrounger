/**
 * Stores Module Tests
 * Run in browser console after importing:
 *   import('/js/tests/stores.test.js').then(m => m.runAllTests())
 *
 * Or run individual tests:
 *   import('/js/tests/stores.test.js').then(m => m.testStoresCRUD())
 */

import {
  createUserStore,
  updateUserStore,
  deleteUserStore,
  getAllUserStores
} from '../db/stores.js';
import { getAllStoreStats, getStoreStats } from '../db/visits.js';
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
// STORES CRUD TESTS
// =============================================================================

export async function testStoresCRUD() {
  logSection('STORES CRUD TESTS');

  // Create store
  console.log('\n Creating store...');
  const store = await createUserStore({
    name: 'Test Thrift Store',
    tier: 'A',
    address: '123 Main St, City, ST 12345',
    phone: '555-1234',
    notes: 'Great for vintage clothing'
  });

  assert(store.id, 'Store has ID');
  assert(store.name === 'Test Thrift Store', 'Store has correct name');
  assert(store.tier === 'A', 'Store has correct tier');
  assert(store.address === '123 Main St, City, ST 12345', 'Store has correct address');
  assert(store.phone === '555-1234', 'Store has correct phone');
  assert(store.notes === 'Great for vintage clothing', 'Store has correct notes');
  assert(store.created_at, 'Store has created_at');
  assert(store.updated_at, 'Store has updated_at');
  assert(store.user_created === true, 'Store marked as user created');
  assert(store.unsynced === true, 'Store marked as unsynced');

  // Get all stores
  console.log('\n Getting all stores...');
  const allStores = await getAllUserStores();
  assert(allStores.find(s => s.id === store.id), 'Created store in all stores');

  // Stores should be sorted by name
  console.log('\n Testing store sorting...');
  const store2 = await createUserStore({ name: 'Another Store', tier: 'B' });
  const store3 = await createUserStore({ name: 'Zebra Store', tier: 'C' });

  const sortedStores = await getAllUserStores();
  const testStores = sortedStores.filter(s =>
    s.id === store.id || s.id === store2.id || s.id === store3.id
  );

  // Find positions
  const anotherIdx = testStores.findIndex(s => s.name === 'Another Store');
  const testIdx = testStores.findIndex(s => s.name === 'Test Thrift Store');
  const zebraIdx = testStores.findIndex(s => s.name === 'Zebra Store');

  assert(anotherIdx < testIdx, 'Another Store before Test Thrift Store');
  assert(testIdx < zebraIdx, 'Test Thrift Store before Zebra Store');

  // Update store
  console.log('\n Updating store...');
  const updated = await updateUserStore(store.id, {
    tier: 'S',
    notes: 'Updated notes - best store ever'
  });
  assert(updated.tier === 'S', 'Store tier updated');
  assert(updated.notes === 'Updated notes - best store ever', 'Store notes updated');
  assert(updated.name === 'Test Thrift Store', 'Original name preserved');
  assert(updated.updated_at > store.updated_at, 'Updated_at timestamp changed');

  // Delete stores
  console.log('\n Deleting stores...');
  await deleteUserStore(store.id);
  await deleteUserStore(store2.id);
  await deleteUserStore(store3.id);

  const afterDelete = await getAllUserStores();
  assert(!afterDelete.find(s => s.id === store.id), 'First store deleted');
  assert(!afterDelete.find(s => s.id === store2.id), 'Second store deleted');
  assert(!afterDelete.find(s => s.id === store3.id), 'Third store deleted');

  console.log('\n✅ All STORES CRUD tests passed!');
  return true;
}

// =============================================================================
// STORE TIERS TESTS
// =============================================================================

export async function testStoreTiers() {
  logSection('STORE TIERS TESTS');

  // Create stores with different tiers
  console.log('\n Creating stores with different tiers...');

  const sStore = await createUserStore({ name: 'S Tier Store', tier: 'S' });
  const aStore = await createUserStore({ name: 'A Tier Store', tier: 'A' });
  const bStore = await createUserStore({ name: 'B Tier Store', tier: 'B' });
  const cStore = await createUserStore({ name: 'C Tier Store', tier: 'C' });

  assert(sStore.tier === 'S', 'S tier store created');
  assert(aStore.tier === 'A', 'A tier store created');
  assert(bStore.tier === 'B', 'B tier store created');
  assert(cStore.tier === 'C', 'C tier store created');

  // Update tier
  console.log('\n Testing tier updates...');
  const upgraded = await updateUserStore(bStore.id, { tier: 'A' });
  assert(upgraded.tier === 'A', 'Store tier upgraded from B to A');

  // Cleanup
  await deleteUserStore(sStore.id);
  await deleteUserStore(aStore.id);
  await deleteUserStore(bStore.id);
  await deleteUserStore(cStore.id);

  console.log('\n✅ All STORE TIERS tests passed!');
  return true;
}

// =============================================================================
// STORE STATS TESTS
// =============================================================================

export async function testStoreStats() {
  logSection('STORE STATS TESTS');

  // Create a store and some inventory items
  console.log('\n Creating store and inventory items...');
  const store = await createUserStore({
    name: 'Stats Test Store',
    tier: 'A'
  });

  const item1 = await createInventoryItem({
    brand: 'Stats Item 1',
    category: { primary: 'clothing', secondary: 'dress' },
    colour: { primary: 'red' },
    material: { primary: { name: 'silk', percentage: 100 } },
    size: { label: { value: 'M' } },
    condition: { overall_condition: 'excellent' },
    metadata: {
      status: 'in_collection',
      acquisition: {
        store_id: store.id,
        date: '2025-01-15',
        price: 25.00
      }
    }
  });

  const item2 = await createInventoryItem({
    brand: 'Stats Item 2',
    category: { primary: 'shoes', secondary: 'heels' },
    colour: { primary: 'black' },
    material: { primary: { name: 'leather', percentage: 100 } },
    size: { label: { value: '8' } },
    condition: { overall_condition: 'very_good' },
    metadata: {
      status: 'sold',
      acquisition: {
        store_id: store.id,
        date: '2025-01-15',
        price: 30.00
      }
    },
    listing_status: {
      sold_price: 95.00,
      sold_platform: 'ebay'
    }
  });

  // Another item from same store, different date
  const item3 = await createInventoryItem({
    brand: 'Stats Item 3',
    category: { primary: 'jewelry', secondary: 'necklace' },
    colour: { primary: 'gold' },
    material: { primary: { name: 'gold', percentage: 100 } },
    size: {},
    condition: { overall_condition: 'excellent' },
    metadata: {
      status: 'listed',
      acquisition: {
        store_id: store.id,
        date: '2025-01-20',
        price: 15.00
      }
    }
  });

  // Get store stats
  console.log('\n Getting store stats...');
  const stats = await getStoreStats(store.id);

  assert(stats.store_id === store.id, 'Stats for correct store');
  assert(stats.total_visits >= 2, 'At least 2 visits (2 different dates)');
  assert(stats.total_spent >= 70.00, 'Total spent >= 70 (25+30+15)');
  assert(stats.total_items >= 3, 'Total items >= 3');
  assert(stats.hit_rate > 0, 'Hit rate > 0 (all visits have purchases)');
  assert(stats.avg_spend_per_visit > 0, 'Average spend per visit calculated');

  // Get all store stats
  console.log('\n Getting all store stats...');
  const allStats = await getAllStoreStats();
  assert(allStats instanceof Map, 'getAllStoreStats returns Map');
  assert(allStats.has(store.id), 'Stats map includes our store');

  const storeStatsFromAll = allStats.get(store.id);
  assert(storeStatsFromAll.total_visits >= 2, 'All stats has correct visit count');

  // Cleanup
  await deleteInventoryItem(item1.id);
  await deleteInventoryItem(item2.id);
  await deleteInventoryItem(item3.id);
  await deleteUserStore(store.id);

  console.log('\n✅ All STORE STATS tests passed!');
  return true;
}

// =============================================================================
// STORE ID GENERATION TESTS
// =============================================================================

export async function testStoreIdGeneration() {
  logSection('STORE ID GENERATION TESTS');

  // Store with provided ID
  console.log('\n Testing store with provided ID...');
  const storeWithId = await createUserStore({
    id: 'custom-store-id',
    name: 'Custom ID Store',
    tier: 'A'
  });
  assert(storeWithId.id === 'custom-store-id', 'Custom ID used');

  // Store without ID gets generated
  console.log('\n Testing store with generated ID...');
  const storeNoId = await createUserStore({
    name: 'Generated ID Store',
    tier: 'B'
  });
  assert(storeNoId.id, 'ID generated');
  assert(storeNoId.id !== 'custom-store-id', 'Generated ID is unique');

  // Cleanup
  await deleteUserStore(storeWithId.id);
  await deleteUserStore(storeNoId.id);

  console.log('\n✅ All STORE ID GENERATION tests passed!');
  return true;
}

// =============================================================================
// STORE UPDATE ERROR HANDLING TESTS
// =============================================================================

export async function testStoreErrorHandling() {
  logSection('STORE ERROR HANDLING TESTS');

  // Update non-existent store
  console.log('\n Testing update non-existent store...');
  let updateError = null;
  try {
    await updateUserStore('non-existent-store-id', { name: 'New Name' });
  } catch (err) {
    updateError = err;
  }
  assert(updateError !== null, 'Update non-existent store throws error');
  assert(updateError.message.includes('not found'), 'Error message mentions not found');

  console.log('\n✅ All STORE ERROR HANDLING tests passed!');
  return true;
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

export async function runAllTests() {
  console.log('\n🧪 STORES MODULE TEST SUITE\n');
  console.log('Testing store CRUD, tiers, stats, and error handling...\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'Stores CRUD', fn: testStoresCRUD },
    { name: 'Store Tiers', fn: testStoreTiers },
    { name: 'Store Stats', fn: testStoreStats },
    { name: 'Store ID Generation', fn: testStoreIdGeneration },
    { name: 'Store Error Handling', fn: testStoreErrorHandling }
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
  window.storesTests = {
    runAllTests,
    testStoresCRUD,
    testStoreTiers,
    testStoreStats,
    testStoreIdGeneration,
    testStoreErrorHandling
  };
}
