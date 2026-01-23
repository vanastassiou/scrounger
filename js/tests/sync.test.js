/**
 * Sync Module Tests
 * Run in browser console after importing:
 *   import('/js/tests/sync.test.js').then(m => m.runAllTests())
 *
 * Or run individual tests:
 *   import('/js/tests/sync.test.js').then(m => m.testMergeArrays())
 */

import { createSyncEngine, SyncStatus } from '../core/sync-engine.js';
import { exportAllData, importData } from '../db/export.js';
import { createInventoryItem, deleteInventoryItem, getAllInventory } from '../db/inventory.js';

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
// MOCK PROVIDER FOR TESTING
// =============================================================================

function createMockProvider(options = {}) {
  let connected = options.connected ?? true;
  let folderConfigured = options.folderConfigured ?? true;
  let remoteData = options.remoteData ?? null;
  let pushedData = null;

  return {
    isConnected: () => connected,
    isFolderConfigured: () => folderConfigured,
    setConnected: (val) => { connected = val; },
    setFolderConfigured: (val) => { folderConfigured = val; },
    setRemoteData: (data) => { remoteData = data; },
    getPushedData: () => pushedData,
    fetch: async () => ({ data: remoteData }),
    push: async (data) => {
      pushedData = data;
      return { success: true };
    }
  };
}

// =============================================================================
// SYNC ENGINE TESTS
// =============================================================================

export async function testSyncEngineCreation() {
  logSection('SYNC ENGINE CREATION TESTS');

  // Create engine with mock provider
  console.log('\n Creating sync engine...');
  const mockProvider = createMockProvider();
  let localData = { inventory: [], stores: [] };

  const engine = createSyncEngine({
    provider: mockProvider,
    domain: 'test-thrifting',
    getLocalData: async () => localData,
    setLocalData: async (data) => { localData = data; }
  });

  assert(engine.domain === 'test-thrifting', 'Engine has correct domain');
  assert(engine.provider === mockProvider, 'Engine has provider');
  assert(typeof engine.sync === 'function', 'Engine has sync function');
  assert(typeof engine.canSync === 'function', 'Engine has canSync function');
  assert(typeof engine.getStatus === 'function', 'Engine has getStatus function');
  assert(typeof engine.onStatusChange === 'function', 'Engine has onStatusChange function');

  // Initial status
  console.log('\n Checking initial status...');
  assert(engine.getStatus() === SyncStatus.IDLE, 'Initial status is IDLE');
  assert(engine.getError() === null, 'Initial error is null');

  // Can sync when connected and folder configured
  console.log('\n Checking canSync...');
  assert(engine.canSync() === true, 'canSync returns true when connected');

  // Cannot sync when disconnected
  mockProvider.setConnected(false);
  assert(engine.canSync() === false, 'canSync returns false when disconnected');

  // Cannot sync when no folder
  mockProvider.setConnected(true);
  mockProvider.setFolderConfigured(false);
  assert(engine.canSync() === false, 'canSync returns false when no folder');

  console.log('\n✅ All SYNC ENGINE CREATION tests passed!');
  return true;
}

export async function testStatusListeners() {
  logSection('STATUS LISTENER TESTS');

  const mockProvider = createMockProvider();
  let localData = { inventory: [], stores: [] };
  const statusChanges = [];

  const engine = createSyncEngine({
    provider: mockProvider,
    domain: 'test-thrifting',
    getLocalData: async () => localData,
    setLocalData: async (data) => { localData = data; }
  });

  // Subscribe to status changes
  console.log('\n Subscribing to status changes...');
  const unsubscribe = engine.onStatusChange((status, error) => {
    statusChanges.push({ status, error });
  });

  assert(typeof unsubscribe === 'function', 'onStatusChange returns unsubscribe function');

  // Perform sync to trigger status changes
  console.log('\n Performing sync...');
  await engine.sync();

  assert(statusChanges.length >= 2, 'Multiple status changes recorded');
  assert(statusChanges[0].status === SyncStatus.SYNCING, 'First status is SYNCING');
  assert(statusChanges[statusChanges.length - 1].status === SyncStatus.IDLE, 'Final status is IDLE');

  // Unsubscribe
  console.log('\n Testing unsubscribe...');
  const countBefore = statusChanges.length;
  unsubscribe();
  await engine.sync();
  assert(statusChanges.length === countBefore, 'No new changes after unsubscribe');

  console.log('\n✅ All STATUS LISTENER tests passed!');
  return true;
}

export async function testMergeArrays() {
  logSection('MERGE ARRAYS TESTS');

  // We'll test the merge logic by syncing with mock data
  const mockProvider = createMockProvider();
  let localData = { inventory: [], stores: [] };

  const engine = createSyncEngine({
    provider: mockProvider,
    domain: 'test-thrifting',
    getLocalData: async () => localData,
    setLocalData: async (data) => { localData = data; }
  });

  // Local-only items should be preserved
  console.log('\n Testing local-only items preserved...');
  localData = {
    inventory: [
      { id: 'item-1', brand: 'Local Brand', metadata: { updated: '2025-01-20T10:00:00Z' } }
    ],
    stores: []
  };
  mockProvider.setRemoteData(null);
  await engine.sync();
  assert(localData.inventory.length === 1, 'Local item preserved');
  assert(localData.inventory[0].brand === 'Local Brand', 'Local item data preserved');

  // Remote-only items should be merged in
  console.log('\n Testing remote-only items merged...');
  localData = { inventory: [], stores: [] };
  mockProvider.setRemoteData({
    inventory: [
      { id: 'item-2', brand: 'Remote Brand', metadata: { updated: '2025-01-20T10:00:00Z' } }
    ],
    stores: []
  });
  await engine.sync();
  assert(localData.inventory.length === 1, 'Remote item merged in');
  assert(localData.inventory[0].brand === 'Remote Brand', 'Remote item data correct');

  // Both local and remote items should be present
  console.log('\n Testing both local and remote items...');
  localData = {
    inventory: [
      { id: 'item-1', brand: 'Local Brand', metadata: { updated: '2025-01-20T10:00:00Z' } }
    ],
    stores: []
  };
  mockProvider.setRemoteData({
    inventory: [
      { id: 'item-2', brand: 'Remote Brand', metadata: { updated: '2025-01-20T10:00:00Z' } }
    ],
    stores: []
  });
  await engine.sync();
  assert(localData.inventory.length === 2, 'Both items present');
  assert(localData.inventory.find(i => i.id === 'item-1'), 'Local item found');
  assert(localData.inventory.find(i => i.id === 'item-2'), 'Remote item found');

  console.log('\n✅ All MERGE ARRAYS tests passed!');
  return true;
}

export async function testConflictResolution() {
  logSection('CONFLICT RESOLUTION TESTS');

  const mockProvider = createMockProvider();
  let localData = { inventory: [], stores: [] };

  const engine = createSyncEngine({
    provider: mockProvider,
    domain: 'test-thrifting',
    getLocalData: async () => localData,
    setLocalData: async (data) => { localData = data; }
  });

  // Conflict resolution: remote newer wins
  console.log('\n Testing remote newer wins...');
  localData = {
    inventory: [
      { id: 'item-1', brand: 'Local Old', metadata: { updated: '2025-01-20T10:00:00Z' } }
    ],
    stores: []
  };
  mockProvider.setRemoteData({
    inventory: [
      { id: 'item-1', brand: 'Remote New', metadata: { updated: '2025-01-21T10:00:00Z' } }
    ],
    stores: []
  });
  await engine.sync();
  assert(localData.inventory.length === 1, 'Only one item');
  assert(localData.inventory[0].brand === 'Remote New', 'Remote newer version wins');

  // Conflict resolution: local newer wins
  console.log('\n Testing local newer wins...');
  localData = {
    inventory: [
      { id: 'item-1', brand: 'Local New', metadata: { updated: '2025-01-22T10:00:00Z' } }
    ],
    stores: []
  };
  mockProvider.setRemoteData({
    inventory: [
      { id: 'item-1', brand: 'Remote Old', metadata: { updated: '2025-01-21T10:00:00Z' } }
    ],
    stores: []
  });
  await engine.sync();
  assert(localData.inventory.length === 1, 'Only one item');
  assert(localData.inventory[0].brand === 'Local New', 'Local newer version wins');

  // Conflict resolution: same timestamp prefers local
  console.log('\n Testing same timestamp prefers local...');
  localData = {
    inventory: [
      { id: 'item-1', brand: 'Local Same', metadata: { updated: '2025-01-21T10:00:00Z' } }
    ],
    stores: []
  };
  mockProvider.setRemoteData({
    inventory: [
      { id: 'item-1', brand: 'Remote Same', metadata: { updated: '2025-01-21T10:00:00Z' } }
    ],
    stores: []
  });
  await engine.sync();
  assert(localData.inventory.length === 1, 'Only one item');
  assert(localData.inventory[0].brand === 'Local Same', 'Same timestamp keeps local');

  // Supports flat updated_at field
  console.log('\n Testing flat updated_at field...');
  localData = {
    inventory: [
      { id: 'item-1', brand: 'Local', updated_at: '2025-01-20T10:00:00Z' }
    ],
    stores: []
  };
  mockProvider.setRemoteData({
    inventory: [
      { id: 'item-1', brand: 'Remote', updated_at: '2025-01-21T10:00:00Z' }
    ],
    stores: []
  });
  await engine.sync();
  assert(localData.inventory[0].brand === 'Remote', 'Flat updated_at works for comparison');

  console.log('\n✅ All CONFLICT RESOLUTION tests passed!');
  return true;
}

export async function testMergeCollections() {
  logSection('MERGE COLLECTIONS TESTS');

  const mockProvider = createMockProvider();
  let localData = {};

  const engine = createSyncEngine({
    provider: mockProvider,
    domain: 'test-thrifting',
    getLocalData: async () => localData,
    setLocalData: async (data) => { localData = data; }
  });

  // Multiple collections merged correctly
  console.log('\n Testing multiple collections merged...');
  localData = {
    inventory: [{ id: 'inv-1', brand: 'Local Inv', metadata: { updated: '2025-01-20T10:00:00Z' } }],
    stores: [{ id: 'store-1', name: 'Local Store', updated_at: '2025-01-20T10:00:00Z' }],
    trips: [{ id: 'trip-1', date: '2025-01-20', updated_at: '2025-01-20T10:00:00Z' }]
  };
  mockProvider.setRemoteData({
    inventory: [{ id: 'inv-2', brand: 'Remote Inv', metadata: { updated: '2025-01-20T10:00:00Z' } }],
    stores: [{ id: 'store-2', name: 'Remote Store', updated_at: '2025-01-20T10:00:00Z' }],
    expenses: [{ id: 'exp-1', amount: 25, updated_at: '2025-01-20T10:00:00Z' }]
  });
  await engine.sync();

  assert(localData.inventory.length === 2, 'Inventory merged');
  assert(localData.stores.length === 2, 'Stores merged');
  assert(localData.trips.length === 1, 'Local-only trips preserved');
  assert(localData.expenses.length === 1, 'Remote-only expenses added');

  // Empty local, full remote
  console.log('\n Testing empty local, full remote...');
  localData = {};
  mockProvider.setRemoteData({
    inventory: [{ id: 'inv-1', brand: 'Remote', metadata: { updated: '2025-01-20T10:00:00Z' } }],
    stores: [{ id: 'store-1', name: 'Remote Store', updated_at: '2025-01-20T10:00:00Z' }]
  });
  await engine.sync();
  assert(localData.inventory.length === 1, 'Remote inventory imported');
  assert(localData.stores.length === 1, 'Remote stores imported');

  // Full local, empty remote
  console.log('\n Testing full local, empty remote...');
  localData = {
    inventory: [{ id: 'inv-1', brand: 'Local', metadata: { updated: '2025-01-20T10:00:00Z' } }],
    stores: [{ id: 'store-1', name: 'Local Store', updated_at: '2025-01-20T10:00:00Z' }]
  };
  mockProvider.setRemoteData(null);
  await engine.sync();
  assert(localData.inventory.length === 1, 'Local inventory preserved');
  assert(localData.stores.length === 1, 'Local stores preserved');

  console.log('\n✅ All MERGE COLLECTIONS tests passed!');
  return true;
}

export async function testSyncPushBehavior() {
  logSection('SYNC PUSH BEHAVIOR TESTS');

  const mockProvider = createMockProvider();
  let localData = {};

  const engine = createSyncEngine({
    provider: mockProvider,
    domain: 'test-thrifting',
    getLocalData: async () => localData,
    setLocalData: async (data) => { localData = data; }
  });

  // Pushes when local has new data
  console.log('\n Testing push when local has new data...');
  localData = {
    inventory: [{ id: 'item-1', brand: 'New Local', metadata: { updated: '2025-01-22T10:00:00Z' } }]
  };
  mockProvider.setRemoteData({ inventory: [] });
  await engine.sync();
  const pushed = mockProvider.getPushedData();
  assert(pushed !== null, 'Data was pushed');
  assert(pushed.data.inventory.length === 1, 'Pushed inventory has item');

  // Pushes when local is newer
  console.log('\n Testing push when local is newer...');
  localData = {
    inventory: [{ id: 'item-1', brand: 'Newer Local', metadata: { updated: '2025-01-23T10:00:00Z' } }]
  };
  mockProvider.setRemoteData({
    inventory: [{ id: 'item-1', brand: 'Older Remote', metadata: { updated: '2025-01-22T10:00:00Z' } }]
  });
  await engine.sync();
  const pushed2 = mockProvider.getPushedData();
  assert(pushed2 !== null, 'Data was pushed');
  assert(pushed2.data.inventory[0].brand === 'Newer Local', 'Pushed newer local data');

  console.log('\n✅ All SYNC PUSH BEHAVIOR tests passed!');
  return true;
}

export async function testSyncErrorHandling() {
  logSection('SYNC ERROR HANDLING TESTS');

  // Not connected error
  console.log('\n Testing not connected error...');
  const disconnectedProvider = createMockProvider({ connected: false });
  const engine1 = createSyncEngine({
    provider: disconnectedProvider,
    domain: 'test',
    getLocalData: async () => ({}),
    setLocalData: async () => {}
  });

  const result1 = await engine1.sync();
  assert(result1.success === false, 'Sync fails when not connected');
  assert(result1.error.includes('Not connected'), 'Error mentions connection');

  // No folder configured error
  console.log('\n Testing no folder configured error...');
  const noFolderProvider = createMockProvider({ folderConfigured: false });
  const engine2 = createSyncEngine({
    provider: noFolderProvider,
    domain: 'test',
    getLocalData: async () => ({}),
    setLocalData: async () => {}
  });

  const result2 = await engine2.sync();
  assert(result2.success === false, 'Sync fails when no folder');
  assert(result2.error.includes('folder'), 'Error mentions folder');

  // Fetch error sets ERROR status
  console.log('\n Testing fetch error sets ERROR status...');
  const errorProvider = createMockProvider();
  errorProvider.fetch = async () => { throw new Error('Network error'); };

  const engine3 = createSyncEngine({
    provider: errorProvider,
    domain: 'test',
    getLocalData: async () => ({}),
    setLocalData: async () => {}
  });

  const result3 = await engine3.sync();
  assert(result3.success === false, 'Sync fails on fetch error');
  assert(engine3.getStatus() === SyncStatus.ERROR, 'Status is ERROR');
  assert(engine3.getError() === 'Network error', 'Error message captured');

  console.log('\n✅ All SYNC ERROR HANDLING tests passed!');
  return true;
}

// =============================================================================
// EXPORT/IMPORT TESTS
// =============================================================================

export async function testExportFormat() {
  logSection('EXPORT FORMAT TESTS');

  // Create test data
  console.log('\n Creating test data for export...');
  const testItem = await createInventoryItem({
    brand: 'Export Test Brand',
    category: { primary: 'clothing', secondary: 'test' },
    colour: { primary: 'blue' },
    material: { primary: { name: 'cotton', percentage: 100 } },
    size: { label: { value: 'M' } },
    condition: { overall_condition: 'excellent' },
    metadata: { status: 'in_collection', acquisition: { store_id: 'test-store', date: '2025-01-20', price: 10 } }
  });

  // Export data
  console.log('\n Exporting all data...');
  const exported = await exportAllData();

  assert(exported.version, 'Export has version');
  assert(exported.exported_at, 'Export has timestamp');
  assert(Array.isArray(exported.inventory), 'Export has inventory array');
  assert(Array.isArray(exported.stores), 'Export has stores array');
  assert(Array.isArray(exported.archive), 'Export has archive array');
  assert(Array.isArray(exported.trips), 'Export has trips array');
  assert(Array.isArray(exported.expenses), 'Export has expenses array');

  // Verify test item in export
  const exportedItem = exported.inventory.find(i => i.id === testItem.id);
  assert(exportedItem, 'Test item in export');
  assert(exportedItem.brand === 'Export Test Brand', 'Item brand correct');

  // Cleanup
  await deleteInventoryItem(testItem.id);

  console.log('\n✅ All EXPORT FORMAT tests passed!');
  return true;
}

export async function testImportMerge() {
  logSection('IMPORT MERGE TESTS');

  // Create existing data
  console.log('\n Creating existing item...');
  const existingItem = await createInventoryItem({
    brand: 'Existing Brand',
    category: { primary: 'clothing', secondary: 'test' },
    colour: { primary: 'red' },
    material: { primary: { name: 'wool', percentage: 100 } },
    size: { label: { value: 'L' } },
    condition: { overall_condition: 'good' },
    metadata: { status: 'in_collection', acquisition: { store_id: 'test-store', date: '2025-01-20', price: 20 } }
  });

  // Import with merge=false should replace
  console.log('\n Testing import with merge=false (replace)...');
  await importData({
    version: 2,
    inventory: [
      {
        id: 'import-item-1',
        brand: 'Imported Brand',
        category: { primary: 'clothing', secondary: 'imported' },
        colour: { primary: 'green' },
        material: { primary: { name: 'silk', percentage: 100 } },
        size: { label: { value: 'S' } },
        condition: { overall_condition: 'excellent' },
        metadata: { status: 'in_collection', acquisition: { store_id: 'import-store', date: '2025-01-21', price: 30 } }
      }
    ],
    stores: []
  }, false);

  const afterReplace = await getAllInventory();
  assert(afterReplace.length === 1, 'Only imported items remain');
  assert(afterReplace[0].id === 'import-item-1', 'Imported item present');
  assert(!afterReplace.find(i => i.id === existingItem.id), 'Existing item replaced');

  // Import with merge=true should add
  console.log('\n Testing import with merge=true...');
  await importData({
    version: 2,
    inventory: [
      {
        id: 'merge-item-1',
        brand: 'Merged Brand',
        category: { primary: 'shoes', secondary: 'boots' },
        colour: { primary: 'black' },
        material: { primary: { name: 'leather', percentage: 100 } },
        size: { label: { value: '10' } },
        condition: { overall_condition: 'very_good' },
        metadata: { status: 'in_collection', acquisition: { store_id: 'merge-store', date: '2025-01-22', price: 40 } }
      }
    ],
    stores: []
  }, true);

  const afterMerge = await getAllInventory();
  assert(afterMerge.length === 2, 'Both existing and merged items present');
  assert(afterMerge.find(i => i.id === 'import-item-1'), 'Previous import item still present');
  assert(afterMerge.find(i => i.id === 'merge-item-1'), 'Merged item added');

  // Cleanup
  await deleteInventoryItem('import-item-1');
  await deleteInventoryItem('merge-item-1');

  console.log('\n✅ All IMPORT MERGE tests passed!');
  return true;
}

export async function testSchemaMigration() {
  logSection('SCHEMA MIGRATION TESTS');

  // Import old flat schema format
  console.log('\n Testing import of old flat schema...');
  await importData({
    version: 1,
    inventory: [
      {
        id: 'old-schema-item',
        brand: 'Vintage Brand',
        category: 'clothing',
        subcategory: 'dress',
        primary_colour: 'purple',
        secondary_colour: 'gold',
        primary_material: 'velvet',
        labeled_size: '6',
        overall_condition: 'excellent',
        acquisition_date: '2025-01-15',
        purchase_price: 35.00,
        store_id: 'vintage-store',
        status: 'in_collection'
      }
    ],
    stores: []
  }, false);

  // Verify migration to nested schema
  console.log('\n Verifying schema migration...');
  const migrated = await getAllInventory();
  const item = migrated.find(i => i.id === 'old-schema-item');

  assert(item, 'Migrated item exists');
  assert(item.category?.primary === 'clothing', 'Category migrated to nested');
  assert(item.category?.secondary === 'dress', 'Subcategory migrated');
  assert(item.colour?.primary === 'purple', 'Primary colour migrated');
  assert(item.colour?.secondary === 'gold', 'Secondary colour migrated');
  assert(item.material?.primary === 'velvet', 'Material migrated');
  assert(item.size?.label?.value === '6', 'Size label migrated');
  assert(item.condition?.overall_condition === 'excellent', 'Condition migrated');
  assert(item.metadata?.acquisition?.date === '2025-01-15', 'Acquisition date migrated');
  assert(item.metadata?.acquisition?.price === 35.00, 'Purchase price migrated');
  assert(item.metadata?.acquisition?.store_id === 'vintage-store', 'Store ID migrated');
  assert(item.metadata?.status === 'in_collection', 'Status migrated');

  // Cleanup
  await deleteInventoryItem('old-schema-item');

  console.log('\n✅ All SCHEMA MIGRATION tests passed!');
  return true;
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

export async function runAllTests() {
  console.log('\n🧪 SYNC MODULE TEST SUITE\n');
  console.log('Testing sync engine, merge logic, and export/import...\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'Sync Engine Creation', fn: testSyncEngineCreation },
    { name: 'Status Listeners', fn: testStatusListeners },
    { name: 'Merge Arrays', fn: testMergeArrays },
    { name: 'Conflict Resolution', fn: testConflictResolution },
    { name: 'Merge Collections', fn: testMergeCollections },
    { name: 'Sync Push Behavior', fn: testSyncPushBehavior },
    { name: 'Sync Error Handling', fn: testSyncErrorHandling },
    { name: 'Export Format', fn: testExportFormat },
    { name: 'Import Merge', fn: testImportMerge },
    { name: 'Schema Migration', fn: testSchemaMigration }
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
  window.syncTests = {
    runAllTests,
    testSyncEngineCreation,
    testStatusListeners,
    testMergeArrays,
    testConflictResolution,
    testMergeCollections,
    testSyncPushBehavior,
    testSyncErrorHandling,
    testExportFormat,
    testImportMerge,
    testSchemaMigration
  };
}
