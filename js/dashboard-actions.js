// =============================================================================
// DASHBOARD ACTION ITEMS MODULE
// =============================================================================

import { getInventoryInPipeline } from './db.js';
import { $, $$ } from './utils.js';
import { setVisible } from './components.js';

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initDashboardActions() {
  await loadActionItems();
}

export async function loadActionItems() {
  const items = await getInventoryInPipeline();

  const actionGroups = {
    needsPhoto: items.filter(i => i.status === 'unlisted'),
    readyToList: items.filter(i => i.status === 'photographed'),
    needsShipping: items.filter(i => i.status === 'packaged'),
    awaitingConfirmation: items.filter(i => i.status === 'shipped'),
    confirmSale: items.filter(i => i.status === 'confirmed_received')
  };

  renderActionItems(actionGroups);
}

function renderActionItems(groups) {
  // Update badges
  updateBadge('photo', groups.needsPhoto.length);
  updateBadge('list', groups.readyToList.length);
  updateBadge('ship', groups.needsShipping.length);
  updateBadge('confirm', groups.awaitingConfirmation.length);
  updateBadge('complete', groups.confirmSale.length);

  // Render lists
  renderActionList('photo', groups.needsPhoto, 'unlisted');
  renderActionList('list', groups.readyToList, 'photographed');
  renderActionList('ship', groups.needsShipping, 'packaged');
  renderActionList('confirm', groups.awaitingConfirmation, 'shipped');
  renderActionList('complete', groups.confirmSale, 'confirmed_received');

  // Setup click handlers
  setupActionItemHandlers();
}

function updateBadge(type, count) {
  const badge = $(`#action-badge-${type}`);
  if (badge) {
    badge.textContent = count;
    setVisible(badge, count > 0);
  }
}

function renderActionList(type, items, status) {
  const listEl = $(`#action-list-${type}`);
  if (!listEl) return;

  if (items.length === 0) {
    listEl.innerHTML = '<li class="action-item-empty">All clear!</li>';
    return;
  }

  // Show first 3 items
  const displayItems = items.slice(0, 3);
  const remaining = items.length - 3;

  listEl.innerHTML = displayItems.map(item => `
    <li data-item-id="${item.id}" data-status="${status}">
      <a href="#" class="table-link">${item.title || 'Untitled'}</a>
    </li>
  `).join('');

  if (remaining > 0) {
    listEl.innerHTML += `<li class="action-item-more" data-status="${status}"><a href="#" class="table-link">+ ${remaining} more</a></li>`;
  }
}

function setupActionItemHandlers() {
  // Click on action item header - navigate to Selling tab with filter
  const headers = $$('.action-item-header');
  headers.forEach(header => {
    header.addEventListener('click', (e) => {
      const group = e.currentTarget.closest('.action-item-group');
      const list = group.querySelector('.action-item-list');
      const firstItem = list.querySelector('li[data-status]');

      if (firstItem) {
        const status = firstItem.dataset.status;
        navigateToSellingWithFilter(status);
      }
    });
  });

  // Click on individual action item
  const allLists = $$('.action-item-list');
  allLists.forEach(list => {
    list.addEventListener('click', (e) => {
      const li = e.target.closest('li');
      if (!li) return;

      const itemId = li.dataset.itemId;
      const status = li.dataset.status;

      if (li.classList.contains('action-item-more')) {
        // Navigate to Selling tab with status filter
        navigateToSellingWithFilter(status);
      } else if (itemId) {
        // Navigate to Selling tab
        navigateToSellingWithFilter(status);
      }
    });
  });
}

function navigateToSellingWithFilter(status) {
  // Switch to Selling tab
  localStorage.setItem('activeTab', 'selling');

  // Store the filter status for selling module to pick up
  localStorage.setItem('selling-filter-status', status);

  // Trigger tab change
  window.location.hash = '#selling';
  window.location.reload();
}
