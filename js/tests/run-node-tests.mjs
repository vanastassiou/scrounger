/**
 * Node.js test runner using fake-indexeddb
 *
 * Usage:
 *   node js/tests/run-node-tests.mjs          # Run chat-logs tests only
 *   node js/tests/run-node-tests.mjs --all    # Run all test modules
 *   node js/tests/run-node-tests.mjs --fees   # Run specific module
 *
 * Available test modules:
 *   --schema          Schema extensions (trips, expenses, knowledge)
 *   --pwa             PWA manifest and service worker
 *   --chat            Chat UI and actions
 *   --inventory       Inventory CRUD, pipeline, archive
 *   --selling         Selling pipeline validation
 *   --sync            Sync engine and merge logic
 *   --stores          Store CRUD and stats
 *   --visits          Visits CRUD and computed stats
 *   --recommendations Pricing recommendations
 *   --fees            Platform fee calculations
 *
 * Multiple modules: node js/tests/run-node-tests.mjs --fees --inventory
 */

import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';

// Polyfill crypto for Node.js < 19
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

// Mock window and other browser globals
globalThis.window = globalThis;
globalThis.localStorage = {
  data: {},
  getItem(key) { return this.data[key] || null; },
  setItem(key, value) { this.data[key] = value; },
  removeItem(key) { delete this.data[key]; },
  clear() { this.data = {}; }
};

// Mock document for chat module
globalThis.document = {
  createElement(tag) {
    return {
      textContent: '',
      innerHTML: '',
      get innerHTML() {
        // Simple HTML escape for testing
        return this.textContent
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      },
      set innerHTML(val) {
        this._innerHTML = val;
      }
    };
  },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; }
};

// Mock navigator
globalThis.navigator = {
  onLine: true
};

// Import and run tests
async function main() {
  console.log('\n🧪 CHAT LOGS TEST SUITE (Node.js)\n');
  console.log('Using fake-indexeddb for IndexedDB emulation\n');

  try {
    // Import db functions from split modules
    const db = await import('../db/chat-logs.js');

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

    const TODAY = new Date().toISOString().split('T')[0];
    const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    let passed = 0;
    let failed = 0;

    // =============================================================================
    // TEST 1: CHAT LOG CRUD
    // =============================================================================
    try {
      logSection('CHAT LOG CRUD TESTS');

      console.log('\n Creating chat log for today...');
      const log = await db.getOrCreateChatLog(TODAY);
      assert(log.date === TODAY, 'Chat log has correct date');
      assert(Array.isArray(log.conversations), 'Chat log has conversations array');
      assert(log.createdAt, 'Chat log has createdAt timestamp');

      console.log('\n Getting existing chat log...');
      const sameLog = await db.getOrCreateChatLog(TODAY);
      assert(sameLog.createdAt === log.createdAt, 'Returns existing log, not new');

      console.log('\n Getting chat log by date...');
      const fetched = await db.getChatLog(TODAY);
      assert(fetched.date === TODAY, 'getChatLog returns correct log');

      console.log('\n Getting non-existent chat log...');
      const missing = await db.getChatLog('1999-01-01');
      assert(missing === null || missing === undefined, 'Returns null for missing log');

      console.log('\n✅ Chat log CRUD tests passed!');
      passed++;
    } catch (err) {
      console.error('❌ Chat log CRUD tests failed:', err.message);
      failed++;
    }

    // =============================================================================
    // TEST 2: CONVERSATIONS
    // =============================================================================
    try {
      logSection('CONVERSATION TESTS');

      console.log('\n Appending first conversation...');
      const conv1 = await db.appendConversation(TODAY, {
        id: `chat-${TODAY}-001`,
        started: new Date().toISOString(),
        messages: [
          { role: 'user', content: 'What brands should I look for?', ts: new Date().toISOString() },
          { role: 'assistant', content: 'Look for Escada, St. John.', ts: new Date().toISOString() }
        ],
        linkedItems: [],
        tripId: null,
        extractedKnowledge: []
      });
      assert(conv1.id === `chat-${TODAY}-001`, 'Conversation has correct ID');
      assert(conv1.messages.length === 2, 'Conversation has 2 messages');

      console.log('\n Verifying unsynced status...');
      const logAfterAppend = await db.getChatLog(TODAY);
      assert(logAfterAppend.unsynced === true, 'Chat log marked as unsynced after append');

      console.log('\n Appending second conversation...');
      const conv2 = await db.appendConversation(TODAY, {
        id: `chat-${TODAY}-002`,
        started: new Date().toISOString(),
        messages: [{ role: 'user', content: 'Found cashmere for $5', ts: new Date().toISOString() }],
        linkedItems: ['item-2025-01-21-001'],
        tripId: 'trip-2025-01-21-001'
      });
      assert(conv2.linkedItems.length === 1, 'Conversation has linked items');

      console.log('\n Getting conversations by date...');
      const conversations = await db.getConversationsByDate(TODAY);
      assert(conversations.length >= 2, 'At least 2 conversations for today');

      console.log('\n Getting conversation by ID...');
      const fetchedConv = await db.getConversation(`chat-${TODAY}-001`);
      assert(fetchedConv, 'Conversation found by ID');
      assert(fetchedConv.id === `chat-${TODAY}-001`, 'Correct conversation returned');

      console.log('\n Getting non-existent conversation...');
      const missingConv = await db.getConversation('chat-1999-01-01-999');
      assert(!missingConv, 'Returns null for missing conversation');

      console.log('\n Updating existing conversation...');
      const updatedConv = await db.appendConversation(TODAY, {
        id: `chat-${TODAY}-001`,
        started: conv1.started,
        ended: new Date().toISOString(),
        messages: [...conv1.messages, { role: 'user', content: 'Thanks!', ts: new Date().toISOString() }],
        linkedItems: ['item-2025-01-21-002']
      });
      assert(updatedConv.messages.length === 3, 'Conversation updated with new message');
      assert(updatedConv.ended, 'Conversation has ended timestamp');

      console.log('\n Verifying no duplicate conversations...');
      const afterUpdate = await db.getConversationsByDate(TODAY);
      const matchingIds = afterUpdate.filter(c => c.id === `chat-${TODAY}-001`);
      assert(matchingIds.length === 1, 'No duplicate conversations after update');

      console.log('\n✅ Conversation tests passed!');
      passed++;
    } catch (err) {
      console.error('❌ Conversation tests failed:', err.message);
      failed++;
    }

    // =============================================================================
    // TEST 3: SYNC TRACKING
    // =============================================================================
    try {
      logSection('SYNC TRACKING TESTS');

      await db.appendConversation(TODAY, {
        id: `chat-${TODAY}-sync-test`,
        messages: [{ role: 'user', content: 'Sync test', ts: new Date().toISOString() }]
      });

      console.log('\n Getting unsynced chat logs...');
      const unsynced = await db.getUnsyncedChatLogs();
      assert(unsynced.length >= 1, 'At least 1 unsynced log');
      assert(unsynced.find(l => l.date === TODAY), 'Today\'s log is unsynced');

      console.log('\n Marking chat log as synced...');
      await db.markChatLogSynced(TODAY);
      const afterSync = await db.getChatLog(TODAY);
      assert(afterSync.unsynced === false, 'Chat log marked as synced');
      assert(afterSync.syncedAt, 'Chat log has syncedAt timestamp');

      console.log('\n Verifying synced status...');
      const unsyncedAfter = await db.getUnsyncedChatLogs();
      const stillUnsynced = unsyncedAfter.find(l => l.date === TODAY);
      assert(!stillUnsynced, 'Synced log not in unsynced list');

      console.log('\n Appending after sync marks unsynced...');
      await db.appendConversation(TODAY, {
        id: `chat-${TODAY}-after-sync`,
        messages: [{ role: 'user', content: 'After sync', ts: new Date().toISOString() }]
      });
      const afterNewAppend = await db.getChatLog(TODAY);
      assert(afterNewAppend.unsynced === true, 'Log marked unsynced after new append');

      console.log('\n✅ Sync tracking tests passed!');
      passed++;
    } catch (err) {
      console.error('❌ Sync tracking tests failed:', err.message);
      failed++;
    }

    // =============================================================================
    // TEST 4: IMPORT/MERGE
    // =============================================================================
    try {
      logSection('IMPORT/MERGE TESTS');

      console.log('\n Creating local conversation...');
      await db.appendConversation(YESTERDAY, {
        id: `chat-${YESTERDAY}-local`,
        started: '2025-01-20T10:00:00Z',
        messages: [{ role: 'user', content: 'Local message', ts: '2025-01-20T10:00:00Z' }]
      });

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
            id: `chat-${YESTERDAY}-local`,
            started: '2025-01-20T10:00:00Z',
            messages: [
              { role: 'user', content: 'Local message', ts: '2025-01-20T10:00:00Z' },
              { role: 'assistant', content: 'Remote added this', ts: '2025-01-20T10:01:00Z' }
            ]
          }
        ]
      };

      const merged = await db.importChatLog(YESTERDAY, remoteData);
      assert(merged.conversations.length === 2, 'Merged log has 2 conversations');
      assert(merged.unsynced === false, 'Merged log marked as synced');
      assert(merged.syncedAt, 'Merged log has syncedAt');

      const remoteConv = merged.conversations.find(c => c.id === `chat-${YESTERDAY}-remote`);
      assert(remoteConv, 'Remote conversation added');

      const localConv = merged.conversations.find(c => c.id === `chat-${YESTERDAY}-local`);
      assert(localConv, 'Local conversation exists');
      assert(localConv.messages.length === 2, 'Local conversation overwritten with remote version');

      console.log('\n Verifying conversation order...');
      const firstConv = merged.conversations[0];
      const secondConv = merged.conversations[1];
      assert(firstConv.started <= secondConv.started, 'Conversations sorted by started time');

      console.log('\n✅ Import/merge tests passed!');
      passed++;
    } catch (err) {
      console.error('❌ Import/merge tests failed:', err.message);
      failed++;
    }

    // =============================================================================
    // TEST 5: RECENT LOGS
    // =============================================================================
    try {
      logSection('RECENT LOGS TESTS');

      await db.getOrCreateChatLog(TODAY);
      await db.getOrCreateChatLog(YESTERDAY);

      console.log('\n Getting recent chat logs...');
      const recent = await db.getRecentChatLogs(7);
      assert(Array.isArray(recent), 'Returns array');
      assert(recent.length >= 2, 'At least 2 recent logs');

      console.log('\n Verifying sort order...');
      if (recent.length >= 2) {
        assert(recent[0].date >= recent[1].date, 'Logs sorted by date descending');
      }

      console.log('\n✅ Recent logs tests passed!');
      passed++;
    } catch (err) {
      console.error('❌ Recent logs tests failed:', err.message);
      failed++;
    }

    // =============================================================================
    // TEST 6: AUTO-GENERATED IDS
    // =============================================================================
    try {
      logSection('AUTO-GENERATED ID TESTS');

      console.log('\n Appending conversation without ID...');
      const conv = await db.appendConversation(TODAY, {
        messages: [{ role: 'user', content: 'No ID provided', ts: new Date().toISOString() }]
      });
      assert(conv.id, 'Conversation auto-generated ID');
      assert(conv.started, 'Conversation auto-generated started timestamp');
      console.log(`  Generated ID: ${conv.id}`);

      const log = await db.getChatLog(TODAY);
      const found = log.conversations.find(c => c.id === conv.id);
      assert(found, 'Auto-ID conversation retrievable');

      console.log('\n✅ Auto-generated ID tests passed!');
      passed++;
    } catch (err) {
      console.error('❌ Auto-generated ID tests failed:', err.message);
      failed++;
    }

    // =============================================================================
    // RESULTS
    // =============================================================================
    console.log('\n' + '='.repeat(50));
    console.log(`  TEST RESULTS: ${passed} passed, ${failed} failed`);
    console.log('='.repeat(50) + '\n');

    // Run specific test module if requested
    const testModules = {
      '--schema': './schema-extensions.test.js',
      '--pwa': './pwa.test.js',
      '--chat': './chat.test.js',
      '--inventory': './inventory.test.js',
      '--selling': './selling.test.js',
      '--sync': './sync.test.js',
      '--stores': './stores.test.js',
      '--visits': './visits.test.js',
      '--recommendations': './recommendations.test.js',
      '--fees': './fees.test.js'
    };

    // Check for specific module flags
    const requestedModules = Object.keys(testModules).filter(flag => process.argv.includes(flag));

    if (requestedModules.length > 0) {
      // Run only the requested modules
      for (const flag of requestedModules) {
        console.log('\n\n');
        try {
          const testModule = await import(testModules[flag]);
          const results = await testModule.runAllTests();
          passed += results.passed;
          failed += results.failed;
        } catch (err) {
          console.error(`Failed to run ${flag} tests:`, err.message);
          failed++;
        }
      }

      console.log('\n' + '='.repeat(50));
      console.log(`  COMBINED RESULTS: ${passed} passed, ${failed} failed`);
      console.log('='.repeat(50) + '\n');
    } else if (process.argv.includes('--all')) {
      // Run all test modules
      const allModules = [
        { name: 'Schema Extensions', module: './schema-extensions.test.js' },
        { name: 'PWA', module: './pwa.test.js' },
        { name: 'Chat', module: './chat.test.js' },
        { name: 'Inventory', module: './inventory.test.js' },
        { name: 'Selling', module: './selling.test.js' },
        { name: 'Sync', module: './sync.test.js' },
        { name: 'Stores', module: './stores.test.js' },
        { name: 'Visits', module: './visits.test.js' },
        { name: 'Recommendations', module: './recommendations.test.js' },
        { name: 'Fees', module: './fees.test.js' }
      ];

      for (const { name, module } of allModules) {
        console.log('\n\n');
        try {
          const testModule = await import(module);
          const results = await testModule.runAllTests();
          passed += results.passed;
          failed += results.failed;
        } catch (err) {
          console.error(`Failed to run ${name} tests:`, err.message);
          failed++;
        }
      }

      console.log('\n' + '='.repeat(50));
      console.log(`  COMBINED RESULTS: ${passed} passed, ${failed} failed`);
      console.log('='.repeat(50) + '\n');
    }

    process.exit(failed > 0 ? 1 : 0);

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

main();
