/**
 * PWA functionality tests
 * Tests service worker asset caching, offline support, and background sync
 */

import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Polyfill crypto
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

// Get project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..', '..');

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
// TEST SUITE
// =============================================================================

export async function runAllTests() {
  console.log('\n🔧 PWA FUNCTIONALITY TESTS\n');

  let passed = 0;
  let failed = 0;

  // =============================================================================
  // TEST 1: Service Worker Asset Coverage
  // =============================================================================
  try {
    logSection('SERVICE WORKER ASSET COVERAGE');

    // Read sw.js to extract ASSETS array
    const swContent = readFileSync(join(projectRoot, 'sw.js'), 'utf-8');
    const assetsMatch = swContent.match(/const ASSETS = \[([\s\S]*?)\];/);
    assert(assetsMatch, 'ASSETS array found in sw.js');

    // Extract asset paths from the array
    const assetsStr = assetsMatch[1];
    const assetPaths = assetsStr.match(/['"]([^'"]+)['"]/g)
      ?.map(s => s.replace(/['"]/g, ''))
      .filter(s => s.startsWith('/')) || [];

    console.log(`\n  Found ${assetPaths.length} assets in ASSETS array`);

    // Check for essential files
    const essentials = [
      '/',
      '/index.html',
      '/offline.html',
      '/styles.css',
      '/manifest.json',
      '/js/app.js',
      '/js/db.js',
      '/js/config.js'
    ];

    console.log('\n  Checking essential files...');
    for (const file of essentials) {
      assert(assetPaths.includes(file), `Essential file cached: ${file}`);
    }

    // Check for core modules
    const coreModules = [
      '/js/components.js',
      '/js/inventory.js',
      '/js/selling.js',
      '/js/sync.js',
      '/js/core/google-drive.js'
    ];

    console.log('\n  Checking core modules...');
    for (const mod of coreModules) {
      assert(assetPaths.includes(mod), `Core module cached: ${mod}`);
    }

    // Check for reference data
    const dataFiles = [
      '/data/platforms.json',
      '/data/brands-clothing-shoes.json',
      '/data/materials.json'
    ];

    console.log('\n  Checking reference data...');
    for (const data of dataFiles) {
      assert(assetPaths.includes(data), `Reference data cached: ${data}`);
    }

    console.log('\n✅ Service worker asset coverage tests passed!');
    passed++;
  } catch (err) {
    console.error('❌ Service worker tests failed:', err.message);
    failed++;
  }

  // =============================================================================
  // TEST 2: Manifest Validation
  // =============================================================================
  try {
    logSection('MANIFEST VALIDATION');

    const manifestContent = readFileSync(join(projectRoot, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestContent);

    console.log('\n  Checking required fields...');
    assert(manifest.name, 'name field present');
    assert(manifest.short_name, 'short_name field present');
    assert(manifest.start_url, 'start_url field present');
    assert(manifest.display, 'display field present');
    assert(manifest.icons?.length > 0, 'icons array present');

    console.log('\n  Checking Android-specific fields...');
    assert(manifest.id, 'id field present for PWA identity');
    assert(manifest.scope, 'scope field present');
    assert(manifest.theme_color, 'theme_color field present');
    assert(manifest.background_color, 'background_color field present');

    console.log('\n  Checking icon specifications...');
    const has192 = manifest.icons.some(i => i.sizes === '192x192');
    const has512 = manifest.icons.some(i => i.sizes === '512x512');
    const hasMaskable = manifest.icons.some(i => i.purpose === 'maskable');

    assert(has192, '192x192 icon specified');
    assert(has512, '512x512 icon specified');
    assert(hasMaskable, 'Maskable icon specified for adaptive icons');

    console.log('\n  Checking display mode...');
    assert(manifest.display === 'standalone', 'Display mode is standalone');

    console.log('\n✅ Manifest validation tests passed!');
    passed++;
  } catch (err) {
    console.error('❌ Manifest tests failed:', err.message);
    failed++;
  }

  // =============================================================================
  // TEST 3: Offline Page Existence
  // =============================================================================
  try {
    logSection('OFFLINE PAGE VALIDATION');

    const offlineContent = readFileSync(join(projectRoot, 'offline.html'), 'utf-8');

    console.log('\n  Checking offline page structure...');
    assert(offlineContent.includes('<!DOCTYPE html>'), 'Valid HTML5 document');
    assert(offlineContent.includes('offline') || offlineContent.includes('Offline'), 'Contains offline messaging');
    assert(offlineContent.includes('retryConnection') || offlineContent.includes('reload'), 'Has retry functionality');
    assert(offlineContent.includes('navigator.onLine'), 'Checks online status');

    console.log('\n✅ Offline page validation tests passed!');
    passed++;
  } catch (err) {
    console.error('❌ Offline page tests failed:', err.message);
    failed++;
  }

  // =============================================================================
  // TEST 4: Background Sync Configuration
  // =============================================================================
  try {
    logSection('BACKGROUND SYNC CONFIGURATION');

    // Check sw.js for background sync
    const swContent = readFileSync(join(projectRoot, 'sw.js'), 'utf-8');

    console.log('\n  Checking service worker sync handler...');
    assert(swContent.includes("'sync'"), 'Sync event listener present');
    assert(swContent.includes('SYNC_TAG'), 'Sync tag defined');
    assert(swContent.includes('SYNC_REQUESTED'), 'Sync message type defined');

    // Check sync.js for background sync support
    const syncContent = readFileSync(join(projectRoot, 'js', 'sync.js'), 'utf-8');

    console.log('\n  Checking sync.js background sync integration...');
    assert(syncContent.includes('SYNC_REQUESTED'), 'Listens for sync messages');
    assert(syncContent.includes('requestBackgroundSync'), 'requestBackgroundSync function exported');
    assert(syncContent.includes('setupBackgroundSyncListener'), 'Background sync listener setup');

    console.log('\n✅ Background sync configuration tests passed!');
    passed++;
  } catch (err) {
    console.error('❌ Background sync tests failed:', err.message);
    failed++;
  }

  // =============================================================================
  // TEST 5: Cache Strategy Validation
  // =============================================================================
  try {
    logSection('CACHE STRATEGY VALIDATION');

    const swContent = readFileSync(join(projectRoot, 'sw.js'), 'utf-8');

    console.log('\n  Checking caching strategies...');
    assert(swContent.includes('cache-first') || swContent.includes('caches.match'), 'Cache-first strategy for assets');
    assert(swContent.includes('googleapis.com'), 'Special handling for Google APIs');
    assert(swContent.includes('network-first') || swContent.includes('fetch(event.request)'), 'Network-first for API calls');

    console.log('\n  Checking cache versioning...');
    const cacheNameMatch = swContent.match(/const CACHE_NAME = ['"]([^'"]+)['"]/);
    assert(cacheNameMatch, 'Cache name defined');
    console.log(`    Cache name: ${cacheNameMatch[1]}`);

    console.log('\n  Checking cache cleanup...');
    assert(swContent.includes('activate'), 'Activate event handler present');
    assert(swContent.includes('caches.delete'), 'Old cache cleanup implemented');

    console.log('\n✅ Cache strategy validation tests passed!');
    passed++;
  } catch (err) {
    console.error('❌ Cache strategy tests failed:', err.message);
    failed++;
  }

  // =============================================================================
  // RESULTS
  // =============================================================================
  console.log('\n' + '='.repeat(50));
  console.log(`  PWA TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50) + '\n');

  return { passed, failed };
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAllTests().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  });
}
