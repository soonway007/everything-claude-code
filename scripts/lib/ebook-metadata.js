/**
 * Ebook Metadata Extraction
 * Extracts title, author, genre, tags, published date from ebook files (epub, pdf).
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const { logger } = require('./ebook-logger');

/**
 * @typedef {Object} EbookMetadata
 * @property {string} title
 * @property {string} author
 * @property {string} [authorUrl]
 * @property {string} genre
 * @property {string[]} tags
 * @property {string} [publishedDate]
 * @property {string} [language]
 * @property {string} [isbn]
 * @property {string} [publisher]
 * @property {string} [description]
 * @property {string} sourcePath - Original file path
 */

/**
 * Date format patterns for normalization
 * @typedef {Array<{pattern: RegExp, parse: (match: RegExpMatchArray) => string}>} DateFormatPatterns
 */

/**
 * @type {DateFormatPatterns}
 */
const DATE_PATTERNS = [
  {
    // ISO format: YYYY-MM-DD
    pattern: /^(\d{4})-(\d{2})-(\d{2})$/,
    parse: (match) => match[0].substring(0, 10),
  },
  {
    // US format: MM/DD/YYYY
    pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    parse: (match) => `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`,
  },
  {
    // European format: DD.MM.YYYY
    pattern: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    parse: (match) => `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`,
  },
];

/**
 * Normalize a string for use as a slug
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
 * Check if a command is available
 * @param {string} cmd
 * @returns {boolean}
 */
function commandExists(cmd) {
  try {
    const { spawnSync } = require('child_process');
    spawnSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Windows Calibre installation path
const CALIBRE_DEBUG_PATH = 'C:\\Program Files\\Calibre2\\calibre-debug.exe';

/**
 * Read EPUB container and extract OPF content
 * @param {string} filePath - Path to the EPUB file
 * @returns {Promise<{opfContent: string|null, opfPath: string|null}>}
 */
async function readEpubContainer(filePath) {
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
      if (entry.entryName.endsWith('.opf')) {
        return {
          opfContent: entry.getData().toString('utf8'),
          opfPath: entry.entryName,
        };
      }
    }

    logger.warn(`No OPF file found in EPUB: ${filePath}`);
    return { opfContent: null, opfPath: null };
  } catch (error) {
    logger.warn(`Could not read EPUB container from ${filePath}: ${error.message}`);
    return { opfContent: null, opfPath: null };
  }
}

/**
 * Extract metadata content using a regex pattern
 * @param {string} content - The OPF content to search
 * @param {string} pattern - The regex pattern to match
 * @returns {string|null} - The captured content or null if not found
 */
function getMetaContent(content, pattern) {
  const match = content.match(new RegExp(pattern, 'i'));
  return match ? (match[1] || match[2]) : null;
}

/**
 * Extract title from OPF metadata
 * @param {string} opfContent - OPF content
 * @param {string} fallbackTitle - Fallback title if not found
 * @returns {string}
 */
function extractTitle(opfContent, fallbackTitle) {
  return (
    getMetaContent(opfContent, '<dc:title[^>]*>([^<]+)<\\/dc:title>') ||
    getMetaContent(opfContent, '<title>([^<]+)<\\/title>') ||
    fallbackTitle
  );
}

/**
 * Extract author from OPF metadata
 * @param {string} opfContent - OPF content
 * @returns {string}
 */
function extractAuthor(opfContent) {
  return (
    getMetaContent(opfContent, '<dc:creator[^>]*>([^<]+)<\\/dc:creator>') ||
    getMetaContent(opfContent, '<creator>([^<]+)<\\/creator>') ||
    'Unknown'
  );
}

/**
 * Extract date from OPF metadata
 * @param {string} opfContent - OPF content
 * @returns {string|null}
 */
function extractDate(opfContent) {
  const dateStr =
    getMetaContent(opfContent, '<dc:date[^>]*>([^<]+)<\\/dc:date>') ||
    getMetaContent(opfContent, '<date>([^<]+)<\\/date>');
  return dateStr ? normalizeDate(dateStr) : null;
}

/**
 * Extract language from OPF metadata
 * @param {string} opfContent - OPF content
 * @returns {string|null}
 */
function extractLanguage(opfContent) {
  return (
    getMetaContent(opfContent, '<dc:language[^>]*>([^<]+)<\\/dc:language>') ||
    getMetaContent(opfContent, '<language>([^<]+)<\\/language>') ||
    null
  );
}

/**
 * Extract publisher from OPF metadata
 * @param {string} opfContent - OPF content
 * @returns {string|null}
 */
function extractPublisher(opfContent) {
  return (
    getMetaContent(opfContent, '<dc:publisher[^>]*>([^<]+)<\\/dc:publisher>') ||
    getMetaContent(opfContent, '<publisher>([^<]+)<\\/publisher>') ||
    null
  );
}

/**
 * Extract description from OPF metadata
 * @param {string} opfContent - OPF content
 * @returns {string|null}
 */
function extractDescription(opfContent) {
  return (
    getMetaContent(opfContent, '<dc:description[^>]*>([^<]+)<\\/dc:description>') ||
    getMetaContent(opfContent, '<description>([^<]+)<\\/description>') ||
    null
  );
}

/**
 * Extract ISBN from OPF metadata
 * @param {string} opfContent - OPF content
 * @returns {string|null}
 */
function extractIsbn(opfContent) {
  return getMetaContent(opfContent, '<dc:identifier[^>]*>([^<]+)<\\/dc:identifier>');
}

/**
 * Extract genre from OPF metadata
 * @param {string} opfContent - OPF content
 * @returns {string}
 */
function extractGenre(opfContent) {
  return (
    getMetaContent(opfContent, '<meta[^>]*refine="genre"[^>]*content="([^"]+)"') ||
    getMetaContent(opfContent, '<genre>([^<]+)<\\/genre>') ||
    'Uncategorized'
  );
}

/**
 * Extract metadata from EPUB file using epub-metadata or pandoc
 * @param {string} filePath
 * @returns {Promise<EbookMetadata>}
 */
async function extractEpubMetadata(filePath) {
  const defaultMetadata = {
    title: path.basename(filePath, path.extname(filePath)),
    author: 'Unknown',
    genre: 'Uncategorized',
    tags: [],
    sourcePath: filePath,
  };

  try {
    // EPUB is a ZIP file - try to find metadata in container.xml and content.opf
    // Use adm-zip for async-friendly extraction
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(filePath);

    // getEntries() returns all entries without loading all data into memory at once
    const zipEntries = zip.getEntries();
    let metadata = { ...defaultMetadata };

    for (const entry of zipEntries) {
      if (entry.entryName.endsWith('.opf')) {
        const opfContent = entry.getData().toString('utf8');
        metadata = parseOpfMetadata(opfContent, filePath);
        break;
      }
    }

    return metadata;
  } catch (error) {
    logger.warn(`Could not extract EPUB metadata from ${filePath}: ${error.message}`);
    return defaultMetadata;
  }
}

/**
 * Parse OPF metadata from EPUB content
 * @param {string} opfContent
 * @param {string} sourcePath
 * @returns {EbookMetadata}
 */
function parseOpfMetadata(opfContent, sourcePath) {
  const fallbackTitle = path.basename(sourcePath, path.extname(sourcePath));

  return {
    title: extractTitle(opfContent, fallbackTitle),
    author: extractAuthor(opfContent),
    genre: extractGenre(opfContent),
    tags: [],
    publishedDate: extractDate(opfContent),
    language: extractLanguage(opfContent),
    publisher: extractPublisher(opfContent),
    description: extractDescription(opfContent),
    isbn: extractIsbn(opfContent),
    sourcePath: sourcePath,
  };
}

/**
 * Extract metadata from PDF file using pdf-parse
 * @param {string} filePath
 * @returns {Promise<EbookMetadata>}
 */
async function extractPdfMetadata(filePath) {
  const defaultMetadata = {
    title: path.basename(filePath, path.extname(filePath)),
    author: 'Unknown',
    genre: 'Uncategorized',
    tags: [],
    sourcePath: filePath,
  };

  try {
    const pdfParse = require('pdf-parse');
    const dataBuffer = await fsPromises.readFile(filePath);
    const data = await pdfParse(dataBuffer);

    // pdf-parse provides info dictionary
    const info = data.info || {};

    return {
      title: info.Title || defaultMetadata.title,
      author: info.Author || defaultMetadata.author,
      genre: 'Uncategorized',
      tags: [],
      publishedDate: info.CreationDate ? normalizePdfDate(info.CreationDate) : null,
      language: info.Language || null,
      publisher: info.Publisher || null,
      description: info.Subject || null,
      isbn: null,
      sourcePath: filePath,
    };
  } catch (error) {
    logger.warn(`Could not extract PDF metadata from ${filePath}: ${error.message}`);
    return defaultMetadata;
  }
}

/**
 * Normalize various date formats to ISO date string
 * @param {string} dateStr
 * @returns {string|null}
 */
function normalizeDate(dateStr) {
  if (!dateStr) return null;

  for (const { pattern, parse } of DATE_PATTERNS) {
    const match = dateStr.match(pattern);
    if (match) {
      return parse(match);
    }
  }

  // Return as-is if we can't parse it
  return dateStr.substring(0, 10);
}

/**
 * Normalize PDF date (D:YYYYMMDDHHmmSS) to ISO format
 * @param {string} pdfDate
 * @returns {string|null}
 */
function normalizePdfDate(pdfDate) {
  if (!pdfDate) return null;

  // PDF date format: D:YYYYMMDDHHmmSS
  const match = pdfDate.match(/D:(\d{4})(\d{2})(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return normalizeDate(pdfDate.replace('D:', ''));
}

/**
 * Extract metadata from an ebook file
 * @param {string} filePath - Path to the ebook file
 * @returns {Promise<EbookMetadata>}
 */
async function extract(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.epub':
      return extractEpubMetadata(filePath);
    case '.pdf':
      return extractPdfMetadata(filePath);
    case '.mobi':
    case '.azw3':
      // Kindle formats - use calibre's tool if available
      if (commandExists('calibre-debug')) {
        return extractCalibreMetadata(filePath);
      }
      return {
        title: path.basename(filePath, ext),
        author: 'Unknown',
        genre: 'Uncategorized',
        tags: [],
        sourcePath: filePath,
      };
    default:
      return {
        title: path.basename(filePath, ext),
        author: 'Unknown',
        genre: 'Uncategorized',
        tags: [],
        sourcePath: filePath,
      };
  }
}

/**
 * Extract metadata using Calibre's tool
 * @param {string} filePath
 * @returns {Promise<EbookMetadata>}
 */
async function extractCalibreMetadata(filePath) {
  try {
    // Use full path for Windows Calibre installation
    const { spawnSync } = require('child_process');
    const calibrePath = fs.existsSync(CALIBRE_DEBUG_PATH) ? CALIBRE_DEBUG_PATH : 'calibre-debug';
    const result = spawnSync(calibrePath, ['--metadata-file', filePath], {
      encoding: 'utf8',
    });
    if (result.error) {
      throw new Error(result.error.message);
    }
    const output = result.stdout;

    // Parse calibre metadata output
    const lines = output.split('\n');
    const metadata = {
      title: path.basename(filePath, path.extname(filePath)),
      author: 'Unknown',
      genre: 'Uncategorized',
      tags: [],
      sourcePath: filePath,
    };

    for (const line of lines) {
      if (line.startsWith('Title:')) {
        metadata.title = line.substring(6).trim();
      } else if (line.startsWith('Author:')) {
        metadata.author = line.substring(7).trim();
      } else if (line.startsWith('Tags:')) {
        metadata.tags = line.substring(5).split(',').map((t) => t.trim());
      } else if (line.startsWith('Published:')) {
        metadata.publishedDate = normalizeDate(line.substring(10).trim());
      }
    }

    return metadata;
  } catch (error) {
    return {
      title: path.basename(filePath, path.extname(filePath)),
      author: 'Unknown',
      genre: 'Uncategorized',
      tags: [],
      sourcePath: filePath,
    };
  }
}

module.exports = {
  extract,
  slugify,
  commandExists,
  normalizeDate,
  normalizePdfDate,
  parseOpfMetadata,
  extractEpubMetadata,
  extractPdfMetadata,
  extractCalibreMetadata,
};
