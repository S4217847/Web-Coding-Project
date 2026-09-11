const multer = require("multer");
const path = require("node:path");
const fs = require("node:fs/promises");

const isVercelDeployment = process.env.VERCEL === "1";

const localStorage = multer.diskStorage({
  destination: function (_request, _file, callback) {
    callback(null, path.join(__dirname, "public", "uploads"));
  },
  filename: function (_request, file, callback) {
    const extension = file.mimetype === "image/png" ? ".png" : ".jpg";
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  },
});

function checkImageFile(_request, file, callback) {
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/png") {
    callback(null, true);
    return;
  }

  callback(new Error("Only JPEG and PNG images are allowed."), false);
}

const upload = multer({
  // Vercel functions have a read-only deployment filesystem. Keep uploads in
  // memory there; local development continues to use public/uploads.
  storage: isVercelDeployment ? multer.memoryStorage() : localStorage,
  limits: {
    fileSize: 1024 * 1024 * 5,
  },
  fileFilter: checkImageFile,
});

// Check the file's starting bytes, not just the type sent by the browser.
async function validateForumImage(request, response, next) {
  if (!request.file) {
    next();
    return;
  }

  const imageBytes = request.file.buffer || (await fs.readFile(request.file.path));

  if (!Buffer.isBuffer(imageBytes)) {
    next(new Error("The uploaded image could not be read."));
    return;
  }
  const pngSignature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const isPng =
    imageBytes.length >= pngSignature.length &&
    imageBytes.subarray(0, pngSignature.length).equals(pngSignature);
  const isJpeg =
    imageBytes.length >= 3 &&
    imageBytes[0] === 0xff &&
    imageBytes[1] === 0xd8 &&
    imageBytes[2] === 0xff;

  if (
    (request.file.mimetype === "image/png" && isPng) ||
    (request.file.mimetype === "image/jpeg" && isJpeg)
  ) {
    next();
    return;
  }

  if (request.file.path) {
    await fs.unlink(request.file.path);
  }
  next(new Error("Only JPEG and PNG images are allowed."));
}

function forumImageDataUrl(uploadedFile) {
  if (!uploadedFile) {
    return null;
  }

  if (!Buffer.isBuffer(uploadedFile.buffer)) {
    return `/uploads/${uploadedFile.filename}`;
  }

  return `data:${uploadedFile.mimetype};base64,${uploadedFile.buffer.toString("base64")}`;
}

module.exports = { upload, validateForumImage, forumImageDataUrl };
