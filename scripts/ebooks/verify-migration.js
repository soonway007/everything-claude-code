#!/usr/bin/env node

/**
 * Ebook Migration Verification Script
 *
 * Verifies that:
 * 1. All links in index.md resolve correctly
 * 2. Folder structure matches the plan
 * 3. No orphan files exist
 * 4. All books have valid frontmatter
 *
 * Usage:
 *   node scripts/ebooks/verify-migration.js --vault "F:\Obsidian-Laifu"
 */

const fs = require('fs');
const path = require('path');

const { listBooks, getVaultStructure, verifyOrganization } = require('../lib/ebook-organizer');
const { verifyIndexLinks } = require('../lib/ebook-indexer');

/**
 * Log with level
 * @param {string} msg
 * @param {string} level
 */
function log(msg, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].substring(0, 8);
  const prefix = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : level === 'success' ? 'OK' : 'INFO';
  console.log(`[${timestamp}] [${prefix}] ${msg}`);
}

/**
 * Parse command-line arguments
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    vaultPath: null,
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--vault' || arg === '-v') {
      parsed.vaultPath = args[i + 1] || null;
      i += 1;
    } else if (arg === '--verbose' || arg === '-V') {
      parsed.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (!arg.startsWith('-')) {
      parsed.vaultPath = arg;
    }
  }

  return parsed;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Ebook Migration Verification

Usage:
  node scripts/ebooks/verify-migration.js --vault <path> [options]

Options:
  --vault, -v <path>    Path to Obsidian vault (required)
  --verbose, -V         Enable verbose output
  --help, -h            Show this help message

Examples:
  node scripts/ebooks/verify-migration.js --vault "F:\\Obsidian-Laifu"
`);
}

/**
 * Verify folder structure matches expected plan
 * Expected: books/{Genre}/{Author}/{title}.md
 * @param {string} vaultPath
 * @returns {{ valid: boolean, issues: string[] }}
 */
function verifyFolderStructure(vaultPath) {
  const issues = [];
  const booksDir = path.join(vaultPath, 'books');
  const attachmentsDir = path.join(vaultPath, 'attachments');

  // Check root directories exist
  if (!fs.existsSync(vaultPath)) {
    issues.push(`Vault directory does not exist: ${vaultPath}`);
    return { valid: false, issues };
  }

  if (!fs.existsSync(booksDir)) {
    issues.push('Books directory (books/) does not exist');
  }

  if (!fs.existsSync(attachmentsDir)) {
    issues.push('Attachments directory (attachments/) does not exist');
  }

  if (!fs.existsSync(path.join(vaultPath, 'index.md'))) {
    issues.push('Master index (index.md) does not exist');
  }

  // Verify structure is Genre/Author/Book
  if (fs.existsSync(booksDir)) {
    const genres = fs.readdirSync(booksDir, { withFileTypes: true });

    for (const genre of genres) {
      if (!genre.isDirectory()) {
        issues.push(`Unexpected file in books/: ${genre.name} (expected directories only)`);
        continue;
      }

      const genrePath = path.join(booksDir, genre.name);
      const authors = fs.readdirSync(genrePath, { withFileTypes: true });

      for (const author of authors) {
        if (!author.isDirectory()) {
          issues.push(`Unexpected file in books/${genre.name}/: ${author.name} (expected directories only)`);
          continue;
        }

        const authorPath = path.join(genrePath, author.name);
        const books = fs.readdirSync(authorPath, { withFileTypes: true });

        for (const book of books) {
          if (!book.isFile() || !book.name.endsWith('.md')) {
            issues.push(`Non-markdown file in book folder: books/${genre.name}/${author.name}/${book.name}`);
          }
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Verify all frontmatter is valid
 * @param {string} vaultPath
 * @returns {{ valid: boolean, issues: string[] }}
 */
function verifyFrontmatter(vaultPath) {
  return verifyOrganization(vaultPath);
}

/**
 * Main verification
 * @param {string} vaultPath
 * @param {boolean} verbose
 */
async function verify(vaultPath, verbose = false) {
  log('Starting verification...');
  log(`Vault: ${vaultPath}`);

  const allIssues = [];
  let allValid = true;

  // 1. Verify folder structure
  log('\n--- Folder Structure ---');
  const structureResult = verifyFolderStructure(vaultPath);
  if (structureResult.valid) {
    log('Folder structure: OK', 'success');
  } else {
    log('Folder structure: FAILED', 'error');
    for (const issue of structureResult.issues) {
      log(`  - ${issue}`, 'error');
    }
    allIssues.push(...structureResult.issues.map((i) => `Structure: ${i}`));
    allValid = false;
  }

  // 2. Verify index links
  log('\n--- Index Links ---');
  const linksResult = verifyIndexLinks(vaultPath);
  if (linksResult.valid) {
    log('Index links: OK', 'success');
  } else {
    log('Index links: FAILED', 'error');
    for (const link of linksResult.brokenLinks) {
      log(`  - Line ${link.line}: ${link.link} (${link.reason})`, 'error');
    }
    allIssues.push(...linksResult.brokenLinks.map((l) => `Link: ${l.link}`));
    allValid = false;
  }

  // 3. Verify frontmatter
  log('\n--- Frontmatter ---');
  const frontmatterResult = verifyFrontmatter(vaultPath);
  if (frontmatterResult.valid) {
    log('Frontmatter: OK', 'success');
  } else {
    log('Frontmatter: FAILED', 'error');
    for (const issue of frontmatterResult.issues) {
      log(`  - ${issue}`, 'error');
    }
    allIssues.push(...frontmatterResult.issues.map((i) => `Frontmatter: ${i}`));
    allValid = false;
  }

  // 4. List all books found
  log('\n--- Books Summary ---');
  const books = listBooks(vaultPath);
  log(`Total books found: ${books.length}`);

  if (verbose) {
    const byGenre = {};
    for (const book of books) {
      const genre = book.metadata.genre || 'Unknown';
      byGenre[genre] = (byGenre[genre] || 0) + 1;
    }
    log('\nBooks by genre:');
    for (const [genre, count] of Object.entries(byGenre)) {
      log(`  ${genre}: ${count}`);
    }
  }

  // Summary
  log('\n=== Verification Summary ===');
  if (allValid) {
    log('All checks passed!', 'success');
    process.exit(0);
  } else {
    log(`${allIssues.length} issue(s) found`, 'error');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  const options = parseArgs(process.argv);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (!options.vaultPath) {
    log('Error: --vault is required', 'error');
    showHelp();
    process.exit(1);
  }

  verify(options.vaultPath, options.verbose).catch((error) => {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { verify, verifyFolderStructure, verifyFrontmatter, verifyIndexLinks };
