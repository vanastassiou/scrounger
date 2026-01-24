# User's Guide

A comprehensive guide for using the Bargain Huntress thrift inventory tracker.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Chat Advisor](#chat-advisor)
4. [Inventory Management](#inventory-management)
5. [Stores & Visits](#stores--visits)
6. [Selling Pipeline](#selling-pipeline)
7. [References](#references)
8. [Settings](#settings)
9. [Tips & Best Practices](#tips--best-practices)
10. [FAQ](#faq)

---

## Getting Started

### First Launch

When you first open Bargain Huntress, you'll see the Dashboard tab with:
- Quick stats showing your inventory summary
- Quick action buttons to add items or log visits
- Action items showing what needs attention

The app works offline immediately. All data is stored locally on your device.

### Installing as a PWA

For the best mobile experience, install the app to your home screen:

**On iPhone/iPad (Safari):**
1. Open the app in Safari
2. Tap the Share button (square with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add** in the top right

**On Android (Chrome):**
1. Open the app in Chrome
2. Tap the three-dot menu
3. Tap **Install app** or **Add to Home Screen**
4. Tap **Install**

**On Desktop (Chrome/Edge):**
1. Look for the install icon in the address bar
2. Click it and confirm installation

Once installed, the app:
- Opens full-screen (no browser UI)
- Works offline
- Loads faster
- Gets its own app icon

### Setting Up Google Drive Sync

To back up your data to Google Drive:

1. Go to the **Settings** tab
2. Tap **Connect to Google**
3. Sign in with your Google account
4. Grant the app permission to access Drive files
5. Choose or create a folder for your data

Once connected:
- Data syncs automatically when you have internet
- Changes are saved both locally and to Drive
- You can access your data from multiple devices

---

## Dashboard

The Dashboard is your home screen, showing an overview of your inventory and what needs attention.

### Quick Stats

| Stat | Description |
|------|-------------|
| **Items** | Total items in your inventory |
| **Invested** | Total purchase costs (your cost basis) |
| **Revenue** | Total sales revenue |
| **Profit** | Revenue minus costs and fees |
| **Margin** | Profit as percentage of revenue |
| **Stores** | Number of stores you've visited |

### Quick Actions

- **Add item** — Open the form to add a new inventory item
- **Log visit** — Record a visit to a thrift store

### Action Items

The action tiles show counts of items needing attention:

| Tile | Items Shown |
|------|-------------|
| **Perfect time to list** | Items that match current seasonal trends |
| **Needs photo** | Items without photos (can't list without them) |
| **Ready to list** | Photographed items ready to create listings |
| **Needs packaging** | Sold items that need to be packaged |
| **Ready to ship** | Packaged items awaiting shipping |
| **Awaiting delivery** | Shipped items not yet confirmed received |

Tap any tile to see the items in that category.

---

## Chat Advisor

The Chat tab provides an AI-powered sourcing advisor to help you evaluate finds, get pricing guidance, and log items hands-free.

### Starting a Sourcing Trip

When you arrive at a store:

1. Tap the **Chat** tab
2. Tap **Start Trip**
3. Allow location access if prompted (or tap **Skip location** for faster start)
4. Select the store from the list (or search for it)
5. Tap **Confirm Store**

**Tip:** If GPS is slow, tap **Skip location** to start immediately. The store search continues in background, or you can manually select your store right away.

The advisor now knows where you are and can:
- Track items you log during this trip
- Provide store-specific context
- Calculate your running total

### Voice Input

If your device supports speech recognition:

1. Tap the microphone button
2. Speak naturally: "Found a Pendleton wool shirt, size large, twelve dollars"
3. The advisor will parse your description and confirm

### Natural Language Logging

Just describe what you find. The advisor understands phrases like:

- "Found a St. John knit blazer, excellent condition, $15"
- "Picking up some Burberry flats, size 10, $25"
- "Getting a vintage Escada silk blouse for $18"

The advisor will:
- Parse the details (brand, category, price, condition)
- Suggest a resale price range
- Log it to your inventory

### Undo a Logged Item

Made a mistake? After logging an item, you have **10 seconds** to undo:

1. Look for the **Undo** button in the confirmation message
2. Tap it to remove the item from inventory
3. The button disappears after 10 seconds

This is useful when you:
- Accidentally logged the wrong item
- Decided not to buy something you just logged
- Need to correct a major error (easier to undo and re-log)

### Corrections

Made a mistake? Just say:
- "Actually that was $20 not $15"
- "Correction: it's a size medium"
- "It's actually in good condition, not excellent"

The advisor will update the most recently logged item.

### Getting Advice

Ask questions naturally:
- "What's Pendleton worth?"
- "Is this Escada label from the good era?"
- "Should I get this Coogi sweater for $45?"
- "What platform should I sell designer shoes on?"

### Ending a Trip

When you're done shopping:

1. Tap **End Trip**
2. Review your trip summary

The advisor will show how many items you logged and your total spend.

### Offline Mode

If you lose internet connection:
- Messages are queued and sent when you reconnect
- You can still log items (they save locally)
- A connection indicator shows your status (green = online, yellow = offline)
- Queued messages show a count badge so you know how many are pending

When you reconnect, queued messages are automatically sent in order.

---

## Inventory Management

The Inventory tab has three views:

### Collection View

Your active inventory (items you own but haven't sold).

**Filtering:**
- Use the category dropdown to filter by Clothing, Shoes, Jewelry, or Accessories
- Use the search box to find items by title, brand, or notes

**Table columns:**
- **Item** — Title and brand
- **Est. Return** — Estimated profit (suggested price minus purchase price)
- **Actions** — Quick actions for the item

**Row actions:**
- Tap a row to view item details
- Use action buttons to move items through the pipeline

### Selling View

Items currently in the sales pipeline.

**Filtering:**
- **Status filter** — Filter by pipeline stage
- **Platform filter** — Filter by listing platform
- **Search** — Find specific items

**Table columns:**
- **Item** — Title
- **Next step** — Current pipeline status
- **Price** — Listed or sold price
- **Est. Return** — Estimated profit
- **Platform** — Where it's listed/sold
- **Profit** — Actual profit (for sold items)

### Archive View

Completed items (sold, returned, donated, or kept).

Use this to:
- Review your sales history
- Track what you kept for yourself
- See items you donated

### Adding an Item

1. Tap **Add item** on the Dashboard or use the + button
2. Fill in the details:

**Required fields:**
- **Title** — Brief description
- **Category** — Clothing, Shoes, Jewelry, or Accessories
- **Purchase price** — What you paid

**Recommended fields:**
- **Brand** — The label/maker
- **Condition** — Excellent, Good, Fair, or Poor
- **Store** — Where you found it
- **Subcategory** — More specific type (shirt, dress, boots, etc.)

**Optional fields:**
- **Photos** — Add up to 5 photos
- **Measurements** — Important for clothing
- **Materials** — Silk, wool, leather, etc.
- **Era** — For vintage items
- **Flaws** — Note any damage
- **Notes** — Any other details

3. Tap **Save**

### Editing an Item

1. Tap the item row to open details
2. Tap **Edit**
3. Make your changes
4. Tap **Save**

### Item Pipeline Actions

From the item detail view:

| Action | When to Use |
|--------|-------------|
| **Mark as Photographed** | After taking listing photos |
| **Start Selling** | Open the selling form to list the item |
| **Mark as Sold** | When you've made a sale |
| **Archive** | Move to archive (kept, donated, returned) |

---

## Stores & Visits

### Stores Tab (in References)

Browse the store database with 30+ pre-loaded thrift stores.

**Store Tiers:**

| Tier | Description |
|------|-------------|
| **S** | Elite — Consistent high-quality finds |
| **A** | Excellent — Great selection, worth frequent visits |
| **B** | Good — Solid finds, regular rotation |
| **C** | Basic — Occasional finds, opportunistic visits |

**Store Information:**
- Address and hours
- Chain affiliation (Value Village, Salvation Army, MCC, etc.)
- Geographic cluster (Metro Van, Fraser Valley, etc.)
- Your visit history and stats

### Logging a Visit

1. Tap **Log visit** on the Dashboard
2. Select the store
3. Optionally add:
   - Duration
   - Notes about the trip
4. Tap **Save**

Visits are also logged automatically when you start a trip in Chat.

### Store Analytics

For each store you've visited, the app calculates:

| Metric | Description |
|--------|-------------|
| **Hit rate** | Percentage of visits where you found items |
| **Avg spend** | Average spend per visit |
| **Revenue/visit** | Average revenue generated per visit |
| **Total visits** | Number of times you've visited |

Use these to prioritize which stores to visit.

### Adding a Custom Store

1. Go to References > Stores
2. Tap **Add Store**
3. Fill in:
   - Name
   - Address
   - Tier (your assessment)
   - Hours (optional)
   - Notes
4. Tap **Save**

---

## Selling Pipeline

The 8-stage sales pipeline tracks items from your closet to the buyer's hands.

### Pipeline Stages

```
Unlisted → Photographed → Listed → Pending Sale → Packaged → Shipped → Confirmed → Sold
```

| Stage | Description |
|-------|-------------|
| **Unlisted** | Item acquired, not yet photographed |
| **Photographed** | Photos taken, ready to create listing |
| **Listed** | Active listing on a platform |
| **Pending Sale** | Sold, awaiting payment confirmation |
| **Packaged** | Order confirmed, item packaged |
| **Shipped** | Package mailed, tracking uploaded |
| **Confirmed** | Buyer confirmed receipt |
| **Sold** | Transaction complete |

### Starting the Selling Process

1. Find the item in Collection view
2. Tap to open details
3. Tap **Start Selling**
4. Fill in:
   - **Platform** — Where you're listing
   - **Listed price** — Your asking price
   - **Date listed**
5. Tap **Save**

The item moves to the Selling view.

### Platform Options

| Platform | Best For |
|----------|----------|
| **eBay** | International reach, collectors, auction format |
| **Poshmark** | Women's contemporary brands, social selling |
| **Etsy** | Vintage (20+ years), handmade, unique items |
| **Depop** | Y2K, streetwear, younger demographic |
| **Vestiaire Collective** | Luxury designer items |
| **The RealReal** | High-end consignment |
| **Grailed** | Men's streetwear and designer |

### Recording a Sale

1. Find the item in Selling view
2. Tap to open details
3. Tap **Mark as Sold**
4. Fill in:
   - **Sale price** — Final price received
   - **Platform fees** — Automatically calculated based on platform
   - **Shipping cost** — What you paid to ship
   - **Date sold**
5. Tap **Save**

### Profit Calculation

Profit is calculated as:

```
Profit = Sale Price - Purchase Price - Shipping Cost - Platform Fees
```

Platform fees are automatically calculated based on each platform's fee structure.

### Tracking Shipments

1. When the item is packaged, update status to **Packaged**
2. After shipping, update to **Shipped**
3. Once the buyer confirms receipt, update to **Confirmed**
4. The sale is complete when marked **Sold**

---

## References

The References tab provides lookup data to help with sourcing decisions.

### Stores

Browse all stores in the database. Tap a store to see:
- Full details and hours
- Your visit history
- Performance metrics

### Brands

Look up brands to check:
- Tier classification (S/A/B/Vintage)
- Typical resale value range
- Tips for authentication
- What to look for

Useful when you're in-store evaluating an unfamiliar label.

### Platforms

Compare selling platforms:
- Fee structures
- Payout calculations
- Best categories for each platform
- Seller tips

### Trends

See what sells best by season:
- Monthly recommendations (what to list now)
- Seasonal patterns
- Category trends

Use this to prioritize which items to photograph and list.

---

## Settings

### Google Drive Sync

**Connect:**
1. Tap **Connect to Google**
2. Complete OAuth sign-in
3. Select a sync folder

**Disconnect:**
- Tap **Disconnect** to unlink Google Drive
- Your local data remains

**Manual Sync:**
- Tap **Sync Now** to force an immediate sync

### Data Management

**Export Data:**
- Download a JSON backup of all your data
- Useful for backup or migration

**Import Data:**
- Restore from a previous export
- Merge with existing data

**Clear All Data:**
- Wipe all local data
- Requires confirmation
- Cannot be undone (unless synced to Drive)

### Sync Status

The status indicator shows:

| Status | Meaning |
|--------|---------|
| **Not synced** | Not connected to Google Drive |
| **Synced** | Connected and up to date |
| **Syncing...** | Sync in progress |
| **Offline** | No internet, changes queued |
| **Error** | Sync failed (tap for details) |

---

## Tips & Best Practices

### In-Store Workflow

1. **Start a trip** in Chat when you arrive
2. **Describe finds** naturally as you shop
3. **Ask questions** about unfamiliar brands
4. **Log items** with price and condition
5. **End the trip** when done

### Photo Documentation

Good photos = faster sales:
- Use natural lighting
- Capture front, back, labels, and flaws
- Include measurements in description
- Show scale (hanger, mannequin)

### Data Organization

- **Use subcategories** — "blazer" not just "clothing"
- **Note the era** — Vintage commands premiums
- **Record materials** — Silk, cashmere, leather matter
- **Document flaws** — Be honest, builds trust

### Pricing Strategy

- **Check sold comps** — Not active listings
- **Factor in fees** — Each platform takes a cut
- **Consider season** — Time listings appropriately
- **Price higher to start** — You can always lower

### Store Rotation

- **Visit S-tier stores first** — Best ROI on your time
- **Track your hits** — Analytics show what works
- **Try new stores** — Expand beyond familiar spots
- **Log zero-find visits** — Important for hit rate accuracy

---

## FAQ

### General

**Q: Does the app work offline?**
A: Yes! All core features work offline. Data syncs when you reconnect.

**Q: Where is my data stored?**
A: Locally in your browser's IndexedDB. Optionally backed up to Google Drive.

**Q: Can I use the app on multiple devices?**
A: Yes, with Google Drive sync enabled. Changes sync across devices.

### Inventory

**Q: How do I delete an item?**
A: Open the item details, scroll down, and tap **Delete Item**.

**Q: Can I bulk edit items?**
A: Not currently. Edit items one at a time.

**Q: What's the difference between Collection and Selling views?**
A: Collection shows items you own but haven't started selling. Selling shows items in the sales pipeline.

### Selling

**Q: How are platform fees calculated?**
A: Based on each platform's published fee structure (see References > Platforms).

**Q: Can I list on multiple platforms?**
A: Track one primary platform per item. Note cross-listing in the item notes.

**Q: What if a sale falls through?**
A: Update the status back to "Listed" and adjust notes.

### Sync

**Q: What if there's a sync conflict?**
A: Local changes take priority if you've made edits since the last sync. Otherwise, Drive wins.

**Q: How often does sync happen?**
A: Automatically on app open and after changes (with a 30-second delay to batch updates).

**Q: Can I recover deleted items?**
A: Only if synced to Drive before deletion. Check the sync folder directly.

### Chat Advisor

**Q: Why isn't the chat working?**
A: The chat requires the Cloudflare Worker to be deployed. See the [Setup Guide](setup-guide.md).

**Q: Does the advisor remember our conversations?**
A: Within a session, yes. Chat logs can be persisted (feature in development).

**Q: Can I use the chat offline?**
A: Messages queue locally and send when you reconnect, but you won't get responses until online.

---

## Getting Help

If you encounter issues:

1. Check the [Troubleshooting section](setup-guide.md#troubleshooting) in the Setup Guide
2. Clear browser cache and refresh
3. Try disconnecting and reconnecting Google Drive
4. Export your data as a backup before troubleshooting

---

## Related Documentation

- [Setup Guide](setup-guide.md) — Installation and configuration
- [Developer's Guide](developers-guide.md) — Technical architecture
