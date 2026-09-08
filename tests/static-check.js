const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function normaliseLineEndings(source) {
  return source.replace(/\r\n?/g, "\n");
}

const requiredFiles = [
  "index.js",
  "README.md",
  "package.json",
  "views/review.ejs",
  "views/review-browse.ejs",
  "views/review-detail.ejs",
  "views/review-edit.ejs",
  "views/blog.ejs",
  "views/blog-details.ejs",
  "views/discussion.ejs",
  "views/discussion-detail.ejs",
  "views/wishlist.ejs",
  "views/wishlist-add.ejs",
  "views/partials/global-navigation.ejs",
  "public/css/navigation.css",
  ".env.example",
  "models/index.js",
  "models/password-reset-token.js",
  "models/product.js",
  "models/purchase.js",
  "models/wishlist-entry.js",
  "modules/account/docs/api-reference.md",
  "modules/account/docs/architecture.md",
  "modules/account/docs/database-diagram.mmd",
  "modules/account/docs/database-schema.md",
  "modules/account/docs/sample-data.md",
  "modules/account/public/profile.html",
  "modules/account/public/register.html",
  "modules/account/public/js/profile-view.js",
  "modules/account/src/mongo-repository.js",
  "modules/account/src/mongo-routes.js",
  "scripts/seed.js",
  "scripts/start-local.js",
];
requiredFiles.forEach(read);

const activeMarkup = fs
  .readdirSync(path.join(root, "views"))
  .filter((name) => name.endsWith(".ejs"))
  .map((name) => path.join("views", name))
  .concat(
    fs
      .readdirSync(path.join(root, "modules", "account", "public"))
      .filter((name) => name.endsWith(".html"))
      .map((name) => path.join("modules", "account", "public", name))
  );

for (const relativePath of activeMarkup) {
  const source = read(relativePath);
  if (/href\s*=\s*["']#["']/i.test(source)) {
    fail(`${relativePath}: contains a placeholder href="#"`);
  }

  const withoutEjs = source.replace(/<%[\s\S]*?%>/g, "");
  const ids = [...withoutEjs.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(
    (match) => match[1]
  );
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) {
    fail(`${relativePath}: duplicate static id(s): ${[...new Set(duplicateIds)].join(", ")}`);
  }
}

const canonicalTargets = [
  'href="/"',
  'href="/discussions"',
  'href="/blogs"',
  'href="/reviews/browse"',
  'href="/wishlist"',
  'href="/profile.html"',
];

const navigationPartial = read("views/partials/global-navigation.ejs");
for (const target of canonicalTargets) {
  if (!navigationPartial.includes(target)) {
    fail(`views/partials/global-navigation.ejs: missing canonical ${target}`);
  }
}

const manuallyRenderedNavigationViews = new Set([
  path.join("views", "wishlist.ejs"),
  path.join("views", "wishlist-add.ejs"),
]);

for (const relativePath of activeMarkup.filter((name) => name.startsWith("views"))) {
  const source = read(relativePath);
  if (manuallyRenderedNavigationViews.has(relativePath)) {
    for (const target of canonicalTargets) {
      if (!source.includes(target)) fail(`${relativePath}: missing canonical ${target}`);
    }
  } else if (!source.includes('include("partials/global-navigation"')) {
    fail(`${relativePath}: does not include the canonical navigation partial`);
  }
}

const indexSource = read("index.js");
for (const fragment of [
  'express.json({ limit: "6mb", strict: true })',
  'app.disable("x-powered-by")',
  'Cache-Control',
  '/review/review-detail.html',
  'Number.isInteger(rating)',
  'module.exports = { app, prepareApp, startServer }',
]) {
  if (!indexSource.includes(fragment)) fail(`index.js: missing ${fragment}`);
}

if (
  normaliseLineEndings(read("public/js/wishlist.js")) !==
  normaliseLineEndings(read("modules/account/public/js/wishlist.js"))
) {
  fail(
    "The integrated and standalone Wishlist controllers have diverged; " +
      "keep both served copies identical.",
  );
}

const packageJson = JSON.parse(read("package.json"));
if (!packageJson.scripts?.test || /Error: no test specified/.test(packageJson.scripts.test)) {
  fail("package.json: root test script is still a placeholder");
}
if (!packageJson.scripts?.check) fail("package.json: missing check script");

const loginController = read("modules/account/public/js/login.js");
for (const fragment of [
  "/reviews/browse",
  "/blogs",
  "/profile.html",
  "/deactivate-account",
  "allowedDynamicPath",
]) {
  if (!loginController.includes(fragment)) {
    fail(`modules/account/public/js/login.js: missing safe return support for ${fragment}`);
  }
}

const profilePage = read("modules/account/public/profile.html");
for (const fragment of [
  'src="js/profile-view.js"',
  'id="profileView"',
  'id="profileViewMessage"',
  'href="/editprofile.html"',
]) {
  if (!profilePage.includes(fragment)) {
    fail(`modules/account/public/profile.html: missing profile-page contract ${fragment}`);
  }
}

const profileViewController = read("modules/account/public/js/profile-view.js");
for (const fragment of ["initialiseShell", 'apiRequest("/api/profile")', "textContent"]) {
  if (!profileViewController.includes(fragment)) {
    fail(`modules/account/public/js/profile-view.js: missing profile-client contract ${fragment}`);
  }
}

const readme = read("README.md");
if (!/generated.*OpenAI Codex|OpenAI Codex.*generated/is.test(readme)) {
  fail("README.md: missing explicit AI-generation acknowledgement");
}
for (const section of ["Installation", "Demo accounts", "Routes", "Testing", "Data model"]) {
  if (!readme.toLowerCase().includes(section.toLowerCase())) {
    fail(`README.md: missing ${section} section`);
  }
}

const cssFiles = fs
  .readdirSync(path.join(root, "public", "css"))
  .filter((name) => name.endsWith(".css"))
  .map((name) => path.join("public", "css", name));

for (const relativePath of cssFiles) {
  const source = read(relativePath).replace(/\/\*[\s\S]*?\*\//g, "");
  const opens = (source.match(/{/g) || []).length;
  const closes = (source.match(/}/g) || []).length;
  if (opens !== closes) fail(`${relativePath}: CSS braces are unbalanced (${opens}/${closes})`);
}

const serverScripts = [
  "index.js",
  "forum-data.js",
  "blog-data.js",
  "review-data.js",
  "routes/blog-routes.js",
  "routes/register-blog-api.js",
  "database.js",
  "models/index.js",
  "models/password-reset-token.js",
  "models/product.js",
  "models/purchase.js",
  "models/user.js",
  "models/wishlist-entry.js",
  "modules/account/src/mongo-repository.js",
  "modules/account/src/mongo-routes.js",
  "scripts/seed.js",
  "scripts/start-local.js",
];

for (const relativePath of serverScripts) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relativePath)], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const diagnostic = result.stderr || result.error?.message || "unknown syntax-check failure";
    fail(`${relativePath}: ${diagnostic.trim()}`);
  }
}

const browserScripts = [
  ...fs
    .readdirSync(path.join(root, "public", "js"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(root, "public", "js", name)),
  ...fs
    .readdirSync(path.join(root, "modules", "account", "public", "js"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(root, "modules", "account", "public", "js", name)),
];

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "rmit-static-check-"));
try {
  for (let index = 0; index < browserScripts.length; index += 1) {
    const temporaryFile = path.join(temporaryDirectory, `browser-${index}.mjs`);
    fs.copyFileSync(browserScripts[index], temporaryFile);
    const result = spawnSync(process.execPath, ["--check", temporaryFile], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      const diagnostic = result.stderr || result.error?.message || "unknown syntax-check failure";
      fail(`${path.relative(root, browserScripts[index])}: ${diagnostic.trim()}`);
    }
  }
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`STATIC CHECK FAILED (${failures.length})`);
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(
    `STATIC CHECK PASSED: ${activeMarkup.length} active pages, ` +
      `${serverScripts.length + browserScripts.length} JavaScript files, and ${cssFiles.length} stylesheets.`
  );
}
