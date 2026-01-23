# Database Module Split Instructions

## Overview

The monolithic `js/db.js` (2,169 lines) has been split into focused modules under `js/db/`. This document provides instructions for completing the migration.

## New Module Structure

```
js/db/
├── core.js        # Database infrastructure (openDB, CRUD helpers, migrations)
├── inventory.js   # Inventory CRUD, selling pipeline, archive
├── visits.js      # Visits CRUD, store stats
├── stores.js      # User stores CRUD
├── trips.js       # Trips CRUD
├── expenses.js    # Expenses CRUD
├── attachments.js # Attachments CRUD (photo sync)
├── knowledge.js   # Knowledge base CRUD
├── chat-logs.js   # Chat logs CRUD
└── export.js      # Export/import functions
```

## Migration Steps

### 1. Update imports in consuming files

Each file that imports from `./db.js` needs to be updated to import from the specific module.

**Files to update:**
- `js/app.js`
- `js/chat.js`
- `js/inventory.js`
- `js/selling.js`
- `js/settings.js`
- `js/sync.js`
- `js/visits.js`
- `js/stores.js`
- `js/seed.js`
- `js/dashboard-actions.js`
- `js/recommendations.js`
- `js/references.js`
- `js/core/sync-engine.js`

**Import mapping:**

| Old Import | New Import |
|------------|------------|
| `openDB`, `resetDB`, `clearAllData` | `from './db/core.js'` |
| `createInventoryItem`, `updateInventoryItem`, `getInventoryItem`, `getAllInventory`, `deleteInventoryItem` | `from './db/inventory.js'` |
| `getInventoryStats`, `getInventoryByCategory`, `getInventoryByStatus` | `from './db/inventory.js'` |
| `getInventoryInPipeline`, `getItemsNotInPipeline`, `getSellingAnalytics`, `markItemAsSold` | `from './db/inventory.js'` |
| `getInventoryByPlatform`, `getInventoryForVisit`, `getInventoryByStore` | `from './db/inventory.js'` |
| `migrateItemToSlug`, `getItemsNeedingMigration`, `getItemsMissingSlugFields` | `from './db/inventory.js'` |
| `getSetting`, `setSetting` | `from './db/inventory.js'` |
| `importBaselineInventory`, `computeVisitsFromInventory` | `from './db/inventory.js'` |
| `archiveItem`, `getAllArchived`, `exportArchive` | `from './db/inventory.js'` |
| `getUnsyncedInventory`, `markInventorySynced` | `from './db/inventory.js'` |
| `createVisit`, `updateVisit`, `deleteVisit`, `getAllVisits`, `getVisitsByStore` | `from './db/visits.js'` |
| `getStoreStats`, `getAllStoreStats` | `from './db/visits.js'` |
| `getUnsyncedVisits`, `markVisitsSynced` | `from './db/visits.js'` |
| `createUserStore`, `updateUserStore`, `deleteUserStore`, `getAllUserStores` | `from './db/stores.js'` |
| `createTrip`, `updateTrip`, `deleteTrip`, `getTrip`, `getAllTrips`, `getTripsByDate` | `from './db/trips.js'` |
| `getUnsyncedTrips`, `markTripsSynced` | `from './db/trips.js'` |
| `createExpense`, `updateExpense`, `deleteExpense`, `getExpense`, `getAllExpenses` | `from './db/expenses.js'` |
| `getExpensesByCategory`, `getExpensesByTrip`, `getExpensesByItem`, `getExpensesByDateRange` | `from './db/expenses.js'` |
| `getUnsyncedExpenses`, `markExpensesSynced` | `from './db/expenses.js'` |
| `createAttachment`, `getAttachment`, `getAttachmentsByItem`, `deleteAttachment`, `getAllAttachments` | `from './db/attachments.js'` |
| `findAttachmentByItemAndFilename`, `upsertAttachmentFromSync`, `getPendingAttachments`, `markAttachmentSynced` | `from './db/attachments.js'` |
| `getKnowledge`, `updateKnowledge`, `upsertBrandKnowledge`, `getBrandKnowledge`, `deleteBrandKnowledge` | `from './db/knowledge.js'` |
| `getUnsyncedKnowledge`, `markKnowledgeSynced` | `from './db/knowledge.js'` |
| `getChatLog`, `getOrCreateChatLog`, `appendConversation`, `getConversationsByDate`, `getConversation` | `from './db/chat-logs.js'` |
| `getRecentChatLogs`, `getUnsyncedChatLogs`, `markChatLogSynced`, `importChatLog` | `from './db/chat-logs.js'` |
| `exportAllData`, `importData` | `from './db/export.js'` |
| `migrateCategoryFormat`, `migrateRemoveTitle` | `from './db/core.js'` |

### 2. Delete old db.js

Once all imports are updated and tests pass, delete the old `js/db.js` file.

### 3. Run syntax checks

```bash
for f in js/db/*.js js/*.js; do node --check "$f" 2>&1 || echo "FAIL: $f"; done
```

### 4. Test in browser

Load the app and verify:
- Dashboard loads with stats
- Inventory table loads
- Adding/editing items works
- Sync still functions
- Chat works

## Example Import Update

**Before:**
```javascript
import {
  getAllInventory,
  getInventoryStats,
  createVisit,
  getSetting,
  setSetting
} from './db.js';
```

**After:**
```javascript
import { getAllInventory, getInventoryStats, getSetting, setSetting } from './db/inventory.js';
import { createVisit } from './db/visits.js';
```

## Notes

- The `db` alias for `openDB` is exported from `core.js` for backward compatibility
- All modules import their dependencies from `core.js`
- `inventory.js` also exports settings helpers (`getSetting`, `setSetting`) since they're tightly coupled
- `visits.js` imports `computeVisitsFromInventory` from `inventory.js` for `getAllStoreStats()`
- `export.js` contains a local copy of `migrateItemToNestedSchema` to avoid circular dependencies

## Verification Checklist

- [ ] All files syntax check pass
- [ ] Dashboard loads
- [ ] Inventory CRUD works
- [ ] Selling pipeline works
- [ ] Visits/stores work
- [ ] Trips/expenses work
- [ ] Chat logs work
- [ ] Google Drive sync works
- [ ] Export/import works
- [ ] Old `js/db.js` deleted
