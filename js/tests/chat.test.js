/**
 * Chat Module Tests
 * Run in browser console after importing:
 *   import('/js/tests/chat.test.js').then(m => m.runAllTests())
 *
 * Or run via Node.js test runner:
 *   node js/tests/run-node-tests.mjs --all
 */

import { _test } from '../chat.js';
import * as db from '../db.js';

const {
  getState,
  setState,
  resetState,
  generateMockResponse,
  selectRandom,
  generateId,
  escapeHtml,
  MOCK_RESPONSES,
  persistState,
  loadPersistedState,
  STORAGE_KEY,
  isSpeechSupported,
  getSpeechRecognition,
  // Action handlers
  handleAdvisorAction,
  handleStartTripAction,
  handleEndTripAction,
  handleLogItemAction,
  handleUpdateItemAction,
  handleKnowledgeUpdate,
  // Helper functions
  mapActionToInventoryItem,
  buildNestedUpdate,
  findStoreByName,
  buildContext
} = _test;

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
// STATE MANAGEMENT TESTS
// =============================================================================

export async function testStateManagement() {
  logSection('STATE MANAGEMENT TESTS');

  // Reset state for clean test
  resetState();

  console.log('\n Testing initial state...');
  let state = getState();
  assert(Array.isArray(state.messages), 'messages is an array');
  assert(state.messages.length === 0, 'messages starts empty');
  assert(state.isOnTrip === false, 'isOnTrip starts false');
  assert(state.tripStore === null, 'tripStore starts null');
  assert(state.tripItemCount === 0, 'tripItemCount starts at 0');
  assert(state.connectionStatus === 'online', 'connectionStatus starts online');
  assert(Array.isArray(state.messageQueue), 'messageQueue is an array');

  console.log('\n Testing setState...');
  setState({
    isOnTrip: true,
    tripStore: 'Goodwill',
    tripItemCount: 3
  });

  state = getState();
  assert(state.isOnTrip === true, 'isOnTrip updated');
  assert(state.tripStore === 'Goodwill', 'tripStore updated');
  assert(state.tripItemCount === 3, 'tripItemCount updated');

  console.log('\n Testing resetState...');
  resetState();
  state = getState();
  assert(state.isOnTrip === false, 'isOnTrip reset');
  assert(state.tripStore === null, 'tripStore reset');
  assert(state.tripItemCount === 0, 'tripItemCount reset');

  console.log('\n✅ State management tests passed!');
  return true;
}

// =============================================================================
// MOCK RESPONSE TESTS
// =============================================================================

export async function testMockResponses() {
  logSection('MOCK RESPONSE TESTS');
  resetState();

  console.log('\n Testing greeting responses...');
  const greetings = ['hi', 'Hello', 'hey there', 'sup'];
  for (const greeting of greetings) {
    const response = generateMockResponse(greeting);
    assert(
      MOCK_RESPONSES.greeting.includes(response),
      `Greeting "${greeting}" returns valid response`
    );
  }

  console.log('\n Testing brand-specific responses...');
  const brands = [
    { query: 'is pendleton worth it?', brand: 'pendleton' },
    { query: 'found an escada blazer', brand: 'escada' },
    { query: 'coogi sweater price', brand: 'coogi' },
    { query: 'st john knit suit', brand: 'st john' },
    { query: 'burberry trench', brand: 'burberry' }
  ];

  for (const { query, brand } of brands) {
    const response = generateMockResponse(query);
    assert(
      response === MOCK_RESPONSES.brand_query[brand],
      `Query "${query}" returns ${brand} response`
    );
  }

  console.log('\n Testing unknown brand fallback...');
  const unknownBrand = generateMockResponse('what about random brand xyz');
  assert(
    unknownBrand === MOCK_RESPONSES.brand_query.default ||
    MOCK_RESPONSES.generic.includes(unknownBrand),
    'Unknown brand returns default or generic response'
  );

  console.log('\n Testing pricing-related queries...');
  const pricingQueries = ['what price should I list', 'is it worth selling', 'estimated value'];
  for (const query of pricingQueries) {
    const response = generateMockResponse(query);
    assert(
      MOCK_RESPONSES.pricing_tips.includes(response),
      `Pricing query "${query}" returns pricing tip`
    );
  }

  console.log('\n Testing item found responses (on trip)...');
  setState({ isOnTrip: true });
  const itemQueries = ['I found a coat', 'here is a nice dress', 'looking at some shoes'];
  for (const query of itemQueries) {
    const response = generateMockResponse(query);
    assert(
      MOCK_RESPONSES.item_found.includes(response),
      `Item query "${query}" on trip returns item_found response`
    );
  }
  resetState();

  console.log('\n Testing generic fallback...');
  const genericQuery = 'random text that does not match anything';
  const genericResponse = generateMockResponse(genericQuery);
  assert(
    MOCK_RESPONSES.generic.includes(genericResponse),
    'Generic query returns generic response'
  );

  console.log('\n✅ Mock response tests passed!');
  return true;
}

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

export async function testUtilityFunctions() {
  logSection('UTILITY FUNCTION TESTS');

  console.log('\n Testing generateId...');
  const id1 = generateId();
  const id2 = generateId();
  assert(typeof id1 === 'string', 'generateId returns string');
  assert(id1.startsWith('msg-'), 'ID starts with msg-');
  assert(id1 !== id2, 'IDs are unique');
  assert(id1.length > 15, 'ID has sufficient length');

  console.log('\n Testing selectRandom...');
  const arr = ['a', 'b', 'c', 'd', 'e'];
  const selected = new Set();
  for (let i = 0; i < 100; i++) {
    selected.add(selectRandom(arr));
  }
  assert(selected.size > 1, 'selectRandom returns varied results');
  for (const item of selected) {
    assert(arr.includes(item), `Selected item "${item}" is from array`);
  }

  console.log('\n Testing escapeHtml...');
  const testCases = [
    { input: '<script>alert("xss")</script>', expected: '&lt;script&gt;alert("xss")&lt;/script&gt;' },
    { input: 'Hello & goodbye', expected: 'Hello &amp; goodbye' },
    { input: '"quotes" and \'apostrophes\'', expected: '"quotes" and \'apostrophes\'' },
    { input: 'Normal text', expected: 'Normal text' }
  ];

  for (const { input, expected } of testCases) {
    const result = escapeHtml(input);
    assert(result === expected, `escapeHtml("${input}") = "${result}"`);
  }

  console.log('\n✅ Utility function tests passed!');
  return true;
}

// =============================================================================
// PERSISTENCE TESTS
// =============================================================================

export async function testPersistence() {
  logSection('PERSISTENCE TESTS');

  // Clear any existing state
  localStorage.removeItem(STORAGE_KEY);
  resetState();

  console.log('\n Testing persistState...');
  setState({
    messages: [
      { id: 'msg-1', role: 'user', content: 'Hello', timestamp: Date.now() },
      { id: 'msg-2', role: 'assistant', content: 'Hi there!', timestamp: Date.now() }
    ],
    isOnTrip: true,
    tripStore: 'Salvation Army',
    tripItemCount: 2,
    messageQueue: [{ id: 'q-1', content: 'queued msg', timestamp: Date.now() }]
  });

  persistState();

  const stored = localStorage.getItem(STORAGE_KEY);
  assert(stored !== null, 'State persisted to localStorage');

  const parsed = JSON.parse(stored);
  assert(parsed.messages.length === 2, 'Messages persisted');
  assert(parsed.isOnTrip === true, 'isOnTrip persisted');
  assert(parsed.tripStore === 'Salvation Army', 'tripStore persisted');
  assert(parsed.tripItemCount === 2, 'tripItemCount persisted');
  assert(parsed.messageQueue.length === 1, 'messageQueue persisted');

  console.log('\n Testing loadPersistedState...');
  resetState();
  let state = getState();
  assert(state.messages.length === 0, 'State reset before load');

  loadPersistedState();
  state = getState();
  assert(state.messages.length === 2, 'Messages loaded from localStorage');
  assert(state.isOnTrip === true, 'isOnTrip loaded');
  assert(state.tripStore === 'Salvation Army', 'tripStore loaded');
  assert(state.tripItemCount === 2, 'tripItemCount loaded');
  assert(state.messageQueue.length === 1, 'messageQueue loaded');

  console.log('\n Testing message limit (50 max)...');
  const manyMessages = [];
  for (let i = 0; i < 60; i++) {
    manyMessages.push({ id: `msg-${i}`, role: 'user', content: `Message ${i}`, timestamp: Date.now() });
  }
  setState({ messages: manyMessages });
  persistState();

  const storedAfter = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert(storedAfter.messages.length === 50, 'Messages limited to 50');
  assert(storedAfter.messages[0].content === 'Message 10', 'Oldest messages dropped');

  console.log('\n Testing load with corrupted data...');
  localStorage.setItem(STORAGE_KEY, 'not valid json');
  resetState();
  loadPersistedState(); // Should not throw
  state = getState();
  assert(state.messages.length === 0, 'Corrupted data handled gracefully');

  console.log('\n Testing load with missing key...');
  localStorage.removeItem(STORAGE_KEY);
  resetState();
  loadPersistedState(); // Should not throw
  state = getState();
  assert(state.messages.length === 0, 'Missing data handled gracefully');

  // Cleanup
  localStorage.removeItem(STORAGE_KEY);
  resetState();

  console.log('\n✅ Persistence tests passed!');
  return true;
}

// =============================================================================
// TRIP STATE TESTS
// =============================================================================

export async function testTripState() {
  logSection('TRIP STATE TESTS');
  resetState();

  console.log('\n Testing trip start...');
  setState({
    isOnTrip: true,
    tripStore: 'Goodwill Downtown',
    tripItemCount: 0
  });

  let state = getState();
  assert(state.isOnTrip === true, 'Trip started');
  assert(state.tripStore === 'Goodwill Downtown', 'Store name set');
  assert(state.tripItemCount === 0, 'Item count starts at 0');

  console.log('\n Testing item logging during trip...');
  setState({ tripItemCount: 1 });
  state = getState();
  assert(state.tripItemCount === 1, 'First item logged');

  setState({ tripItemCount: 5 });
  state = getState();
  assert(state.tripItemCount === 5, 'Multiple items logged');

  console.log('\n Testing trip end...');
  setState({
    isOnTrip: false,
    tripStore: null,
    tripItemCount: 0
  });

  state = getState();
  assert(state.isOnTrip === false, 'Trip ended');
  assert(state.tripStore === null, 'Store cleared');
  assert(state.tripItemCount === 0, 'Item count reset');

  console.log('\n✅ Trip state tests passed!');
  return true;
}

// =============================================================================
// MESSAGE QUEUE TESTS
// =============================================================================

export async function testMessageQueue() {
  logSection('MESSAGE QUEUE TESTS');
  resetState();

  console.log('\n Testing queue when offline...');
  setState({ connectionStatus: 'offline' });

  const queuedMsg1 = { id: generateId(), content: 'Offline message 1', timestamp: Date.now() };
  const queuedMsg2 = { id: generateId(), content: 'Offline message 2', timestamp: Date.now() };

  setState({
    messageQueue: [queuedMsg1, queuedMsg2]
  });

  let state = getState();
  assert(state.messageQueue.length === 2, 'Messages queued');
  assert(state.connectionStatus === 'offline', 'Status is offline');

  console.log('\n Testing queue persists with state...');
  persistState();
  resetState();
  loadPersistedState();

  state = getState();
  assert(state.messageQueue.length === 2, 'Queue persisted and loaded');

  console.log('\n Testing queue clear on online...');
  setState({
    connectionStatus: 'online',
    messageQueue: []
  });

  state = getState();
  assert(state.messageQueue.length === 0, 'Queue cleared');
  assert(state.connectionStatus === 'online', 'Status is online');

  // Cleanup
  localStorage.removeItem(STORAGE_KEY);
  resetState();

  console.log('\n✅ Message queue tests passed!');
  return true;
}

// =============================================================================
// MOCK RESPONSES DATA STRUCTURE TESTS
// =============================================================================

export async function testMockResponsesStructure() {
  logSection('MOCK RESPONSES STRUCTURE TESTS');

  console.log('\n Testing greeting responses array...');
  assert(Array.isArray(MOCK_RESPONSES.greeting), 'greeting is an array');
  assert(MOCK_RESPONSES.greeting.length >= 2, 'At least 2 greeting responses');
  for (const g of MOCK_RESPONSES.greeting) {
    assert(typeof g === 'string', 'Greeting is a string');
    assert(g.length > 0, 'Greeting is not empty');
  }

  console.log('\n Testing brand_query object...');
  assert(typeof MOCK_RESPONSES.brand_query === 'object', 'brand_query is an object');
  const requiredBrands = ['pendleton', 'escada', 'coogi', 'burberry', 'default'];
  for (const brand of requiredBrands) {
    assert(brand in MOCK_RESPONSES.brand_query, `brand_query has ${brand}`);
    assert(typeof MOCK_RESPONSES.brand_query[brand] === 'string', `${brand} response is string`);
  }

  console.log('\n Testing trip messages...');
  assert(typeof MOCK_RESPONSES.trip_start === 'string', 'trip_start is a string');
  assert(MOCK_RESPONSES.trip_start.includes('{store}'), 'trip_start has {store} placeholder');
  assert(typeof MOCK_RESPONSES.trip_end === 'string', 'trip_end is a string');
  assert(MOCK_RESPONSES.trip_end.includes('{count}'), 'trip_end has {count} placeholder');

  console.log('\n Testing item_found array...');
  assert(Array.isArray(MOCK_RESPONSES.item_found), 'item_found is an array');
  assert(MOCK_RESPONSES.item_found.length >= 2, 'At least 2 item_found responses');

  console.log('\n Testing generic array...');
  assert(Array.isArray(MOCK_RESPONSES.generic), 'generic is an array');
  assert(MOCK_RESPONSES.generic.length >= 3, 'At least 3 generic responses');

  console.log('\n Testing pricing_tips array...');
  assert(Array.isArray(MOCK_RESPONSES.pricing_tips), 'pricing_tips is an array');
  assert(MOCK_RESPONSES.pricing_tips.length >= 2, 'At least 2 pricing tips');

  console.log('\n✅ Mock responses structure tests passed!');
  return true;
}

// =============================================================================
// SPEECH RECOGNITION TESTS
// =============================================================================

export async function testSpeechRecognition() {
  logSection('SPEECH RECOGNITION TESTS');
  resetState();

  console.log('\n Testing isRecording initial state...');
  let state = getState();
  assert(state.isRecording === false, 'isRecording starts false');

  console.log('\n Testing isRecording state changes...');
  setState({ isRecording: true });
  state = getState();
  assert(state.isRecording === true, 'isRecording can be set to true');

  setState({ isRecording: false });
  state = getState();
  assert(state.isRecording === false, 'isRecording can be set to false');

  console.log('\n Testing resetState includes isRecording...');
  setState({ isRecording: true });
  resetState();
  state = getState();
  assert(state.isRecording === false, 'resetState resets isRecording');

  console.log('\n Testing isSpeechSupported helper...');
  const supported = isSpeechSupported();
  assert(typeof supported === 'boolean', 'isSpeechSupported returns boolean');
  // In Node.js environment, this will be false since there's no SpeechRecognition
  console.log(`  Speech recognition supported: ${supported}`);

  console.log('\n Testing getSpeechRecognition helper...');
  const recognition = getSpeechRecognition();
  // In Node.js without setup, this will be null
  assert(recognition === null || typeof recognition === 'object', 'getSpeechRecognition returns null or object');

  console.log('\n Testing isRecording persists with state...');
  setState({
    messages: [{ id: 'msg-1', role: 'user', content: 'Test', timestamp: Date.now() }],
    isRecording: true
  });
  persistState();

  // Note: isRecording is intentionally NOT persisted to localStorage
  // (you don't want to restore a recording state on page reload)
  // So after load, isRecording should be reset to false or undefined
  resetState();
  loadPersistedState();
  state = getState();
  // isRecording should not persist (or should be false after load)
  assert(state.isRecording === false || state.isRecording === undefined, 'isRecording does not persist to storage');

  // Cleanup
  localStorage.removeItem(STORAGE_KEY);
  resetState();

  console.log('\n✅ Speech recognition tests passed!');
  return true;
}

// =============================================================================
// ACTION HANDLER TESTS
// =============================================================================

export async function testActionHandlers() {
  logSection('ACTION HANDLER TESTS');
  resetState();

  console.log('\n Testing unknown action returns failure...');
  const unknownResult = await handleAdvisorAction({ type: 'unknown_action', data: {} });
  assert(unknownResult.success === false, 'Unknown action returns failure');
  assert(unknownResult.message.includes('Unknown action'), 'Error message mentions unknown action');

  console.log('\n Testing update_item fails without prior item...');
  const updateWithoutItem = await handleUpdateItemAction({ field: 'purchaseCost', value: 25 });
  assert(updateWithoutItem.success === false, 'update_item fails without prior item');
  assert(updateWithoutItem.message.includes('No recent item'), 'Error mentions no recent item');

  console.log('\n Testing update_item fails with missing field...');
  setState({ lastLoggedItemId: 'test-item-123' });
  const updateMissingField = await handleUpdateItemAction({ value: 25 });
  assert(updateMissingField.success === false, 'update_item fails with missing field');
  assert(updateMissingField.message.includes('Missing field'), 'Error mentions missing field');

  console.log('\n Testing update_item fails with missing value...');
  const updateMissingValue = await handleUpdateItemAction({ field: 'purchaseCost' });
  assert(updateMissingValue.success === false, 'update_item fails with missing value');

  console.log('\n Testing update_item fails with unknown field...');
  const updateUnknownField = await handleUpdateItemAction({ field: 'unknownField', value: 'test' });
  assert(updateUnknownField.success === false, 'update_item fails with unknown field');
  assert(updateUnknownField.message.includes('Unknown field'), 'Error mentions unknown field');

  console.log('\n Testing end_trip fails when no trip active...');
  resetState();
  const endWithoutTrip = await handleEndTripAction();
  assert(endWithoutTrip.success === false, 'end_trip fails without active trip');
  assert(endWithoutTrip.message.includes('No active trip'), 'Error mentions no active trip');

  console.log('\n Testing start_trip fails without store name...');
  const startWithoutStore = await handleStartTripAction({});
  assert(startWithoutStore.success === false, 'start_trip fails without store name');
  assert(startWithoutStore.message.includes('No store name'), 'Error mentions no store name');

  console.log('\n Testing log_item fails with insufficient data...');
  const logInsufficientData = await handleLogItemAction({});
  assert(logInsufficientData.success === false, 'log_item fails with no data');
  assert(logInsufficientData.message.includes('Insufficient'), 'Error mentions insufficient data');

  resetState();

  console.log('\n✅ Action handler tests passed!');
  return true;
}

// =============================================================================
// ACTION HANDLER INTEGRATION TESTS (with database)
// =============================================================================

export async function testStartTripAction() {
  logSection('START TRIP ACTION TESTS');
  resetState();

  console.log('\n Testing start_trip creates trip record...');
  const result = await handleStartTripAction({ storeName: 'Goodwill Downtown' });
  assert(result.success === true, 'start_trip succeeds');
  assert(result.message.includes('Trip started'), 'Success message confirms trip started');
  assert(result.message.includes('Goodwill Downtown'), 'Message includes store name');

  console.log('\n Testing state updated after start_trip...');
  const state = getState();
  assert(state.isOnTrip === true, 'isOnTrip is true');
  assert(state.tripStore === 'Goodwill Downtown', 'tripStore set correctly');
  assert(state.currentTripId !== null, 'currentTripId is set');
  assert(state.tripItemCount === 0, 'tripItemCount starts at 0');
  assert(state.tripItems.length === 0, 'tripItems is empty');
  assert(state.tripStartedAt !== null, 'tripStartedAt is set');

  console.log('\n Testing trip record created in database...');
  const trip = await db.getTrip(state.currentTripId);
  assert(trip !== null, 'Trip exists in database');
  assert(trip.stores[0].storeName === 'Goodwill Downtown', 'Trip has correct store name');
  assert(trip.stores[0].arrived !== null, 'Trip has arrived time');
  assert(trip.startedAt !== null, 'Trip has startedAt timestamp');

  // Clean up
  await db.deleteTrip(state.currentTripId);
  resetState();

  console.log('\n✅ Start trip action tests passed!');
  return true;
}

export async function testLogItemAction() {
  logSection('LOG ITEM ACTION TESTS');
  resetState();

  console.log('\n Testing log_item creates inventory item...');
  const itemData = {
    brand: 'Pendleton',
    category: 'clothing',
    subcategory: 'shirt',
    material: 'wool',
    colour: 'red',
    purchaseCost: 12.99,
    suggestedPrice: { low: 35, high: 55 },
    condition: 'excellent',
    era: '1980s',
    notes: 'Made in USA label'
  };

  const result = await handleLogItemAction(itemData);
  assert(result.success === true, 'log_item succeeds');
  assert(result.message.includes('Logged'), 'Success message confirms item logged');
  assert(result.message.includes('Pendleton'), 'Message includes brand');
  assert(result.message.includes('shirt'), 'Message includes subcategory');
  assert(result.message.includes('$12.99'), 'Message includes price');

  console.log('\n Testing state updated after log_item...');
  let state = getState();
  assert(state.tripItemCount === 1, 'tripItemCount incremented');
  assert(state.lastLoggedItemId !== null, 'lastLoggedItemId is set');
  assert(state.tripItems.length === 1, 'tripItems has 1 item');
  assert(state.tripItems[0].brand === 'Pendleton', 'tripItems has correct brand');

  console.log('\n Testing item created in database with correct schema...');
  const item = await db.getInventoryItem(state.lastLoggedItemId);
  assert(item !== null, 'Item exists in database');
  assert(item.brand === 'Pendleton', 'Item has correct brand');
  assert(item.category.primary === 'clothing', 'Item has nested category.primary');
  assert(item.category.secondary === 'shirt', 'Item has nested category.secondary');
  assert(item.material.primary === 'wool', 'Item has nested material.primary');
  assert(item.colour.primary === 'red', 'Item has nested colour.primary');
  assert(item.metadata.acquisition.price === 12.99, 'Item has nested acquisition price');
  assert(item.pricing.minimum_acceptable_price === 35, 'Item has minimum price');
  assert(item.pricing.estimated_resale_value === 55, 'Item has estimated resale value');
  assert(item.condition.overall_condition === 'excellent', 'Item has nested condition');
  assert(item.era === '1980s', 'Item has era');
  assert(item.notes === 'Made in USA label', 'Item has notes');
  assert(item.source === 'chat', 'Item source is chat');
  assert(item.metadata.status === 'in_collection', 'Item status is in_collection');

  console.log('\n Testing log_item with minimal data...');
  const minimalResult = await handleLogItemAction({ purchaseCost: 5 });
  assert(minimalResult.success === true, 'log_item with minimal data succeeds');

  state = getState();
  assert(state.tripItemCount === 2, 'tripItemCount incremented again');

  const minimalItem = await db.getInventoryItem(state.lastLoggedItemId);
  assert(minimalItem.category.primary === 'clothing', 'Default category is clothing');
  assert(minimalItem.metadata.acquisition.price === 5, 'Price set correctly');

  console.log('\n Testing log_item increments count correctly...');
  await handleLogItemAction({ category: 'shoes', purchaseCost: 20 });
  state = getState();
  assert(state.tripItemCount === 3, 'tripItemCount is 3 after third item');
  assert(state.tripItems.length === 3, 'tripItems has 3 items');

  // Clean up
  for (const tripItem of state.tripItems) {
    await db.deleteInventoryItem(tripItem.id);
  }
  resetState();

  console.log('\n✅ Log item action tests passed!');
  return true;
}

export async function testUpdateItemAction() {
  logSection('UPDATE ITEM ACTION TESTS');
  resetState();

  console.log('\n Setting up: log an item first...');
  const logResult = await handleLogItemAction({
    brand: 'Escada',
    category: 'clothing',
    subcategory: 'blazer',
    purchaseCost: 15
  });
  assert(logResult.success === true, 'Initial item logged');
  const itemId = getState().lastLoggedItemId;

  console.log('\n Testing update_item changes purchaseCost...');
  const updatePrice = await handleUpdateItemAction({ field: 'purchaseCost', value: 20 });
  assert(updatePrice.success === true, 'update_item succeeds');
  assert(updatePrice.message.includes('Updated purchaseCost'), 'Message confirms field updated');
  assert(updatePrice.message.includes('20'), 'Message shows new value');

  let item = await db.getInventoryItem(itemId);
  assert(item.metadata.acquisition.price === 20, 'Price updated in database');

  console.log('\n Testing update_item changes brand...');
  const updateBrand = await handleUpdateItemAction({ field: 'brand', value: 'St. John' });
  assert(updateBrand.success === true, 'brand update succeeds');

  item = await db.getInventoryItem(itemId);
  assert(item.brand === 'St. John', 'Brand updated in database');

  console.log('\n Testing update_item changes condition...');
  const updateCondition = await handleUpdateItemAction({ field: 'condition', value: 'good' });
  assert(updateCondition.success === true, 'condition update succeeds');

  item = await db.getInventoryItem(itemId);
  assert(item.condition.overall_condition === 'good', 'Condition updated in database');

  console.log('\n Testing update_item changes subcategory...');
  const updateSubcat = await handleUpdateItemAction({ field: 'subcategory', value: 'dress' });
  assert(updateSubcat.success === true, 'subcategory update succeeds');

  item = await db.getInventoryItem(itemId);
  assert(item.category.secondary === 'dress', 'Subcategory updated in database');

  console.log('\n Testing update_item changes material...');
  const updateMaterial = await handleUpdateItemAction({ field: 'material', value: 'silk' });
  assert(updateMaterial.success === true, 'material update succeeds');

  item = await db.getInventoryItem(itemId);
  assert(item.material.primary === 'silk', 'Material updated in database');

  console.log('\n Testing update_item changes colour...');
  const updateColour = await handleUpdateItemAction({ field: 'colour', value: 'navy' });
  assert(updateColour.success === true, 'colour update succeeds');

  item = await db.getInventoryItem(itemId);
  assert(item.colour.primary === 'navy', 'Colour updated in database');

  console.log('\n Testing update_item changes era...');
  const updateEra = await handleUpdateItemAction({ field: 'era', value: '1990s' });
  assert(updateEra.success === true, 'era update succeeds');

  item = await db.getInventoryItem(itemId);
  assert(item.era === '1990s', 'Era updated in database');

  console.log('\n Testing update_item changes notes...');
  const updateNotes = await handleUpdateItemAction({ field: 'notes', value: 'New notes here' });
  assert(updateNotes.success === true, 'notes update succeeds');

  item = await db.getInventoryItem(itemId);
  assert(item.notes === 'New notes here', 'Notes updated in database');

  // Clean up
  await db.deleteInventoryItem(itemId);
  resetState();

  console.log('\n✅ Update item action tests passed!');
  return true;
}

export async function testEndTripAction() {
  logSection('END TRIP ACTION TESTS');
  resetState();

  console.log('\n Setting up: start a trip and log items...');
  const startResult = await handleStartTripAction({ storeName: 'Value Village' });
  assert(startResult.success === true, 'Trip started');

  const tripId = getState().currentTripId;

  await handleLogItemAction({ brand: 'Coogi', category: 'clothing', purchaseCost: 50 });
  await handleLogItemAction({ brand: 'Burberry', category: 'clothing', purchaseCost: 30 });

  let state = getState();
  assert(state.tripItemCount === 2, 'Two items logged');

  console.log('\n Testing end_trip updates trip record...');
  const endResult = await handleEndTripAction();
  assert(endResult.success === true, 'end_trip succeeds');
  assert(endResult.message.includes('Trip ended'), 'Message confirms trip ended');
  assert(endResult.message.includes('2 item(s)'), 'Message includes item count');
  assert(endResult.message.includes('Value Village'), 'Message includes store name');

  console.log('\n Testing state reset after end_trip...');
  state = getState();
  assert(state.isOnTrip === false, 'isOnTrip is false');
  assert(state.tripStore === null, 'tripStore is null');
  assert(state.tripStoreId === null, 'tripStoreId is null');
  assert(state.currentTripId === null, 'currentTripId is null');
  assert(state.tripItemCount === 0, 'tripItemCount is 0');
  assert(state.tripItems.length === 0, 'tripItems is empty');
  assert(state.tripStartedAt === null, 'tripStartedAt is null');

  console.log('\n Testing trip record updated in database...');
  const trip = await db.getTrip(tripId);
  assert(trip.endedAt !== null, 'Trip has endedAt timestamp');
  assert(trip.stores[0].departed !== null, 'Trip has departed time');

  // Clean up
  await db.deleteTrip(tripId);
  const allItems = await db.getAllInventory();
  for (const item of allItems.filter(i => i.source === 'chat')) {
    await db.deleteInventoryItem(item.id);
  }
  resetState();

  console.log('\n✅ End trip action tests passed!');
  return true;
}

export async function testFullTripFlow() {
  logSection('FULL TRIP FLOW TESTS');
  resetState();

  console.log('\n Testing complete trip workflow...');

  // Step 1: Start trip
  const startResult = await handleStartTripAction({ storeName: 'Goodwill' });
  assert(startResult.success === true, 'Step 1: Trip started');

  let state = getState();
  const tripId = state.currentTripId;

  // Step 2: Log first item
  const item1Result = await handleLogItemAction({
    brand: 'Pendleton',
    category: 'clothing',
    subcategory: 'shirt',
    purchaseCost: 8
  });
  assert(item1Result.success === true, 'Step 2: First item logged');
  const item1Id = getState().lastLoggedItemId;

  // Step 3: Correct the price
  const updateResult = await handleUpdateItemAction({ field: 'purchaseCost', value: 10 });
  assert(updateResult.success === true, 'Step 3: Price corrected');

  // Verify correction applied
  const item1 = await db.getInventoryItem(item1Id);
  assert(item1.metadata.acquisition.price === 10, 'Price correction applied');

  // Step 4: Log second item
  const item2Result = await handleLogItemAction({
    brand: 'Escada',
    category: 'clothing',
    subcategory: 'blazer',
    purchaseCost: 15,
    condition: 'excellent'
  });
  assert(item2Result.success === true, 'Step 4: Second item logged');
  const item2Id = getState().lastLoggedItemId;

  // Step 5: Log third item (shoes)
  const item3Result = await handleLogItemAction({
    brand: 'Cole Haan',
    category: 'shoes',
    subcategory: 'loafers',
    purchaseCost: 12
  });
  assert(item3Result.success === true, 'Step 5: Third item logged');
  const item3Id = getState().lastLoggedItemId;

  // Verify state during trip
  state = getState();
  assert(state.tripItemCount === 3, 'Three items logged');
  assert(state.tripItems.length === 3, 'tripItems has 3 entries');
  assert(state.lastLoggedItemId === item3Id, 'lastLoggedItemId is third item');

  // Step 6: End trip
  const endResult = await handleEndTripAction();
  assert(endResult.success === true, 'Step 6: Trip ended');
  assert(endResult.message.includes('3 item(s)'), 'End message shows 3 items');

  // Verify items linked to trip
  const items = await db.getAllInventory();
  const tripItems = items.filter(i => i.metadata?.acquisition?.trip_id === tripId);
  assert(tripItems.length === 3, 'All 3 items linked to trip');

  // Verify trip record
  const trip = await db.getTrip(tripId);
  assert(trip.startedAt !== null, 'Trip has start time');
  assert(trip.endedAt !== null, 'Trip has end time');

  // Clean up
  await db.deleteTrip(tripId);
  await db.deleteInventoryItem(item1Id);
  await db.deleteInventoryItem(item2Id);
  await db.deleteInventoryItem(item3Id);
  resetState();

  console.log('\n✅ Full trip flow tests passed!');
  return true;
}

export async function testStoreMatching() {
  logSection('STORE MATCHING TESTS');
  resetState();

  // Clean up any existing stores first to ensure isolation
  const existingStores = await db.getAllUserStores();
  for (const store of existingStores) {
    await db.deleteUserStore(store.id);
  }

  console.log('\n Setting up: create test stores...');
  const store1 = await db.createUserStore({ name: 'Goodwill Downtown', tier: 'budget' });
  const store2 = await db.createUserStore({ name: 'Salvation Army', tier: 'budget' });
  const store3 = await db.createUserStore({ name: 'Value Village Portland', tier: 'thrift' });

  console.log('\n Testing exact store name matching...');
  let result = await handleStartTripAction({ storeName: 'Goodwill Downtown' });
  assert(result.success === true, 'Trip started with exact match');
  let state = getState();
  assert(state.tripStoreId === store1.id, 'Matched correct store ID');
  let tripId = state.currentTripId;
  await handleEndTripAction();
  await db.deleteTrip(tripId);

  console.log('\n Testing partial store name matching...');
  result = await handleStartTripAction({ storeName: 'Salvation' });
  assert(result.success === true, 'Trip started with partial match');
  state = getState();
  assert(state.tripStoreId === store2.id, 'Matched Salvation Army store');
  tripId = state.currentTripId;
  await handleEndTripAction();
  await db.deleteTrip(tripId);

  console.log('\n Testing case-insensitive matching...');
  result = await handleStartTripAction({ storeName: 'goodwill downtown' });
  assert(result.success === true, 'Trip started with lowercase');
  state = getState();
  assert(state.tripStoreId === store1.id, 'Matched despite case difference');
  tripId = state.currentTripId;
  await handleEndTripAction();
  await db.deleteTrip(tripId);

  console.log('\n Testing contains matching...');
  result = await handleStartTripAction({ storeName: "I'm at Value Village Portland today" });
  assert(result.success === true, 'Trip started with contains match');
  state = getState();
  assert(state.tripStoreId === store3.id, 'Matched Value Village');
  tripId = state.currentTripId;
  await handleEndTripAction();
  await db.deleteTrip(tripId);

  console.log('\n Testing unmatched store creates trip without storeId...');
  result = await handleStartTripAction({ storeName: 'Random Thrift Store XYZ' });
  assert(result.success === true, 'Trip started with unknown store');
  state = getState();
  assert(state.tripStoreId === null, 'storeId is null for unknown store');
  assert(state.tripStore === 'Random Thrift Store XYZ', 'Store name preserved');
  tripId = state.currentTripId;
  await handleEndTripAction();
  await db.deleteTrip(tripId);

  // Clean up stores
  await db.deleteUserStore(store1.id);
  await db.deleteUserStore(store2.id);
  await db.deleteUserStore(store3.id);
  resetState();

  console.log('\n✅ Store matching tests passed!');
  return true;
}

export async function testContextBuilding() {
  logSection('CONTEXT BUILDING TESTS');

  // Clean up any existing trip state from previous tests
  resetState();

  // Clean up any trips in database that might affect context
  const existingTrips = await db.getAllTrips();
  for (const trip of existingTrips) {
    if (!trip.endedAt) {
      // End any unended trips
      await db.updateTrip(trip.id, { endedAt: new Date().toISOString() });
    }
  }

  console.log('\n Testing context when no trip active...');
  let context = await buildContext();
  const isNoActiveTrip = context.trip === null ||
                         context.trip === undefined ||
                         context.trip?.isActive !== true;
  assert(isNoActiveTrip, 'No active trip in context');
  assert(typeof context.inventory === 'object', 'Inventory context exists');
  assert(typeof context.knowledge === 'object', 'Knowledge context exists');

  console.log('\n Testing context during active trip...');
  await handleStartTripAction({ storeName: 'Test Store Context' });
  context = await buildContext();
  assert(context.trip !== null, 'Trip context exists');
  assert(context.trip.isActive === true, 'Trip marked as active');
  assert(context.trip.store === 'Test Store Context', 'Trip has correct store');
  assert(context.trip.itemCount === 0, 'Item count is 0');
  assert(Array.isArray(context.trip.recentItems), 'recentItems is array');

  console.log('\n Testing context includes recent trip items...');
  await handleLogItemAction({ brand: 'Brand1', category: 'clothing', purchaseCost: 10 });
  await handleLogItemAction({ brand: 'Brand2', category: 'clothing', purchaseCost: 20 });
  await handleLogItemAction({ brand: 'Brand3', category: 'shoes', purchaseCost: 30 });

  context = await buildContext();
  assert(context.trip.itemCount === 3, 'Item count is 3');
  assert(context.trip.recentItems.length === 3, 'recentItems has 3 items');
  assert(context.trip.recentItems[0].brand === 'Brand1', 'First item is Brand1');
  assert(context.trip.recentItems[2].brand === 'Brand3', 'Third item is Brand3');

  console.log('\n Testing recentItems limited to 3...');
  await handleLogItemAction({ brand: 'Brand4', category: 'clothing', purchaseCost: 40 });
  await handleLogItemAction({ brand: 'Brand5', category: 'clothing', purchaseCost: 50 });

  const state = getState();
  assert(state.tripItems.length === 5, 'State has 5 items');

  context = await buildContext();
  assert(context.trip.recentItems.length === 3, 'recentItems still limited to 3');

  // Clean up
  const tripId = state.currentTripId;
  const itemIds = state.tripItems.map(i => i.id);
  await handleEndTripAction();

  for (const itemId of itemIds) {
    await db.deleteInventoryItem(itemId);
  }
  await db.deleteTrip(tripId);
  resetState();

  console.log('\n✅ Context building tests passed!');
  return true;
}

// =============================================================================
// HELPER FUNCTION TESTS
// =============================================================================

export async function testHelperFunctions() {
  logSection('HELPER FUNCTION TESTS');

  console.log('\n Testing buildNestedUpdate...');

  // Test purchaseCost mapping
  const purchaseCostUpdate = buildNestedUpdate('purchaseCost', 25);
  assert(purchaseCostUpdate !== null, 'purchaseCost returns update object');
  assert(purchaseCostUpdate.metadata?.acquisition?.price === 25, 'purchaseCost maps to metadata.acquisition.price');

  // Test brand mapping
  const brandUpdate = buildNestedUpdate('brand', 'Pendleton');
  assert(brandUpdate !== null, 'brand returns update object');
  assert(brandUpdate.brand === 'Pendleton', 'brand maps directly');

  // Test condition mapping
  const conditionUpdate = buildNestedUpdate('condition', 'excellent');
  assert(conditionUpdate !== null, 'condition returns update object');
  assert(conditionUpdate.condition?.overall_condition === 'excellent', 'condition maps to condition.overall_condition');

  // Test subcategory mapping
  const subcategoryUpdate = buildNestedUpdate('subcategory', 'blazer');
  assert(subcategoryUpdate !== null, 'subcategory returns update object');
  assert(subcategoryUpdate.category?.secondary === 'blazer', 'subcategory maps to category.secondary');

  // Test unknown field
  const unknownUpdate = buildNestedUpdate('unknown_field', 'value');
  assert(unknownUpdate === null, 'Unknown field returns null');

  console.log('\n Testing mapActionToInventoryItem...');

  const actionData = {
    brand: 'Escada',
    category: 'clothing',
    subcategory: 'blazer',
    material: 'silk',
    colour: 'red',
    purchaseCost: 15.99,
    suggestedPrice: { low: 50, high: 100 },
    condition: 'excellent',
    era: '1980s',
    notes: 'Margaretha Ley era'
  };

  const item = mapActionToInventoryItem(actionData);

  assert(item.brand === 'Escada', 'brand mapped correctly');
  assert(item.category.primary === 'clothing', 'category.primary mapped correctly');
  assert(item.category.secondary === 'blazer', 'category.secondary mapped correctly');
  assert(item.material.primary === 'silk', 'material.primary mapped correctly');
  assert(item.colour.primary === 'red', 'colour.primary mapped correctly');
  assert(item.metadata.acquisition.price === 15.99, 'purchaseCost mapped to metadata.acquisition.price');
  assert(item.pricing.minimum_acceptable_price === 50, 'suggestedPrice.low mapped to pricing.minimum_acceptable_price');
  assert(item.pricing.estimated_resale_value === 100, 'suggestedPrice.high mapped to pricing.estimated_resale_value');
  assert(item.condition.overall_condition === 'excellent', 'condition mapped correctly');
  assert(item.era === '1980s', 'era mapped correctly');
  assert(item.notes === 'Margaretha Ley era', 'notes mapped correctly');
  assert(item.source === 'chat', 'source set to chat');
  assert(item.metadata.status === 'in_collection', 'status defaults to in_collection');
  assert(item.metadata.sync.unsynced === true, 'item marked as unsynced');

  console.log('\n Testing mapActionToInventoryItem with minimal data...');

  const minimalData = { purchaseCost: 5 };
  const minimalItem = mapActionToInventoryItem(minimalData);

  assert(minimalItem.brand === null, 'missing brand is null');
  assert(minimalItem.category.primary === 'clothing', 'category defaults to clothing');
  assert(minimalItem.metadata.acquisition.price === 5, 'purchaseCost mapped correctly');

  console.log('\n Testing findStoreByName...');

  const testStores = [
    { id: 'store-1', name: 'Goodwill Downtown' },
    { id: 'store-2', name: 'Salvation Army' },
    { id: 'store-3', name: 'Value Village' }
  ];

  // Exact match
  const exactMatch = findStoreByName(testStores, 'Goodwill Downtown');
  assert(exactMatch?.id === 'store-1', 'Exact match works');

  // Case insensitive
  const caseMatch = findStoreByName(testStores, 'goodwill downtown');
  assert(caseMatch?.id === 'store-1', 'Case insensitive match works');

  // Partial match
  const partialMatch = findStoreByName(testStores, 'Goodwill');
  assert(partialMatch?.id === 'store-1', 'Partial match works');

  // Contains match
  const containsMatch = findStoreByName(testStores, "I'm at the Salvation Army store");
  assert(containsMatch?.id === 'store-2', 'Contains match works');

  // No match
  const noMatch = findStoreByName(testStores, 'Unknown Store');
  assert(noMatch === null, 'Returns null for no match');

  console.log('\n✅ Helper function tests passed!');
  return true;
}

// =============================================================================
// TRIP STATE PERSISTENCE TESTS
// =============================================================================

export async function testTripStatePersistence() {
  logSection('TRIP STATE PERSISTENCE TESTS');

  // Clear any existing state
  localStorage.removeItem(STORAGE_KEY);
  resetState();

  console.log('\n Testing new trip state fields persist...');

  setState({
    isOnTrip: true,
    tripStore: 'Goodwill',
    tripStoreId: 'store-123',
    currentTripId: 'trip-456',
    tripItemCount: 3,
    tripItems: [
      { id: 'item-1', brand: 'Pendleton', purchaseCost: 10 },
      { id: 'item-2', brand: 'Escada', purchaseCost: 15 }
    ],
    lastLoggedItemId: 'item-2',
    tripStartedAt: '2025-01-21T10:00:00Z'
  });

  persistState();

  const stored = localStorage.getItem(STORAGE_KEY);
  assert(stored !== null, 'State persisted to localStorage');

  const parsed = JSON.parse(stored);
  assert(parsed.tripStoreId === 'store-123', 'tripStoreId persisted');
  assert(parsed.currentTripId === 'trip-456', 'currentTripId persisted');
  assert(parsed.tripItems.length === 2, 'tripItems persisted');
  assert(parsed.lastLoggedItemId === 'item-2', 'lastLoggedItemId persisted');

  console.log('\n Testing new trip state fields load...');

  resetState();
  let state = getState();
  assert(state.tripStoreId === null, 'State reset before load');

  loadPersistedState();
  state = getState();
  assert(state.tripStoreId === 'store-123', 'tripStoreId loaded');
  assert(state.currentTripId === 'trip-456', 'currentTripId loaded');
  assert(state.tripItems.length === 2, 'tripItems loaded');
  assert(state.lastLoggedItemId === 'item-2', 'lastLoggedItemId loaded');

  console.log('\n Testing tripItems limited to 10...');

  const manyItems = [];
  for (let i = 0; i < 15; i++) {
    manyItems.push({ id: `item-${i}`, brand: `Brand ${i}`, purchaseCost: i });
  }
  setState({ tripItems: manyItems });
  persistState();

  const storedAfter = JSON.parse(localStorage.getItem(STORAGE_KEY));
  assert(storedAfter.tripItems.length === 10, 'tripItems limited to 10');
  assert(storedAfter.tripItems[0].id === 'item-5', 'Oldest items dropped');

  // Cleanup
  localStorage.removeItem(STORAGE_KEY);
  resetState();

  console.log('\n✅ Trip state persistence tests passed!');
  return true;
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

export async function runAllTests() {
  console.log('\n🧪 CHAT MODULE TEST SUITE\n');
  console.log('Testing chat UI state, mock responses, and utilities...\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'State Management', fn: testStateManagement },
    { name: 'Mock Responses', fn: testMockResponses },
    { name: 'Utility Functions', fn: testUtilityFunctions },
    { name: 'Persistence', fn: testPersistence },
    { name: 'Trip State', fn: testTripState },
    { name: 'Message Queue', fn: testMessageQueue },
    { name: 'Mock Responses Structure', fn: testMockResponsesStructure },
    { name: 'Speech Recognition', fn: testSpeechRecognition },
    { name: 'Action Handlers', fn: testActionHandlers },
    { name: 'Start Trip Action', fn: testStartTripAction },
    { name: 'Log Item Action', fn: testLogItemAction },
    { name: 'Update Item Action', fn: testUpdateItemAction },
    { name: 'End Trip Action', fn: testEndTripAction },
    { name: 'Full Trip Flow', fn: testFullTripFlow },
    { name: 'Store Matching', fn: testStoreMatching },
    { name: 'Context Building', fn: testContextBuilding },
    { name: 'Helper Functions', fn: testHelperFunctions },
    { name: 'Trip State Persistence', fn: testTripStatePersistence }
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

  // Cleanup
  localStorage.removeItem(STORAGE_KEY);
  resetState();

  console.log('\n' + '='.repeat(50));
  console.log(`  TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return { passed, failed };
}

// Export for window access if needed
if (typeof window !== 'undefined') {
  window.chatTests = {
    runAllTests,
    testStateManagement,
    testMockResponses,
    testUtilityFunctions,
    testPersistence,
    testTripState,
    testMessageQueue,
    testMockResponsesStructure,
    testSpeechRecognition,
    testActionHandlers,
    testStartTripAction,
    testLogItemAction,
    testUpdateItemAction,
    testEndTripAction,
    testFullTripFlow,
    testStoreMatching,
    testContextBuilding,
    testHelperFunctions,
    testTripStatePersistence
  };
}
