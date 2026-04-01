/**
 * Ebook Document Conversion
 * Converts ebooks (EPUB/PDF) to Markdown using Pandoc + Nutrient API pipeline.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

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
    spawnSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Windows Calibre installation path
const CALIBRE_PATH = 'C:\\Program Files\\Calibre2\\ebook-convert.exe';
const CALIBRE_DEBUG_PATH = 'C:\\Program Files\\Calibre2\\calibre-debug.exe';

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
    const result = spawnSync('pandoc', ['-f', 'epub', '-t', 'html', filePath], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });
    if (result.error) {
      throw new Error(`Pandoc conversion failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`Pandoc conversion failed with status ${result.status}: ${result.stderr}`);
    }
    return result.stdout;
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
 * Convert MOBI/AZW3 to Markdown using Calibre's ebook-convert
 * @param {string} filePath
 * @param {Object} options
 * @returns {Promise<ConversionResult>}
 */
async function convertViaCalibre(filePath, options) {
  // Check if Calibre is installed at the expected Windows path
  const calibrePath = fs.existsSync(CALIBRE_PATH) ? CALIBRE_PATH : 'ebook-convert';
  if (!commandExists(calibrePath) && calibrePath === 'ebook-convert') {
    throw new Error('ebook-convert (Calibre) is not installed. Please install Calibre to process MOBI/AZW3 files.');
  }

  const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ebook-'));
  const htmlPath = path.join(tempDir, 'converted.html');
  let markdown = '';

  try {
    // Convert MOBI/AZW3 to HTML using Calibre's ebook-convert
    const result = spawnSync(calibrePath, [filePath, htmlPath], {
      encoding: 'utf8',
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large files
    });
    if (result.error) {
      throw new Error(`Calibre conversion failed: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`Calibre conversion failed with status ${result.status}: ${result.stderr || ''}`);
    }

    // Check if conversion succeeded
    if (!fs.existsSync(htmlPath)) {
      throw new Error('Calibre conversion failed - output file not created');
    }

    // Read the converted HTML
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Convert HTML to Markdown using Pandoc
    if (commandExists('pandoc')) {
      // Write HTML to temp file to avoid command line length issues
      const htmlTempPath = path.join(tempDir, 'input.html');
      fs.writeFileSync(htmlTempPath, html, 'utf8');
      const mdResult = spawnSync('pandoc', ['-f', 'html', '-t', 'markdown', htmlTempPath], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
      if (mdResult.error) {
        throw new Error(`Pandoc conversion failed: ${mdResult.error.message}`);
      }
      if (mdResult.status !== 0) {
        throw new Error(`Pandoc conversion failed with status ${mdResult.status}: ${mdResult.stderr || ''}`);
      }
      markdown = mdResult.stdout;
    } else {
      // Fallback: strip HTML tags manually
      markdown = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return {
      markdown,
      images: [],
      tempDir,
    };
  } catch (error) {
    // Clean up temp dir on error
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw new Error(`Calibre conversion failed: ${error.message}`);
  }
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
  const tempDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ebook-'));

  try {
    if (ext === '.epub') {
      // First convert EPUB to HTML using Pandoc
      const html = await epubToHtml(filePath);
      // Write HTML to temp file to avoid command line length issues
      const htmlTempPath = path.join(tempDir, 'epub.html');
      fs.writeFileSync(htmlTempPath, html, 'utf8');
      // Then convert HTML to Markdown using Pandoc
      const mdResult = spawnSync('pandoc', ['-f', 'html', '-t', 'markdown', htmlTempPath], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
      if (mdResult.error) {
        throw new Error(`Pandoc conversion failed: ${mdResult.error.message}`);
      }
      markdown = mdResult.stdout;
    } else if (ext === '.pdf') {
      // PDF to Markdown using Pandoc
      const pdfResult = spawnSync('pandoc', ['-f', 'pdf', '-t', 'markdown', filePath], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
      if (pdfResult.error) {
        throw new Error(`Pandoc conversion failed: ${pdfResult.error.message}`);
      }
      if (pdfResult.status !== 0) {
        throw new Error(`Pandoc conversion failed with status ${pdfResult.status}: ${pdfResult.stderr}`);
      }
      markdown = pdfResult.stdout;
    } else if (ext === '.mobi' || ext === '.azw3') {
      // For Kindle formats, try Calibre first if available
      if (fs.existsSync(CALIBRE_PATH) || commandExists('ebook-convert')) {
        return convertViaCalibre(filePath, options);
      }
      // Fallback: generic pandoc conversion
      const mobiResult = spawnSync('pandoc', ['-t', 'markdown', filePath], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
      if (mobiResult.error) {
        throw new Error(`Pandoc conversion failed: ${mobiResult.error.message}`);
      }
      markdown = mobiResult.stdout;
    } else {
      // Try generic conversion
      const genResult = spawnSync('pandoc', ['-t', 'markdown', filePath], {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
      if (genResult.error) {
        throw new Error(`Pandoc conversion failed: ${genResult.error.message}`);
      }
      markdown = genResult.stdout;
    }
  } catch (error) {
    // Clean up temp dir on error
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw new Error(`Pandoc conversion failed: ${error.message}`);
  }

  // Clean up temp dir on success
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
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
  convertViaCalibre,
  convertViaNutrient,
  cleanupTemp,
  commandExists,
};
