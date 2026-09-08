/**
 * Express adapter for the MongoDB Account, Administration, and Wishlist data.
 * The repository owns persistence; this file owns HTTP validation and sessions.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import express from "express";
import { rateLimit } from "express-rate-limit";

import {
    createPasswordHashAsync,
    verifyPasswordAsync
} from "./passwords.js";

import {
    hasValidationErrors,
    isPlainObject,
    validateLogin,
    validateProfilePatch,
    validateRegistration
} from "./validation.js";

import {
    RepositoryError
} from "./mongo-repository.js";

const PUBLIC_USER_FIELDS = [
    "id",
    "username",
    "studentId",
    "name",
    "email",
    "description",
    "avatarUrl",
    "course",
    "role",
    "status",
    "lastActiveAt",
    "lockedAt",
    "deactivatedAt",
    "createdAt",
    "updatedAt"
];

function sendData(response, data, status = 200) {
    return response.status(status).json({
        success: true,
        data
    });
}

function sendError(response, status, code, message, fields) {
    const error = { code, message };

    if (fields && Object.keys(fields).length > 0) {
        error.fields = fields;
    }

    return response.status(status).json({
        success: false,
        error
    });
}

function safeUser(user) {
    if (!user) return null;

    const result = {};

    for (const field of PUBLIC_USER_FIELDS) {
        if (user[field] !== undefined) {
            result[field] = user[field];
        }
    }

    /* Kept as an empty transport field for the Assessment 2 profile client. */
    result.avatarDataUrl = "";
    return result;
}

function regenerateSession(request) {
    return new Promise((resolve, reject) => {
        request.session.regenerate((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function saveSession(request) {
    return new Promise((resolve, reject) => {
        request.session.save((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function destroySession(request) {
    return new Promise((resolve, reject) => {
        request.session.destroy((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

function clearSessionCookie(response, isProduction) {
    response.clearCookie("rmit.connect.sid", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction
    });
}

function imageType(buffer) {
    const pngSignature = Buffer.from([
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a
    ]);

    if (
        buffer.length >= pngSignature.length &&
        buffer.subarray(0, pngSignature.length).equals(pngSignature)
    ) {
        return "png";
    }

    if (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
    ) {
        return "jpg";
    }

    return "";
}

async function saveAvatar(dataUrl, publicDirectory) {
    const match = /^data:image\/(jpeg|png);base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl);

    if (!match) {
        throw new RepositoryError(
            "VALIDATION_ERROR",
            "Correct the highlighted fields.",
            {
                status: 422,
                fields: { avatarDataUrl: "Choose a valid JPG or PNG image." }
            }
        );
    }

    const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    const extension = imageType(bytes);

    if (!extension || bytes.length === 0 || bytes.length > 1024 * 1024) {
        throw new RepositoryError(
            "VALIDATION_ERROR",
            "Correct the highlighted fields.",
            {
                status: 422,
                fields: {
                    avatarDataUrl: "Choose a genuine JPG or PNG image smaller than 1 MB."
                }
            }
        );
    }

    const directory = path.join(publicDirectory, "uploads", "avatars");
    const filename = `${crypto.randomUUID()}.${extension}`;
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, filename), bytes, { flag: "wx" });

    return `/uploads/avatars/${filename}`;
}

async function removeLocalAvatar(avatarUrl, publicDirectory) {
    const prefix = "/uploads/avatars/";

    if (!avatarUrl?.startsWith(prefix)) return;

    const filename = path.basename(avatarUrl);
    const candidate = path.join(publicDirectory, "uploads", "avatars", filename);

    try {
        await fs.unlink(candidate);
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
}

export function createMongoAccountRouter({
    repository,
    publicDirectory,
    isProduction = false
}) {
    const router = express.Router();

    const registrationLimiter = rateLimit({
        windowMs: 60 * 60 * 1000,
        limit: 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler(_request, response) {
            return sendError(
                response,
                429,
                "RATE_LIMITED",
                "Too many registration attempts. Please try again later."
            );
        }
    });

    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        /* Successful sign-ins do not spend the failed-attempt allowance. */
        skipSuccessfulRequests: true,
        handler(_request, response) {
            return sendError(
                response,
                429,
                "RATE_LIMITED",
                "Too many unsuccessful sign-in attempts. Please try again later."
            );
        }
    });

    async function requireUser(request, response, next) {
        try {
            if (!request.session?.userId) {
                return sendError(response, 401, "AUTH_REQUIRED", "Sign in to continue.");
            }

            const user = await repository.findUserById(request.session.userId);

            if (!user) {
                await destroySession(request);
                clearSessionCookie(response, isProduction);
                return sendError(response, 401, "SESSION_INVALID", "This session is no longer valid.");
            }

            if (user.status !== "active") {
                await destroySession(request);
                clearSessionCookie(response, isProduction);
                const locked = user.status === "locked";
                return sendError(
                    response,
                    locked ? 423 : 403,
                    locked ? "ACCOUNT_LOCKED" : "ACCOUNT_DEACTIVATED",
                    locked
                        ? "This account is locked. Contact an administrator."
                        : "This account has been deactivated."
                );
            }

            if (
                request.session.authVersion !==
                (user.authVersion ?? 0)
            ) {
                await destroySession(request);
                clearSessionCookie(response, isProduction);
                return sendError(
                    response,
                    401,
                    "SESSION_INVALID",
                    "This session is no longer valid. Sign in again."
                );
            }

            request.currentUser = user;
            return next();
        } catch (error) {
            return next(error);
        }
    }

    function requireAdmin(request, response, next) {
        if (request.currentUser.role !== "admin") {
            return sendError(response, 403, "ADMIN_REQUIRED", "Administrator access is required.");
        }

        return next();
    }

    router.get("/api/health", (_request, response) => {
        return sendData(response, { status: "ok", storage: "mongodb" });
    });

    router.post("/api/users", registrationLimiter, async (request, response, next) => {
        try {
            if (!isPlainObject(request.body)) {
                return sendError(response, 422, "VALIDATION_ERROR", "Correct the highlighted fields.", {
                    form: "Request body must be a JSON object."
                });
            }

            const { values, details } = validateRegistration(request.body);

            if (hasValidationErrors(details)) {
                return sendError(response, 422, "VALIDATION_ERROR", "Correct the highlighted fields.", details);
            }

            const user = await repository.registerUser({
                ...values,
                passwordHash: await createPasswordHashAsync(values.password)
            });

            return sendData(response, { user: safeUser(user) }, 201);
        } catch (error) {
            return next(error);
        }
    });

    router.get("/api/session", async (request, response, next) => {
        try {
            if (!request.session?.userId) {
                return sendData(response, { authenticated: false, user: null });
            }

            const user = await repository.findUserById(request.session.userId);

            if (
                !user ||
                user.status !== "active" ||
                request.session.authVersion !== (user.authVersion ?? 0)
            ) {
                await destroySession(request);
                clearSessionCookie(response, isProduction);
                return sendData(response, { authenticated: false, user: null });
            }

            return sendData(response, { authenticated: true, user: safeUser(user) });
        } catch (error) {
            return next(error);
        }
    });

    router.post("/api/session", loginLimiter, async (request, response, next) => {
        try {
            if (!isPlainObject(request.body)) {
                return sendError(response, 422, "VALIDATION_ERROR", "Correct the highlighted fields.", {
                    form: "Request body must be a JSON object."
                });
            }

            const { identifier, password, details } = validateLogin(request.body);

            if (hasValidationErrors(details)) {
                return sendError(response, 422, "VALIDATION_ERROR", "Correct the highlighted fields.", details);
            }

            const user = await repository.findUserByIdentifier(identifier);

            if (!user || !await verifyPasswordAsync(password, user.passwordHash)) {
                return sendError(response, 401, "INVALID_CREDENTIALS", "The username/email or password is incorrect.");
            }

            if (user.status !== "active") {
                const locked = user.status === "locked";
                return sendError(
                    response,
                    locked ? 423 : 403,
                    locked ? "ACCOUNT_LOCKED" : "ACCOUNT_DEACTIVATED",
                    locked
                        ? "This account is locked. Contact an administrator."
                        : "This account has been deactivated."
                );
            }

            const touchedUser = await repository.touchUser(
                user.id,
                user.authVersion ?? 0
            );

            if (!touchedUser) {
                const latestUser = await repository.findUserById(user.id);
                const locked = latestUser?.status === "locked";

                return sendError(
                    response,
                    locked ? 423 : 403,
                    locked ? "ACCOUNT_LOCKED" : "ACCOUNT_UNAVAILABLE",
                    locked
                        ? "This account is locked. Contact an administrator."
                        : "This account is not available."
                );
            }

            await regenerateSession(request);
            request.session.userId = touchedUser.id;
            request.session.authVersion = touchedUser.authVersion ?? 0;
            await saveSession(request);

            return sendData(response, {
                authenticated: true,
                user: safeUser(touchedUser)
            }, 201);
        } catch (error) {
            return next(error);
        }
    });

    router.delete("/api/session", async (request, response, next) => {
        try {
            await destroySession(request);
            clearSessionCookie(response, isProduction);
            return sendData(response, { authenticated: false, user: null });
        } catch (error) {
            return next(error);
        }
    });

    router.get("/api/products", requireUser, async (request, response, next) => {
        try {
            const data = await repository.listProductsForUser(request.currentUser.id, {
                search: request.query.search,
                category: request.query.category,
                sort: request.query.sort
            });
            return sendData(response, data);
        } catch (error) {
            return next(error);
        }
    });

    router.post("/api/wishlist", requireUser, async (request, response, next) => {
        try {
            if (!isPlainObject(request.body) || typeof request.body.productId !== "string") {
                return sendError(response, 422, "VALIDATION_ERROR", "Choose an item to add.", {
                    productId: "Product ID is required."
                });
            }

            const data = await repository.addWishlistItem(
                request.currentUser.id,
                request.body.productId
            );
            return sendData(response, data, 201);
        } catch (error) {
            return next(error);
        }
    });

    router.get("/api/wishlist", requireUser, async (request, response, next) => {
        try {
            return sendData(response, await repository.getWishlist(request.currentUser.id));
        } catch (error) {
            return next(error);
        }
    });

    router.patch("/api/wishlist/:productId", requireUser, async (request, response, next) => {
        try {
            if (!isPlainObject(request.body)) {
                return sendError(response, 422, "VALIDATION_ERROR", "Choose a valid wishlist action.");
            }

            let data;

            if (request.body.action === "move-to-cart") {
                data = await repository.moveToCart(request.currentUser.id, request.params.productId);
            } else if (request.body.action === "mark-purchased") {
                data = await repository.markPurchased(request.currentUser.id, request.params.productId);
            } else {
                return sendError(response, 422, "VALIDATION_ERROR", "Choose a valid wishlist action.", {
                    action: "Use move-to-cart or mark-purchased."
                });
            }

            return sendData(response, data);
        } catch (error) {
            return next(error);
        }
    });

    router.delete("/api/wishlist/:productId", requireUser, async (request, response, next) => {
        try {
            return sendData(response, await repository.removeWishlistItem(
                request.currentUser.id,
                request.params.productId
            ));
        } catch (error) {
            return next(error);
        }
    });

    router.get("/api/profile", requireUser, (request, response) => {
        return sendData(response, { profile: safeUser(request.currentUser) });
    });

    router.patch("/api/profile", requireUser, async (request, response, next) => {
        let newAvatarUrl = "";
        let profileCommitted = false;

        try {
            if (!isPlainObject(request.body)) {
                return sendError(response, 422, "VALIDATION_ERROR", "Correct the highlighted fields.", {
                    form: "Request body must be a JSON object."
                });
            }

            const { values, details } = validateProfilePatch(request.body);

            if (hasValidationErrors(details)) {
                return sendError(response, 422, "VALIDATION_ERROR", "Correct the highlighted fields.", details);
            }

            if (
                values.newPassword &&
                !await verifyPasswordAsync(
                    values.currentPassword,
                    request.currentUser.passwordHash
                )
            ) {
                return sendError(response, 422, "INVALID_CURRENT_PASSWORD", "The current password is incorrect.", {
                    currentPassword: "Enter the password currently used for this account."
                });
            }

            const update = {
                name: values.name,
                email: values.email,
                description: values.description
            };

            for (const key of Object.keys(update)) {
                if (update[key] === undefined) delete update[key];
            }

            if (values.avatarUrl !== undefined) update.avatarUrl = values.avatarUrl;

            if (values.avatarDataUrl) {
                newAvatarUrl = await saveAvatar(values.avatarDataUrl, publicDirectory);
                update.avatarUrl = newAvatarUrl;
            }

            if (values.newPassword) {
                update.newPasswordHash = await createPasswordHashAsync(values.newPassword);
            }

            const data = await repository.updateUserProfile(
                request.currentUser.id,
                update,
                request.currentUser.authVersion ?? 0
            );
            profileCommitted = true;

            if (values.newPassword) {
                request.session.authVersion = data.authVersion;
                await saveSession(request);
            }

            if (newAvatarUrl) {
                /* The database now points at the new file; old-file cleanup is best effort. */
                await removeLocalAvatar(request.currentUser.avatarUrl, publicDirectory)
                    .catch((error) => {
                        console.error("Could not remove the previous local avatar.", error);
                    });
            }

            return sendData(response, { profile: data.profile });
        } catch (error) {
            /* Only an uncommitted upload is orphaned and safe to remove. */
            if (newAvatarUrl && !profileCommitted) {
                await removeLocalAvatar(newAvatarUrl, publicDirectory).catch(() => {});
            }

            if (error?.code === "SESSION_INVALID") {
                await destroySession(request).catch(() => {});
                clearSessionCookie(response, isProduction);
            }

            return next(error);
        }
    });

    router.get("/api/admin/users", requireUser, requireAdmin, async (request, response, next) => {
        try {
            const data = await repository.listPublicUsers({
                search: request.query.search,
                status: request.query.status,
                sort: request.query.sort
            });
            return sendData(response, data);
        } catch (error) {
            return next(error);
        }
    });

    router.patch(
        "/api/admin/users/:userId/status",
        requireUser,
        requireAdmin,
        async (request, response, next) => {
            try {
                const data = await repository.setUserStatus(
                    request.currentUser.id,
                    request.params.userId,
                    request.body?.status
                );
                return sendData(response, data);
            } catch (error) {
                return next(error);
            }
        }
    );

    router.use((error, _request, response, next) => {
        if (error instanceof RepositoryError) {
            return sendError(
                response,
                error.statusCode ?? 500,
                error.code ?? "DATABASE_ERROR",
                error.message,
                error.fields
            );
        }

        return next(error);
    });

    return router;
}
