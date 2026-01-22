// =============================================================================
// SYSTEM PROMPT BUILDER - Context-aware prompt construction
// =============================================================================

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
 */
function buildTripContext(trip) {
  const duration = trip.startedAt
    ? getTimeSince(trip.startedAt)
    : 'unknown duration';

  let context = `CURRENT TRIP CONTEXT:
You are helping during an active sourcing trip.
- Store: ${trip.store || 'Unknown store'}
- Items logged so far: ${trip.itemCount || 0}
- Trip duration: ${duration}`;

  // Include recent items for update_item context
  if (trip.recentItems && trip.recentItems.length > 0) {
    context += '\n\nRecently logged items (for corrections):';
    for (const item of trip.recentItems.slice(0, 3)) {
      const brand = item.brand || 'Unknown brand';
      const category = item.subcategory || item.category || 'item';
      const price = item.purchaseCost ? `$${item.purchaseCost}` : 'price unknown';
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
 */
function buildInventoryContext(inventory) {
  const items = inventory.recentItems || [];
  const stats = inventory.categoryStats || {};

  let context = 'INVENTORY CONTEXT:\n';

  // Category breakdown
  if (Object.keys(stats).length > 0) {
    context += 'Current inventory by category:\n';
    for (const [category, count] of Object.entries(stats)) {
      context += `- ${category}: ${count} items\n`;
    }
    context += '\n';
  }

  // Recent items summary
  if (items.length > 0) {
    context += 'Recent items (avoid suggesting duplicates):\n';
    for (const item of items.slice(0, 5)) {
      const brand = item.brand || 'Unknown brand';
      const category = item.category || 'item';
      context += `- ${brand} ${category}`;
      if (item.status) context += ` (${item.status})`;
      context += '\n';
    }
  }

  return context;
}

/**
 * Build knowledge base context
 */
function buildKnowledgeContext(knowledge) {
  const brands = Object.keys(knowledge);
  if (brands.length === 0) return '';

  let context = 'KNOWLEDGE BASE (reference for brand info):\n';

  for (const [brandKey, info] of Object.entries(knowledge)) {
    context += `\n${info.name || brandKey}:\n`;
    if (info.notes) context += `  Notes: ${info.notes}\n`;
    if (info.priceRange) {
      context += `  Typical range: $${info.priceRange.low}-$${info.priceRange.high}\n`;
    }
    if (info.authentication) {
      context += `  Auth tips: ${info.authentication}\n`;
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
