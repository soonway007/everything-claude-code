/**
 * Tests for EbookFrontmatter module
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  generateFrontmatter,
  parseFrontmatter,
  updateFrontmatter,
  validateFrontmatter,
} = require('../../scripts/lib/ebook-frontmatter');

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
  console.log('\n=== EbookFrontmatter ===\n');

  // Test: generateFrontmatter with required fields
  if (await test('should generate frontmatter with required fields', async () => {
    const metadata = {
      title: 'Dune',
      author: 'Frank Herbert',
      genre: 'Science Fiction',
      tags: ['sci-fi', 'classic'],
      publishedDate: '1965-08-01',
      sourcePath: '/ebooks/dune.epub',
    };
    const markdown = '# Chapter 1\n\nSome content...';
    const hash = 'abc123';
    const result = generateFrontmatter(metadata, markdown, hash);
    if (!result.includes('---')) throw new Error('Missing frontmatter delimiter');
    if (!result.includes('title: Dune')) throw new Error('Missing title');
    if (!result.includes('author: Frank Herbert')) throw new Error('Missing author');
    if (!result.includes('genre: Science Fiction')) throw new Error('Missing genre');
    if (!result.includes('tags:')) throw new Error('Missing tags');
    if (!result.includes('- sci-fi')) throw new Error('Missing tag item');
    if (!result.includes('publishedDate:')) throw new Error('Missing publishedDate');
    if (!result.includes('contentHash: abc123')) throw new Error('Missing contentHash');
    if (!result.includes('# Chapter 1')) throw new Error('Missing markdown content');
  })) passed++; else failed++;

  // Test: defaults for missing optional fields
  if (await test('should use defaults for missing optional fields', async () => {
    const metadata = { title: 'Unknown Book' };
    const result = generateFrontmatter(metadata, '', 'hash');
    if (!result.includes('title: Unknown Book')) throw new Error('Missing title');
    if (!result.includes('author: Unknown')) throw new Error('Missing default author');
    if (!result.includes('genre: Uncategorized')) throw new Error('Missing default genre');
  })) passed++; else failed++;

  // Test: empty tags array
  if (await test('should handle empty tags array', async () => {
    const metadata = {
      title: 'Test',
      author: 'Test Author',
      genre: 'Test',
      tags: [],
      sourcePath: '/test',
    };
    const result = generateFrontmatter(metadata, '', 'hash');
    if (!result.includes('tags:')) throw new Error('Missing tags');
    if (!result.includes('- untagged')) throw new Error('Missing untagged default');
  })) passed++; else failed++;

  // Test: include source file when specified
  if (await test('should include source file when specified', async () => {
    const metadata = {
      title: 'Test',
      author: 'Author',
      genre: 'Genre',
      sourcePath: '/ebooks/test.pdf',
    };
    const result = generateFrontmatter(metadata, '', 'hash', { includeSource: true });
    if (!result.includes('sourceFile: /ebooks/test.pdf')) throw new Error('Missing sourceFile');
  })) passed++; else failed++;

  // Test: parseFrontmatter with valid frontmatter
  if (await test('should parse valid frontmatter and content', async () => {
    const content = `---
title: Dune
author: Frank Herbert
---

# Chapter 1`;
    const { frontmatter, content: body } = parseFrontmatter(content);
    if (!frontmatter) throw new Error('Frontmatter should be parsed');
    if (frontmatter.title !== 'Dune') throw new Error('Title mismatch');
    if (frontmatter.author !== 'Frank Herbert') throw new Error('Author mismatch');
    if (!body.includes('# Chapter 1')) throw new Error('Body content missing');
  })) passed++; else failed++;

  // Test: parseFrontmatter with no frontmatter
  if (await test('should return original content if no frontmatter', async () => {
    const content = '# Just a header\n\nNo frontmatter here.';
    const { frontmatter, content: body } = parseFrontmatter(content);
    if (frontmatter !== null) throw new Error('Frontmatter should be null');
    if (body !== content) throw new Error('Body should be original content');
  })) passed++; else failed++;

  // Test: updateFrontmatter
  if (await test('should update existing frontmatter fields', async () => {
    const content = `---
title: Old Title
author: Old Author
genre: Old Genre
---

Content here`;
    const result = updateFrontmatter(content, { title: 'New Title' });
    if (!result.includes('title: New Title')) throw new Error('Title not updated');
    if (!result.includes('author: Old Author')) throw new Error('Author should be preserved');
  })) passed++; else failed++;

  // Test: validateFrontmatter with complete frontmatter
  if (await test('should return valid for complete frontmatter', async () => {
    const frontmatter = {
      title: 'Test',
      author: 'Author',
      genre: 'Genre',
      tags: ['tag1'],
      publishedDate: '2020-01-01',
    };
    const result = validateFrontmatter(frontmatter);
    if (!result.valid) throw new Error('Should be valid');
    if (result.errors.length !== 0) throw new Error('Should have no errors');
  })) passed++; else failed++;

  // Test: validateFrontmatter with missing required fields
  if (await test('should return errors for missing required fields', async () => {
    const frontmatter = { title: 'Test' };
    const result = validateFrontmatter(frontmatter);
    if (result.valid) throw new Error('Should not be valid');
    if (!result.errors.includes('Missing required field: author')) throw new Error('Missing author error');
    if (!result.errors.includes('Missing required field: genre')) throw new Error('Missing genre error');
    if (!result.errors.includes('Missing required field: tags')) throw new Error('Missing tags error');
  })) passed++; else failed++;

  // Test: validateFrontmatter with non-array tags
  if (await test('should return error for non-array tags', async () => {
    const frontmatter = {
      title: 'Test',
      author: 'Author',
      genre: 'Genre',
      tags: 'not-an-array',
    };
    const result = validateFrontmatter(frontmatter);
    if (result.valid) throw new Error('Should not be valid');
    if (!result.errors.includes('tags must be an array')) throw new Error('Tags type error missing');
  })) passed++; else failed++;

  // Test: validateFrontmatter with invalid date format
  if (await test('should return error for invalid date format', async () => {
    const frontmatter = {
      title: 'Test',
      author: 'Author',
      genre: 'Genre',
      tags: [],
      publishedDate: '01/01/2020',
    };
    const result = validateFrontmatter(frontmatter);
    if (result.valid) throw new Error('Should not be valid');
    if (!result.errors.includes('publishedDate must be in YYYY-MM-DD format')) {
      throw new Error('Date format error missing');
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
