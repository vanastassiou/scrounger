// =============================================================================
// REFERENCES MODULE
// =============================================================================

import {
  $, $$, escapeHtml,
  createSortableTable, createFilterButtons, emptyStateRow, updateSortIndicators, createMobileSortDropdown
} from './utils.js';
import { createSubTabController } from './components.js';
import { showToast, createModalController } from './ui.js';
import {
  loadSeasonalData, getAllMonthsData, getCurrentMonthKey, getNextMonthKey, getSeasonalSources
} from './seasonal.js';
import {
  MATERIAL_TIER_MULTIPLIERS,
  CLOTHING_SIZE_TIERS,
  SHOE_SIZE_TIERS,
  JEWELRY_SIZE_RULES,
  PLATFORM_FIT_ADJUSTMENTS
} from './config.js';

let brandsData = [];
let platformsData = null;
let materialsData = null;
let filterTier = null;
let searchQuery = '';
let platformSearchQuery = '';
let sortColumn = 'name';
let sortDirection = 'asc';
let platformSortColumn = 'name';
let platformSortDirection = 'asc';
let materialTiersSortColumn = 'tier';
let materialTiersSortDirection = 'asc';
let platformFitSortColumn = 'platform';
let platformFitSortDirection = 'asc';
let currentView = 'stores';

// =============================================================================
// INITIALIZATION
// =============================================================================

export async function initReferences() {
  await Promise.all([loadBrands(), loadPlatforms()]);
  setupEventHandlers();
  setupSubTabs();
}

async function loadBrands() {
  try {
    // Load brand data from static JSON files
    const [clothingShoes, jewelry] = await Promise.all([
      fetch('/data/brands-clothing-shoes.json').then(r => r.json()),
      fetch('/data/brands-jewelry-hallmarks.json').then(r => r.json())
    ]);

    brandsData = [];

    // Process clothing brands
    processClothingBrands(clothingShoes.clothing_brands, 'clothing');

    // Process shoe brands
    processShoeBrands(clothingShoes.shoe_brands, 'shoes');

    // Process jewelry brands
    processJewelryBrands(jewelry);

    renderTable();
  } catch (err) {
    console.error('Failed to load brand references:', err);
  }
}

function processClothingBrands(clothingBrands, category) {
  // Tier S
  if (clothingBrands.tier_S?.brands) {
    Object.entries(clothingBrands.tier_S.brands).forEach(([key, brand]) => {
      brandsData.push({
        name: formatBrandName(key),
        key,
        tier: 'S',
        multiplier: brand.multiplier,
        notes: brand.notes || '',
        tips: brand.tips || '',
        alt: brand.alt || [],
        category
      });
    });
  }

  // Tier A
  if (clothingBrands.tier_A?.brands) {
    Object.entries(clothingBrands.tier_A.brands).forEach(([key, brand]) => {
      brandsData.push({
        name: formatBrandName(key),
        key,
        tier: 'A',
        multiplier: brand.multiplier,
        notes: brand.notes || '',
        tips: brand.tips || '',
        alt: brand.alt || [],
        category
      });
    });
  }

  // Tier B
  if (clothingBrands.tier_B?.brands) {
    Object.entries(clothingBrands.tier_B.brands).forEach(([key, brand]) => {
      brandsData.push({
        name: formatBrandName(key),
        key,
        tier: 'B',
        multiplier: brand.multiplier,
        notes: brand.notes || '',
        tips: brand.tips || '',
        alt: brand.alt || [],
        category
      });
    });
  }

  // Tier Vintage
  if (clothingBrands.tier_vintage?.brands) {
    Object.entries(clothingBrands.tier_vintage.brands).forEach(([key, brand]) => {
      brandsData.push({
        name: formatBrandName(key),
        key,
        tier: 'vintage',
        multiplier: brand.multiplier,
        notes: brand.notes || '',
        tips: brand.tips || '',
        era: brand.era || '',
        category
      });
    });
  }

  // Athletic/Streetwear
  if (clothingBrands.athletic_streetwear) {
    ['streetwear', 'vintage'].forEach(sub => {
      if (clothingBrands.athletic_streetwear[sub]) {
        Object.entries(clothingBrands.athletic_streetwear[sub]).forEach(([key, brand]) => {
          brandsData.push({
            name: formatBrandName(key),
            key,
            tier: sub === 'vintage' ? 'vintage' : 'A',
            multiplier: brand.multiplier,
            notes: brand.notes || '',
            tips: brand.tips || '',
            category
          });
        });
      }
    });
  }

  // Denim
  if (clothingBrands.denim) {
    ['contemporary', 'vintage_premium'].forEach(sub => {
      if (clothingBrands.denim[sub]) {
        Object.entries(clothingBrands.denim[sub]).forEach(([key, brand]) => {
          brandsData.push({
            name: formatBrandName(key),
            key,
            tier: sub === 'vintage_premium' ? 'vintage' : 'A',
            multiplier: brand.multiplier,
            notes: brand.notes || '',
            tips: brand.tips || '',
            category
          });
        });
      }
    });

    // Japanese selvedge - different structure (brands array with parent multiplier)
    const selvedge = clothingBrands.denim.japanese_selvedge;
    if (selvedge?.brands) {
      selvedge.brands.forEach(brandName => {
        brandsData.push({
          name: formatBrandName(brandName),
          key: brandName,
          tier: 'S',
          multiplier: selvedge.multiplier,
          notes: selvedge.authenticity_notes || '',
          tips: '',
          category
        });
      });
    }
  }
}

function processShoeBrands(shoeBrands, category) {
  // Tier S
  if (shoeBrands.tier_S?.brands) {
    Object.entries(shoeBrands.tier_S.brands).forEach(([key, brand]) => {
      brandsData.push({
        name: formatBrandName(key),
        key,
        tier: 'S',
        multiplier: brand.multiplier,
        notes: brand.notes || '',
        tips: brand.tips || brand.sig || '',
        category
      });
    });
  }

  // Tier A
  if (shoeBrands.tier_A?.brands) {
    Object.entries(shoeBrands.tier_A.brands).forEach(([key, brand]) => {
      brandsData.push({
        name: formatBrandName(key),
        key,
        tier: 'A',
        multiplier: brand.multiplier,
        notes: brand.notes || '',
        tips: brand.tips || '',
        category
      });
    });
  }

  // Vintage Collectible
  if (shoeBrands.vintage_collectible?.brands) {
    Object.entries(shoeBrands.vintage_collectible.brands).forEach(([key, brand]) => {
      brandsData.push({
        name: formatBrandName(key),
        key,
        tier: 'vintage',
        multiplier: brand.multiplier,
        notes: brand.notes || '',
        tips: brand.tips || '',
        era: brand.era || '',
        category
      });
    });
  }
}

function processJewelryBrands(jewelry) {
  const category = 'jewelry';

  // Fine jewelry houses
  if (jewelry.jewelry_brands?.fine_jewelry_houses?.brands) {
    Object.entries(jewelry.jewelry_brands.fine_jewelry_houses.brands).forEach(([key, brand]) => {
      brandsData.push({
        name: formatBrandName(key),
        key,
        tier: 'S',
        multiplier: brand.multiplier,
        notes: brand.notes || '',
        tips: brand.marks ? `Marks: ${brand.marks.join(', ')}` : '',
        category
      });
    });
  }

  // Designer fashion jewelry
  if (jewelry.jewelry_brands?.designer_fashion_jewelry?.brands) {
    Object.entries(jewelry.jewelry_brands.designer_fashion_jewelry.brands).forEach(([key, brand]) => {
      brandsData.push({
        name: formatBrandName(key),
        key,
        tier: 'A',
        multiplier: brand.multiplier,
        notes: brand.notes || '',
        tips: brand.marks ? `Marks: ${brand.marks.join(', ')}` : '',
        category
      });
    });
  }

  // Vintage costume collectible
  if (jewelry.jewelry_brands?.vintage_costume_collectible?.brands) {
    Object.entries(jewelry.jewelry_brands.vintage_costume_collectible.brands).forEach(([key, brand]) => {
      brandsData.push({
        name: formatBrandName(key),
        key,
        tier: 'vintage',
        multiplier: brand.multiplier,
        notes: brand.notes || '',
        tips: brand.marks ? `Marks: ${brand.marks.join(', ')}` : '',
        era: brand.era || '',
        category
      });
    });
  }
}

function formatBrandName(key) {
  // Convert snake_case to Title Case
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function setupEventHandlers() {
  // Tier filter buttons
  const tierBtns = $$('.filter-btn[data-tier]');
  tierBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tierBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterTier = btn.dataset.tier === 'all' ? null : btn.dataset.tier;
      renderTable();
    });
  });

  // Search input
  const searchInput = $('#brand-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      renderTable();
    });
  }

  // Table sorting
  const table = $('#references-table');
  if (table) {
    const sortConfig = {
      getState: () => ({ sortColumn, sortDirection }),
      setState: (s) => { sortColumn = s.sortColumn; sortDirection = s.sortDirection; },
      onSort: renderTable
    };
    const sortHandler = createSortableTable(sortConfig);
    createMobileSortDropdown(table, sortConfig);

    table.addEventListener('click', (e) => {
      sortHandler(e);
    });
  }

  // Platforms table sorting
  const platformsTable = $('#platforms-table');
  if (platformsTable) {
    const platformSortConfig = {
      getState: () => ({ sortColumn: platformSortColumn, sortDirection: platformSortDirection }),
      setState: (s) => { platformSortColumn = s.sortColumn; platformSortDirection = s.sortDirection; },
      onSort: renderPlatforms
    };
    const platformSortHandler = createSortableTable(platformSortConfig);
    createMobileSortDropdown(platformsTable, platformSortConfig);

    platformsTable.addEventListener('click', (e) => {
      platformSortHandler(e);
    });
  }

  // Add brand button
  const addBrandBtn = $('#add-brand-btn');
  if (addBrandBtn) {
    addBrandBtn.addEventListener('click', openAddBrandModal);
  }

  // Add platform button
  const addPlatformBtn = $('#add-platform-btn');
  if (addPlatformBtn) {
    addPlatformBtn.addEventListener('click', openAddPlatformModal);
  }

  // Brand form submission
  const brandForm = $('#brand-form');
  if (brandForm) {
    brandForm.addEventListener('submit', handleBrandSubmit);
  }

  // Platform form submission
  const platformForm = $('#platform-form');
  if (platformForm) {
    platformForm.addEventListener('submit', handlePlatformSubmit);
  }
}

// =============================================================================
// RENDERING
// =============================================================================

function renderTable() {
  const tbody = $('#references-table-body');
  if (!tbody) return;

  // Filter
  let filtered = brandsData.filter(brand => {
    if (filterTier && brand.tier.toLowerCase() !== filterTier.toLowerCase()) return false;
    if (searchQuery) {
      const searchable = `${brand.name} ${brand.notes} ${brand.tips} ${(brand.alt || []).join(' ')}`.toLowerCase();
      if (!searchable.includes(searchQuery)) return false;
    }
    return true;
  });

  // Sort
  filtered.sort((a, b) => {
    let cmp = 0;
    if (sortColumn === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (sortColumn === 'category') {
      cmp = a.category.localeCompare(b.category);
    } else if (sortColumn === 'tier') {
      const tierOrder = { S: 1, A: 2, B: 3, vintage: 4 };
      cmp = (tierOrder[a.tier] || 5) - (tierOrder[b.tier] || 5);
    } else if (sortColumn === 'multiplier') {
      cmp = (a.multiplier || 0) - (b.multiplier || 0);
    }
    return sortDirection === 'asc' ? cmp : -cmp;
  });

  // Render
  if (filtered.length === 0) {
    tbody.innerHTML = emptyStateRow({ colspan: 5, icon: 'R', message: 'No matching brands found' });
    updateCount(0, brandsData.length);
    return;
  }

  tbody.innerHTML = filtered.map(brand => {
    const tierClass = `tier-badge tier-badge--${brand.tier.toLowerCase()}`;
    const categoryLabel = brand.category.charAt(0).toUpperCase() + brand.category.slice(1);
    const altText = brand.alt?.length ? ` (${brand.alt.join(', ')})` : '';
    const multText = brand.multiplier != null ? `${brand.multiplier}x` : '';

    return `
      <tr class="brand-row" data-brand-key="${escapeHtml(brand.key)}">
        <td>
          <div class="brand-row__mobile">
            <span class="brand-row__name">${escapeHtml(brand.name)} <span class="brand-row__type">(${escapeHtml(categoryLabel)})</span></span>
            <div class="brand-row__meta">
              ${multText ? `<span class="brand-row__mult">${multText}</span>` : ''}
              <span class="${tierClass}">${escapeHtml(brand.tier)}</span>
            </div>
          </div>
          <div class="brand-row__desktop">
            ${escapeHtml(brand.name)}
            ${brand.alt?.length ? `<span class="brand-alt">(${escapeHtml(brand.alt.join(', '))})</span>` : ''}
          </div>
        </td>
        <td data-label="Type">${escapeHtml(categoryLabel)}</td>
        <td data-label="Tier"><span class="${tierClass}">${escapeHtml(brand.tier)}</span></td>
        <td data-label="Multiplier">${brand.multiplier != null ? brand.multiplier + 'x' : '-'}</td>
        <td data-label="Notes" class="brand-notes"></td>
      </tr>
    `;
  }).join('');

  // Update sort indicators
  const table = $('#references-table');
  if (table) updateSortIndicators(table, sortColumn, sortDirection);

  updateCount(filtered.length, brandsData.length);
}

function updateCount(filtered, total) {
  const countEl = $('#references-count');
  if (countEl) {
    countEl.textContent = filtered === total
      ? `${total} brands`
      : `${filtered} of ${total} brands`;
  }
}

// =============================================================================
// PLATFORMS
// =============================================================================

async function loadPlatforms() {
  try {
    const response = await fetch('/data/platforms.json');
    platformsData = await response.json();
    renderPlatforms();
  } catch (err) {
    console.error('Failed to load platforms:', err);
  }
}

function setupSubTabs() {
  createSubTabController({
    tabSelector: '.sub-tab[data-ref-view]',
    dataAttr: 'refView',
    views: {
      stores: '#ref-stores-view',
      brands: '#ref-brands-view',
      platforms: '#ref-platforms-view',
      trends: '#ref-trends-view',
      pricing: '#ref-pricing-view'
    },
    storageKey: 'referencesSubTab',
    htmlDataAttr: 'refSub',
    defaultView: 'stores',
    onActivate: (view) => {
      currentView = view;
      if (view === 'trends') {
        renderTrendsView();
      }
      if (view === 'pricing') {
        renderPricingView();
      }
    }
  });

  // Platform search
  const platformSearch = $('#platform-search');
  if (platformSearch) {
    platformSearch.addEventListener('input', (e) => {
      platformSearchQuery = e.target.value.toLowerCase();
      renderPlatforms();
    });
  }
}

function renderPlatforms() {
  const tbody = $('#platforms-tbody');
  const countEl = $('#platforms-count');
  if (!tbody || !platformsData) return;

  const platforms = platformsData.platforms;

  // Filter platforms by search
  let platformEntries = Object.entries(platforms);
  if (platformSearchQuery) {
    platformEntries = platformEntries.filter(([key, p]) => {
      const searchable = `${p.name} ${p.audience || ''} ${(p.best_for || []).join(' ')} ${p.notes || ''}`.toLowerCase();
      return searchable.includes(platformSearchQuery);
    });
  }

  // Sort platforms
  platformEntries.sort(([keyA, a], [keyB, b]) => {
    let cmp = 0;
    if (platformSortColumn === 'name') {
      cmp = a.name.localeCompare(b.name);
    } else if (platformSortColumn === 'demographic') {
      cmp = (a.audience || '').localeCompare(b.audience || '');
    } else if (platformSortColumn === 'fees') {
      cmp = getFeesNumeric(a.fees) - getFeesNumeric(b.fees);
    }
    return platformSortDirection === 'asc' ? cmp : -cmp;
  });

  if (platformEntries.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">P</div><p>No matching platforms</p></td></tr>';
    if (countEl) countEl.textContent = '';
    return;
  }

  const rows = platformEntries.map(([key, p]) => renderPlatformRow(key, p)).join('');
  tbody.innerHTML = rows;

  // Update sort indicators
  const table = $('#platforms-table');
  if (table) updateSortIndicators(table, platformSortColumn, platformSortDirection);

  if (countEl) {
    countEl.textContent = `${platformEntries.length} platform${platformEntries.length === 1 ? '' : 's'}`;
  }
}

function renderPlatformRow(key, p) {
  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
  const formatList = (items) => {
    if (!items || items.length === 0) return '-';
    return `<ul class="compact-list">${items.map(item => `<li>${escapeHtml(capitalize(item))}</li>`).join('')}</ul>`;
  };

  // Truncate lists for conciseness
  const bestFor = (p.best_for || []).slice(0, 3).map(t => formatTagName(t));
  const demographics = p.audience ? p.audience.split(',').slice(0, 2).map(s => s.trim()) : [];
  const pros = (p.pros || []).slice(0, 2);
  const cons = (p.cons || []).slice(0, 2);

  const nameHtml = p.url
    ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>`
    : escapeHtml(p.name);

  // Detailed fees breakdown
  const feesHtml = formatFeesDetailed(p.fees, p.fee_summary);
  const shippingHtml = formatShipping(p.fees?.shipping);

  return `
    <tr data-platform="${escapeHtml(key)}" data-fees="${getFeesNumeric(p.fees)}">
      <td>${nameHtml}</td>
      <td data-label="Audience">${formatList(demographics)}</td>
      <td data-label="Best For">${formatList(bestFor)}</td>
      <td data-label="Fees">${feesHtml}</td>
      <td data-label="Shipping">${shippingHtml}</td>
      <td data-label="Pros">${formatList(pros)}</td>
      <td data-label="Cons">${formatList(cons)}</td>
    </tr>
  `;
}

function formatFeesDetailed(fees, feeSummary) {
  // Use fee_summary if available (cleaner human-readable format)
  if (feeSummary) {
    return `<ul class="compact-list">
      <li><strong>Listing:</strong> ${escapeHtml(feeSummary.listing_fee)}</li>
      <li><strong>Sale cut:</strong> ${escapeHtml(feeSummary.sale_cut)}</li>
      <li><strong>Total:</strong> ${escapeHtml(feeSummary.total)}</li>
    </ul>`;
  }

  // Fallback to parsing fees object if no summary
  if (!fees) return 'Unknown';

  const parts = [];
  let hasListingFee = false;
  let listingFeeAmount = 0;

  // Commission tiers
  if (fees.commission_tiers) {
    const tiers = fees.commission_tiers;
    if (tiers[0]?.seller_payout_percentage !== undefined) {
      // TheRealReal-style: show fees at each tier (what TRR takes)
      tiers.forEach(t => {
        const rangeStart = t.range_usd[0];
        const rangeEnd = t.range_usd[1];
        const range = rangeEnd ? `$${rangeStart}-$${rangeEnd}` : `$${rangeStart}+`;
        const fee = 100 - t.seller_payout_percentage;
        parts.push(`${range}: ${fee}%`);
      });
      parts.push('(USD pricing)');
    } else if (tiers[0]?.range_cad) {
      // Vestiaire-style: tiered by price range
      tiers.forEach(t => {
        const rangeStart = t.range_cad[0];
        const rangeEnd = t.range_cad[1];
        const range = rangeEnd ? `$${rangeStart}-$${rangeEnd}` : `$${rangeStart}+`;
        if (t.fee_type === 'flat') {
          parts.push(`${range}: $${t.amount_cad} flat`);
        } else {
          parts.push(`${range}: ${t.amount}%`);
        }
      });
    } else if (tiers[0]?.threshold_cad !== undefined) {
      // Poshmark/Starluv-style: threshold-based
      const flatTier = tiers.find(t => t.fee_type === 'flat');
      const pctTier = tiers.find(t => t.fee_type === 'percentage');
      if (flatTier) {
        parts.push(`Under $${flatTier.threshold_cad}: $${flatTier.amount_cad} flat`);
      }
      if (pctTier) {
        parts.push(`$${flatTier?.threshold_cad || 0}+: ${pctTier.amount}%`);
      }
    } else if (tiers[0]?.category) {
      // eBay category-based
      const defaultTier = tiers.find(t => t.category === 'most_categories');
      if (defaultTier) {
        parts.push(`${defaultTier.amount}% final value fee`);
      }
    }
  } else if (fees.commission !== undefined) {
    if (fees.commission === 0) {
      parts.push('No commission');
    } else {
      parts.push(`${fees.commission}% commission`);
    }
  }

  // Payment processing
  if (fees.payment_processing && typeof fees.payment_processing === 'object') {
    const pp = fees.payment_processing;
    if (pp.percentage) {
      let paymentText = `${pp.percentage}%`;
      if (pp.flat_fee_cad) {
        paymentText += ` + $${pp.flat_fee_cad}`;
      }
      parts.push(`Payment: ${paymentText}`);
    } else if (pp.range_percentage) {
      const midRate = (pp.range_percentage[0] + pp.range_percentage[1]) / 2;
      parts.push(`Payment: ~${midRate.toFixed(1)}%`);
    }
  }

  // Listing fee
  if (fees.listing_fee) {
    if (fees.listing_fee.per_listing_cad) {
      hasListingFee = true;
      listingFeeAmount = fees.listing_fee.per_listing_cad;
      const duration = fees.listing_fee.duration_months ? ` (renews ${fees.listing_fee.duration_months} mo)` : '';
      parts.push(`Listing fee: $${listingFeeAmount}${duration}`);
    } else if (fees.listing_fee.free_listings_per_month) {
      parts.push(`${fees.listing_fee.free_listings_per_month} free listings/mo`);
    }
  }

  // Total fees estimate when there are multiple fee types
  const hasPaymentProcessing = fees.payment_processing && typeof fees.payment_processing === 'object';
  if (hasListingFee || (fees.commission !== undefined && hasPaymentProcessing)) {
    const totalPercent = estimateTotalFee(fees);
    if (totalPercent > 0) {
      const listingNote = hasListingFee ? ` + $${listingFeeAmount}` : '';
      parts.push(`Total: ~${totalPercent}%${listingNote}`);
    }
  }

  if (parts.length === 0) return 'See details';
  return `<ul class="compact-list">${parts.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`;
}

function formatShipping(shipping) {
  if (!shipping) return '-';

  if (shipping.type === 'prepaid_label' && shipping.cost_cad) {
    const parts = [`$${shipping.cost_cad} flat label`, 'Buyer pays'];
    if (shipping.weight_limit_lbs) parts.push(`Up to ${shipping.weight_limit_lbs} lbs`);
    return `<ul class="compact-list">${parts.map(p => `<li>${p}</li>`).join('')}</ul>`;
  } else if (shipping.type === 'prepaid_label_variable') {
    return `<ul class="compact-list"><li>Label provided</li><li>Buyer pays actual cost</li></ul>`;
  } else if (shipping.type === 'consignment') {
    return '<ul class="compact-list"><li>Free kit provided</li></ul>';
  } else if (shipping.type === 'seller_arranged') {
    const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
    if (shipping.notes) {
      const parts = shipping.notes.split(';').map(s => s.trim()).filter(Boolean);
      return `<ul class="compact-list">${parts.map(p => `<li>${escapeHtml(capitalize(p))}</li>`).join('')}</ul>`;
    }
    return '<ul class="compact-list"><li>You arrange shipping</li></ul>';
  } else if (shipping.type === 'seller_ships_to_authentication') {
    return '<ul class="compact-list"><li>Ship to auth center</li></ul>';
  }
  return '-';
}

function getFeesNumeric(fees) {
  // Return a numeric value for sorting
  if (!fees) return 999;
  if (fees.commission !== undefined) return fees.commission;
  if (fees.commission_tiers) {
    const tier = fees.commission_tiers.find(t => t.fee_type === 'percentage');
    if (tier) return tier.amount;
    const payout = fees.commission_tiers.find(t => t.seller_payout_percentage !== undefined);
    if (payout) return 100 - payout.seller_payout_percentage;
  }
  return 50;
}

function estimateTotalFee(fees) {
  let total = 0;
  if (fees.commission !== undefined) {
    total += fees.commission;
  } else if (fees.commission_tiers) {
    const tier = fees.commission_tiers.find(t => t.fee_type === 'percentage');
    if (tier) total += tier.amount;
  }
  if (fees.payment_processing && typeof fees.payment_processing === 'object') {
    total += fees.payment_processing.percentage || 0;
  }
  return Math.round(total * 10) / 10;
}

function renderPlatformCard(key, p) {
  const feesSummary = formatFeesSummary(p.fees);
  const badge = getPlatformBadge(p);
  const bestForTags = (p.best_for || []).slice(0, 4).map(tag =>
    `<span class="platform-card__tag">${escapeHtml(formatTagName(tag))}</span>`
  ).join('');

  const prosHtml = (p.pros || []).slice(0, 3).map(pro =>
    `<li>${escapeHtml(pro)}</li>`
  ).join('');

  const consHtml = (p.cons || []).slice(0, 3).map(con =>
    `<li>${escapeHtml(con)}</li>`
  ).join('');

  const urlHtml = p.url
    ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>`
    : escapeHtml(p.name);

  return `
    <div class="platform-card" data-platform="${escapeHtml(key)}">
      <div class="platform-card__header">
        <div class="platform-card__name">${urlHtml}</div>
        ${badge}
      </div>

      <div class="platform-card__fees">
        <div class="platform-card__fees-label">Fees</div>
        <div class="platform-card__fees-main">${feesSummary.main}</div>
        ${feesSummary.detail ? `<div class="platform-card__fees-detail">${feesSummary.detail}</div>` : ''}
      </div>

      ${p.audience ? `<div class="platform-card__audience">${escapeHtml(p.audience)}</div>` : ''}

      ${bestForTags ? `<div class="platform-card__best-for">${bestForTags}</div>` : ''}

      <div class="platform-card__pros-cons">
        <div class="platform-card__pros">
          <h4>Pros</h4>
          <ul>${prosHtml}</ul>
        </div>
        <div class="platform-card__cons">
          <h4>Cons</h4>
          <ul>${consHtml}</ul>
        </div>
      </div>

      ${p.notes ? `<div class="platform-card__notes">${escapeHtml(p.notes)}</div>` : ''}
    </div>
  `;
}

function formatFeesSummary(fees) {
  if (!fees) return { main: 'Unknown', detail: '' };

  // Check for free platforms
  if (fees.commission === 0 && fees.payment_processing === 0) {
    return { main: 'Free', detail: 'No fees for local sales' };
  }

  let main = '';
  let detail = '';

  // Handle commission tiers
  if (fees.commission_tiers) {
    const tiers = fees.commission_tiers;
    if (tiers[0]?.fee_type === 'flat' && tiers[1]?.fee_type === 'percentage') {
      // Poshmark-style: flat fee under threshold, percentage above
      main = `$${tiers[0].amount_cad} or ${tiers[1].amount}%`;
      detail = `$${tiers[0].amount_cad} for sales under $${tiers[0].threshold_cad}, ${tiers[1].amount}% above`;
    } else if (tiers[0]?.seller_payout_percentage !== undefined) {
      // TheRealReal-style: seller gets percentage
      const minPayout = Math.min(...tiers.map(t => t.seller_payout_percentage));
      const maxPayout = Math.max(...tiers.map(t => t.seller_payout_percentage));
      main = `${100 - maxPayout}% - ${100 - minPayout}% commission`;
      detail = `You keep ${minPayout}-${maxPayout}% depending on sale price`;
    } else if (tiers[0]?.range_cad) {
      // Vestiaire-style: tiered by price range
      const mainTier = tiers.find(t => t.fee_type === 'percentage');
      main = mainTier ? `${mainTier.amount}%` : 'Tiered';
      detail = tiers.map(t => {
        if (t.fee_type === 'flat') {
          if (t.range_cad[0] === 0) return `$${t.amount_cad} for sales under $${t.range_cad[1]}`;
          return `$${t.amount_cad} for sales over $${t.range_cad[0]}`;
        }
        return `${t.amount}% for $${t.range_cad[0]}-$${t.range_cad[1]}`;
      }).join('; ');
    } else if (tiers[0]?.store_takes_percentage) {
      // Consignment-style
      main = `${tiers[0].store_takes_percentage}% to store`;
      detail = 'Commission varies by store';
    }
  } else if (fees.commission !== undefined) {
    main = fees.commission === 0 ? 'Free' : `${fees.commission}%`;
  }

  // Add payment processing info
  if (fees.payment_processing && typeof fees.payment_processing === 'object') {
    const pp = fees.payment_processing;
    if (pp.percentage) {
      const ppText = pp.flat_fee_cad
        ? `${pp.percentage}% + $${pp.flat_fee_cad}`
        : `${pp.percentage}%`;
      detail = detail ? `${detail}. Payment: +${ppText}` : `Payment processing: +${ppText}`;
    }
  } else if (fees.payment_processing && typeof fees.payment_processing === 'string') {
    if (fees.payment_processing !== 'included' && fees.payment_processing !== 'included_in_final_value') {
      detail = detail ? `${detail}. ${fees.payment_processing}` : fees.payment_processing;
    }
  }

  // Shipping info
  if (fees.shipping?.type === 'prepaid_label' && fees.shipping.cost_cad) {
    detail = detail ? `${detail}. Shipping: $${fees.shipping.cost_cad} prepaid` : `Prepaid shipping: $${fees.shipping.cost_cad}`;
  }

  return { main: main || 'See details', detail };
}

function getPlatformBadge(p) {
  // Free platforms
  if (p.fees?.commission === 0) {
    return '<span class="platform-card__badge platform-card__badge--free">Free</span>';
  }

  // Luxury platforms
  if (p.best_for?.includes('luxury') || p.best_for?.includes('designer')) {
    return '<span class="platform-card__badge platform-card__badge--luxury">Luxury</span>';
  }

  // Low fee platforms (under 10%)
  const commission = p.fees?.commission;
  if (commission && commission < 10) {
    return '<span class="platform-card__badge platform-card__badge--low">Low Fee</span>';
  }

  return '';
}

function formatTagName(tag) {
  return tag.replace(/_/g, ' ');
}

function getPlatformName(key) {
  return platformsData?.platforms?.[key]?.name || key;
}

// =============================================================================
// TRENDS VIEW
// =============================================================================

let trendsLoaded = false;

async function renderTrendsView() {
  const tbody = $('#trends-tbody');
  const sourcesContainer = $('#trends-sources');
  if (!tbody) return;

  // Load seasonal data if not already loaded
  if (!trendsLoaded) {
    await loadSeasonalData();
    trendsLoaded = true;
  }

  const months = getAllMonthsData();
  if (!months || months.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><div class="empty-icon">T</div><p>Unable to load seasonal data</p></td></tr>';
    return;
  }

  const currentMonth = getCurrentMonthKey();
  const nextMonth = getNextMonthKey();

  tbody.innerHTML = months.map(month =>
    renderTrendsRow(month, currentMonth, nextMonth)
  ).join('');

  // Render sources separately
  if (sourcesContainer) {
    const sources = getSeasonalSources();
    sourcesContainer.innerHTML = renderTrendsSources(sources);
  }
}

function renderTrendsRow(month, currentMonth, nextMonth) {
  const isCurrent = month.key === currentMonth;
  const isNext = month.key === nextMonth;
  const rowClass = isCurrent ? 'trends-row--current' : isNext ? 'trends-row--next' : '';

  // Themes (bullet list)
  const themesHtml = (month.themes || []).length > 0
    ? `<ul class="compact-list">${month.themes.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`
    : '-';

  // Colors: collect from colour_trends and hot_categories
  const hotColors = month.colour_trends?.hot || [];
  const emergingColors = month.colour_trends?.emerging || [];
  const categoryColors = (month.hot_categories || []).flatMap(cat => cat.colours || []);
  const allColors = [...new Set([...hotColors, ...categoryColors])];

  let colorsHtml = '-';
  const colorParts = [];
  if (allColors.length > 0) {
    colorParts.push(...allColors.slice(0, 6).map(c => `<li>${escapeHtml(formatTagName(c))}</li>`));
  }
  if (emergingColors.length > 0) {
    colorParts.push(...emergingColors.slice(0, 3).map(c => `<li><em>${escapeHtml(formatTagName(c))}</em> (emerging)</li>`));
  }
  if (colorParts.length > 0) {
    colorsHtml = `<ul class="compact-list">${colorParts.join('')}</ul>`;
  }

  // Cuts & Styles: collect from hot_categories and trending_aesthetics
  const cuts = [];
  const styles = [];
  (month.hot_categories || []).forEach(cat => {
    cuts.push(...(cat.cuts || []));
    styles.push(...(cat.styles || []));
  });
  const uniqueCuts = [...new Set(cuts)].slice(0, 5);
  const uniqueStyles = [...new Set(styles)].slice(0, 5);
  const trendingAesthetics = (month.trending_aesthetics || []).slice(0, 3);

  let cutsStylesHtml = '-';
  const cutsStylesParts = [];
  if (uniqueCuts.length > 0) {
    cutsStylesParts.push(`<li><strong>Cuts:</strong> ${uniqueCuts.map(c => escapeHtml(formatTagName(c))).join(', ')}</li>`);
  }
  if (trendingAesthetics.length > 0) {
    cutsStylesParts.push(`<li><strong>Aesthetics:</strong> ${trendingAesthetics.map(s => escapeHtml(formatTagName(s))).join(', ')}</li>`);
  } else if (uniqueStyles.length > 0) {
    cutsStylesParts.push(`<li><strong>Styles:</strong> ${uniqueStyles.map(s => escapeHtml(formatTagName(s))).join(', ')}</li>`);
  }
  if (cutsStylesParts.length > 0) {
    cutsStylesHtml = `<ul class="compact-list">${cutsStylesParts.join('')}</ul>`;
  }

  // Platform tips (bullet list)
  const platformNotes = month.platform_notes || {};
  const platformEntries = Object.entries(platformNotes);
  const platformsHtml = platformEntries.length > 0
    ? `<ul class="compact-list">${platformEntries.map(([platform, tip]) => `<li><strong>${escapeHtml(getPlatformName(platform))}:</strong> ${escapeHtml(tip)}</li>`).join('')}</ul>`
    : '-';

  return `
    <tr class="${rowClass}">
      <td>${escapeHtml(month.label)}</td>
      <td data-label="Themes">${themesHtml}</td>
      <td data-label="Colors">${colorsHtml}</td>
      <td data-label="Cuts & Styles">${cutsStylesHtml}</td>
      <td data-label="Platforms">${platformsHtml}</td>
    </tr>
  `;
}

function renderTrendsSources(sources) {
  if (!sources?.citations?.length) return '';

  const citationsHtml = sources.citations.map(citation => {
    const articlePart = citation.article_date ? `article dated ${citation.article_date}, ` : '';
    const meta = `(${escapeHtml(citation.source)}, ${articlePart}accessed ${citation.accessed_date})`;
    return `
    <li class="trends-sources__item">
      <a href="${escapeHtml(citation.url)}" target="_blank" rel="noopener">${escapeHtml(citation.name)}</a> ${meta}
    </li>`;
  }).join('');

  return `
    <details class="trends-sources">
      <summary class="trends-sources__header">Sources</summary>
      <ul class="trends-sources__list">
        ${citationsHtml}
      </ul>
    </details>
  `;
}

// =============================================================================
// PRICING VIEW
// =============================================================================

let pricingLoaded = false;

async function renderPricingView() {
  if (pricingLoaded) return;

  // Load materials data if not already loaded
  if (!materialsData) {
    try {
      const response = await fetch('/data/materials.json');
      materialsData = await response.json();
    } catch (err) {
      console.error('Failed to load materials:', err);
    }
  }

  renderMaterialTiersTable();
  renderSizeMultipliersGrid();
  renderPlatformFitTable();
  setupPricingTableSorting();

  pricingLoaded = true;
}

function setupPricingTableSorting() {
  // Material tiers table sorting
  const materialTable = $('#material-tiers-table');
  if (materialTable) {
    const sortHandler = createSortableTable({
      getState: () => ({ sortColumn: materialTiersSortColumn, sortDirection: materialTiersSortDirection }),
      setState: (s) => { materialTiersSortColumn = s.sortColumn; materialTiersSortDirection = s.sortDirection; },
      onSort: renderMaterialTiersTable
    });
    materialTable.addEventListener('click', sortHandler);
  }

  // Platform fit table sorting
  const platformFitTable = $('#platform-fit-table');
  if (platformFitTable) {
    const sortHandler = createSortableTable({
      getState: () => ({ sortColumn: platformFitSortColumn, sortDirection: platformFitSortDirection }),
      setState: (s) => { platformFitSortColumn = s.sortColumn; platformFitSortDirection = s.sortDirection; },
      onSort: renderPlatformFitTable
    });
    platformFitTable.addEventListener('click', sortHandler);
  }
}

function renderMaterialTiersTable() {
  const tbody = $('#material-tiers-tbody');
  if (!tbody) return;

  // Build comprehensive material lists from materials.json
  const tierMaterials = buildMaterialsByTier();

  // Build rows data for sorting
  const tierOrder = { highest: 1, high: 2, 'medium-high': 3, medium: 4, 'low-medium': 5, low: 6, avoid: 7 };
  let rowsData = Object.entries(MATERIAL_TIER_MULTIPLIERS).map(([tier, mult]) => ({
    tier,
    mult,
    materials: tierMaterials[tier] || { clothing: [], shoes: [], jewelry: [] }
  }));

  // Sort based on current sort column
  rowsData.sort((a, b) => {
    let cmp = 0;
    if (materialTiersSortColumn === 'tier') {
      cmp = (tierOrder[a.tier] || 99) - (tierOrder[b.tier] || 99);
    } else if (materialTiersSortColumn === 'mult') {
      cmp = a.mult - b.mult;
    }
    return materialTiersSortDirection === 'asc' ? cmp : -cmp;
  });

  const rows = rowsData.map(({ tier, mult, materials }) => {
    const pctChange = Math.round((mult - 1) * 100);
    const pctClass = pctChange > 0 ? 'text-success' : pctChange < 0 ? 'text-danger' : '';
    const pctDisplay = pctChange > 0 ? `+${pctChange}%` : `${pctChange}%`;
    const materialsHtml = formatMaterialsByCategory(materials);

    return `
      <tr>
        <td>${escapeHtml(formatTierName(tier))}</td>
        <td class="col-numeric ${pctClass}">${mult.toFixed(2)}x <span class="text-muted">(${pctDisplay})</span></td>
        <td>${materialsHtml}</td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rows;

  // Update sort indicators
  const table = $('#material-tiers-table');
  if (table) updateSortIndicators(table, materialTiersSortColumn, materialTiersSortDirection);
}

function formatMaterialsByCategory(materials) {
  const categories = [
    { key: 'clothing', label: 'Clothing' },
    { key: 'shoes', label: 'Shoes' },
    { key: 'jewelry', label: 'Jewelry' }
  ];

  const items = categories
    .filter(cat => materials[cat.key]?.length > 0)
    .map(cat => `<li><strong>${cat.label}:</strong> ${escapeHtml(materials[cat.key].join(', '))}</li>`);

  if (items.length === 0) return '<span class="text-muted">—</span>';
  return `<ul class="compact-list">${items.join('')}</ul>`;
}

function buildMaterialsByTier() {
  const createTierEntry = () => ({ clothing: [], shoes: [], jewelry: [] });
  const tierMaterials = {
    highest: createTierEntry(),
    high: createTierEntry(),
    'medium-high': createTierEntry(),
    medium: createTierEntry(),
    'low-medium': createTierEntry(),
    low: createTierEntry(),
    avoid: createTierEntry()
  };

  if (!materialsData) return tierMaterials;

  // Helper to add material to tier
  const addMaterial = (tier, category, name) => {
    if (tierMaterials[tier]) tierMaterials[tier][category].push(name);
  };

  // Process fabrics → clothing
  if (materialsData.fabrics) {
    const fabricSections = ['premium_natural', 'quality_synthetics_vintage', 'avoid_unless_designer'];
    fabricSections.forEach(section => {
      if (materialsData.fabrics[section]?.materials) {
        Object.entries(materialsData.fabrics[section].materials).forEach(([key, mat]) => {
          addMaterial(mat.value_tier, 'clothing', formatMaterialName(key));
        });
      }
    });
  }

  // Process leathers → shoes
  if (materialsData.leathers) {
    const leatherSections = ['premium_leathers', 'mid_tier_leathers', 'low_quality_avoid'];
    leatherSections.forEach(section => {
      if (materialsData.leathers[section]) {
        Object.entries(materialsData.leathers[section]).forEach(([key, mat]) => {
          if (mat.value_tier) {
            addMaterial(mat.value_tier, 'shoes', formatMaterialName(key));
          }
        });
      }
    });
  }

  // Process gemstones → jewelry
  if (materialsData.gemstones) {
    const gemstoneSections = ['precious_stones', 'semi_precious_valuable', 'vintage_costume_stones'];
    gemstoneSections.forEach(section => {
      if (materialsData.gemstones[section]) {
        Object.entries(materialsData.gemstones[section]).forEach(([key, mat]) => {
          if (mat.value_tier) {
            addMaterial(mat.value_tier, 'jewelry', formatMaterialName(key));
          }
        });
      }
    });
  }

  // Process metals → jewelry
  if (materialsData.metals_jewelry) {
    const metalSections = ['precious_metals', 'gold_alternatives', 'base_metals'];
    metalSections.forEach(section => {
      if (materialsData.metals_jewelry[section]) {
        Object.entries(materialsData.metals_jewelry[section]).forEach(([key, mat]) => {
          const tier = mat.value_tier;
          if (tier === 'very_low') {
            addMaterial('avoid', 'jewelry', formatMaterialName(key));
          } else if (tier) {
            addMaterial(tier, 'jewelry', formatMaterialName(key));
          }
        });
      }
    });
  }

  return tierMaterials;
}

function formatMaterialName(key) {
  // Convert snake_case to readable format
  return key
    .replace(/_/g, ' ')
    .replace(/\b(pu|pvc)\b/gi, match => match.toUpperCase());
}

function renderSizeMultipliersGrid() {
  const container = $('#size-tables-grid');
  if (!container) return;

  const clothingTable = renderSizeCategoryTable('Clothing', CLOTHING_SIZE_TIERS, 'sizes');
  const shoesTable = renderShoeSizeTable();
  const jewelryTable = renderJewelrySizeTable();

  container.innerHTML = clothingTable + shoesTable + jewelryTable;
}

function renderSizeCategoryTable(title, tiers, sizesKey) {
  const rows = Object.entries(tiers).map(([tierName, config]) => {
    const pctChange = Math.round((config.multiplier - 1) * 100);
    const pctClass = pctChange > 0 ? 'text-success' : pctChange < 0 ? 'text-danger' : '';
    const pctDisplay = pctChange > 0 ? `+${pctChange}%` : `${pctChange}%`;
    const sizesText = config[sizesKey]?.join(', ') || '';

    return `
      <tr>
        <td>${escapeHtml(formatTierName(tierName))}</td>
        <td class="col-numeric ${pctClass}">${pctDisplay}</td>
        <td class="text-muted">${escapeHtml(sizesText)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="size-table-card">
      <h4>${escapeHtml(title)}</h4>
      <div class="table-container">
        <table class="table table--compact">
          <thead>
            <tr>
              <th>Tier</th>
              <th class="col-numeric">Adj.</th>
              <th>Sizes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderShoeSizeTable() {
  const { premium, standard, narrow_market } = SHOE_SIZE_TIERS;

  const rows = [
    { name: 'Premium', mult: premium.multiplier, detail: `Sizes ${premium.minSize}-${premium.maxSize}, ${premium.widths.join('/')} width` },
    { name: 'Standard', mult: standard.multiplier, detail: `Sizes ${standard.minSize}-${standard.maxSize}` },
    { name: 'Narrow Market', mult: narrow_market.multiplier, detail: 'Outside common range, narrow/extra-wide' }
  ].map(row => {
    const pctChange = Math.round((row.mult - 1) * 100);
    const pctClass = pctChange > 0 ? 'text-success' : pctChange < 0 ? 'text-danger' : '';
    const pctDisplay = pctChange > 0 ? `+${pctChange}%` : `${pctChange}%`;

    return `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td class="col-numeric ${pctClass}">${pctDisplay}</td>
        <td class="text-muted">${escapeHtml(row.detail)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="size-table-card">
      <h4>Shoes</h4>
      <div class="table-container">
        <table class="table table--compact">
          <thead>
            <tr>
              <th>Tier</th>
              <th class="col-numeric">Adj.</th>
              <th>Criteria</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderJewelrySizeTable() {
  const rules = JEWELRY_SIZE_RULES;

  const formatClosure = s => s.replace(/_/g, ' ');
  const rows = [
    { name: 'Adjustable', mult: rules.adjustable.multiplier, detail: `${rules.adjustable.closures.map(formatClosure).join(', ')} closures` },
    { name: 'Ring Premium', mult: rules.ring_premium.multiplier, detail: `Sizes ${rules.ring_premium.sizes.join(', ')}` },
    { name: 'Ring Standard', mult: rules.ring_standard.multiplier, detail: `Sizes ${rules.ring_standard.sizes.join(', ')}` },
    { name: 'Ring Narrow', mult: rules.ring_narrow.multiplier, detail: 'Outlier sizes (<5, >10)' },
    { name: 'Necklace Premium', mult: rules.necklace_premium.multiplier, detail: `${rules.necklace_premium.lengths.join(', ')}" chains` }
  ].map(row => {
    const pctChange = Math.round((row.mult - 1) * 100);
    const pctClass = pctChange > 0 ? 'text-success' : pctChange < 0 ? 'text-danger' : '';
    const pctDisplay = pctChange > 0 ? `+${pctChange}%` : `${pctChange}%`;

    return `
      <tr>
        <td>${escapeHtml(row.name)}</td>
        <td class="col-numeric ${pctClass}">${pctDisplay}</td>
        <td class="text-muted">${escapeHtml(row.detail)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="size-table-card">
      <h4>Jewelry</h4>
      <div class="table-container">
        <table class="table table--compact">
          <thead>
            <tr>
              <th>Tier</th>
              <th class="col-numeric">Adj.</th>
              <th>Criteria</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderPlatformFitTable() {
  const tbody = $('#platform-fit-tbody');
  if (!tbody) return;

  const platformNames = {
    depop: 'Depop',
    poshmark: 'Poshmark',
    vestiaire_collective: 'Vestiaire',
    therealreal: 'TheRealReal',
    etsy: 'Etsy',
    grailed: 'Grailed',
    ebay: 'eBay',
    starluv: 'Starluv'
  };

  // Build rows data for sorting
  let rowsData = Object.entries(PLATFORM_FIT_ADJUSTMENTS).map(([platformId, config]) => ({
    platformId,
    name: platformNames[platformId] || platformId,
    config
  }));

  // Sort based on current sort column
  rowsData.sort((a, b) => {
    let cmp = 0;
    if (platformFitSortColumn === 'platform') {
      cmp = a.name.localeCompare(b.name);
    }
    return platformFitSortDirection === 'asc' ? cmp : -cmp;
  });

  const rows = rowsData.map(({ name, config }) => {
    const sizeText = formatSizeAdjustmentProse(config);
    const matText = formatMaterialAdjustmentProse(config);

    return `
      <tr>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(sizeText)}</td>
        <td>${escapeHtml(matText)}</td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rows;

  // Update sort indicators
  const table = $('#platform-fit-table');
  if (table) updateSortIndicators(table, platformFitSortColumn, platformFitSortDirection);
}

function formatSizeAdjustmentProse(config) {
  const parts = [];

  if (config.size_small_bonus && config.size_large_penalty) {
    const smallPct = Math.round(config.size_small_bonus * 100);
    const largePct = Math.round(config.size_large_penalty * 100);
    parts.push(`Small sizes (XS–M) sell +${smallPct}% higher; large sizes (XL+) sell ${largePct}% lower`);
  } else if (config.size_outlier_penalty) {
    const pct = Math.round(config.size_outlier_penalty * 100);
    parts.push(`Extended/outlier sizes penalized ${pct}%`);
  } else if (config.size_compress) {
    parts.push('Size matters less (prices compress toward average)');
  } else if (config.mens_sizing) {
    parts.push("Men's sizing rules apply");
  }

  return parts.length > 0 ? parts.join('; ') : 'Standard rules apply';
}

function formatMaterialAdjustmentProse(config) {
  const parts = [];

  if (config.material_compress) {
    parts.push('Material quality matters less (prices compress toward average)');
  }
  if (config.material_low_extra_penalty) {
    const pct = Math.round(config.material_low_extra_penalty * 100);
    parts.push(`Low-tier materials penalized an extra ${pct}%`);
  }
  if (config.natural_fiber_bonus) {
    const pct = Math.round(config.natural_fiber_bonus * 100);
    parts.push(`Natural fibers get +${pct}% bonus`);
  }

  return parts.length > 0 ? parts.join('; ') : 'Standard rules apply';
}

function formatTierName(tier) {
  // Sentence case: capitalize first letter only
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

// =============================================================================
// ADD BRAND MODAL
// =============================================================================

let addBrandModal = null;

function openAddBrandModal() {
  const dialog = $('#add-brand-dialog');
  if (!dialog) return;

  if (!addBrandModal) {
    addBrandModal = createModalController(dialog);
  }

  const form = $('#brand-form');
  if (form) form.reset();

  addBrandModal.open();
}

function handleBrandSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);

  const brand = {
    name: formData.get('name')?.trim(),
    key: formData.get('name')?.trim().toLowerCase().replace(/\s+/g, '_'),
    tier: formData.get('tier'),
    category: formData.get('category'),
    multiplier: parseFloat(formData.get('multiplier')) || 1.0,
    notes: formData.get('notes')?.trim() || '',
    alt: formData.get('alt_names')?.split(',').map(s => s.trim()).filter(Boolean) || []
  };

  if (!brand.name) {
    showToast('Brand name is required');
    return;
  }
  if (!brand.tier) {
    showToast('Tier is required');
    return;
  }
  if (!brand.category) {
    showToast('Category is required');
    return;
  }

  // Add to local brandsData and re-render
  brandsData.push(brand);
  showToast('Brand added');
  addBrandModal.close();
  renderTable();
}

// =============================================================================
// ADD PLATFORM MODAL
// =============================================================================

let addPlatformModal = null;

function openAddPlatformModal() {
  const dialog = $('#add-platform-dialog');
  if (!dialog) return;

  if (!addPlatformModal) {
    addPlatformModal = createModalController(dialog);
  }

  const form = $('#platform-form');
  if (form) form.reset();

  addPlatformModal.open();
}

function handlePlatformSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const formData = new FormData(form);

  const name = formData.get('name')?.trim();
  if (!name) {
    showToast('Platform name is required');
    return;
  }

  const key = name.toLowerCase().replace(/\s+/g, '_');
  const platform = {
    name,
    audience: formData.get('demographic')?.trim() || '',
    fees: {
      commission: parseFloat(formData.get('fee_percent')) || 0,
      flat_fee: parseFloat(formData.get('flat_fee')) || 0
    },
    best_for: formData.get('best_for')?.split(',').map(s => s.trim()).filter(Boolean) || [],
    shipping: { type: 'seller_arranged', notes: formData.get('shipping')?.trim() || '' },
    pros: formData.get('pros')?.split('\n').map(s => s.trim()).filter(Boolean) || [],
    cons: formData.get('cons')?.split('\n').map(s => s.trim()).filter(Boolean) || []
  };

  // Add to local platformsData and re-render
  if (platformsData && platformsData.platforms) {
    platformsData.platforms[key] = platform;
    showToast('Platform added');
    addPlatformModal.close();
    renderPlatforms();
  }
}
