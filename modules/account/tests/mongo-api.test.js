import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import {
    after,
    before,
    beforeEach,
    test
} from "node:test";

import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import {
    createApp
} from "../src/app.js";

import {
    createMongoAccountRepository,
    RepositoryError
} from "../src/mongo-repository.js";

import {
    createPasswordHash,
    verifyPassword
} from "../src/passwords.js";

const require = createRequire(import.meta.url);

const {
    User,
    Product,
    WishlistEntry,
    Purchase,
    PasswordResetToken
} = require("../../../models/index.js");

const models = {
    User,
    Product,
    WishlistEntry,
    Purchase,
    PasswordResetToken
};

const TEST_SESSION_SECRET =
    "mongo-account-integration-test-secret";

const PASSWORDS = {
    admin: "AdminPass!26",
    member: "MemberPass!26",
    other: "OtherPass!26"
};

let replicaSet;
let repository;
let server;
let baseUrl;
let seed;

/**
 * A very small stateful HTTP client. Express sessions are represented by the
 * signed cookie exactly as they are in a browser; no route is granted a test-
 * only authentication shortcut.
 */
class TestClient {
    constructor() {
        this.cookie = "";
    }

    async request(
        route,
        {
            method = "GET",
            body,
            headers = {}
        } = {}
    ) {
        const requestHeaders = {
            Accept: "application/json",
            ...headers
        };

        if (body !== undefined) {
            requestHeaders["Content-Type"] =
                "application/json";
        }

        if (this.cookie) {
            requestHeaders.Cookie = this.cookie;
        }

        const response = await fetch(
            `${baseUrl}${route}`,
            {
                method,
                headers: requestHeaders,
                body: body === undefined
                    ? undefined
                    : JSON.stringify(body),
                redirect: "manual"
            }
        );

        const setCookie =
            response.headers.get("set-cookie");

        if (setCookie) {
            this.cookie =
                setCookie.split(";", 1)[0];
        }

        const contentType =
            response.headers.get("content-type") ?? "";

        const payload = contentType.includes(
            "application/json"
        )
            ? await response.json()
            : await response.text();

        return {
            status: response.status,
            payload,
            headers: response.headers
        };
    }

    login(identity, password) {
        return this.request(
            "/api/session",
            {
                method: "POST",
                body: { identity, password }
            }
        );
    }
}

function dataOf(result) {
    assert.equal(
        result.payload.success,
        true,
        JSON.stringify(result.payload)
    );

    return result.payload.data;
}

function errorOf(result) {
    assert.equal(
        result.payload.success,
        false,
        JSON.stringify(result.payload)
    );

    return result.payload.error;
}

function assertNoCredentialData(value) {
    const serialised = JSON.stringify(value).toLowerCase();

    assert.equal(
        serialised.includes("password"),
        false,
        "API payload must not contain a password field"
    );

    assert.equal(
        serialised.includes("passwordhash"),
        false,
        "API payload must not contain a password hash"
    );
}

function sha256(value) {
    return crypto
        .createHash("sha256")
        .update(value)
        .digest("hex");
}

function hasIndex(indexes, expectedKey, expectedOptions = {}) {
    return indexes.some(([key, options]) => (
        Object.entries(expectedKey).every(
            ([field, direction]) => key[field] === direction
        ) &&
        Object.entries(expectedOptions).every(
            ([field, value]) => options[field] === value
        )
    ));
}

async function stopServer() {
    if (!server) return;

    const activeServer = server;
    server = null;

    if (typeof activeServer.closeAllConnections === "function") {
        activeServer.closeAllConnections();
    }

    await new Promise((resolve, reject) => {
        activeServer.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

async function startServer(nextRepository = repository) {
    const app = createApp({
        repository: nextRepository,
        sessionSecret: TEST_SESSION_SECRET
    });

    server = app.listen(0, "127.0.0.1");

    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
}

async function clearDatabase() {
    await Promise.all([
        PasswordResetToken.deleteMany({}),
        Purchase.deleteMany({}),
        WishlistEntry.deleteMany({}),
        Product.deleteMany({}),
        User.deleteMany({})
    ]);
}

/** Seed stable users, products, and cross-collection relationships directly. */
async function seedDatabase() {
    const [admin, member, other] = await User.create([
        {
            username: "admin.user",
            studentId: "S4221230",
            name: "Admin User",
            email: "admin.user@rmit.edu.vn",
            passwordHash: createPasswordHash(PASSWORDS.admin),
            description: "Test administrator",
            course: "Bachelor of Information Technology",
            role: "admin",
            status: "active"
        },
        {
            username: "member.user",
            studentId: "S4000001",
            name: "Member User",
            email: "member.user@rmit.edu.vn",
            passwordHash: createPasswordHash(PASSWORDS.member),
            description: "Test member",
            course: "Bachelor of Design",
            role: "member",
            status: "active"
        },
        {
            username: "other.user",
            studentId: "S4000002",
            name: "Other User",
            email: "other.user@rmit.edu.vn",
            passwordHash: createPasswordHash(PASSWORDS.other),
            description: "Second test member",
            course: "Bachelor of Business",
            role: "member",
            status: "active"
        }
    ]);

    const [workshop, bootcamp, photoWalk] =
        await Product.create([
            {
                slug: "peer-workshop",
                name: "Peer Skills Workshop",
                category: "Workshop",
                description:
                    "A practical peer-led campus skills workshop.",
                priceVnd: 120000,
                image: "/images/peer-workshop.jpg",
                imageAlt: "Students learning in a workshop",
                isActive: true
            },
            {
                slug: "data-bootcamp",
                name: "Data Bootcamp",
                category: "Course",
                description:
                    "An introductory data analysis bootcamp for students.",
                priceVnd: 450000,
                image: "/images/data-bootcamp.jpg",
                imageAlt: "A laptop displaying a data chart",
                isActive: true
            },
            {
                slug: "photo-walk",
                name: "Saigon Photo Walk",
                category: "Field Trip",
                description:
                    "A guided photography walk around central Saigon.",
                priceVnd: 180000,
                image: "/images/photo-walk.jpg",
                imageAlt: "Students taking photographs outdoors",
                isActive: true
            }
        ]);

    await WishlistEntry.create([
        {
            userId: member._id,
            productId: workshop._id,
            status: "saved",
            quantity: 1
        },
        {
            userId: other._id,
            productId: bootcamp._id,
            status: "saved",
            quantity: 1
        }
    ]);

    await Purchase.create({
        userId: other._id,
        productId: workshop._id,
        productName: workshop.name,
        unitPriceVnd: workshop.priceVnd,
        quantity: 1,
        purchasedAt: new Date("2026-08-01T00:00:00.000Z")
    });

    return {
        admin,
        member,
        other,
        workshop,
        bootcamp,
        photoWalk
    };
}

before(async () => {
    replicaSet = await MongoMemoryReplSet.create({
        replSet: {
            count: 1,
            storageEngine: "wiredTiger"
        }
    });

    await mongoose.connect(replicaSet.getUri(), {
        dbName: "rmit_connect_account_test"
    });

    /* Build every declared index before duplicate and text-query assertions. */
    await Promise.all(
        Object.values(models).map(
            (Model) => Model.syncIndexes()
        )
    );

    repository = createMongoAccountRepository({ models });
    await startServer();
});

after(async () => {
    await stopServer();

    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    if (replicaSet) {
        await replicaSet.stop();
    }
});

beforeEach(async () => {
    await clearDatabase();
    seed = await seedDatabase();
});

test(
    "models declare required indexes and preserve valid sample relationships",
    async () => {
        assert.ok(
            hasIndex(User.schema.indexes(), { username: 1 }, { unique: true })
        );
        assert.ok(
            hasIndex(User.schema.indexes(), { email: 1 }, { unique: true })
        );
        assert.ok(
            hasIndex(User.schema.indexes(), { studentId: 1 }, { unique: true })
        );
        assert.ok(
            hasIndex(
                WishlistEntry.schema.indexes(),
                { userId: 1, productId: 1 },
                { unique: true }
            )
        );
        assert.ok(
            hasIndex(
                PasswordResetToken.schema.indexes(),
                { expiresAt: 1 },
                { expireAfterSeconds: 0 }
            )
        );

        const wishlistRelationship = await WishlistEntry
            .findOne({ userId: seed.member._id })
            .populate("userId")
            .populate("productId")
            .lean();

        assert.equal(
            wishlistRelationship.userId.username,
            "member.user"
        );
        assert.equal(
            wishlistRelationship.productId.slug,
            "peer-workshop"
        );

        const purchaseRelationship = await Purchase
            .findOne({ userId: seed.other._id })
            .populate("userId")
            .populate("productId")
            .lean();

        assert.equal(purchaseRelationship.userId.username, "other.user");
        assert.equal(purchaseRelationship.productId.slug, "peer-workshop");

        const rawProduct = await Product.collection.findOne({
            _id: seed.workshop._id
        });

        assert.equal(
            Object.hasOwn(rawProduct, "stats"),
            false,
            "derived popularity totals must not be stored on Product"
        );
    }
);

test(
    "registration persists one normalised member, rejects duplicates, and never exposes hashes",
    async () => {
        const client = new TestClient();
        const registration = {
            username: "  New.Student  ",
            studentId: "s4000003",
            name: "New Student",
            email: " NEW.STUDENT@RMIT.EDU.VN ",
            password: "RegisterPass!26",
            confirmPassword: "RegisterPass!26",
            description: "Created through the public API",
            role: "admin",
            status: "locked"
        };

        const created = await client.request(
            "/api/users",
            {
                method: "POST",
                body: registration
            }
        );

        assert.equal(created.status, 201);
        assert.equal(dataOf(created).user.username, "new.student");
        assert.equal(dataOf(created).user.studentId, "S4000003");
        assert.equal(dataOf(created).user.role, "member");
        assert.equal(dataOf(created).user.status, "active");
        assertNoCredentialData(created.payload);

        const persisted = await User
            .findOne({ username: "new.student" })
            .select("+passwordHash")
            .lean();

        assert.ok(persisted);
        assert.notEqual(persisted.passwordHash, registration.password);
        assert.ok(persisted.passwordHash.startsWith("$2"));
        assert.equal(
            verifyPassword(registration.password, persisted.passwordHash),
            true
        );

        const duplicate = await client.request(
            "/api/users",
            {
                method: "POST",
                body: {
                    ...registration,
                    studentId: "S4000004",
                    email: "unique.student@rmit.edu.vn"
                }
            }
        );

        assert.equal(duplicate.status, 409);
        assert.equal(errorOf(duplicate).code, "USERNAME_IN_USE");
        assert.equal(
            await User.countDocuments({ username: "new.student" }),
            1
        );

        const longEmail = `${"a".repeat(60)}@${"b".repeat(45)}.vn`;
        assert.ok(longEmail.length > 100 && longEmail.length <= 120);

        const longEmailRegistration = await client.request(
            "/api/users",
            {
                method: "POST",
                body: {
                    username: "long.email.user",
                    studentId: "S4000005",
                    name: "Long Email User",
                    email: longEmail,
                    password: "LongEmailPass!26",
                    confirmPassword: "LongEmailPass!26",
                    description: "Exercises the documented email boundary"
                }
            }
        );

        assert.equal(longEmailRegistration.status, 201);
        assert.equal(
            (await client.login(longEmail, "LongEmailPass!26")).status,
            201
        );

        const oversizedUtf8Password =
            `ValidA1${"🙂".repeat(20)}`;
        assert.ok(
            Buffer.byteLength(oversizedUtf8Password, "utf8") > 72,
            "fixture must exceed bcrypt's 72-byte input boundary"
        );

        const oversized = await client.request(
            "/api/users",
            {
                method: "POST",
                body: {
                    username: "wide.password",
                    studentId: "S4000006",
                    name: "Wide Password",
                    email: "wide.password@rmit.edu.vn",
                    password: oversizedUtf8Password,
                    confirmPassword: oversizedUtf8Password
                }
            }
        );

        assert.equal(oversized.status, 422);
        assert.match(errorOf(oversized).fields.password, /72 UTF-8 bytes/i);
        assert.equal(
            await User.countDocuments({ username: "wide.password" }),
            0
        );
    }
);

test(
    "login creates a safe session and logout invalidates it",
    async () => {
        const client = new TestClient();

        const rejected = await client.login(
            "member.user",
            "incorrect-password"
        );

        assert.equal(rejected.status, 401);
        assert.equal(errorOf(rejected).code, "INVALID_CREDENTIALS");

        const login = await client.login(
            "member.user",
            PASSWORDS.member
        );

        assert.equal(login.status, 201);
        assert.equal(dataOf(login).authenticated, true);
        assert.equal(dataOf(login).user.username, "member.user");
        assertNoCredentialData(login.payload);
        assert.match(
            login.headers.get("set-cookie"),
            /HttpOnly/i
        );
        assert.match(
            login.headers.get("set-cookie"),
            /SameSite=Lax/i
        );

        const session = await client.request("/api/session");
        assert.equal(dataOf(session).authenticated, true);
        assert.equal(dataOf(session).user.studentId, "S4000001");

        const storedMember = await User.findById(seed.member._id).lean();
        assert.ok(storedMember.lastActiveAt instanceof Date);

        const logout = await client.request(
            "/api/session",
            { method: "DELETE" }
        );

        assert.equal(logout.status, 200);
        assert.equal(dataOf(logout).authenticated, false);
        assert.equal(
            (await client.request("/api/profile")).status,
            401
        );

        /* Existing Atlas users created before authVersion remain migratable. */
        await User.updateOne(
            { _id: seed.member._id },
            { $unset: { authVersion: "" } }
        );

        const legacyClient = new TestClient();
        assert.equal(
            (await legacyClient.login("member.user", PASSWORDS.member)).status,
            201
        );
        assert.equal(
            (await User.findById(seed.member._id).lean()).authVersion,
            0
        );
    }
);

test(
    "login rejects a password snapshot superseded before session creation",
    async () => {
        const client = new TestClient();
        const originalTouchUser = repository.touchUser;
        let passwordChanged = false;

        repository.touchUser = async (...arguments_) => {
            if (!passwordChanged) {
                passwordChanged = true;

                await User.updateOne(
                    { _id: arguments_[0] },
                    {
                        $set: {
                            passwordHash:
                                createPasswordHash("ConcurrentReplacement!26")
                        },
                        $inc: { authVersion: 1 }
                    },
                    { runValidators: true }
                );
            }

            return originalTouchUser(...arguments_);
        };

        try {
            const login = await client.login(
                "member.user",
                PASSWORDS.member
            );

            assert.equal(login.status, 403);
            assert.equal(errorOf(login).code, "ACCOUNT_UNAVAILABLE");
            assert.equal(
                dataOf(await client.request("/api/session")).authenticated,
                false
            );
        } finally {
            repository.touchUser = originalTouchUser;
        }
    }
);

test(
    "catalogue totals are derived from relationships for the authenticated user",
    async () => {
        const client = new TestClient();
        await client.login("member.user", PASSWORDS.member);

        const result = await client.request(
            "/api/products?sort=name-asc"
        );

        assert.equal(result.status, 200);
        const products = dataOf(result).products;
        assert.equal(products.length, 3);

        const workshop = products.find(
            (product) => product.slug === "peer-workshop"
        );
        const bootcamp = products.find(
            (product) => product.slug === "data-bootcamp"
        );

        assert.deepEqual(workshop.stats, {
            wishlisted: 1,
            inCarts: 0,
            purchased: 1
        });
        assert.equal(workshop.isWishlisted, true);
        assert.deepEqual(bootcamp.stats, {
            wishlisted: 1,
            inCarts: 0,
            purchased: 0
        });
        assert.equal(bootcamp.isWishlisted, false);

        const filtered = dataOf(
            await client.request(
                "/api/products?category=field-trip&sort=price-low"
            )
        ).products;

        assert.deepEqual(
            filtered.map((product) => product.slug),
            ["photo-walk"]
        );
    }
);

test(
    "wishlist create, duplicate, move, purchase, remove, and ownership rules are atomic",
    async () => {
        const member = new TestClient();
        const other = new TestClient();
        await member.login("member.user", PASSWORDS.member);
        await other.login("other.user", PASSWORDS.other);

        const crossUserDelete = await other.request(
            "/api/wishlist/peer-workshop",
            { method: "DELETE" }
        );
        assert.equal(crossUserDelete.status, 404);

        const added = await member.request(
            "/api/wishlist",
            {
                method: "POST",
                body: { productId: "photo-walk" }
            }
        );
        assert.equal(added.status, 201);
        assert.equal(dataOf(added).item.status, "saved");
        assert.equal(dataOf(added).summary.saved, 2);

        const duplicate = await member.request(
            "/api/wishlist",
            {
                method: "POST",
                body: { productId: "photo-walk" }
            }
        );
        assert.equal(duplicate.status, 409);
        assert.equal(
            errorOf(duplicate).code,
            "DUPLICATE_WISHLIST_ITEM"
        );

        const otherCannotMove = await other.request(
            "/api/wishlist/photo-walk",
            {
                method: "PATCH",
                body: { action: "move-to-cart" }
            }
        );
        assert.equal(otherCannotMove.status, 404);

        const moved = await member.request(
            "/api/wishlist/photo-walk",
            {
                method: "PATCH",
                body: { action: "move-to-cart" }
            }
        );
        assert.equal(moved.status, 200);
        assert.equal(dataOf(moved).item.status, "cart");
        assert.equal(dataOf(moved).summary.readyForCart, 1);

        const purchased = await member.request(
            "/api/wishlist/photo-walk",
            {
                method: "PATCH",
                body: { action: "mark-purchased" }
            }
        );
        assert.equal(purchased.status, 200);
        assert.equal(
            dataOf(purchased).purchase.product.slug,
            "photo-walk"
        );
        assert.equal(
            dataOf(purchased).purchase.product.name,
            "Saigon Photo Walk"
        );
        assert.equal(
            dataOf(purchased).purchase.product.priceVnd,
            180000
        );

        await Product.updateOne(
            { _id: seed.photoWalk._id },
            {
                $set: {
                    name: "Renamed Current Product",
                    priceVnd: 999000
                }
            }
        );

        const purchaseHistory = dataOf(
            await member.request("/api/wishlist")
        ).purchases;
        const historicalPhotoWalk = purchaseHistory.find(
            (entry) => entry.product.slug === "photo-walk"
        );
        assert.equal(historicalPhotoWalk.product.name, "Saigon Photo Walk");
        assert.equal(historicalPhotoWalk.product.priceVnd, 180000);

        assert.equal(
            await WishlistEntry.countDocuments({
                userId: seed.member._id,
                productId: seed.photoWalk._id
            }),
            0
        );
        assert.equal(
            await Purchase.countDocuments({
                userId: seed.member._id,
                productId: seed.photoWalk._id
            }),
            1
        );

        const addThenRemove = await member.request(
            "/api/wishlist",
            {
                method: "POST",
                body: { productId: "data-bootcamp" }
            }
        );
        assert.equal(addThenRemove.status, 201);

        const otherStillCannotRemove = await other.request(
            "/api/wishlist/data-bootcamp",
            { method: "DELETE" }
        );
        /* Other owns this same product, so only its own entry is removed. */
        assert.equal(otherStillCannotRemove.status, 200);
        assert.equal(
            await WishlistEntry.countDocuments({
                userId: seed.member._id,
                productId: seed.bootcamp._id
            }),
            1
        );

        const removed = await member.request(
            "/api/wishlist/data-bootcamp",
            { method: "DELETE" }
        );
        assert.equal(removed.status, 200);
        assert.equal(dataOf(removed).removedProductId, "data-bootcamp");
        assert.equal(
            await WishlistEntry.countDocuments({
                userId: seed.member._id,
                productId: seed.bootcamp._id
            }),
            0
        );
    }
);

test(
    "profile and password changes persist together and invalidate reset tokens",
    async () => {
        const client = new TestClient();
        const dormantClient = new TestClient();
        await client.login("member.user", PASSWORDS.member);
        await dormantClient.login("member.user", PASSWORDS.member);

        await repository.createResetToken(seed.member.id, {
            tokenHash: sha256("profile-change-token"),
            expiresAt: new Date(Date.now() + 60_000)
        });

        const updated = await client.request(
            "/api/profile",
            {
                method: "PATCH",
                body: {
                    name: "Updated Member",
                    description: "Persisted MongoDB profile",
                    currentPassword: PASSWORDS.member,
                    newPassword: "ReplacementPass!26"
                }
            }
        );

        assert.equal(updated.status, 200);
        assert.equal(dataOf(updated).profile.name, "Updated Member");
        assertNoCredentialData(updated.payload);

        const persisted = await User
            .findById(seed.member._id)
            .select("+passwordHash")
            .lean();

        assert.equal(persisted.name, "Updated Member");
        assert.equal(
            persisted.description,
            "Persisted MongoDB profile"
        );
        assert.equal(
            verifyPassword("ReplacementPass!26", persisted.passwordHash),
            true
        );
        assert.equal(
            await PasswordResetToken.countDocuments({
                userId: seed.member._id
            }),
            0
        );

        const currentSession = await client.request("/api/session");
        assert.equal(dataOf(currentSession).authenticated, true);

        const dormantSession = await dormantClient.request("/api/profile");
        assert.equal(dormantSession.status, 401);
        assert.equal(errorOf(dormantSession).code, "SESSION_INVALID");

        await client.request("/api/session", { method: "DELETE" });
        assert.equal(
            (await client.login("member.user", PASSWORDS.member)).status,
            401
        );
        assert.equal(
            (
                await client.login(
                    "member.user",
                    "ReplacementPass!26"
                )
            ).status,
            201
        );
    }
);

test(
    "a stale profile request cannot overwrite a concurrent password change",
    async () => {
        const client = new TestClient();
        await client.login("member.user", PASSWORDS.member);

        const originalUpdateProfile = repository.updateUserProfile;
        const concurrentPassword = "ConcurrentProfilePass!26";
        let passwordChanged = false;

        repository.updateUserProfile = async (...arguments_) => {
            if (!passwordChanged) {
                passwordChanged = true;

                await User.updateOne(
                    { _id: arguments_[0] },
                    {
                        $set: {
                            passwordHash:
                                createPasswordHash(concurrentPassword)
                        },
                        $inc: { authVersion: 1 }
                    },
                    { runValidators: true }
                );
            }

            return originalUpdateProfile(...arguments_);
        };

        try {
            const update = await client.request(
                "/api/profile",
                {
                    method: "PATCH",
                    body: {
                        currentPassword: PASSWORDS.member,
                        newPassword: "StaleRequestMustNotWin!26"
                    }
                }
            );

            assert.equal(update.status, 401);
            assert.equal(errorOf(update).code, "SESSION_INVALID");
            assert.equal(
                dataOf(await client.request("/api/session")).authenticated,
                false
            );

            const persisted = await User
                .findById(seed.member._id)
                .select("+passwordHash")
                .lean();

            assert.equal(
                verifyPassword(concurrentPassword, persisted.passwordHash),
                true
            );
            assert.equal(
                verifyPassword("StaleRequestMustNotWin!26", persisted.passwordHash),
                false
            );
        } finally {
            repository.updateUserProfile = originalUpdateProfile;
        }
    }
);

test(
    "administration requires an admin and immediately enforces lock state",
    async () => {
        const admin = new TestClient();
        const member = new TestClient();
        const secondMemberSession = new TestClient();
        await admin.login("admin.user", PASSWORDS.admin);
        await member.login("member.user", PASSWORDS.member);
        await secondMemberSession.login("member.user", PASSWORDS.member);

        const forbidden = await member.request("/api/admin/users");
        assert.equal(forbidden.status, 403);
        assert.equal(errorOf(forbidden).code, "ADMIN_REQUIRED");

        const users = await admin.request("/api/admin/users");
        assert.equal(users.status, 200);
        assert.equal(dataOf(users).users.length, 3);
        assert.equal(dataOf(users).summary.administrators, 1);
        assertNoCredentialData(users.payload);

        const selfLock = await admin.request(
            `/api/admin/users/${seed.admin.id}/status`,
            {
                method: "PATCH",
                body: { status: "locked" }
            }
        );
        assert.equal(selfLock.status, 409);
        assert.equal(errorOf(selfLock).code, "CANNOT_LOCK_SELF");

        const repeatedStatus = await admin.request(
            `/api/admin/users/${seed.admin.id}/status`,
            {
                method: "PATCH",
                body: { status: "active" }
            }
        );
        assert.equal(repeatedStatus.status, 200);
        assert.equal(dataOf(repeatedStatus).user.status, "active");
        assert.equal(
            dataOf(await admin.request("/api/session")).authenticated,
            true,
            "an idempotent status request must not revoke the admin session"
        );

        await assert.rejects(
            repository.deactivateUser(seed.admin.id),
            (error) => (
                error instanceof RepositoryError &&
                error.code === "LAST_ACTIVE_ADMIN" &&
                error.status === 409
            )
        );

        const lockResetTokenHash = sha256("issued-before-lock");
        await repository.createResetToken(seed.member.id, {
            tokenHash: lockResetTokenHash,
            expiresAt: new Date(Date.now() + 60_000)
        });

        const locked = await admin.request(
            `/api/admin/users/${seed.member.id}/status`,
            {
                method: "PATCH",
                body: { status: "locked" }
            }
        );
        assert.equal(locked.status, 200);
        assert.equal(dataOf(locked).user.status, "locked");
        assert.equal(
            await PasswordResetToken.countDocuments({
                userId: seed.member._id
            }),
            0,
            "locking an account must revoke its outstanding reset challenge"
        );

        await assert.rejects(
            repository.consumeResetToken({
                tokenHash: lockResetTokenHash,
                newPasswordHash: createPasswordHash("LockBypassMustFail!26")
            }),
            (error) => (
                error instanceof RepositoryError &&
                error.code === "RESET_TOKEN_INVALID"
            )
        );

        const invalidatedSession =
            await member.request("/api/session");
        assert.equal(invalidatedSession.status, 200);
        assert.equal(
            dataOf(invalidatedSession).authenticated,
            false
        );

        const activeSessionRejected =
            await secondMemberSession.request("/api/profile");
        assert.equal(activeSessionRejected.status, 423);
        assert.equal(errorOf(activeSessionRejected).code, "ACCOUNT_LOCKED");

        const destroyedSessionRejected = await member.request("/api/profile");
        assert.equal(destroyedSessionRejected.status, 401);
        assert.equal(errorOf(destroyedSessionRejected).code, "AUTH_REQUIRED");

        const lockedLogin = await member.login(
            "member.user",
            PASSWORDS.member
        );
        assert.equal(lockedLogin.status, 423);

        const unlocked = await admin.request(
            `/api/admin/users/${seed.member.id}/status`,
            {
                method: "PATCH",
                body: { status: "active" }
            }
        );
        assert.equal(unlocked.status, 200);
        assert.equal(dataOf(unlocked).user.status, "active");
        assert.equal(
            (await member.login("member.user", PASSWORDS.member)).status,
            201
        );
    }
);

test(
    "reset tokens expire, are stored as digests, and can be consumed only once",
    async () => {
        const expiredPlaintext = "expired-reset-token";
        const expiredHash = sha256(expiredPlaintext);
        const expiry = new Date(Date.now() + 60_000);

        await repository.createResetToken(seed.member.id, {
            tokenHash: expiredHash,
            expiresAt: expiry
        });

        const storedExpired = await PasswordResetToken
            .findOne({ userId: seed.member._id })
            .select("+tokenHash")
            .lean();

        assert.equal(storedExpired.tokenHash, expiredHash);
        assert.notEqual(storedExpired.tokenHash, expiredPlaintext);

        await assert.rejects(
            repository.consumeResetToken({
                tokenHash: expiredHash,
                newPasswordHash:
                    createPasswordHash("ExpiredMustNotWork!26"),
                /* Advance logical time without racing MongoDB's TTL monitor. */
                now: new Date(expiry.getTime() + 1)
            }),
            (error) => (
                error instanceof RepositoryError &&
                error.code === "RESET_TOKEN_INVALID" &&
                error.status === 400
            )
        );

        const validHash = sha256("valid-reset-token");
        const dormantClient = new TestClient();
        await dormantClient.login("member.user", PASSWORDS.member);

        await repository.createResetToken(seed.member.id, {
            tokenHash: validHash,
            expiresAt: new Date(Date.now() + 60_000)
        });

        const consumed = await repository.consumeResetToken({
            tokenHash: validHash,
            newPasswordHash:
                createPasswordHash("ResetReplacement!26")
        });

        assert.equal(consumed.id, seed.member.id);

        const revokedSession = await dormantClient.request("/api/profile");
        assert.equal(revokedSession.status, 401);
        assert.equal(errorOf(revokedSession).code, "SESSION_INVALID");

        const changedUser = await User
            .findById(seed.member._id)
            .select("+passwordHash")
            .lean();
        assert.equal(
            verifyPassword("ResetReplacement!26", changedUser.passwordHash),
            true
        );

        await assert.rejects(
            repository.consumeResetToken({
                tokenHash: validHash,
                newPasswordHash:
                    createPasswordHash("ReplayMustNotWork!26")
            }),
            (error) => (
                error instanceof RepositoryError &&
                error.code === "RESET_TOKEN_INVALID"
            )
        );

        const afterReplay = await User
            .findById(seed.member._id)
            .select("+passwordHash")
            .lean();
        assert.equal(
            verifyPassword("ResetReplacement!26", afterReplay.passwordHash),
            true
        );
        assert.equal(
            verifyPassword("ReplayMustNotWork!26", afterReplay.passwordHash),
            false
        );
    }
);

test(
    "deactivation persists and revokes both existing sessions and new logins",
    async () => {
        const client = new TestClient();
        await client.login("member.user", PASSWORDS.member);

        await repository.createResetToken(seed.member.id, {
            tokenHash: sha256("issued-before-deactivation"),
            expiresAt: new Date(Date.now() + 60_000)
        });

        const deactivated =
            await repository.deactivateUser(seed.member.id);

        assert.equal(deactivated.status, "deactivated");
        assert.ok(deactivated.deactivatedAt);
        assert.equal(
            await PasswordResetToken.countDocuments({
                userId: seed.member._id
            }),
            0
        );

        const existingSession = await client.request("/api/profile");
        assert.equal(existingSession.status, 403);
        assert.equal(
            errorOf(existingSession).code,
            "ACCOUNT_DEACTIVATED"
        );

        const login = await client.login(
            "member.user",
            PASSWORDS.member
        );
        assert.equal(login.status, 403);
        assert.equal(errorOf(login).code, "ACCOUNT_DEACTIVATED");

        const persisted = await User.findById(seed.member._id).lean();
        assert.equal(persisted.status, "deactivated");
        assert.ok(persisted.deactivatedAt instanceof Date);

        await assert.rejects(
            repository.deactivateUser(seed.member.id),
            (error) => (
                error instanceof RepositoryError &&
                error.code === "USER_NOT_FOUND" &&
                error.status === 404
            )
        );
    }
);

test(
    "data survives HTTP restart and repository re-instantiation",
    async () => {
        const firstClient = new TestClient();
        const registered = await firstClient.request(
            "/api/users",
            {
                method: "POST",
                body: {
                    username: "persistent.user",
                    studentId: "S4000009",
                    name: "Persistent User",
                    email: "persistent.user@rmit.edu.vn",
                    password: "PersistentPass!26",
                    confirmPassword: "PersistentPass!26",
                    description: "Must survive application restart"
                }
            }
        );
        assert.equal(registered.status, 201);

        await firstClient.login(
            "persistent.user",
            "PersistentPass!26"
        );
        assert.equal(
            (
                await firstClient.request(
                    "/api/wishlist",
                    {
                        method: "POST",
                        body: { productId: "photo-walk" }
                    }
                )
            ).status,
            201
        );

        await stopServer();

        repository = createMongoAccountRepository({ models });
        await startServer(repository);

        const restartedClient = new TestClient();
        const relogin = await restartedClient.login(
            "persistent.user",
            "PersistentPass!26"
        );
        assert.equal(relogin.status, 201);

        const profile = dataOf(
            await restartedClient.request("/api/profile")
        ).profile;
        assert.equal(profile.description, "Must survive application restart");

        const wishlist = dataOf(
            await restartedClient.request("/api/wishlist")
        );
        assert.deepEqual(
            wishlist.wishlist.map((item) => item.product.slug),
            ["photo-walk"]
        );
    }
);

/* Kept last because this intentionally exhausts the per-IP failure budget. */
test(
    "login throttling returns a controlled 429 after repeated failures",
    async () => {
        const client = new TestClient();
        let result;

        for (let attempt = 0; attempt < 11; attempt += 1) {
            result = await client.login(
                "member.user",
                `IncorrectPassword!${attempt}`
            );
        }

        assert.equal(result.status, 429);
        assert.equal(errorOf(result).code, "RATE_LIMITED");
        assert.ok(result.headers.get("ratelimit"));
    }
);
