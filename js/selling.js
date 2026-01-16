// =============================================================================
// SELLING MODULE
// =============================================================================

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
  formatCurrency,
  capitalize,
  formatStatus,
  calculateProfit,
  formatProfitDisplay,
  renderProfitWaterfall,
  escapeHtml,
  createFormHandler
} from './utils.js';
import { RESALE_PLATFORMS, PIPELINE_STATUSES, getStatusSortOrder } from './config.js';
import { openViewItemModal, openEditItemModal } from './inventory.js';
import { initFees, calculatePlatformFees, calculateEstimatedReturns } from './fees.js';
import { show, hide, createLazyModal, createTableController } from './components.js';

// =============================================================================
// STATE
// =============================================================================

let pipelineData = [];
let nonPipelineData = [];
let pipelineTableCtrl = null;
let currentSoldItem = null;
let currentShipItem = null;
let feesManuallyEdited = false;
let currentFeeResult = null; // Track fee calculation result for waterfall display

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initSelling() {
  await initFees();
  setupTableController();
  await loadPipeline();
  setupEventHandlers();
}

async function loadPipeline() {
  pipelineData = await getInventoryInPipeline();
  nonPipelineData = await getItemsNotInPipeline();
  if (pipelineTableCtrl) {
    pipelineTableCtrl.render();
  }
}

function updateItemCount(filteredData) {
  const countEl = $('#selling-count');
  if (countEl) {
    const totalItems = pipelineData.length + nonPipelineData.length;
    countEl.textContent = `Showing ${filteredData.length} of ${totalItems} items`;
  }
}

function setupTableController() {
  pipelineTableCtrl = createTableController({
    tableSelector: '#selling-table',
    tbodySelector: '#selling-tbody',
    getData: () => pipelineData,
    filterItem: (item, filters, search) => {
      // Filter by status
      if (filters.status && item.status !== filters.status) return false;
      // Filter by platform (only for sold items)
      if (filters.platform && filters.platform !== 'all') {
        if (item.status !== 'sold' || item.sold_platform !== filters.platform) return false;
      }
      // Filter by search
      if (search) {
        const title = (item.title || '').toLowerCase();
        const brand = (item.brand || '').toLowerCase();
        const description = (item.description || '').toLowerCase();
        return title.includes(search) || brand.includes(search) || description.includes(search);
      }
      return true;
    },
    getColumnValue: (item, col) => {
      switch (col) {
        case 'title': return (item.title || '').toLowerCase();
        case 'category': return item.category || '';
        case 'status': return getStatusSortOrder(item.status);
        case 'purchase_price': return item.purchase_price || 0;
        case 'sold_price': return item.sold_price || 0;
        case 'profit': return calculateProfit(item).profit;
        case 'sold_platform': return item.sold_platform || '';
        default: return item.created_at;
      }
    },
    createRow: renderPipelineRow,
    emptyState: { colspan: 8, icon: '💰', message: 'No items in pipeline' },
    searchSelector: '#selling-search',
    defaultSort: { column: 'status', direction: 'asc' },
    filterSelects: [
      { selector: '#status-filter', key: 'status' },
      { selector: '#platform-filter', key: 'platform' }
    ],
    clickHandlers: {
      '.table-link': (el) => {
        openViewItemModal(el.dataset.id);
      },
      '.edit-item-btn': (el) => {
        openEditItemModal(el.dataset.id, {
          onSave: async () => {
            await loadPipeline();
          }
        });
      },
      '.mark-sold-btn': (el) => {
        openMarkAsSoldModal(parseInt(el.dataset.id));
      },
      '.status-next-btn': (el) => {
        const itemId = parseInt(el.dataset.id);
        const nextStatus = el.dataset.nextStatus;
        if (nextStatus === 'shipped') {
          openShipItemModal(itemId);
        } else {
          updateItemStatus(itemId, nextStatus);
        }
      },
      '.list-for-sale-btn': (el) => {
        listItemForSale(parseInt(el.dataset.id));
      }
    },
    onRender: updateItemCount
  }).init();
}

function setupEventHandlers() {
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
      showToast('Item marked as shipped');
      shipItemModal.close();
      await loadPipeline();
      currentShipItem = null;
    },
    onError: () => showToast('Failed to ship item'),
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
      showToast('Item sold and archived');
      markSoldModal.close();
      await loadPipeline();
      currentSoldItem = null;
    },
    onError: () => showToast('Failed to mark item as sold'),
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
      const profitClass = best.profit >= 0 ? 'value--positive' : 'value--negative';
      const platformName = capitalize(best.platformId.replace('_', ' '));
      const tooltipText = `${formatCurrency(best.netPayout)} payout on ${platformName}`;
      estReturnHtml = `<span class="est-return" title="${escapeHtml(tooltipText)}">
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
  } else if (item.status === 'listed') {
    actionButton = `<button class="btn btn--sm btn--primary mark-sold-btn" data-id="${item.id}">Mark sold</button>`;
  } else if (item.status !== 'shipped') {
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
    'needs_photo',
    'unlisted',
    'listed',
    'sold',
    'packaged',
    'shipped'
  ];

  const currentIndex = statusOrder.indexOf(currentStatus);
  if (currentIndex === -1 || currentIndex === statusOrder.length - 1) {
    return null;
  }

  // Skip 'sold' - that's handled by the Mark Sold modal
  const nextStatus = statusOrder[currentIndex + 1];
  if (nextStatus === 'sold') {
    return null; // Mark sold button is shown instead
  }

  return nextStatus;
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

    // Reset fee state
    hide('#reset-fees-btn');
    currentFeeResult = null;

    updateProfitPreview();
  }
});

export async function openMarkAsSoldModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  markSoldModal.open({ item });
}

function updateProfitPreview() {
  const container = $('#profit-waterfall');
  if (!container || !currentSoldItem) return;

  const soldPrice = parseFloat($('#sold-price').value) || 0;
  const shippingCost = parseFloat($('#shipping-cost').value) || 0;
  const platformFees = parseFloat($('#platform-fees').value) || 0;

  const purchasePrice = currentSoldItem.purchase_price || 0;
  const taxPaid = currentSoldItem.tax_paid || 0;
  const repairCosts = currentSoldItem.repairs_completed?.reduce((sum, r) => sum + (r.repair_cost || 0), 0) || 0;

  // Cost includes everything you spent: purchase + tax + repairs + shipping
  const costBasis = purchasePrice + taxPaid + repairCosts + shippingCost;
  // Payout is what you receive after platform fees
  const payout = soldPrice - platformFees;
  // Profit is payout minus your costs
  const profit = payout - costBasis;

  // Build fee details text
  let feeDetails = '';
  if (currentFeeResult) {
    const parts = [];
    if (currentFeeResult.breakdown?.commission) {
      parts.push(currentFeeResult.breakdown.commission);
    }
    if (currentFeeResult.breakdown?.paymentProcessing && currentFeeResult.breakdown.paymentProcessing !== 'Included') {
      parts.push(`+ ${currentFeeResult.breakdown.paymentProcessing} processing`);
    }
    feeDetails = parts.join(' ');
  }

  // Build cost details text
  const costParts = [];
  costParts.push(`${formatCurrency(purchasePrice)} purchase`);
  if (taxPaid > 0) costParts.push(`+ ${formatCurrency(taxPaid)} tax`);
  if (repairCosts > 0) costParts.push(`+ ${formatCurrency(repairCosts)} repairs`);
  if (shippingCost > 0) costParts.push(`+ ${formatCurrency(shippingCost)} shipping`);
  const costDetails = costParts.length > 1 ? costParts.join(' ') : '';

  container.innerHTML = renderProfitWaterfall({
    salePrice: soldPrice,
    fees: platformFees,
    payout,
    costBasis,
    profit,
    feeDetails,
    costDetails
  }, { showDetails: true });
}

function updateFeeCalculation() {
  const platform = $('#sold-platform').value;
  const salePrice = parseFloat($('#sold-price').value) || 0;

  if (!platform || !salePrice) {
    currentFeeResult = null;
    updateProfitPreview();
    return;
  }

  const result = calculatePlatformFees(platform, salePrice);
  if (result) {
    $('#platform-fees').value = result.totalFees.toFixed(2);
    currentFeeResult = result;
  } else {
    currentFeeResult = null;
  }
  updateProfitPreview();
}

// =============================================================================
// STATUS UPDATES
// =============================================================================

async function updateItemStatus(itemId, newStatus) {
  try {
    await updateInventoryItem(itemId, { status: newStatus });
    showToast(`Status updated to ${formatStatus(newStatus)}`);
    await loadPipeline();
  } catch (err) {
    console.error('Failed to update status:', err);
    showToast('Failed to update status');
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
    showToast('Item not found');
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
    showToast('Item added to selling pipeline');
    await loadPipeline();
  } catch (err) {
    console.error('Failed to list item for sale:', err);
    showToast('Failed to list item for sale');
  }
}

export { openShipItemModal, listItemForSale, loadPipeline, nonPipelineData };
