import fs from "node:fs";
import path from "node:path";
import {
    fileURLToPath,
    pathToFileURL
} from "node:url";

const testsDirectory = path.dirname(
    fileURLToPath(import.meta.url)
);

const root = path.resolve(
    testsDirectory,
    ".."
);

const publicDirectory = path.join(
    root,
    "public"
);

const failures = [];

function fail(message) {
    failures.push(message);
}

function exists(relativePath) {
    return fs.existsSync(
        path.join(root, relativePath)
    );
}

function read(relativePath) {
    return fs.readFileSync(
        path.join(root, relativePath),
        "utf8"
    );
}

function matches(source, pattern) {
    return [...source.matchAll(pattern)];
}

function count(source, pattern) {
    return matches(source, pattern).length;
}

function checkJavaScript(relativePath) {
    const source = read(relativePath)
        .replace(
            /^\s*import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm,
            ""
        )
        .replace(
            /^\s*export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm,
            ""
        );

    try {
        Function(source);
    } catch (error) {
        fail(
            `${relativePath}: JavaScript syntax failed: ` +
            error.message
        );
    }
}

function checkCss(relativePath) {
    const source = read(relativePath)
        .replace(/\/\*[\s\S]*?\*\//g, "");

    let depth = 0;

    for (const character of source) {
        if (character === "{") {
            depth += 1;
        }

        if (character === "}") {
            depth -= 1;
        }

        if (depth < 0) {
            fail(
                `${relativePath}: closing brace has no opening brace`
            );
            return;
        }
    }

    if (depth !== 0) {
        fail(
            `${relativePath}: unbalanced CSS braces (${depth})`
        );
    }
}

const pageScripts = new Map([
    ["public/login.html", "login.js"],
    ["public/wishlist-add.html", "catalogue.js"],
    ["public/wishlist.html", "wishlist.js"],
    ["public/editprofile.html", "profile.js"],
    ["public/admin.html", "admin.js"]
]);

const htmlSources = new Map();

for (const file of pageScripts.keys()) {
    if (!exists(file)) {
        fail(`${file}: required page is missing`);
        continue;
    }

    htmlSources.set(
        path.normalize(path.join(root, file)),
        read(file)
    );
}

for (
    const [file, expectedScript]
    of pageScripts.entries()
) {
    if (!exists(file)) {
        continue;
    }

    const source = read(file);
    const absoluteFile = path.join(root, file);
    const fileDirectory =
        path.dirname(absoluteFile);

    for (const [label, pattern] of [
        ["doctype", /<!DOCTYPE html>/gi],
        ["English language", /<html\s+lang="en">/gi],
        ["header landmark", /<header\b/gi],
        ["main landmark", /<main\b/gi],
        ["page heading", /<h1\b/gi],
        ["footer landmark", /<footer\b/gi]
    ]) {
        const actual = count(source, pattern);

        if (actual !== 1) {
            fail(
                `${file}: expected one ${label}, found ${actual}`
            );
        }
    }

    if (
        !/<a\b[^>]*class="[^"]*skipLink[^"]*"[^>]*href="#main-content"/i
            .test(source)
    ) {
        fail(
            `${file}: skip link must target #main-content`
        );
    }

    if (!/<main\b[^>]*id="main-content"/i.test(source)) {
        fail(
            `${file}: main needs id="main-content"`
        );
    }

    if (!/AI Use Acknowledgement/i.test(source)) {
        fail(`${file}: AI acknowledgement is missing`);
    }

    if (
        /\son(?:click|change|input|submit|load)\s*=/i
            .test(source)
    ) {
        fail(`${file}: inline event handler found`);
    }

    if (/href\s*=\s*["']#["']/i.test(source)) {
        fail(`${file}: placeholder href="#" found`);
    }

    if (/<<<<<<<|=======|>>>>>>>/.test(source)) {
        fail(`${file}: merge-conflict marker found`);
    }

    const expectedScriptPattern = new RegExp(
        `src=["'](?:/)?js/${expectedScript.replace(".", "\\.")}["']`,
        "i"
    );

    if (!expectedScriptPattern.test(source)) {
        fail(
            `${file}: missing module script js/${expectedScript}`
        );
    }

    const ids = matches(
        source,
        /\bid="([^"]+)"/gi
    ).map((match) => match[1]);

    const duplicateIds = ids.filter(
        (id, index) =>
            ids.indexOf(id) !== index
    );

    if (duplicateIds.length > 0) {
        fail(
            `${file}: duplicate IDs: ` +
            [...new Set(duplicateIds)].join(", ")
        );
    }

    const idSet = new Set(ids);

    for (const match of matches(
        source,
        /\b(?:aria-describedby|aria-labelledby)="([^"]+)"/gi
    )) {
        for (const id of match[1].split(/\s+/)) {
            if (!idSet.has(id)) {
                fail(
                    `${file}: ARIA reference #${id} does not exist`
                );
            }
        }
    }

    const labelledIds = new Set(
        matches(
            source,
            /<label\b[^>]*\bfor="([^"]+)"/gi
        ).map((match) => match[1])
    );

    for (const match of matches(
        source,
        /<(input|select|textarea)\b([^>]*)>/gi
    )) {
        const attributes = match[2];

        if (
            /\btype="(?:hidden|submit|button|reset)"/i
                .test(attributes)
        ) {
            continue;
        }

        const id = attributes.match(
            /\bid="([^"]+)"/i
        )?.[1];

        const hasAccessibleName =
            /\baria-label(?:ledby)?="[^"]+"/i
                .test(attributes) ||
            (id && labelledIds.has(id));

        if (!hasAccessibleName) {
            fail(
                `${file}: ${match[1]}` +
                `${id ? ` #${id}` : ""} has no label`
            );
        }
    }

    for (const match of matches(
        source,
        /<button\b([^>]*)>/gi
    )) {
        if (
            !/\btype="(?:button|submit|reset)"/i
                .test(match[1])
        ) {
            fail(
                `${file}: button is missing an explicit type`
            );
        }
    }

    for (const match of matches(
        source,
        /\b(?:href|src|action)="([^"]+)"/gi
    )) {
        const reference = match[1];

        if (
            /^(?:https?:|mailto:|data:|\/api\/)/i
                .test(reference)
        ) {
            continue;
        }

        const [filePart, fragment] =
            reference.split("#", 2);

        let targetFile = absoluteFile;

        if (filePart) {
            targetFile = filePart.startsWith("/")
                ? path.join(
                    publicDirectory,
                    filePart.slice(1)
                )
                : path.resolve(
                    fileDirectory,
                    filePart
                );
        }

        if (!fs.existsSync(targetFile)) {
            fail(
                `${file}: local reference does not exist: ${reference}`
            );
            continue;
        }

        if (
            fragment &&
            path.extname(targetFile)
                .toLowerCase() === ".html"
        ) {
            const targetSource =
                htmlSources.get(
                    path.normalize(targetFile)
                ) ??
                fs.readFileSync(targetFile, "utf8");

            const escapedFragment =
                fragment.replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                );

            if (
                !new RegExp(
                    `\\bid=["']${escapedFragment}["']`
                ).test(targetSource)
            ) {
                fail(
                    `${file}: fragment #${fragment} is missing in ` +
                    path.basename(targetFile)
                );
            }
        }
    }
}

const cssFiles = [
    "public/css/app.css",
    "public/css/account.css",
    "public/css/wishlist.css"
];

for (const file of cssFiles) {
    if (!exists(file)) {
        fail(`${file}: required stylesheet is missing`);
    } else {
        checkCss(file);
    }
}

const browserScriptNames = [
    "api.js",
    "ui.js",
    "shell.js",
    "login.js",
    "catalogue.js",
    "wishlist.js",
    "profile.js",
    "admin.js"
];

for (const name of browserScriptNames) {
    const file = `public/js/${name}`;

    if (!exists(file)) {
        fail(`${file}: required browser module is missing`);
        continue;
    }

    checkJavaScript(file);

    const source = read(file);

    if (
        /\.innerHTML\s*=|insertAdjacentHTML\s*\(/.test(source)
    ) {
        fail(
            `${file}: unsafe HTML insertion found; use DOM construction/textContent`
        );
    }

    if (/<<<<<<<|=======|>>>>>>>/.test(source)) {
        fail(`${file}: merge-conflict marker found`);
    }

    if (
        /(?:local|session)Storage\.setItem\s*\([^\n]*(?:password|token|session)/i
            .test(source)
    ) {
        fail(
            `${file}: sensitive data appears to be written to Web Storage`
        );
    }
}

if (exists("public/js/catalogue.js")) {
    const source = read("public/js/catalogue.js");

    for (const required of [
        ".filter(",
        ".sort(",
        "sessionStorage",
        "addEventListener",
        "validateSearch"
    ]) {
        if (!source.includes(required)) {
            fail(
                `public/js/catalogue.js: missing ${required}`
            );
        }
    }
}

if (
    exists("public/js/catalogue.js") &&
    exists("public/js/wishlist.js")
) {
    const wishlistSource =
        read("public/js/catalogue.js") +
        read("public/js/wishlist.js");

    for (const method of [
        '"POST"',
        '"PATCH"',
        '"DELETE"'
    ]) {
        if (!wishlistSource.includes(method)) {
            fail(
                `Wishlist browser modules: missing ${method} request`
            );
        }
    }
}

if (exists("public/js/profile.js")) {
    const source = read("public/js/profile.js");

    if (!source.includes("localStorage")) {
        fail(
            "public/js/profile.js: safe draft storage is missing"
        );
    }

    if (
        /password[^\n]*localStorage|localStorage[^\n]*password/i
            .test(source)
    ) {
        fail(
            "public/js/profile.js: passwords must not enter localStorage"
        );
    }

    if (!source.includes("user.id")) {
        fail(
            "public/js/profile.js: drafts should be scoped to the current user"
        );
    }
}

if (exists("public/js/admin.js")) {
    const source = read("public/js/admin.js");

    for (const required of [
        ".filter(",
        "/api/admin/users"
    ]) {
        if (!source.includes(required)) {
            fail(
                `public/js/admin.js: missing ${required}`
            );
        }
    }
}

const serverFiles = [
    "server.js",
    "src/app.js",
    "src/data.js",
    "src/passwords.js",
    "src/validation.js"
];

for (const file of serverFiles) {
    if (!exists(file)) {
        fail(`${file}: required server module is missing`);
        continue;
    }

    try {
        await import(
            `${pathToFileURL(
                path.join(root, file)
            ).href}?staticCheck=${Date.now()}`
        );
    } catch (error) {
        fail(
            `${file}: module import failed: ${error.message}`
        );
    }
}

if (exists("src/app.js")) {
    const source = read("src/app.js");

    if (source.includes("request.query")) {
        fail(
            "src/app.js: product filtering/sorting must remain client-side"
        );
    }

    for (const route of [
        "/api/session",
        "/api/products",
        "/api/wishlist",
        "/api/profile",
        "/api/admin/users"
    ]) {
        if (!source.includes(route)) {
            fail(`src/app.js: missing ${route}`);
        }
    }

    for (const required of [
        "app.get",
        "app.post",
        "app.patch",
        "app.delete",
        "httpOnly",
        "sameSite",
        "requireUser",
        "requireAdmin",
        "express.json"
    ]) {
        if (!source.includes(required)) {
            fail(`src/app.js: missing ${required}`);
        }
    }
}

if (exists("package.json")) {
    try {
        const packageJson =
            JSON.parse(read("package.json"));

        const dependencies = Object.keys(
            packageJson.dependencies ?? {}
        ).sort();

        assertDependencies(dependencies);
    } catch (error) {
        fail(
            `package.json: ${error.message}`
        );
    }
} else {
    fail("package.json: missing");
}

function assertDependencies(dependencies) {
    const expected = [
        "express",
        "express-session"
    ];

    if (
        JSON.stringify(dependencies) !==
        JSON.stringify(expected)
    ) {
        fail(
            "package.json: unexpected runtime dependencies: " +
            dependencies.join(", ")
        );
    }
}

for (const image of [
    "connect-hoodie.jpg",
    "data-bootcamp.jpg",
    "design-market.jpg",
    "peer-workshop.jpg",
    "photo-walk.jpg"
]) {
    if (!exists(`public/images/${image}`)) {
        fail(`public/images/${image}: missing`);
    }
}

if (failures.length > 0) {
    console.error(
        `STATIC CHECK FAILED (${failures.length})`
    );

    for (const failure of failures) {
        console.error(`- ${failure}`);
    }

    process.exitCode = 1;
} else {
    console.log(
        "STATIC CHECK PASSED: " +
        `${pageScripts.size} pages, ` +
        `${browserScriptNames.length} browser modules, ` +
        `${serverFiles.length} server modules.`
    );
}
