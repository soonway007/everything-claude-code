/**
 * Ebook Frontmatter Generation
 * Generates YAML frontmatter for Obsidian compatibility with Dataview.
 */

const yaml = require('js-yaml');

/**
 * @typedef {Object} FrontmatterOptions
 * @property {boolean} includeContentHash - Include content hash in frontmatter
 * @property {boolean} includeSource - Include source file path
 * @property {boolean} includeDataviewFields - Add Dataview-specific fields
 */

/**
 * Default frontmatter options
 */
const DEFAULT_OPTIONS = {
  includeContentHash: true,
  includeSource: true,
  includeDataviewFields: true,
};

/**
 * Generate YAML frontmatter for an ebook
 * @param {Object} metadata - Ebook metadata
 * @param {string} markdownContent - Converted markdown content
 * @param {string} contentHash - Content hash for deduplication
 * @param {Partial<FrontmatterOptions>} options - Generation options
 * @returns {string} - Full markdown content with frontmatter
 */
function generateFrontmatter(metadata, markdownContent, contentHash, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const frontmatter = {
    title: metadata.title || 'Untitled',
    author: metadata.author || 'Unknown',
    authorUrl: metadata.authorUrl || '',
    genre: metadata.genre || 'Uncategorized',
    tags: metadata.tags && metadata.tags.length > 0 ? metadata.tags : ['untagged'],
    publishedDate: metadata.publishedDate || null,
    dateAdded: new Date().toISOString().split('T')[0],
  };

  // Add optional fields
  if (opts.includeContentHash && contentHash) {
    frontmatter.contentHash = contentHash;
  }

  if (opts.includeSource && metadata.sourcePath) {
    frontmatter.sourceFile = metadata.sourcePath;
  }

  if (opts.includeDataviewFields) {
    // Dataview-compatible fields
    frontmatter.type = 'book';
    if (metadata.language) {
      frontmatter.language = metadata.language;
    }
    if (metadata.publisher) {
      frontmatter.publisher = metadata.publisher;
    }
    if (metadata.isbn) {
      frontmatter.isbn = metadata.isbn;
    }
    if (metadata.description) {
      frontmatter.description = metadata.description;
    }
    // Dataview lookup field
    frontmatter.tags = frontmatter.tags; // Already set above
  }

  // Generate YAML string
  const yamlStr = yaml.dump(frontmatter, {
    indent: 2,
    lineWidth: -1, // Disable line wrapping
    noRefs: true, // Avoid YAML anchors
    sortKeys: false, // Preserve field order
  });

  return `---\n${yamlStr}---\n\n${markdownContent}`;
}

/**
 * Parse existing frontmatter from markdown content
 * @param {string} content - Markdown content with frontmatter
 * @returns {{ frontmatter: Object|null, content: string }}
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: null, content };
  }

  try {
    const frontmatter = yaml.load(match[1]);
    const markdownContent = match[2];
    return { frontmatter, content: markdownContent };
  } catch (error) {
    return { frontmatter: null, content };
  }
}

/**
 * Update existing frontmatter in markdown content
 * @param {string} content - Markdown content with frontmatter
 * @param {Object} updates - Fields to update
 * @returns {string} - Updated markdown content
 */
function updateFrontmatter(content, updates) {
  const { frontmatter, content: markdownContent } = parseFrontmatter(content);

  if (!frontmatter) {
    // No existing frontmatter, generate new one
    return generateFrontmatter(updates, markdownContent, updates.contentHash);
  }

  const updated = { ...frontmatter, ...updates };
  return generateFrontmatter(updated, markdownContent, updated.contentHash);
}

/**
 * Validate frontmatter has required fields for Obsidian Dataview
 * @param {Object} frontmatter
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateFrontmatter(frontmatter) {
  const errors = [];
  const required = ['title', 'author', 'genre', 'tags'];

  for (const field of required) {
    if (!frontmatter[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate tags is an array
  if (frontmatter.tags && !Array.isArray(frontmatter.tags)) {
    errors.push('tags must be an array');
  }

  // Validate publishedDate format if present
  if (frontmatter.publishedDate) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(frontmatter.publishedDate)) {
      errors.push('publishedDate must be in YYYY-MM-DD format');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  generateFrontmatter,
  parseFrontmatter,
  updateFrontmatter,
  validateFrontmatter,
};
