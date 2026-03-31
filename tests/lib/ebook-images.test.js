/**
 * Tests for EbookImages module
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  rewriteImageLinks,
  verifyImageLinks,
  slugify,
} = require('../../scripts/lib/ebook-images');

const TEST_VAULT = path.join(os.tmpdir(), 'ebook-images-test-' + Date.now());

if (!fs.existsSync(TEST_VAULT)) {
  fs.mkdirSync(TEST_VAULT, { recursive: true });
}

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
  console.log('\n=== EbookImages ===\n');

  // Test: slugify
  if (await test('should convert to lowercase and replace spaces with hyphens', async () => {
    if (slugify('Hello World') !== 'hello-world') throw new Error('Slugify failed');
  })) passed++; else failed++;

  if (await test('should remove non-alphanumeric characters', async () => {
    if (slugify('file@name') !== 'file-name') throw new Error('Slugify failed for @');
  })) passed++; else failed++;

  if (await test('should remove leading/trailing hyphens', async () => {
    if (slugify('---test---') !== 'test') throw new Error('Slugify failed for hyphens');
  })) passed++; else failed++;

  // Test: rewriteImageLinks adds attachments prefix
  if (await test('should add attachments prefix to relative image paths', async () => {
    const markdown = '![Image](image.png)';
    const metadata = { title: 'Test Book' };
    const result = rewriteImageLinks(markdown, metadata);
    if (!result.includes('attachments/test-book/image.png')) {
      throw new Error('Attachments prefix not added');
    }
  })) passed++; else failed++;

  // Test: rewriteImageLinks preserves already prefixed paths
  if (await test('should not modify already prefixed paths', async () => {
    const markdown = '![Image](attachments/test-book/image.png)';
    const metadata = { title: 'Test Book' };
    const result = rewriteImageLinks(markdown, metadata);
    if (result !== markdown) throw new Error('Already prefixed path was modified');
  })) passed++; else failed++;

  // Test: rewriteImageLinks handles external URLs
  if (await test('should comment out external URLs with placeholder', async () => {
    const markdown = '![Image](https://example.com/image.png)';
    const metadata = { title: 'Test' };
    const result = rewriteImageLinks(markdown, metadata);
    if (!result.includes('<!-- External image:')) throw new Error('External image not commented');
    if (!result.includes('external-placeholder.png')) throw new Error('Placeholder not added');
  })) passed++; else failed++;

  // Test: rewriteImageLinks handles data URLs
  if (await test('should handle data URLs gracefully', async () => {
    const markdown = '![Image](data:image/png;base64,abc123)';
    const metadata = { title: 'Test' };
    const result = rewriteImageLinks(markdown, metadata);
    if (!result.includes('data:image/png;base64,abc123')) throw new Error('Data URL was modified');
  })) passed++; else failed++;

  // Test: rewriteImageLinks handles multiple images
  if (await test('should handle multiple images', async () => {
    const markdown = `![Image1](photo.jpg)
![Image2](diagram.svg)
![Image3](screenshot.png)`;
    const metadata = { title: 'My Book' };
    const result = rewriteImageLinks(markdown, metadata);
    if (!result.includes('attachments/my-book/photo.jpg')) throw new Error('photo.jpg not prefixed');
    if (!result.includes('attachments/my-book/diagram.svg')) throw new Error('diagram.svg not prefixed');
    if (!result.includes('attachments/my-book/screenshot.png')) throw new Error('screenshot.png not prefixed');
  })) passed++; else failed++;

  // Test: verifyImageLinks returns valid when all images exist
  if (await test('should return valid when all images exist', async () => {
    const attachmentsDir = path.join(TEST_VAULT, 'attachments', 'test-book');
    fs.mkdirSync(attachmentsDir, { recursive: true });
    fs.writeFileSync(path.join(attachmentsDir, 'image.png'), 'fake image');
    const markdown = '![Image](attachments/test-book/image.png)';
    const result = verifyImageLinks(markdown, TEST_VAULT, 'test-book');
    if (!result.valid) throw new Error(`Should be valid: ${result.missingImages.join(', ')}`);
  })) passed++; else failed++;

  // Test: verifyImageLinks returns invalid for missing images
  if (await test('should return invalid when images are missing', async () => {
    const markdown = '![Image](attachments/test-book/missing.png)';
    const result = verifyImageLinks(markdown, TEST_VAULT, 'test-book');
    if (result.valid) throw new Error('Should be invalid');
    if (!result.missingImages.includes('attachments/test-book/missing.png')) {
      throw new Error('Missing image not reported');
    }
  })) passed++; else failed++;

  // Test: verifyImageLinks skips external URLs
  if (await test('should skip external URLs', async () => {
    const markdown = '![Image](https://example.com/image.png)';
    const result = verifyImageLinks(markdown, TEST_VAULT, 'test-book');
    if (!result.valid) throw new Error('External URL should be skipped');
  })) passed++; else failed++;

  // Test: verifyImageLinks skips data URLs
  if (await test('should skip data URLs', async () => {
    const markdown = '![Image](data:image/png;base64,abc)';
    const result = verifyImageLinks(markdown, TEST_VAULT, 'test-book');
    if (!result.valid) throw new Error('Data URL should be skipped');
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}\n`);
}

runTests().then(() => {
  process.exit(failed > 0 ? 1 : 0);
}).catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
