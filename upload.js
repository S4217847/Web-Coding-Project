const multer = require("multer");
const path = require("node:path");

const storage = multer.diskStorage({
  destination: function (_request, _file, callback) {
    callback(null, path.join(__dirname, "public", "uploads"));
  },
  filename: function (_request, file, callback) {
    const extension = path.extname(file.originalname);
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

module.exports = { upload };
