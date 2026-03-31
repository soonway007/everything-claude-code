/**
 * Ebook Content-Hash Cache
 * Implements content-hash caching to skip already-processed ebook files.
 * Follows the content-hash-cache-pattern skill.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} CacheEntry
 * @property {string} source - Original ebook file path
 * @property {string} dest - Destination markdown file path
 * @property {Object} metadata - Extracted metadata
 * @property {string} contentHash - SHA-256 content hash
 * @property {string} [processedAt] - ISO timestamp of processing
 */

/**
 * Content-hash cache for ebook migration.
 * Uses SHA-256 hash of file contents to identify processed files.
 */
class EbookCache {
  /**
   * @param {string} cacheDir - Directory to store cache files
   */
  constructor(cacheDir) {
    this.cacheDir = cacheDir || '.ebook-cache';
    this._ensureCacheDir();
  }

  /**
   * Ensure cache directory exists
   * @private
   */
  _ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Compute SHA-256 content hash of a file
   * Uses 64KB chunks for large file optimization
   * @param {string} filePath - Path to the file
   * @returns {Promise<string>} - Hex-encoded SHA-256 hash
   */
  computeHash(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath, { highWaterMark: 65536 });

      stream.on('error', reject);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  /**
   * Get path to cache entry file for a given hash
   * @param {string} hash - Content hash
   * @returns {string} - Path to cache entry
   * @private
   */
  _getCachePath(hash) {
    return path.join(this.cacheDir, `${hash}.json`);
  }

  /**
   * Check if a file has been cached
   * @param {string} hash - Content hash to check
   * @returns {boolean}
   */
  has(hash) {
    const cachePath = this._getCachePath(hash);
    if (!fs.existsSync(cachePath)) {
      return false;
    }
    try {
      const entry = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      // Verify destination still exists
      if (entry.dest && fs.existsSync(entry.dest)) {
        return true;
      }
      // Destination gone, treat as cache miss
      fs.unlinkSync(cachePath);
      return false;
    } catch {
      // Corrupted cache entry, treat as miss
      return false;
    }
  }

  /**
   * Get cached entry for a hash
   * @param {string} hash - Content hash
   * @returns {CacheEntry|null}
   */
  get(hash) {
    if (!this.has(hash)) {
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(this._getCachePath(hash), 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Store a cache entry
   * @param {string} hash - Content hash
   * @param {CacheEntry} entry - Cache entry data
   */
  set(hash, entry) {
    const cachePath = this._getCachePath(hash);
    const fullEntry = {
      ...entry,
      contentHash: hash,
      processedAt: new Date().toISOString(),
    };
    fs.writeFileSync(cachePath, JSON.stringify(fullEntry, null, 2), 'utf8');
  }

  /**
   * Remove a cache entry
   * @param {string} hash - Content hash to invalidate
   */
  invalidate(hash) {
    const cachePath = this._getCachePath(hash);
    if (fs.existsSync(cachePath)) {
      fs.unlinkSync(cachePath);
    }
  }

  /**
   * Clear all cache entries
   */
  clear() {
    if (!fs.existsSync(this.cacheDir)) {
      return;
    }
    const files = fs.readdirSync(this.cacheDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        fs.unlinkSync(path.join(this.cacheDir, file));
      }
    }
  }

  /**
   * List all cached entries
   * @returns {CacheEntry[]}
   */
  list() {
    if (!fs.existsSync(this.cacheDir)) {
      return [];
    }
    const entries = [];
    const files = fs.readdirSync(this.cacheDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const entry = JSON.parse(
            fs.readFileSync(path.join(this.cacheDir, file), 'utf8')
          );
          entries.push(entry);
        } catch {
          // Skip corrupted entries
        }
      }
    }
    return entries;
  }

  /**
   * Get cache statistics
   * @returns {{ count: number, size: number }}
   */
  stats() {
    if (!fs.existsSync(this.cacheDir)) {
      return { count: 0, size: 0 };
    }
    const files = fs.readdirSync(this.cacheDir).filter((f) => f.endsWith('.json'));
    let totalSize = 0;
    for (const file of files) {
      const stat = fs.statSync(path.join(this.cacheDir, file));
      totalSize += stat.size;
    }
    return { count: files.length, size: totalSize };
  }
}

module.exports = EbookCache;
