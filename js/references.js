// =============================================================================
// REFERENCES MODULE
// =============================================================================

import {
  $, $$, escapeHtml,
  createSortableTable, createFilterButtons, emptyStateRow
} from './utils.js';

let brandsData = [];
let platformsData = null;
let filterCategory = null;
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
  // Category filter buttons
  const categoryBtns = $$('.filter-btn[data-category]');
  categoryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      categoryBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterCategory = btn.dataset.category === 'all' ? null : btn.dataset.category;
      renderTable();
    });
  });

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
    if (filterCategory && brand.category !== filterCategory) return false;
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
    tbody.innerHTML = emptyStateRow(4, 'No matching brands found');
    updateCount(0, brandsData.length);
    return;
  }

  tbody.innerHTML = filtered.map(brand => {
    const tierClass = `tier-badge tier-badge--${brand.tier.toLowerCase()}`;
    const notesHtml = [brand.notes, brand.tips].filter(Boolean).join(' ');

    return `
      <tr data-brand-key="${escapeHtml(brand.key)}">
        <td class="brand-name">
          ${escapeHtml(brand.name)}
          ${brand.alt?.length ? `<span class="brand-alt">(${escapeHtml(brand.alt.join(', '))})</span>` : ''}
        </td>
        <td><span class="${tierClass}">${escapeHtml(brand.tier)}</span></td>
        <td class="text-right">${brand.multiplier != null ? brand.multiplier + 'x' : '-'}</td>
        <td class="brand-notes">${escapeHtml(notesHtml)}</td>
      </tr>
    `;
  }).join('');

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
  const subTabs = $$('.sub-tab[data-ref-view]');
  const views = {
    stores: $('#ref-stores-view'),
    visits: $('#ref-visits-view'),
    brands: $('#ref-brands-view'),
    platforms: $('#ref-platforms-view')
  };
  const validViews = Object.keys(views);

  function activateView(view) {
    subTabs.forEach(t => t.classList.toggle('active', t.dataset.refView === view));
    currentView = view;
    Object.entries(views).forEach(([key, el]) => {
      if (el) el.style.display = key === view ? '' : 'none';
    });
    localStorage.setItem('referencesSubTab', view);
    document.documentElement.dataset.refSub = view;
  }

  subTabs.forEach(tab => {
    tab.addEventListener('click', () => activateView(tab.dataset.refView));
  });

  // Restore saved sub-tab
  const saved = localStorage.getItem('referencesSubTab');
  if (saved && validViews.includes(saved)) {
    activateView(saved);
  }

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

  if (countEl) {
    countEl.textContent = `${platformEntries.length} platform${platformEntries.length === 1 ? '' : 's'}`;
  }
}

function renderPlatformRow(key, p) {
  const formatList = (items) => {
    if (!items || items.length === 0) return '';
    return `<ul class="compact-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
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
  const feesHtml = formatFeesDetailed(p.fees);
  const shippingHtml = formatShipping(p.fees?.shipping);

  return `
    <tr data-platform="${escapeHtml(key)}" data-fees="${getFeesNumeric(p.fees)}">
      <td>${nameHtml}</td>
      <td>${formatList(demographics)}</td>
      <td>${feesHtml}</td>
      <td>${shippingHtml}</td>
      <td>${formatList(bestFor)}</td>
      <td>${formatList(pros)}</td>
      <td>${formatList(cons)}</td>
    </tr>
  `;
}

function formatFeesDetailed(fees) {
  if (!fees) return 'Unknown';

  const parts = [];

  // Commission + payment processing combined
  let commissionText = '';
  let paymentText = '';

  if (fees.commission_tiers) {
    const tiers = fees.commission_tiers;
    if (tiers[0]?.seller_payout_percentage !== undefined) {
      // TheRealReal-style: show what you keep at each tier
      const tierDetails = tiers.map(t => {
        const rangeStart = t.range_usd[0];
        const rangeEnd = t.range_usd[1];
        const range = rangeEnd ? `$${rangeStart}-${rangeEnd}` : `$${rangeStart}+`;
        return `${t.seller_payout_percentage}% if ${range}`;
      }).join(', ');
      commissionText = `You keep: ${tierDetails} (USD)`;
    } else if (tiers[0]?.range_cad) {
      // Vestiaire-style: tiered by price range
      const mainTier = tiers.find(t => t.fee_type === 'percentage');
      commissionText = mainTier ? `${mainTier.amount}%` : 'Tiered';
    } else if (tiers[0]?.fee_type === 'flat' && tiers[1]?.fee_type === 'percentage' && tiers[0]?.threshold_cad) {
      // Poshmark/Starluv-style: flat under threshold, % above
      commissionText = `$${tiers[0].amount_cad} under $${tiers[0].threshold_cad}, ${tiers[1].amount}% above`;
    }
  } else if (fees.commission !== undefined) {
    commissionText = fees.commission === 0 ? 'No commission' : `${fees.commission}%`;
  }

  // Payment processing (combine with commission if both exist)
  if (fees.payment_processing && typeof fees.payment_processing === 'object') {
    const pp = fees.payment_processing;
    if (pp.percentage) {
      paymentText = pp.flat_fee_cad ? `${pp.percentage}% + $${pp.flat_fee_cad}` : `${pp.percentage}%`;
    }
  }

  if (commissionText && paymentText) {
    parts.push(`~${estimateTotalFee(fees)}% total (${commissionText} sale + ${paymentText} payment)`);
  } else if (commissionText) {
    parts.push(commissionText + (fees.commission !== undefined && fees.commission !== 0 ? ' of sale' : ''));
  }

  // Listing fee
  if (fees.listing_fee) {
    if (fees.listing_fee.per_listing_cad) {
      const duration = fees.listing_fee.duration_months ? ` every ${fees.listing_fee.duration_months} mo` : '';
      parts.push(`$${fees.listing_fee.per_listing_cad} to list${duration}`);
    } else if (fees.listing_fee.free_listings_per_month) {
      parts.push(`${fees.listing_fee.free_listings_per_month} free listings/mo`);
    }
  }

  if (parts.length === 0) return 'See details';
  return `<ul class="compact-list">${parts.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`;
}

function formatShipping(shipping) {
  if (!shipping) return '—';

  if (shipping.type === 'prepaid_label' && shipping.cost_cad) {
    const weightNote = shipping.weight_limit_lbs ? `Up to ${shipping.weight_limit_lbs} lbs` : '';
    return `<ul class="compact-list"><li>$${shipping.cost_cad} flat label</li><li>Buyer pays</li>${weightNote ? `<li>${weightNote}</li>` : ''}</ul>`;
  } else if (shipping.type === 'prepaid_label_variable') {
    return `<ul class="compact-list"><li>Label provided</li><li>Buyer pays actual cost</li></ul>`;
  } else if (shipping.type === 'consignment') {
    return 'Free kit provided';
  } else if (shipping.type === 'seller_arranged') {
    return 'You handle it';
  } else if (shipping.type === 'seller_ships_to_authentication') {
    return 'Ship to auth center';
  }
  return '—';
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
  return tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
