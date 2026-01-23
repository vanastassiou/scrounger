/**
 * Selling Module Tests
 * Run in browser console after importing:
 *   import('/js/tests/selling.test.js').then(m => m.runAllTests())
 *
 * Or run individual tests:
 *   import('/js/tests/selling.test.js').then(m => m.testPipelineValidation())
 */

import {
  validatePipelineEntry,
  validatePhotosComplete,
  validateListingData,
  validateShippingData,
  validateDeliveryConfirmation,
  getTrackingUrl
} from '../selling.js';

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

function logSection(name) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  ${name}`);
  console.log('='.repeat(50));
}

// =============================================================================
// TEST DATA HELPERS
// =============================================================================

function createValidItem() {
  return {
    brand: 'Escada',
    category: {
      primary: 'clothing',
      secondary: 'blazer'
    },
    colour: {
      primary: 'black'
    },
    material: {
      primary: { name: 'wool', percentage: 100 }
    },
    size: {
      label: { value: 'M' },
      measurements: { chest: 40 }
    },
    condition: {
      overall_condition: 'excellent'
    }
  };
}

function createAttachmentWithType(type) {
  return {
    id: `att-${type}`,
    type: type,
    filename: `${type}.jpg`,
    mimeType: 'image/jpeg'
  };
}

// =============================================================================
// PIPELINE ENTRY VALIDATION TESTS
// =============================================================================

export async function testPipelineValidation() {
  logSection('PIPELINE ENTRY VALIDATION TESTS');

  // Valid item should pass
  console.log('\n Testing valid item...');
  const validItem = createValidItem();
  const validResult = validatePipelineEntry(validItem);
  assert(validResult.valid === true, 'Valid item passes validation');
  assert(validResult.errors.length === 0, 'Valid item has no errors');

  // Missing brand
  console.log('\n Testing missing brand...');
  const noBrand = { ...createValidItem(), brand: null };
  const noBrandResult = validatePipelineEntry(noBrand);
  assert(noBrandResult.valid === false, 'Missing brand fails validation');
  assert(noBrandResult.errors.includes('Brand is required'), 'Error message includes brand');

  // Missing item type (category.secondary)
  console.log('\n Testing missing item type...');
  const noType = { ...createValidItem(), category: { primary: 'clothing' } };
  const noTypeResult = validatePipelineEntry(noType);
  assert(noTypeResult.valid === false, 'Missing type fails validation');
  assert(noTypeResult.errors.includes('Item type is required'), 'Error message includes type');

  // Missing colour
  console.log('\n Testing missing colour...');
  const noColour = { ...createValidItem(), colour: {} };
  const noColourResult = validatePipelineEntry(noColour);
  assert(noColourResult.valid === false, 'Missing colour fails validation');
  assert(noColourResult.errors.includes('Primary colour is required'), 'Error message includes colour');

  // Missing condition
  console.log('\n Testing missing condition...');
  const noCondition = { ...createValidItem(), condition: {} };
  const noConditionResult = validatePipelineEntry(noCondition);
  assert(noConditionResult.valid === false, 'Missing condition fails validation');
  assert(noConditionResult.errors.includes('Condition is required'), 'Error message includes condition');

  // Missing material
  console.log('\n Testing missing material...');
  const noMaterial = { ...createValidItem(), material: {} };
  const noMaterialResult = validatePipelineEntry(noMaterial);
  assert(noMaterialResult.valid === false, 'Missing material fails validation');
  assert(noMaterialResult.errors.includes('Primary material is required'), 'Error message includes material');

  // Missing size (no label, no measurements)
  console.log('\n Testing missing size...');
  const noSize = { ...createValidItem(), size: {} };
  const noSizeResult = validatePipelineEntry(noSize);
  assert(noSizeResult.valid === false, 'Missing size fails validation');
  assert(noSizeResult.errors.some(e => e.includes('Size')), 'Error message includes size');

  // Size with only measurements (valid)
  console.log('\n Testing size with measurements only...');
  const measurementsOnly = {
    ...createValidItem(),
    size: { measurements: { chest: 40, length: 26 } }
  };
  const measurementsResult = validatePipelineEntry(measurementsOnly);
  assert(measurementsResult.valid === true, 'Item with measurements only is valid');

  // Size with only label (valid)
  console.log('\n Testing size with label only...');
  const labelOnly = {
    ...createValidItem(),
    size: { label: { value: 'M' } }
  };
  const labelResult = validatePipelineEntry(labelOnly);
  assert(labelResult.valid === true, 'Item with label only is valid');

  // Condition requiring flaws but no flaws provided
  console.log('\n Testing condition requiring flaws...');
  const goodConditionNoFlaws = {
    ...createValidItem(),
    condition: { overall_condition: 'good' }
  };
  const goodNoFlawsResult = validatePipelineEntry(goodConditionNoFlaws);
  assert(goodNoFlawsResult.valid === false, 'Good condition without flaws fails validation');
  assert(goodNoFlawsResult.errors.some(e => e.includes('Flaws must be documented')), 'Error mentions flaws required');

  // Condition requiring flaws with flaws provided
  console.log('\n Testing condition with flaws documented...');
  const goodConditionWithFlaws = {
    ...createValidItem(),
    condition: {
      overall_condition: 'good',
      flaws: [{ type: 'minor_wear', location: 'cuff' }]
    }
  };
  const goodWithFlawsResult = validatePipelineEntry(goodConditionWithFlaws);
  assert(goodWithFlawsResult.valid === true, 'Good condition with flaws is valid');

  // Multiple errors
  console.log('\n Testing multiple errors...');
  const multipleIssues = { category: { primary: 'clothing' } };
  const multipleResult = validatePipelineEntry(multipleIssues);
  assert(multipleResult.valid === false, 'Multiple issues fail validation');
  assert(multipleResult.errors.length >= 4, 'Multiple errors returned');

  console.log('\n✅ All PIPELINE ENTRY VALIDATION tests passed!');
  return true;
}

// =============================================================================
// PHOTO VALIDATION TESTS
// =============================================================================

export async function testPhotoValidation() {
  logSection('PHOTO VALIDATION TESTS');

  // Item without flaws - needs main, detail, label photos
  console.log('\n Testing complete photos (no flaws)...');
  const itemNoFlaws = createValidItem();
  const completePhotos = [
    createAttachmentWithType('main'),
    createAttachmentWithType('detail'),
    createAttachmentWithType('label')
  ];
  const completeResult = validatePhotosComplete(itemNoFlaws, completePhotos);
  assert(completeResult.valid === true, 'Complete photos pass validation');
  assert(completeResult.missing.length === 0, 'No missing photos');

  // Missing main photo
  console.log('\n Testing missing main photo...');
  const missingMain = [
    createAttachmentWithType('detail'),
    createAttachmentWithType('label')
  ];
  const missingMainResult = validatePhotosComplete(itemNoFlaws, missingMain);
  assert(missingMainResult.valid === false, 'Missing main photo fails validation');
  assert(missingMainResult.missing.includes('main'), 'Main photo in missing list');

  // Missing multiple photos
  console.log('\n Testing missing multiple photos...');
  const onlyLabel = [createAttachmentWithType('label')];
  const missingMultipleResult = validatePhotosComplete(itemNoFlaws, onlyLabel);
  assert(missingMultipleResult.valid === false, 'Missing multiple photos fails validation');
  assert(missingMultipleResult.missing.includes('main'), 'Main in missing list');
  assert(missingMultipleResult.missing.includes('detail'), 'Detail in missing list');

  // Item with flaws - needs flaw photo too
  console.log('\n Testing item with flaws needs flaw photo...');
  const itemWithFlaws = {
    ...createValidItem(),
    condition: {
      overall_condition: 'good',
      flaws: [{ type: 'small_stain', location: 'hem' }]
    }
  };
  const photosNoFlaw = [
    createAttachmentWithType('main'),
    createAttachmentWithType('detail'),
    createAttachmentWithType('label')
  ];
  const noFlawPhotoResult = validatePhotosComplete(itemWithFlaws, photosNoFlaw);
  assert(noFlawPhotoResult.valid === false, 'Item with flaws needs flaw photo');
  assert(noFlawPhotoResult.missing.includes('flaw'), 'Flaw photo in missing list');

  // Item with flaws - all photos including flaw
  console.log('\n Testing item with flaws and flaw photo...');
  const allPhotosWithFlaw = [
    createAttachmentWithType('main'),
    createAttachmentWithType('detail'),
    createAttachmentWithType('label'),
    createAttachmentWithType('flaw')
  ];
  const withFlawPhotoResult = validatePhotosComplete(itemWithFlaws, allPhotosWithFlaw);
  assert(withFlawPhotoResult.valid === true, 'Item with flaw photo passes');
  assert(withFlawPhotoResult.missing.length === 0, 'No missing photos');

  // Empty attachments
  console.log('\n Testing no attachments...');
  const noPhotosResult = validatePhotosComplete(itemNoFlaws, []);
  assert(noPhotosResult.valid === false, 'No attachments fails validation');
  assert(noPhotosResult.missing.length >= 3, 'All required types missing');

  // Attachments without type field
  console.log('\n Testing attachments without type...');
  const untypedAttachments = [
    { id: 'att-1', filename: 'photo1.jpg' },
    { id: 'att-2', filename: 'photo2.jpg' }
  ];
  const untypedResult = validatePhotosComplete(itemNoFlaws, untypedAttachments);
  assert(untypedResult.valid === false, 'Untyped attachments fail validation');

  console.log('\n✅ All PHOTO VALIDATION tests passed!');
  return true;
}

// =============================================================================
// LISTING DATA VALIDATION TESTS
// =============================================================================

export async function testListingValidation() {
  logSection('LISTING DATA VALIDATION TESTS');

  // Valid listing data
  console.log('\n Testing valid listing data...');
  const validListing = {
    list_platform: 'ebay',
    list_date: '2025-01-21',
    listed_price: 75.00
  };
  const validResult = validateListingData(validListing);
  assert(validResult.valid === true, 'Valid listing data passes');
  assert(validResult.errors.length === 0, 'No errors');

  // Missing platform
  console.log('\n Testing missing platform...');
  const noPlatform = {
    list_date: '2025-01-21',
    listed_price: 75.00
  };
  const noPlatformResult = validateListingData(noPlatform);
  assert(noPlatformResult.valid === false, 'Missing platform fails');
  assert(noPlatformResult.errors.includes('Platform is required'), 'Error mentions platform');

  // Missing date
  console.log('\n Testing missing date...');
  const noDate = {
    list_platform: 'ebay',
    listed_price: 75.00
  };
  const noDateResult = validateListingData(noDate);
  assert(noDateResult.valid === false, 'Missing date fails');
  assert(noDateResult.errors.includes('List date is required'), 'Error mentions date');

  // Missing price
  console.log('\n Testing missing price...');
  const noPrice = {
    list_platform: 'ebay',
    list_date: '2025-01-21'
  };
  const noPriceResult = validateListingData(noPrice);
  assert(noPriceResult.valid === false, 'Missing price fails');
  assert(noPriceResult.errors.includes('Listed price is required'), 'Error mentions price');

  // Zero price
  console.log('\n Testing zero price...');
  const zeroPrice = {
    list_platform: 'ebay',
    list_date: '2025-01-21',
    listed_price: 0
  };
  const zeroPriceResult = validateListingData(zeroPrice);
  assert(zeroPriceResult.valid === false, 'Zero price fails');

  // Negative price
  console.log('\n Testing negative price...');
  const negativePrice = {
    list_platform: 'ebay',
    list_date: '2025-01-21',
    listed_price: -50
  };
  const negativePriceResult = validateListingData(negativePrice);
  assert(negativePriceResult.valid === false, 'Negative price fails');

  // Multiple errors
  console.log('\n Testing multiple errors...');
  const emptyData = {};
  const emptyResult = validateListingData(emptyData);
  assert(emptyResult.valid === false, 'Empty data fails');
  assert(emptyResult.errors.length === 3, 'Three errors for empty data');

  console.log('\n✅ All LISTING DATA VALIDATION tests passed!');
  return true;
}

// =============================================================================
// SHIPPING DATA VALIDATION TESTS
// =============================================================================

export async function testShippingValidation() {
  logSection('SHIPPING DATA VALIDATION TESTS');

  // Valid shipping data
  console.log('\n Testing valid shipping data...');
  const validShipping = {
    recipient_address: '123 Main St, City, ST 12345',
    shipping_carrier: 'usps',
    tracking_number: '1234567890',
    ship_date: '2025-01-21',
    estimated_delivery: '2025-01-25'
  };
  const validResult = validateShippingData(validShipping);
  assert(validResult.valid === true, 'Valid shipping data passes');
  assert(validResult.errors.length === 0, 'No errors');

  // Missing address
  console.log('\n Testing missing address...');
  const noAddress = { ...validShipping, recipient_address: '' };
  const noAddressResult = validateShippingData(noAddress);
  assert(noAddressResult.valid === false, 'Missing address fails');
  assert(noAddressResult.errors.includes('Recipient address is required'), 'Error mentions address');

  // Whitespace-only address
  console.log('\n Testing whitespace address...');
  const whitespaceAddress = { ...validShipping, recipient_address: '   ' };
  const whitespaceResult = validateShippingData(whitespaceAddress);
  assert(whitespaceResult.valid === false, 'Whitespace address fails');

  // Missing carrier
  console.log('\n Testing missing carrier...');
  const noCarrier = { ...validShipping, shipping_carrier: '' };
  const noCarrierResult = validateShippingData(noCarrier);
  assert(noCarrierResult.valid === false, 'Missing carrier fails');
  assert(noCarrierResult.errors.includes('Carrier is required'), 'Error mentions carrier');

  // Missing tracking number
  console.log('\n Testing missing tracking number...');
  const noTracking = { ...validShipping, tracking_number: '' };
  const noTrackingResult = validateShippingData(noTracking);
  assert(noTrackingResult.valid === false, 'Missing tracking fails');
  assert(noTrackingResult.errors.includes('Tracking number is required'), 'Error mentions tracking');

  // Missing ship date
  console.log('\n Testing missing ship date...');
  const noShipDate = { ...validShipping, ship_date: '' };
  const noShipDateResult = validateShippingData(noShipDate);
  assert(noShipDateResult.valid === false, 'Missing ship date fails');
  assert(noShipDateResult.errors.includes('Ship date is required'), 'Error mentions ship date');

  // Missing estimated delivery
  console.log('\n Testing missing estimated delivery...');
  const noEstDelivery = { ...validShipping, estimated_delivery: '' };
  const noEstDeliveryResult = validateShippingData(noEstDelivery);
  assert(noEstDeliveryResult.valid === false, 'Missing est. delivery fails');
  assert(noEstDeliveryResult.errors.includes('Estimated delivery date is required'), 'Error mentions est. delivery');

  // All fields missing
  console.log('\n Testing all fields missing...');
  const emptyShipping = {};
  const emptyResult = validateShippingData(emptyShipping);
  assert(emptyResult.valid === false, 'Empty shipping fails');
  assert(emptyResult.errors.length === 5, 'Five errors for empty shipping');

  console.log('\n✅ All SHIPPING DATA VALIDATION tests passed!');
  return true;
}

// =============================================================================
// DELIVERY CONFIRMATION VALIDATION TESTS
// =============================================================================

export async function testDeliveryValidation() {
  logSection('DELIVERY CONFIRMATION VALIDATION TESTS');

  // Valid delivery data
  console.log('\n Testing valid delivery data...');
  const validResult = validateDeliveryConfirmation({ received_date: '2025-01-25' }, true);
  assert(validResult.valid === true, 'Valid delivery data passes');
  assert(validResult.errors.length === 0, 'No errors');

  // Missing date
  console.log('\n Testing missing date...');
  const noDateResult = validateDeliveryConfirmation({}, true);
  assert(noDateResult.valid === false, 'Missing date fails');
  assert(noDateResult.errors.includes('Confirmation date is required'), 'Error mentions date');

  // Empty date
  console.log('\n Testing empty date...');
  const emptyDateResult = validateDeliveryConfirmation({ received_date: '' }, true);
  assert(emptyDateResult.valid === false, 'Empty date fails');

  // Missing screenshot
  console.log('\n Testing missing screenshot...');
  const noScreenshotResult = validateDeliveryConfirmation({ received_date: '2025-01-25' }, false);
  assert(noScreenshotResult.valid === false, 'Missing screenshot fails');
  assert(noScreenshotResult.errors.includes('Delivery confirmation screenshot is required'), 'Error mentions screenshot');

  // Both missing
  console.log('\n Testing both missing...');
  const bothMissingResult = validateDeliveryConfirmation({}, false);
  assert(bothMissingResult.valid === false, 'Both missing fails');
  assert(bothMissingResult.errors.length === 2, 'Two errors');

  console.log('\n✅ All DELIVERY CONFIRMATION VALIDATION tests passed!');
  return true;
}

// =============================================================================
// TRACKING URL TESTS
// =============================================================================

export async function testTrackingUrl() {
  logSection('TRACKING URL TESTS');

  // USPS tracking
  console.log('\n Testing USPS tracking URL...');
  const uspsUrl = getTrackingUrl('usps', '1234567890');
  assert(uspsUrl !== null, 'USPS URL generated');
  assert(uspsUrl.includes('1234567890'), 'Tracking number in URL');
  assert(uspsUrl.includes('usps.com'), 'USPS domain in URL');

  // UPS tracking
  console.log('\n Testing UPS tracking URL...');
  const upsUrl = getTrackingUrl('ups', 'ABC123456');
  assert(upsUrl !== null, 'UPS URL generated');
  assert(upsUrl.includes('ABC123456'), 'Tracking number in URL');
  assert(upsUrl.includes('ups.com'), 'UPS domain in URL');

  // FedEx tracking
  console.log('\n Testing FedEx tracking URL...');
  const fedexUrl = getTrackingUrl('fedex', '999888777');
  assert(fedexUrl !== null, 'FedEx URL generated');
  assert(fedexUrl.includes('999888777'), 'Tracking number in URL');
  assert(fedexUrl.includes('fedex.com'), 'FedEx domain in URL');

  // Unknown carrier
  console.log('\n Testing unknown carrier...');
  const unknownUrl = getTrackingUrl('unknown_carrier', '123');
  assert(unknownUrl === null, 'Unknown carrier returns null');

  // Empty tracking number
  console.log('\n Testing empty tracking number...');
  const emptyTrackingUrl = getTrackingUrl('usps', '');
  assert(emptyTrackingUrl === null, 'Empty tracking returns null');

  // Null tracking number
  console.log('\n Testing null tracking number...');
  const nullTrackingUrl = getTrackingUrl('usps', null);
  assert(nullTrackingUrl === null, 'Null tracking returns null');

  // Special characters in tracking (should be encoded)
  console.log('\n Testing special characters encoding...');
  const specialUrl = getTrackingUrl('usps', 'ABC 123/456');
  assert(specialUrl !== null, 'URL with special chars generated');
  assert(specialUrl.includes('ABC%20123%2F456') || specialUrl.includes('ABC+123'), 'Special chars encoded');

  console.log('\n✅ All TRACKING URL tests passed!');
  return true;
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

export async function runAllTests() {
  console.log('\n🧪 SELLING MODULE TEST SUITE\n');
  console.log('Testing validation functions for selling pipeline...\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'Pipeline Entry Validation', fn: testPipelineValidation },
    { name: 'Photo Validation', fn: testPhotoValidation },
    { name: 'Listing Data Validation', fn: testListingValidation },
    { name: 'Shipping Data Validation', fn: testShippingValidation },
    { name: 'Delivery Confirmation Validation', fn: testDeliveryValidation },
    { name: 'Tracking URL Generation', fn: testTrackingUrl }
  ];

  for (const test of tests) {
    try {
      await test.fn();
      passed++;
    } catch (err) {
      console.error(`❌ ${test.name} tests failed:`, err.message);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`  TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return { passed, failed };
}

// Export for window access if needed
if (typeof window !== 'undefined') {
  window.sellingTests = {
    runAllTests,
    testPipelineValidation,
    testPhotoValidation,
    testListingValidation,
    testShippingValidation,
    testDeliveryValidation,
    testTrackingUrl
  };
}
