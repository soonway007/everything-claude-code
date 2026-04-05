/**
 * Ebook Document Conversion
 * Converts ebooks (EPUB/PDF) to Markdown using Pandoc + Nutrient API pipeline.
 */

const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const { spawnSync, spawn } = require('child_process');

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

  return new Promise((resolve, reject) => {
    const proc = spawn('pandoc', ['-f', 'epub', '-t', 'html', filePath], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data;
    });

    proc.stderr.on('data', (data) => {
      stderr += data;
    });

    proc.on('error', (error) => {
      reject(new Error(`Pandoc conversion failed: ${error.message}`));
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Pandoc conversion failed with status ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
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

  const tempDir = await fsPromises.mkdtemp(path.join(require('os').tmpdir(), 'ebook-'));
  const htmlPath = path.join(tempDir, 'converted.html');
  let markdown = '';

  try {
    // Convert MOBI/AZW3 to HTML using Calibre's ebook-convert
    await new Promise((resolve, reject) => {
      const proc = spawn(calibrePath, [filePath, htmlPath], {
        encoding: 'utf8',
        maxBuffer: 100 * 1024 * 1024, // 100MB buffer for large files
      });

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data;
      });

      proc.on('error', (error) => {
        reject(new Error(`Calibre conversion failed: ${error.message}`));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Calibre conversion failed with status ${code}: ${stderr || ''}`));
        } else {
          resolve();
        }
      });
    });

    // Check if conversion succeeded
    try {
      await fsPromises.access(htmlPath);
    } catch {
      throw new Error('Calibre conversion failed - output file not created');
    }

    // Read the converted HTML
    const html = await fsPromises.readFile(htmlPath, 'utf8');

    // Convert HTML to Markdown using Pandoc
    if (commandExists('pandoc')) {
      // Write HTML to temp file to avoid command line length issues
      const htmlTempPath = path.join(tempDir, 'input.html');
      await fsPromises.writeFile(htmlTempPath, html, 'utf8');

      // Use async pandoc conversion
      markdown = await new Promise((resolve, reject) => {
        const proc = spawn('pandoc', ['-f', 'html', '-t', 'markdown', htmlTempPath], {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
        });

        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (data) => { stdout += data; });
        proc.stderr.on('data', (data) => { stderr += data; });

        proc.on('error', (error) => {
          reject(new Error(`Pandoc conversion failed: ${error.message}`));
        });

        proc.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Pandoc conversion failed with status ${code}: ${stderr || ''}`));
          } else {
            resolve(stdout);
          }
        });
      });
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
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
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
  const tempDir = await fsPromises.mkdtemp(path.join(require('os').tmpdir(), 'ebook-'));

  try {
    if (ext === '.epub') {
      // First convert EPUB to HTML using Pandoc
      const html = await epubToHtml(filePath);
      // Write HTML to temp file to avoid command line length issues
      const htmlTempPath = path.join(tempDir, 'epub.html');
      await fsPromises.writeFile(htmlTempPath, html, 'utf8');
      // Then convert HTML to Markdown using Pandoc
      markdown = await new Promise((resolve, reject) => {
        const proc = spawn('pandoc', ['-f', 'html', '-t', 'markdown', htmlTempPath], {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (data) => { stdout += data; });
        proc.stderr.on('data', (data) => { stderr += data; });
        proc.on('error', (error) => reject(new Error(`Pandoc conversion failed: ${error.message}`)));
        proc.on('close', (code) => {
          if (code !== 0) reject(new Error(`Pandoc conversion failed with status ${code}: ${stderr}`));
          else resolve(stdout);
        });
      });
    } else if (ext === '.pdf') {
      // PDF to Markdown using Pandoc
      markdown = await new Promise((resolve, reject) => {
        const proc = spawn('pandoc', ['-f', 'pdf', '-t', 'markdown', filePath], {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (data) => { stdout += data; });
        proc.stderr.on('data', (data) => { stderr += data; });
        proc.on('error', (error) => reject(new Error(`Pandoc conversion failed: ${error.message}`)));
        proc.on('close', (code) => {
          if (code !== 0) reject(new Error(`Pandoc conversion failed with status ${code}: ${stderr}`));
          else resolve(stdout);
        });
      });
    } else if (ext === '.mobi' || ext === '.azw3') {
      // For Kindle formats, try Calibre first if available
      if (fs.existsSync(CALIBRE_PATH) || commandExists('ebook-convert')) {
        return convertViaCalibre(filePath, options);
      }
      // Fallback: generic pandoc conversion
      markdown = await new Promise((resolve, reject) => {
        const proc = spawn('pandoc', ['-t', 'markdown', filePath], {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
        });
        let stdout = '';
        proc.stdout.on('data', (data) => { stdout += data; });
        proc.on('error', (error) => reject(new Error(`Pandoc conversion failed: ${error.message}`)));
        proc.on('close', (code) => {
          if (code !== 0) reject(new Error(`Pandoc conversion failed with status ${code}`));
          else resolve(stdout);
        });
      });
    } else {
      // Try generic conversion
      markdown = await new Promise((resolve, reject) => {
        const proc = spawn('pandoc', ['-t', 'markdown', filePath], {
          encoding: 'utf8',
          maxBuffer: 50 * 1024 * 1024,
        });
        let stdout = '';
        proc.stdout.on('data', (data) => { stdout += data; });
        proc.on('error', (error) => reject(new Error(`Pandoc conversion failed: ${error.message}`)));
        proc.on('close', (code) => {
          if (code !== 0) reject(new Error(`Pandoc conversion failed with status ${code}`));
          else resolve(stdout);
        });
      });
    }
  } catch (error) {
    // Clean up temp dir on error
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw new Error(`Pandoc conversion failed: ${error.message}`);
  }

  // Clean up temp dir on success
  try {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
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
