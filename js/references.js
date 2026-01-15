// =============================================================================
// REFERENCES MODULE
// =============================================================================

import {
  $, $$, escapeHtml,
  createSortableTable, createFilterButtons, emptyStateRow, updateSortIndicators
} from './utils.js';
import { createSubTabController } from './components.js';
import {
  loadSeasonalData, getAllMonthsData, getCurrentMonthKey, getNextMonthKey, getSeasonalSources
} from './seasonal.js';

let brandsData = [];
let platformsData = null;
let filterTier = null;
let searchQuery = '';
let platformSearchQuery = '';
let sortColumn = 'name';
let sortDirection = 'asc';
let platformSortColumn = 'name';
let platformSortDirection = 'asc';
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
    const sortHandler = createSortableTable({
      getState: () => ({ sortColumn, sortDirection }),
      setState: (s) => { sortColumn = s.sortColumn; sortDirection = s.sortDirection; },
      onSort: renderTable
    });

    table.addEventListener('click', (e) => {
      sortHandler(e);
    });
  }

  // Platforms table sorting
  const platformsTable = $('#platforms-table');
  if (platformsTable) {
    const platformSortHandler = createSortableTable({
      getState: () => ({ sortColumn: platformSortColumn, sortDirection: platformSortDirection }),
      setState: (s) => { platformSortColumn = s.sortColumn; platformSortDirection = s.sortDirection; },
      onSort: renderPlatforms
    });

    platformsTable.addEventListener('click', (e) => {
      platformSortHandler(e);
    });
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
    const notesHtml = [brand.notes, brand.tips].filter(Boolean).join(' ');
    const categoryLabel = brand.category.charAt(0).toUpperCase() + brand.category.slice(1);

    return `
      <tr data-brand-key="${escapeHtml(brand.key)}">
        <td class="brand-name">
          ${escapeHtml(brand.name)}
          ${brand.alt?.length ? `<span class="brand-alt">(${escapeHtml(brand.alt.join(', '))})</span>` : ''}
        </td>
        <td data-label="Type">${escapeHtml(categoryLabel)}</td>
        <td data-label="Tier"><span class="${tierClass}">${escapeHtml(brand.tier)}</span></td>
        <td data-label="Multiplier">${brand.multiplier != null ? brand.multiplier + 'x' : '-'}</td>
        <td data-label="Notes" class="brand-notes">${escapeHtml(notesHtml)}</td>
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
      visits: '#ref-visits-view',
      brands: '#ref-brands-view',
      platforms: '#ref-platforms-view',
      trends: '#ref-trends-view'
    },
    storageKey: 'referencesSubTab',
    htmlDataAttr: 'refSub',
    defaultView: 'stores',
    onActivate: (view) => {
      currentView = view;
      if (view === 'trends') {
        renderTrendsView();
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

  // Hot items: collect types, colours, materials separately
  const types = [];
  const colours = [];
  const materials = [];
  (month.hot_categories || []).forEach(cat => {
    types.push(...(cat.subcategories || []));
    colours.push(...(cat.colours || []));
    materials.push(...(cat.materials || []));
  });

  const hotItemsList = [];
  const uniqueTypes = [...new Set(types)];
  const uniqueColours = [...new Set(colours)];
  const uniqueMaterials = [...new Set(materials)];

  if (uniqueTypes.length > 0) {
    hotItemsList.push(`Types: ${uniqueTypes.map(i => escapeHtml(formatTagName(i))).join(', ')}`);
  }
  if (uniqueColours.length > 0) {
    hotItemsList.push(`Colours: ${uniqueColours.map(i => escapeHtml(formatTagName(i))).join(', ')}`);
  }
  if (uniqueMaterials.length > 0) {
    hotItemsList.push(`Materials: ${uniqueMaterials.map(i => escapeHtml(formatTagName(i))).join(', ')}`);
  }

  const hotItemsHtml = hotItemsList.length > 0
    ? `<ul class="compact-list">${hotItemsList.map(item => `<li>${item}</li>`).join('')}</ul>`
    : '-';

  // Why: first reason from categories
  const firstReason = month.hot_categories?.[0]?.reason || '';
  const whyText = firstReason ? escapeHtml(firstReason) : '-';

  // Platform tips (bullet list)
  const platformNotes = month.platform_notes || {};
  const platformEntries = Object.entries(platformNotes);
  const platformsHtml = platformEntries.length > 0
    ? `<ul class="compact-list">${platformEntries.map(([platform, tip]) => `<li>${escapeHtml(getPlatformName(platform))}: ${escapeHtml(tip)}</li>`).join('')}</ul>`
    : '-';

  return `
    <tr class="${rowClass}">
      <td>${escapeHtml(month.label)}</td>
      <td data-label="Themes">${themesHtml}</td>
      <td data-label="Hot Items">${hotItemsHtml}</td>
      <td data-label="Why">${whyText}</td>
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
