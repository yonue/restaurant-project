let multer = null;

try {
  multer = require('multer');
} catch (error) {
  multer = null;
}

function createNoopUpload() {
  return (req, res, next) => next();
}

function createImageUpload(fieldName = 'image') {
  if (!multer) {
    return createNoopUpload();
  }

  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: Number(process.env.MAX_IMAGE_SIZE_BYTES || 5 * 1024 * 1024),
    },
  }).single(fieldName);
}

module.exports = {
  createImageUpload,
};
