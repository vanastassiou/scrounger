// =============================================================================
// DASHBOARD ACTION ITEMS MODULE
// =============================================================================

import { getInventoryInPipeline, getAllInventory } from './db.js';
import { $, $$, escapeHtml } from './utils.js';
import { createModalController } from './ui.js';
import { setVisible } from './components.js';
import { loadSeasonalData, getSeasonalOpportunities } from './seasonal.js';
import { openStartSellingModal } from './inventory.js';

// =============================================================================
// STATE
// =============================================================================

let actionItemsModal = null;
let currentActionData = {}; // Stores item arrays by action type

// Tile configuration
const TILE_CONFIG = {
  seasonal: { label: 'Perfect time to list', countId: 'tile-count-seasonal' },
  photo: { label: 'Needs photo', countId: 'tile-count-photo' },
  ready: { label: 'Ready to list', countId: 'tile-count-ready' },
  shipping: { label: 'Needs packaging', countId: 'tile-count-shipping' },
  awaiting: { label: 'Ready to ship', countId: 'tile-count-awaiting' }
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

  // Store data for modal use
  currentActionData = {
    seasonal: seasonalMatches, // Array of {item, score, reasons}
    photo: pipelineItems.filter(i => i.status === 'needs_photo'),
    ready: pipelineItems.filter(i => i.status === 'unlisted'),
    shipping: pipelineItems.filter(i => i.status === 'sold'),
    awaiting: pipelineItems.filter(i => i.status === 'packaged')
  };

  updateTileCounts();
}

// =============================================================================
// TILE RENDERING
// =============================================================================

function updateTileCounts() {
  let anyVisible = false;

  Object.entries(TILE_CONFIG).forEach(([actionType, config]) => {
    const tile = $(`.action-tile[data-action="${actionType}"]`);
    const countEl = $(`#${config.countId}`);
    if (!tile || !countEl) return;

    const data = currentActionData[actionType];
    const count = data?.length || 0;

    countEl.textContent = count;

    // Show/hide tile based on count
    setVisible(tile, count > 0);
    if (count > 0) anyVisible = true;
  });

  // Show/hide empty state
  setVisible('#action-tiles-empty', !anyVisible);
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

  // Handle clicks in modal table (event delegation)
  const tbody = $('#action-items-tbody');
  if (tbody) {
    tbody.addEventListener('click', handleModalTableClick);
  }
}

function openActionItemsModal(actionType) {
  if (!actionItemsModal) return;

  const config = TILE_CONFIG[actionType];
  const data = currentActionData[actionType];

  if (!config || !data) return;

  // Set modal title
  const titleEl = $('#action-items-title');
  if (titleEl) {
    titleEl.textContent = config.label;
  }

  // Populate table
  const tbody = $('#action-items-tbody');
  if (tbody) {
    if (data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="2" class="text-center text-muted">No items</td></tr>`;
    } else {
      tbody.innerHTML = data.map(entry => renderModalRow(entry, actionType)).join('');
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
    <tr data-id="${escapeHtml(item.id)}">
      <td>
        <span class="table-link">${escapeHtml(item.title || 'Untitled')}</span>
        ${reason ? `<span class="seasonal-reason">${escapeHtml(reason)}</span>` : ''}
      </td>
      <td class="table-actions" data-label="">
        <button class="btn btn--sm btn--primary sell-from-modal-btn" data-id="${escapeHtml(item.id)}">Sell</button>
      </td>
    </tr>
  `;
}

function handleModalTableClick(e) {
  const sellBtn = e.target.closest('.sell-from-modal-btn');
  if (sellBtn) {
    e.preventDefault();
    const itemId = sellBtn.dataset.id;
    handleSellFromModal(itemId);
  }
}

async function handleSellFromModal(itemId) {
  // Close action items modal
  if (actionItemsModal) {
    actionItemsModal.close();
  }

  // Open the start selling modal (from inventory.js)
  await openStartSellingModal(itemId);
}
