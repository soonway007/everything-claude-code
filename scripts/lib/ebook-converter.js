/**
 * Ebook Document Conversion
 * Converts ebooks (EPUB/PDF) to Markdown using Pandoc + Nutrient API pipeline.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { execAsync } = require('child_process');

/**
 * @typedef {Object} ConversionResult
 * @property {string} markdown - Converted markdown content
 * @property {string[]} images - Array of extracted image paths
 * @property {string} tempDir - Temporary directory used (if any)
 */

/**
 * @typedef {Object} ConversionOptions
 * @property {string} targetVault - Target Obsidian vault path
 * @property {Object} metadata - Ebook metadata
 * @property {boolean} extractImages - Whether to extract images
 * @property {string} imageOutputDir - Directory for extracted images
 */

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
 * Convert EPUB to HTML using Pandoc
 * @param {string} filePath
 * @returns {Promise<string>} - HTML content
 */
async function epubToHtml(filePath) {
  if (!commandExists('pandoc')) {
    throw new Error('Pandoc is not installed. Please install Pandoc to process EPUB files.');
  }

  try {
    const html = execSync(`pandoc -f epub -t html "${filePath}"`, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });
    return html;
  } catch (error) {
    throw new Error(`Pandoc conversion failed: ${error.message}`);
  }
}

/**
 * Convert ebook to markdown using Nutrient API
 * This is a placeholder - in production, you would call the actual Nutrient API
 * @param {string} filePath
 * @param {Object} options
 * @returns {Promise<ConversionResult>}
 */
async function convertViaNutrient(filePath, options) {
  // Nutrient Document Processing API integration
  // In production, you would:
  // 1. Upload the file to Nutrient
  // 2. Configure output format: markdown
  // 3. Configure image extraction to target vault attachments folder
  // 4. Poll for completion and fetch results

  const apiKey = process.env.NUTRIENT_API_KEY;
  if (!apiKey) {
    throw new Error('NUTRIENT_API_KEY environment variable is not set');
  }

  const endpoint = process.env.NUTRIENT_API_ENDPOINT || 'https://api.nutrient.io/v1';

  // This is a simplified representation of the actual API call
  const formData = new FormData();
  formData.append('file', fs.createReadStream(filePath));
  formData.append('outputFormat', 'markdown');
  formData.append('extractImages', 'true');
  formData.append('imageFolder', options.imageOutputDir || 'attachments');

  // Note: In production, use node-fetch or axios to make the actual API call
  // const response = await fetch(`${endpoint}/process`, {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${apiKey}` },
  //   body: formData
  // });

  // For now, we'll fall back to Pandoc-based conversion
  console.warn('Nutrient API not available, using Pandoc fallback');
  return convertViaPandoc(filePath, options);
}

/**
 * Convert ebook to markdown using Pandoc
 * @param {string} filePath
 * @param {Object} options
 * @returns {Promise<ConversionResult>}
 */
async function convertViaPandoc(filePath, options) {
  const ext = path.extname(filePath).toLowerCase();
  let markdown = '';
  const images = [];

  try {
    if (ext === '.epub') {
      // First convert EPUB to HTML using Pandoc
      const html = await epubToHtml(filePath);
      // Then convert HTML to Markdown using Pandoc
      markdown = execSync(`echo "${html.replace(/"/g, '\\"')}" | pandoc -f html -t markdown`, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
    } else if (ext === '.pdf') {
      // PDF to Markdown using Pandoc
      markdown = execSync(`pandoc -f pdf -t markdown "${filePath}"`, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
    } else {
      // Try generic conversion
      markdown = execSync(`pandoc -t markdown "${filePath}"`, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
    }
  } catch (error) {
    throw new Error(`Pandoc conversion failed: ${error.message}`);
  }

  return {
    markdown,
    images,
    tempDir: null,
  };
}

/**
 * Convert an ebook file to markdown
 * @param {string} filePath - Path to the ebook file
 * @param {string} targetVault - Target Obsidian vault path
 * @param {Object} metadata - Ebook metadata (for slug generation)
 * @returns {Promise<ConversionResult>}
 */
async function convert(filePath, targetVault, metadata) {
  const slug = metadata.slug || metadata.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const imageOutputDir = path.join(targetVault, 'attachments', slug);

  const options = {
    targetVault,
    metadata,
    extractImages: true,
    imageOutputDir,
  };

  // Try Nutrient API first if available, otherwise fall back to Pandoc
  const useNutrient = process.env.NUTRIENT_API_KEY && process.env.USE_NUTRIENT_API === 'true';

  if (useNutrient) {
    return convertViaNutrient(filePath, options);
  }

  return convertViaPandoc(filePath, options);
}

/**
 * Clean up temporary files
 * @param {string} tempDir
 */
function cleanupTemp(tempDir) {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  convert,
  convertViaPandoc,
  convertViaNutrient,
  cleanupTemp,
  commandExists,
};
