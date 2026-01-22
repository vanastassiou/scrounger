// =============================================================================
// CHAT MODULE - Sourcing Advisor Interface
// =============================================================================

import {
  getAllInventory,
  getInventoryStats,
  getAllTrips,
  getKnowledge,
  createTrip,
  updateTrip,
  createInventoryItem,
  updateInventoryItem,
  getAllUserStores,
  upsertBrandKnowledge
} from './db.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Worker URL - update after deploying to Cloudflare
// Set to null to use mock responses only
const WORKER_URL = null; // e.g., 'https://thrifting-claude-proxy.<account>.workers.dev'

// =============================================================================
// STATE
// =============================================================================

let state = {
  messages: [],
  isOnTrip: false,
  tripStore: null,
  tripStoreId: null,         // Store ID for db linkage
  currentTripId: null,       // Trip record ID in database
  tripItemCount: 0,
  tripItems: [],             // Items logged this trip (for update_item context)
  lastLoggedItemId: null,    // Most recent item ID for corrections
  tripStartedAt: null,
  connectionStatus: 'online',
  messageQueue: [],
  isRecording: false,
  isStreaming: false,
  pendingKnowledgeUpdate: null  // Knowledge awaiting user confirmation
};

// Speech recognition instance (set up if supported)
let speechRecognition = null;

// =============================================================================
// MOCK RESPONSES
// =============================================================================

const MOCK_RESPONSES = {
  greeting: [
    "Ready to source! What did you find?",
    "Hey! What treasures are you hunting today?",
    "Let's find some gems! What are you looking at?"
  ],

  brand_query: {
    pendleton: "Pendleton is always a solid find! Look for 'Made in USA' labels - those command premium prices. Wool blanket shirts from the 70s-90s are especially sought after. Price range: $30-80 depending on pattern and condition.",
    escada: "Escada! Look for Margaretha Ley era pieces (pre-1992) - they're the most valuable. Check for quality silk, interesting prints, and structured blazers. Heritage pieces can fetch $50-200+.",
    coogi: "Coogi sweaters have strong collector demand! The 3D knit patterns from Australia are iconic. Look for the 'Made in Australia' label - knockoffs are common. Authentic pieces: $100-400 depending on pattern complexity.",
    "st john": "St. John knits are a great find! Look for the 'St. John Knits' label (not St. John's Bay - that's JCPenney). Santana knit pieces are most valuable. Check for moth damage. Range: $40-150.",
    burberry: "Burberry is solid! Vintage trench coats with the classic nova check lining are always in demand. Look for 'Burberrys' (with an S) for vintage pieces. Watch for fakes - check stitching quality.",
    default: "I'm not super familiar with that brand yet. What details can you tell me about the piece? The label info, materials, and country of origin would help me give you better guidance."
  },

  trip_start: "Got it, you're at {store}! Just describe items as you find them and I'll help you decide what's worth grabbing.",

  trip_end: "Trip complete! You logged {count} item(s). Nice sourcing session!",

  item_found: [
    "Interesting find! What's the price tag say?",
    "Oh nice! What condition is it in?",
    "Good eye! Does it have any flaws?",
    "Worth considering! What size is it?"
  ],

  generic: [
    "Interesting! Can you tell me more about it?",
    "What's the price tag on that one?",
    "What condition would you say it's in?",
    "Any visible flaws or damage?",
    "Does it have the original tags?"
  ],

  pricing_tips: [
    "For vintage pieces, always check sold listings on eBay, not active ones.",
    "Poshmark tends to favor women's contemporary brands. eBay is better for vintage.",
    "Consider the season - list winter coats in fall, swimwear in spring.",
    "Heritage brands often do better on eBay where collectors shop."
  ]
};

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initChat() {
  loadPersistedState();
  setupEventHandlers();
  setupOnlineOfflineHandlers();
  setupSpeechRecognition();
  renderMessages();
  updateUIState();
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

function setupEventHandlers() {
  // Form submission
  const form = document.getElementById('chat-form');
  form?.addEventListener('submit', handleSendMessage);

  // Quick action buttons
  document.getElementById('btn-start-trip')?.addEventListener('click', handleStartTrip);
  document.getElementById('btn-log-item')?.addEventListener('click', handleLogItem);
  document.getElementById('btn-end-trip')?.addEventListener('click', handleEndTrip);
}

function setupOnlineOfflineHandlers() {
  window.addEventListener('online', () => {
    setConnectionStatus('online');
    processMessageQueue();
  });

  window.addEventListener('offline', () => {
    setConnectionStatus('offline');
  });

  // Set initial status
  setConnectionStatus(navigator.onLine ? 'online' : 'offline');
}

// =============================================================================
// SPEECH RECOGNITION
// =============================================================================

function setupSpeechRecognition() {
  // Check for browser support
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    // Browser doesn't support speech recognition - button stays hidden
    return;
  }

  // Show the mic button since speech is supported
  const micBtn = document.getElementById('chat-mic');
  if (micBtn) {
    micBtn.hidden = false;
    micBtn.addEventListener('click', handleMicClick);
  }

  // Create speech recognition instance
  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = false; // Single utterance mode
  speechRecognition.interimResults = false; // Only final results
  speechRecognition.lang = 'en-US';

  // Handle successful transcription
  speechRecognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const input = document.getElementById('chat-input');
    if (input) {
      // Append to existing text with space if needed
      const existing = input.value.trim();
      input.value = existing ? `${existing} ${transcript}` : transcript;
      input.focus();
    }
  };

  // Handle end of recording
  speechRecognition.onend = () => {
    state.isRecording = false;
    updateMicButtonState();
  };

  // Handle errors
  speechRecognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    state.isRecording = false;
    updateMicButtonState();

    // Show user-friendly message for common errors
    if (event.error === 'not-allowed') {
      addMessage({
        id: generateId(),
        role: 'system',
        content: 'Microphone access denied. Please allow microphone access to use voice input.',
        timestamp: Date.now()
      });
    }
  };
}

function handleMicClick() {
  if (!speechRecognition) return;

  if (state.isRecording) {
    // Stop recording
    speechRecognition.stop();
    state.isRecording = false;
  } else {
    // Start recording
    try {
      speechRecognition.start();
      state.isRecording = true;
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
      state.isRecording = false;
    }
  }

  updateMicButtonState();
}

function updateMicButtonState() {
  const micBtn = document.getElementById('chat-mic');
  if (micBtn) {
    micBtn.classList.toggle('recording', state.isRecording);
    micBtn.setAttribute('aria-label', state.isRecording ? 'Stop recording' : 'Voice input');
  }
}

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

async function handleSendMessage(e) {
  e.preventDefault();

  const input = document.getElementById('chat-input');
  const text = input.value.trim();

  if (!text) return;

  // Prevent sending while streaming
  if (state.isStreaming) return;

  // Clear input
  input.value = '';

  // If offline, queue the message
  if (state.connectionStatus === 'offline') {
    queueMessage(text);
    return;
  }

  // Add user message
  addMessage({
    id: generateId(),
    role: 'user',
    content: text,
    timestamp: Date.now()
  });

  // Try to use the Claude API proxy, fall back to mock responses
  if (WORKER_URL) {
    await sendToAdvisor(text);
  } else {
    // Generate mock response after delay
    showTypingIndicator();
    const delay = 800 + Math.random() * 700; // 800-1500ms

    setTimeout(() => {
      hideTypingIndicator();
      const response = generateMockResponse(text);
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      });
    }, delay);
  }
}

function addMessage(msg) {
  state.messages.push(msg);

  // Keep only last 50 messages
  if (state.messages.length > 50) {
    state.messages = state.messages.slice(-50);
  }

  // Hide welcome message if it's showing
  const welcome = document.getElementById('chat-welcome');
  if (welcome) {
    welcome.hidden = true;
  }

  renderMessage(msg);
  scrollToBottom();
  persistState();
}

function renderMessage(msg) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const msgEl = document.createElement('div');
  msgEl.className = `chat-message chat-message--${msg.role}`;
  msgEl.dataset.id = msg.id;

  const time = new Date(msg.timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });

  msgEl.innerHTML = `
    <div class="chat-bubble">${escapeHtml(msg.content)}</div>
    <span class="chat-time">${time}</span>
  `;

  container.appendChild(msgEl);
}

function renderMessages() {
  const container = document.getElementById('chat-messages');
  const welcome = document.getElementById('chat-welcome');

  if (!container) return;

  // Clear existing messages except welcome
  const existingMessages = container.querySelectorAll('.chat-message');
  existingMessages.forEach(el => el.remove());

  // Show/hide welcome based on message count
  if (welcome) {
    welcome.hidden = state.messages.length > 0;
  }

  // Render all messages
  state.messages.forEach(msg => renderMessage(msg));
  scrollToBottom();
}

function scrollToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// =============================================================================
// MOCK RESPONSE GENERATION
// =============================================================================

function generateMockResponse(text) {
  const lower = text.toLowerCase();

  // Check for brand queries
  for (const [brand, response] of Object.entries(MOCK_RESPONSES.brand_query)) {
    if (brand !== 'default' && lower.includes(brand)) {
      return response;
    }
  }

  // Check for greetings
  if (/^(hi|hello|hey|sup|what's up)/i.test(text)) {
    return selectRandom(MOCK_RESPONSES.greeting);
  }

  // Check for pricing questions
  if (/price|worth|value|sell|list/i.test(lower)) {
    return selectRandom(MOCK_RESPONSES.pricing_tips);
  }

  // Check for item descriptions (on trip)
  if (state.isOnTrip && /found|see|looking|here('s| is)/i.test(lower)) {
    return selectRandom(MOCK_RESPONSES.item_found);
  }

  // Default response
  return selectRandom(MOCK_RESPONSES.generic);
}

function selectRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// =============================================================================
// CLAUDE API INTEGRATION
// =============================================================================

/**
 * Send message to Claude API proxy and handle streaming response
 * @param {string} userMessage - The user's message
 */
async function sendToAdvisor(userMessage) {
  state.isStreaming = true;
  showTypingIndicator();

  try {
    const context = await buildContext();

    // Build messages for API (last 10 messages for context)
    const apiMessages = state.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: apiMessages,
        context
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    // Create a message element for streaming
    hideTypingIndicator();
    const msgId = generateId();
    const streamMsg = {
      id: msgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now()
    };
    addStreamingMessage(streamMsg);

    // Read streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.delta?.text) {
              fullText += parsed.delta.text;
              updateStreamingMessage(msgId, fullText);
            } else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              fullText += parsed.delta.text;
              updateStreamingMessage(msgId, fullText);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }
    }

    // Finalize the message
    finalizeStreamingMessage(msgId, fullText);

    // Try to parse JSON response for actions
    tryParseAdvisorResponse(fullText);

  } catch (error) {
    console.error('Advisor error:', error);
    hideTypingIndicator();

    // Fall back to mock response
    const response = generateMockResponse(userMessage);
    addMessage({
      id: generateId(),
      role: 'assistant',
      content: response,
      timestamp: Date.now()
    });
  } finally {
    state.isStreaming = false;
  }
}

/**
 * Build context object for the API
 */
async function buildContext() {
  try {
    const [allInventory, inventoryStats, allTrips, knowledge] = await Promise.all([
      getAllInventory().catch(() => []),
      getInventoryStats().catch(() => ({ byCategory: {} })),
      getAllTrips().catch(() => []),
      getKnowledge().catch(() => null)
    ]);

    // Get 10 most recent items (sorted by created date)
    const recentItems = allInventory
      .sort((a, b) => new Date(b.metadata?.created || 0) - new Date(a.metadata?.created || 0))
      .slice(0, 10);

    // Find current active trip (most recent trip from today that's not ended)
    const today = new Date().toISOString().split('T')[0];
    const currentTrip = allTrips.find(t =>
      t.date === today && !t.endedAt
    );

    return {
      trip: state.isOnTrip ? {
        isActive: true,
        store: state.tripStore,
        itemCount: state.tripItemCount,
        startedAt: state.tripStartedAt,
        recentItems: state.tripItems.slice(-3)  // Last 3 items for update_item context
      } : (currentTrip ? {
        isActive: true,
        store: currentTrip.stores?.[0]?.storeName || 'Unknown',
        itemCount: 0,
        startedAt: currentTrip.startedAt,
        recentItems: []
      } : null),
      inventory: {
        recentItems: recentItems.map(sanitizeItemForContext),
        categoryStats: inventoryStats.byCategory || {}
      },
      knowledge: knowledge?.brands || {}
    };
  } catch (error) {
    console.warn('Failed to build context:', error);
    return {};
  }
}

/**
 * Sanitize an inventory item for sending to the API
 */
function sanitizeItemForContext(item) {
  return {
    brand: item.brand,
    category: item.category,
    status: item.status,
    purchasePrice: item.purchasePrice,
    listedPrice: item.listedPrice
  };
}

/**
 * Try to parse advisor response for structured actions
 */
function tryParseAdvisorResponse(text) {
  try {
    // Try to parse as JSON (advisor may return structured response)
    const parsed = JSON.parse(text);
    if (parsed.actions && Array.isArray(parsed.actions)) {
      for (const action of parsed.actions) {
        handleAdvisorAction(action);
      }
    }
    if (parsed.knowledgeUpdate) {
      handleKnowledgeUpdate(parsed.knowledgeUpdate);
    }
  } catch {
    // Not JSON, that's fine - just plain text response
  }
}

/**
 * Handle an action suggested by the advisor
 */
async function handleAdvisorAction(action) {
  const handlers = {
    start_trip: handleStartTripAction,
    end_trip: handleEndTripAction,
    log_item: handleLogItemAction,
    update_item: handleUpdateItemAction
  };

  const handler = handlers[action.type];
  if (!handler) {
    console.warn('Unknown action type:', action.type);
    return { success: false, message: `Unknown action: ${action.type}` };
  }

  try {
    const result = await handler(action.data || {});
    if (result.success && result.message) {
      addSystemConfirmation(result.message);
    } else if (!result.success) {
      addSystemConfirmation(result.message || `Could not ${action.type}`);
    }
    return result;
  } catch (err) {
    console.error(`Action ${action.type} failed:`, err);
    addSystemConfirmation(`Could not ${action.type}: ${err.message}`);
    return { success: false, message: err.message };
  }
}

/**
 * Add a system confirmation message to the chat
 */
function addSystemConfirmation(content) {
  addMessage({
    id: generateId(),
    role: 'system',
    content,
    timestamp: Date.now()
  });
}

/**
 * Handle start_trip action
 */
async function handleStartTripAction(data) {
  const storeName = data.storeName;
  if (!storeName) {
    return { success: false, message: 'No store name provided' };
  }

  // Try to match store by name
  const stores = await getAllUserStores();
  const matchedStore = findStoreByName(stores, storeName);

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 5);

  // Create trip record in database
  const tripData = {
    date: dateStr,
    stores: [{
      storeId: matchedStore?.id || null,
      storeName: matchedStore?.name || storeName,
      arrived: timeStr
    }],
    startedAt: now.toISOString()
  };

  const trip = await createTrip(tripData);

  // Update local state
  state.isOnTrip = true;
  state.tripStore = matchedStore?.name || storeName;
  state.tripStoreId = matchedStore?.id || null;
  state.currentTripId = trip.id;
  state.tripItemCount = 0;
  state.tripItems = [];
  state.tripStartedAt = now.toISOString();

  updateUIState();
  persistState();

  return { success: true, message: `Trip started at ${state.tripStore}` };
}

/**
 * Handle end_trip action
 */
async function handleEndTripAction() {
  if (!state.isOnTrip) {
    return { success: false, message: 'No active trip to end' };
  }

  const storeName = state.tripStore;
  const itemCount = state.tripItemCount;

  // Update trip record with end time
  if (state.currentTripId) {
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);

    await updateTrip(state.currentTripId, {
      endedAt: now.toISOString(),
      stores: [{
        storeId: state.tripStoreId,
        storeName: state.tripStore,
        departed: timeStr
      }]
    });
  }

  // Reset trip state
  state.isOnTrip = false;
  state.tripStore = null;
  state.tripStoreId = null;
  state.currentTripId = null;
  state.tripItemCount = 0;
  state.tripItems = [];
  state.tripStartedAt = null;

  updateUIState();
  persistState();

  return {
    success: true,
    message: `Trip ended. ${itemCount} item(s) logged at ${storeName}.`
  };
}

/**
 * Handle log_item action
 */
async function handleLogItemAction(data) {
  if (!data.category && !data.purchaseCost) {
    return { success: false, message: 'Insufficient item data' };
  }

  // Map flat action data to nested inventory schema
  const itemData = mapActionToInventoryItem(data);

  // Link to current trip if active
  if (state.currentTripId) {
    itemData.metadata.acquisition.trip_id = state.currentTripId;
  }
  if (state.tripStoreId) {
    itemData.metadata.acquisition.store_id = state.tripStoreId;
  }

  const item = await createInventoryItem(itemData);

  // Track for update_item context
  state.tripItemCount++;
  state.lastLoggedItemId = item.id;
  state.tripItems.push({
    id: item.id,
    brand: data.brand,
    category: data.category,
    subcategory: data.subcategory,
    purchaseCost: data.purchaseCost
  });

  persistState();

  const brandLabel = data.brand || '';
  const typeLabel = data.subcategory || data.category || 'item';
  const priceLabel = data.purchaseCost ? `$${data.purchaseCost}` : '';

  return {
    success: true,
    message: `Logged: ${brandLabel} ${typeLabel}${priceLabel ? ' - ' + priceLabel : ''}`
  };
}

/**
 * Handle update_item action
 */
async function handleUpdateItemAction(data) {
  if (!state.lastLoggedItemId) {
    return { success: false, message: 'No recent item to update' };
  }

  const { field, value } = data;
  if (!field || value === undefined) {
    return { success: false, message: 'Missing field or value' };
  }

  // Map flat field to nested update
  const updates = buildNestedUpdate(field, value);
  if (!updates) {
    return { success: false, message: `Unknown field: ${field}` };
  }

  await updateInventoryItem(state.lastLoggedItemId, updates);

  // Update local tracking
  const tripItem = state.tripItems.find(i => i.id === state.lastLoggedItemId);
  if (tripItem && field in tripItem) {
    tripItem[field] = value;
  }

  persistState();

  return { success: true, message: `Updated ${field} to ${value}` };
}

/**
 * Map action data (flat) to nested inventory item schema
 */
function mapActionToInventoryItem(data) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  return {
    brand: data.brand || null,
    category: {
      primary: data.category || 'clothing',
      secondary: data.subcategory || null
    },
    colour: {
      primary: data.colour || null,
      secondary: null
    },
    material: {
      primary: data.material || null,
      secondary: null
    },
    era: data.era || null,
    notes: data.notes || null,
    condition: {
      overall_condition: data.condition || null,
      flaws: null,
      repairs_completed: null,
      repairs_needed: null,
      condition_notes: null
    },
    pricing: {
      estimated_resale_value: data.suggestedPrice?.high || null,
      minimum_acceptable_price: data.suggestedPrice?.low || null,
      brand_premium_multiplier: null
    },
    metadata: {
      acquisition: {
        date: dateStr,
        price: data.purchaseCost || null,
        store_id: null,
        trip_id: null,
        packaging: null
      },
      status: 'in_collection',
      sync: { unsynced: true, synced_at: null }
    },
    source: 'chat'
  };
}

/**
 * Build nested update object from flat field name
 */
function buildNestedUpdate(field, value) {
  const fieldMap = {
    brand: { brand: value },
    category: { category: { primary: value } },
    subcategory: { category: { secondary: value } },
    material: { material: { primary: value } },
    colour: { colour: { primary: value } },
    purchaseCost: { metadata: { acquisition: { price: value } } },
    condition: { condition: { overall_condition: value } },
    era: { era: value },
    notes: { notes: value }
  };

  return fieldMap[field] || null;
}

/**
 * Find a store by name (case-insensitive, partial match)
 */
function findStoreByName(stores, name) {
  const lower = name.toLowerCase();

  // Try exact match first
  let match = stores.find(s => s.name?.toLowerCase() === lower);
  if (match) return match;

  // Try partial match
  match = stores.find(s => s.name?.toLowerCase().includes(lower));
  if (match) return match;

  // Try if input contains store name
  match = stores.find(s => lower.includes(s.name?.toLowerCase()));
  return match || null;
}

/**
 * Handle a knowledge update from the advisor
 */
function handleKnowledgeUpdate(update) {
  if (!update || !update.brand) return;

  state.pendingKnowledgeUpdate = update;
  showKnowledgeSavePrompt(update);
  persistState();
}

/**
 * Show knowledge save confirmation prompt in chat
 */
function showKnowledgeSavePrompt(update) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  // Remove any existing prompt
  const existing = container.querySelector('.chat-knowledge-prompt');
  if (existing) existing.remove();

  const promptEl = document.createElement('div');
  promptEl.className = 'chat-message chat-message--system chat-knowledge-prompt';

  const brandName = update.info?.name || update.brand;
  const notes = update.info?.notes || '';
  const priceRange = update.info?.priceRange
    ? `$${update.info.priceRange.low}-$${update.info.priceRange.high}`
    : '';

  promptEl.innerHTML = `
    <div class="chat-bubble knowledge-prompt-content">
      <div class="knowledge-prompt-header">Save this brand info?</div>
      <div class="knowledge-prompt-brand">${escapeHtml(brandName)}</div>
      ${notes ? `<div class="knowledge-prompt-notes">${escapeHtml(notes)}</div>` : ''}
      ${priceRange ? `<div class="knowledge-prompt-price">Price range: ${priceRange}</div>` : ''}
      <div class="knowledge-prompt-actions">
        <button class="btn btn--sm btn--outline" data-action="dismiss">Dismiss</button>
        <button class="btn btn--sm btn--primary" data-action="save">Save to Knowledge</button>
      </div>
    </div>
  `;

  // Event handlers
  promptEl.querySelector('[data-action="save"]')?.addEventListener('click', async () => {
    await saveKnowledgeUpdate();
    promptEl.remove();
  });

  promptEl.querySelector('[data-action="dismiss"]')?.addEventListener('click', () => {
    state.pendingKnowledgeUpdate = null;
    persistState();
    promptEl.remove();
  });

  container.appendChild(promptEl);
  scrollToBottom();
}

/**
 * Save the pending knowledge update to the database
 */
async function saveKnowledgeUpdate() {
  const update = state.pendingKnowledgeUpdate;
  if (!update) return;

  const brandKey = update.brand.toLowerCase().replace(/\s+/g, '-');

  try {
    await upsertBrandKnowledge(brandKey, update.info || {});
    addSystemConfirmation(`Saved ${update.info?.name || update.brand} to knowledge base`);
  } catch (err) {
    console.error('Failed to save knowledge:', err);
    addSystemConfirmation(`Failed to save knowledge: ${err.message}`);
  }

  state.pendingKnowledgeUpdate = null;
  persistState();
}

/**
 * Add a message element for streaming (content will be updated)
 */
function addStreamingMessage(msg) {
  state.messages.push(msg);

  const welcome = document.getElementById('chat-welcome');
  if (welcome) welcome.hidden = true;

  const container = document.getElementById('chat-messages');
  if (!container) return;

  const msgEl = document.createElement('div');
  msgEl.className = 'chat-message chat-message--assistant chat-message--streaming';
  msgEl.dataset.id = msg.id;

  const time = new Date(msg.timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });

  msgEl.innerHTML = `
    <div class="chat-bubble"></div>
    <span class="chat-time">${time}</span>
  `;

  container.appendChild(msgEl);
  scrollToBottom();
}

/**
 * Update a streaming message's content
 */
function updateStreamingMessage(msgId, text) {
  const msgEl = document.querySelector(`.chat-message[data-id="${msgId}"]`);
  const bubble = msgEl?.querySelector('.chat-bubble');
  if (bubble) {
    // Try to extract just the message if it's JSON
    let displayText = text;
    try {
      const parsed = JSON.parse(text);
      if (parsed.message) displayText = parsed.message;
    } catch {
      // Not valid JSON yet, show as-is
    }
    bubble.textContent = displayText;
    scrollToBottom();
  }
}

/**
 * Finalize a streaming message
 */
function finalizeStreamingMessage(msgId, finalText) {
  const msgEl = document.querySelector(`.chat-message[data-id="${msgId}"]`);
  if (msgEl) {
    msgEl.classList.remove('chat-message--streaming');
  }

  // Update state with final content
  const msg = state.messages.find(m => m.id === msgId);
  if (msg) {
    // Try to extract message from JSON response
    let displayText = finalText;
    try {
      const parsed = JSON.parse(finalText);
      if (parsed.message) displayText = parsed.message;
    } catch {
      // Not JSON, use as-is
    }
    msg.content = displayText;
    persistState();
  }
}

// =============================================================================
// TYPING INDICATOR
// =============================================================================

function showTypingIndicator() {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  // Don't add if already showing
  if (container.querySelector('.chat-typing')) return;

  const typingEl = document.createElement('div');
  typingEl.className = 'chat-message chat-message--assistant';
  typingEl.innerHTML = `
    <div class="chat-typing">
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
      <span class="typing-dot"></span>
    </div>
  `;

  container.appendChild(typingEl);
  scrollToBottom();
}

function hideTypingIndicator() {
  const container = document.getElementById('chat-messages');
  const typing = container?.querySelector('.chat-typing');
  if (typing) {
    typing.closest('.chat-message').remove();
  }
}

// =============================================================================
// TRIP MANAGEMENT
// =============================================================================

async function handleStartTrip() {
  const store = prompt('Which store are you at?');
  if (!store) return;

  state.isOnTrip = true;
  state.tripStore = store;
  state.tripItemCount = 0;
  state.tripStartedAt = new Date().toISOString();

  // Add system message
  addMessage({
    id: generateId(),
    role: 'system',
    content: MOCK_RESPONSES.trip_start.replace('{store}', store),
    timestamp: Date.now()
  });

  updateUIState();
  persistState();
}

function handleLogItem() {
  if (!state.isOnTrip) {
    // If not on trip, prompt to start one
    handleStartTrip();
    return;
  }

  state.tripItemCount++;

  // Add system message
  addMessage({
    id: generateId(),
    role: 'system',
    content: `Item #${state.tripItemCount} logged. Describe what you found!`,
    timestamp: Date.now()
  });

  // Focus input
  document.getElementById('chat-input')?.focus();
}

function handleEndTrip() {
  if (!state.isOnTrip) return;

  const count = state.tripItemCount;

  // Add system message
  addMessage({
    id: generateId(),
    role: 'system',
    content: MOCK_RESPONSES.trip_end.replace('{count}', count.toString()),
    timestamp: Date.now()
  });

  // Reset trip state
  state.isOnTrip = false;
  state.tripStore = null;
  state.tripItemCount = 0;
  state.tripStartedAt = null;

  updateUIState();
  persistState();
}

// =============================================================================
// UI STATE
// =============================================================================

function updateUIState() {
  // Trip badge
  const tripBadge = document.getElementById('chat-trip-badge');
  const tripStore = document.getElementById('chat-trip-store');
  if (tripBadge && tripStore) {
    tripBadge.hidden = !state.isOnTrip;
    tripStore.textContent = state.tripStore || '';
  }

  // Quick action buttons
  const startBtn = document.getElementById('btn-start-trip');
  const endBtn = document.getElementById('btn-end-trip');
  if (startBtn && endBtn) {
    startBtn.hidden = state.isOnTrip;
    endBtn.hidden = !state.isOnTrip;
  }

  // Queue indicator
  const queueEl = document.getElementById('chat-queue');
  const queueCount = document.getElementById('chat-queue-count');
  if (queueEl && queueCount) {
    queueEl.hidden = state.messageQueue.length === 0;
    queueCount.textContent = state.messageQueue.length.toString();
  }
}

function setConnectionStatus(status) {
  state.connectionStatus = status;

  const connectionEl = document.getElementById('chat-connection');
  const dot = connectionEl?.querySelector('.connection-dot');
  const text = connectionEl?.querySelector('.connection-text');

  if (dot && text) {
    if (status === 'online') {
      dot.classList.remove('offline');
      text.textContent = 'Connected';
    } else {
      dot.classList.add('offline');
      text.textContent = 'Offline';
    }
  }

  updateUIState();
}

// =============================================================================
// MESSAGE QUEUE (OFFLINE)
// =============================================================================

function queueMessage(text) {
  state.messageQueue.push({
    id: generateId(),
    content: text,
    timestamp: Date.now()
  });

  // Add user message (marked as queued)
  addMessage({
    id: generateId(),
    role: 'user',
    content: text,
    timestamp: Date.now()
  });

  updateUIState();
  persistState();
}

function processMessageQueue() {
  if (state.messageQueue.length === 0) return;

  // Process each queued message
  for (const queued of state.messageQueue) {
    // Generate response for each queued message
    showTypingIndicator();
    setTimeout(() => {
      hideTypingIndicator();
      const response = generateMockResponse(queued.content);
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      });
    }, 500 + Math.random() * 500);
  }

  // Clear queue
  state.messageQueue = [];
  updateUIState();
  persistState();
}

// =============================================================================
// PERSISTENCE
// =============================================================================

const STORAGE_KEY = 'chatState';

function persistState() {
  try {
    const data = {
      messages: state.messages.slice(-50), // Keep last 50
      isOnTrip: state.isOnTrip,
      tripStore: state.tripStore,
      tripStoreId: state.tripStoreId,
      currentTripId: state.currentTripId,
      tripItemCount: state.tripItemCount,
      tripItems: state.tripItems.slice(-10), // Keep last 10 items
      lastLoggedItemId: state.lastLoggedItemId,
      tripStartedAt: state.tripStartedAt,
      messageQueue: state.messageQueue
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to persist chat state:', e);
  }
}

function loadPersistedState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      state.messages = data.messages || [];
      state.isOnTrip = data.isOnTrip || false;
      state.tripStore = data.tripStore || null;
      state.tripStoreId = data.tripStoreId || null;
      state.currentTripId = data.currentTripId || null;
      state.tripItemCount = data.tripItemCount || 0;
      state.tripItems = data.tripItems || [];
      state.lastLoggedItemId = data.lastLoggedItemId || null;
      state.tripStartedAt = data.tripStartedAt || null;
      state.messageQueue = data.messageQueue || [];
    }
  } catch (e) {
    console.warn('Failed to load chat state:', e);
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

function generateId() {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// =============================================================================
// TEST EXPORTS
// =============================================================================

// Export internal functions for testing
export const _test = {
  getState: () => ({ ...state }),
  setState: (newState) => { Object.assign(state, newState); },
  resetState: () => {
    state.messages = [];
    state.isOnTrip = false;
    state.tripStore = null;
    state.tripStoreId = null;
    state.currentTripId = null;
    state.tripItemCount = 0;
    state.tripItems = [];
    state.lastLoggedItemId = null;
    state.tripStartedAt = null;
    state.connectionStatus = 'online';
    state.messageQueue = [];
    state.isRecording = false;
    state.isStreaming = false;
    state.pendingKnowledgeUpdate = null;
  },
  generateMockResponse,
  selectRandom,
  generateId,
  escapeHtml,
  MOCK_RESPONSES,
  persistState,
  loadPersistedState,
  STORAGE_KEY,
  WORKER_URL,
  // Speech recognition helpers
  isSpeechSupported: () => !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  getSpeechRecognition: () => speechRecognition,
  // API integration helpers
  buildContext,
  sanitizeItemForContext,
  // Action handlers for testing
  handleAdvisorAction,
  handleStartTripAction,
  handleEndTripAction,
  handleLogItemAction,
  handleUpdateItemAction,
  handleKnowledgeUpdate,
  // Helper functions for testing
  mapActionToInventoryItem,
  buildNestedUpdate,
  findStoreByName
};
