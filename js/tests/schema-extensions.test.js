/**
 * Schema Extensions Tests
 * Run in browser console after importing:
 *   import('/js/tests/schema-extensions.test.js').then(m => m.runAllTests())
 *
 * Or run individual tests:
 *   import('/js/tests/schema-extensions.test.js').then(m => m.testTrips())
 */

import {
  createTrip,
  getTrip,
  getAllTrips,
  getTripsByDate,
  updateTrip,
  deleteTrip,
  getUnsyncedTrips,
  markTripsSynced
} from '../db/trips.js';
import {
  createExpense,
  getExpense,
  getAllExpenses,
  getExpensesByCategory,
  getExpensesByTrip,
  getExpensesByItem,
  getExpensesByDateRange,
  updateExpense,
  deleteExpense,
  getUnsyncedExpenses,
  markExpensesSynced
} from '../db/expenses.js';
import {
  getKnowledge,
  updateKnowledge,
  upsertBrandKnowledge,
  getBrandKnowledge,
  deleteBrandKnowledge,
  getUnsyncedKnowledge,
  markKnowledgeSynced
} from '../db/knowledge.js';
import { exportAllData } from '../db/export.js';

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
// TRIPS TESTS
// =============================================================================

export async function testTrips() {
  logSection('TRIPS CRUD TESTS');

  // Create trip
  console.log('\n Creating trip...');
  const trip = await createTrip({
    date: '2025-01-21',
    stores: [
      { storeId: 'store-001', arrived: '10:30', departed: '11:15' },
      { storeId: 'store-002', arrived: '11:30', departed: '12:00' }
    ],
    notes: 'Test sourcing trip'
  });

  assert(trip.id, 'Trip has ID');
  assert(trip.date === '2025-01-21', 'Trip has correct date');
  assert(trip.stores.length === 2, 'Trip has 2 stores');
  assert(trip.created_at, 'Trip has created_at timestamp');
  assert(trip.updated_at, 'Trip has updated_at timestamp');
  assert(trip.unsynced === true, 'Trip marked as unsynced');

  // Get trip
  console.log('\n Getting trip by ID...');
  const fetched = await getTrip(trip.id);
  assert(fetched.id === trip.id, 'Fetched trip matches created trip');

  // Get all trips
  console.log('\n Getting all trips...');
  const allTrips = await getAllTrips();
  assert(allTrips.length >= 1, 'getAllTrips returns at least 1 trip');
  assert(allTrips.find(t => t.id === trip.id), 'Created trip in all trips');

  // Get trips by date
  console.log('\n Getting trips by date...');
  const tripsByDate = await getTripsByDate('2025-01-21');
  assert(tripsByDate.find(t => t.id === trip.id), 'Trip found by date index');

  // Update trip
  console.log('\n Updating trip...');
  const updated = await updateTrip(trip.id, {
    notes: 'Updated test sourcing trip'
  });
  assert(updated.notes === 'Updated test sourcing trip', 'Trip notes updated');
  assert(updated.updated_at > trip.updated_at, 'Updated_at timestamp changed');

  // Get unsynced trips
  console.log('\n Getting unsynced trips...');
  const unsynced = await getUnsyncedTrips();
  assert(unsynced.find(t => t.id === trip.id), 'Trip in unsynced list');

  // Mark synced
  console.log('\n Marking trip as synced...');
  await markTripsSynced([trip.id]);
  const afterSync = await getTrip(trip.id);
  assert(afterSync.unsynced === false, 'Trip marked as synced');
  assert(afterSync.synced_at, 'Trip has synced_at timestamp');

  // Delete trip
  console.log('\n Deleting trip...');
  await deleteTrip(trip.id);
  const deleted = await getTrip(trip.id);
  assert(!deleted, 'Trip deleted successfully');

  console.log('\n✅ All TRIPS tests passed!');
  return true;
}

// =============================================================================
// EXPENSES TESTS
// =============================================================================

export async function testExpenses() {
  logSection('EXPENSES CRUD TESTS');

  // First create a trip to link expense to
  const trip = await createTrip({
    date: '2025-01-21',
    stores: [{ storeId: 'store-001', arrived: '10:00', departed: '11:00' }]
  });

  // Create expense
  console.log('\n Creating expense...');
  const expense = await createExpense({
    date: '2025-01-21',
    category: 'fuel',
    amount: 25.50,
    tripId: trip.id,
    notes: 'Gas for sourcing trip'
  });

  assert(expense.id, 'Expense has ID');
  assert(expense.date === '2025-01-21', 'Expense has correct date');
  assert(expense.category === 'fuel', 'Expense has correct category');
  assert(expense.amount === 25.50, 'Expense has correct amount');
  assert(expense.tripId === trip.id, 'Expense linked to trip');
  assert(expense.created_at, 'Expense has created_at timestamp');
  assert(expense.unsynced === true, 'Expense marked as unsynced');

  // Create item-linked expense
  console.log('\n Creating item-linked expense...');
  const itemExpense = await createExpense({
    date: '2025-01-21',
    category: 'shipping_supplies',
    amount: 5.00,
    itemId: 'test-item-001',
    notes: 'Poly mailer for item'
  });
  assert(itemExpense.itemId === 'test-item-001', 'Expense linked to item');

  // Get expense
  console.log('\n Getting expense by ID...');
  const fetched = await getExpense(expense.id);
  assert(fetched.id === expense.id, 'Fetched expense matches created expense');

  // Get all expenses
  console.log('\n Getting all expenses...');
  const allExpenses = await getAllExpenses();
  assert(allExpenses.length >= 2, 'getAllExpenses returns at least 2 expenses');

  // Get by category
  console.log('\n Getting expenses by category...');
  const fuelExpenses = await getExpensesByCategory('fuel');
  assert(fuelExpenses.find(e => e.id === expense.id), 'Expense found by category');

  // Get by trip
  console.log('\n Getting expenses by trip...');
  const tripExpenses = await getExpensesByTrip(trip.id);
  assert(tripExpenses.find(e => e.id === expense.id), 'Expense found by trip');

  // Get by item
  console.log('\n Getting expenses by item...');
  const itemExpenses = await getExpensesByItem('test-item-001');
  assert(itemExpenses.find(e => e.id === itemExpense.id), 'Expense found by item');

  // Get by date range
  console.log('\n Getting expenses by date range...');
  const rangeExpenses = await getExpensesByDateRange('2025-01-01', '2025-01-31');
  assert(rangeExpenses.find(e => e.id === expense.id), 'Expense found in date range');

  // Update expense
  console.log('\n Updating expense...');
  const updated = await updateExpense(expense.id, {
    amount: 30.00,
    notes: 'Updated gas expense'
  });
  assert(updated.amount === 30.00, 'Expense amount updated');
  assert(updated.notes === 'Updated gas expense', 'Expense notes updated');

  // Get unsynced expenses
  console.log('\n Getting unsynced expenses...');
  const unsynced = await getUnsyncedExpenses();
  assert(unsynced.length >= 2, 'At least 2 unsynced expenses');

  // Mark synced
  console.log('\n Marking expenses as synced...');
  await markExpensesSynced([expense.id]);
  const afterSync = await getExpense(expense.id);
  assert(afterSync.unsynced === false, 'Expense marked as synced');

  // Delete expenses
  console.log('\n Deleting expenses...');
  await deleteExpense(expense.id);
  await deleteExpense(itemExpense.id);
  await deleteTrip(trip.id);
  const deleted = await getExpense(expense.id);
  assert(!deleted, 'Expense deleted successfully');

  console.log('\n✅ All EXPENSES tests passed!');
  return true;
}

// =============================================================================
// KNOWLEDGE TESTS
// =============================================================================

export async function testKnowledge() {
  logSection('KNOWLEDGE CRUD TESTS');

  // Get initial knowledge (should return default structure)
  console.log('\n Getting initial knowledge...');
  const initial = await getKnowledge();
  assert(initial.id === 'knowledge-base', 'Knowledge has correct ID');
  assert(typeof initial.brands === 'object', 'Knowledge has brands object');
  assert(typeof initial.platformTips === 'object', 'Knowledge has platformTips object');
  assert(typeof initial.stores === 'object', 'Knowledge has stores object');

  // Upsert brand knowledge
  console.log('\n Upserting brand knowledge...');
  const escadaBrand = await upsertBrandKnowledge('escada', {
    name: 'Escada',
    notes: 'Margaretha Ley era (pre-1992) most valuable. Look for Made in W. Germany labels.',
    priceRange: { low: 20, high: 200 },
    keywords: ['designer', 'german', 'vintage']
  });

  assert(escadaBrand.name === 'Escada', 'Brand name saved');
  assert(escadaBrand.priceRange.high === 200, 'Brand price range saved');
  assert(escadaBrand.updated_at, 'Brand has updated_at');

  // Get brand knowledge
  console.log('\n Getting brand knowledge...');
  const fetchedBrand = await getBrandKnowledge('escada');
  assert(fetchedBrand.name === 'Escada', 'Brand fetched successfully');

  // Update existing brand
  console.log('\n Updating existing brand...');
  const updatedBrand = await upsertBrandKnowledge('escada', {
    notes: 'Updated notes - check for Escada Sport line as well'
  });
  assert(updatedBrand.notes.includes('Updated notes'), 'Brand notes merged');
  assert(updatedBrand.name === 'Escada', 'Original fields preserved');

  // Update knowledge with platformTips
  console.log('\n Updating platform tips...');
  const withTips = await updateKnowledge({
    platformTips: {
      ebay: { tip: 'Use auction format for rare items' },
      poshmark: { tip: 'Share listings during party times' }
    }
  });
  assert(withTips.platformTips.ebay.tip, 'Platform tips added');
  assert(withTips.brands.escada, 'Existing brands preserved');

  // Check unsynced
  console.log('\n Checking unsynced knowledge...');
  const unsynced = await getUnsyncedKnowledge();
  assert(unsynced.length === 1, 'Knowledge in unsynced list');
  assert(unsynced[0].id === 'knowledge-base', 'Correct doc in unsynced');

  // Mark synced
  console.log('\n Marking knowledge as synced...');
  await markKnowledgeSynced();
  const afterSync = await getKnowledge();
  assert(afterSync.unsynced === false, 'Knowledge marked as synced');
  assert(afterSync.synced_at, 'Knowledge has synced_at');

  // Delete brand
  console.log('\n Deleting brand knowledge...');
  await deleteBrandKnowledge('escada');
  const deletedBrand = await getBrandKnowledge('escada');
  assert(!deletedBrand, 'Brand deleted successfully');

  console.log('\n✅ All KNOWLEDGE tests passed!');
  return true;
}

// =============================================================================
// EXPORT/IMPORT TESTS
// =============================================================================

export async function testExport() {
  logSection('EXPORT TESTS');

  // Create test data
  const trip = await createTrip({
    date: '2025-01-21',
    stores: [{ storeId: 'store-001', arrived: '10:00', departed: '11:00' }]
  });

  const expense = await createExpense({
    date: '2025-01-21',
    category: 'fuel',
    amount: 20.00
  });

  await upsertBrandKnowledge('test-brand', { name: 'Test Brand' });

  // Export all data
  console.log('\n Exporting all data...');
  const exported = await exportAllData();

  assert(exported.version, 'Export has version');
  assert(exported.exported_at, 'Export has timestamp');
  assert(Array.isArray(exported.inventory), 'Export has inventory array');
  assert(Array.isArray(exported.stores), 'Export has stores array');
  assert(Array.isArray(exported.archive), 'Export has archive array');
  assert(Array.isArray(exported.trips), 'Export has trips array');
  assert(Array.isArray(exported.expenses), 'Export has expenses array');
  assert(exported.trips.find(t => t.id === trip.id), 'Trip in export');
  assert(exported.expenses.find(e => e.id === expense.id), 'Expense in export');

  // Check knowledge in export
  if (exported.knowledge) {
    assert(exported.knowledge.id === 'knowledge-base', 'Knowledge in export');
  }

  // Cleanup
  await deleteTrip(trip.id);
  await deleteExpense(expense.id);
  await deleteBrandKnowledge('test-brand');

  console.log('\n✅ All EXPORT tests passed!');
  return true;
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

export async function runAllTests() {
  console.log('\n🧪 SCHEMA EXTENSIONS TEST SUITE\n');
  console.log('Testing trips, expenses, and knowledge CRUD operations...\n');

  let passed = 0;
  let failed = 0;

  try {
    await testTrips();
    passed++;
  } catch (err) {
    console.error('❌ TRIPS tests failed:', err.message);
    failed++;
  }

  try {
    await testExpenses();
    passed++;
  } catch (err) {
    console.error('❌ EXPENSES tests failed:', err.message);
    failed++;
  }

  try {
    await testKnowledge();
    passed++;
  } catch (err) {
    console.error('❌ KNOWLEDGE tests failed:', err.message);
    failed++;
  }

  try {
    await testExport();
    passed++;
  } catch (err) {
    console.error('❌ EXPORT tests failed:', err.message);
    failed++;
  }

  console.log('\n' + '='.repeat(50));
  console.log(`  TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return { passed, failed };
}

// Export for window access if needed
if (typeof window !== 'undefined') {
  window.schemaTests = {
    runAllTests,
    testTrips,
    testExpenses,
    testKnowledge,
    testExport
  };
}
