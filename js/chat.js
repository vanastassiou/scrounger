// =============================================================================
// CHAT MODULE - Sourcing Advisor Interface
// =============================================================================

// =============================================================================
// STATE
// =============================================================================

let state = {
  messages: [],
  isOnTrip: false,
  tripStore: null,
  tripItemCount: 0,
  connectionStatus: 'online',
  messageQueue: []
};

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
// MESSAGE HANDLING
// =============================================================================

function handleSendMessage(e) {
  e.preventDefault();

  const input = document.getElementById('chat-input');
  const text = input.value.trim();

  if (!text) return;

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
      tripItemCount: state.tripItemCount,
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
      state.tripItemCount = data.tripItemCount || 0;
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
    state.tripItemCount = 0;
    state.connectionStatus = 'online';
    state.messageQueue = [];
  },
  generateMockResponse,
  selectRandom,
  generateId,
  escapeHtml,
  MOCK_RESPONSES,
  persistState,
  loadPersistedState,
  STORAGE_KEY
};
