/**
 * Express application factory and RMIT Connect JSON API.
 *
 * createApp accepts injected storage and public-directory options for testing.
 * Routes use a consistent success/error envelope, authenticate with a server-side
 * session, and expose users only through publicUser() so password hashes stay private.
 */
import crypto from "node:crypto";

import path from "node:path";
import {
    fileURLToPath
} from "node:url";

import express from "express";
import session from "express-session";

import { dataStore } from "./data.js";
import {
    createPasswordHash,
    verifyPassword
} from "./passwords.js";

import {
    cleanText,
    hasValidationErrors,
    isPlainObject,
    validateLogin,
    validateProfilePatch
} from "./validation.js";

const currentDirectory =
    path.dirname(
        fileURLToPath(import.meta.url)
    );

const defaultPublicDirectory =
    path.resolve(
        currentDirectory,
        "../public"
    );

// ---------- API response and presentation helpers ----------

function sendData(response, data, status = 200) {
    return response.status(status).json({
        success: true,
        data
    });
}

function sendError(
    response,
    status,
    code,
    message,
    fields
) {
    const error = { code, message };

    if (
        fields &&
        Object.keys(fields).length > 0
    ) {
        error.fields = fields;
    }

    return response.status(status).json({
        success: false,
        error
    });
}

function publicUser(user) {
    // Explicit selection prevents password hashes reaching the client.
    return {
        id: user.id,
        username: user.username,
        studentId: user.studentId,
        name: user.name,
        email: user.email,
        description: user.description,
        avatarUrl: user.avatarUrl,
        avatarDataUrl:
            user.avatarDataUrl ?? "",
        role: user.role,
        status: user.status,
        lastActiveAt: user.lastActiveAt
    };
}

function adminSummary(users) {
    return {
        total: users.length,

        active:
            users.filter(
                (user) =>
                    user.status === "active"
            ).length,

        locked:
            users.filter(
                (user) =>
                    user.status === "locked"
            ).length,

        administrators:
            users.filter(
                (user) =>
                    user.role === "admin"
            ).length
    };
}

// ---------- Wishlist domain helpers ----------

function wishlistSummary(store, userId) {
    // The UI's "saved" total includes entries already staged in the cart.
    const wishlistItems =
        store.wishlist.filter(
            (entry) =>
                entry.userId === userId
        );

    const cartItems =
        store.cart.filter(
            (entry) =>
                entry.userId === userId
        );

    const savedItems =
        wishlistItems.length +
        cartItems.length;

    const readyForCart =
        cartItems.length;

    return {
        saved: savedItems,
        wishlist: savedItems,
        savedItems,
        cart: readyForCart,
        readyForCart,
        purchased:
            store.purchases.filter(
                (entry) =>
                    entry.userId === userId
            ).length
    };
}

function productFor(store, productId) {
    return store.products.find(
        (product) =>
            product.id === productId
    );
}

function findUserItem(
    store,
    userId,
    productId
) {
    /*
        Include userId in every lookup: a product ID from the URL never grants
        access to another user's entry. POST enforces the one-entry-across-
        wishlist-and-cart invariant that makes this first match unambiguous.
    */
    const wishlistIndex =
        store.wishlist.findIndex(
            (entry) =>
                entry.userId === userId &&
                entry.productId === productId
        );

    if (wishlistIndex >= 0) {
        return {
            collection: store.wishlist,
            entry:
                store.wishlist[wishlistIndex],
            index: wishlistIndex,
            location: "wishlist"
        };
    }

    const cartIndex =
        store.cart.findIndex(
            (entry) =>
                entry.userId === userId &&
                entry.productId === productId
        );

    if (cartIndex >= 0) {
        return {
            collection: store.cart,
            entry:
                store.cart[cartIndex],
            index: cartIndex,
            location: "cart"
        };
    }

    return null;
}

function presentProduct(product) {
    return {
        ...product,
        price: product.priceVnd,
        wishlisted:
            product.stats.wishlisted,
        inCarts:
            product.stats.inCarts,
        purchased:
            product.stats.purchased
    };
}

function presentWishlistEntry(
    store,
    entry
) {
    return {
        id: entry.id,
        status: entry.status,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        product:
            presentProduct(
                productFor(
                    store,
                    entry.productId
                )
            )
    };
}

function presentPurchase(
    store,
    purchase
) {
    return {
        id: purchase.id,

        purchasedAt:
            purchase.purchasedAt,

        product:
            presentProduct(
                productFor(
                    store,
                    purchase.productId
                )
            )
    };
}

function createAuthMiddleware(store) {
    /*
        requireUser resolves the small session userId into the current, trusted
        server record on every protected request. Deleted users and newly locked
        accounts therefore lose access immediately. requireAdmin is a second,
        role-specific gate and must run after requireUser has set currentUser.
    */
    function requireUser(
        request,
        response,
        next
    ) {
        if (!request.session.userId) {
            return sendError(
                response,
                401,
                "AUTH_REQUIRED",
                "Sign in to continue."
            );
        }

        const user = store.users.find(
            (candidate) =>
                candidate.id ===
                request.session.userId
        );

        if (!user) {
            request.session.destroy(() => {});

            return sendError(
                response,
                401,
                "SESSION_INVALID",
                "This session is no longer valid."
            );
        }

        if (user.status === "locked") {
            request.session.destroy(() => {});

            return sendError(
                response,
                423,
                "ACCOUNT_LOCKED",
                "This account is locked. Contact an administrator."
            );
        }

        request.currentUser = user;
        return next();
    }

    function requireAdmin(
        request,
        response,
        next
    ) {
        if (
            request.currentUser.role !== "admin"
        ) {
            return sendError(
                response,
                403,
                "ADMIN_REQUIRED",
                "Administrator access is required."
            );
        }

        return next();
    }

    return {
        requireUser,
        requireAdmin
    };
}

function applySecurityHeaders(
    _request,
    response,
    next
) {
    // Central policy applies the same browser hardening to pages and API responses.
    response.set({
        "Content-Security-Policy":
            "default-src 'self'; " +
            "img-src 'self' data: https:; " +
            "script-src 'self'; " +
            "style-src 'self'; " +
            "connect-src 'self'; " +
            "object-src 'none'; " +
            "base-uri 'self'; " +
            "frame-ancestors 'none'; " +
            "form-action 'self'",

        "Cross-Origin-Opener-Policy":
            "same-origin",

        "Referrer-Policy":
            "no-referrer",

        "X-Content-Type-Options":
            "nosniff",

        "X-Frame-Options":
            "DENY",

        "Permissions-Policy":
            "camera=(), geolocation=(), microphone=()"
    });

    next();
}

export function createApp(options = {}) {
    // Dependency injection keeps production defaults and test fixtures separate.
    const store =
        options.store ?? dataStore;

    const publicDirectory =
        options.publicDirectory ??
        defaultPublicDirectory;

    const isProduction =
        process.env.NODE_ENV === "production";

    const sessionSecret =
        options.sessionSecret ??
        process.env.SESSION_SECRET ??
        (
            isProduction
                ? ""
                : "local-demo-change-this-secret"
        );

    if (!sessionSecret) {
        throw new Error(
            "SESSION_SECRET is required when NODE_ENV is production."
        );
    }

    const app = express();

    const {
        requireUser,
        requireAdmin
    } = createAuthMiddleware(store);

    app.disable("x-powered-by");

    if (isProduction) {
        app.set("trust proxy", 1);
    }

    app.use(applySecurityHeaders);

    /*
        Mark API responses as non-cacheable before parsing JSON, so even malformed
        request errors inherit the same privacy policy as successful responses.
    */
    app.use(
        "/api",
        (_request, response, next) => {
            response.set(
                "Cache-Control",
                "no-store"
            );

            next();
        }
    );

    app.use(express.json({
        limit: "1.5mb",
        strict: true
    }));

    /*
        The cookie contains only a signed session identifier; userId remains in
        server-side session state. Secure cookies are required behind the trusted
        production proxy. A persistent session store should replace MemoryStore
        when this demonstration application is deployed across processes.
    */
    app.use(session({
        name: "rmit.connect.sid",
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: isProduction,
            maxAge:
                2 * 60 * 60 * 1000
        }
    }));

    // ---------- Health and session routes ----------

    // READ: report service health.
    app.get(
        "/api/health",
        (_request, response) => {
            return sendData(response, {
                status: "ok"
            });
        }
    );

    // READ: describe the current browser session without requiring authentication.
    app.get(
        "/api/session",
        (request, response) => {
            const user = store.users.find(
                (candidate) =>
                    candidate.id ===
                    request.session.userId
            );

            if (
                !user ||
                user.status === "locked"
            ) {
                return sendData(response, {
                    authenticated: false,
                    user: null
                });
            }

            return sendData(response, {
                authenticated: true,
                user: publicUser(user)
            });
        }
    );

    // CREATE: authenticate credentials and establish a new session.
    app.post(
        "/api/session",
        (request, response, next) => {
            if (!isPlainObject(request.body)) {
                return sendError(
                    response,
                    422,
                    "VALIDATION_ERROR",
                    "Correct the highlighted fields.",
                    {
                        form:
                            "Request body must be a JSON object."
                    }
                );
            }

            const {
                identifier,
                password,
                details
            } = validateLogin(request.body);

            if (
                hasValidationErrors(details)
            ) {
                return sendError(
                    response,
                    422,
                    "VALIDATION_ERROR",
                    "Correct the highlighted fields.",
                    details
                );
            }

            const normalisedIdentifier =
                identifier.toLowerCase();

            const user = store.users.find(
                (candidate) =>
                    candidate.username
                        .toLowerCase() ===
                    normalisedIdentifier ||
                    candidate.email
                        .toLowerCase() ===
                    normalisedIdentifier
            );

            if (
                !user ||
                !verifyPassword(
                    password,
                    user.passwordHash
                )
            ) {
                return sendError(
                    response,
                    401,
                    "INVALID_CREDENTIALS",
                    "The username/email or password is incorrect."
                );
            }

            if (user.status === "locked") {
                return sendError(
                    response,
                    423,
                    "ACCOUNT_LOCKED",
                    "This account is locked. Contact an administrator."
                );
            }

            user.lastActiveAt =
                new Date().toISOString();

            /*
                Regenerate before attaching userId to prevent session fixation.
                Saving before the response ensures the authenticated state is
                committed before the browser makes its next request.
            */
            return request.session.regenerate(
                (regenerateError) => {
                    if (regenerateError) {
                        return next(
                            regenerateError
                        );
                    }

                    request.session.userId =
                        user.id;

                    return request.session.save(
                        (saveError) => {
                            if (saveError) {
                                return next(
                                    saveError
                                );
                            }

                            return sendData(
                                response,
                                {
                                    authenticated:
                                        true,

                                    user:
                                        publicUser(
                                            user
                                        )
                                },
                                201
                            );
                        }
                    );
                }
            );
        }
    );

    // DELETE: destroy the server-side session and expire its browser cookie.
    app.delete(
        "/api/session",
        (request, response, next) => {
            request.session.destroy(
                (error) => {
                    if (error) {
                        return next(error);
                    }

                    response.clearCookie(
                        "rmit.connect.sid",
                        {
                            path: "/",
                            httpOnly: true,
                            sameSite: "lax",
                            secure:
                                isProduction
                        }
                    );

                    return sendData(
                        response,
                        {
                            authenticated: false,
                            user: null
                        }
                    );
                }
            );
        }
    );

    // ---------- Product catalogue routes ----------

    // READ: return the catalogue decorated with this user's saved state.
    app.get(
        "/api/products",
        requireUser,
        (request, response) => {
            const savedProductIds = new Set([
                ...store.wishlist
                    .filter(
                        (entry) =>
                            entry.userId ===
                            request.currentUser.id
                    )
                    .map(
                        (entry) =>
                            entry.productId
                    ),

                ...store.cart
                    .filter(
                        (entry) =>
                            entry.userId ===
                            request.currentUser.id
                    )
                    .map(
                        (entry) =>
                            entry.productId
                    )
            ]);

            return sendData(response, {
                products:
                    store.products.map(
                        (product) => ({
                            ...presentProduct(product),

                            isWishlisted:
                                savedProductIds.has(
                                    product.id
                                )
                        })
                    ),

                count: store.products.length
            });
        }
    );

    // ---------- Wishlist CRUD routes ----------

    /*
        Ownership always comes from request.currentUser, never from request data.
        This prevents a caller from reading or changing another user's collection.
    */

    // CREATE: add one catalogue product to the current user's wishlist.
    app.post(
        "/api/wishlist",
        requireUser,
        (request, response) => {
            if (!isPlainObject(request.body)) {
                return sendError(
                    response,
                    422,
                    "VALIDATION_ERROR",
                    "Choose an item to add.",
                    {
                        form:
                            "Request body must be a JSON object."
                    }
                );
            }

            const productId =
                cleanText(
                    request.body.productId
                );

            if (!productId) {
                return sendError(
                    response,
                    422,
                    "VALIDATION_ERROR",
                    "Choose an item to add.",
                    {
                        productId:
                            "Product ID is required."
                    }
                );
            }

            const product =
                productFor(store, productId);

            if (!product) {
                return sendError(
                    response,
                    404,
                    "PRODUCT_NOT_FOUND",
                    "The requested product does not exist."
                );
            }

            const duplicate =
                findUserItem(
                    store,
                    request.currentUser.id,
                    productId
                );

            if (duplicate) {
                return sendError(
                    response,
                    409,
                    "DUPLICATE_WISHLIST_ITEM",
                    "This item is already in your wishlist."
                );
            }

            const now =
                new Date().toISOString();

            const entry = {
                id: crypto.randomUUID(),
                userId:
                    request.currentUser.id,
                productId,
                status: "saved",
                createdAt: now,
                updatedAt: now
            };

            /*
                All validation and ownership checks finish before mutation. These
                synchronous updates contain no await boundary, so later requests
                cannot observe an entry without its matching aggregate counter.
            */
            store.wishlist.push(entry);
            product.stats.wishlisted += 1;

            return sendData(
                response,
                {
                    item:
                        presentWishlistEntry(
                            store,
                            entry
                        ),

                    summary:
                        wishlistSummary(
                            store,
                            request.currentUser.id
                        )
                },
                201
            );
        }
    );

    // READ: return the current user's wishlist, cart staging, and purchase history.
    app.get(
        "/api/wishlist",
        requireUser,
        (request, response) => {
            const wishlist =
                store.wishlist
                    .filter(
                        (entry) =>
                            entry.userId ===
                            request.currentUser.id
                    )
                    .map(
                        (entry) =>
                            presentWishlistEntry(
                                store,
                                entry
                            )
                    );

            const cart =
                store.cart
                    .filter(
                        (entry) =>
                            entry.userId ===
                            request.currentUser.id
                    )
                    .map(
                        (entry) =>
                            presentWishlistEntry(
                                store,
                                entry
                            )
                    );

            const purchases =
                store.purchases
                    .filter(
                        (entry) =>
                            entry.userId ===
                            request.currentUser.id
                    )
                    .sort(
                        (left, right) =>
                            right.purchasedAt
                                .localeCompare(
                                    left.purchasedAt
                                )
                    )
                    .map(
                        (entry) =>
                            presentPurchase(
                                store,
                                entry
                            )
                    );

            return sendData(response, {
                wishlist,
                cart,

                items: [
                    ...wishlist,
                    ...cart
                ],

                purchases,

                summary:
                    wishlistSummary(
                        store,
                        request.currentUser.id
                    )
            });
        }
    );

    // UPDATE: move a saved item to the cart or record it as purchased.
    app.patch(
        "/api/wishlist/:productId",
        requireUser,
        (request, response) => {
            if (!isPlainObject(request.body)) {
                return sendError(
                    response,
                    422,
                    "VALIDATION_ERROR",
                    "Choose a valid wishlist action.",
                    {
                        form:
                            "Request body must be a JSON object."
                    }
                );
            }

            const action =
                cleanText(
                    request.body.action
                );

            const validActions =
                new Set([
                    "move-to-cart",
                    "mark-purchased"
                ]);

            if (!validActions.has(action)) {
                return sendError(
                    response,
                    422,
                    "VALIDATION_ERROR",
                    "Choose a valid wishlist action.",
                    {
                        action:
                            "Use move-to-cart or mark-purchased."
                    }
                );
            }

            const itemMatch =
                findUserItem(
                    store,
                    request.currentUser.id,
                    request.params.productId
                );

            if (!itemMatch) {
                return sendError(
                    response,
                    404,
                    "WISHLIST_ITEM_NOT_FOUND",
                    "This item is not in your wishlist."
                );
            }

            const product =
                productFor(
                    store,
                    itemMatch.entry.productId
                );

            if (
                action === "move-to-cart"
            ) {
                if (
                    itemMatch.location === "cart"
                ) {
                    return sendError(
                        response,
                        409,
                        "ALREADY_IN_CART",
                        "This item is already ready for cart."
                    );
                }

                /*
                    Transfer the entry and adjust both aggregate counters in one
                    synchronous state transition after every failure case is known.
                    A database-backed version would place this work in a transaction.
                */
                const [removedEntry] =
                    itemMatch.collection.splice(
                        itemMatch.index,
                        1
                    );

                const cartEntry = {
                    id: crypto.randomUUID(),

                    userId:
                        removedEntry.userId,

                    productId:
                        removedEntry.productId,

                    status: "cart",
                    quantity: 1,

                    createdAt:
                        removedEntry.createdAt,

                    updatedAt:
                        new Date().toISOString()
                };

                store.cart.push(cartEntry);

                product.stats.wishlisted =
                    Math.max(
                        0,
                        product.stats.wishlisted - 1
                    );

                product.stats.inCarts += 1;

                return sendData(response, {
                    item:
                        presentWishlistEntry(
                            store,
                            cartEntry
                        ),

                    summary:
                        wishlistSummary(
                            store,
                            request.currentUser.id
                        )
                });
            }

            /*
                The only remaining valid action is
                mark-purchased.
            */

            /*
                Recording a purchase removes the owned live entry and updates its
                source counter, purchase counter, and history without an await gap.
            */
            const [removedEntry] =
                itemMatch.collection.splice(
                    itemMatch.index,
                    1
                );

            if (
                itemMatch.location === "cart"
            ) {
                product.stats.inCarts =
                    Math.max(
                        0,
                        product.stats.inCarts - 1
                    );
            } else {
                product.stats.wishlisted =
                    Math.max(
                        0,
                        product.stats.wishlisted - 1
                    );
            }

            product.stats.purchased += 1;

            const purchase = {
                id: crypto.randomUUID(),

                userId:
                    request.currentUser.id,

                productId:
                    removedEntry.productId,

                purchasedAt:
                    new Date().toISOString()
            };

            store.purchases.push(purchase);

            return sendData(response, {
                purchase:
                    presentPurchase(
                        store,
                        purchase
                    ),

                summary:
                    wishlistSummary(
                        store,
                        request.currentUser.id
                    )
            });
        }
    );

    // DELETE: remove the current user's item from either saved or cart state.
    app.delete(
        "/api/wishlist/:productId",
        requireUser,
        (request, response) => {
            const itemMatch =
                findUserItem(
                    store,
                    request.currentUser.id,
                    request.params.productId
                );

            if (!itemMatch) {
                return sendError(
                    response,
                    404,
                    "WISHLIST_ITEM_NOT_FOUND",
                    "This item is not in your wishlist."
                );
            }

            // The owned item is located before collection and counter state changes.
            const [removedEntry] =
                itemMatch.collection.splice(
                    itemMatch.index,
                    1
                );

            const product =
                productFor(
                    store,
                    removedEntry.productId
                );

            if (
                itemMatch.location === "cart"
            ) {
                product.stats.inCarts =
                    Math.max(
                        0,
                        product.stats.inCarts - 1
                    );
            } else {
                product.stats.wishlisted =
                    Math.max(
                        0,
                        product.stats.wishlisted - 1
                    );
            }

            return sendData(response, {
                removedProductId:
                    removedEntry.productId,

                summary:
                    wishlistSummary(
                        store,
                        request.currentUser.id
                    )
            });
        }
    );

    /*
        ---------- Profile routes ----------

        The logged-in account comes from requireUser.
        The browser never chooses which user record to edit.
    */

    // READ: return the current user's public profile.
    app.get(
        "/api/profile",
        requireUser,
        (request, response) => {
            return sendData(response, {
                profile:
                    publicUser(
                        request.currentUser
                    )
            });
        }
    );

    // UPDATE: validate and apply allowed fields to the current user's profile.
    app.patch(
        "/api/profile",
        requireUser,
        (request, response) => {
            if (!isPlainObject(request.body)) {
                return sendError(
                    response,
                    422,
                    "VALIDATION_ERROR",
                    "Correct the highlighted fields.",
                    {
                        form:
                            "Request body must be a JSON object."
                    }
                );
            }

            const {
                values,
                details
            } = validateProfilePatch(
                request.body
            );

            if (hasValidationErrors(details)) {
                return sendError(
                    response,
                    422,
                    "VALIDATION_ERROR",
                    "Correct the highlighted fields.",
                    details
                );
            }

            /*
                Email addresses must remain unique, but the user
                may keep their own existing address.
            */
            if (
                Object.hasOwn(
                    values,
                    "email"
                )
            ) {
                const emailOwner =
                    store.users.find(
                        (candidate) =>
                            candidate.id !==
                                request.currentUser.id &&
                            candidate.email
                                .toLowerCase() ===
                            values.email
                    );

                if (emailOwner) {
                    return sendError(
                        response,
                        409,
                        "EMAIL_IN_USE",
                        "That email address belongs to another account.",
                        {
                            email:
                                "Choose a different email address."
                        }
                    );
                }
            }

            /*
                A password change is accepted only after the old
                password has been verified against its stored hash.
            */
            if (
                Object.hasOwn(
                    values,
                    "newPassword"
                ) &&
                !verifyPassword(
                    values.currentPassword,
                    request.currentUser.passwordHash
                )
            ) {
                return sendError(
                    response,
                    422,
                    "INVALID_CURRENT_PASSWORD",
                    "The current password is incorrect.",
                    {
                        currentPassword:
                            "Enter the password currently used for this account."
                    }
                );
            }

            /*
                No data is changed until every validation and
                security check above has succeeded.
            */
            /*
                Prepare the expensive password record before mutating any profile
                fields. If password hashing ever fails, the request now leaves the
                in-memory user unchanged instead of applying a partial update.
            */
            const nextPasswordHash =
                Object.hasOwn(
                    values,
                    "newPassword"
                )
                    ? createPasswordHash(
                        values.newPassword
                    )
                    : null;

            const editableFields = [
                "name",
                "email",
                "description",
                "avatarUrl",
                "avatarDataUrl"
            ];

            for (const field of editableFields) {
                if (
                    Object.hasOwn(
                        values,
                        field
                    )
                ) {
                    request.currentUser[field] =
                        values[field];
                }
            }

            if (nextPasswordHash) {
                request.currentUser.passwordHash =
                    nextPasswordHash;
            }

            return sendData(response, {
                profile:
                    publicUser(
                        request.currentUser
                    )
            });
        }
    );

    /*
        ---------- Administration routes ----------

        Both middleware gates are required: requireUser resolves the session owner,
        then requireAdmin authorises privileged access using the server-side role.
    */

    // READ: list public account data and status totals for administrators.
    app.get(
        "/api/admin/users",
        requireUser,
        requireAdmin,
        (_request, response) => {
            const users =
                store.users
                    .map(publicUser)
                    .sort(
                        (left, right) =>
                            left.name.localeCompare(
                                right.name
                            )
                    );

            return sendData(response, {
                users,
                summary:
                    adminSummary(users)
            });
        }
    );

    // UPDATE: lock or unlock one account while preventing administrator self-lockout.
    app.patch(
        "/api/admin/users/:userId/status",
        requireUser,
        requireAdmin,
        (request, response) => {
            if (!isPlainObject(request.body)) {
                return sendError(
                    response,
                    422,
                    "VALIDATION_ERROR",
                    "Choose a valid account status.",
                    {
                        form:
                            "Request body must be a JSON object."
                    }
                );
            }

            const status =
                cleanText(
                    request.body.status
                );

            const validStatuses =
                new Set([
                    "active",
                    "locked"
                ]);

            if (!validStatuses.has(status)) {
                return sendError(
                    response,
                    422,
                    "VALIDATION_ERROR",
                    "Choose a valid account status.",
                    {
                        status:
                            "Status must be active or locked."
                    }
                );
            }

            const user =
                store.users.find(
                    (candidate) =>
                        candidate.id ===
                        request.params.userId
                );

            if (!user) {
                return sendError(
                    response,
                    404,
                    "USER_NOT_FOUND",
                    "The requested user does not exist."
                );
            }

            if (
                user.id ===
                    request.currentUser.id &&
                status === "locked"
            ) {
                return sendError(
                    response,
                    409,
                    "CANNOT_LOCK_SELF",
                    "You cannot lock your own administrator account."
                );
            }

            // No account state changes until validation and authorisation succeed.
            user.status = status;

            const publicUsers =
                store.users.map(publicUser);

            return sendData(response, {
                user: publicUser(user),
                summary:
                    adminSummary(publicUsers)
            });
        }
    );

    // ---------- Fallbacks and error handling ----------

    app.use(
        "/api",
        (_request, response) => {
            return sendError(
                response,
                404,
                "API_ROUTE_NOT_FOUND",
                "The requested API route does not exist."
            );
        }
    );

    app.use(
        express.static(
            publicDirectory,
            {
                extensions: ["html"],
                index: "login.html",
                maxAge:
                    isProduction
                        ? "1h"
                        : 0
            }
        )
    );

    app.use((request, response) => {
        if (request.accepts("html")) {
            return response
                .status(404)
                .type("html")
                .send(
                    "<!doctype html>" +
                    "<html lang=\"en\">" +
                    "<title>Page Not Found</title>" +
                    "<h1>Page Not Found</h1>" +
                    "<p>The requested page does not exist.</p>" +
                    "</html>"
                );
        }

        return sendError(
            response,
            404,
            "ROUTE_NOT_FOUND",
            "The requested resource does not exist."
        );
    });

    app.use(
        (
            error,
            _request,
            response,
            _next
        ) => {
            if (
                error?.type === "entity.too.large" ||
                error?.status === 413
            ) {
                return sendError(
                    response,
                    413,
                    "PAYLOAD_TOO_LARGE",
                    "Request body is larger than the 1.5 MB limit."
                );
            }

            if (
                error instanceof SyntaxError &&
                error.status === 400 &&
                "body" in error
            ) {
                return sendError(
                    response,
                    400,
                    "INVALID_JSON",
                    "Request body contains invalid JSON."
                );
            }

            console.error(error);

            return sendError(
                response,
                500,
                "INTERNAL_ERROR",
                "Something went wrong on the server."
            );
        }
    );

    return app;
}
