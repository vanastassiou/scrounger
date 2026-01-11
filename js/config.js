// =============================================================================
// CONFIGURATION
// =============================================================================

export const DB_NAME = 'ThriftInventory';
export const DB_VERSION = 2;

export const STORE_TIERS = ['S', 'A', 'B', 'C'];

export const SYNC_FILE_NAME = 'thrifting-data.json';
export const DRIVE_FOLDER_NAME = 'Seneschal';

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
  'unlisted',
  'photographed',
  'listed',
  'pending_sale',
  'packaged',
  'shipped',
  'confirmed_received',
  'sold',
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

export const INTENT_OPTIONS = ['personal_keep', 'resale', 'undecided'];

export const PIPELINE_STATUSES = [
  'unlisted',
  'photographed',
  'listed',
  'pending_sale',
  'packaged',
  'shipped',
  'confirmed_received',
  'sold'
];

export const RESALE_PLATFORMS = [
  'poshmark',
  'ebay',
  'etsy',
  'depop',
  'facebook_marketplace',
  'local_consignment',
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
  'fading', 'discoloration', 'odor', 'moth_damage', 'stretched', 'shrunk',
  'seam_damage', 'lining_damage', 'heel_wear', 'sole_wear', 'scuffs',
  'scratches', 'tarnish', 'patina', 'missing_stone', 'loose_stone',
  'broken_clasp', 'bent', 'dent', 'crack', 'chip', 'repair_visible', 'other'
];

export const FLAW_SEVERITY = ['minor', 'moderate', 'significant'];

export const WIDTH_OPTIONS = ['narrow', 'standard', 'wide', 'extra_wide'];

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
