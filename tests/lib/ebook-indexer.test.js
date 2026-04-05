/**
 * Tests for EbookIndexer module
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_VAULT = path.join(os.tmpdir(), 'ebook-indexer-test-' + Date.now());

if (!fs.existsSync(TEST_VAULT)) {
  fs.mkdirSync(TEST_VAULT, { recursive: true });
}

const {
  generateIndex,
  generateIndexContent,
  verifyIndexLinks,
  slugify,
} = require('../../scripts/lib/ebook-indexer');

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
  console.log('\n=== EbookIndexer ===\n');

  // Test: slugify
  if (await test('should convert to lowercase and replace spaces with hyphens', async () => {
    if (slugify('Hello World') !== 'hello-world') throw new Error('Failed');
  })) passed++; else failed++;

  // Test: generateIndexContent generates index with stats
  if (await test('should generate index with stats', async () => {
    const booksDir = path.join(TEST_VAULT, 'books', 'Genre', 'Author');
    fs.mkdirSync(booksDir, { recursive: true });
    const bookPath = path.join(booksDir, 'Test Book.md');
    fs.writeFileSync(bookPath, `---
title: Test Book
author: Test Author
genre: Genre
publishedDate: 2020-01-01
---

# Content`);

    const content = await generateIndexContent([bookPath], { vaultPath: TEST_VAULT });
    if (!content.includes('# Ebook Library Index')) throw new Error('Missing header');
    if (!content.includes('**Total Books**: 1')) throw new Error('Missing book count');
    if (!content.includes('**Genres**: 1')) throw new Error('Missing genre count');
  })) passed++; else failed++;

  // Test: generateIndexContent includes dataview query
  if (await test('should include dataview query by default', async () => {
    const booksDir = path.join(TEST_VAULT, 'books', 'Genre2', 'Author2');
    fs.mkdirSync(booksDir, { recursive: true });
    const bookPath = path.join(booksDir, 'Test.md');
    fs.writeFileSync(bookPath, `---
title: Test
author: Author
genre: Genre
---

Content`);

    const content = await generateIndexContent([bookPath]);
    if (!content.includes('```dataview')) throw new Error('Missing dataview');
    if (!content.includes('TABLE title, author, genre, publishedDate')) {
      throw new Error('Missing dataview query');
    }
    if (!content.includes('FROM "books"')) throw new Error('Missing FROM clause');
  })) passed++; else failed++;

  // Test: generateIndexContent groups books by genre
  if (await test('should group books by genre', async () => {
    const booksDir = path.join(TEST_VAULT, 'books');
    const fictionDir = path.join(booksDir, 'Fiction', 'Author1');
    const nonFictionDir = path.join(booksDir, 'Non-Fiction', 'Author2');
    fs.mkdirSync(fictionDir, { recursive: true });
    fs.mkdirSync(nonFictionDir, { recursive: true });

    fs.writeFileSync(path.join(fictionDir, 'Book1.md'), `---
title: Book1
author: Author1
genre: Fiction
---

`);
    fs.writeFileSync(path.join(nonFictionDir, 'Book2.md'), `---
title: Book2
author: Author2
genre: Non-Fiction
---

`);

    const content = await generateIndexContent(
      [
        path.join(fictionDir, 'Book1.md'),
        path.join(nonFictionDir, 'Book2.md'),
      ],
      { vaultPath: TEST_VAULT }
    );

    if (!content.includes('## By Genre')) throw new Error('Missing genre section');
    if (!content.includes('### Fiction')) throw new Error('Missing Fiction subsection');
    if (!content.includes('### Non-Fiction')) throw new Error('Missing Non-Fiction subsection');
  })) passed++; else failed++;

  // Test: generateIndexContent groups books by author
  if (await test('should group books by author', async () => {
    const booksDir = path.join(TEST_VAULT, 'books', 'Genre3');
    const authorDir = path.join(booksDir, 'Same Author');
    fs.mkdirSync(authorDir, { recursive: true });

    fs.writeFileSync(path.join(authorDir, 'Book1.md'), `---
title: Book1
author: Same Author
genre: Genre
---

`);
    fs.writeFileSync(path.join(authorDir, 'Book2.md'), `---
title: Book2
author: Same Author
genre: Genre
---

`);

    const content = await generateIndexContent(
      [
        path.join(authorDir, 'Book1.md'),
        path.join(authorDir, 'Book2.md'),
      ],
      { vaultPath: TEST_VAULT }
    );

    if (!content.includes('## By Author')) throw new Error('Missing author section');
    if (!content.includes('### Same Author')) throw new Error('Missing Same Author subsection');
  })) passed++; else failed++;

  // Test: generateIndexContent handles files without frontmatter
  if (await test('should handle files without frontmatter', async () => {
    const booksDir = path.join(TEST_VAULT, 'books', 'Genre4', 'Author4');
    fs.mkdirSync(booksDir, { recursive: true });
    const bookPath = path.join(booksDir, 'NoFrontmatter.md');
    fs.writeFileSync(bookPath, '# Just a header\n\nContent without frontmatter');

    const content = await generateIndexContent([bookPath], { vaultPath: TEST_VAULT });

    if (!content.includes('NoFrontmatter')) throw new Error('Missing book title');
    if (!content.includes('**Total Books**: 1')) throw new Error('Missing book count');
  })) passed++; else failed++;

  // Test: generateIndex creates index.md file
  if (await test('should create index.md file', async () => {
    const booksDir = path.join(TEST_VAULT, 'books', 'Genre5', 'Author5');
    fs.mkdirSync(booksDir, { recursive: true });
    const bookPath = path.join(booksDir, 'Book.md');
    fs.writeFileSync(bookPath, `---
title: Book
author: Author
genre: Genre
---

`);

    await generateIndex(TEST_VAULT, [bookPath]);

    const indexPath = path.join(TEST_VAULT, 'index.md');
    if (!fs.existsSync(indexPath)) throw new Error('index.md not created');
  })) passed++; else failed++;

  // Test: verifyIndexLinks returns valid for working links
  if (await test('should return valid for index with working links', async () => {
    const booksDir = path.join(TEST_VAULT, 'books', 'Genre6', 'Author6');
    fs.mkdirSync(booksDir, { recursive: true });
    const bookPath = path.join(booksDir, 'Existing Book.md');
    fs.writeFileSync(bookPath, `---
title: Existing Book
author: Author
genre: Genre
---

`);

    const indexPath = path.join(TEST_VAULT, 'index.md');
    const content = `# Index

- [[books/Genre6/Author6/Existing Book|Existing Book]]`;
    fs.writeFileSync(indexPath, content);

    const result = verifyIndexLinks(TEST_VAULT);
    if (!result.valid) {
      throw new Error(`Should be valid: ${JSON.stringify(result.brokenLinks)}`);
    }
  })) passed++; else failed++;

  // Test: verifyIndexLinks returns invalid for broken links
  if (await test('should return invalid for broken links', async () => {
    const indexPath = path.join(TEST_VAULT, 'index.md');
    const content = `# Index

- [[books/Genre/Author/Missing Book|Missing Book]]`;
    fs.writeFileSync(indexPath, content);

    const result = verifyIndexLinks(TEST_VAULT);
    if (result.valid) throw new Error('Should be invalid');
    if (result.brokenLinks.length === 0) throw new Error('Should have broken links');
  })) passed++; else failed++;

  // Test: verifyIndexLinks returns invalid if index does not exist
  if (await test('should return invalid if index does not exist', async () => {
    const noIndexVault = path.join(os.tmpdir(), 'no-index-vault-' + Date.now());
    fs.mkdirSync(noIndexVault, { recursive: true });

    const result = verifyIndexLinks(noIndexVault);
    if (result.valid) throw new Error('Should be invalid');
  })) passed++; else failed++;

  console.log(`\nResults: Passed: ${passed}, Failed: ${failed}\n`);
}

runTests().then(() => {
  process.exit(failed > 0 ? 1 : 0);
}).catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
