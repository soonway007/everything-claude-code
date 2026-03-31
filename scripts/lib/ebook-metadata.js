/**
 * Ebook Metadata Extraction
 * Extracts title, author, genre, tags, published date from ebook files (epub, pdf).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
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
    // Try using epub-metadata npm package if available
    // For now, fall back to parsing with basic XML extraction
    const content = fs.readFileSync(filePath);

    // EPUB is a ZIP file - try to find metadata in container.xml and content.opf
    // This is a simplified implementation
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(filePath);
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
    console.warn(`Warning: Could not extract EPUB metadata from ${filePath}: ${error.message}`);
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
  const getMetaContent = (pattern) => {
    const match = opfContent.match(new RegExp(pattern, 'i'));
    return match ? match[1] || match[2] : null;
  };

  const title = getMetaContent(/<dc:title[^>]*>([^<]+)<\/dc:title>/i)
    || getMetaContent(/<title>([^<]+)<\/title>/i);

  const creator = getMetaContent(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i)
    || getMetaContent(/<creator>([^<]+)<\/creator>/i);

  const date = getMetaContent(/<dc:date[^>]*>([^<]+)<\/dc:date>/i)
    || getMetaContent(/<date>([^<]+)<\/date>/i);

  const language = getMetaContent(/<dc:language[^>]*>([^<]+)<\/dc:language>/i)
    || getMetaContent(/<language>([^<]+)<\/language>/i);

  const publisher = getMetaContent(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/i)
    || getMetaContent(/<publisher>([^<]+)<\/publisher>/i);

  const description = getMetaContent(/<dc:description[^>]*>([^<]+)<\/dc:description>/i)
    || getMetaContent(/<description>([^<]+)<\/description>/i);

  const isbn = getMetaContent(/<dc:identifier[^>]*>([^<]+)<\/dc:identifier>/i);

  // Try to extract genre from package metadata
  const genre = getMetaContent(/<meta[^>]*refine="genre"[^>]*content="([^"]+)"/i)
    || getMetaContent(/<genre>([^<]+)<\/genre>/i)
    || 'Uncategorized';

  return {
    title: title || path.basename(sourcePath, path.extname(sourcePath)),
    author: creator || 'Unknown',
    genre: genre || 'Uncategorized',
    tags: [],
    publishedDate: date ? normalizeDate(date) : null,
    language: language || null,
    publisher: publisher || null,
    description: description || null,
    isbn: isbn || null,
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
    const dataBuffer = fs.readFileSync(filePath);
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
    console.warn(`Warning: Could not extract PDF metadata from ${filePath}: ${error.message}`);
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

  // Try various date formats
  const patterns = [
    // ISO format
    /^(\d{4})-(\d{2})-(\d{2})$/,
    // US format
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // European format
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
  ];

  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      // Return in ISO format YYYY-MM-DD
      if (pattern === patterns[0]) {
        return dateStr.substring(0, 10);
      } else if (pattern === patterns[1]) {
        // MM/DD/YYYY
        return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
      } else if (pattern === patterns[2]) {
        // DD.MM.YYYY
        return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
      }
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
    const output = execSync(`calibre-debug --metadata-file "${filePath}"`, {
      encoding: 'utf8',
    });

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
  EbookCache,
};
