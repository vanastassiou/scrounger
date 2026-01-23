# Resale Sourcing Operations Platform: Implementation Plan

## Overview

Transform the existing inventory management app into a full sourcing operations platform with:

- Real-time in-store advisor (chat interface)
- Trip and item logging via natural language
- Platform sales monitoring (eBay API + manual Poshmark entry)
- Event notifications (Posh Parties, eBay promotions)
- Persistent knowledge base and conversation memory

**Design principles:**
- Optimize for cost (serverless, free tiers where possible)
- Optimize for privacy (user controls all data, minimal third-party exposure)
- Design for JSON now, structure for database migration later

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        PWA (GitHub Pages)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Inventory  │  │    Chat     │  │   Notifications UI      │  │
│  │  Management │  │  Interface  │  │   (sales, events)       │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Google Drive (Data Layer)                    │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ inventory │ │ knowledge │ │ chat-logs│ │ trips / expenses │  │
│  │   .json   │ │   .json   │ │    /     │ │      .json       │  │
│  └───────────┘ └───────────┘ └──────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Cloudflare Workers (Serverless)                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Claude API     │  │  eBay API       │  │  Notification   │  │
│  │  Proxy          │  │  Proxy          │  │  Scheduler      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Push / SMS Gateway   │
                    │  (ntfy.sh or Twilio)  │
                    └───────────────────────┘
```

---

## Phase 1: Foundation

### 1.1 PWA Configuration

**Goal:** Make the existing app installable and mobile-optimized.

**Tasks:**
- Add `manifest.json` with app metadata, icons, display mode
- Add service worker for basic caching (app shell, static assets)
- Configure offline fallback page
- Test installation flow on Android

**Files to create/modify:**
- `/manifest.json`
- `/sw.js` (service worker)
- Update `index.html` with manifest link and meta tags

**Offline strategy:**
- Cache app shell and UI assets
- Queue data writes when offline, sync when connection restored
- Chat requires connectivity (API dependency)

---

### 1.2 Data Schema Updates

**Goal:** Extend existing JSON structure to support new entities.

**New files in Google Drive:**

```
/data
  /inventory.json      (existing, extended)
  /stores.json         (new)
  /trips.json          (new)
  /expenses.json       (new)
  /knowledge.json      (new)
  /chat-logs/
    /2025-01-21.json   (daily log files)
  /sales-cache.json    (new - cached platform sales data)
```

**Schema definitions:**

See `resale-metrics-spec.md` for inventory, stores, trips, expenses schemas.

**Knowledge base schema:**

```javascript
// knowledge.json
{
  "brands": {
    "escada": {
      "name": "Escada",
      "origin": "Germany",
      "notes": "Margaretha Ley era (pre-1992) most valuable. Look for West German labels.",
      "priceRange": { "low": 20, "high": 200 },
      "platforms": ["ebay", "poshmark"],
      "added": "2025-01-15",
      "source": "chat-2025-01-15-001"
    },
    "bogner": {
      "name": "Bogner",
      "origin": "Germany", 
      "notes": "Luxury ski/sportswear. Willy Bogner era collectible. Strong European market.",
      "priceRange": { "low": 30, "high": 300 },
      "platforms": ["ebay"],
      "added": "2025-01-20",
      "source": "chat-2025-01-20-003"
    }
  },
  "platformTips": {
    "poshmark": {
      "parties": "List items 30 min before party starts for visibility boost",
      "shipping": "Flat rate works in your favor for heavy items"
    }
  },
  "stores": {
    "goodwill-downtown": {
      "restockDay": "Tuesday",
      "notes": "Best shoe section, check clearance tags on Mondays"
    }
  }
}
```

**Chat log schema:**

```javascript
// chat-logs/2025-01-21.json
{
  "conversations": [
    {
      "id": "chat-2025-01-21-001",
      "started": "2025-01-21T10:30:00Z",
      "ended": "2025-01-21T10:45:00Z",
      "location": "goodwill-downtown",  // if trip mode active
      "messages": [
        { "role": "user", "content": "Found an Iceberg jeans jacket, $8", "ts": "..." },
        { "role": "assistant", "content": "...", "ts": "..." }
      ],
      "extractedKnowledge": ["brands.iceberg"],  // references to knowledge.json updates
      "itemsLogged": ["item-2025-01-21-001"],    // references to inventory
      "tripId": "trip-2025-01-21-001"
    }
  ]
}
```

**Migration-ready design:**
- All records have unique IDs
- Timestamps in ISO 8601
- References use IDs, not nested objects
- Arrays of objects (not objects keyed by ID) for easier SQL migration

---

### 1.3 Cloudflare Worker: Claude API Proxy ✅ IMPLEMENTED

**Goal:** Enable chat functionality without exposing API key.

**Status:** Implemented in `/workers/claude-proxy/`

#### Worker Structure

| File | Purpose |
|------|---------|
| `wrangler.toml` | Worker configuration (name, origins, rate limits) |
| `package.json` | Dependencies and npm scripts |
| `src/index.js` | Main worker: CORS, rate limiting, request forwarding, streaming |
| `src/rate-limit.js` | IP-based rate limiting (20 req/min default) |
| `src/system-prompt.js` | Context-aware prompt builder with trip/inventory/knowledge injection |

#### Request Flow

1. Validate CORS origin header against `ALLOWED_ORIGINS`
2. Check rate limit by client IP (configurable via env vars)
3. Parse request body (messages array + context object)
4. Build system prompt from context (trip, inventory, knowledge)
5. Forward to Claude API with streaming enabled
6. Stream response back to client with CORS headers

#### Request Format (from client)

```javascript
{
  "messages": [
    { "role": "user", "content": "Found a Pendleton shirt for $8" }
  ],
  "context": {
    "trip": {
      "isActive": true,
      "store": "Goodwill Downtown",
      "itemCount": 3,
      "startedAt": "2025-01-21T10:30:00Z"
    },
    "inventory": {
      "recentItems": [...],
      "categoryStats": { "clothing": 45, "shoes": 12 }
    },
    "knowledge": { "pendleton": {...} }
  }
}
```

#### Response Format

Streaming SSE events from Claude API, forwarded directly to client:
```
event: content_block_delta
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Nice find!"}}
```

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

**Prerequisites:**
1. [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier)
2. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
3. [Anthropic API key](https://console.anthropic.com/)

**Steps:**
```bash
cd workers/claude-proxy
npm install

# Login to Cloudflare
wrangler login

# Set API key as secret
wrangler secret put ANTHROPIC_API_KEY

# Deploy
wrangler deploy
```

**Post-deployment:**
1. Note your worker URL: `https://thrifting-claude-proxy.<account>.workers.dev`
2. Update `ALLOWED_ORIGINS` in `wrangler.toml` with production domain
3. Redeploy: `wrangler deploy`
4. Update `WORKER_URL` in `js/chat.js` with your worker URL

#### Configuration (wrangler.toml)

```toml
[vars]
ALLOWED_ORIGINS = "https://yourdomain.github.io,http://localhost:8080"
RATE_LIMIT_REQUESTS = "20"   # Max requests per window
RATE_LIMIT_WINDOW = "60"     # Window in seconds
```

#### Security Measures

- **Origin validation**: Only requests from allowed origins are processed
- **Rate limiting**: 20 requests/minute per IP (configurable)
- **API key protection**: Stored as Cloudflare secret, never exposed to client
- **Input sanitization**: Messages limited to 20 history items, 4000 chars each
- **CORS headers**: Strict origin matching, POST only

#### Cost Controls

- Claude Sonnet model (cost-effective for chat)
- max_tokens capped at 1024
- Rate limiting prevents abuse
- Monitor via: `wrangler tail` and Cloudflare dashboard

#### Error Responses

| Status | Error | Description |
|--------|-------|-------------|
| 403 | Forbidden | Invalid origin |
| 429 | Rate limited | Too many requests |
| 400 | Invalid request | Missing/malformed body |
| 502 | Upstream error | Claude API error |
| 500 | Internal error | Worker error |

---

## Phase 2: Chat Interface & Logging

### 2.1 Chat UI Component

**Goal:** Mobile-optimized chat interface for in-store use.

**Features:**
- Persistent input bar at bottom (thumb-friendly)
- Message history with scroll
- Quick action buttons: "Start trip", "Log item", "End trip"
- Voice input option (browser speech recognition API)
- Minimal UI during active trip (focus on speed)

**Design considerations:**
- High contrast for outdoor/bright store lighting
- Large touch targets
- Connection status indicator
- Message queue indicator when offline

---

### 2.2 Natural Language Command Parsing

**Goal:** Allow logging via conversational input, not just structured forms.

**Approach:** Let Claude parse intent and extract structured data.

**Examples:**

| User input | Parsed intent | Extracted data |
|------------|---------------|----------------|
| "I'm at Value Village on 82nd" | `start_trip` | `{ store: "value-village-82nd" }` |
| "Found a Pendleton wool shirt, $6" | `log_item` | `{ brand: "Pendleton", category: "shirt", material: "wool", price: 6 }` |
| "Actually that was $8 not $6" | `update_item` | `{ price: 8 }` |
| "Heading out, nothing else here" | `end_trip` | `{}` |
| "What do I know about Coogi?" | `knowledge_query` | `{ brand: "Coogi" }` |
| "Is this worth buying?" + context | `advice_request` | Freeform response |

**Implementation:**
- Claude returns structured JSON alongside conversational response
- Client parses JSON, executes actions (create trip, add item, etc.)
- Confirmations shown in chat: "Logged: Pendleton shirt, $6"

**Response format from Claude:**

```javascript
{
  "message": "Nice find! Pendleton wool shirts typically sell for $25-45 depending on pattern. The $6 price point gives you solid margin. I've logged it to your current trip.",
  "actions": [
    {
      "type": "log_item",
      "data": {
        "brand": "Pendleton",
        "category": "tops",
        "subcategory": "shirt",
        "material": "wool",
        "purchaseCost": 6,
        "suggestedPrice": { "low": 25, "high": 45 }
      }
    }
  ],
  "knowledgeUpdate": null  // or extracted fact to store
}
```

---

### 2.3 Knowledge Extraction

**Goal:** Automatically capture valuable information from research conversations.

**Trigger conditions:**
- User asks "what do you know about [brand]?" and Claude provides research
- User confirms a fact is worth remembering
- Claude identifies high-value information during conversation

**Flow:**

1. Claude includes `knowledgeUpdate` in response when relevant
2. Client shows confirmation: "Save this to your brand database?"
3. User confirms → write to `knowledge.json`
4. Link chat log entry to knowledge entry via `source` field

**Example extraction:**

```javascript
// Claude's response includes:
{
  "knowledgeUpdate": {
    "type": "brand",
    "key": "coogi",
    "data": {
      "name": "Coogi",
      "origin": "Australia",
      "notes": "Known for colorful 3D knit sweaters. Biggie Smalls association drives collector demand. Peak era 1990s. Mercerized cotton most common, wool blends more valuable.",
      "priceRange": { "low": 40, "high": 400 },
      "platforms": ["ebay"]
    }
  }
}
```

---

## Phase 3: Platform Integration

### 3.1 eBay API Integration

**Goal:** Monitor sales, offers, and listings automatically.

**Required eBay APIs:**
- **Sell API** — access your active listings, sales history
- **Browse API** — market research (sold comps)
- **Notification API** — webhooks for sales events (optional, adds complexity)

**Setup steps:**
1. Create eBay Developer account
2. Register application, get API credentials
3. Implement OAuth flow for user authorization
4. Store refresh token securely (Cloudflare KV or encrypted in Google Drive)

**Cloudflare Worker: eBay Proxy**

```javascript
// Handles:
// - Token refresh
// - Fetching active listings
// - Fetching sales history
// - Searching sold comps (for pricing research)
```

**Polling strategy (avoid webhook complexity initially):**
- Check for new sales every 15-30 minutes
- Run via Cloudflare Cron Trigger (free tier: 10,000 requests/month)
- Cache results in `sales-cache.json`
- Trigger notification if new sale detected

**Data to capture:**
- Sale price, date, item ID
- Buyer location (anonymized)
- Best offer accepted vs. buy-it-now
- Shipping cost collected vs. actual

---

### 3.2 Poshmark Manual Entry

**Goal:** Simple flow for logging Poshmark sales.

**Approach:**
- Quick-entry form in app (item selector + sale price + date)
- Or via chat: "Sold the Escada blazer on Posh for $85"
- Store in same sales data structure as eBay

**Future option (browser extension):**
- Content script detects sale confirmation page
- Extracts sale data
- Sends to app via message passing
- More reliable than scraping, respects ToS better than automation

---

### 3.3 Event Monitoring

**Goal:** Alert user to relevant platform events.

**Posh Parties:**
- Poshmark publishes party schedule on their site
- Scrape schedule weekly (low frequency, minimal ToS concern)
- Or: manual entry of parties you care about
- Alert 30-60 min before party starts

**eBay Promotions:**
- Seller Hub shows active promotions
- Check via API during regular polling
- Alert when new promotion available

**Store to `events.json`:**

```javascript
{
  "events": [
    {
      "id": "posh-party-2025-01-21",
      "platform": "poshmark",
      "type": "party",
      "name": "Best in Sweaters",
      "start": "2025-01-21T19:00:00Z",
      "notified": false,
      "relevant": true  // based on your inventory
    }
  ]
}
```

---

## Phase 4: Notifications

### 4.1 Notification Service Selection

**Options (cost/privacy optimized):**

| Service | Cost | Privacy | Features |
|---------|------|---------|----------|
| **ntfy.sh** | Free (self-host or use public) | High (can self-host) | Push, simple API |
| **Pushover** | $5 one-time | Medium | Push, reliable |
| **Twilio SMS** | ~$0.0079/msg | Medium | SMS, reliable |
| **Web Push (native)** | Free | High | Requires service worker, less reliable on iOS |

**Recommendation:** 
- Primary: Web Push (free, no third party)
- Fallback: ntfy.sh (free, simple)
- Optional: Twilio SMS for critical alerts (sales over $X)

---

### 4.2 Notification Triggers

| Event | Channel | Timing |
|-------|---------|--------|
| New sale (eBay) | Push + optional SMS | Immediate |
| New offer (eBay) | Push | Immediate |
| Posh Party starting | Push | 30 min before |
| eBay promotion available | Push | When detected |
| Item hit X days without sale | Push | Daily digest |
| Store due for revisit (high ROI + 14+ days) | Push | Weekly digest |

---

### 4.3 Cloudflare Cron Worker

**Goal:** Scheduled tasks for polling and notifications.

**Schedule:**
- Every 15 min: Check eBay for new sales/offers
- Daily 8am: Inventory health digest (stale items)
- Weekly Sunday: Sourcing suggestions (stores to revisit)
- Hourly (day of): Posh Party reminders

**Implementation:**
- Single worker with switch on cron schedule
- Read state from Google Drive or Cloudflare KV
- Send notifications via configured channel

---

## Phase 5: Advisor Intelligence

### 5.1 System Prompt Design

**Goal:** Configure Claude as an effective sourcing advisor.

**System prompt components:**

1. **Role definition**
   - Expert resale advisor specializing in vintage and designer clothing
   - Familiar with eBay, Poshmark, collector markets

2. **Knowledge injection**
   - Relevant entries from `knowledge.json` based on conversation
   - User's pricing history and sell-through rates
   - Current inventory summary (what you already have)

3. **Behavioral instructions**
   - Provide actionable buy/pass recommendations
   - Include price estimates with reasoning
   - Flag when something is outside your expertise
   - Offer to log items when user describes finds
   - Extract knowledge when research is performed

4. **Output format**
   - Conversational response + structured actions JSON
   - Keep responses concise for mobile reading

**Context window management:**
- Don't send full inventory every message
- Send relevant subset: same brand, same category, recent similar items
- Summarize historical performance, don't send raw data

---

### 5.2 Contextual Awareness ✅ IMPLEMENTED

**Goal:** Inject relevant context based on user message content to reduce payload size while increasing relevance.

**Implementation:** `js/chat.js` → `buildContext()` and `workers/claude-proxy/src/system-prompt.js`

#### Message-Based Filtering

The `extractMentionsFromMessage()` function parses each user message to identify:
- **Brand mentions**: Matches against known brand keys (e.g., "pendleton", "st-john")
- **Category mentions**: clothing, shoes, jewelry, accessories
- **Platform intent**: Keywords like "ebay", "poshmark", "sell", "list", "price"

This filtering reduces context payload by ~40-50% (from ~3000 chars to ~1300-1800 chars).

#### Trip Mode Context

When `state.isOnTrip === true`, context includes:
- Store name and ID
- **Store performance stats** (if store is in database):
  - Hit rate (items found / visits)
  - Total visits
  - Average spend per visit
- Items logged this trip (last 3 for corrections)
- **Running spend total** (calculated from trip items)
- Trip duration

#### Inventory Context

Always includes:
- 10 most recent items (for avoiding duplicates)
- Category breakdown stats

When brands/categories are mentioned:
- **Similar items**: Up to 5 items matching mentioned brand/category
- **Historical sales**: Up to 3 sold items with ROI calculation

#### Knowledge Context

Instead of dumping all brand knowledge, context includes only:
- **Relevant brands**: Brands actually mentioned in the message
- **Platform tips**: Only if platform intent detected (e.g., user asks about selling)

#### Worker-Side Context Builders

`src/system-prompt.js` builds human-readable context strings:

```javascript
buildTripContext(trip)     // Store stats, running spend, recent items
buildInventoryContext(inv) // Similar items, historical sales with ROI
buildKnowledgeContext(kb)  // Filtered brands, conditional platform tips
```

#### Context Request Format

```javascript
{
  "context": {
    "trip": {
      "isActive": true,
      "store": "Goodwill Downtown",
      "storeStats": { "hit_rate": 0.75, "total_visits": 12, "avg_spend_per_visit": 18.50 },
      "itemCount": 3,
      "runningSpend": 42.00,
      "startedAt": "2025-01-21T10:30:00Z",
      "recentItems": [...]
    },
    "inventory": {
      "recentItems": [...],
      "categoryStats": { "clothing": 45, "shoes": 12 },
      "similarItems": [...],      // Filtered by mentioned brand/category
      "historicalSales": [...]    // With ROI calculation
    },
    "knowledge": {
      "relevantBrands": { "pendleton": {...} },  // Only mentioned brands
      "platformTips": null,       // Only if hasPlatformIntent
      "hasPlatformIntent": false
    }
  }
}
```

---

## Phase 6: Future Migration Path

### 6.1 When to Migrate

**Signals that you've outgrown JSON:**
- Load times noticeably slow (>2s for data operations)
- Search across chat logs taking too long
- Inventory exceeds ~5,000 items
- Need for complex queries (joins, aggregations)

### 6.2 Migration Targets

**Structured data (inventory, trips, sales):**
- Cloudflare D1 (SQLite at edge, generous free tier)
- PlanetScale (MySQL, free tier)
- Supabase (Postgres, free tier)

**Chat logs and knowledge (semantic search):**
- Cloudflare Vectorize (vector DB at edge)
- Pinecone (free tier available)
- Self-hosted with pgvector

**Migration strategy:**
- Abstract data access behind a service layer now
- Services have `read`, `write`, `query` methods
- Swap implementation from JSON to DB without changing app code
- Run parallel writes during transition to validate

---

## Implementation Sequence

### Phase 1: Foundation
1. ✅ PWA configuration (manifest, service worker)
2. ✅ Schema design and file structure
3. ✅ Cloudflare Worker setup (Claude proxy) — see `/workers/claude-proxy/`
4. ✅ Basic rate limiting and security

### Phase 2: Core Chat
1. ✅ Chat UI component — see `js/chat.js`, Chat tab in UI
2. ✅ Message handling and history — localStorage persistence, streaming support
3. Natural language command parsing
4. Trip logging flow (basic trip start/end implemented)
5. Item logging flow
6. Knowledge extraction and confirmation

### Phase 3: Platform Integration
1. eBay developer account setup
2. eBay OAuth implementation
3. eBay sales polling
4. Poshmark manual entry
5. Sales data unification

### Phase 4: Notifications
1. Web Push setup (service worker)
2. Notification preferences UI
3. Cron worker for polling
4. Sale notifications
5. Event reminders
6. Digest notifications

### Phase 5: Intelligence
1. ✅ System prompt refinement — trip/inventory/knowledge context builders
2. ✅ Context injection logic — message-based filtering, store stats, historical sales
3. Pricing advisor mode
4. Research mode with knowledge capture
5. Inventory-aware recommendations

### Phase 6: Polish
1. Offline support improvements
2. Performance optimization
3. Error handling and recovery
4. Usage analytics (privacy-respecting)
5. Migration preparation (service layer abstraction)

---

## Cost Summary

| Service | Expected Cost |
|---------|---------------|
| GitHub Pages | Free |
| Google Drive | Free (15GB included) |
| Cloudflare Workers | Free tier (100k req/day) |
| Cloudflare KV | Free tier (100k reads/day) |
| Cloudflare Cron | Free tier (10k invocations/month) |
| Claude API | Variable — estimate $5-20/month depending on usage |
| eBay API | Free |
| ntfy.sh | Free |
| **Total** | **~$5-20/month** (Claude API is the only real cost) |

---

## Privacy Summary

| Data | Location | Third-party exposure |
|------|----------|---------------------|
| Inventory | Google Drive (your account) | None |
| Chat logs | Google Drive (your account) | Messages sent to Claude API |
| Knowledge base | Google Drive (your account) | None |
| Sales data | Google Drive (your account) | eBay API (your account) |
| API keys | Cloudflare Workers secrets | Cloudflare (encrypted) |
| Push tokens | Browser/your control | ntfy.sh or none |

**Data sent to Claude API:**
- Chat messages
- Relevant context (inventory excerpts, knowledge entries)
- No full data exports

**Mitigation:**
- Don't include PII in item descriptions
- Strip buyer info from sales data before context injection
- Review Anthropic's data retention policies

---

## Technical Advisor Context (CLAUDE.md)

For your Claude Code sessions, create a `CLAUDE.md` in your repo root:

```markdown
# Project: Resale Sourcing Operations Platform

## Overview
Personal inventory management and sourcing advisor app for vintage/designer clothing resale.

## Tech Stack
- Frontend: Vanilla JavaScript, PWA
- Hosting: GitHub Pages
- Data: JSON files in Google Drive
- Serverless: Cloudflare Workers
- AI: Claude API (via worker proxy)

## Architecture
See `/docs/implementation-plan.md` for full architecture diagram.

## Key Files
- `/src/services/` — data access layer (Google Drive operations)
- `/src/chat/` — chat interface and Claude integration
- `/src/workers/` — Cloudflare Worker source
- `/data/schemas/` — JSON schema definitions

## Conventions
- All dates in ISO 8601
- IDs use format: `{type}-{date}-{sequence}` (e.g., `item-2025-01-21-001`)
- Prices stored in dollars as numbers, not cents
- Brand keys are lowercase, hyphenated

## Domain Knowledge
- Primary platforms: eBay (API integrated), Poshmark (manual entry)
- User is expert in vintage designer clothing, heritage brands
- Pricing research uses sold comps, not active listings
- Knowledge base stores brand research for quick in-store reference

## Current Phase
[Update as you progress through implementation plan]
```

This gives Claude Code the context it needs to make coherent contributions across sessions.
