/**
 * Ebook Image Extraction
 * Extracts images from ebooks and rewrites markdown links to relative paths.
 */

const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} ImageResult
 * @property {string} markdown - Updated markdown with rewritten links
 * @property {string[]} extractedImages - Paths to extracted images
 */

/**
 * Generate a slug from a string for use in filenames/folders
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
 * Extract images from ebook content and save to attachments folder
 * Note: This is a placeholder implementation. Actual image extraction
 * depends on the conversion method used (Nutrient API handles this automatically).
 *
 * @param {string} markdown - Markdown content (may contain image references)
 * @param {string} sourcePath - Original ebook file path
 * @param {string} targetVault - Target Obsidian vault path
 * @param {Object} metadata - Ebook metadata
 * @returns {Promise<ImageResult>}
 */
async function extractImages(markdown, sourcePath, targetVault, metadata) {
  const slug = slugify(metadata.title || path.basename(sourcePath, path.extname(sourcePath)));
  const attachmentsDir = path.join(targetVault, 'attachments', slug);

  // Ensure attachments directory exists
  if (!fs.existsSync(attachmentsDir)) {
    fs.mkdirSync(attachmentsDir, { recursive: true });
  }

  // For Nutrient API conversions, images are already extracted to the attachments folder
  // For Pandoc conversions, images are embedded as base64 or referenced externally
  // This function handles rewriting base64 images to files if needed

  const extractedImages = [];

  // Find base64 encoded images in markdown
  const base64ImagePattern = /!\[([^\]]*)\]\(data:image\/([^;]+);base64,([^)]+)\)/g;
  let match;
  let processedMarkdown = markdown;

  while ((match = base64ImagePattern.exec(markdown)) !== null) {
    const [, altText, mimeType, base64Data] = match;
    const filename = `image-${extractedImages.length + 1}.${getExtensionFromMime(mimeType)}`;
    const imagePath = path.join(attachmentsDir, filename);

    try {
      // Decode base64 and save to file
      const imageBuffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(imagePath, imageBuffer);
      extractedImages.push(imagePath);

      // Rewrite markdown to use relative path
      const relativePath = `attachments/${slug}/${filename}`;
      const newImageRef = `![${altText}](${relativePath})`;
      processedMarkdown = processedMarkdown.replace(match[0], newImageRef);
    } catch (error) {
      console.warn(`Failed to extract image: ${error.message}`);
    }
  }

  return {
    markdown: processedMarkdown,
    extractedImages,
  };
}

/**
 * Get file extension from MIME type
 * @param {string} mimeType
 * @returns {string}
 */
function getExtensionFromMime(mimeType) {
  const mimeMap = {
    'jpeg': 'jpg',
    'jpg': 'jpg',
    'png': 'png',
    'gif': 'gif',
    'webp': 'webp',
    'svg': 'svg',
    'bmp': 'bmp',
  };
  return mimeMap[mimeType] || 'png';
}

/**
 * Rewrite image links to relative paths within the vault
 * @param {string} markdown - Markdown content
 * @param {Object} metadata - Ebook metadata
 * @returns {string} - Updated markdown content
 */
function rewriteImageLinks(markdown, metadata) {
  const slug = slugify(metadata.title || 'unknown');

  // Pattern to match external image URLs
  const externalImagePattern = /!\[([^\]]*)\]\((https?:\/\/[^\)]+)\)/g;

  // Replace external images with placeholder (or download them)
  let result = markdown.replace(externalImagePattern, (match, altText, url) => {
    // Skip if it's already a relative path
    if (url.startsWith('attachments/') || url.startsWith('./') || url.startsWith('../')) {
      return match;
    }
    // For now, comment out external images with a note
    // In production, you might want to download them
    return `<!-- External image: ${url} -->\n![${altText}](attachments/${slug}/external-placeholder.png)`;
  });

  // Ensure all image paths point to attachments folder
  // Pattern: images that are in the same directory (no path prefix)
  const localImagePattern = /!\[([^\]]*)\]\(([^\/][^)]+)\)/g;
  result = result.replace(localImagePattern, (match, altText, filename) => {
    // Skip if already has attachments prefix
    if (filename.startsWith('attachments/')) {
      return match;
    }
    // Skip external URLs (already handled above)
    if (filename.startsWith('http') || filename.startsWith('//')) {
      return match;
    }
    // Skip data URLs (already handled in extractImages)
    if (filename.startsWith('data:')) {
      return match;
    }
    // Rewrite to attachments path
    return `![${altText}](attachments/${slug}/${filename})`;
  });

  return result;
}

/**
 * Verify that all image references in markdown exist in the attachments folder
 * @param {string} markdown - Markdown content
 * @param {string} vaultPath - Obsidian vault path
 * @param {string} bookSlug - Book slug for attachments path
 * @returns {{ valid: boolean, missingImages: string[] }}
 */
function verifyImageLinks(markdown, vaultPath, bookSlug) {
  const missingImages = [];
  const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match;

  const attachmentsBase = path.join(vaultPath, 'attachments', bookSlug);

  while ((match = imagePattern.exec(markdown)) !== null) {
    const imagePath = match[2];

    // Skip external URLs
    if (imagePath.startsWith('http') || imagePath.startsWith('//') || imagePath.startsWith('data:')) {
      continue;
    }

    // Skip comment lines
    if (imagePath.startsWith('attachments/')) {
      const fullPath = path.join(vaultPath, imagePath);
      if (!fs.existsSync(fullPath)) {
        missingImages.push(imagePath);
      }
    }
  }

  return {
    valid: missingImages.length === 0,
    missingImages,
  };
}

module.exports = {
  extractImages,
  rewriteImageLinks,
  verifyImageLinks,
  slugify,
};
