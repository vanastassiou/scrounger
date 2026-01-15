// =============================================================================
// SELLING MODULE
// =============================================================================

import { state } from './state.js';
import {
  getInventoryInPipeline,
  getItemsNotInPipeline,
  markItemAsSold,
  getInventoryItem,
  updateInventoryItem,
  archiveItem
} from './db.js';
import { showToast } from './ui.js';
import {
  $,
  $$,
  formatCurrency,
  formatDate,
  capitalize,
  formatStatus,
  calculateProfit,
  formatProfitDisplay,
  escapeHtml,
  createSortableTable,
  emptyStateRow,
  updateSortIndicators,
  createFormHandler,
  createMobileSortDropdown
} from './utils.js';
import { RESALE_PLATFORMS, PIPELINE_STATUSES, getStatusSortOrder } from './config.js';
import { openViewItemModal, openEditItemModal } from './inventory.js';
import { initFees, calculatePlatformFees, calculateEstimatedReturns } from './fees.js';
import { setVisible, show, hide, createLazyModal } from './components.js';

// =============================================================================
// STATE
// =============================================================================

let pipelineData = [];
let nonPipelineData = [];
let sortColumn = 'status';
let sortDirection = 'asc';
let filterStatus = null;
let filterPlatform = null;
let searchTerm = '';
let currentSoldItem = null;
let currentShipItem = null;
let feesManuallyEdited = false;

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initSelling() {
  await initFees();
  await loadPipeline();
  setupEventHandlers();
}

async function loadPipeline() {
  pipelineData = await getInventoryInPipeline();
  nonPipelineData = await getItemsNotInPipeline();
  renderPipelineTable();
}

function setupEventHandlers() {
  // Status filter dropdown
  const statusFilter = $('#status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      filterStatus = e.target.value === 'all' ? null : e.target.value;
      renderPipelineTable();
    });
  }

  // Platform filter
  const platformFilter = $('#platform-filter');
  if (platformFilter) {
    platformFilter.addEventListener('change', (e) => {
      filterPlatform = e.target.value === 'all' ? null : e.target.value;
      renderPipelineTable();
    });
  }

  // Search
  const searchInput = $('#selling-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.toLowerCase();
      renderPipelineTable();
    });
  }

  // Table sorting and actions
  const table = $('#selling-table');
  if (table) {
    const sortConfig = {
      getState: () => ({ sortColumn, sortDirection }),
      setState: (s) => { sortColumn = s.sortColumn; sortDirection = s.sortDirection; },
      onSort: renderPipelineTable
    };
    const sortHandler = createSortableTable(sortConfig);
    createMobileSortDropdown(table, sortConfig);

    table.addEventListener('click', (e) => {
      // Header sorting
      if (sortHandler(e)) return;

      // Item link click - view item details
      const itemLink = e.target.closest('.table-link');
      if (itemLink) {
        e.preventDefault();
        const itemId = itemLink.dataset.id;
        openViewItemModal(itemId);
        return;
      }

      // Edit button click
      const editBtn = e.target.closest('.edit-item-btn');
      if (editBtn) {
        e.preventDefault();
        const itemId = editBtn.dataset.id;
        openEditItemModal(itemId, {
          onSave: async () => {
            await loadPipelineData();
            renderPipelineTable();
          }
        });
        return;
      }

      // Mark as sold button
      const markSoldBtn = e.target.closest('.mark-sold-btn');
      if (markSoldBtn) {
        e.preventDefault();
        const itemId = parseInt(markSoldBtn.dataset.id);
        openMarkAsSoldModal(itemId);
        return;
      }

      // Quick status update
      const statusBtn = e.target.closest('.status-next-btn');
      if (statusBtn) {
        e.preventDefault();
        const itemId = parseInt(statusBtn.dataset.id);
        const nextStatus = statusBtn.dataset.nextStatus;
        // Open ship modal for packaged -> shipped transition
        if (nextStatus === 'shipped') {
          openShipItemModal(itemId);
        } else {
          updateItemStatus(itemId, nextStatus);
        }
        return;
      }

      // List for sale button
      const listForSaleBtn = e.target.closest('.list-for-sale-btn');
      if (listForSaleBtn) {
        e.preventDefault();
        const itemId = parseInt(listForSaleBtn.dataset.id);
        listItemForSale(itemId);
      }
    });
  }

  // Ship item form
  createFormHandler({
    formSelector: '#ship-item-form',
    transform: (formData) => ({
      itemId: parseInt(formData.get('item_id')),
      shipData: {
        status: 'shipped',
        shipping_carrier: formData.get('shipping_carrier'),
        tracking_number: formData.get('tracking_number') || null,
        ship_date: formData.get('ship_date'),
        shipping_cost: parseFloat(formData.get('shipping_cost')) || 0
      }
    }),
    onSubmit: async ({ itemId, shipData }) => {
      await updateInventoryItem(itemId, shipData);
    },
    onSuccess: async () => {
      showToast('Item marked as shipped', 'success');
      shipItemModal.close();
      await loadPipeline();
      currentShipItem = null;
    },
    onError: () => showToast('Failed to ship item', 'error'),
    resetOnSuccess: false
  });

  // Mark-as-sold form
  createFormHandler({
    formSelector: '#mark-sold-form',
    transform: (formData) => ({
      itemId: parseInt(formData.get('item_id')),
      soldData: {
        sold_date: formData.get('sold_date'),
        sold_price: parseFloat(formData.get('sold_price')),
        sold_platform: formData.get('sold_platform'),
        shipping_cost: parseFloat(formData.get('shipping_cost')) || 0,
        platform_fees: parseFloat(formData.get('platform_fees')) || 0
      }
    }),
    onSubmit: async ({ itemId, soldData }) => {
      await markItemAsSold(itemId, soldData);
      await archiveItem(itemId);
    },
    onSuccess: async () => {
      showToast('Item sold and archived', 'success');
      markSoldModal.close();
      await loadPipeline();
      currentSoldItem = null;
    },
    onError: () => showToast('Failed to mark item as sold', 'error'),
    resetOnSuccess: false
  });

  // Mark-sold form real-time listeners
  const markSoldForm = $('#mark-sold-form');
  if (markSoldForm) {
    // Real-time profit preview
    const priceInputs = ['#sold-price', '#shipping-cost', '#platform-fees'];
    priceInputs.forEach(selector => {
      const input = $(selector);
      if (input) {
        input.addEventListener('input', updateProfitPreview);
      }
    });

    // Auto-calculate fees when platform or price changes
    const soldPriceInput = $('#sold-price');
    const soldPlatformSelect = $('#sold-platform');
    const platformFeesInput = $('#platform-fees');

    if (soldPriceInput) {
      soldPriceInput.addEventListener('input', () => {
        if (!feesManuallyEdited) {
          updateFeeCalculation();
        }
      });
    }

    if (soldPlatformSelect) {
      soldPlatformSelect.addEventListener('change', () => {
        if (!feesManuallyEdited) {
          updateFeeCalculation();
        }
      });
    }

    // Track manual edits to platform fees
    if (platformFeesInput) {
      platformFeesInput.addEventListener('input', () => {
        feesManuallyEdited = true;
        show('#reset-fees-btn');
      });
    }

    // Reset fees button
    const resetFeesBtn = $('#reset-fees-btn');
    if (resetFeesBtn) {
      resetFeesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        feesManuallyEdited = false;
        hide(resetFeesBtn);
        updateFeeCalculation();
      });
    }
  }
}

// =============================================================================
// RENDERING
// =============================================================================

function renderPipelineTable() {
  const tbody = $('#selling-tbody');
  if (!tbody) return;

  // Only show items in the sales pipeline (not in_collection)
  let filtered = [...pipelineData];

  // Filter by status
  if (filterStatus) {
    filtered = filtered.filter(item => item.status === filterStatus);
  }

  // Filter by platform (only for sold items)
  if (filterPlatform && filterPlatform !== 'all') {
    filtered = filtered.filter(item =>
      item.status === 'sold' && item.sold_platform === filterPlatform
    );
  }

  // Filter by search
  if (searchTerm) {
    filtered = filtered.filter(item => {
      const title = (item.title || '').toLowerCase();
      const brand = (item.brand || '').toLowerCase();
      const description = (item.description || '').toLowerCase();
      return title.includes(searchTerm) || brand.includes(searchTerm) || description.includes(searchTerm);
    });
  }

  // Sort data
  filtered.sort((a, b) => {
    let aVal, bVal;

    switch (sortColumn) {
      case 'title':
        aVal = (a.title || '').toLowerCase();
        bVal = (b.title || '').toLowerCase();
        break;
      case 'category':
        aVal = a.category || '';
        bVal = b.category || '';
        break;
      case 'status':
        aVal = getStatusSortOrder(a.status);
        bVal = getStatusSortOrder(b.status);
        break;
      case 'purchase_price':
        aVal = a.purchase_price || 0;
        bVal = b.purchase_price || 0;
        break;
      case 'sold_price':
        aVal = a.sold_price || 0;
        bVal = b.sold_price || 0;
        break;
      case 'profit':
        aVal = calculateProfit(a).profit;
        bVal = calculateProfit(b).profit;
        break;
      case 'sold_platform':
        aVal = a.sold_platform || '';
        bVal = b.sold_platform || '';
        break;
      default:
        aVal = a.created_at;
        bVal = b.created_at;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Render rows
  if (filtered.length === 0) {
    tbody.innerHTML = emptyStateRow({ colspan: 8, icon: '💰', message: 'No items in pipeline' });
  } else {
    tbody.innerHTML = filtered.map(item => renderPipelineRow(item)).join('');
  }

  // Update sort indicators
  const table = $('#selling-table');
  if (table) updateSortIndicators(table, sortColumn, sortDirection);

  // Update count
  const countEl = $('#selling-count');
  if (countEl) {
    const totalItems = pipelineData.length + nonPipelineData.length;
    countEl.textContent = `Showing ${filtered.length} of ${totalItems} items`;
  }
}

function renderPipelineRow(item) {
  const { profit, margin } = calculateProfit(item);
  const { formatted: profitDisplay, className: profitClass } = formatProfitDisplay(profit);

  const cost = (item.purchase_price || 0) + (item.tax_paid || 0);
  const price = item.sold_price || item.estimated_resale_value || 0;
  const platform = item.sold_platform ? capitalize(item.sold_platform.replace('_', ' ')) : '-';

  // Calculate estimated return for items not yet sold
  let estReturnHtml = '-';
  if (item.status !== 'sold' && item.estimated_resale_value > 0) {
    const estimates = calculateEstimatedReturns(item);
    if (estimates.length > 0) {
      const best = estimates[0];
      const profitClass = best.profit >= 0 ? 'profit--positive' : 'profit--negative';
      estReturnHtml = `<span class="est-return">
        <span class="${profitClass}">${formatCurrency(best.profit)}</span>
        <span class="est-platform">${best.platformId}</span>
      </span>`;
    }
  }

  // Determine action button
  let actionButton = '';
  const isInPipeline = PIPELINE_STATUSES.includes(item.status);

  if (!isInPipeline) {
    // Non-pipeline item - show "List for sale" button
    actionButton = `<button class="btn btn--sm btn--primary list-for-sale-btn" data-id="${item.id}">List for sale</button>`;
  } else if (item.status === 'confirmed_received') {
    actionButton = `<button class="btn btn--sm btn--primary mark-sold-btn" data-id="${item.id}">Mark sold</button>`;
  } else if (item.status !== 'sold') {
    const nextStatus = getNextStatus(item.status);
    if (nextStatus) {
      actionButton = `<button class="btn btn--sm status-next-btn" data-id="${item.id}" data-next-status="${nextStatus}">${capitalize(nextStatus.replace('_', ' '))}</button>`;
    }
  }

  return `
    <tr data-id="${item.id}">
      <td><a href="#" class="table-link" data-id="${item.id}">${escapeHtml(item.title || 'Untitled')}</a></td>
      <td data-label="Status"><span class="status status--${item.status}">${formatStatus(item.status)}</span></td>
      <td data-label="Cost">${formatCurrency(cost)}</td>
      <td data-label="Price">${price > 0 ? formatCurrency(price) : '-'}</td>
      <td data-label="Est. Return">${estReturnHtml}</td>
      <td data-label="Profit" class="${profitClass}">${item.status === 'sold' ? profitDisplay : '-'}</td>
      <td data-label="Platform">${platform}</td>
      <td class="table-actions">
        <button class="btn btn--sm edit-item-btn" data-id="${item.id}">Edit</button>
        ${actionButton}
      </td>
    </tr>
  `;
}

function getNextStatus(currentStatus) {
  const statusOrder = [
    'unlisted',
    'photographed',
    'listed',
    'pending_sale',
    'packaged',
    'shipped',
    'confirmed_received'
  ];

  const currentIndex = statusOrder.indexOf(currentStatus);
  if (currentIndex === -1 || currentIndex === statusOrder.length - 1) {
    return null;
  }

  return statusOrder[currentIndex + 1];
}

// =============================================================================
// MARK AS SOLD MODAL
// =============================================================================

const markSoldModal = createLazyModal('#mark-sold-dialog', {
  onOpen: (dialog, { item }) => {
    currentSoldItem = item;
    feesManuallyEdited = false;

    // Populate form
    const itemIdInput = dialog.querySelector('#sold-item-id');
    const titleEl = dialog.querySelector('#sold-item-title');
    const dateInput = dialog.querySelector('#sold-date');
    const priceInput = dialog.querySelector('#sold-price');
    const platformSelect = dialog.querySelector('#sold-platform');
    const shippingInput = dialog.querySelector('#shipping-cost');
    const feesInput = dialog.querySelector('#platform-fees');

    if (itemIdInput) itemIdInput.value = item.id;
    if (titleEl) titleEl.textContent = item.title || 'Untitled';
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    if (priceInput) priceInput.value = item.estimated_resale_value || '';
    if (platformSelect) platformSelect.value = '';
    if (shippingInput) shippingInput.value = '';
    if (feesInput) feesInput.value = '';

    // Reset fee display
    hide('#reset-fees-btn');
    clearFeeBreakdown();

    updateProfitPreview();
  }
});

export async function openMarkAsSoldModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }

  markSoldModal.open({ item });
}

function updateProfitPreview() {
  if (!currentSoldItem) return;

  const soldPrice = parseFloat($('#sold-price').value) || 0;
  const shippingCost = parseFloat($('#shipping-cost').value) || 0;
  const platformFees = parseFloat($('#platform-fees').value) || 0;

  const purchaseCost = (currentSoldItem.purchase_price || 0) + (currentSoldItem.tax_paid || 0);
  const repairCosts = currentSoldItem.repairs_completed?.reduce((sum, r) => sum + (r.repair_cost || 0), 0) || 0;
  const expenses = shippingCost + platformFees;
  const totalCost = purchaseCost + repairCosts;
  const profit = soldPrice - totalCost - expenses;

  // Update summary
  $('#summary-price').textContent = formatCurrency(soldPrice);
  $('#summary-cost').textContent = formatCurrency(totalCost);
  $('#summary-expenses').textContent = formatCurrency(expenses);

  const profitEl = $('#summary-profit');
  const { formatted, className } = formatProfitDisplay(profit);
  profitEl.textContent = formatted;
  profitEl.className = `${className}`;
}

function updateFeeCalculation() {
  const platform = $('#sold-platform').value;
  const salePrice = parseFloat($('#sold-price').value) || 0;

  if (!platform || !salePrice) {
    clearFeeBreakdown();
    return;
  }

  const result = calculatePlatformFees(platform, salePrice);
  if (result) {
    $('#platform-fees').value = result.totalFees.toFixed(2);
    renderFeeBreakdown(result);
    updateProfitPreview();
  } else {
    clearFeeBreakdown();
  }
}

function renderFeeBreakdown(result) {
  const container = $('#fee-breakdown');
  if (!container) return;

  const { breakdown, notes, isConsignment, platformName } = result;
  let html = '';

  // Commission
  if (breakdown.commission) {
    html += `<div class="fee-line">
      <span>${isConsignment ? 'Payout:' : 'Commission:'}</span>
      <span>${breakdown.commission}${!isConsignment ? ` (${formatCurrency(result.commission)})` : ''}</span>
    </div>`;
  }

  // Payment processing
  if (breakdown.paymentProcessing && breakdown.paymentProcessing !== 'Included') {
    html += `<div class="fee-line">
      <span>Payment processing:</span>
      <span>${breakdown.paymentProcessing} (${formatCurrency(result.paymentProcessing)})</span>
    </div>`;
  }

  // Listing fee
  if (breakdown.listingFee) {
    html += `<div class="fee-line">
      <span>Listing fee:</span>
      <span>${breakdown.listingFee}</span>
    </div>`;
  }

  // Total fees
  html += `<div class="fee-line fee-line--total">
    <span>Total fees:</span>
    <span>${formatCurrency(result.totalFees)}</span>
  </div>`;

  // Net payout
  html += `<div class="fee-line fee-line--net">
    <span>Net payout:</span>
    <span>${formatCurrency(result.netPayout)}</span>
  </div>`;

  // Notes
  if (notes && notes.length > 0) {
    html += `<div class="fee-notes">${notes.join(' • ')}</div>`;
  }

  container.innerHTML = html;
  show(container);
}

function clearFeeBreakdown() {
  const container = $('#fee-breakdown');
  if (container) {
    container.innerHTML = '';
    hide(container);
  }
}

// =============================================================================
// STATUS UPDATES
// =============================================================================

async function updateItemStatus(itemId, newStatus) {
  try {
    await updateInventoryItem(itemId, { status: newStatus });
    showToast(`Status updated to ${formatStatus(newStatus)}`, 'success');
    await loadPipeline();
  } catch (err) {
    console.error('Failed to update status:', err);
    showToast('Failed to update status', 'error');
  }
}

// =============================================================================
// SHIP ITEM MODAL
// =============================================================================

const shipItemModal = createLazyModal('#ship-item-dialog', {
  onOpen: (dialog, { item }) => {
    currentShipItem = item;

    // Populate form
    const itemIdInput = dialog.querySelector('#ship-item-id');
    const titleEl = dialog.querySelector('#ship-item-title');
    const dateInput = dialog.querySelector('#ship-date');
    const carrierSelect = dialog.querySelector('#shipping-carrier');
    const trackingInput = dialog.querySelector('#tracking-number');
    const shippingCostInput = dialog.querySelector('#ship-shipping-cost');

    if (itemIdInput) itemIdInput.value = item.id;
    if (titleEl) titleEl.textContent = item.title || 'Untitled';
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    if (carrierSelect) carrierSelect.value = '';
    if (trackingInput) trackingInput.value = '';
    if (shippingCostInput) shippingCostInput.value = item.shipping_cost || '';
  }
});

async function openShipItemModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found', 'error');
    return;
  }

  shipItemModal.open({ item });
}

// =============================================================================
// LIST FOR SALE
// =============================================================================

async function listItemForSale(itemId) {
  try {
    await updateInventoryItem(itemId, { status: 'unlisted' });
    showToast('Item added to selling pipeline', 'success');
    await loadPipeline();
  } catch (err) {
    console.error('Failed to list item for sale:', err);
    showToast('Failed to list item for sale', 'error');
  }
}

export { openShipItemModal, listItemForSale, loadPipeline, nonPipelineData };
