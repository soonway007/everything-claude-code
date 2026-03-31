/**
 * Tests for EbookOrganizer module
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_VAULT = path.join(os.tmpdir(), 'ebook-vault-test-' + Date.now());

if (fs.existsSync(TEST_VAULT)) {
  fs.rmSync(TEST_VAULT, { recursive: true });
}
fs.mkdirSync(TEST_VAULT, { recursive: true });

const {
  organizeBook,
  listBooks,
  getRelativePath,
  getVaultStructure,
  verifyOrganization,
  sanitizeFilename,
  slugify,
  ensureDir,
  uniqueFilename,
} = require('../../scripts/lib/ebook-organizer');

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
  console.log('\n=== EbookOrganizer ===\n');

  // Test: sanitizeFilename removes invalid characters
  if (await test('should remove invalid characters', async () => {
    if (sanitizeFilename('file<name>') !== 'file-name-') throw new Error('<> not replaced');
    if (sanitizeFilename('file:name') !== 'file-name') throw new Error(': not replaced');
    if (sanitizeFilename('file"name') !== 'file-name') throw new Error('" not replaced');
    if (sanitizeFilename('file\\name') !== 'file-name') throw new Error('\\ not replaced');
    if (sanitizeFilename('file|name') !== 'file-name') throw new Error('| not replaced');
    if (sanitizeFilename('file?name') !== 'file-name') throw new Error('? not replaced');
  })) passed++; else failed++;

  if (await test('should replace multiple spaces with single space', async () => {
    if (sanitizeFilename('file   name') !== 'file name') throw new Error('Multiple spaces not handled');
  })) passed++; else failed++;

  if (await test('should trim whitespace', async () => {
    if (sanitizeFilename('  file name  ') !== 'file name') throw new Error('Trim failed');
  })) passed++; else failed++;

  if (await test('should limit length to 200 chars', async () => {
    const longName = 'a'.repeat(300);
    if (sanitizeFilename(longName).length > 200) throw new Error('Length not limited');
  })) passed++; else failed++;

  if (await test('should return unknown for empty string', async () => {
    if (sanitizeFilename('') !== 'unknown') throw new Error('Empty should return unknown');
    if (sanitizeFilename(null) !== 'unknown') throw new Error('Null should return unknown');
  })) passed++; else failed++;

  // Test: slugify
  if (await test('should convert to lowercase and replace spaces with hyphens', async () => {
    if (slugify('Hello World') !== 'hello-world') throw new Error('Failed');
    if (slugify('Test File Name') !== 'test-file-name') throw new Error('Failed');
  })) passed++; else failed++;

  if (await test('should remove non-alphanumeric characters', async () => {
    if (slugify('file@#$%name') !== 'file-name') throw new Error('Failed');
  })) passed++; else failed++;

  if (await test('should remove leading/trailing hyphens', async () => {
    if (slugify('---test---') !== 'test') throw new Error('Failed');
  })) passed++; else failed++;

  // Test: uniqueFilename
  if (await test('should return original path if no collision', async () => {
    const testPath = path.join(TEST_VAULT, 'unique.txt');
    if (uniqueFilename(testPath) !== testPath) throw new Error('Should return original');
  })) passed++; else failed++;

  if (await test('should add suffix if file exists', async () => {
    const testPath = path.join(TEST_VAULT, 'duplicate.txt');
    fs.writeFileSync(testPath, 'original');
    const result = uniqueFilename(testPath);
    if (result === testPath) throw new Error('Should return different path');
    if (!result.includes('-1')) throw new Error('Should include -1 suffix');
  })) passed++; else failed++;

  // Test: ensureDir
  if (await test('should create directory if it does not exist', async () => {
    const testDir = path.join(TEST_VAULT, 'new-dir-' + Date.now());
    if (fs.existsSync(testDir)) throw new Error('Dir should not exist');
    ensureDir(testDir);
    if (!fs.existsSync(testDir)) throw new Error('Dir should exist after ensureDir');
  })) passed++; else failed++;

  // Test: getRelativePath
  if (await test('should return relative path with forward slashes', async () => {
    const vault = '/vault';
    const file = '/vault/books/genre/author/book.md';
    const result = getRelativePath(file, vault);
    if (result !== 'books/genre/author/book.md') throw new Error(`Got: ${result}`);
  })) passed++; else failed++;

  // Test: organizeBook creates folder structure
  if (await test('should create folder structure based on metadata', async () => {
    const content = `---
title: Dune
author: Frank Herbert
genre: Science Fiction
---

# Dune`;
    const metadata = {
      title: 'Dune',
      author: 'Frank Herbert',
      genre: 'Science Fiction',
    };
    const result = await organizeBook(content, metadata, TEST_VAULT);
    if (!result.includes('Science Fiction')) throw new Error('Missing genre folder');
    if (!result.includes('Frank Herbert')) throw new Error('Missing author folder');
    if (!fs.existsSync(result)) throw new Error('Book file not created');
  })) passed++; else failed++;

  // Test: organizeBook uses defaults for missing metadata
  if (await test('should use defaults for missing metadata', async () => {
    const content = '# Content';
    const metadata = { title: 'Test Book' };
    const result = await organizeBook(content, metadata, TEST_VAULT);
    if (!result.includes('Uncategorized')) throw new Error('Missing default genre');
    if (!result.includes('Unknown')) throw new Error('Missing default author');
  })) passed++; else failed++;

  // Test: listBooks returns empty for no books
  if (await test('should return empty array if no books directory', async () => {
    const emptyVault = path.join(os.tmpdir(), 'empty-vault-' + Date.now());
    fs.mkdirSync(emptyVault);
    const books = listBooks(emptyVault);
    if (books.length !== 0) throw new Error(`Expected 0, got ${books.length}`);
  })) passed++; else failed++;

  // Test: listBooks finds markdown files
  if (await test('should list all markdown files in books directory', async () => {
    // Clean up first
    const booksDir = path.join(TEST_VAULT, 'books');
    if (fs.existsSync(booksDir)) {
      fs.rmSync(booksDir, { recursive: true });
    }

    const genreDir = path.join(booksDir, 'Test Genre');
    const authorDir = path.join(genreDir, 'Test Author');
    fs.mkdirSync(authorDir, { recursive: true });
    const bookFile = path.join(authorDir, 'Test Book.md');
    fs.writeFileSync(bookFile, `---
title: Test Book
author: Test Author
genre: Test Genre
---

# Test`);

    const books = listBooks(TEST_VAULT);
    if (books.length !== 1) throw new Error(`Expected 1 book, got ${books.length}`);
    if (books[0].metadata.title !== 'Test Book') {
      throw new Error(`Expected "Test Book", got "${books[0].metadata.title}"`);
    }
    if (books[0].metadata.author !== 'Test Author') {
      throw new Error(`Expected "Test Author", got "${books[0].metadata.author}"`);
    }
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}\n`);
}

runTests().then(() => {
  process.exit(failed > 0 ? 1 : 0);
}).catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
