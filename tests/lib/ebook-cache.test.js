/**
 * Tests for EbookCache module
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Create temp directory for tests
const TEST_CACHE_DIR = path.join(os.tmpdir(), 'ebook-cache-test-' + Date.now());

// Clean up before tests
if (fs.existsSync(TEST_CACHE_DIR)) {
  fs.rmSync(TEST_CACHE_DIR, { recursive: true });
}
fs.mkdirSync(TEST_CACHE_DIR, { recursive: true });

// Clean up after tests
process.on('exit', () => {
  if (fs.existsSync(TEST_CACHE_DIR)) {
    fs.rmSync(TEST_CACHE_DIR, { recursive: true });
  }
});

const EbookCache = require('../../scripts/lib/ebook-cache');

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    return true;
  } catch (error) {
    console.log(`  \u2717 ${name}`);
    console.log(`    Error: ${error.message}`);
    return false;
  }
}

let passed = 0;
let failed = 0;

async function runTests() {
  console.log('\n=== EbookCache ===\n');

  // Test: constructor creates cache directory
  if (await test('should create cache directory if it does not exist', async () => {
    const testDir = path.join(os.tmpdir(), 'ebook-cache-test-' + Date.now());
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
    const cache = new EbookCache(testDir);
    if (!fs.existsSync(testDir)) {
      throw new Error('Cache directory was not created');
    }
    fs.rmSync(testDir, { recursive: true });
  })) passed++; else failed++;

  // Test: computeHash
  if (await test('should compute consistent hash for same content', async () => {
    const cache = new EbookCache(TEST_CACHE_DIR);
    const testFile = path.join(TEST_CACHE_DIR, 'test.txt');
    fs.writeFileSync(testFile, 'hello world');
    const hash1 = await cache.computeHash(testFile);
    const hash2 = await cache.computeHash(testFile);
    if (hash1 !== hash2) throw new Error('Hashes do not match');
    if (!/^[a-f0-9]{64}$/.test(hash1)) throw new Error('Invalid hash format');
  })) passed++; else failed++;

  if (await test('should compute different hash for different content', async () => {
    const cache = new EbookCache(TEST_CACHE_DIR);
    const testFile1 = path.join(TEST_CACHE_DIR, 'test1.txt');
    const testFile2 = path.join(TEST_CACHE_DIR, 'test2.txt');
    fs.writeFileSync(testFile1, 'hello world');
    fs.writeFileSync(testFile2, 'hello world!');
    const hash1 = await cache.computeHash(testFile1);
    const hash2 = await cache.computeHash(testFile2);
    if (hash1 === hash2) throw new Error('Hashes should be different');
  })) passed++; else failed++;

  // Test: has/get/set
  if (await test('should return false for non-existent hash', async () => {
    const cache = new EbookCache(TEST_CACHE_DIR);
    if (cache.has('nonexistent') !== false) throw new Error('Should return false');
  })) passed++; else failed++;

  if (await test('should return null for non-existent hash', async () => {
    const cache = new EbookCache(TEST_CACHE_DIR);
    if (cache.get('nonexistent') !== null) throw new Error('Should return null');
  })) passed++; else failed++;

  if (await test('should store and retrieve cache entry', async () => {
    const cache = new EbookCache(TEST_CACHE_DIR);
    const hash = 'abc123';
    const destFile = path.join(TEST_CACHE_DIR, 'book.md');
    fs.writeFileSync(destFile, '# Test Book');
    const entry = { source: '/path/to/book.epub', dest: destFile };
    cache.set(hash, entry);
    if (cache.has(hash) !== true) throw new Error('has() should return true');
    const retrieved = cache.get(hash);
    if (retrieved.source !== entry.source) throw new Error('Source mismatch');
  })) passed++; else failed++;

  // Test: invalidate
  if (await test('should remove cache entry', async () => {
    const cache = new EbookCache(TEST_CACHE_DIR);
    const hash = 'abc123';
    const destFile = path.join(TEST_CACHE_DIR, 'book2.md');
    fs.writeFileSync(destFile, '# Test Book 2');
    const entry = { source: '/path/to/book.epub', dest: destFile };
    cache.set(hash, entry);
    if (cache.has(hash) !== true) throw new Error('has() should return true before invalidate');
    cache.invalidate(hash);
    if (cache.has(hash) !== false) throw new Error('has() should return false after invalidate');
  })) passed++; else failed++;

  // Test: clear
  if (await test('should remove all cache entries', async () => {
    const cache = new EbookCache(TEST_CACHE_DIR);
    cache.set('hash1', { source: '/path1' });
    cache.set('hash2', { source: '/path2' });
    cache.set('hash3', { source: '/path3' });
    if (cache.stats().count !== 3) throw new Error('Should have 3 entries');
    cache.clear();
    if (cache.stats().count !== 0) throw new Error('Should have 0 entries after clear');
  })) passed++; else failed++;

  // Test: stats
  if (await test('should return correct count and size', async () => {
    const cache = new EbookCache(TEST_CACHE_DIR);
    cache.clear();
    if (cache.stats().count !== 0) throw new Error('Should have 0 count initially');
    cache.set('hash1', { source: '/path1' });
    if (cache.stats().count !== 1) throw new Error('Should have 1 after first set');
    cache.set('hash2', { source: '/path2' });
    if (cache.stats().count !== 2) throw new Error('Should have 2 after second set');
  })) passed++; else failed++;

  // Test: list
  if (await test('should return all cache entries', async () => {
    const cache = new EbookCache(TEST_CACHE_DIR);
    cache.clear();
    cache.set('hash1', { source: '/path1', title: 'Book 1' });
    cache.set('hash2', { source: '/path2', title: 'Book 2' });
    const entries = cache.list();
    if (entries.length !== 2) throw new Error(`Expected 2 entries, got ${entries.length}`);
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}\n`);
}

runTests().then(() => {
  process.exit(failed > 0 ? 1 : 0);
}).catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
