# Claude Code Prompt Checklist

## How to Use This Document

1. Start each Claude Code session with the context prompt
2. Work through phases in order
3. Use plan mode for items marked **[PLAN]**
4. Verify each step works before moving to the next
5. Check off items as completed

---

## Session Starter (Use Every Time)

```
Read CLAUDE.md, /docs/implementation-plan.md, and /docs/metrics-spec.md to understand the project context and direction.
```

---

## Phase 1: Foundation

### 1.1 Schema Extensions

**[PLAN]**
```
Plan how to implement the schema extensions from the implementation plan. Add these new entities to the data layer:

1. Trips - for tracking sourcing visits (enables hit rate calculation)
2. Expenses - for supporting costs (fuel, packaging, platform fees)
3. Knowledge - for storing brand research and platform tips

Follow existing patterns in db.js and sync.js. Each entity needs:
- IndexedDB object store
- CRUD functions matching existing style
- Google Drive sync integration
- State management if needed

Reference the schema definitions in implementation-plan.md section 1.2.
```

- [ ] Review plan, verify it covers all three entities
- [ ] Verify sync strategy matches existing last-write-wins pattern
- [ ] Approve and implement
- [ ] Test: Create a trip, expense, and knowledge entry via console

**[PLAN]**
```
Plan how to add chat log storage. Chat logs should:

1. Store in daily JSON files (chat-logs/2025-01-21.json format)
2. Support appending conversations without overwriting
3. Sync to Google Drive
4. Link to trips, items, and knowledge entries via IDs

Consider how this differs from other entities (append-only vs CRUD).
```

- [ ] Review plan
- [ ] Approve and implement
- [ ] Test: Append a mock conversation, verify Drive sync

---

### 1.2 Item Record Extensions

```
Extend the inventory item schema to include these new fields:

- listingDate (date item was listed for sale)
- storeId (normalized store identifier, links to stores entity)
- tripId (links to trip when item was purchased)

Update the Add Item form to capture storeId and tripId when logging purchases.
Backfill strategy: existing items without tripId/storeId should still work.
```

- [ ] Verify form updates
- [ ] Test: Add new item with trip association
- [ ] Verify existing items still display correctly

---

### 1.3 PWA Hardening

```
Review the current PWA implementation (sw.js, manifest.json) and improve offline support:

1. Ensure all static assets are cached on install
2. Add offline fallback page for when network and cache both miss
3. Implement background sync queue for data writes made while offline
4. Verify manifest has all required fields for Android installation

Don't break existing functionality. Test on mobile after changes.
```

- [ ] Test: Enable airplane mode, verify app loads
- [ ] Test: Make a change offline, reconnect, verify sync

---

## Phase 2: Chat Interface

### 2.1 Chat UI Component

**[PLAN]**
```
Plan the chat UI component for the in-store advisor. Requirements:

1. New tab or modal (recommend: new tab between Dashboard and Inventory)
2. Mobile-first design:
   - Message history with scroll (newest at bottom)
   - Persistent input bar fixed at bottom
   - Large touch targets
   - High contrast for outdoor visibility
3. Quick action buttons: "Start Trip", "Log Item", "End Trip"
4. Connection status indicator
5. Message queue indicator when offline

Follow existing patterns:
- Tab switching from app.js
- Component patterns from components.js
- Modal patterns if using modal approach

This is UI only - no API integration yet. Mock the responses.
```

- [ ] Review plan, verify mobile-first approach
- [ ] Approve and implement
- [ ] Test on mobile device: input usability, scroll behavior

```
Add voice input support to the chat interface using the Web Speech Recognition API.

1. Add microphone button next to send button
2. Show recording indicator when active
3. Populate input field with transcription
4. Handle browsers that don't support it (hide button gracefully)

Keep it simple - just transcription, not continuous listening.
```

- [ ] Test on Android Chrome
- [ ] Verify graceful degradation on unsupported browsers

---

### 2.2 Cloudflare Worker: Claude API Proxy ✅ IMPLEMENTED

Worker implemented in `/workers/claude-proxy/`. See CLAUDE.md for full documentation.

#### Local Development

```bash
cd workers/claude-proxy
npm install
wrangler dev  # Runs at http://localhost:8787
```

Test with curl:
```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8080" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"context":{}}'
```

#### Deployment

```bash
cd workers/claude-proxy
npm install
wrangler login
wrangler secret put ANTHROPIC_API_KEY
wrangler deploy
```

Then update `WORKER_URL` in `js/chat.js` with your deployed URL.

- [x] Review plan, verify security considerations
- [x] Approve and implement
- [x] Test locally with Wrangler
- [ ] Deploy to Cloudflare
- [ ] **MANUAL**: Run `wrangler secret put ANTHROPIC_API_KEY`
- [ ] Update `WORKER_URL` in `js/chat.js`
- [ ] Test: Send request from app, verify response

System prompt implemented in `/workers/claude-proxy/src/system-prompt.js`:
- [x] Advisor persona with resale expertise
- [x] Context injection (trip, inventory, knowledge)
- [x] JSON response format for actions
- [x] Mobile-friendly response instructions

- [x] Review prompt for tone and completeness
- [ ] Test with sample conversations

---

### 2.3 Chat Integration ✅ PARTIALLY IMPLEMENTED

Client integration implemented in `js/chat.js`:

- [x] Add worker URL to chat.js (`WORKER_URL` constant)
- [x] Implement message sending/receiving with streaming support
- [x] Display responses in chat UI (progressive streaming updates)
- [x] Handle loading states (typing indicator)
- [x] Handle errors (falls back to mock responses)
- [ ] Persist conversation to chat logs after each exchange

To enable live API:
1. Deploy worker (see section 2.2)
2. Update `WORKER_URL` in `js/chat.js` with your worker URL

```javascript
// js/chat.js line 13
const WORKER_URL = 'https://thrifting-claude-proxy.<account>.workers.dev';
```

- [ ] Test: Full conversation round-trip (requires deployed worker)
- [ ] Test: Error handling (disable network, verify graceful failure)
- [ ] Verify chat logs are saved to Google Drive

---

### 2.4 Natural Language Command Parsing

**[PLAN]**
```
Plan natural language command parsing for the advisor. Reference implementation-plan.md section 2.2.

The advisor should return JSON with:
- message: conversational response
- actions: array of structured commands
- knowledgeUpdate: extracted fact to store (if any)

Action types to support:
- start_trip: { storeId }
- end_trip: {}
- log_item: { brand, category, subcategory, material, purchaseCost, suggestedPrice }
- update_item: { field, value } (for corrections)
- knowledge_query: { brand } or { topic }

Client-side handling:
1. Parse response JSON
2. Execute actions (create trip, add item via existing db.js functions)
3. Show confirmation in chat
4. Prompt for knowledge save if knowledgeUpdate present

Update the system prompt to instruct Claude on this response format.
```

- [ ] Review plan
- [ ] Approve and implement
- [ ] Test: "I'm at Goodwill downtown" → verify trip created
- [ ] Test: "Found a Pendleton shirt, $6" → verify item logged
- [ ] Test: "What do you know about Coogi?" → verify knowledge query works

```
Add knowledge extraction confirmation flow.

When advisor returns a knowledgeUpdate:
1. Show the extracted fact in a confirmation card
2. User can confirm, edit, or dismiss
3. On confirm, save to knowledge.json via db.js
4. Link the knowledge entry to the source chat via ID

Keep UI minimal - small card below the message, not a full modal.
```

- [ ] Test: Research a brand, confirm save, verify in knowledge.json

---

### 2.5 Context Injection

```
Implement context injection for the advisor. Before each API call, gather relevant context:

1. Current trip context (if active):
   - Store name and historical performance
   - Items logged this trip
   - Running spend total
   - Time at current store

2. Inventory context (when relevant):
   - Similar items user already owns (same brand/category)
   - Historical sales of similar items

3. Knowledge context:
   - Relevant brand entries based on conversation
   - Platform tips if discussing selling

Keep context payload small - summarize, don't dump raw data.
Add context selection logic to chat.js before API calls.
```

- [ ] Test: Start trip, ask about an item, verify store context is included
- [ ] Test: Ask about a brand you have in inventory, verify it mentions existing items

---

## Phase 3: Platform Integration

### 3.1 eBay API Setup

**[PLAN]**
```
Plan eBay API integration. Create /workers/ebay-proxy/ directory.

Components needed:
1. OAuth flow:
   - Redirect user to eBay authorization
   - Handle callback with auth code
   - Exchange for access/refresh tokens
   - Store refresh token securely (Cloudflare KV)
   - Auto-refresh access token when expired

2. API endpoints to proxy:
   - GET active listings
   - GET sales history (last 90 days)
   - GET offers on listings

3. Client-side:
   - Auth initiation button in Settings
   - Auth status indicator
   - Token refresh handling

Reference eBay OAuth docs: https://developer.ebay.com/api-docs/static/oauth-authorization-code-grant.html
```

- [ ] Review plan
- [ ] **MANUAL**: Ensure eBay developer account is approved
- [ ] **MANUAL**: Configure OAuth redirect URI in eBay dashboard
- [ ] Approve and implement
- [ ] **MANUAL**: Add eBay secrets to Cloudflare dashboard
- [ ] Test: Complete OAuth flow
- [ ] Test: Fetch active listings

```
Implement eBay sales polling and caching.

1. Create Cloudflare Cron Trigger to run every 15 minutes
2. Fetch recent sales from eBay API
3. Compare to cached sales in sales-cache.json
4. Identify new sales
5. Store updated cache to Google Drive
6. Trigger notification for new sales (placeholder - implement in Phase 4)

Add to existing worker or create separate scheduled worker.
```

- [ ] Test: Manually trigger cron
- [ ] Verify sales cache updates
- [ ] Verify new sales are detected

```
Create unified sales data view.

1. Combine eBay sales (from API) with Poshmark sales (manual entry)
2. Add sales-history.js module for querying combined data
3. Calculate metrics from metrics-spec.md:
   - Gross profit per item
   - Net profit per item (with expense allocation)
   - Platform performance comparison

Display in Selling tab or new Analytics sub-tab.
```

- [ ] Verify eBay and Poshmark sales appear together
- [ ] Verify profit calculations match spec

---

### 3.2 Poshmark Manual Entry

```
Improve Poshmark sales entry flow.

Current "Mark as Sold" flow exists - enhance it:
1. Pre-fill platform fees based on sale price (20% over $15)
2. Add quick-entry option from Dashboard or Selling tab
3. Support entry via chat: "Sold the Escada blazer on Posh for $85"

Integrate with the unified sales data view.
```

- [ ] Test: Log sale via form
- [ ] Test: Log sale via chat
- [ ] Verify appears in unified sales view

---

## Phase 4: Notifications

### 4.1 Web Push Setup

**[PLAN]**
```
Plan Web Push notification support.

1. Service worker updates (sw.js):
   - Add push event listener
   - Display notification with appropriate actions
   - Handle notification click (open app to relevant section)

2. Client-side:
   - Request notification permission
   - Subscribe to push and get endpoint
   - Send subscription to worker for storage

3. Worker-side:
   - Store push subscriptions in Cloudflare KV
   - Send notifications via Web Push protocol
   - Handle subscription expiry/refresh

Reference: https://web.dev/push-notifications-overview/
```

- [ ] Review plan
- [ ] Approve and implement
- [ ] Test: Request permission, verify subscription created
- [ ] Test: Send test notification from worker

---

### 4.2 Notification Triggers

```
Implement notification triggers per implementation-plan.md section 4.2.

High priority (implement now):
1. New eBay sale - immediate push
2. New eBay offer - immediate push

Medium priority:
3. Posh Party reminder - 30 min before
4. eBay promotion available - when detected

Wire into existing polling/cron infrastructure.
Include notification preferences in Settings (which notifications to receive).
```

- [ ] Test: Receive notification on eBay sale
- [ ] Test: Toggle notification preference, verify respected

```
Add ntfy.sh as backup notification channel.

1. Add ntfy topic configuration in Settings
2. Send to ntfy in parallel with Web Push
3. Make ntfy optional (user provides their topic name)

Keep it simple - just POST to ntfy.sh/{topic}.
```

- [ ] Test: Receive ntfy notification
- [ ] Verify works when Web Push fails

---

### 4.3 Digest Notifications

```
Implement digest notifications via Cloudflare Cron.

Daily (8am local):
- Stale inventory alert: items listed > 60 days without sale
- Include count and top 3 oldest items

Weekly (Sunday):
- Stores due for revisit: high ROI + 14+ days since last visit
- Include store name and last visit date

Add timezone configuration in Settings (default to device timezone).
```

- [ ] Test: Trigger daily digest manually
- [ ] Test: Trigger weekly digest manually
- [ ] Verify content matches spec

---

## Phase 5: Metrics & Intelligence

### 5.1 Metrics Calculations

```
Implement core metrics from metrics-spec.md. Create /js/metrics.js module.

Profitability metrics:
- grossProfit(item)
- netProfit(item) - requires expense allocation
- roi(item)
- roiByStore(storeId)

Velocity metrics:
- daysToList(item)
- daysOnMarket(item)
- inventoryAge(item)
- sellThroughRate(storeId)

Sourcing metrics:
- hitRate(storeId) - requires trip data
- avgItemsPerVisit(storeId)
- revenuePerVisit(storeId)
- daysSinceLastVisit(storeId)

Follow calculation formulas exactly as specified in metrics-spec.md.
```

- [ ] Unit test each calculation with known values
- [ ] Verify edge cases (no sales, no visits, etc.)

```
Implement expense allocation logic per metrics-spec.md.

Allocation methods:
1. Trip-based (fuel): distribute across items on that trip
2. Period-based (packaging): distribute across items sold in period
3. Item-specific (platform fees): calculate from sale price

Add allocateExpenses(item) function that returns total allocated expense.
Use in netProfit calculation.
```

- [ ] Test: Log fuel expense on trip, verify allocated to items
- [ ] Test: Verify platform fees calculated correctly

---

### 5.2 Store Scorecard

```
Implement store scorecard view from metrics-spec.md.

Display for each store:
- Total visits
- Hit rate
- Total items purchased
- Total invested
- Total revenue (sold items)
- Gross profit
- ROI
- Sell-through rate
- Avg days on market
- Days since last visit
- Revenue per visit

Add as sub-tab in Stores tab.
Make columns sortable.
Color-code by performance tier (define thresholds in config.js).
```

- [ ] Verify all columns calculate correctly
- [ ] Test sorting
- [ ] Verify color coding

---

### 5.3 Advisor Intelligence

```
Enhance advisor context injection with metrics.

When user asks about a store:
- Include store scorecard metrics
- Compare to other stores in same area
- Note if due for revisit

When user asks about pricing:
- Include their historical sell-through at different price points
- Include days on market by price tier
- Suggest price based on ROI optimization, not just comps

Update system prompt to use this data effectively.
```

- [ ] Test: "How's Value Village been for me?" → verify metrics included
- [ ] Test: "What should I price this at?" → verify historical data used

---

## Phase 6: Polish

### 6.1 Error Handling

```
Audit error handling across the app.

1. API failures (Claude, eBay): show user-friendly message, offer retry
2. Sync failures: queue for retry, show indicator
3. Offline state: clear indication, queue writes
4. Auth expiry: prompt re-auth, don't lose work in progress

Add global error boundary pattern.
Log errors for debugging (console in dev, consider remote logging later).
```

- [ ] Test each failure mode manually
- [ ] Verify no silent failures

---

### 6.2 Performance

```
Audit performance, especially on mobile.

1. Initial load time: target < 3s on 3G
2. Data operations: no UI blocking
3. Large inventory handling: virtualize lists if > 500 items
4. Image lazy loading (if displaying item photos)

Profile with Chrome DevTools, fix bottlenecks.
```

- [ ] Measure baseline performance
- [ ] Implement fixes
- [ ] Measure improvement

---

### 6.3 Migration Preparation

```
Abstract data access for future database migration.

Create /js/services/ directory with:
- inventoryService.js
- tripsService.js
- expensesService.js
- knowledgeService.js
- salesService.js

Each service exposes: get, getAll, query, create, update, delete
Services call db.js internally now, but interface stays stable.

Update all modules to use services instead of db.js directly.
```

- [ ] Verify all existing functionality still works
- [ ] Document service interfaces

---

## Verification Checkpoints

### After Phase 1
- [ ] Can create trips, expenses, knowledge entries
- [ ] New entries sync to Google Drive
- [ ] App works offline (basic operations)
- [ ] Existing functionality unbroken

### After Phase 2
- [ ] Can have full conversation with advisor
- [ ] Can log trip and items via chat
- [ ] Knowledge extraction works
- [ ] Chat history persists

### After Phase 3
- [ ] eBay sales appear automatically
- [ ] Can manually log Poshmark sales
- [ ] Unified sales view works
- [ ] Profit calculations correct

### After Phase 4
- [ ] Receive push notification on sale
- [ ] Receive digest notifications
- [ ] Can configure notification preferences

### After Phase 5
- [ ] Store scorecard displays all metrics
- [ ] Advisor uses metrics in responses
- [ ] Expense allocation working

### After Phase 6
- [ ] No silent errors
- [ ] Performance acceptable on mobile
- [ ] Ready for database migration when needed
