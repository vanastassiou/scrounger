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
import {
  RESALE_PLATFORMS,
  PIPELINE_STATUSES,
  getStatusSortOrder,
  CARRIER_TRACKING_URLS,
  REQUIRED_PHOTO_TYPES,
  CONDITIONS_REQUIRING_FLAWS
} from './config.js';
import { getAttachmentsByItem, createAttachment } from './db.js';
import { openViewItemModal, openEditItemModal } from './inventory.js';
import { initFees, calculatePlatformFees, calculateEstimatedReturns } from './fees.js';
import { show, hide, createLazyModal, createTableController } from './components.js';
import { openPhotoManager, validatePhotosComplete as validatePhotos, getPhotoStatusSync } from './photos.js';

// =============================================================================
// STATE
// =============================================================================

let pipelineData = [];
let nonPipelineData = [];
let pipelineTableCtrl = null;
let currentSoldItem = null;
let currentShipItem = null;
let currentPhotoItem = null;
let currentListedItem = null;
let currentDeliveryItem = null;
let feesManuallyEdited = false;
let currentFeeResult = null; // Track fee calculation result for waterfall display
let pendingDeliveryScreenshot = null;

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate item has required data before entering the selling pipeline.
 * @param {Object} item - Inventory item
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validatePipelineEntry(item) {
  const errors = [];

  if (!item.brand) {
    errors.push('Brand is required');
  }
  if (!item.subcategory) {
    errors.push('Item type is required');
  }
  if (!item.primary_colour) {
    errors.push('Primary colour is required');
  }
  if (!item.overall_condition) {
    errors.push('Condition is required');
  }
  if (!item.primary_material) {
    errors.push('Primary material is required');
  }

  // Check for sizing (labeled_size OR at least one measurement)
  const hasMeasurements = item.measurements && Object.values(item.measurements).some(v => v && v > 0);
  if (!item.labeled_size && !hasMeasurements) {
    errors.push('Size (labeled or measurements) is required');
  }

  // If condition warrants flaws, require them
  if (CONDITIONS_REQUIRING_FLAWS.includes(item.overall_condition)) {
    if (!item.flaws || item.flaws.length === 0) {
      errors.push(`Flaws must be documented for "${item.overall_condition}" condition`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that required photos exist for an item.
 * @param {Object} item - Inventory item
 * @param {Array} attachments - Item attachments
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validatePhotosComplete(item, attachments) {
  const missing = [];

  // Get photo types from attachments
  const existingTypes = new Set(
    attachments
      .filter(a => a.type)
      .map(a => a.type)
  );

  // Check required types
  for (const requiredType of REQUIRED_PHOTO_TYPES) {
    if (!existingTypes.has(requiredType)) {
      missing.push(requiredType);
    }
  }

  // Check flaw photos if item has flaws
  if (item.flaws && item.flaws.length > 0) {
    if (!existingTypes.has('flaw')) {
      missing.push('flaw');
    }
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Validate listing data for the listed transition.
 * @param {Object} data - Form data object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateListingData(data) {
  const errors = [];

  if (!data.list_platform) {
    errors.push('Platform is required');
  }
  if (!data.list_date) {
    errors.push('List date is required');
  }
  if (!data.listed_price || data.listed_price <= 0) {
    errors.push('Listed price is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate shipping data for the shipped transition.
 * @param {Object} data - Form data object
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateShippingData(data) {
  const errors = [];

  if (!data.recipient_address || data.recipient_address.trim() === '') {
    errors.push('Recipient address is required');
  }
  if (!data.shipping_carrier) {
    errors.push('Carrier is required');
  }
  if (!data.tracking_number || data.tracking_number.trim() === '') {
    errors.push('Tracking number is required');
  }
  if (!data.ship_date) {
    errors.push('Ship date is required');
  }
  if (!data.estimated_delivery) {
    errors.push('Estimated delivery date is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate delivery confirmation data.
 * @param {Object} data - Form data object
 * @param {boolean} hasScreenshot - Whether a screenshot is attached
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDeliveryConfirmation(data, hasScreenshot) {
  const errors = [];

  if (!data.received_date) {
    errors.push('Confirmation date is required');
  }
  if (!hasScreenshot) {
    errors.push('Delivery confirmation screenshot is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate tracking URL for a carrier.
 * @param {string} carrier - Carrier code
 * @param {string} trackingNumber - Tracking number
 * @returns {string|null} - Tracking URL or null if not available
 */
export function getTrackingUrl(carrier, trackingNumber) {
  const template = CARRIER_TRACKING_URLS[carrier];
  if (!template || !trackingNumber) return null;
  return template.replace('{tracking}', encodeURIComponent(trackingNumber));
}

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

  // Pre-compute photo status for needs_photo items
  const needsPhotoItems = pipelineData.filter(i => i.status === 'needs_photo');
  await Promise.all(needsPhotoItems.map(async (item) => {
    try {
      const attachments = await getAttachmentsByItem(item.id);
      item._photoStatus = getPhotoStatusSync(item, attachments);
    } catch (err) {
      // Silently fail
    }
  }));

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
        openMarkAsSoldModal(el.dataset.id);
      },
      '.status-next-btn': (el) => {
        const itemId = el.dataset.id;
        const nextStatus = el.dataset.nextStatus;
        // Route to appropriate modal based on transition
        if (nextStatus === 'unlisted') {
          openPhotoUploadModal(itemId);
        } else if (nextStatus === 'listed') {
          openMarkAsListedModal(itemId);
        } else if (nextStatus === 'shipped') {
          openShipItemModal(itemId);
        } else if (nextStatus === 'confirmed_received') {
          openConfirmDeliveryModal(itemId);
        } else {
          updateItemStatus(itemId, nextStatus);
        }
      },
      '.list-for-sale-btn': (el) => {
        listItemForSale(el.dataset.id);
      },
      '.delist-btn': (el) => {
        openDelistItemModal(el.dataset.id);
      }
    },
    onRender: updateItemCount
  }).init();
}

function setupEventHandlers() {
  // Ship item form (with validation)
  createFormHandler({
    formSelector: '#ship-item-form',
    transform: (formData) => ({
      itemId: formData.get('item_id'),
      shipData: {
        status: 'shipped',
        recipient_address: formData.get('recipient_address'),
        shipping_carrier: formData.get('shipping_carrier'),
        tracking_number: formData.get('tracking_number'),
        ship_date: formData.get('ship_date'),
        estimated_delivery: formData.get('estimated_delivery'),
        shipping_cost: parseFloat(formData.get('shipping_cost')) || 0
      }
    }),
    validate: (formData) => {
      const data = {
        recipient_address: formData.get('recipient_address'),
        shipping_carrier: formData.get('shipping_carrier'),
        tracking_number: formData.get('tracking_number'),
        ship_date: formData.get('ship_date'),
        estimated_delivery: formData.get('estimated_delivery')
      };
      return validateShippingData(data);
    },
    onSubmit: async ({ itemId, shipData }) => {
      await updateInventoryItem(itemId, shipData);
    },
    onSuccess: async () => {
      showToast('Item marked as shipped');
      shipItemModal.close();
      await loadPipeline();
      currentShipItem = null;
    },
    onError: (err) => showToast(err.message || 'Failed to ship item'),
    resetOnSuccess: false
  });

  // Mark-as-sold form
  createFormHandler({
    formSelector: '#mark-sold-form',
    transform: (formData) => ({
      itemId: formData.get('item_id'),
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

  // Mark-as-listed form
  createFormHandler({
    formSelector: '#mark-listed-form',
    transform: (formData) => ({
      itemId: formData.get('item_id'),
      listingData: {
        status: 'listed',
        list_platform: formData.get('list_platform'),
        list_date: formData.get('list_date'),
        listed_price: parseFloat(formData.get('listed_price')),
        listing_url: formData.get('listing_url') || null
      }
    }),
    validate: (formData) => {
      const data = {
        list_platform: formData.get('list_platform'),
        list_date: formData.get('list_date'),
        listed_price: parseFloat(formData.get('listed_price'))
      };
      return validateListingData(data);
    },
    onSubmit: async ({ itemId, listingData }) => {
      await updateInventoryItem(itemId, listingData);
    },
    onSuccess: async () => {
      showToast('Item marked as listed');
      markAsListedModal.close();
      await loadPipeline();
      currentListedItem = null;
    },
    onError: (err) => showToast(err.message || 'Failed to mark item as listed'),
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

  // Validation error modal - edit button
  const validationEditBtn = $('#validation-edit-btn');
  if (validationEditBtn) {
    validationEditBtn.addEventListener('click', () => {
      const itemId = validationEditBtn.dataset.id;
      validationErrorModal.close();
      openEditItemModal(itemId, {
        onSave: async () => {
          await loadPipeline();
        }
      });
    });
  }

  // Photo upload form handlers
  const photoUploadInput = $('#photo-upload-input');
  const photoTypeSelect = $('#photo-type-select');
  if (photoUploadInput && photoTypeSelect) {
    photoUploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      const photoType = photoTypeSelect.value;
      if (file && photoType) {
        await handlePhotoUpload(file, photoType);
        photoUploadInput.value = '';
      }
    });
  }

  const photoCompleteBtn = $('#photo-complete-btn');
  if (photoCompleteBtn) {
    photoCompleteBtn.addEventListener('click', completePhotoUpload);
  }

  // Delivery confirmation form handlers
  const deliveryScreenshotInput = $('#delivery-screenshot-input');
  if (deliveryScreenshotInput) {
    deliveryScreenshotInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleDeliveryScreenshot(file);
      }
    });
  }

  const deliveryConfirmBtn = $('#delivery-confirm-btn');
  if (deliveryConfirmBtn) {
    deliveryConfirmBtn.addEventListener('click', completeDeliveryConfirmation);
  }

  // Delist confirmation handlers
  const delistConfirmBtn = $('#delist-confirm-btn');
  if (delistConfirmBtn) {
    delistConfirmBtn.addEventListener('click', delistItem);
  }

  const delistCancelBtn = $('#delist-cancel-btn');
  if (delistCancelBtn) {
    delistCancelBtn.addEventListener('click', () => {
      const dialog = document.getElementById('delist-item-dialog');
      if (dialog) dialog.close();
    });
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

  // Photo progress indicator for needs_photo status
  let photoProgress = '';
  if (item.status === 'needs_photo' && item._photoStatus) {
    const { completeTypes, required } = item._photoStatus;
    const complete = completeTypes?.length || 0;
    photoProgress = `<span class="photo-progress-mini">${complete}/${required}</span>`;
  }

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
      // Use descriptive action labels instead of status names
      const actionLabels = {
        'unlisted': 'Add photos',
        'listed': 'Mark listed',
        'packaged': 'Mark packaged',
        'shipped': 'Ship item',
        'confirmed_received': 'Confirm delivery'
      };
      const label = actionLabels[nextStatus] || capitalize(nextStatus.replace('_', ' '));
      actionButton = `<button class="btn btn--sm status-next-btn" data-id="${item.id}" data-next-status="${nextStatus}">${label}</button>`;
    }
  }

  // Delist button - only for pre-sold pipeline statuses
  const delistableStatuses = ['needs_photo', 'unlisted', 'listed'];
  const delistButton = delistableStatuses.includes(item.status)
    ? `<button class="btn btn--sm btn--ghost delist-btn" data-id="${item.id}">Delist</button>`
    : '';

  return `
    <tr data-id="${item.id}">
      <td><a href="#" class="table-link" data-id="${item.id}">${escapeHtml(item.title || 'Untitled')}</a>${photoProgress}</td>
      <td data-label="Status"><span class="status status--${item.status}">${formatStatus(item.status)}</span></td>
      <td data-label="Cost">${formatCurrency(cost)}</td>
      <td data-label="Price">${price > 0 ? formatCurrency(price) : '-'}</td>
      <td data-label="Est. Return">${estReturnHtml}</td>
      <td data-label="Profit" class="${profitClass}">${item.status === 'sold' ? profitDisplay : '-'}</td>
      <td data-label="Platform">${platform}</td>
      <td class="table-actions">
        <div class="table-actions-inner">
          <button class="btn btn--sm edit-item-btn" data-id="${item.id}">Edit</button>
          ${actionButton}
          ${delistButton}
        </div>
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
    'shipped',
    'confirmed_received'
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
// LIST FOR SALE (with validation)
// =============================================================================

async function listItemForSale(itemId) {
  try {
    const item = await getInventoryItem(itemId);
    if (!item) {
      showToast('Item not found');
      return;
    }

    // Validate item before entering pipeline
    const validation = validatePipelineEntry(item);
    if (!validation.valid) {
      openValidationErrorModal(item, validation.errors);
      return;
    }

    // Enter pipeline at needs_photo status
    await updateInventoryItem(itemId, { status: 'needs_photo' });
    showToast('Item added to selling pipeline');
    await loadPipeline();
  } catch (err) {
    console.error('Failed to list item for sale:', err);
    showToast('Failed to list item for sale');
  }
}

// =============================================================================
// VALIDATION ERROR MODAL
// =============================================================================

const validationErrorModal = createLazyModal('#validation-error-dialog', {
  onOpen: (dialog, { item, errors }) => {
    const titleEl = dialog.querySelector('#validation-error-title');
    const listEl = dialog.querySelector('#validation-error-list');
    const editBtn = dialog.querySelector('#validation-edit-btn');

    if (titleEl) titleEl.textContent = item.title || 'Untitled';
    if (listEl) {
      listEl.innerHTML = errors.map(err => `<li>${escapeHtml(err)}</li>`).join('');
    }
    if (editBtn) {
      editBtn.dataset.id = item.id;
    }
  }
});

function openValidationErrorModal(item, errors) {
  validationErrorModal.open({ item, errors });
}

// =============================================================================
// PHOTO UPLOAD MODAL
// =============================================================================

let pendingPhotos = [];

const photoUploadModal = createLazyModal('#photo-upload-dialog', {
  onOpen: async (dialog, { item, attachments }) => {
    currentPhotoItem = item;
    pendingPhotos = [];

    const titleEl = dialog.querySelector('#photo-upload-title');
    const gridEl = dialog.querySelector('#photo-requirements-grid');
    const previewEl = dialog.querySelector('#photo-preview-grid');
    const completeBtn = dialog.querySelector('#photo-complete-btn');

    if (titleEl) titleEl.textContent = item.title || 'Untitled';

    // Determine required photo types
    const requiredTypes = [...REQUIRED_PHOTO_TYPES];
    if (item.flaws && item.flaws.length > 0) {
      requiredTypes.push('flaw');
    }

    // Check which types exist
    const existingTypes = new Set(attachments.filter(a => a.type).map(a => a.type));

    if (gridEl) {
      gridEl.innerHTML = requiredTypes.map(type => {
        const hasType = existingTypes.has(type);
        const icon = hasType ? '✓' : '✗';
        const className = hasType ? 'photo-req--complete' : 'photo-req--missing';
        return `<div class="photo-req ${className}" data-type="${type}">
          <span class="photo-req-icon">${icon}</span>
          <span class="photo-req-label">${capitalize(type)}</span>
        </div>`;
      }).join('');
    }

    if (previewEl) previewEl.innerHTML = '';
    updatePhotoCompleteBtn(completeBtn, requiredTypes, existingTypes);
  },
  onClose: () => {
    pendingPhotos = [];
    currentPhotoItem = null;
  }
});

async function openPhotoUploadModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  const attachments = await getAttachmentsByItem(itemId);

  // Check if photos are already complete
  const validation = validatePhotos(item, attachments);
  if (validation.valid) {
    // Photos already complete, just transition
    await updateItemStatus(itemId, 'unlisted');
    return;
  }

  // Use the centralized photo manager
  await openPhotoManager(itemId, {
    onComplete: async (status) => {
      if (status.complete) {
        // Transition to unlisted after photos complete
        await updateItemStatus(itemId, 'unlisted');
        showToast('Photos complete - item ready to list');
      }
      await loadPipeline();
    }
  });
}

function updatePhotoCompleteBtn(btn, requiredTypes, existingTypes) {
  if (!btn) return;
  const allComplete = requiredTypes.every(type => existingTypes.has(type));
  btn.disabled = !allComplete;
}

async function handlePhotoUpload(file, photoType) {
  if (!currentPhotoItem) return;

  try {
    // Compress image
    const compressedBlob = await compressImage(file);
    const filename = `${photoType}_${file.name}`;

    // Save attachment
    await createAttachment(
      currentPhotoItem.id,
      filename,
      compressedBlob,
      'image/jpeg',
      photoType
    );

    // Refresh modal
    const attachments = await getAttachmentsByItem(currentPhotoItem.id);
    const dialog = photoUploadModal.dialog;
    if (dialog) {
      photoUploadModal.close();
      photoUploadModal.open({ item: currentPhotoItem, attachments });
    }

    showToast(`${capitalize(photoType)} photo saved`);
  } catch (err) {
    console.error('Failed to upload photo:', err);
    showToast('Failed to save photo');
  }
}

async function completePhotoUpload() {
  if (!currentPhotoItem) return;

  try {
    await updateInventoryItem(currentPhotoItem.id, { status: 'unlisted' });
    showToast('Photos complete - item ready to list');
    photoUploadModal.close();
    await loadPipeline();
    currentPhotoItem = null;
  } catch (err) {
    console.error('Failed to complete photo upload:', err);
    showToast('Failed to update item');
  }
}

// Simple image compression
async function compressImage(file, maxWidth = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// =============================================================================
// PHOTO REQUIRED MODAL
// =============================================================================

const photoRequiredModal = createLazyModal('#photo-required-dialog', {
  onOpen: (dialog, { item, missing, onAddPhotos }) => {
    const titleEl = dialog.querySelector('#photo-required-title');
    const listEl = dialog.querySelector('#photo-required-list');
    const addBtn = dialog.querySelector('#photo-required-add');
    const cancelBtn = dialog.querySelector('#photo-required-cancel');

    if (titleEl) titleEl.textContent = item.title || 'Untitled';
    if (listEl) {
      listEl.innerHTML = missing.map(type => `<li>${capitalize(type)}</li>`).join('');
    }

    // Set up button handlers (clone to remove old listeners)
    if (addBtn) {
      const newAddBtn = addBtn.cloneNode(true);
      addBtn.parentNode.replaceChild(newAddBtn, addBtn);
      newAddBtn.addEventListener('click', () => {
        photoRequiredModal.close();
        if (onAddPhotos) onAddPhotos();
      });
    }

    if (cancelBtn) {
      const newCancelBtn = cancelBtn.cloneNode(true);
      cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
      newCancelBtn.addEventListener('click', () => {
        photoRequiredModal.close();
      });
    }
  }
});

function showPhotoRequiredModal(item, missing, onAddPhotos) {
  photoRequiredModal.open({ item, missing, onAddPhotos });
}

// =============================================================================
// MARK AS LISTED MODAL
// =============================================================================

const markAsListedModal = createLazyModal('#mark-listed-dialog', {
  onOpen: (dialog, { item }) => {
    currentListedItem = item;

    const itemIdInput = dialog.querySelector('#listed-item-id');
    const titleEl = dialog.querySelector('#listed-item-title');
    const dateInput = dialog.querySelector('#list-date');
    const platformSelect = dialog.querySelector('#list-platform');
    const priceInput = dialog.querySelector('#listed-price');
    const urlInput = dialog.querySelector('#listing-url');

    if (itemIdInput) itemIdInput.value = item.id;
    if (titleEl) titleEl.textContent = item.title || 'Untitled';
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    if (platformSelect) platformSelect.value = '';
    if (priceInput) priceInput.value = item.estimated_resale_value || '';
    if (urlInput) urlInput.value = '';
  },
  onClose: () => {
    currentListedItem = null;
  }
});

async function openMarkAsListedModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  // Validate photos before allowing listing
  const attachments = await getAttachmentsByItem(itemId);
  const photoValidation = validatePhotos(item, attachments);

  if (!photoValidation.valid) {
    // Show photo required modal
    showPhotoRequiredModal(item, photoValidation.missing, async () => {
      await openPhotoManager(itemId, {
        onComplete: async (status) => {
          if (status.complete) {
            // Re-attempt listing after photos complete
            await openMarkAsListedModal(itemId);
          }
        }
      });
    });
    return;
  }

  markAsListedModal.open({ item });
}

// =============================================================================
// CONFIRM DELIVERY MODAL
// =============================================================================

const confirmDeliveryModal = createLazyModal('#confirm-delivery-dialog', {
  onOpen: (dialog, { item }) => {
    currentDeliveryItem = item;
    pendingDeliveryScreenshot = null;

    const itemIdInput = dialog.querySelector('#delivery-item-id');
    const titleEl = dialog.querySelector('#delivery-item-title');
    const dateInput = dialog.querySelector('#received-date');
    const trackingLinkEl = dialog.querySelector('#tracking-link');
    const previewEl = dialog.querySelector('#delivery-screenshot-preview');
    const confirmBtn = dialog.querySelector('#delivery-confirm-btn');

    if (itemIdInput) itemIdInput.value = item.id;
    if (titleEl) titleEl.textContent = item.title || 'Untitled';
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

    // Generate tracking URL
    if (trackingLinkEl) {
      const url = getTrackingUrl(item.shipping_carrier, item.tracking_number);
      if (url) {
        trackingLinkEl.href = url;
        trackingLinkEl.textContent = `Track on ${capitalize(item.shipping_carrier || 'carrier')}`;
        show(trackingLinkEl);
      } else {
        hide(trackingLinkEl);
      }
    }

    if (previewEl) previewEl.innerHTML = '';
    if (confirmBtn) confirmBtn.disabled = true;
  },
  onClose: () => {
    currentDeliveryItem = null;
    pendingDeliveryScreenshot = null;
  }
});

async function openConfirmDeliveryModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  confirmDeliveryModal.open({ item });
}

function handleDeliveryScreenshot(file) {
  pendingDeliveryScreenshot = file;

  const previewEl = $('#delivery-screenshot-preview');
  const confirmBtn = $('#delivery-confirm-btn');

  if (previewEl && file) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.className = 'screenshot-preview';
    previewEl.innerHTML = '';
    previewEl.appendChild(img);
  }

  if (confirmBtn) {
    confirmBtn.disabled = !file;
  }
}

async function completeDeliveryConfirmation() {
  if (!currentDeliveryItem || !pendingDeliveryScreenshot) return;

  const receivedDate = $('#received-date')?.value;

  // Validate
  const validation = validateDeliveryConfirmation(
    { received_date: receivedDate },
    !!pendingDeliveryScreenshot
  );

  if (!validation.valid) {
    showToast(validation.errors[0]);
    return;
  }

  try {
    // Save screenshot as attachment
    const compressedBlob = await compressImage(pendingDeliveryScreenshot);
    await createAttachment(
      currentDeliveryItem.id,
      'delivery_confirmation.jpg',
      compressedBlob,
      'image/jpeg',
      'delivery_confirmation'
    );

    // Update item status
    await updateInventoryItem(currentDeliveryItem.id, {
      status: 'confirmed_received',
      received_date: receivedDate
    });

    showToast('Delivery confirmed');
    confirmDeliveryModal.close();
    await loadPipeline();
    currentDeliveryItem = null;
    pendingDeliveryScreenshot = null;
  } catch (err) {
    console.error('Failed to confirm delivery:', err);
    showToast('Failed to confirm delivery');
  }
}

// =============================================================================
// DELIST ITEM MODAL
// =============================================================================

let currentDelistItem = null;

const delistItemModal = createLazyModal('#delist-item-dialog', {
  onOpen: (dialog, { item }) => {
    currentDelistItem = item;

    const titleEl = dialog.querySelector('#delist-item-title');
    const warningEl = dialog.querySelector('#delist-listed-warning');
    const platformEl = dialog.querySelector('#delist-platform-name');

    if (titleEl) titleEl.textContent = item.title || 'Untitled';

    // Show warning if item is currently listed on a platform
    if (item.status === 'listed' && item.list_platform) {
      if (warningEl) warningEl.hidden = false;
      if (platformEl) platformEl.textContent = capitalize(item.list_platform.replace(/_/g, ' '));
    } else {
      if (warningEl) warningEl.hidden = true;
    }
  },
  onClose: () => {
    currentDelistItem = null;
  }
});

async function openDelistItemModal(itemId) {
  const item = await getInventoryItem(itemId);
  if (!item) {
    showToast('Item not found');
    return;
  }

  // Validate item can be delisted
  const delistableStatuses = ['needs_photo', 'unlisted', 'listed'];
  if (!delistableStatuses.includes(item.status)) {
    showToast('Item cannot be delisted from current status');
    return;
  }

  delistItemModal.open({ item });
}

async function delistItem() {
  if (!currentDelistItem) return;

  try {
    // Only update status - preserve all listing data
    await updateInventoryItem(currentDelistItem.id, {
      status: 'in_collection'
    });

    showToast('Item returned to collection');
    delistItemModal.close();
    await loadPipeline();
    currentDelistItem = null;
  } catch (err) {
    console.error('Failed to delist item:', err);
    showToast('Failed to return item to collection');
  }
}

export {
  openShipItemModal,
  listItemForSale,
  loadPipeline,
  nonPipelineData,
  openPhotoUploadModal,
  openMarkAsListedModal,
  openConfirmDeliveryModal,
  handlePhotoUpload,
  completePhotoUpload,
  handleDeliveryScreenshot,
  completeDeliveryConfirmation,
  openDelistItemModal,
  delistItem
};
