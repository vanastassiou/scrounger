/**
 * Chat Logs Tests
 * Run in browser console after importing:
 *   import('/js/tests/chat-logs.test.js').then(m => m.runAllTests())
 *
 * Or run individual tests:
 *   import('/js/tests/chat-logs.test.js').then(m => m.testChatLogCrud())
 */

import {
  getChatLog,
  getOrCreateChatLog,
  appendConversation,
  getConversationsByDate,
  getConversation,
  getRecentChatLogs,
  getUnsyncedChatLogs,
  markChatLogSynced,
  importChatLog
} from '../db/chat-logs.js';
import { clearAllData } from '../db/core.js';

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

// Test date helpers
const TODAY = new Date().toISOString().split('T')[0];
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];

// =============================================================================
// CHAT LOG CRUD TESTS
// =============================================================================

export async function testChatLogCrud() {
  logSection('CHAT LOG CRUD TESTS');

  // Get or create chat log
  console.log('\n Creating chat log for today...');
  const log = await getOrCreateChatLog(TODAY);

  assert(log.date === TODAY, 'Chat log has correct date');
  assert(Array.isArray(log.conversations), 'Chat log has conversations array');
  assert(log.created_at, 'Chat log has created_at timestamp');
  assert(log.updated_at, 'Chat log has updated_at timestamp');

  // Get same log (should not create new)
  console.log('\n Getting existing chat log...');
  const sameLog = await getOrCreateChatLog(TODAY);
  assert(sameLog.created_at === log.created_at, 'Returns existing log, not new');

  // Get chat log directly
  console.log('\n Getting chat log by date...');
  const fetched = await getChatLog(TODAY);
  assert(fetched.date === TODAY, 'getChatLog returns correct log');

  // Get non-existent log
  console.log('\n Getting non-existent chat log...');
  const missing = await getChatLog('1999-01-01');
  assert(missing === null || missing === undefined, 'Returns null for missing log');

  console.log('\n✅ Chat log CRUD tests passed!');
  return true;
}

// =============================================================================
// CONVERSATION TESTS
// =============================================================================

export async function testConversations() {
  logSection('CONVERSATION TESTS');

  // Append first conversation
  console.log('\n Appending first conversation...');
  const conv1 = await appendConversation(TODAY, {
    id: `chat-${TODAY}-001`,
    started: new Date().toISOString(),
    messages: [
      { role: 'user', content: 'What brands should I look for?', ts: new Date().toISOString() },
      { role: 'assistant', content: 'Look for Escada, St. John, and Pendleton.', ts: new Date().toISOString() }
    ],
    linkedItems: [],
    tripId: null,
    extractedKnowledge: []
  });

  assert(conv1.id === `chat-${TODAY}-001`, 'Conversation has correct ID');
  assert(conv1.started, 'Conversation has started timestamp');
  assert(conv1.messages.length === 2, 'Conversation has 2 messages');

  // Verify log is marked unsynced
  console.log('\n Verifying unsynced status...');
  const logAfterAppend = await getChatLog(TODAY);
  assert(logAfterAppend.unsynced === true, 'Chat log marked as unsynced after append');
  assert(logAfterAppend.conversations.length >= 1, 'Log has at least 1 conversation');

  // Append second conversation
  console.log('\n Appending second conversation...');
  const conv2 = await appendConversation(TODAY, {
    id: `chat-${TODAY}-002`,
    started: new Date().toISOString(),
    messages: [
      { role: 'user', content: 'Found a cashmere sweater for $5', ts: new Date().toISOString() },
      { role: 'assistant', content: 'Great find! Check for moth damage.', ts: new Date().toISOString() }
    ],
    linkedItems: ['item-2025-01-21-001'],
    tripId: 'trip-2025-01-21-001',
    extractedKnowledge: ['materials.cashmere']
  });

  assert(conv2.id === `chat-${TODAY}-002`, 'Second conversation appended');
  assert(conv2.linkedItems.length === 1, 'Conversation has linked items');
  assert(conv2.tripId, 'Conversation has tripId');

  // Verify both conversations exist
  console.log('\n Getting conversations by date...');
  const conversations = await getConversationsByDate(TODAY);
  assert(conversations.length >= 2, 'At least 2 conversations for today');
  assert(conversations.find(c => c.id === conv1.id), 'First conversation found');
  assert(conversations.find(c => c.id === conv2.id), 'Second conversation found');

  // Get conversation by ID
  console.log('\n Getting conversation by ID...');
  const fetchedConv = await getConversation(`chat-${TODAY}-001`);
  assert(fetchedConv, 'Conversation found by ID');
  assert(fetchedConv.id === `chat-${TODAY}-001`, 'Correct conversation returned');

  // Get non-existent conversation
  console.log('\n Getting non-existent conversation...');
  const missingConv = await getConversation('chat-1999-01-01-999');
  assert(!missingConv, 'Returns null for missing conversation');

  // Update existing conversation (same ID)
  console.log('\n Updating existing conversation...');
  const updatedConv = await appendConversation(TODAY, {
    id: `chat-${TODAY}-001`,
    started: conv1.started,
    ended: new Date().toISOString(),
    messages: [
      ...conv1.messages,
      { role: 'user', content: 'Thanks!', ts: new Date().toISOString() }
    ],
    linkedItems: ['item-2025-01-21-002'],
    tripId: null,
    extractedKnowledge: ['brands.escada']
  });

  assert(updatedConv.messages.length === 3, 'Conversation updated with new message');
  assert(updatedConv.ended, 'Conversation has ended timestamp');
  assert(updatedConv.linkedItems.length === 1, 'Linked items updated');

  // Verify no duplicate conversations
  const afterUpdate = await getConversationsByDate(TODAY);
  const matchingIds = afterUpdate.filter(c => c.id === `chat-${TODAY}-001`);
  assert(matchingIds.length === 1, 'No duplicate conversations after update');

  console.log('\n✅ Conversation tests passed!');
  return true;
}

// =============================================================================
// SYNC TRACKING TESTS
// =============================================================================

export async function testSyncTracking() {
  logSection('SYNC TRACKING TESTS');

  // Ensure we have an unsynced log
  await appendConversation(TODAY, {
    id: `chat-${TODAY}-sync-test`,
    messages: [{ role: 'user', content: 'Sync test', ts: new Date().toISOString() }]
  });

  // Get unsynced logs
  console.log('\n Getting unsynced chat logs...');
  const unsynced = await getUnsyncedChatLogs();
  assert(unsynced.length >= 1, 'At least 1 unsynced log');
  assert(unsynced.find(l => l.date === TODAY), 'Today\'s log is unsynced');

  // Mark as synced
  console.log('\n Marking chat log as synced...');
  await markChatLogSynced(TODAY);

  const afterSync = await getChatLog(TODAY);
  assert(afterSync.unsynced === false, 'Chat log marked as synced');
  assert(afterSync.synced_at, 'Chat log has synced_at timestamp');

  // Verify not in unsynced list
  console.log('\n Verifying synced status...');
  const unsyncedAfter = await getUnsyncedChatLogs();
  const stillUnsynced = unsyncedAfter.find(l => l.date === TODAY);
  assert(!stillUnsynced, 'Synced log not in unsynced list');

  // Append new conversation marks unsynced again
  console.log('\n Appending after sync marks unsynced...');
  await appendConversation(TODAY, {
    id: `chat-${TODAY}-after-sync`,
    messages: [{ role: 'user', content: 'After sync', ts: new Date().toISOString() }]
  });

  const afterNewAppend = await getChatLog(TODAY);
  assert(afterNewAppend.unsynced === true, 'Log marked unsynced after new append');

  console.log('\n✅ Sync tracking tests passed!');
  return true;
}

// =============================================================================
// IMPORT/MERGE TESTS
// =============================================================================

export async function testImportMerge() {
  logSection('IMPORT/MERGE TESTS');

  // Create local conversation
  console.log('\n Creating local conversation...');
  await appendConversation(YESTERDAY, {
    id: `chat-${YESTERDAY}-local`,
    started: '2025-01-20T10:00:00Z',
    messages: [{ role: 'user', content: 'Local message', ts: '2025-01-20T10:00:00Z' }]
  });

  // Simulate remote data with different conversation
  console.log('\n Importing remote data with merge...');
  const remoteData = {
    date: YESTERDAY,
    conversations: [
      {
        id: `chat-${YESTERDAY}-remote`,
        started: '2025-01-20T11:00:00Z',
        messages: [{ role: 'user', content: 'Remote message', ts: '2025-01-20T11:00:00Z' }]
      },
      {
        id: `chat-${YESTERDAY}-local`, // Same ID as local - should overwrite
        started: '2025-01-20T10:00:00Z',
        messages: [
          { role: 'user', content: 'Local message', ts: '2025-01-20T10:00:00Z' },
          { role: 'assistant', content: 'Remote added this', ts: '2025-01-20T10:01:00Z' }
        ]
      }
    ],
    updatedAt: new Date().toISOString()
  };

  const merged = await importChatLog(YESTERDAY, remoteData);

  assert(merged.conversations.length === 2, 'Merged log has 2 conversations');
  assert(merged.unsynced === false, 'Merged log marked as synced');
  assert(merged.synced_at, 'Merged log has synced_at');

  // Verify remote conversation added
  const remoteConv = merged.conversations.find(c => c.id === `chat-${YESTERDAY}-remote`);
  assert(remoteConv, 'Remote conversation added');

  // Verify local conversation was overwritten by remote
  const localConv = merged.conversations.find(c => c.id === `chat-${YESTERDAY}-local`);
  assert(localConv, 'Local conversation exists');
  assert(localConv.messages.length === 2, 'Local conversation overwritten with remote version');

  // Verify sorted by started timestamp
  console.log('\n Verifying conversation order...');
  const firstConv = merged.conversations[0];
  const secondConv = merged.conversations[1];
  assert(firstConv.started <= secondConv.started, 'Conversations sorted by started time');

  console.log('\n✅ Import/merge tests passed!');
  return true;
}

// =============================================================================
// RECENT LOGS TESTS
// =============================================================================

export async function testRecentLogs() {
  logSection('RECENT LOGS TESTS');

  // Ensure we have logs for today and yesterday
  await getOrCreateChatLog(TODAY);
  await getOrCreateChatLog(YESTERDAY);

  // Get recent logs (last 7 days)
  console.log('\n Getting recent chat logs...');
  const recent = await getRecentChatLogs(7);

  assert(Array.isArray(recent), 'Returns array');
  assert(recent.length >= 2, 'At least 2 recent logs');

  // Verify sorted by date descending
  console.log('\n Verifying sort order...');
  if (recent.length >= 2) {
    assert(recent[0].date >= recent[1].date, 'Logs sorted by date descending');
  }

  // Verify today is first
  assert(recent[0].date === TODAY, 'Today\'s log is first');

  // Get with shorter range
  console.log('\n Getting logs with 1 day range...');
  const oneDayLogs = await getRecentChatLogs(1);
  assert(oneDayLogs.length >= 1, 'At least 1 log in 1 day range');
  assert(oneDayLogs[0].date === TODAY, 'Today\'s log in 1 day range');

  console.log('\n✅ Recent logs tests passed!');
  return true;
}

// =============================================================================
// DRIVE SYNC SIMULATION TESTS
// =============================================================================

export async function testDriveSyncSimulation() {
  logSection('DRIVE SYNC SIMULATION TESTS');

  // This test simulates what the sync process does without actual Drive calls

  // 1. Create local unsynced log
  console.log('\n Creating unsynced local log...');
  const testDate = '2025-01-15';
  await appendConversation(testDate, {
    id: `chat-${testDate}-device-a`,
    started: '2025-01-15T10:00:00Z',
    messages: [{ role: 'user', content: 'From device A', ts: '2025-01-15T10:00:00Z' }]
  });

  // 2. Simulate push: Get unsynced, "upload" to drive
  console.log('\n Simulating push to Drive...');
  const unsyncedLogs = await getUnsyncedChatLogs();
  const logToSync = unsyncedLogs.find(l => l.date === testDate);
  assert(logToSync, 'Found log to sync');

  // Simulate merge with "remote" data (device B made changes)
  const simulatedRemote = {
    date: testDate,
    conversations: [
      {
        id: `chat-${testDate}-device-b`,
        started: '2025-01-15T11:00:00Z',
        messages: [{ role: 'user', content: 'From device B', ts: '2025-01-15T11:00:00Z' }]
      }
    ]
  };

  // Merge local + remote
  const mergedConvs = new Map();
  for (const c of simulatedRemote.conversations) mergedConvs.set(c.id, c);
  for (const c of logToSync.conversations) mergedConvs.set(c.id, c);

  const mergedForUpload = {
    date: testDate,
    conversations: Array.from(mergedConvs.values())
      .sort((a, b) => (a.started || '').localeCompare(b.started || '')),
    updatedAt: new Date().toISOString()
  };

  assert(mergedForUpload.conversations.length === 2, 'Merged has both device conversations');

  // 3. Simulate "upload complete" - mark synced
  await markChatLogSynced(testDate);

  // 4. Simulate pull: Import remote version
  console.log('\n Simulating pull from Drive...');
  await importChatLog(testDate, mergedForUpload);

  const afterPull = await getChatLog(testDate);
  assert(afterPull.conversations.length === 2, 'After pull has 2 conversations');
  assert(afterPull.conversations.find(c => c.id === `chat-${testDate}-device-a`), 'Device A conversation preserved');
  assert(afterPull.conversations.find(c => c.id === `chat-${testDate}-device-b`), 'Device B conversation merged');
  assert(afterPull.unsynced === false, 'Log marked as synced');

  console.log('\n✅ Drive sync simulation tests passed!');
  return true;
}

// =============================================================================
// AUTO-GENERATED ID TESTS
// =============================================================================

export async function testAutoGeneratedIds() {
  logSection('AUTO-GENERATED ID TESTS');

  // Append conversation without ID
  console.log('\n Appending conversation without ID...');
  const conv = await appendConversation(TODAY, {
    messages: [{ role: 'user', content: 'No ID provided', ts: new Date().toISOString() }]
  });

  assert(conv.id, 'Conversation auto-generated ID');
  assert(conv.started, 'Conversation auto-generated started timestamp');

  console.log(`  Generated ID: ${conv.id}`);

  // Verify it can be retrieved
  const log = await getChatLog(TODAY);
  const found = log.conversations.find(c => c.id === conv.id);
  assert(found, 'Auto-ID conversation retrievable');

  console.log('\n✅ Auto-generated ID tests passed!');
  return true;
}

// =============================================================================
// CLEANUP
// =============================================================================

async function cleanup() {
  console.log('\n Cleaning up test data...');
  // Note: In a real scenario, you'd want to delete only test data
  // For now, we'll leave the chat logs as they don't affect other tests
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

export async function runAllTests() {
  console.log('\n🧪 CHAT LOGS TEST SUITE\n');
  console.log('Testing chat log storage, conversations, and sync tracking...\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'Chat Log CRUD', fn: testChatLogCrud },
    { name: 'Conversations', fn: testConversations },
    { name: 'Sync Tracking', fn: testSyncTracking },
    { name: 'Import/Merge', fn: testImportMerge },
    { name: 'Recent Logs', fn: testRecentLogs },
    { name: 'Drive Sync Simulation', fn: testDriveSyncSimulation },
    { name: 'Auto-Generated IDs', fn: testAutoGeneratedIds }
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

  await cleanup();

  console.log('\n' + '='.repeat(50));
  console.log(`  TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return { passed, failed };
}

// Export for window access if needed
if (typeof window !== 'undefined') {
  window.chatLogTests = {
    runAllTests,
    testChatLogCrud,
    testConversations,
    testSyncTracking,
    testImportMerge,
    testRecentLogs,
    testDriveSyncSimulation,
    testAutoGeneratedIds
  };
}
