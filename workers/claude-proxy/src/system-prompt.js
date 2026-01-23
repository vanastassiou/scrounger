// =============================================================================
// SYSTEM PROMPT BUILDER - Context-aware prompt construction
// =============================================================================

/**
 * Sanitize user-controlled values to prevent prompt injection
 * Removes newlines and control characters that could manipulate system prompt
 * @param {string} value - User-provided value
 * @param {number} maxLength - Maximum allowed length (default 200)
 * @returns {string} Sanitized value
 */
function sanitizeContextValue(value, maxLength = 200) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Remove newlines, carriage returns, and other control characters
  // Truncate to prevent context bloat
  return str
    .replace(/[\r\n\t]/g, ' ')           // Replace newlines/tabs with space
    .replace(/\s+/g, ' ')                 // Collapse multiple spaces
    .replace(/[^\x20-\x7E]/g, '')         // Remove non-printable ASCII
    .trim()
    .slice(0, maxLength);
}

/**
 * Sanitize a numeric value
 * @param {*} value - Value to sanitize
 * @param {number} defaultVal - Default if invalid
 * @returns {number} Sanitized number
 */
function sanitizeNumber(value, defaultVal = 0) {
  const num = parseFloat(value);
  return isNaN(num) ? defaultVal : num;
}

const BASE_PERSONA = `You are a sourcing advisor for a vintage/designer clothing reseller. You help evaluate finds, provide pricing guidance, and assist with logging items during sourcing trips.

You're knowledgeable about:
- eBay (international reach, collector market, auction vs buy-it-now)
- Poshmark (social selling, US-focused, women's contemporary)
- Vintage and heritage brands (Pendleton, Escada, St. John, Coogi, etc.)
- Authentication markers and quality indicators
- Seasonal selling patterns
- Pricing strategies based on sold comps

Communication style:
- Conversational but concise (optimized for mobile)
- Helpful and encouraging without being sycophantic
- Honest about uncertainty - say when you don't know a brand
- Focus on actionable advice`;

const OUTPUT_FORMAT = `
Response format: JSON with the following structure:
{
  "message": "Your conversational response here",
  "actions": [],
  "knowledgeUpdate": null
}

IMPORTANT: Always respond with valid JSON. The "message" field is required. "actions" and "knowledgeUpdate" are optional.

ACTIONS - Structured commands for database operations:

1. start_trip - User arrives at a store
   { "type": "start_trip", "data": { "storeName": "Goodwill Downtown" } }
   Triggers: "I'm at...", "Just arrived at...", "Starting at..."

2. end_trip - User finishes shopping
   { "type": "end_trip", "data": {} }
   Triggers: "Done shopping", "Leaving now", "Finished here", "Heading out"

3. log_item - User found something to buy
   {
     "type": "log_item",
     "data": {
       "brand": "Pendleton",           // Required if mentioned
       "category": "clothing",          // clothing | shoes | jewelry | accessories
       "subcategory": "shirt",          // shirt | sweater | blazer | coat | dress | pants | skirt | boots | heels | etc.
       "material": "wool",              // wool | cashmere | silk | leather | cotton | polyester | etc.
       "colour": "blue",                // Primary color
       "purchaseCost": 12.99,           // Required - the price tag
       "suggestedPrice": { "low": 35, "high": 55 },  // Your estimated resale range
       "condition": "excellent",        // excellent | good | fair | poor
       "era": "1980s",                  // Decade if vintage
       "notes": "Made in USA label"     // Any notable details
     }
   }
   Triggers: "Found a...", "Picking up...", "Getting...", "Just got..." with price mentioned

4. update_item - Correct info about the last logged item
   { "type": "update_item", "data": { "field": "purchaseCost", "value": 15.99 } }
   { "type": "update_item", "data": { "field": "condition", "value": "good" } }
   Triggers: "Actually...", "Correction...", "That was...", "It's actually..."
   Valid fields: brand, category, subcategory, material, colour, purchaseCost, condition, era, notes

KNOWLEDGE UPDATES - Save research findings for future reference:
{
  "brand": "escada",
  "info": {
    "name": "Escada",
    "notes": "Margaretha Ley era (pre-1992) most valuable. Look for bold prints and quality silk.",
    "priceRange": { "low": 30, "high": 200 },
    "authentication": "Check interior labels, quality of silk, construction details"
  }
}
Triggers: When you share brand research or authentication tips the user should save.

GUIDELINES:
- Only include actions when the user's intent is clear
- For log_item, ALWAYS include purchaseCost if mentioned, estimate suggestedPrice based on brand/condition
- If user describes an item but doesn't say they're buying, just provide advice without log_item action
- Use update_item only when user corrects recently logged item info
- Include knowledgeUpdate when sharing valuable brand research worth saving`;


/**
 * Build the system prompt with injected context
 * @param {Object} context - Context from client
 * @returns {string} Complete system prompt
 */
export function buildSystemPrompt(context = {}) {
  const parts = [BASE_PERSONA];

  // Inject trip context if active
  if (context.trip?.isActive) {
    parts.push(buildTripContext(context.trip));
  }

  // Inject inventory context
  if (context.inventory?.recentItems?.length > 0) {
    parts.push(buildInventoryContext(context.inventory));
  }

  // Inject knowledge base
  if (context.knowledge && Object.keys(context.knowledge).length > 0) {
    parts.push(buildKnowledgeContext(context.knowledge));
  }

  // Add output format instructions
  parts.push(OUTPUT_FORMAT);

  return parts.join('\n\n---\n\n');
}

/**
 * Build trip-specific context
 * All user-provided values are sanitized to prevent prompt injection
 */
function buildTripContext(trip) {
  const duration = trip.startedAt
    ? getTimeSince(trip.startedAt)
    : 'unknown duration';

  // Sanitize all user-controlled values
  const storeName = sanitizeContextValue(trip.store, 100) || 'Unknown store';
  const itemCount = sanitizeNumber(trip.itemCount, 0);
  const runningSpend = sanitizeNumber(trip.runningSpend, 0);

  let context = `CURRENT TRIP CONTEXT:
You are helping during an active sourcing trip.
- Store: ${storeName}
- Items logged so far: ${itemCount}
- Running spend: $${runningSpend.toFixed(2)}
- Trip duration: ${duration}`;

  // Include store performance stats if available
  if (trip.storeStats) {
    const hitRate = sanitizeNumber(trip.storeStats.hit_rate, 0);
    const totalVisits = sanitizeNumber(trip.storeStats.total_visits, 0);
    const avgSpend = sanitizeNumber(trip.storeStats.avg_spend_per_visit, 0);
    context += `

Store Performance:
- Hit rate: ${(hitRate * 100).toFixed(0)}%
- Total visits: ${totalVisits}
- Avg spend/visit: $${avgSpend.toFixed(2)}`;
  }

  // Include recent items for update_item context
  if (trip.recentItems && trip.recentItems.length > 0) {
    context += '\n\nRecently logged items (for corrections):';
    for (const item of trip.recentItems.slice(0, 3)) {
      const brand = sanitizeContextValue(item.brand, 50) || 'Unknown brand';
      const category = sanitizeContextValue(item.subcategory || item.category, 50) || 'item';
      const price = item.purchaseCost ? `$${sanitizeNumber(item.purchaseCost, 0)}` : 'price unknown';
      context += `\n- ${brand} ${category} (${price})`;
    }
  }

  context += `

When the user describes items, help them evaluate whether to buy. Consider:
- Estimated resale value vs price tag
- Condition issues that affect value
- How quickly it might sell
- Whether it fits their inventory strategy

If user says "actually...", "correction...", or similar, use update_item action for the most recent item.`;

  return context;
}

/**
 * Build inventory context from recent items
 * All user-provided values are sanitized to prevent prompt injection
 */
function buildInventoryContext(inventory) {
  const items = inventory.recentItems || [];
  const stats = inventory.categoryStats || {};
  const similarItems = inventory.similarItems || [];
  const historicalSales = inventory.historicalSales || [];

  let context = 'INVENTORY CONTEXT:\n';

  // Category breakdown
  if (Object.keys(stats).length > 0) {
    context += 'Current inventory by category:\n';
    for (const [category, count] of Object.entries(stats)) {
      const safeCat = sanitizeContextValue(category, 50);
      const safeCount = sanitizeNumber(count, 0);
      context += `- ${safeCat}: ${safeCount} items\n`;
    }
    context += '\n';
  }

  // Recent items summary
  if (items.length > 0) {
    context += 'Recent items (avoid suggesting duplicates):\n';
    for (const item of items.slice(0, 5)) {
      const brand = sanitizeContextValue(item.brand, 50) || 'Unknown brand';
      const category = sanitizeContextValue(item.category?.primary || item.category, 50) || 'item';
      const status = item.status ? sanitizeContextValue(item.status, 30) : null;
      context += `- ${brand} ${category}`;
      if (status) context += ` (${status})`;
      context += '\n';
    }
  }

  // Similar items user already owns (filtered by mentioned brand/category)
  if (similarItems.length > 0) {
    context += '\nSimilar items you own:\n';
    for (const item of similarItems) {
      const brand = sanitizeContextValue(item.brand, 50) || 'Unknown';
      const category = sanitizeContextValue(item.category?.primary || item.category, 50) || 'item';
      const price = sanitizeNumber(item.purchasePrice, 0);
      context += `- ${brand} ${category}`;
      if (price > 0) context += ` ($${price})`;
      context += '\n';
    }
  }

  // Historical sales data (user's past performance with similar items)
  if (historicalSales.length > 0) {
    context += '\nYour past sales of similar items:\n';
    for (const sale of historicalSales) {
      const brand = sanitizeContextValue(sale.brand, 50) || 'Unknown';
      const purchasePrice = sanitizeNumber(sale.purchasePrice, 0);
      const soldPrice = sanitizeNumber(sale.soldPrice, 0);
      const platform = sale.soldPlatform ? sanitizeContextValue(sale.soldPlatform, 30) : null;
      const roi = purchasePrice > 0 ? ((soldPrice - purchasePrice) / purchasePrice * 100).toFixed(0) : null;
      context += `- ${brand}: $${purchasePrice} → $${soldPrice}`;
      if (roi) context += ` (${roi}% ROI)`;
      if (platform) context += ` on ${platform}`;
      context += '\n';
    }
  }

  return context;
}

/**
 * Build knowledge base context
 * Uses pre-filtered data from client (only relevant brands included)
 * All user-provided values are sanitized to prevent prompt injection
 */
function buildKnowledgeContext(knowledge) {
  // Handle new filtered structure
  const brands = knowledge.relevantBrands || knowledge;
  const hasPlatformIntent = knowledge.hasPlatformIntent || false;
  const platformTips = knowledge.platformTips || null;

  // Check if we have any relevant data to inject
  const hasBrands = typeof brands === 'object' && Object.keys(brands).length > 0;
  if (!hasBrands && !hasPlatformIntent) {
    return '';  // Nothing relevant to inject
  }

  let context = '';

  // Add relevant brand knowledge
  if (hasBrands) {
    context += 'BRAND KNOWLEDGE:\n';
    for (const [brandKey, info] of Object.entries(brands)) {
      // Skip if this is a metadata field
      if (brandKey === 'relevantBrands' || brandKey === 'hasPlatformIntent' || brandKey === 'platformTips') {
        continue;
      }
      const brandName = sanitizeContextValue(info.name || brandKey, 50);
      context += `\n${brandName}:\n`;
      if (info.notes) {
        const notes = sanitizeContextValue(info.notes, 300);
        context += `  ${notes}\n`;
      }
      if (info.priceRange) {
        const low = sanitizeNumber(info.priceRange.low, 0);
        const high = sanitizeNumber(info.priceRange.high, 0);
        context += `  Typical range: $${low}-$${high}\n`;
      }
      if (info.authentication) {
        const auth = sanitizeContextValue(info.authentication, 200);
        context += `  Auth tips: ${auth}\n`;
      }
    }
  }

  // Add platform tips if user has selling/listing intent
  if (hasPlatformIntent && platformTips && Object.keys(platformTips).length > 0) {
    context += '\nPLATFORM TIPS:\n';
    for (const [platform, tips] of Object.entries(platformTips)) {
      const safePlatform = sanitizeContextValue(platform, 30);
      if (typeof tips === 'string') {
        const safeTips = sanitizeContextValue(tips, 200);
        context += `${safePlatform}: ${safeTips}\n`;
      } else if (typeof tips === 'object') {
        context += `${safePlatform}:\n`;
        for (const [key, value] of Object.entries(tips)) {
          const safeKey = sanitizeContextValue(key, 50);
          const safeValue = sanitizeContextValue(String(value), 200);
          context += `  ${safeKey}: ${safeValue}\n`;
        }
      }
    }
  }

  return context;
}

/**
 * Calculate time since a timestamp
 */
function getTimeSince(isoString) {
  try {
    const start = new Date(isoString);
    const now = new Date();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) {
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
    }

    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hours}h ${mins}m`;
  } catch {
    return 'unknown duration';
  }
}

/**
 * Extract brand mentions from a message for knowledge lookup
 * @param {string} message - User message
 * @param {Object} knowledge - Knowledge base
 * @returns {string[]} Array of matched brand keys
 */
export function extractBrandMentions(message, knowledge = {}) {
  const lower = message.toLowerCase();
  const matches = [];

  for (const brandKey of Object.keys(knowledge)) {
    const brandName = knowledge[brandKey].name?.toLowerCase() || brandKey;
    if (lower.includes(brandKey) || lower.includes(brandName)) {
      matches.push(brandKey);
    }
  }

  return matches;
}
