/**
 * Ebook Vault Organizer
 * Organizes converted markdown files into folders based on metadata.
 */

const fs = require('fs');
const path = require('path');

/**
 * Sanitize a string for use in file/folder names
 * Removes or replaces characters that are invalid on Windows/macOS/Linux
 * @param {string} str
 * @returns {string}
 */
function sanitizeFilename(str) {
  if (!str) return 'unknown';

  // Replace invalid characters with hyphens
  return str
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200); // Limit length
}

/**
 * Generate a slug from a string for folder naming
 * @param {string} str
 * @returns {string}
 */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Ensure a directory exists, creating it if necessary
 * @param {string} dirPath
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Generate a unique filename if there's a collision
 * @param {string} filePath
 * @returns {string}
 */
function uniqueFilename(filePath) {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  let counter = 1;

  while (fs.existsSync(filePath)) {
    filePath = path.join(dir, `${base}-${counter}${ext}`);
    counter += 1;
  }

  return filePath;
}

/**
 * Organize a converted ebook into the vault folder structure
 * Structure: {vault}/books/{Genre}/{Author}/{title}.md
 *
 * @param {string} content - Full markdown content with frontmatter
 * @param {Object} metadata - Ebook metadata
 * @param {string} vaultPath - Target Obsidian vault path
 * @returns {Promise<string>} - Destination file path
 */
async function organizeBook(content, metadata, vaultPath) {
  const genre = sanitizeFilename(metadata.genre || 'Uncategorized');
  const author = sanitizeFilename(metadata.author || 'Unknown');
  const title = sanitizeFilename(metadata.title || 'untitled');

  // Build folder structure: books/Genre/Author/
  const genrePath = path.join(vaultPath, 'books', genre);
  const authorPath = path.join(genrePath, author);

  // Ensure directories exist
  ensureDir(authorPath);

  // Generate filename
  let filename = `${title}.md`;
  let destPath = path.join(authorPath, filename);
  destPath = uniqueFilename(destPath);

  // Write the file
  fs.writeFileSync(destPath, content, 'utf8');

  return destPath;
}

/**
 * Get relative path from vault root to a file
 * @param {string} filePath - Absolute file path
 * @param {string} vaultPath - Vault root path
 * @returns {string} - Relative path
 */
function getRelativePath(filePath, vaultPath) {
  return path.relative(vaultPath, filePath).replace(/\\/g, '/');
}

/**
 * List all books in the vault
 * @param {string} vaultPath
 * @returns {Array<{path: string, metadata: Object}>}
 */
function listBooks(vaultPath) {
  const booksDir = path.join(vaultPath, 'books');
  const books = [];

  if (!fs.existsSync(booksDir)) {
    return books;
  }

  const processDir = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        processDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

          let metadata = {};
          if (frontmatterMatch) {
            try {
              const yaml = require('js-yaml');
              metadata = yaml.load(frontmatterMatch[1]);
            } catch {
              // Ignore YAML parse errors
            }
          }

          books.push({
            path: getRelativePath(fullPath, vaultPath),
            fullPath,
            metadata,
          });
        } catch (error) {
          console.warn(`Failed to read book file ${fullPath}: ${error.message}`);
        }
      }
    }
  };

  processDir(booksDir);
  return books;
}

/**
 * Get folder structure of the vault
 * @param {string} vaultPath
 * @returns {Object} - Nested folder structure
 */
function getVaultStructure(vaultPath) {
  const booksDir = path.join(vaultPath, 'books');
  const structure = {
    root: vaultPath,
    attachments: path.join(vaultPath, 'attachments'),
    books: path.join(vaultPath, 'books'),
    index: path.join(vaultPath, 'index.md'),
  };

  // Build tree of books by genre/author
  const tree = {};

  if (!fs.existsSync(booksDir)) {
    return { structure, tree };
  }

  const entries = fs.readdirSync(booksDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      tree[entry.name] = tree[entry.name] || {};
      const authorPath = path.join(booksDir, entry.name);
      const authors = fs.readdirSync(authorPath, { withFileTypes: true });

      for (const authorEntry of authors) {
        if (authorEntry.isDirectory()) {
          tree[entry.name][authorEntry.name] = [];
          const bookPath = path.join(authorPath, authorEntry.name);
          const books = fs.readdirSync(bookPath, { withFileTypes: true });

          for (const bookEntry of books) {
            if (bookEntry.isFile() && bookEntry.name.endsWith('.md')) {
              tree[entry.name][authorEntry.name].push(bookEntry.name.replace('.md', ''));
            }
          }
        }
      }
    }
  }

  return { structure, tree };
}

/**
 * Verify vault organization matches expected structure
 * @param {string} vaultPath
 * @returns {{ valid: boolean, issues: string[] }}
 */
function verifyOrganization(vaultPath) {
  const issues = [];
  const booksDir = path.join(vaultPath, 'books');

  if (!fs.existsSync(booksDir)) {
    issues.push('Books directory does not exist');
    return { valid: false, issues };
  }

  const checkBookFile = (filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

      if (!frontmatterMatch) {
        issues.push(`File missing frontmatter: ${filePath}`);
        return;
      }

      const yaml = require('js-yaml');
      const fm = yaml.load(frontmatterMatch[1]);

      // Check required fields
      if (!fm.title) issues.push(`Missing title in: ${filePath}`);
      if (!fm.author) issues.push(`Missing author in: ${filePath}`);
      if (!fm.genre) issues.push(`Missing genre in: ${filePath}`);
    } catch (error) {
      issues.push(`Error reading ${filePath}: ${error.message}`);
    }
  };

  const processDir = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        processDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        checkBookFile(fullPath);
      }
    }
  };

  processDir(booksDir);

  return {
    valid: issues.length === 0,
    issues,
  };
}

module.exports = {
  organizeBook,
  listBooks,
  getRelativePath,
  getVaultStructure,
  verifyOrganization,
  sanitizeFilename,
  slugify,
  ensureDir,
  uniqueFilename,
};
