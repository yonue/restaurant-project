const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let sharp = null;
try {
  sharp = require('sharp');
} catch (error) {
  sharp = null;
}

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const UPLOAD_DIR = path.join(PROJECT_ROOT, 'uploads');
const MENU_DIR = path.join(UPLOAD_DIR, 'menu');
const GALLERY_DIR = path.join(UPLOAD_DIR, 'gallery');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureMenuUploadDir() {
  ensureDir(MENU_DIR);
  return MENU_DIR;
}

function ensureGalleryUploadDir() {
  ensureDir(GALLERY_DIR);
  return GALLERY_DIR;
}

function parseBase64Image(input) {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const dataUrlMatch = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1],
      data: dataUrlMatch[2],
    };
  }

  return {
    mimeType: process.env.DEFAULT_IMAGE_MIME || 'image/png',
    data: input,
  };
}

function extensionFromMime(mimeType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'video/mp4': 'mp4',
  };

  return map[mimeType] || 'bin';
}

async function optimizeImageBuffer(buffer, mimeType) {
  if (!sharp) {
    return buffer;
  }

  if (mimeType === 'image/svg+xml' || mimeType === 'image/gif') {
    return buffer;
  }

  try {
    const pipeline = sharp(buffer).resize({ width: 1200, withoutEnlargement: true, fit: 'inside' });

    if (mimeType === 'image/png') {
      return await pipeline.png({ compressionLevel: 9 }).toBuffer();
    }

    if (mimeType === 'image/webp') {
      return await pipeline.webp({ quality: 82 }).toBuffer();
    }

    return await pipeline.jpeg({ quality: 82 }).toBuffer();
  } catch (error) {
    return buffer;
  }
}

async function saveBufferImage(buffer, mimeType, prefix = 'image') {
  if (!buffer) {
    return null;
  }

  const optimized = await optimizeImageBuffer(buffer, mimeType || 'image/jpeg');
  const safeMimeType = mimeType || 'image/jpeg';
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extensionFromMime(safeMimeType)}`;
  const filePath = path.join(ensureMenuUploadDir(), filename);

  fs.writeFileSync(filePath, optimized);

  return filePath;
}

async function saveGalleryBuffer(buffer, mimeType, prefix = 'gallery') {
  if (!buffer) return null;
  const safeMimeType = mimeType || 'image/jpeg';
  const optimized = safeMimeType.startsWith('image/') ? await optimizeImageBuffer(buffer, safeMimeType) : buffer;
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extensionFromMime(safeMimeType)}`;
  const filePath = path.join(ensureGalleryUploadDir(), filename);
  fs.writeFileSync(filePath, optimized);
  return filePath;
}

async function saveBase64Image(imageInput, prefix = 'image') {
  const parsed = parseBase64Image(imageInput);
  if (!parsed || !parsed.data) {
    return null;
  }

  const buffer = Buffer.from(parsed.data, 'base64');
  return saveBufferImage(buffer, parsed.mimeType, prefix);
}

function deleteStoredFile(filePath) {
  if (!filePath) {
    return false;
  }

  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
  if (fs.existsSync(resolvedPath)) {
    fs.unlinkSync(resolvedPath);
    return true;
  }

  return false;
}

function toPublicPath(filePath) {
  if (!filePath) {
    return null;
  }

  return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/');
}

module.exports = {
  MENU_DIR,
  PROJECT_ROOT,
  saveBase64Image,
  saveBufferImage,
  saveGalleryBuffer,
  deleteStoredFile,
  toPublicPath,
};
