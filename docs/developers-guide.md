# Developer's Guide

A comprehensive guide for developers contributing to the Bargain Huntress Tracker.

## Table of Contents

1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Architecture Overview](#architecture-overview)
4. [Module Reference](#module-reference)
5. [Chat Module Architecture](#chat-module-architecture)
6. [Cloudflare Workers](#cloudflare-workers)
7. [Key Patterns](#key-patterns)
8. [Working with IndexedDB](#working-with-indexeddb)
9. [Adding New Features](#adding-new-features)
10. [Google Drive Sync](#google-drive-sync)
11. [Reference Data](#reference-data)
12. [Testing](#testing)
13. [Security Considerations](#security-considerations)
14. [Code Style](#code-style)

**Related Documentation:**
- [Setup Guide](setup-guide.md) — Installation and configuration
- [User's Guide](users-guide.md) — Feature overview and usage

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
│   ├── state.js                  # Shared state
│   ├── config.js                 # Constants and enums
│   ├── ui.js                     # Tab/modal controllers, toasts
│   ├── utils.js                  # Formatters, DOM helpers
│   ├── components.js             # Reusable UI patterns
│   │
│   ├── # Feature modules
│   ├── inventory.js              # Item management
│   ├── stores.js                 # Store browser
│   ├── visits.js                 # Visit logging
│   ├── selling.js                # Sales pipeline
│   ├── dashboard-actions.js      # Action item workflow
│   ├── settings.js               # Settings UI
│   ├── references.js             # Reference data browser
│   │
│   ├── # Chat & sourcing
│   ├── chat.js                   # Sourcing advisor, trip management
│   ├── location.js               # GPS, store matching
│   │
│   ├── # Pricing & recommendations
│   ├── fees.js                   # Platform fee calculations
│   ├── seasonal.js               # Seasonal selling data
│   ├── recommendations.js        # Pricing recommendations
│   ├── data-loaders.js           # Reference data loading
│   │
│   ├── # Sync infrastructure
│   ├── sync.js                   # Sync orchestration
│   │
│   ├── /core/                    # OAuth & Drive integration
│   │   ├── google-drive.js       # Drive API provider
│   │   ├── sync-engine.js        # Sync state machine
│   │   ├── oauth.js              # OAuth PKCE flow
│   │   └── google-picker.js      # Folder picker
│   │
│   ├── /db/                      # Modular database layer
│   │   ├── core.js               # IndexedDB infrastructure
│   │   ├── inventory.js          # Inventory CRUD
│   │   ├── stores.js             # Store CRUD
│   │   ├── visits.js             # Visit CRUD + stats
│   │   ├── trips.js              # Trip tracking
│   │   ├── expenses.js           # Expense tracking
│   │   ├── chat-logs.js          # Chat history
│   │   ├── knowledge.js          # Brand knowledge base
│   │   ├── attachments.js        # Photo attachments
│   │   └── export.js             # Data export utilities
│   │
│   └── /tests/                   # Test suite
│       └── run-node-tests.mjs    # Node.js test runner
│
├── /workers/                     # Cloudflare Workers
│   └── /claude-proxy/            # Claude API proxy
│       ├── wrangler.toml         # Worker configuration
│       ├── package.json          # Worker dependencies
│       └── /src/
│           ├── index.js          # Main worker entry
│           ├── rate-limit.js     # IP-based rate limiting
│           └── system-prompt.js  # Context-aware prompt builder
│
├── /data/                        # Static reference data (JSON)
│   ├── stores.json               # Pre-loaded thrift stores
│   ├── inventory.json            # Baseline inventory (archived)
│   ├── brands-clothing-shoes.json
│   ├── brands-jewelry-hallmarks.json
│   ├── materials.json
│   ├── platforms.json            # Platform fee structures
│   ├── seasonal-selling.json     # Seasonal recommendations
│   ├── inventory-form-schema.json
│   └── rotation-logic.json
│
└── /docs/                        # Documentation
    ├── setup-guide.md            # Installation guide
    ├── users-guide.md            # End-user manual
    └── developers-guide.md       # This file
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
| Data | `db/*`, `state.js` | Modular IndexedDB operations, shared state |
| UI | `ui.js`, `utils.js`, `components.js` | Controllers, helpers, formatters, reusable patterns |
| Features | `inventory.js`, `stores.js`, `visits.js`, `selling.js`, `references.js` | Tab-specific logic |
| Chat | `chat.js`, `location.js` | Sourcing advisor, GPS, trip management |
| Pricing | `fees.js`, `seasonal.js`, `recommendations.js` | Fee calculations, seasonal data, pricing guidance |
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

### js/db/ — Modular Database Layer

The database layer is split into domain-specific modules for better organization.

#### db/core.js — Infrastructure

Base IndexedDB operations used by all domain modules:

```javascript
export function openDB()                        // Get DB instance
export function resetDB()                       // Reset instance (testing)
export function promisify(request)              // Promisify IDB request
export async function getStore(name, mode)      // Get transaction store
export async function getAllFromStore(name)     // Get all records
export async function getByKey(name, key)       // Get by primary key
export async function addRecord(name, record)   // Add (fails if exists)
export async function putRecord(name, record)   // Add or update
export async function deleteRecord(name, key)   // Delete by key
export async function clearStore(name)          // Clear all records
export async function clearAllData()            // Wipe all stores
```

#### db/inventory.js — Inventory Operations

```javascript
export async function getAllInventory()
export async function getInventoryItem(id)
export async function createInventoryItem(item)
export async function updateInventoryItem(item)
export async function deleteInventoryItem(id)   // Cascades to attachments
export async function getInventoryStats()       // Category counts, totals
```

#### db/stores.js — Store Operations

```javascript
export async function getAllUserStores()
export async function getUserStore(id)
export async function createUserStore(store)
export async function updateUserStore(store)
export async function deleteUserStore(id)
```

#### db/visits.js — Visit Operations

```javascript
export async function getAllVisits()
export async function getVisit(id)
export async function createVisit(visit)
export async function updateVisit(visit)
export async function deleteVisit(id)
export async function getStoreStats(storeId)    // Hit rate, avg spend
```

#### db/trips.js — Trip Tracking

```javascript
export async function getAllTrips()
export async function getTrip(id)
export async function createTrip(trip)
export async function updateTrip(trip)
export async function getActiveTrip()
```

#### db/expenses.js — Expense Tracking

```javascript
export async function getAllExpenses()
export async function createExpense(expense)
export async function deleteExpense(id)
export async function getExpensesByTrip(tripId)
```

#### db/knowledge.js — Brand Knowledge Base

```javascript
export async function getKnowledge()            // Get all brand knowledge
export async function upsertBrandKnowledge(key, info)
export async function deleteBrandKnowledge(key)
```

#### db/chat-logs.js — Chat History

```javascript
export async function getChatLogs(date)         // Get logs for date
export async function appendChatLog(date, message)
export async function clearChatLogs(date)
```

#### db/attachments.js — Photo Attachments

```javascript
export async function getAttachment(id)
export async function createAttachment(attachment)
export async function deleteAttachment(id)
export async function getAttachmentsForItem(itemId)
export async function deleteAttachmentsForItem(itemId)
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

### chat.js — Sourcing Advisor

Manages the chat interface, trip context, and Claude API integration.

```javascript
// Initialization
export async function initChat()

// State (internal)
let state = {
  messages: [],           // Chat history
  isOnTrip: false,        // Trip active flag
  tripStore: null,        // Current store name
  tripStoreId: null,      // Store ID for DB
  currentTripId: null,    // Trip record ID
  tripItemCount: 0,       // Items logged this trip
  tripItems: [],          // Items for context
  lastLoggedItemId: null, // For corrections
  tripStartedAt: null,
  connectionStatus: 'online',
  messageQueue: [],       // Offline queue
  isStreaming: false,
  pendingKnowledgeUpdate: null
};
```

Key features:
- **Trip management** — Start/end sourcing trips with store context
- **Streaming responses** — Real-time response display
- **Action parsing** — Handles `log_item`, `start_trip`, `end_trip`, `update_item`
- **Offline queue** — Messages queue when offline, send when reconnected
- **Voice input** — Speech recognition for hands-free logging

### location.js — Geolocation

GPS and store matching for trip start.

```javascript
// Permission handling
export async function checkLocationPermission()
// Returns: 'granted' | 'prompt' | 'denied' | 'unsupported'

// Get current position
export function getCurrentPosition(timeout = 10000)
// Returns: { lat, lng, accuracy }

// Find nearby stores
export function findNearbyStores(position, stores, radiusKm = 5)

// Distance utilities
export function haversineDistance(lat1, lng1, lat2, lng2)
export function formatDistance(km)

// Google Places integration (optional)
export function setPlacesWorkerUrl(url)
export async function searchNearbyPlaces(position, type)
```

### fees.js — Platform Fee Calculations

Calculates selling fees for each platform based on `platforms.json`.

```javascript
// Initialize (loads platforms.json)
export async function initFees()

// Calculate fees
export function calculatePlatformFees(platformId, salePrice)
// Returns: { totalFees, commission, paymentProcessing, payout, breakdown }

// Get platform data
export function getPlatformsData()
```

Supports complex fee structures:
- Tiered commissions (Poshmark: 20% or flat $2.95)
- Payment processing (eBay: percentage + flat fee)
- Consignment models (The RealReal: seller payout percentage)

### seasonal.js — Seasonal Selling Data

Provides month-by-month selling recommendations.

```javascript
// Initialize (loads seasonal-selling.json)
export async function initSeasonal()

// Get recommendations
export function getCurrentSeasonalTrends()
export function getSeasonalRecommendations(month)
export function getSeasonalDataForItem(category, subcategory)
```

### recommendations.js — Pricing Recommendations

Combines brand data, seasonal trends, and sales history for pricing guidance.

```javascript
// Get price recommendation
export function getPriceRecommendation(item)
// Returns: { low, high, platform, reasoning }

// Platform recommendation
export function getBestPlatform(item)
// Returns: { platform, reasoning }
```

---

## Chat Module Architecture

The chat system connects the PWA to a Claude API proxy for intelligent sourcing assistance.

### Request Flow

```
User Input → chat.js → Cloudflare Worker → Claude API → Streaming Response
                ↓
            Local context
            (trip, inventory, knowledge)
```

### State Management

Chat state persists across page reloads:

```javascript
// Save state to localStorage
function persistState() {
  localStorage.setItem('chatState', JSON.stringify({
    messages: state.messages.slice(-50),  // Keep last 50
    isOnTrip: state.isOnTrip,
    tripStore: state.tripStore,
    tripStoreId: state.tripStoreId,
    currentTripId: state.currentTripId,
    tripItemCount: state.tripItemCount
  }));
}
```

### Action Parsing

Claude responds with JSON containing actions:

```javascript
{
  "message": "Great find! I logged that Pendleton shirt.",
  "actions": [
    {
      "type": "log_item",
      "data": {
        "brand": "Pendleton",
        "category": "clothing",
        "subcategory": "shirt",
        "purchaseCost": 12.99,
        "suggestedPrice": { "low": 35, "high": 55 }
      }
    }
  ],
  "knowledgeUpdate": null
}
```

Action types:
- `start_trip` — Begin a sourcing trip at a store
- `end_trip` — Complete the current trip
- `log_item` — Add item to inventory
- `update_item` — Correct the last logged item

### Context Injection

The worker builds a context-aware system prompt:

```javascript
// From system-prompt.js
export function buildSystemPrompt(context) {
  const parts = [BASE_PERSONA];

  if (context.trip?.isActive) {
    parts.push(buildTripContext(context.trip));
  }

  if (context.inventory?.recentItems?.length > 0) {
    parts.push(buildInventoryContext(context.inventory));
  }

  if (context.knowledge && Object.keys(context.knowledge).length > 0) {
    parts.push(buildKnowledgeContext(context.knowledge));
  }

  parts.push(OUTPUT_FORMAT);
  return parts.join('\n\n---\n\n');
}
```

### Offline Handling

When offline, messages queue locally:

```javascript
if (!navigator.onLine) {
  state.messageQueue.push(message);
  updateQueueUI();
  return;
}

// On reconnect
window.addEventListener('online', () => {
  processMessageQueue();
});
```

---

## Cloudflare Workers

The Claude API proxy keeps the Anthropic API key secure on the server side.

### Worker Structure

```
workers/claude-proxy/
├── wrangler.toml         # Configuration
├── package.json          # Dependencies
└── src/
    ├── index.js          # Entry point, CORS, routing
    ├── rate-limit.js     # IP-based throttling
    └── system-prompt.js  # Context-aware prompt builder
```

### Local Development

```bash
cd workers/claude-proxy
npm install
wrangler dev
```

The worker runs at `http://localhost:8787`.

Test with curl:
```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8080" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"context":{}}'
```

### Rate Limiting

Two storage modes:

**In-memory (development):**
```javascript
const rateLimitMap = new Map();
// Resets on worker restart, not shared across instances
```

**KV storage (production):**
```javascript
// Persistent across instances
await kv.put(key, JSON.stringify(record), { expirationTtl: windowSec });
```

Configuration in `wrangler.toml`:
```toml
[vars]
RATE_LIMIT_REQUESTS = "20"    # Max requests
RATE_LIMIT_WINDOW = "60"      # Window in seconds
```

### Deployment

```bash
# Set API key
wrangler secret put ANTHROPIC_API_KEY

# Deploy
wrangler deploy

# Monitor logs
wrangler tail
```

### CORS Configuration

Allowed origins in `wrangler.toml`:
```toml
[vars]
ALLOWED_ORIGINS = "http://localhost:8080,https://yourdomain.com"
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
  indexes: category, status, store_id, acquisition_date, synced
  // Sync fields: synced (boolean), last_synced_at (ISO string)

visits: { keyPath: 'id' }
  indexes: store_id, date, synced

stores: { keyPath: 'id' }
  indexes: tier, name, synced

trips: { keyPath: 'id' }
  indexes: date, store_id, synced
  // Trip tracking for hit rate calculation

expenses: { keyPath: 'id' }
  indexes: date, category, trip_id, synced
  // Supporting costs (fuel, packaging, etc.)

knowledge: { keyPath: 'id' }
  // Brand research and authentication tips

chat_logs: { keyPath: 'id' }
  indexes: date
  // Daily chat conversation logs

settings: { keyPath: 'id' }

attachments: { keyPath: 'id' }
  indexes: item_id, synced
  // Photo attachments linked to inventory items
```

### Sync Flags

All syncable records include:

```javascript
{
  synced: false,          // False when modified locally
  last_synced_at: null    // ISO timestamp of last sync
}
```

On local modification:
```javascript
item.synced = false;
item.updated_at = nowISO();
await updateInventoryItem(item);
```

On successful sync:
```javascript
item.synced = true;
item.last_synced_at = nowISO();
await updateInventoryItem(item);
```

### Cascade Deletion

When deleting inventory items, attachments are also deleted:

```javascript
// In db/inventory.js
export async function deleteInventoryItem(id) {
  // Delete associated attachments first
  await deleteAttachmentsForItem(id);
  // Then delete the item
  await deleteRecord('inventory', id);
}
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
2. **On local change:** Mark unsynced, write to IndexedDB, queue sync
3. **Background sync:** Push to Drive after 30s debounce
4. **Offline:** Queue changes, sync when online

### Conflict Resolution

Uses **last-write-wins** with an unsynced flag:
- If local data is unsynced (modified since last sync), local wins
- If local data is clean, Drive version wins

### Using Sync in Code

```javascript
import { isConnected, syncOnOpen, markUnsynced } from './sync.js';

// Check connection
if (isConnected()) {
  await syncOnOpen();
}

// After modifying data
await updateItem(item);
markUnsynced('inventory');  // Queue for sync
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

## Testing

### Running Tests

```bash
# Run chat-logs tests only (default)
npm test

# Run all test modules
npm run test:all

# Run specific test module
node js/tests/run-node-tests.mjs --fees
node js/tests/run-node-tests.mjs --inventory
node js/tests/run-node-tests.mjs --sync
```

### Available Test Modules

| Flag | Tests |
|------|-------|
| `--schema` | Schema extensions (trips, expenses, knowledge) |
| `--pwa` | PWA manifest and service worker |
| `--chat` | Chat UI and actions |
| `--inventory` | Inventory CRUD, pipeline, archive |
| `--selling` | Selling pipeline validation |
| `--sync` | Sync engine and merge logic |
| `--stores` | Store CRUD and stats |
| `--visits` | Visits CRUD and computed stats |
| `--recommendations` | Pricing recommendations |
| `--fees` | Platform fee calculations |

Run multiple modules:
```bash
node js/tests/run-node-tests.mjs --fees --inventory --stores
```

### Test Infrastructure

Tests run in Node.js using `fake-indexeddb`:

```javascript
// run-node-tests.mjs
import 'fake-indexeddb/auto';

// Polyfill browser globals
globalThis.localStorage = { /* mock */ };
globalThis.document = { /* mock */ };
globalThis.navigator = { onLine: true };
```

### Adding New Tests

1. Create a test function in the test file:

```javascript
async function testNewFeature(db) {
  logSection('New Feature Tests');

  // Test case
  const result = await db.someFunction();
  assert(result !== null, 'Function returns result');
  assert(result.length > 0, 'Result has items');
}
```

2. Register it in the test runner:

```javascript
const TEST_MODULES = {
  // ...existing modules
  newfeature: testNewFeature
};
```

3. Run: `node js/tests/run-node-tests.mjs --newfeature`

### Development Tools

Available in browser console:

```javascript
window.seedDatabase()   // Load 48 test items from CSV
window.clearAllData()   // Wipe all IndexedDB data
```

### Debugging

**Inspecting IndexedDB:**
1. Open DevTools (F12)
2. Go to **Application** tab
3. Expand **IndexedDB** → **thrift-inventory**
4. Click on object stores to view data

**Service Worker:**
1. DevTools → Application → Service Workers
2. Check "Update on reload" during development
3. Click "Unregister" to reset completely
4. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

**Sync Issues:**
- Check `state.syncState` in console
- Verify `state.accessToken` is set
- Watch Network tab for API errors

---

## Security Considerations

### OAuth Token Storage

OAuth tokens are stored in `sessionStorage`, not `localStorage`:

```javascript
// In core/oauth.js
sessionStorage.setItem('accessToken', token);
sessionStorage.setItem('refreshToken', refreshToken);
```

Benefits:
- Tokens cleared when browser tab closes
- Not persisted across sessions
- Reduces exposure window for stolen tokens

### Input Sanitization

All user-controlled content is escaped before rendering:

```javascript
// In utils.js
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Usage in rendering
tbody.innerHTML = items.map(item => `
  <tr>
    <td>${escapeHtml(item.title)}</td>
    <td>${escapeHtml(item.brand || '')}</td>
  </tr>
`).join('');
```

### XSS Prevention

**Pattern: Always escape dynamic content:**

```javascript
// Good - escaped
element.innerHTML = `<div>${escapeHtml(userInput)}</div>`;

// Good - textContent (auto-escapes)
element.textContent = userInput;

// Bad - raw interpolation
element.innerHTML = `<div>${userInput}</div>`;
```

**Pattern: Use textContent for single values:**

```javascript
document.getElementById('username').textContent = user.name;
```

### Prompt Injection Prevention

The Claude proxy sanitizes all user-controlled context:

```javascript
// In workers/claude-proxy/src/system-prompt.js
function sanitizeContextValue(value, maxLength = 200) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\r\n\t]/g, ' ')         // Remove newlines
    .replace(/\s+/g, ' ')               // Collapse spaces
    .replace(/[^\x20-\x7E]/g, '')       // Remove non-printable
    .trim()
    .slice(0, maxLength);               // Truncate
}
```

### Rate Limiting

The Claude proxy implements IP-based rate limiting:

```javascript
// Default: 20 requests per 60 seconds
const { limited, remaining } = await checkRateLimit(
  clientIP,
  parseInt(env.RATE_LIMIT_REQUESTS || '20'),
  parseInt(env.RATE_LIMIT_WINDOW || '60'),
  env.RATE_LIMIT  // Optional KV namespace
);

if (limited) {
  return new Response('Rate limit exceeded', { status: 429 });
}
```

### CORS Protection

The worker validates request origins:

```javascript
const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || [];
const origin = request.headers.get('Origin');

if (!allowedOrigins.includes(origin)) {
  return new Response('Forbidden', { status: 403 });
}
```

### API Key Security

- Anthropic API key is stored as a Cloudflare secret
- Never exposed to the client
- Set via: `wrangler secret put ANTHROPIC_API_KEY`

### Best Practices

1. **Never trust client data** — Validate and sanitize all inputs
2. **Use HTTPS** — Required for OAuth and PWA installation
3. **Keep secrets server-side** — Use Cloudflare Workers for sensitive APIs
4. **Limit token scope** — Only request needed OAuth scopes (`drive.file`)
5. **Session tokens** — Use `sessionStorage` over `localStorage` for auth

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
