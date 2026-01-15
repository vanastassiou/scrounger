# Bargain Huntress Tracker

A mobile-first PWA for tracking thrift store finds, managing resale inventory, and optimizing sourcing trips. Built for vintage clothing enthusiasts who source high-end clothing, shoes, and jewelry.

## Features

### Dashboard
- Quick stats: total items, capital invested, revenue, stores visited
- Action items workflow for items needing photos, listings, shipping, or sale confirmation
- One-tap access to add items or log visits

### Inventory
- Full item management with photos, measurements, and condition tracking
- Category filtering: Clothing, Shoes, Jewelry, Accessories
- Searchable table with sortable columns
- Comprehensive item details: brand, era, materials, flaws, quality scoring
- Cost basis and resale pricing

### Stores
- 30+ pre-loaded thrift stores (Metro Vancouver through Fraser Valley)
- Tier system (S/A/B/C) for quality categorization
- Per-store analytics: visit history, hit rate, average spend
- Add custom stores with your own tiers
- Geographic clustering for trip planning

### Visits
- Log visits with date, duration, and notes
- Track items acquired during each visit
- Visit history with computed analytics
- Spreadsheet-style item entry during visits

### Selling
- 8-step sales pipeline: Unlisted → Photographed → Listed → Pending Sale → Packaged → Shipped → Confirmed → Sold
- Multi-platform support: Poshmark, eBay, Etsy, Depop, Facebook Marketplace, Local Consignment
- Profit calculation: Sale Price − Cost Basis − Shipping − Platform Fees
- Revenue analytics by platform and time period

### Settings
- Optional Google Drive sync (3-step setup)
- Data management tools
- Sync status indicator

## Quick Start

```bash
npm start
```

Opens at [http://localhost:8080](http://localhost:8080)

No build step required — the app serves vanilla JavaScript directly.

## PWA Installation

### On Mobile (iOS/Android)
1. Open the app in your browser
2. Tap the share button (iOS) or menu (Android)
3. Select "Add to Home Screen"
4. The app works offline and runs fullscreen

### On Desktop
1. Look for the install icon in your browser's address bar
2. Click to install as a standalone app

## Google Drive Sync (Optional)

The app works fully offline by default. To enable cloud backup:

1. **Connect** — Click "Connect to Google" in Settings and authorize access
2. **Select Folder** — Choose or create a sync folder in Google Drive
3. **Auto-Sync** — Changes sync automatically in the background

Sync uses a last-write-wins strategy. Your local changes take priority when you're offline.

## Tech Stack

- **Zero dependencies** — Vanilla JavaScript (ES6 modules)
- **Storage** — IndexedDB for local data
- **Sync** — Google Drive API (optional)
- **Offline** — Service Worker with cache-first strategy
- **UI** — Native HTML `<dialog>` elements, semantic HTML

## Development Tools

Available in the browser console:

```javascript
window.seedDatabase()   // Load 48 test items for development
window.clearAllData()   // Wipe all local data
```

## Reference Data

The `/data/` folder contains:
- `stores.json` — Pre-loaded store database with hours, tiers, and clusters
- `brands-clothing-shoes.json` — Brand tier valuations (S/A/B/Vintage)
- `brands-jewelry-hallmarks.json` — Hallmark database for authentication
- `materials.json` — Fiber, leather, and metal quality guides
- `inventory-form-schema.json` — Complete item data schema
- `rotation-logic.json` — Visit frequency rules by store tier

## Documentation

- [Developer's Guide](docs/developers-guide.md) — Architecture and contribution guide
- `CLAUDE.md` — Quick reference for AI assistants
- `features.md` — Full feature specification

## License

Private project.
