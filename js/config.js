// =============================================================================
// CONFIGURATION
// =============================================================================

export const DB_NAME = 'ThriftInventory';
export const DB_VERSION = 5;

// Size gender options for clothing/shoes (required) and jewelry/accessories (optional)
export const SIZE_GENDER_OPTIONS = ['women', 'men', 'unisex'];

export const STORE_TIERS = ['S', 'A', 'B', 'C'];

export const CATEGORIES = ['clothing', 'shoes', 'jewelry', 'accessories'];

export const SUBCATEGORIES = {
  clothing: [
    'dress', 'blouse', 'shirt', 'sweater', 'cardigan', 'jacket', 'coat', 'suit',
    'pants', 'trousers', 'skirt', 'shorts', 'jumpsuit', 'romper', 'vest',
    'lingerie', 'sleepwear', 'athletic', 'swimwear', 'formal_gown', 'other'
  ],
  shoes: [
    'heels', 'pumps', 'flats', 'boots', 'ankle_boots', 'sandals', 'loafers',
    'oxfords', 'sneakers', 'mules', 'platforms', 'wedges', 'slippers', 'other'
  ],
  jewelry: [
    'ring', 'necklace', 'pendant', 'bracelet', 'bangle', 'earrings', 'brooch',
    'pin', 'watch', 'cufflinks', 'tie_clip', 'anklet', 'set', 'other'
  ],
  accessories: [
    'handbag', 'clutch', 'wallet', 'belt', 'scarf', 'hat', 'gloves',
    'sunglasses', 'hair_accessory', 'other'
  ]
};

export const STATUS_OPTIONS = [
  'in_collection',
  'needs_photo',
  'unlisted',
  'listed',
  'sold',
  'packaged',
  'shipped',
  'confirmed_received',
  'returned',
  'donated',
  'kept'
];

export const CONDITION_OPTIONS = [
  'new_with_tags',
  'like_new',
  'excellent',
  'very_good',
  'good',
  'fair',
  'poor',
  'for_parts'
];

export const ERA_OPTIONS = [
  'pre_1920s',
  '1920s',
  '1930s',
  '1940s',
  '1950s',
  '1960s',
  '1970s',
  '1980s',
  '1990s',
  '2000s',
  '2010s',
  'contemporary',
  'unknown'
];

// Condition multipliers for pricing recommendations
export const CONDITION_MULTIPLIERS = {
  new_with_tags: 1.15,
  like_new: 1.0,
  excellent: 0.95,
  very_good: 0.85,
  good: 0.75,
  fair: 0.60,
  poor: 0.40,
  for_parts: 0.20
};

// Era bonuses for vintage items (multiplied with base price)
export const ERA_BONUSES = {
  pre_1920s: 1.5,
  '1920s': 1.4,
  '1930s': 1.35,
  '1940s': 1.3,
  '1950s': 1.25,
  '1960s': 1.2,
  '1970s': 1.15,
  '1980s': 1.1,
  '1990s': 1.05,
  '2000s': 1.0,
  '2010s': 1.0,
  contemporary: 1.0,
  unknown: 1.0
};

// Material value tier multipliers (maps to value_tier in materials.json)
export const MATERIAL_TIER_MULTIPLIERS = {
  highest: 1.25,      // Cordovan, exotic leather, platinum, 24k gold
  high: 1.15,         // Cashmere, silk, full-grain leather, sterling
  'medium-high': 1.08, // Wool, linen, nubuck, gold-filled, pearl
  medium: 1.0,        // Cotton, rayon, suede, corrected-grain leather
  'low-medium': 0.95, // Acetate, vintage nylon, rolled-gold
  low: 0.88,          // Polyester, acrylic, brass, "genuine leather"
  avoid: 0.75         // Bonded leather, PU/PVC, pot metal
};

// Size multipliers for clothing
export const CLOTHING_SIZE_TIERS = {
  premium: { multiplier: 1.08, sizes: ['XS', 'S', 'M', '0', '2', '4', '6', '8'] },
  standard: { multiplier: 1.0, sizes: ['L', '10', '12'] },
  extended: { multiplier: 0.95, sizes: ['XL', 'XXL', '14', '16', '18', '1X', '2X', '3X'] },
  outlier: { multiplier: 0.88, sizes: ['XXXL', '20', '22', '24', '4X', '5X'] }
};

// Size multipliers for shoes (women's sizes)
export const SHOE_SIZE_TIERS = {
  premium: { multiplier: 1.10, minSize: 7, maxSize: 9, widths: ['standard', 'wide'] },
  standard: { multiplier: 1.0, minSize: 6, maxSize: 10 },
  narrow_market: { multiplier: 0.90 }
};

// Size multipliers for jewelry
export const JEWELRY_SIZE_RULES = {
  adjustable: { multiplier: 1.08, closures: ['toggle', 'hook_and_eye', 'magnetic'] },
  ring_premium: { multiplier: 1.05, sizes: ['6', '6.5', '7', '7.5', '8'] },
  ring_standard: { multiplier: 1.0, sizes: ['5', '5.5', '8.5', '9'] },
  ring_narrow: { multiplier: 0.90 },
  necklace_premium: { multiplier: 1.03, lengths: [16, 18, 20] },
  necklace_standard: { multiplier: 1.0, lengths: [14, 22, 24] }
};

// Platform demographic fit adjustments
export const PLATFORM_FIT_ADJUSTMENTS = {
  depop: {
    // Gen Z, trend-focused - smaller sizes premium
    size_small_bonus: 0.05,     // XS-M gets +5%
    size_large_penalty: -0.05,  // XL+ gets -5%
    material_compress: 0.5      // Compress material multiplier toward 1.0 by 50%
  },
  poshmark: {
    // Women 18-45, size-inclusive
    size_outlier_penalty: -0.03 // Reduced outlier penalty (vs -0.12)
  },
  vestiaire_collective: {
    // Luxury buyers - standard sizes expected
    size_outlier_penalty: -0.10,
    material_low_extra_penalty: -0.05 // Low-tier materials get extra penalty
  },
  therealreal: {
    // High-end luxury - same as Vestiaire
    size_outlier_penalty: -0.10,
    material_low_extra_penalty: -0.05
  },
  etsy: {
    // Vintage enthusiasts, eco-conscious
    size_compress: 0.5,           // Size matters less
    natural_fiber_bonus: 0.05     // +5% for high-tier natural materials
  },
  grailed: {
    // Men's fashion - different size rules apply
    mens_sizing: true
  },
  ebay: {
    // Broad audience, collectors
    size_compress: 0.5            // Size matters less
  },
  starluv: {
    // Budget-conscious Canadian - standard rules
  }
};

// Flaw impact on pricing (stacks with condition multiplier)
export const FLAW_IMPACT = {
  severity: { minor: -0.02, moderate: -0.05, significant: -0.10 },
  affects_wearability: -0.05,
  repairable_discount: 0.5,  // Halves the flaw penalty if repairable
  max_penalty: -0.25         // Floor on total flaw adjustment
};

// =============================================================================
// TREND MULTIPLIERS - Color, Cut, and Style Impact on Pricing
// =============================================================================

// Color trend multipliers (seasonal alignment)
export const COLOR_TREND_MULTIPLIERS = {
  hot: 1.15,           // +15% for hot seasonal colors
  emerging: 1.08,      // +8% for emerging colors
  neutral: 1.0,        // No adjustment for evergreen neutrals
  declining: 0.92,     // -8% for declining colors
  off_season: 0.85     // -15% for completely off-season colors
};

// Cut/silhouette trend multipliers
export const CUT_TREND_MULTIPLIERS = {
  trending: 1.12,      // +12% for trending cuts this month/season
  platform_match: 1.08, // +8% for cuts that match platform preferences
  classic: 1.0,        // No adjustment for classic/timeless cuts
  dated: 0.90          // -10% for dated cuts (e.g., extreme 2000s low-rise on Vestiaire)
};

// Style/aesthetic multipliers
export const STYLE_TREND_MULTIPLIERS = {
  hot_aesthetic: 1.15,     // +15% for current trending aesthetics (e.g., quiet luxury)
  platform_match: 1.10,    // +10% for styles that match platform demographics
  seasonal_match: 1.08,    // +8% for seasonal style alignment
  neutral: 1.0,
  platform_mismatch: 0.92  // -8% for styles that don't fit platform audience
};

// Cut keywords for inference from description
export const CUT_KEYWORDS = {
  oversized: ['oversized', 'baggy', 'boxy', 'loose', 'relaxed', 'slouchy'],
  fitted: ['fitted', 'slim', 'tailored', 'bodycon', 'form-fitting', 'tight', 'skinny'],
  wrap: ['wrap', 'surplice', 'crossover', 'tie-waist'],
  a_line: ['a-line', 'a line', 'flared', 'swing', 'skater'],
  midi: ['midi', 'mid-length', 'tea-length'],
  maxi: ['maxi', 'floor-length', 'full-length'],
  cropped: ['cropped', 'crop', 'short'],
  high_waist: ['high-waist', 'high waist', 'high-rise', 'high rise'],
  low_rise: ['low-rise', 'low rise', 'low-waist'],
  wide_leg: ['wide-leg', 'wide leg', 'palazzo', 'flare'],
  straight: ['straight-leg', 'straight leg', 'straight cut'],
  structured: ['structured', 'tailored', 'architectural'],
  column: ['column', 'sheath', 'pencil'],
  puff_sleeve: ['puff sleeve', 'puffed', 'balloon sleeve'],
  dramatic: ['dramatic', 'statement', 'bold', 'avant-garde'],
  chunky: ['chunky', 'cable-knit', 'cable knit', 'bulky']
};

// Style keywords for inference from description/era/brand
export const STYLE_KEYWORDS = {
  y2k: ['y2k', '2000s', 'early 2000s', 'paris hilton', 'low rise', 'baby tee'],
  streetwear: ['streetwear', 'urban', 'supreme', 'bape', 'palace', 'stussy'],
  boho: ['boho', 'bohemian', 'hippie', 'festival', 'peasant', 'gypsy'],
  preppy: ['preppy', 'collegiate', 'ivy', 'nautical', 'country club'],
  minimalist: ['minimalist', 'minimal', 'clean lines', 'understated'],
  romantic: ['romantic', 'feminine', 'delicate', 'lace', 'ruffle', 'floral'],
  gothic: ['gothic', 'goth', 'dark', 'black', 'victorian'],
  grunge: ['grunge', '90s', 'plaid', 'distressed', 'band tee'],
  quiet_luxury: ['quiet luxury', 'stealth wealth', 'old money', 'understated', 'investment'],
  cottagecore: ['cottagecore', 'prairie', 'pastoral', 'vintage floral'],
  dark_academia: ['dark academia', 'scholarly', 'tweed', 'oxford', 'literary'],
  vintage_authentic: ['vintage', 'true vintage', 'antique', 'retro', 'deadstock'],
  athleisure: ['athleisure', 'athletic', 'sporty', 'activewear', 'workout'],
  coastal: ['coastal', 'beach', 'resort', 'nautical', 'summer', 'vacation']
};

// Trend calculation weighting
export const TREND_WEIGHTS = {
  color: 0.4,    // 40% weight for color trends
  cut: 0.3,      // 30% weight for cut/silhouette
  style: 0.3     // 30% weight for style/aesthetic
};

// Max trend adjustment (cap to prevent extreme swings)
export const MAX_TREND_ADJUSTMENT = 0.20; // +/-20% max

export const INTENT_OPTIONS = ['personal_keep', 'resale', 'undecided'];

export const PIPELINE_STATUSES = [
  'needs_photo',
  'unlisted',
  'listed',
  'sold',
  'packaged',
  'shipped',
  'confirmed_received'
];

// Carrier tracking URL templates - {tracking} placeholder for tracking number
export const CARRIER_TRACKING_URLS = {
  usps: 'https://tools.usps.com/go/TrackConfirmAction?tLabels={tracking}',
  ups: 'https://www.ups.com/track?tracknum={tracking}',
  fedex: 'https://www.fedex.com/fedextrack/?trknbr={tracking}',
  dhl: 'https://www.dhl.com/en/express/tracking.html?AWB={tracking}',
  other: null
};

// Required photo types for pipeline (front, back, label always required)
export const REQUIRED_PHOTO_TYPES = ['front', 'back', 'label'];

// Optional photo types offered after required are complete
export const OPTIONAL_PHOTO_TYPES = ['detail', 'hallmark', 'closure', 'measurement', 'styled'];

// Hints for each photo type in guided capture
export const PHOTO_TYPE_HINTS = {
  front: 'Capture the full front view of the item',
  back: 'Capture the full back view',
  label: 'Photograph the brand and care labels',
  flaw: 'Document any flaws clearly',
  detail: 'Close-up of interesting details',
  hallmark: 'Jewelry stamps and markings',
  closure: 'Zippers, buttons, or clasps',
  measurement: 'Item with measuring tape',
  styled: 'Item styled or being worn',
  // New category-specific types
  sole: 'Bottom of shoe showing wear pattern',
  heel: 'Heel condition and height',
  inside: 'Insole and interior lining',
  clasp: 'Closure mechanism detail',
  scale: 'Next to ruler or coin for size reference',
  interior: 'Inside of bag showing lining and pockets',
  hardware: 'Zippers, buckles, clasps, or locks'
};

// Category-specific optional photo types
export const CATEGORY_PHOTO_TYPES = {
  clothing: ['detail', 'closure', 'measurement', 'styled'],
  shoes: ['sole', 'heel', 'inside', 'closure', 'detail'],
  jewelry: ['hallmark', 'clasp', 'detail', 'scale'],
  accessories: ['interior', 'hardware', 'detail', 'closure']
};

// All unique optional types (fallback when no category)
export const ALL_OPTIONAL_PHOTO_TYPES = [
  'detail', 'closure', 'measurement', 'styled',
  'sole', 'heel', 'inside',
  'hallmark', 'clasp', 'scale',
  'interior', 'hardware'
];

// Category-specific hint overrides for photo types
export const CATEGORY_PHOTO_HINTS = {
  clothing: {
    detail: 'Close-up of fabric texture, stitching, or unique features',
    closure: 'Zippers, buttons, snaps, or hooks'
  },
  shoes: {
    detail: 'Close-up of leather grain, stitching, or embellishments',
    closure: 'Buckles, laces, zippers, or straps'
  },
  jewelry: {
    detail: 'Close-up of stones, engraving, or craftsmanship',
    clasp: 'Closure mechanism (lobster claw, toggle, etc.)'
  },
  accessories: {
    detail: 'Close-up of stitching, logo, or unique features',
    closure: 'Snaps, magnetic closures, or turn-locks'
  }
};

/**
 * Get optional photo types for a category.
 * @param {string|null} category - Item category (clothing, shoes, jewelry, accessories)
 * @returns {string[]} Array of optional photo type strings
 */
export function getOptionalPhotoTypes(category) {
  if (category && CATEGORY_PHOTO_TYPES[category]) {
    return CATEGORY_PHOTO_TYPES[category];
  }
  return ALL_OPTIONAL_PHOTO_TYPES;
}

/**
 * Get the hint for a photo type, with optional category-specific override.
 * @param {string} type - Photo type
 * @param {string|null} category - Item category
 * @returns {string} Hint text
 */
export function getPhotoHint(type, category) {
  // Check for category-specific override first
  if (category && CATEGORY_PHOTO_HINTS[category] && CATEGORY_PHOTO_HINTS[category][type]) {
    return CATEGORY_PHOTO_HINTS[category][type];
  }
  // Fall back to default hint
  return PHOTO_TYPE_HINTS[type] || '';
}

// Conditions that require flaws to be documented before entering pipeline
export const CONDITIONS_REQUIRING_FLAWS = ['good', 'fair', 'poor', 'for_parts'];

export const RESALE_PLATFORMS = [
  'poshmark',
  'ebay',
  'etsy',
  'depop',
  'vestiaire_collective',
  'therealreal',
  'grailed',
  'starluv',
  'other'
];

export const METAL_TYPES = [
  'gold_24k', 'gold_22k', 'gold_18k', 'gold_14k', 'gold_10k', 'gold_9k',
  'gold_filled', 'gold_plated', 'rolled_gold', 'vermeil',
  'sterling_silver', 'coin_silver', 'silver_plated',
  'platinum', 'palladium',
  'brass', 'copper', 'bronze', 'pewter', 'stainless_steel', 'base_metal',
  'unknown'
];

export const CLOSURE_TYPES = [
  'lobster_claw', 'spring_ring', 'toggle', 'box_clasp', 'hook_and_eye',
  'magnetic', 'barrel', 'push_back', 'screw_back', 'lever_back',
  'omega_back', 'clip_on', 'brooch_pin', 'none', 'other'
];

export const JEWELRY_TESTS = [
  'magnet', 'loupe_10x', 'acid_test', 'electronic_tester',
  'uv_light', 'weight_comparison', 'none'
];

export const FLAW_TYPES = [
  'stain', 'hole', 'tear', 'missing_button', 'broken_zipper', 'pilling',
  'fading', 'discolouration', 'odour', 'moth_damage', 'stretched', 'shrunk',
  'seam_damage', 'lining_damage', 'heel_wear', 'sole_wear', 'scuffs',
  'scratches', 'tarnish', 'patina', 'missing_stone', 'loose_stone',
  'broken_clasp', 'bent', 'dent', 'crack', 'chip', 'repair_visible', 'other'
];

export const FLAW_SEVERITY = ['minor', 'moderate', 'significant'];

export const WIDTH_OPTIONS = ['narrow', 'standard', 'wide', 'extra_wide'];

export const PACKAGING_OPTIONS = [
  'poly_mailer',
  'poly_mailer_large',
  'box_12x8x4',
  'box_12x10x4',
  'box_14x10x4',
  'box_14x10x5',
  'box_16x8x6_boot',
  'box_16x12x4',
  'box_16x14x6'
];

export const COLOUR_OPTIONS = [
  'black', 'white', 'cream', 'ivory', 'beige', 'tan', 'camel', 'brown',
  'chocolate', 'burgundy', 'maroon', 'wine', 'red', 'coral', 'orange',
  'rust', 'mustard', 'yellow', 'gold', 'lime', 'green', 'olive', 'teal',
  'turquoise', 'aqua', 'blue', 'navy', 'cobalt', 'royal_blue', 'powder_blue',
  'lavender', 'purple', 'plum', 'aubergine', 'magenta', 'pink', 'blush',
  'rose', 'grey', 'charcoal', 'silver', 'metallic', 'multicolour', 'print'
];

export const MATERIAL_OPTIONS = [
  'cashmere', 'wool', 'merino_wool', 'lambswool', 'alpaca', 'silk',
  'cotton', 'linen', 'leather', 'suede', 'nubuck',
  'rayon', 'viscose', 'modal', 'lyocell', 'tencel', 'bamboo',
  'polyester', 'nylon', 'acrylic', 'spandex', 'elastane',
  'velvet', 'satin', 'chiffon', 'tweed', 'denim', 'corduroy',
  'fleece', 'knit', 'jersey', 'lace', 'mesh', 'sequin',
  'patent_leather', 'calfskin', 'lambskin', 'goatskin', 'snakeskin',
  'crocodile', 'ostrich', 'pony_hair',
  'unknown', 'other'
];

// Measurement fields by category
export const MEASUREMENT_FIELDS = {
  clothing: [
    { key: 'bust_inches', label: 'Bust', unit: '"' },
    { key: 'waist_inches', label: 'Waist', unit: '"' },
    { key: 'hips_inches', label: 'Hips', unit: '"' },
    { key: 'shoulder_width_inches', label: 'Shoulder', unit: '"' },
    { key: 'sleeve_length_inches', label: 'Sleeve', unit: '"' },
    { key: 'length_inches', label: 'Length', unit: '"' },
    { key: 'inseam_inches', label: 'Inseam', unit: '"' },
    { key: 'rise_inches', label: 'Rise', unit: '"' }
  ],
  shoes: [
    { key: 'insole_length_cm', label: 'Insole', unit: 'cm' },
    { key: 'heel_height_inches', label: 'Heel', unit: '"' }
  ],
  jewelry: [
    { key: 'chain_length_inches', label: 'Chain', unit: '"' },
    { key: 'bracelet_circumference_inches', label: 'Circumference', unit: '"' },
    { key: 'weight_grams', label: 'Weight', unit: 'g' }
  ]
};

// Sort order for store tiers (S is best, C is lowest)
export const TIER_ORDER = { S: 0, A: 1, B: 2, C: 3 };

/**
 * Get numeric sort order for a tier.
 * @param {string} tier
 * @returns {number}
 */
export function getTierSortOrder(tier) {
  return TIER_ORDER[tier] ?? 99;
}

/**
 * Get numeric sort order for a pipeline status.
 * @param {string} status
 * @returns {number}
 */
export function getStatusSortOrder(status) {
  const idx = PIPELINE_STATUSES.indexOf(status);
  return idx >= 0 ? idx : 99;
}
