#!/usr/bin/env node

/**
 * Ebook Library Migration CLI
 *
 * Migrates ebooks from a source directory to an Obsidian vault,
 * converting them to Markdown with YAML frontmatter and proper organization.
 *
 * Usage:
 *   node scripts/ebooks/migrate-ebook-lib.js --source "E:\My Documents\My Ebook" --target "F:\Obsidian-Laifu"
 *   node scripts/ebooks/migrate-ebook-lib.js --source "E:\My Documents\My Ebook" --target "F:\Obsidian-Laifu" --no-cache
 *   node scripts/ebooks/migrate-ebook-lib.js --cache-dir ".ebook-cache" --clear-cache
 */

const path = require('path');
const fs = require('fs');

const EbookCache = require('../lib/ebook-cache');
const { extract, slugify } = require('../lib/ebook-metadata');
const { convert } = require('../lib/ebook-converter');
const { generateFrontmatter } = require('../lib/ebook-frontmatter');
const { extractImages, rewriteImageLinks } = require('../lib/ebook-images');
const { organizeBook } = require('../lib/ebook-organizer');
const { generateIndex } = require('../lib/ebook-indexer');

// Supported ebook extensions (ordered by processing complexity)
const EBOOK_EXTENSIONS = ['.epub', '.pdf'];
// Extensions that require Calibre (skip initially for faster processing)
const CALIBRE_EXTENSIONS = ['.mobi', '.azw3'];

/**
 * Log a message with timestamp
 * @param {string} msg
 * @param {string} level
 */
function log(msg, level = 'info') {
  const timestamp = new Date().toISOString().split('T')[1].substring(0, 8);
  const prefix = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';
  console.log(`[${timestamp}] [${prefix}] ${msg}`);
}

/**
 * Find all ebook files in a directory
 * @param {string} dirPath
 * @param {boolean} recursive
 * @returns {string[]}
 */
function findEbooks(dirPath, recursive = true) {
  const results = [];

  if (!fs.existsSync(dirPath)) {
    throw new Error(`Source directory not found: ${dirPath}`);
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory() && recursive) {
      results.push(...findEbooks(fullPath, true));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      // Only process EPUB and PDF for initial migration
      if (EBOOK_EXTENSIONS.includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Parse command-line arguments
 * @param {string[]} argv
 * @returns {Object}
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    source: null,
    target: null,
    cacheDir: '.ebook-cache',
    noCache: false,
    clearCache: false,
    help: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--source' || arg === '-s') {
      parsed.source = args[i + 1] || null;
      i += 1;
    } else if (arg === '--target' || arg === '-t') {
      parsed.target = args[i + 1] || null;
      i += 1;
    } else if (arg === '--cache-dir') {
      parsed.cacheDir = args[i + 1] || '.ebook-cache';
      i += 1;
    } else if (arg === '--no-cache') {
      parsed.noCache = true;
    } else if (arg === '--clear-cache') {
      parsed.clearCache = true;
    } else if (arg === '--verbose' || arg === '-v') {
      parsed.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (!arg.startsWith('-')) {
      // Positional argument - assume it's source
      if (!parsed.source) {
        parsed.source = arg;
      }
    }
  }

  return parsed;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Ebook Library Migration CLI

Usage:
  node scripts/ebooks/migrate-ebook-lib.js --source <path> --target <path> [options]

Options:
  --source, -s <path>      Source directory containing ebook files (required)
  --target, -t <path>      Target Obsidian vault directory (required)
  --cache-dir <path>       Cache directory for content hashes (default: .ebook-cache)
  --no-cache              Skip cache check and reprocess all files
  --clear-cache           Clear cache before starting
  --verbose, -v           Enable verbose output
  --help, -h              Show this help message

Examples:
  # Migrate ebooks from source to vault
  node scripts/ebooks/migrate-ebook-lib.js --source "E:\\My Documents\\My Ebook" --target "F:\\Obsidian-Laifu"

  # Reprocess all files (skip cache)
  node scripts/ebooks/migrate-ebook-lib.js --source "E:\\My Documents\\My Ebook" --target "F:\\Obsidian-Laifu" --no-cache

  # Use custom cache directory
  node scripts/ebooks/migrate-ebook-lib.js --source "E:\\My Documents\\My Ebook" --target "F:\\Obsidian-Laifu" --cache-dir ".my-cache"
`);
}

/**
 * Process a single ebook file
 * @param {string} filePath
 * @param {Object} options
 * @param {EbookCache} cache
 * @returns {Promise<{processed: boolean, skipped: boolean, destPath?: string}>}
 */
async function processEbook(filePath, options, cache) {
  const hash = await cache.computeHash(filePath);

  // Check cache unless --no-cache
  if (!options.noCache && cache.has(hash)) {
    const entry = cache.get(hash);
    log(`Skipping (cached): ${filePath}`, 'warn');
    return { processed: false, skipped: true, destPath: entry.dest };
  }

  log(`Processing: ${filePath}`);

  try {
    // Step 1: Extract metadata
    const metadata = await extract(filePath);
    if (options.verbose) {
      log(`  Title: ${metadata.title}, Author: ${metadata.author}`, 'info');
    }

    // Step 2: Convert to markdown
    const conversionResult = await convert(filePath, options.target, metadata);
    let markdown = conversionResult.markdown;

    // Step 3: Extract and save images
    const imageResult = await extractImages(markdown, filePath, options.target, metadata);
    markdown = imageResult.markdown;

    // Step 4: Rewrite image links to relative paths
    markdown = rewriteImageLinks(markdown, metadata);

    // Step 5: Generate frontmatter
    const content = generateFrontmatter(metadata, markdown, hash);

    // Step 6: Organize into vault
    const destPath = await organizeBook(content, metadata, options.target);

    // Step 7: Update cache
    cache.set(hash, {
      source: filePath,
      dest: destPath,
      metadata,
    });

    log(`Completed: ${metadata.title}`, 'info');
    return { processed: true, skipped: false, destPath };
  } catch (error) {
    log(`Failed to process ${filePath}: ${error.message}`, 'error');
    return { processed: false, skipped: false, error: error.message };
  }
}

/**
 * Main migration workflow
 * @param {Object} options
 */
async function main(options) {
  log('Ebook Library Migration started');
  log(`Source: ${options.source}`);
  log(`Target: ${options.target}`);

  // Validate required options
  if (!options.source || !options.target) {
    log('Error: --source and --target are required', 'error');
    showHelp();
    process.exit(1);
  }

  // Initialize cache
  const cache = new EbookCache(options.cacheDir);

  if (options.clearCache) {
    log('Clearing cache...');
    cache.clear();
  }

  if (options.verbose) {
    const stats = cache.stats();
    log(`Cache: ${stats.count} entries, ${stats.size} bytes`);
  }

  // Find all ebook files
  const ebookFiles = findEbooks(options.source, true);
  log(`Found ${ebookFiles.length} ebook files`);

  if (ebookFiles.length === 0) {
    log('No ebook files found. Exiting.');
    process.exit(0);
  }

  // Process each ebook
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const processedBooks = [];

  for (const filePath of ebookFiles) {
    const result = await processEbook(filePath, options, cache);
    if (result.processed) {
      processed += 1;
      if (result.destPath) {
        processedBooks.push(result.destPath);
      }
    } else if (result.skipped) {
      skipped += 1;
      if (result.destPath) {
        processedBooks.push(result.destPath);
      }
    } else {
      failed += 1;
    }
  }

  // Generate master index
  log('Generating master index...');
  try {
    await generateIndex(options.target, processedBooks);
    log('Index generated successfully');
  } catch (error) {
    log(`Failed to generate index: ${error.message}`, 'error');
  }

  // Summary
  log('\nMigration Summary:');
  log(`  Processed: ${processed}`);
  log(`  Skipped (cached): ${skipped}`);
  log(`  Failed: ${failed}`);
  log(`  Total: ${ebookFiles.length}`);

  const finalStats = cache.stats();
  log(`Cache entries: ${finalStats.count}`);

  process.exit(failed > 0 ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  const options = parseArgs(process.argv);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  main(options).catch((error) => {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main, parseArgs, findEbooks };
