# Code Cleanup Audit

## Completion Status

| Phase | Task | Status |
|-------|------|--------|
| 1 | Standardize DOM queries to `$()` | ✅ Complete (155→4, remaining in ui.js intentional) |
| 2 | Consolidate module state | ⏸️ Deferred to file splitting |
| 3 | Create logger utility | ✅ Complete |
| 3b | Replace console.* with logger | ✅ Complete (117→43, remaining in seed.js/camera.js) |
| 4 | Split db.js | ⏸️ Created db/core.js, full split deferred |
| 5 | Event listener cleanup | ✅ Improved createLazyModal with delegation |

### Files Created
- `js/logger.js` — Structured logging utility
- `js/db/core.js` — Database infrastructure (for future use)
- `js/tests/logger.test.js` — Logger tests (8 passing)

### Files Modified
- `js/app.js` — Added `$` import, replaced DOM queries
- `js/chat.js` — Added `$` and logger imports, replaced console/DOM
- `js/components.js` — Enhanced `createLazyModal` with event delegation
- `js/db.js` — Added logger import, replaced console statements
- `js/inventory.js` — Added logger import, replaced DOM/console
- `js/selling.js` — Added logger import, replaced console statements
- `js/settings.js` — Added `$` and logger imports, replaced DOM/console
- `js/sync.js` — Added logger import, replaced console statements
- `js/utils.js` — Replaced internal DOM queries with `$`

---

## Summary

| Metric | Value | Assessment |
|--------|-------|------------|
| Total JS lines | 18,165 | Manageable |
| Largest files | db.js (2,169), inventory.js (2,159), chat.js (1,841) | Candidates for splitting |
| Console statements | 117 | Needs logging strategy |
| Event listeners added | 134 | |
| Event listeners removed | 1 | **Potential memory leaks** |
| Mixed async patterns | 4 `.then()` calls | Minor cleanup |
| Direct DOM queries | 159 | Inconsistent `$` helper usage |

---

## Priority 1: Structural Issues

### 1.1 Large Files Need Splitting

**db.js (2,169 lines)** — Mix of concerns:
- Generic IndexedDB wrapper (lines 1-450)
- Inventory CRUD (450-900)
- Store/visit operations (900-1200)
- Knowledge base operations (1800-1970)
- Chat log operations (2000-2170)

**Recommendation:** Split into:
- `js/db/core.js` — IndexedDB wrapper, generic CRUD
- `js/db/inventory.js` — Inventory-specific operations
- `js/db/stores.js` — Store operations
- `js/db/knowledge.js` — Knowledge base
- `js/db/chat-logs.js` — Chat persistence
- `js/db/index.js` — Re-exports for backward compatibility

**inventory.js (2,159 lines)** — Does too much:
- Table rendering
- Form handling (add/edit item)
- Modal management
- Photo integration
- Price calculations

**Recommendation:** Extract:
- `js/inventory-form.js` — Add/edit item form logic
- `js/inventory-table.js` — Table rendering and filtering
- Keep `inventory.js` as coordinator

**chat.js (1,841 lines)** — Multiple responsibilities:
- UI rendering
- State management
- API communication
- Voice input handling
- Location features
- Mock responses

**Recommendation:** Extract:
- `js/chat-api.js` — API communication, streaming
- `js/chat-voice.js` — Speech recognition
- Keep `chat.js` for UI and coordination

---

### 1.2 Event Listener Memory Leaks

**Problem:** 134 `addEventListener` calls, only 1 `removeEventListener`.

Most concerning areas:
- Modals that add listeners on open but don't clean up on close
- Dynamic content that adds handlers without cleanup

**Recommendation:**
1. Audit all modal open/close cycles for listener cleanup
2. Use event delegation patterns (already partially adopted)
3. Add cleanup methods to `createLazyModal` and `createTableController`

---

### 1.3 Module-Level Mutable State

Multiple modules use `let currentX = null` patterns:
```javascript
// selling.js
let currentSoldItem = null;
let currentShipItem = null;
let currentPhotoItem = null;
let currentListedItem = null;
let currentDeliveryItem = null;

// inventory.js
let editingItemId = null;
let modalOnSave = null;
let visitContext = null;
```

**Recommendation:** Consolidate into state objects:
```javascript
// selling.js
const modalState = {
  soldItem: null,
  shipItem: null,
  // ...
};
```

This makes state easier to reset and debug.

---

## Priority 2: Consistency Issues

### 2.1 DOM Query Patterns

`$` helper exists in utils.js but direct queries are used 159 times:
```javascript
// Inconsistent
document.getElementById('sold-item-id')
document.querySelector('#sold-item-id')
$('#sold-item-id')
```

**Recommendation:** Standardize on `$()` helper throughout.

### 2.2 Error Handling Inconsistency

Some modules use `handleError()` from utils.js:
```javascript
return handleError(err, 'Failed to get setting', null);
```

Others just log and rethrow:
```javascript
console.error('Failed to update:', err);
throw err;
```

**Recommendation:** Establish error handling guidelines:
- Use `handleError()` for recoverable errors that return defaults
- Use try/catch with `showToast()` for user-facing operations
- Add structured logging for debugging

### 2.3 Async Patterns

Mostly clean (234 async functions, only 4 `.then()` calls), but some promise chains remain in db.js migration code.

**Recommendation:** Convert remaining `.then()` chains to async/await for consistency.

---

## Priority 3: Code Quality

### 3.1 Logging Strategy

117 console statements with no structure:
- `console.log()` for debugging
- `console.error()` for errors
- No log levels, no way to disable in production

**Recommendation:** Create simple logger:
```javascript
// js/logger.js
const LOG_LEVEL = localStorage.getItem('logLevel') || 'warn';
export const log = {
  debug: (...args) => LOG_LEVEL === 'debug' && console.log('[DEBUG]', ...args),
  info: (...args) => ['debug', 'info'].includes(LOG_LEVEL) && console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};
```

### 3.2 HTML Size

`index.html` is 2,017 lines with all dialogs inline.

**Recommendation:** Consider lazy-loading dialog HTML or using template fragments for modals that aren't needed at startup.

### 3.3 CSS Size

`styles.css` is 116KB — unusually large.

**Recommendation:** Audit for:
- Unused styles
- Duplicate rules
- Overly specific selectors that could be consolidated

---

## Priority 4: Technical Debt

### 4.1 Duplicate Data Loading

Both `fees.js` and `data-loaders.js` load `platforms.json`:
```javascript
// fees.js
let platformsData = null;

// data-loaders.js  
let platformsData = null;
```

**Recommendation:** Single source of truth in `data-loaders.js`, other modules import from there.

### 4.2 Validation Duplication

`selling.js` has multiple validation functions with similar patterns:
```javascript
export function validatePipelineEntry(item) { ... }
export function validatePhotosComplete(item, attachments) { ... }
export function validateListingData(data) { ... }
export function validateShippingData(data) { ... }
export function validateDeliveryConfirmation(data, hasScreenshot) { ... }
```

**Recommendation:** Create generic validator factory:
```javascript
const validators = {
  pipelineEntry: createValidator([
    { field: 'brand', message: 'Brand is required' },
    { field: 'category.secondary', message: 'Item type is required' },
    // ...
  ]),
  // ...
};
```

### 4.3 Hardcoded Worker URLs

```javascript
// chat.js
const WORKER_URL = null; // e.g., 'https://thrifting-claude-proxy...'
const PLACES_WORKER_URL = null;
```

**Recommendation:** Move to `config.js` or environment-based configuration.

---

## Recommended Cleanup Order

| Phase | Scope | Effort | Impact |
|-------|-------|--------|--------|
| 1 | Standardize DOM queries to `$()` | Low | Medium |
| 2 | Consolidate module state into state objects | Low | Medium |
| 3 | Create logger utility, replace console.* | Medium | Medium |
| 4 | Split db.js into focused modules | Medium | High |
| 5 | Audit/fix event listener cleanup | Medium | High |
| 6 | Split inventory.js | Medium | Medium |
| 7 | Extract chat-api.js, chat-voice.js | Medium | Medium |
| 8 | CSS audit and cleanup | Medium | Low |

---

## Files to Create

```
js/
├── db/
│   ├── core.js
│   ├── inventory.js
│   ├── stores.js
│   ├── knowledge.js
│   ├── chat-logs.js
│   └── index.js
├── inventory-form.js
├── inventory-table.js
├── chat-api.js
├── chat-voice.js
└── logger.js
```

---

## Questions Before Proceeding

1. **Priorities** — Which issues matter most to you? I'd suggest starting with Phase 1-3 (quick wins) before structural refactoring.

2. **Testing strategy** — Do you want to add tests before refactoring to catch regressions?

3. **Breaking changes** — Should I maintain backward compatibility with the current API surface, or can modules be reorganized freely?
