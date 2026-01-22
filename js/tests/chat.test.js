/**
 * Chat Module Tests
 * Run in browser console after importing:
 *   import('/js/tests/chat.test.js').then(m => m.runAllTests())
 *
 * Or run via Node.js test runner:
 *   node js/tests/run-node-tests.mjs --all
 */

import { _test } from '../chat.js';

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
  STORAGE_KEY
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
    { name: 'Mock Responses Structure', fn: testMockResponsesStructure }
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
    testMockResponsesStructure
  };
}
