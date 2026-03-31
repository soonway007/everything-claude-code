/**
 * Ebook Master Indexer
 * Generates index.md with Dataview queries and internal links.
 */

const fs = require('fs');
const path = require('path');

/**
 * Generate a slug from a string
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
 * Generate the master index.md content
 * @param {string[]} bookPaths - Array of processed book file paths
 * @param {Object} options - Generation options
 * @returns {string}
 */
function generateIndexContent(bookPaths, options = {}) {
  const {
    vaultPath = '.',
    includeDataviewQuery = true,
    includeGenreSection = true,
    includeAuthorSection = true,
  } = options;

  const books = bookPaths.map((p) => {
    try {
      const content = fs.readFileSync(p, 'utf8');
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/);

      if (!frontmatterMatch) {
        return {
          path: p,
          title: path.basename(p, '.md'),
          author: 'Unknown',
          genre: 'Uncategorized',
          publishedDate: null,
        };
      }

      const yaml = require('js-yaml');
      const fm = yaml.load(frontmatterMatch[1]);

      return {
        path: p,
        title: fm.title || path.basename(p, '.md'),
        author: fm.author || 'Unknown',
        genre: fm.genre || 'Uncategorized',
        publishedDate: fm.publishedDate || null,
        tags: fm.tags || [],
      };
    } catch {
      return {
        path: p,
        title: path.basename(p, '.md'),
        author: 'Unknown',
        genre: 'Uncategorized',
        publishedDate: null,
        tags: [],
      };
    }
  });

  // Group books by genre
  const byGenre = {};
  const byAuthor = {};

  for (const book of books) {
    if (!byGenre[book.genre]) {
      byGenre[book.genre] = [];
    }
    byGenre[book.genre].push(book);

    if (!byAuthor[book.author]) {
      byAuthor[book.author] = [];
    }
    byAuthor[book.author].push(book);
  }

  // Generate markdown
  let content = '';
  content += '# Ebook Library Index\n\n';

  // Stats section
  content += '## Stats\n\n';
  content += `- **Total Books**: ${books.length}\n`;
  content += `- **Genres**: ${Object.keys(byGenre).length}\n`;
  content += `- **Authors**: ${Object.keys(byAuthor).length}\n`;
  content += `- **Last Updated**: ${new Date().toISOString().split('T')[0]}\n\n`;

  // Dataview query
  if (includeDataviewQuery) {
    content += '## All Books (Dataview)\n\n';
    content += '```dataview\n';
    content += 'TABLE title, author, genre, publishedDate\n';
    content += 'FROM "books"\n';
    content += 'SORT title ASC\n';
    content += '```\n\n';
  }

  // Genre sections
  if (includeGenreSection) {
    content += '## By Genre\n\n';

    const sortedGenres = Object.keys(byGenre).sort();
    for (const genre of sortedGenres) {
      content += `### ${genre}\n\n`;
      const genreBooks = byGenre[genre].sort((a, b) => a.title.localeCompare(b.title));

      for (const book of genreBooks) {
        const relPath = path.relative(vaultPath, book.path).replace(/\\/g, '/');
        content += `- [[${relPath}|${book.title}]] — ${book.author}`;
        if (book.publishedDate) {
          content += ` (${book.publishedDate})`;
        }
        content += '\n';
      }
      content += '\n';
    }
  }

  // Author sections
  if (includeAuthorSection) {
    content += '## By Author\n\n';

    const sortedAuthors = Object.keys(byAuthor).sort();
    for (const author of sortedAuthors) {
      content += `### ${author}\n\n`;
      const authorBooks = byAuthor[author].sort((a, b) => a.title.localeCompare(b.title));

      for (const book of authorBooks) {
        const relPath = path.relative(vaultPath, book.path).replace(/\\/g, '/');
        content += `- [[${relPath}|${book.title}]]`;
        if (book.publishedDate) {
          content += ` (${book.publishedDate})`;
        }
        content += '\n';
      }
      content += '\n';
    }
  }

  // Recent additions
  content += '## Recent Additions\n\n';
  const recentBooks = books
    .filter((b) => b.path)
    .sort((a, b) => {
      // Sort by path modification time or published date
      try {
        const aTime = fs.statSync(a.path).mtime;
        const bTime = fs.statSync(b.path).mtime;
        return bTime - aTime;
      } catch {
        return 0;
      }
    })
    .slice(0, 10);

  for (const book of recentBooks) {
    const relPath = path.relative(vaultPath, book.path).replace(/\\/g, '/');
    content += `- [[${relPath}|${book.title}]] — ${book.author}\n`;
  }

  return content;
}

/**
 * Generate master index file
 * @param {string} vaultPath - Obsidian vault path
 * @param {string[]} processedBooks - Array of processed book file paths
 * @param {Object} options - Generation options
 */
async function generateIndex(vaultPath, processedBooks, options = {}) {
  const indexPath = path.join(vaultPath, 'index.md');

  const content = generateIndexContent(processedBooks, {
    vaultPath,
    ...options,
  });

  fs.writeFileSync(indexPath, content, 'utf8');
}

/**
 * Update an existing index with new book
 * @param {string} vaultPath
 * @param {string} bookPath
 * @param {Object} metadata
 */
async function addToIndex(vaultPath, bookPath, metadata) {
  const indexPath = path.join(vaultPath, 'index.md');

  if (!fs.existsSync(indexPath)) {
    // Generate new index if it doesn't exist
    await generateIndex(vaultPath, [bookPath]);
    return;
  }

  // Read existing index
  const existingContent = fs.readFileSync(indexPath, 'utf8');

  // Generate link entry
  const relPath = path.relative(vaultPath, bookPath).replace(/\\/g, '/');
  const linkEntry = `- [[${relPath}|${metadata.title}]] — ${metadata.author}`;

  // Find insertion point (alphabetically in appropriate section)
  // This is a simplified approach - in production, you might want to regenerate
  const lines = existingContent.split('\n');
  let insertIndex = lines.length;

  // Insert before "Recent Additions" section if it exists
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## Recent Additions')) {
      insertIndex = i;
      break;
    }
  }

  lines.splice(insertIndex, 0, linkEntry);
  fs.writeFileSync(indexPath, lines.join('\n'), 'utf8');
}

/**
 * Remove a book from the index
 * @param {string} vaultPath
 * @param {string} bookPath
 */
async function removeFromIndex(vaultPath, bookPath) {
  const indexPath = path.join(vaultPath, 'index.md');

  if (!fs.existsSync(indexPath)) {
    return;
  }

  const content = fs.readFileSync(indexPath, 'utf8');
  const relPath = path.relative(vaultPath, bookPath).replace(/\\/g, '/');
  const linkPattern = new RegExp(`\\[\\[${relPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\|[^\\]]+\\]\\][^\\n]*\\n?`, 'g');

  const updated = content.replace(linkPattern, '');
  fs.writeFileSync(indexPath, updated, 'utf8');
}

/**
 * Verify all links in the index resolve correctly
 * @param {string} vaultPath
 * @returns {{ valid: boolean, brokenLinks: Array<{line: number, link: string, reason: string}> }}
 */
function verifyIndexLinks(vaultPath) {
  const indexPath = path.join(vaultPath, 'index.md');
  const brokenLinks = [];

  if (!fs.existsSync(indexPath)) {
    return { valid: false, brokenLinks: [{ line: 0, link: 'index.md', reason: 'Index file does not exist' }] };
  }

  const content = fs.readFileSync(indexPath, 'utf8');
  const lines = content.split('\n');

  // Find all wiki links
  const wikiLinkPattern = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let match;
  let lineNum = 0;

  for (const line of lines) {
    lineNum += 1;

    while ((match = wikiLinkPattern.exec(line)) !== null) {
      const linkPath = match[1];
      let fullPath;

      if (linkPath.startsWith('/')) {
        // Absolute path from vault root
        fullPath = path.join(vaultPath, linkPath.replace(/^\//, ''));
      } else {
        // Relative path
        fullPath = path.join(vaultPath, 'index.md', '..', linkPath);
      }

      fullPath = path.resolve(fullPath);

      // Obsidian wiki links may or may not include .md extension
      // Check both variants
      let linkExists = fs.existsSync(fullPath);
      if (!linkExists && !linkPath.endsWith('.md')) {
        linkExists = fs.existsSync(fullPath + '.md');
        if (linkExists) {
          fullPath = fullPath + '.md';
        }
      }

      if (!linkExists) {
        brokenLinks.push({
          line: lineNum,
          link: match[0],
          reason: `File not found: ${linkPath}`,
        });
      }
    }
  }

  return {
    valid: brokenLinks.length === 0,
    brokenLinks,
  };
}

module.exports = {
  generateIndex,
  generateIndexContent,
  addToIndex,
  removeFromIndex,
  verifyIndexLinks,
  slugify,
};
