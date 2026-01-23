# Thrifting PWA - Codebase Inventory Report

## Executive Summary

The codebase is a well-structured vanilla JavaScript PWA with 18+ modules totaling ~12,000+ lines. The architecture follows clear separation of concerns with core utilities, feature modules, and supporting services. However, organic growth has led to pattern inconsistencies, code duplication, and several modules that have grown too large.

**Critical Statistics:**
- Total JS modules: 18+ (excluding `/js/core/` and `/js/tests/`)
- Largest modules: `db.js` (2170 lines), `inventory.js` (2160 lines), `references.js` (1561 lines)
- Missing module: `seed.js` (referenced in CLAUDE.md but doesn't exist)

---

## Module Documentation

### Core Infrastructure Modules

#### 1. db.js (2170 lines) - NEEDS SPLITTING
**Purpose:** Complete IndexedDB abstraction with CRUD, migrations, import/export, and sync tracking.

**Key Exports:** 80+ functions across 10 data stores (inventory, visits, stores, settings, attachments, archive, trips, expenses, knowledge, chatLogs)

**Dependencies:** `config.js`, `utils.js`, `ui.js`

**Dependents:** Nearly every module imports from db.js

**Patterns:**
- Singleton DB instance with lazy init
- Promisification wrapper for IDB requests
- Deep merge for nested updates
- Append-only logs for chat

**Data Entities:** All 10 IndexedDB stores

**Issues:**
- Massive file should split: `inventory.db.js`, `visits.db.js`, `attachments.db.js`, etc.
- Inconsistent sync flags: `metadata.sync.unsynced` (inventory) vs flat `unsynced` (visits, trips)
- O(n) performance on `computeVisitsFromInventory()` and `getAllStoreStats()` called every render
- Attachment handling creates duplicates on sync
- No input validation on any CRUD function

---

#### 2. utils.js (850 lines) - NEEDS SPLITTING
**Purpose:** Utility library for ID generation, formatting, DOM operations, sorting, filtering, forms.

**Key Exports:** ~40 functions including `generateId()`, `slugify()`, formatters, `createSortableTable()`, `compressImage()`, `createFormHandler()`

**Dependencies:** None (pure utilities)

**Dependents:** All modules

**Patterns:**
- Chainable sorting (modifies in place - bug risk)
- Factory pattern for tables/forms
- Fallback rendering for formatters

**Issues:**
- Should split: `formatters.js`, `tables.js`, `forms.js`, `images.js`
- `getItemTitle()` references wrong schema paths (`item.sizing.labeled_size` vs `item.size.label.value`)
- `sortData()` mutates original array - side effects cascade
- Date/currency hardcoded to Canadian locale (en-CA, CAD)
- Image compression has no configuration options

---

#### 3. config.js (510 lines) - NEEDS SPLITTING
**Purpose:** Centralized constants for database, UI options, pricing multipliers, business rules.

**Key Exports:** 50+ constants including enums, multipliers, photo types, platform configs

**Dependencies:** None

**Dependents:** Most modules

**Issues:**
- Should split: `pricing.config.js`, `photos.config.js`, `schema.config.js`
- Magic numbers without documentation (size multipliers, era bonuses)
- Inconsistent naming (UPPER_CASE vs camelCase)
- No schema validation

---

#### 4. state.js (168 lines)
**Purpose:** Module-level state management for stores, trips, sync state, access tokens.

**Key Exports:** `state` object with getters/setters, `createModuleState()` factory

**Dependencies:** None

**Dependents:** `inventory.js`, `stores.js`, `visits.js`, `chat.js`

**Patterns:**
- Reactive getters/setters with lazy indexing
- LocalStorage bridge for auth tokens

**Issues:**
- Index rebuilt O(n) on every assignment
- Multiple aliases (`stores`, `storesDB`, `userStores`) confusing
- Access token stored in plaintext localStorage

---

#### 5. ui.js (138 lines)
**Purpose:** UI utilities for tab routing, modals, toasts, sync status.

**Key Exports:** `createTabController()`, `createModalController()`, `showToast()`, `updateSyncStatus()`

**Dependencies:** None

**Dependents:** All modules

**Issues:**
- Single toast element - rapid messages overwrite each other
- No debouncing on tab clicks
- Limited error handling

---

#### 6. components.js (436 lines)
**Purpose:** Reusable UI component factories (lazy modals, table controllers, sub-tabs).

**Key Exports:** `createLazyModal()`, `createTableController()`, `createSubTabController()`, `initStoreDropdown()`

**Dependencies:** `ui.js`, `utils.js`

**Dependents:** All feature modules

**Patterns:**
- Lazy initialization
- Event delegation
- Configuration objects

**Issues:**
- Table controller over-complex (170 lines, 7 config sections)
- Click handler return value semantics unintuitive
- Search doesn't debounce
- Memory leak potential (listeners never cleaned up)

---

### Feature Modules

#### 7. inventory.js (2160 lines) - NEEDS SPLITTING
**Purpose:** Complete item lifecycle management with rich metadata, photos, and form handling.

**Key Exports:** `initInventory()`, `createInventoryRow()`, `renderInventoryStats()`, `openAddItemModal()`, `openEditItemModal()`, `openViewItemModal()`, `openStartSellingModal()`, `openProfitBreakdownModal()`

**Dependencies:** `state.js`, `db.js`, `ui.js`, `utils.js`, `components.js`, `config.js`, `sync.js`, `recommendations.js`, `fees.js`, `data-loaders.js`, `photos.js`

**Dependents:** `selling.js`, `visits.js`, `app.js`

**Module State:** `inventoryData`, `currentFlaws[]`, `currentSecondaryMaterials[]`, `pendingPhotos[]`, `editingItemId`, `visitContext`, `estimatedPrices` Map

**Patterns:**
- Lazy modal initialization
- FormData API with nested schema building
- Sub-tab navigation
- Click delegation on tables

**Issues:**
- `handleItemSubmit()` is 192 lines - should split schema building logic
- `populateFormWithItem()` uses `setTimeout` chains prone to race conditions
- Photo URL memory leak if modal closed without cleanup
- Nested schema complexity (6+ levels deep)
- Duplicate price calculation in load AND render

---

#### 8. stores.js (290 lines)
**Purpose:** Store browser with tier filtering, hit rate, and detail views.

**Key Exports:** `initStores()`, `loadStores()`, `renderStoreCount()`, `openViewStoreModal()`

**Dependencies:** `state.js`, `db.js`, `ui.js`, `utils.js`, `config.js`, `components.js`, `inventory.js`

**Dependents:** `visits.js`, `inventory.js`, `app.js`

**Issues:** None major - clean, simple module

---

#### 9. visits.js (480 lines)
**Purpose:** Two-phase visit workflow: log date/store, then spreadsheet-style item entry.

**Key Exports:** `initVisits()`, `loadVisits()`, `openLogVisitModal()`, `openVisitItemsModal()`

**Dependencies:** `state.js`, `db.js`, `ui.js`, `utils.js`, `components.js`, `inventory.js`

**Dependents:** `app.js`

**Module State:** `visitsData[]`, `visitWorkflow{}`, `sortColumn`, `sortDirection`

**Patterns:**
- Multi-step modal workflow
- Computed visits from inventory

**Issues:**
- Doesn't use `createTableController()` - manual HTML generation (code duplication)
- Uses `confirm()` instead of modal pattern (inconsistent UI)
- Context lost on modal close

---

#### 10. selling.js (1409 lines)
**Purpose:** 8-status sales pipeline with validation, fees, and profit tracking.

**Key Exports:** `initSelling()`, `loadPipeline()`, `validatePipelineEntry()`, `validatePhotosComplete()`, `validateListingData()`, `validateShippingData()`, `validateDeliveryConfirmation()`, `getTrackingUrl()`, 7 modal openers

**Dependencies:** `db.js`, `ui.js`, `utils.js`, `config.js`, `components.js`, `fees.js`, `photos.js`, `inventory.js`

**Dependents:** `app.js`, `inventory.js`

**Module State:** `pipelineData[]`, `nonPipelineData[]`, `archiveData[]`, `currentSoldItem`, `feesManuallyEdited`, `currentFeeResult`

**Patterns:**
- Centralized validators returning `{ valid, errors }`
- Real-time fee/profit preview
- Status-conditional UI

**Issues:**
- `feesManuallyEdited` is global - concurrent modal opens collide
- Photo validation can cause recursive modal opening
- `renderPipelineRow()` 84 lines - needs splitting
- Status order hard-coded instead of referencing config

---

#### 11. chat.js (1441 lines)
**Purpose:** Sourcing advisor with natural language parsing, trip tracking, Claude API integration.

**Key Exports:** `initChat()`, plus `_test` object with 25+ internal functions

**Dependencies:** `db.js` (but NOT `utils.js` - defines `escapeHtml` locally)

**Dependents:** `app.js`

**Module State:** Complex `state{}` object with messages, trip state, queue, connection status

**Patterns:**
- Streaming SSE response parsing
- Context injection from DB
- Action parsing from advisor
- Offline queue with localStorage persistence
- Mock fallback when worker not configured

**Issues:**
- Doesn't import `escapeHtml` from utils (defines locally)
- Offline queue uses mock responses instead of retrying API
- `buildContext()` is 106 lines - too many responsibilities
- SSE parsing could have buffer edge cases
- Store matching uses fragile substring matching
- Message history uncapped (localStorage could fill)

---

### Supporting Modules

#### 12. recommendations.js (1211 lines)
**Purpose:** Platform/price/profit recommendations using multi-factor adjustments.

**Key Exports:** 14 functions including `getBasePriceRange()`, multiplier calculators, `generateSellingRecommendations()`, `rankPlatformsForItem()`

**Dependencies:** `config.js`, `fees.js`, `seasonal.js`, `data-loaders.js`, `utils.js`

**Dependents:** `inventory.js`, `selling.js`

**Patterns:**
- Nested multiplier composition (base × material × size × condition × flaw × platform × trend)
- Async parallel lookups
- Tier-based scoring

**Issues:**
- `PLATFORM_NAMES` export appears unused (dead code)
- Duplicate color normalization with `seasonal.js`
- Missing null checks on brand data structure

---

#### 13. fees.js (282 lines)
**Purpose:** Platform fee calculations from `platforms.json`.

**Key Exports:** `initFees()`, `getPlatformsData()`, `calculatePlatformFees()`, `calculateEstimatedReturns()`, `getPlatformShipping()`

**Dependencies:** None

**Dependents:** `recommendations.js`, `data-loaders.js`, `inventory.js`, `selling.js`

**Patterns:**
- Global state with lazy init
- Polymorphic tier handling
- Platform-specific logic for TheRealReal

**Issues:**
- Global state mutation with no reset
- Silent `{}` on fetch error
- USD vs CAD confusion noted in comments
- Tier fallback may select wrong tier silently

---

#### 14. seasonal.js (247 lines)
**Purpose:** Match items to current/next month seasonal trends.

**Key Exports:** `loadSeasonalData()`, month getters, `matchItemsToSeason()`, `getSeasonalOpportunities()`

**Dependencies:** None

**Dependents:** `references.js`, `dashboard-actions.js`, `data-loaders.js`, `recommendations.js`

**Patterns:**
- Additive scoring system
- Fuzzy substring matching
- Lazy loading with cache

**Issues:**
- Fuzzy matching false positives ("silk" matches "silk screen")
- Hard-coded score threshold (40)
- Duplicate normalization with `recommendations.js`

---

#### 15. references.js (1561 lines) - NEEDS SPLITTING
**Purpose:** Reference data browser for brands, platforms, materials, sizing, trends.

**Key Exports:** `initReferences()`

**Dependencies:** `utils.js`, `components.js`, `ui.js`, `seasonal.js`, `config.js`

**Dependents:** `app.js`

**Issues:**
- Added brands/platforms don't persist (disappear on reload)
- Duplicate fee formatting logic with `fees.js`
- 1561 lines - should split into sub-modules per view
- No data validation on forms

---

#### 16. settings.js (866 lines)
**Purpose:** Google Drive sync config, data export/import, clear data.

**Key Exports:** `initSettings()`

**Dependencies:** `sync.js`, `db.js`, `ui.js`, `utils.js`

**Dependents:** `app.js`

**Issues:**
- Race conditions with 30s UI refresh interval
- Import format auto-detection can misidentify data
- No file size validation
- Clear data irreversible

---

#### 17. dashboard-actions.js (219 lines)
**Purpose:** Action tiles for seasonal opportunities, photo needs, pipeline stages.

**Key Exports:** `initDashboardActions()`, `loadActionItems()`

**Dependencies:** `db.js`, `utils.js`, `ui.js`, `components.js`, `seasonal.js`, `inventory.js`, `photos.js`, `sync.js`

**Dependents:** `app.js`

**Issues:**
- Stale state (not refreshed on inventory changes)
- Single modal with flag-based routing is fragile
- Tile counts don't auto-update

---

#### 18. sync.js (570 lines)
**Purpose:** Google Drive sync orchestration.

**Key Exports:** 20+ functions for connection, folder management, sync operations, backup/import

**Dependencies:** `core/google-drive.js`, `core/sync-engine.js`, `core/oauth.js`, `db.js`, `ui.js`

**Dependents:** `settings.js`, `inventory.js`, `camera.js`, `dashboard-actions.js`, `photos.js`

**Issues:**
- Concurrent `syncNow()` calls can corrupt state (no lock)
- Attachment orphaning if item deleted
- Chat log merge naive (doesn't handle duplicate messages)
- Hard-coded 7-day chat log window

---

#### 19. seed.js - MISSING
**Purpose:** Load mock data (48 items) from CSV for testing.

**Status:** Referenced in CLAUDE.md but file doesn't exist.

---

## Cross-Module Analysis

### Dependency Graph

```
                    ┌─────────────────────────────────────────────────┐
                    │            CORE LAYER                          │
                    │  config.js ← utils.js ← db.js ← state.js       │
                    │       ↑         ↑        ↑                     │
                    │  ui.js ←── components.js                       │
                    └────────────────────┬────────────────────────────┘
                                         │
          ┌──────────────────────────────┼──────────────────────────────┐
          │                              │                              │
    ┌─────▼─────┐               ┌───────▼───────┐              ┌──────▼──────┐
    │ FEATURE   │               │  SUPPORTING   │              │   SYNC      │
    │ MODULES   │               │   MODULES     │              │   LAYER     │
    ├───────────┤               ├───────────────┤              ├─────────────┤
    │inventory  │◄──────────────│recommendations│              │ sync.js     │
    │stores     │               │fees           │              │ core/oauth  │
    │visits     │               │seasonal       │              │ core/drive  │
    │selling    │               │references     │              │ core/engine │
    │chat       │               │settings       │              └─────────────┘
    └───────────┘               │dashboard-act  │
                                └───────────────┘
```

### Identified Pattern Inconsistencies

| Pattern | Modules Using | Issue |
|---------|---------------|-------|
| Error handling | Various | db.js uses `handleError()`, app.js uses `.catch(console.error)`, components.js has none |
| State management | Various | state.js for globals, `createModuleState()` for modules, closure variables scattered |
| Sync flags | db.js | `metadata.sync.unsynced` (inventory) vs flat `unsynced` (visits, trips, expenses) |
| Modal naming | Various | Some prefix `open` (openViewItemModal), others don't (handleStartTrip) |
| Async handling | Various | Promise.all(), sequential await, setTimeout chains all mixed |
| Validation | Various | Centralized in selling.js, inline in inventory.js |
| Click handling | Various | Delegation in tables, addEventListener on buttons, form submissions |

### Duplicate Functionality

| Functionality | Files | Approx Lines | Recommendation |
|---------------|-------|--------------|----------------|
| Image compression | selling.js, inventory.js | ~100 combined | Extract to utils.js |
| Platform comparison table | inventory.js, selling.js | ~100 combined | Create shared renderer |
| Fee calculation display | fees.js, references.js | ~80 combined | Consolidate in fees.js |
| Color/material normalization | seasonal.js, recommendations.js | ~50 combined | Extract to utils.js |
| Spreadsheet table | visits.js (manual), others (controller) | ~50 | Use createTableController |
| Nested schema building | inventory.js, chat.js | ~80 combined | Create schema helper |
| escapeHtml | utils.js, chat.js (local copy) | ~10 | Import from utils.js |

### Dead Code / Unused Exports

| Location | Export | Status |
|----------|--------|--------|
| recommendations.js | `PLATFORM_NAMES` constant | Never imported |
| inventory.js | `createInventoryRow()` | Only used internally |
| references.js | Add brand/platform forms | Don't persist data |
| seed.js | Entire module | File doesn't exist |

### Modules Needing Splitting

| Module | Lines | Recommendation |
|--------|-------|----------------|
| db.js | 2170 | Split by entity: inventory.db.js, visits.db.js, attachments.db.js, knowledge.db.js |
| inventory.js | 2160 | Extract: form-schema.js, item-form.js, item-details.js |
| utils.js | 850 | Split: formatters.js, tables.js, forms.js, images.js |
| references.js | 1561 | Split by view: brands-browser.js, platforms-browser.js, trends-view.js |
| config.js | 510 | Split: pricing.config.js, photos.config.js, schema.config.js |

### Missing Abstractions

1. **Form schema builder** - Flat FormData → nested schema conversion used in inventory.js and chat.js
2. **Platform comparison renderer** - Similar tables in inventory and selling
3. **Cached async loader** - Load + cache pattern repeated across modules (seasonal, fees, brands)
4. **Modal state manager** - Current pattern of global flags (`feesManuallyEdited`, `currentActionType`) is error-prone
5. **Sync lock** - No concurrency protection on sync operations

---

## Critical Issues by Priority

### P0 - Must Fix (Correctness Bugs)
1. **Concurrent sync corruption** - sync.js has no lock on syncNow()
2. **Sync flag inconsistency** - Different schema between entities breaks queries
3. **chat.js escapeHtml** - Uses local copy instead of importing from utils
4. **seed.js missing** - Referenced but doesn't exist
5. **Photo modal recursion** - selling.js photo validation can infinite loop

### P1 - High Priority
1. **O(n) stats rendering** - computeVisitsFromInventory/getAllStoreStats on every render
2. **Array mutation** - sortData() modifies original, cascading side effects
3. **Item title schema mismatch** - getItemTitle() references wrong paths
4. **Token security** - Plaintext in localStorage
5. **Fee state collision** - Global flag, concurrent modals break

### P2 - Medium Priority (Refactoring)
1. Split large modules (db.js, inventory.js, utils.js, references.js, config.js)
2. Standardize error handling pattern
3. Standardize state management pattern
4. Remove duplicate code (image compression, color normalization)
5. Add input validation to db.js functions

### P3 - Low Priority (Code Quality)
1. Document magic numbers
2. Unify naming conventions
3. Add JSDoc to complex functions
4. Clean up unused exports

---

## Verification

To validate this analysis:
1. Run `npm test` to check existing tests pass
2. Search codebase for each identified unused export
3. Verify line counts with `wc -l js/*.js`
4. Test sync by modifying inventory and checking unsynced queries