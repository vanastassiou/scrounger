# Developer's Guide

A comprehensive guide for developers contributing to the Thrift Inventory Tracker.

## Table of Contents

1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Architecture Overview](#architecture-overview)
4. [Module Reference](#module-reference)
5. [Key Patterns](#key-patterns)
6. [Working with IndexedDB](#working-with-indexeddb)
7. [Adding New Features](#adding-new-features)
8. [Google Drive Sync](#google-drive-sync)
9. [Reference Data](#reference-data)
10. [Testing and Debugging](#testing-and-debugging)
11. [Code Style](#code-style)

---

## Introduction

This is a mobile-first PWA for tracking thrift store inventory. It's designed for offline-first use, allowing users to log finds while shopping.

### Design Philosophy

- **Zero dependencies** — Vanilla JavaScript, no build step, no npm packages in production
- **Mobile-first** — Optimized for phone use in-store
- **Offline-first** — Works without internet; syncs when connected
- **Simple deployment** — Serve static files directly

### Running Locally

```bash
npm start   # Serves at http://localhost:8080
```

---

## Project Structure

```
/thrifting/
├── index.html                    # Single-page app shell
├── styles.css                    # All styles (no CSS framework)
├── manifest.json                 # PWA manifest
├── sw.js                         # Service worker
│
├── /js/                          # Application modules
│   ├── app.js                    # Entry point, initialization
│   ├── db.js                     # IndexedDB wrapper
│   ├── state.js                  # Shared state
│   ├── config.js                 # Constants and enums
│   ├── ui.js                     # Tab/modal controllers, toasts
│   ├── utils.js                  # Formatters, DOM helpers
│   ├── inventory.js              # Item management
│   ├── stores.js                 # Store browser
│   ├── visits.js                 # Visit logging
│   ├── selling.js                # Sales pipeline
│   ├── dashboard-actions.js      # Action item workflow
│   ├── settings.js               # Settings UI
│   ├── sync.js                   # Sync orchestration
│   │
│   └── /core/                    # Sync infrastructure
│       ├── google-drive.js       # Drive API provider
│       ├── sync-engine.js        # Sync state machine
│       ├── oauth.js              # OAuth flow
│       └── google-picker.js      # Folder picker
│
├── /data/                        # Static reference data (JSON)
│   ├── stores.json               # Pre-loaded thrift stores
│   ├── inventory.json            # Baseline inventory
│   ├── brands-clothing-shoes.json
│   ├── brands-jewelry-hallmarks.json
│   ├── materials.json
│   ├── inventory-form-schema.json
│   └── rotation-logic.json
│
└── /docs/                        # Documentation
```

---

## Architecture Overview

### Data Flow

```
User Action → Module Function → db.js → IndexedDB
                                   ↓
                              sync.js → Google Drive (source of truth)
```

### Storage Layers

1. **IndexedDB** — Local cache for offline access
2. **localStorage** — UI state only (active tab, preferences)
3. **Google Drive** — Primary storage and source of truth (syncs to IndexedDB)

### Module Responsibilities

| Layer | Modules | Purpose |
|-------|---------|---------|
| Entry | `app.js` | Initialization, routing, dev tools |
| Data | `db.js`, `state.js` | IndexedDB operations, shared state |
| UI | `ui.js`, `utils.js` | Controllers, helpers, formatters |
| Features | `inventory.js`, `stores.js`, `visits.js`, `selling.js` | Tab-specific logic |
| Sync | `sync.js`, `core/*` | Google Drive integration |
| Config | `config.js` | Constants, enums |

---

## Module Reference

### app.js — Entry Point

Initializes all modules and sets up event handlers.

```javascript
// Initialization order matters
async function init() {
  await loadStoresData();      // 1. Load reference data
  createTabController(...);    // 2. Set up navigation

  await Promise.all([          // 3. Initialize features in parallel
    initInventory(),
    initStores(),
    initVisits(),
    initSelling(),
    initDashboardActions(),
    initSettings()
  ]);

  await renderDashboardStats(); // 4. Render dashboard

  if (isConnected()) {
    syncOnOpen();              // 5. Sync with Google Drive
  }
}
```

Key exports: None (entry point only)

### db.js — Database Layer

Native IndexedDB wrapper providing CRUD operations.

```javascript
// Core helpers (internal)
async function getStore(storeName, mode = 'readonly')
async function getAllFromStore(storeName)
async function getByKey(storeName, key)
async function addRecord(storeName, record)
async function putRecord(storeName, record)
async function deleteRecord(storeName, key)

// Public API
export function openDB()                    // Get DB instance
export async function clearAllData()        // Wipe all stores

// Inventory
export async function getAllItems()
export async function getItem(id)
export async function addItem(item)
export async function updateItem(item)
export async function deleteItem(id)

// Visits
export async function getAllVisits()
export async function addVisit(visit)

// Stores
export async function getUserStores()
export async function addUserStore(store)

// Settings
export async function getSetting(key)
export async function setSetting(key, value)
```

### state.js — Shared State

Module-level state shared across the app.

```javascript
export const state = {
  storesDB: null,         // Loaded from stores.json
  syncState: {            // Sync status
    isConnected: false,
    syncInProgress: false,
    lastSyncAt: null,
    error: null
  },
  accessToken: null       // Google OAuth token
};
```

### config.js — Constants

All enums and configuration values.

```javascript
export const DB_NAME = 'thrift-inventory';
export const DB_VERSION = 1;

export const CATEGORIES = ['clothing', 'shoes', 'jewelry', 'accessories'];

export const STATUSES = [
  'unlisted',
  'photographed',
  'listed',
  'pending_sale',
  'packaged',
  'shipped',
  'confirmed_received',
  'sold',
  'returned',
  'donated',
  'kept'
];

export const PLATFORMS = [
  'poshmark', 'ebay', 'etsy', 'depop',
  'facebook_marketplace', 'local_consignment'
];

export const CONDITIONS = [
  'new_with_tags', 'like_new', 'excellent',
  'good', 'fair', 'poor'
];
```

### ui.js — UI Patterns

Reusable UI controllers.

**Tab Controller:**
```javascript
import { createTabController } from './ui.js';

createTabController('.tab', '.page', {
  storageKey: 'activeTab',       // Persist to localStorage
  onActivate: (tabId) => { ... } // Callback on tab change
});
```

**Modal Controller:**
```javascript
import { createModalController } from './ui.js';

const modal = createModalController(document.getElementById('my-dialog'));
modal.open();   // Show modal
modal.close();  // Hide modal
```

**Toast Notifications:**
```javascript
import { showToast } from './ui.js';

showToast('Item saved');
showToast('Error occurred', 3000); // Custom duration
```

### utils.js — Helpers

Common utilities.

```javascript
// IDs
export function generateId()           // Returns unique numeric ID

// Dates
export function nowISO()               // Current ISO timestamp
export function formatDate(dateStr)    // "Jan 15, 2024"
export function formatCurrency(amount) // "$25.00"

// DOM
export function escapeHtml(str)        // Prevent XSS
export function createElement(tag, attrs, children)

// Tables
export function sortTableData(data, column, direction)
export function createSortHandler(renderFn)

// Images
export async function compressImage(file, maxWidth, quality)
```

---

## Key Patterns

### Tab Switching

Tabs use CSS-driven visibility with a `data-tab` attribute on `<html>`.

**HTML structure:**
```html
<nav class="tabs">
  <button class="tab" data-tab="dashboard">Dashboard</button>
  <button class="tab" data-tab="inventory">Inventory</button>
</nav>

<main>
  <section id="dashboard" class="page">...</section>
  <section id="inventory" class="page">...</section>
</main>
```

**CSS visibility:**
```css
.page { display: none; }
.page.active { display: block; }

/* Or using html data attribute */
html[data-tab="dashboard"] #dashboard { display: block; }
```

**JavaScript initialization:**
```javascript
createTabController('.tab', '.page', {
  storageKey: 'activeTab',
});
```

### Modal Pattern

Uses native `<dialog>` elements for accessibility.

**HTML structure:**
```html
<dialog id="add-item-dialog">
  <div class="modal-header">
    <h2>Add Item</h2>
    <button class="modal-close">&times;</button>
  </div>
  <form>
    <!-- Form fields -->
    <button type="submit">Save</button>
  </form>
</dialog>
```

**JavaScript:**
```javascript
const modal = createModalController(document.getElementById('add-item-dialog'));

// Open
document.getElementById('add-btn').addEventListener('click', modal.open);

// Form submission
modal.dialog.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  // Process form...
  modal.close();
});
```

### Table Pattern

Tables use event delegation and are re-rendered on data changes.

**HTML structure:**
```html
<table id="inventory-table">
  <thead>
    <tr>
      <th data-sort="title">Title</th>
      <th data-sort="brand">Brand</th>
      <th data-sort="price">Price</th>
    </tr>
  </thead>
  <tbody></tbody>
</table>
```

**JavaScript:**
```javascript
let items = [];
let sortColumn = 'title';
let sortDirection = 'asc';

function renderTable() {
  const sorted = sortTableData(items, sortColumn, sortDirection);
  const tbody = document.querySelector('#inventory-table tbody');

  tbody.innerHTML = sorted.map(item => `
    <tr data-id="${item.id}">
      <td>${escapeHtml(item.title)}</td>
      <td>${escapeHtml(item.brand || '')}</td>
      <td>${formatCurrency(item.price)}</td>
    </tr>
  `).join('');
}

// Sort handler
document.querySelector('#inventory-table thead').addEventListener('click', (e) => {
  const th = e.target.closest('[data-sort]');
  if (!th) return;

  const column = th.dataset.sort;
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = 'asc';
  }

  renderTable();
});

// Row click handler (event delegation)
document.querySelector('#inventory-table tbody').addEventListener('click', (e) => {
  const row = e.target.closest('tr');
  if (row) {
    const itemId = parseInt(row.dataset.id);
    openItemDetail(itemId);
  }
});
```

### Event Delegation

Always delegate events to parent containers rather than binding to each element.

```javascript
// Good: Single handler on parent
container.addEventListener('click', (e) => {
  const btn = e.target.closest('.delete-btn');
  if (btn) {
    handleDelete(btn.dataset.id);
  }
});

// Avoid: Handler on each button
buttons.forEach(btn => {
  btn.addEventListener('click', () => handleDelete(btn.dataset.id));
});
```

---

## Working with IndexedDB

### Database Schema

```javascript
// Object stores and indexes
inventory: { keyPath: 'id' }
  - index: category, status, store_id, acquisition_date

visits: { keyPath: 'id' }
  - index: store_id, date

stores: { keyPath: 'id' }
  - index: tier, name

settings: { keyPath: 'id' }

attachments: { keyPath: 'id' }
  - index: itemId, synced
```

### Common Operations

**Get all items:**
```javascript
import { getAllItems } from './db.js';

const items = await getAllItems();
```

**Add an item:**
```javascript
import { addItem } from './db.js';
import { generateId, nowISO } from './utils.js';

const newItem = {
  id: generateId(),
  title: 'Vintage Blazer',
  category: 'clothing',
  brand: 'Max Mara',
  purchase_price: 25,
  status: 'unlisted',
  created_at: nowISO(),
  updated_at: nowISO()
};

await addItem(newItem);
```

**Update an item:**
```javascript
import { getItem, updateItem } from './db.js';
import { nowISO } from './utils.js';

const item = await getItem(123);
item.status = 'listed';
item.updated_at = nowISO();
await updateItem(item);
```

**Delete an item:**
```javascript
import { deleteItem } from './db.js';

await deleteItem(123);
```

**Query by index:**
```javascript
// Get all items in a category (custom query)
async function getItemsByCategory(category) {
  const db = await openDB();
  const tx = db.transaction('inventory', 'readonly');
  const store = tx.objectStore('inventory');
  const index = store.index('category');

  return new Promise((resolve, reject) => {
    const request = index.getAll(category);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
```

---

## Adding New Features

### Adding a New Tab

1. **Add HTML structure:**
```html
<!-- In nav -->
<button class="tab" data-tab="analytics">Analytics</button>

<!-- In main -->
<section id="analytics" class="page">
  <h1>Analytics</h1>
  <!-- Tab content -->
</section>
```

2. **Create module:**
```javascript
// js/analytics.js
export async function initAnalytics() {
  await loadData();
  setupEventHandlers();
}

async function loadData() {
  // Load from IndexedDB
}

function setupEventHandlers() {
  // Bind events
}
```

3. **Import in app.js:**
```javascript
import { initAnalytics } from './analytics.js';

// In init()
await Promise.all([
  // ... existing modules
  initAnalytics()
]);
```

### Adding a New Modal

1. **Add dialog HTML:**
```html
<dialog id="my-modal">
  <div class="modal-header">
    <h2>Modal Title</h2>
    <button class="modal-close">&times;</button>
  </div>
  <form id="my-modal-form">
    <label>
      Field
      <input type="text" name="field" required>
    </label>
    <button type="submit">Save</button>
  </form>
</dialog>
```

2. **Create controller in your module:**
```javascript
import { createModalController } from './ui.js';

const myModal = createModalController(document.getElementById('my-modal'));

export function openMyModal() {
  myModal.open();
}

// Form handler
document.getElementById('my-modal-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  // Process data...
  myModal.close();
});
```

### Adding a New Item Field

1. **Update form HTML in `index.html`:**
```html
<label>
  New Field
  <input type="text" name="new_field">
</label>
```

2. **Update `getFormData()` in `inventory.js`:**
```javascript
function getFormData(form) {
  return {
    // ... existing fields
    new_field: form.new_field.value || null
  };
}
```

3. **Update table rendering if needed:**
```javascript
// Add column header
<th data-sort="new_field">New Field</th>

// Add cell
<td>${escapeHtml(item.new_field || '')}</td>
```

### Adding a Table Column

1. **Add header:**
```html
<th data-sort="column_name">Column Label</th>
```

2. **Add cell in render function:**
```javascript
<td>${escapeHtml(item.column_name || '')}</td>
```

3. **Update sort handling if using custom sort logic.**

---

## Google Drive Sync

### Architecture

```
sync.js              ← Orchestration, public API
  ↓
core/sync-engine.js  ← State machine, conflict resolution
  ↓
core/google-drive.js ← Drive API calls
core/oauth.js        ← Token management
```

### Sync Flow

1. **On app open:** Pull from Drive, merge with local
2. **On local change:** Mark dirty, write to IndexedDB, queue sync
3. **Background sync:** Push to Drive after 30s debounce
4. **Offline:** Queue changes, sync when online

### Conflict Resolution

Uses **last-write-wins** with a dirty flag:
- If local data is dirty (modified since last sync), local wins
- If local data is clean, Drive version wins

### Using Sync in Code

```javascript
import { isConnected, syncOnOpen, markDirty } from './sync.js';

// Check connection
if (isConnected()) {
  await syncOnOpen();
}

// After modifying data
await updateItem(item);
markDirty('inventory');  // Queue for sync
```

---

## Reference Data

### Files in `/data/`

| File | Purpose |
|------|---------|
| `stores.json` | Archive (not loaded; store data lives in Google Drive) |
| `inventory.json` | Archive (not loaded; inventory data lives in Google Drive) |
| `brands-clothing-shoes.json` | Brand tier valuations (lookup table) |
| `brands-jewelry-hallmarks.json` | Hallmark authentication database (lookup table) |
| `materials.json` | Fiber, leather, metal quality guides (lookup table) |
| `inventory-form-schema.json` | Complete item data schema |
| `rotation-logic.json` | Visit frequency rules |

### Data Storage

All user data (inventory, stores, visits) lives in Google Drive and syncs to IndexedDB on app open.

The JSON files in `/data/` are now only used for:
- Brand/material lookup tables (read-only reference)
- Form schema definitions
- Local archives of data that has been migrated to Google Drive

---

## Testing and Debugging

### Development Tools

Available in browser console:

```javascript
window.seedDatabase()   // Load 48 test items
window.clearAllData()   // Wipe all data
```

### Inspecting IndexedDB

1. Open DevTools (F12)
2. Go to **Application** tab
3. Expand **IndexedDB** → **thrift-inventory**
4. Click on object stores to view data

### Debugging Sync

Enable verbose logging:
```javascript
// In sync.js, add console.log statements
console.log('Sync state:', state.syncState);
```

### Service Worker

To update after changes:
1. DevTools → Application → Service Workers
2. Click "Update" or "Unregister"
3. Hard refresh (Ctrl+Shift+R)

Or during development:
```javascript
// Bypass service worker
// DevTools → Network → Check "Disable cache"
```

### Common Issues

**Data not appearing:**
- Check IndexedDB in DevTools
- Verify `await` on all DB operations
- Check console for errors

**Sync not working:**
- Check `isConnected()` returns true
- Verify OAuth token in `state.accessToken`
- Check Network tab for API errors

**Service worker caching old files:**
- Increment cache version in `sw.js`
- Unregister and re-register worker

---

## Code Style

### Module Organization

Each module follows this structure:
```javascript
// =============================================================================
// MODULE NAME
// =============================================================================

import { ... } from './db.js';
import { ... } from './utils.js';

// =============================================================================
// STATE
// =============================================================================

let moduleState = [];

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initModule() {
  await loadData();
  setupEventHandlers();
}

// =============================================================================
// DATA LOADING
// =============================================================================

async function loadData() { ... }

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function setupEventHandlers() { ... }

// =============================================================================
// RENDERING
// =============================================================================

function render() { ... }
```

### Naming Conventions

- **Files:** lowercase with dashes (`dashboard-actions.js`)
- **Functions:** camelCase (`getItemById`)
- **Constants:** UPPER_SNAKE_CASE (`DB_VERSION`)
- **DOM IDs:** lowercase with dashes (`add-item-btn`)
- **CSS classes:** lowercase with dashes (`item-card`)

### Comments

- Use section headers: `// === SECTION NAME ===`
- Document function parameters with JSDoc
- Add inline comments for complex logic only

### Async/Await

Always use async/await for IndexedDB and fetch operations:
```javascript
// Good
const items = await getAllItems();

// Avoid
getAllItems().then(items => { ... });
```

### Error Handling

Use try/catch for user-facing operations:
```javascript
try {
  await saveItem(item);
  showToast('Item saved');
} catch (err) {
  console.error('Save failed:', err);
  showToast('Save failed');
}
```

---

## Further Reading

- [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [MDN: Dialog element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog)
- [Google Drive API](https://developers.google.com/drive/api/v3/about-sdk)
