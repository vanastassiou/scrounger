# Resale Inventory App: Strategic Metrics Specification

## Overview

This specification defines metrics, schema additions, and calculation logic to support strategic sourcing decisions for a resale business. The goal is to answer questions like:

- Which stores are most profitable?
- When should I revisit a location?
- Where am I finding items that actually sell vs. items that sit?
- What's my true profit after expenses?

---

## Schema Additions

### 1. Item Record Enhancements

Add to existing item records:

```javascript
{
  // Existing fields assumed:
  // id, description, brand, category, purchaseCost, salePrice, 
  // purchaseDate, purchaseLocation, salePlatform, saleDate

  // New fields:
  listingDate: "2025-01-15",        // Date item was listed for sale
  sourceType: "thrift",             // Enum: thrift | consignment | estate | garage | online | other
  storeId: "goodwill-downtown",     // Normalized store identifier
  tripId: "2025-01-10-trip-01"      // Links items to a sourcing trip
}
```

### 2. New Entity: Trips

Track sourcing trips independently from purchases:

```javascript
{
  id: "2025-01-10-trip-01",
  date: "2025-01-10",
  stores: [
    {
      storeId: "goodwill-downtown",
      arrived: "10:30",             // Optional: time tracking
      departed: "11:15"             // Optional: time tracking
    },
    {
      storeId: "value-village-east",
      arrived: "11:45",
      departed: "12:30"
    }
  ],
  notes: "Slow day, mostly picked over"  // Optional
}
```

**Why trips matter:** Enables hit rate calculations. A store visit with no purchases is still valuable data—it tells you the trip wasn't productive.

### 3. New Entity: Stores

Normalize store data for consistent reporting:

```javascript
{
  id: "goodwill-downtown",
  name: "Goodwill - Downtown",
  type: "thrift",                   // Enum: thrift | consignment | estate | garage | online | other
  area: "downtown",                 // Geographic grouping you define
  address: "123 Main St",           // Optional
  notes: "Best shoe section, check Tuesdays"  // Optional
}
```

### 4. New Entity: Expenses

Track supporting costs:

```javascript
{
  id: "exp-2025-01-10-001",
  date: "2025-01-10",
  category: "fuel",                 // Enum: fuel | packaging | shipping_supplies | platform_fees | other
  amount: 25.00,
  tripId: "2025-01-10-trip-01",     // Optional: link to specific trip
  itemId: null,                     // Optional: link to specific item (e.g., shipping cost)
  notes: "Gas for east side trip"
}
```

**Expense categories:**

| Category | Allocation Method |
|----------|-------------------|
| `fuel` | Allocate to trip, then distribute across items purchased on that trip |
| `packaging` | Allocate to item at time of sale, or amortize across all sales in period |
| `shipping_supplies` | Same as packaging |
| `platform_fees` | Allocate to specific item/sale (often calculable from sale price) |
| `other` | Period-based allocation or manual |

---

## Core Metrics

### Profitability Metrics

#### Gross Profit per Item
```javascript
grossProfit = salePrice - purchaseCost
```
**Interpretation:** Basic margin before expenses. Useful for quick item-level assessment.

#### Net Profit per Item
```javascript
netProfit = salePrice - purchaseCost - allocatedExpenses
```
**Interpretation:** True profit. Requires expense allocation (see below).

#### ROI per Item
```javascript
roi = (grossProfit / purchaseCost) * 100
```
**Interpretation:** Percentage return. A $5 item sold for $25 = 400% ROI. Useful for comparing efficiency across price points.

#### ROI per Store
```javascript
storeROI = (totalGrossProfit / totalPurchaseCost) * 100
// Where totals are summed across all sold items from that store
```
**Interpretation:** Core strategic metric. Compare stores to identify highest-yield locations.

**Caveat:** Only includes *sold* items. A store with high ROI but low sell-through may be misleading.

---

### Velocity Metrics

#### Days to List
```javascript
daysToList = listingDate - purchaseDate
```
**Interpretation:** Processing efficiency. High values indicate bottlenecks between sourcing and listing.

#### Days on Market
```javascript
daysOnMarket = saleDate - listingDate
```
**Interpretation:** Demand signal. Low = hot item or good pricing. High = niche item, overpriced, or poor platform fit.

#### Inventory Age
```javascript
inventoryAge = currentDate - purchaseDate
// For unsold items
```
**Interpretation:** Identifies stale inventory. Consider repricing or platform changes for items over your threshold (e.g., 90 days).

#### Sell-Through Rate (by Store)
```javascript
sellThroughRate = (soldItemsFromStore / totalItemsFromStore) * 100
```
**Interpretation:** Quality signal. A store might yield lots of finds, but if they don't sell, the ROI is illusory. Compare sell-through across stores to identify where you're finding *actually desirable* inventory.

**Time-bound variant:** Sell-through within 30/60/90 days gives a velocity-adjusted view.

---

### Sourcing Efficiency Metrics

#### Hit Rate (by Store)
```javascript
hitRate = (visitsWithPurchases / totalVisits) * 100
```
**Interpretation:** How often a store yields something worth buying. Low hit rate + high ROI when you do buy = store is worth occasional checks. Low hit rate + low ROI = deprioritize.

**Requires:** Trip tracking with store visits logged even when no purchase is made.

#### Average Items per Visit
```javascript
avgItemsPerVisit = totalItemsPurchased / totalVisits
```
**Interpretation:** Volume signal. High volume + low ROI = you're buying too indiscriminately. Low volume + high ROI = selective and effective.

#### Revenue per Visit
```javascript
revenuePerVisit = totalSaleRevenue / totalVisits
```
**Interpretation:** Combines hit rate, volume, and item value into a single efficiency metric. Your north star for sourcing decisions.

#### Days Since Last Visit
```javascript
daysSinceVisit = currentDate - lastVisitDate
```
**Interpretation:** Freshness indicator. Stores restock; a long gap may mean opportunity. Combine with historical performance—a 60-day gap at a high-ROI store is a strong revisit signal.

---

### Expense & Profitability Analysis

#### Expense Allocation Methods

**Trip-based expenses (fuel):**
```javascript
// Allocate fuel cost to items purchased on that trip
expensePerItem = tripFuelCost / itemsOnTrip

// Or weight by purchase cost
expensePerItem = tripFuelCost * (itemPurchaseCost / totalTripPurchaseCost)
```

**Period-based expenses (packaging, supplies):**
```javascript
// Sum monthly expenses, divide across items sold that month
monthlyExpensePerItem = monthlyPackagingCost / itemsSoldThisMonth
```

**Item-specific expenses (platform fees):**
```javascript
// Platform fees are often a percentage of sale price
// eBay: ~13% final value fee (varies)
// Poshmark: 20% flat (over $15)
platformFee = salePrice * feeRate
```

#### Net Margin
```javascript
netMargin = ((salePrice - purchaseCost - allocatedExpenses) / salePrice) * 100
```
**Interpretation:** What percentage of revenue is actual profit. Useful for comparing across price points—a $100 item at 30% margin vs. a $20 item at 60% margin.

#### Break-Even Analysis
```javascript
breakEvenPrice = purchaseCost + allocatedExpenses
```
**Interpretation:** Minimum sale price to avoid a loss. Useful when considering price drops on stale inventory.

---

## Derived Strategic Views

### Store Scorecard

Aggregate metrics per store for comparison:

| Metric | Calculation |
|--------|-------------|
| Total Visits | Count of trips including this store |
| Hit Rate | Visits with purchases / Total visits |
| Total Items | Count of items purchased |
| Total Invested | Sum of purchase costs |
| Total Revenue | Sum of sale prices (sold items only) |
| Gross Profit | Revenue - Invested (sold items only) |
| ROI | Gross Profit / Invested (sold items only) |
| Sell-Through Rate | Sold items / Total items |
| Avg Days on Market | Mean of days on market for sold items |
| Days Since Last Visit | Current date - most recent visit |
| Revenue per Visit | Total Revenue / Total Visits |

**Interpretation guide:**
- High ROI + High Sell-Through + High Hit Rate = **Priority store**
- High ROI + Low Sell-Through = **Selective buys, tighten criteria**
- Low ROI + High Hit Rate = **Buying too much low-margin inventory**
- Low everything = **Deprioritize or remove from rotation**

### Area Analysis

Roll up store metrics to geographic areas:

```javascript
areaMetrics = stores
  .filter(s => s.area === targetArea)
  .reduce(aggregateMetrics)
```

**Use case:** "I'm heading to the east side—what's my historical performance there?"

### Time-Based Patterns

If tracking visit times:

```javascript
// Performance by day of week
dayOfWeekMetrics = trips.groupBy(t => getDayOfWeek(t.date))

// Performance by time of day (if tracking arrival times)
timeOfDayMetrics = visits.groupBy(v => getHourBucket(v.arrived))
```

**Use case:** Identify if certain stores are better on specific days (restock schedules, competition patterns).

---

## Implementation Notes

### Data Entry Workflow

**Minimal friction approach for trips:**

1. Log a trip when you return home (or in the car between stops)
2. List stores visited in order
3. Time tracking is optional—date and store list is the minimum viable data

**Expense logging:**
- Batch entry works fine for most expenses
- Fuel: log after each sourcing trip or weekly
- Packaging/supplies: log at time of purchase
- Platform fees: calculate automatically from sale price if possible

### Retroactive Data

For items already in your system without `tripId` or `storeId`:

1. Normalize `purchaseLocation` values to `storeId` (create store records)
2. Generate synthetic trip records from purchase dates + locations
3. Mark these as `synthetic: true` so you know hit rate data is incomplete

### Suggested Indexes

For performant queries:

- Items by `storeId`
- Items by `tripId`
- Items by `saleDate` (for period-based reporting)
- Items by `status` (listed, sold, unlisted)
- Trips by `date`
- Expenses by `date` and `category`

---

## Example Queries (Pseudocode)

### Top 5 Stores by ROI (Sold Items Only)
```javascript
const storeROI = items
  .filter(i => i.saleDate !== null)
  .groupBy(i => i.storeId)
  .map(group => ({
    storeId: group.key,
    roi: (sum(group, 'grossProfit') / sum(group, 'purchaseCost')) * 100,
    itemCount: group.length
  }))
  .filter(s => s.itemCount >= 5)  // Minimum sample size
  .sortBy('roi', 'desc')
  .take(5)
```

### Stores Due for Revisit
```javascript
const revisitCandidates = stores
  .map(s => ({
    ...s,
    daysSinceVisit: daysBetween(s.lastVisitDate, today),
    historicalROI: calculateStoreROI(s.id)
  }))
  .filter(s => s.daysSinceVisit > 14)  // Your threshold
  .filter(s => s.historicalROI > 100)  // Worth visiting
  .sortBy('daysSinceVisit', 'desc')
```

### Monthly Profitability Report
```javascript
const monthlyReport = {
  revenue: sum(soldThisMonth, 'salePrice'),
  cogs: sum(soldThisMonth, 'purchaseCost'),
  grossProfit: revenue - cogs,
  expenses: sum(expensesThisMonth, 'amount'),
  netProfit: grossProfit - expenses,
  netMargin: (netProfit / revenue) * 100,
  itemsSold: soldThisMonth.length,
  avgDaysOnMarket: mean(soldThisMonth, 'daysOnMarket')
}
```

---

## Dashboard Concepts

### Primary View: Store Scorecard
A sortable table with all stores and key metrics. Color-code by performance tier.

### Secondary View: Inventory Health
- Pie chart: Items by status (unlisted, listed, sold)
- Histogram: Inventory age distribution
- List: Stale items (> 90 days) with suggested actions

### Tertiary View: Trends
- Line chart: Monthly revenue, profit, items sold
- Bar chart: Performance by store type (thrift vs. consignment vs. estate)

---

## Future Considerations

- **Platform integration:** Auto-import sales data, calculate fees automatically
- **Sourcing calendar:** Schedule revisits based on days-since-visit + historical performance
- **Price optimization:** Track listing price vs. sale price to measure discounting patterns
- **Category/brand analysis:** Extend store-level metrics to category and brand dimensions
