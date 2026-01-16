// =============================================================================
// DASHBOARD ACTION ITEMS MODULE
// =============================================================================

import { getInventoryInPipeline, getAllInventory, getItemsNeedingMigration, migrateItemToSlug } from './db.js';
import { $, $$, escapeHtml, isUuidFormat } from './utils.js';
import { createModalController, showToast } from './ui.js';
import { setVisible } from './components.js';
import { loadSeasonalData, getSeasonalOpportunities } from './seasonal.js';
import { openStartSellingModal } from './inventory.js';
import { openPhotoManager } from './photos.js';
import { queueSync } from './sync.js';

// =============================================================================
// STATE
// =============================================================================

let actionItemsModal = null;
let currentActionData = {}; // Stores item arrays by action type
let currentActionType = null; // Track which action type opened the modal

// Tile configuration
const TILE_CONFIG = {
  seasonal: { label: 'Perfect time to list', countId: 'tile-count-seasonal' },
  photo: { label: 'Needs photo', countId: 'tile-count-photo' },
  ready: { label: 'Ready to list', countId: 'tile-count-ready' },
  shipping: { label: 'Needs packaging', countId: 'tile-count-shipping' },
  awaiting: { label: 'Ready to ship', countId: 'tile-count-awaiting' },
  pending: { label: 'Awaiting delivery', countId: 'tile-count-pending' },
  migrate: { label: 'Update ID', countId: 'tile-count-migrate', hideWhenEmpty: true }
};

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initDashboardActions() {
  await loadSeasonalData();
  setupTileHandlers();
  setupModalHandlers();
  await loadActionItems();
}

export async function loadActionItems() {
  const pipelineItems = await getInventoryInPipeline();
  const allItems = await getAllInventory();

  // Get seasonal opportunities from all listable items (pipeline + collection with resale intent)
  const seasonalMatches = getSeasonalOpportunities(allItems);

  // Get items that can be migrated to slug IDs
  const migrateItems = await getItemsNeedingMigration();

  // Store data for modal use
  currentActionData = {
    seasonal: seasonalMatches, // Array of {item, score, reasons}
    photo: pipelineItems.filter(i => i.status === 'needs_photo'),
    ready: pipelineItems.filter(i => i.status === 'unlisted'),
    shipping: pipelineItems.filter(i => i.status === 'sold'),
    awaiting: pipelineItems.filter(i => i.status === 'packaged'),
    pending: pipelineItems.filter(i => i.status === 'shipped'),
    migrate: migrateItems // Items with UUID IDs that can be migrated to slugs
  };

  updateTileCounts();
}

// =============================================================================
// TILE RENDERING
// =============================================================================

function updateTileCounts() {
  Object.entries(TILE_CONFIG).forEach(([actionType, config]) => {
    const tile = $(`.action-tile[data-action="${actionType}"]`);
    const countEl = $(`#${config.countId}`);
    if (!tile || !countEl) return;

    const data = currentActionData[actionType];
    const count = data?.length || 0;

    countEl.textContent = count;

    // Handle hideWhenEmpty tiles (like migrate)
    if (config.hideWhenEmpty) {
      tile.classList.toggle('hidden', count === 0);
      tile.classList.remove('action-tile--muted');
    } else {
      // Show all tiles, but mute ones with no items
      tile.classList.remove('hidden');
      tile.classList.toggle('action-tile--muted', count === 0);
    }
  });

  // Hide empty state since we always show tiles
  setVisible('#action-tiles-empty', false);
}

// =============================================================================
// TILE CLICK HANDLERS
// =============================================================================

function setupTileHandlers() {
  const tiles = $$('.action-tile');
  tiles.forEach(tile => {
    tile.addEventListener('click', () => {
      const actionType = tile.dataset.action;
      openActionItemsModal(actionType);
    });
  });
}

// =============================================================================
// MODAL
// =============================================================================

function setupModalHandlers() {
  const dialog = $('#action-items-dialog');
  if (!dialog) return;

  actionItemsModal = createModalController(dialog);

  // Handle clicks in modal list (event delegation)
  const listEl = $('#action-items-list');
  if (listEl) {
    listEl.addEventListener('click', handleModalListClick);
  }
}

function openActionItemsModal(actionType) {
  if (!actionItemsModal) return;

  const config = TILE_CONFIG[actionType];
  const data = currentActionData[actionType];

  if (!config || !data) return;

  // Track which action type opened the modal
  currentActionType = actionType;

  // Set modal title
  const titleEl = $('#action-items-title');
  if (titleEl) {
    titleEl.textContent = config.label;
  }

  // Populate list
  const listEl = $('#action-items-list');
  if (listEl) {
    if (data.length === 0) {
      listEl.innerHTML = `<p class="text-center text-muted">No items</p>`;
    } else {
      listEl.innerHTML = data.map(entry => renderModalRow(entry, actionType)).join('');
    }
  }

  actionItemsModal.open();
}

function renderModalRow(entry, actionType) {
  // Seasonal items have {item, score, reasons} structure
  // Other items are just the item object directly
  const item = actionType === 'seasonal' ? entry.item : entry;
  const reason = actionType === 'seasonal' ? (entry.reasons?.[0] || '') : '';

  return `
    <button type="button" class="action-item" data-id="${escapeHtml(item.id)}">
      <span class="action-item__title">${escapeHtml(item.title || 'Untitled')}</span>
      ${reason ? `<span class="action-item__reason">${escapeHtml(reason)}</span>` : ''}
    </button>
  `;
}

function handleModalListClick(e) {
  const actionItem = e.target.closest('.action-item');
  if (actionItem) {
    e.preventDefault();
    const itemId = actionItem.dataset.id;
    handleActionFromModal(itemId, currentActionType);
  }
}

async function handleActionFromModal(itemId, actionType) {
  // Close action items modal
  if (actionItemsModal) {
    actionItemsModal.close();
  }

  // Route based on action type
  if (actionType === 'photo') {
    // Open photo manager for items needing photos
    await openPhotoManager(itemId, {
      onComplete: async () => {
        await loadActionItems(); // Refresh counts
      }
    });
  } else if (actionType === 'migrate') {
    // Migrate item from UUID to slug ID
    await handleMigrateItem(itemId);
  } else {
    // Default: open the start selling modal
    await openStartSellingModal(itemId);
  }
}

/**
 * Handle migration of an item from UUID to slug ID.
 */
async function handleMigrateItem(itemId) {
  try {
    const updatedItem = await migrateItemToSlug(itemId);
    showToast(`ID updated to: ${updatedItem.id}`);
    queueSync(); // Trigger sync to re-upload attachments to new folder
    await loadActionItems(); // Refresh counts
  } catch (err) {
    console.error('Migration failed:', err);
    showToast(err.message || 'Failed to update ID');
  }
}
