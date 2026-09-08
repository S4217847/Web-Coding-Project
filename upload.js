const multer = require("multer");
const path = require("node:path");
const fs = require("node:fs/promises");

const storage = multer.diskStorage({
  destination: function (_request, _file, callback) {
    callback(null, path.join(__dirname, "public", "uploads"));
  },
  filename: function (_request, file, callback) {
    const extension = file.mimetype === "image/png" ? ".png" : ".jpg";
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1E9) + extension;

    callback(null, uniqueName);
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
  storage: storage,
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

  const imageBytes = await fs.readFile(request.file.path);
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

  await fs.unlink(request.file.path);
  next(new Error("Only JPEG and PNG images are allowed."));
}

module.exports = { upload, validateForumImage };
