import assert from "node:assert/strict";
import {
    after,
    before,
    beforeEach,
    test
} from "node:test";

import {
    createApp
} from "../src/app.js";

import {
    dataStore,
    resetData
} from "../src/data.js";

let server;
let baseUrl;

class TestClient {
    constructor() {
        this.cookie = "";
    }

    async request(
        route,
        {
            method = "GET",
            body,
            rawBody,
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
                body:
                    rawBody ??
                    (
                        body === undefined
                            ? undefined
                            : JSON.stringify(body)
                    ),
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
            response.headers.get("content-type") ??
            "";

        const payload =
            contentType.includes("application/json")
                ? await response.json()
                : await response.text();

        return {
            status: response.status,
            payload,
            headers: response.headers
        };
    }

    login(
        identity = "dat.pham",
        password = "ConnectDemo!26"
    ) {
        return this.request(
            "/api/session",
            {
                method: "POST",
                body: {
                    identity,
                    password
                }
            }
        );
    }
}

function dataOf(result) {
    assert.equal(
        result.payload.success,
        true
    );

    return result.payload.data;
}

function errorOf(result) {
    assert.equal(
        result.payload.success,
        false
    );

    return result.payload.error;
}

function statsOf(product) {
    return product.stats ?? {
        wishlisted: product.wishlisted,
        inCarts: product.inCarts,
        purchased: product.purchased
    };
}

function assertNoPasswordData(value) {
    const serialised =
        JSON.stringify(value).toLowerCase();

    assert.equal(
        serialised.includes("password"),
        false
    );

    assert.equal(
        serialised.includes("\"hash\""),
        false
    );

    assert.equal(
        serialised.includes("\"salt\""),
        false
    );
}

before(async () => {
    const app = createApp({
        sessionSecret:
            "rmit-connect-automated-test-secret"
    });

    server = app.listen(0, "127.0.0.1");

    await new Promise((resolve) => {
        server.once("listening", resolve);
    });

    const address = server.address();
    baseUrl =
        `http://127.0.0.1:${address.port}`;
});

after(async () => {
    resetData();

    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
});

beforeEach(() => {
    resetData();
});

test(
    "health, static pages, and security headers are available",
    async () => {
        const client = new TestClient();
        const health =
            await client.request("/api/health");

        assert.equal(health.status, 200);
        assert.deepEqual(
            dataOf(health),
            { status: "ok" }
        );

        assert.match(
            health.headers.get(
                "content-security-policy"
            ),
            /default-src 'self'/
        );

        assert.equal(
            health.headers.get(
                "x-content-type-options"
            ),
            "nosniff"
        );

        assert.equal(
            health.headers.get("cache-control"),
            "no-store"
        );

        for (const page of [
            "/login.html",
            "/wishlist-add.html",
            "/wishlist.html",
            "/editprofile.html",
            "/admin.html"
        ]) {
            const result = await client.request(
                page,
                {
                    headers: {
                        Accept: "text/html"
                    }
                }
            );

            assert.equal(
                result.status,
                200,
                `${page} should load`
            );

            assert.match(
                result.payload,
                /<!DOCTYPE html>/i
            );
        }
    }
);

test(
    "anonymous sessions are safe and protected APIs require login",
    async () => {
        const client = new TestClient();
        const session =
            await client.request("/api/session");

        assert.equal(session.status, 200);
        assert.deepEqual(
            dataOf(session),
            {
                authenticated: false,
                user: null
            }
        );

        for (const route of [
            "/api/products",
            "/api/wishlist",
            "/api/profile",
            "/api/admin/users"
        ]) {
            const result =
                await client.request(route);

            assert.equal(
                result.status,
                401,
                `${route} should require login`
            );

            assert.equal(
                errorOf(result).code,
                "AUTH_REQUIRED"
            );
        }
    }
);

test(
    "login validates input, persists a session, and logout ends it",
    async () => {
        const client = new TestClient();

        const missing = await client.request(
            "/api/session",
            {
                method: "POST",
                body: {}
            }
        );

        assert.equal(missing.status, 422);
        assert.equal(
            errorOf(missing).code,
            "VALIDATION_ERROR"
        );
        assert.ok(errorOf(missing).fields.identity);
        assert.ok(errorOf(missing).fields.password);

        const incorrect = await client.login(
            "dat.pham",
            "incorrect-password"
        );

        assert.equal(incorrect.status, 401);
        assert.equal(
            errorOf(incorrect).code,
            "INVALID_CREDENTIALS"
        );

        const locked = await client.login(
            "kim.seung-uk",
            "LockedDemo!26"
        );

        assert.equal(locked.status, 423);
        assert.equal(
            errorOf(locked).code,
            "ACCOUNT_LOCKED"
        );

        const login = await client.login();
        assert.equal(login.status, 201);
        assert.equal(
            dataOf(login).user.username,
            "dat.pham"
        );
        assertNoPasswordData(login.payload);

        const sessionCookie =
            login.headers.get("set-cookie");

        assert.match(sessionCookie, /HttpOnly/i);
        assert.match(
            sessionCookie,
            /SameSite=Lax/i
        );

        const persisted =
            await client.request("/api/session");

        assert.equal(
            dataOf(persisted).authenticated,
            true
        );

        const logout = await client.request(
            "/api/session",
            { method: "DELETE" }
        );

        assert.equal(logout.status, 200);
        assert.equal(
            dataOf(logout).authenticated,
            false
        );

        const afterLogout =
            await client.request("/api/wishlist");

        assert.equal(afterLogout.status, 401);
    }
);

test(
    "products are retrieved once as a complete collection",
    async () => {
        const client = new TestClient();
        await client.login();

        const result =
            await client.request("/api/products");

        assert.equal(result.status, 200);

        const { products } = dataOf(result);
        assert.equal(products.length, 5);
        assert.equal(
            products.filter(
                (product) =>
                    product.isWishlisted
            ).length,
            4
        );

        assert.equal(
            products.find(
                (product) =>
                    product.id === "data-bootcamp"
            ).isWishlisted,
            false
        );

        assertNoPasswordData(products);

        const queried = dataOf(
            await client.request(
                "/api/products?search=missing&sort=price-high"
            )
        );

        assert.equal(queried.products.length, 5);
    }
);

test(
    "Wishlist retrieval and creation use the logged-in owner",
    async () => {
        const dat = new TestClient();
        const jay = new TestClient();

        await dat.login();
        await jay.login(
            "jay.nguyen",
            "StudentDemo!26"
        );

        const datState = dataOf(
            await dat.request("/api/wishlist")
        );

        const jayState = dataOf(
            await jay.request("/api/wishlist")
        );

        assert.equal(datState.wishlist.length, 3);
        assert.equal(datState.cart.length, 1);
        assert.equal(datState.purchases.length, 2);
        assert.equal(jayState.wishlist.length, 0);
        assert.equal(jayState.cart.length, 0);

        const missing = await dat.request(
            "/api/wishlist",
            {
                method: "POST",
                body: {}
            }
        );

        assert.equal(missing.status, 422);

        const unknown = await dat.request(
            "/api/wishlist",
            {
                method: "POST",
                body: {
                    productId: "not-a-product"
                }
            }
        );

        assert.equal(unknown.status, 404);

        const beforeProduct = dataOf(
            await dat.request("/api/products")
        ).products.find(
            (product) =>
                product.id === "data-bootcamp"
        );

        const beforeWishlisted =
            statsOf(beforeProduct).wishlisted;

        const created = await dat.request(
            "/api/wishlist",
            {
                method: "POST",
                body: {
                    productId: "data-bootcamp",
                    userId: "user-jay"
                }
            }
        );

        assert.equal(created.status, 201);
        assert.equal(
            dataOf(created).item.product.id,
            "data-bootcamp"
        );

        const duplicate = await dat.request(
            "/api/wishlist",
            {
                method: "POST",
                body: {
                    productId: "data-bootcamp"
                }
            }
        );

        assert.equal(duplicate.status, 409);
        assert.equal(
            errorOf(duplicate).code,
            "DUPLICATE_WISHLIST_ITEM"
        );

        const datAfter = dataOf(
            await dat.request("/api/wishlist")
        );

        const jayAfter = dataOf(
            await jay.request("/api/wishlist")
        );

        assert.ok(
            datAfter.wishlist.some(
                (entry) =>
                    entry.product.id ===
                        "data-bootcamp"
            )
        );

        assert.equal(
            jayAfter.wishlist.some(
                (entry) =>
                    entry.product.id ===
                        "data-bootcamp"
            ),
            false
        );

        const afterProduct = dataOf(
            await dat.request("/api/products")
        ).products.find(
            (product) =>
                product.id === "data-bootcamp"
        );

        assert.equal(
            statsOf(afterProduct).wishlisted,
            beforeWishlisted + 1
        );
    }
);

test(
    "Wishlist transitions, deletion, counters, and ownership are enforced",
    async () => {
        const dat = new TestClient();
        const jay = new TestClient();

        await dat.login();
        await jay.login(
            "jay.nguyen",
            "StudentDemo!26"
        );

        const crossUserDelete =
            await jay.request(
                "/api/wishlist/peer-workshop",
                { method: "DELETE" }
            );

        assert.equal(crossUserDelete.status, 404);

        const initialProducts = dataOf(
            await dat.request("/api/products")
        ).products;

        const initialStats = statsOf(
            initialProducts.find(
                (product) =>
                    product.id === "data-bootcamp"
            )
        );

        await dat.request(
            "/api/wishlist",
            {
                method: "POST",
                body: {
                    productId: "data-bootcamp"
                }
            }
        );

        const moved = await dat.request(
            "/api/wishlist/data-bootcamp",
            {
                method: "PATCH",
                body: {
                    action: "move-to-cart"
                }
            }
        );

        assert.equal(moved.status, 200);
        assert.equal(dataOf(moved).item.status, "cart");

        const repeatedMove = await dat.request(
            "/api/wishlist/data-bootcamp",
            {
                method: "PATCH",
                body: {
                    action: "move-to-cart"
                }
            }
        );

        assert.equal(repeatedMove.status, 409);

        const invalidAction = await dat.request(
            "/api/wishlist/data-bootcamp",
            {
                method: "PATCH",
                body: {
                    action: "teleport"
                }
            }
        );

        assert.equal(invalidAction.status, 422);

        const purchased = await dat.request(
            "/api/wishlist/data-bootcamp",
            {
                method: "PATCH",
                body: {
                    action: "mark-purchased"
                }
            }
        );

        assert.equal(purchased.status, 200);
        assert.equal(
            dataOf(purchased).purchase.product.id,
            "data-bootcamp"
        );

        const productAfterPurchase = dataOf(
            await dat.request("/api/products")
        ).products.find(
            (product) =>
                product.id === "data-bootcamp"
        );

        assert.equal(
            statsOf(productAfterPurchase).wishlisted,
            initialStats.wishlisted
        );
        assert.equal(
            statsOf(productAfterPurchase).inCarts,
            initialStats.inCarts
        );
        assert.equal(
            statsOf(productAfterPurchase).purchased,
            initialStats.purchased + 1
        );

        const removed = await dat.request(
            "/api/wishlist/peer-workshop",
            { method: "DELETE" }
        );

        assert.equal(removed.status, 200);
        assert.equal(
            dataOf(removed).removedProductId,
            "peer-workshop"
        );

        const repeatedDelete = await dat.request(
            "/api/wishlist/peer-workshop",
            { method: "DELETE" }
        );

        assert.equal(repeatedDelete.status, 404);

        const finalProducts = dataOf(
            await dat.request("/api/products")
        ).products;

        for (const product of finalProducts) {
            const stats = statsOf(product);
            assert.ok(stats.wishlisted >= 0);
            assert.ok(stats.inCarts >= 0);
            assert.ok(stats.purchased >= 0);
        }
    }
);

test(
    "profile updates are isolated, validated, unique, and safely presented",
    async () => {
        const dat = new TestClient();
        const jay = new TestClient();

        await dat.login();
        await jay.login(
            "jay.nguyen",
            "StudentDemo!26"
        );

        const current = dataOf(
            await dat.request("/api/profile")
        ).profile;

        assert.equal(current.id, "user-dat");
        assertNoPasswordData(current);

        const invalid = await dat.request(
            "/api/profile",
            {
                method: "PATCH",
                body: {
                    name: "D",
                    email: "broken",
                    description: "x".repeat(301)
                }
            }
        );

        assert.equal(invalid.status, 422);
        assert.ok(errorOf(invalid).fields.name);
        assert.ok(errorOf(invalid).fields.email);
        assert.ok(
            errorOf(invalid).fields.description
        );

        const duplicateEmail = await dat.request(
            "/api/profile",
            {
                method: "PATCH",
                body: {
                    email: "S4217847@RMIT.EDU.VN"
                }
            }
        );

        assert.equal(duplicateEmail.status, 409);
        assert.equal(
            errorOf(duplicateEmail).code,
            "EMAIL_IN_USE"
        );

        const protectedField = await dat.request(
            "/api/profile",
            {
                method: "PATCH",
                body: {
                    role: "member"
                }
            }
        );

        assert.equal(protectedField.status, 422);

        const invalidAvatar = await dat.request(
            "/api/profile",
            {
                method: "PATCH",
                body: {
                    avatarDataUrl:
                        "data:image/svg+xml;base64,PHN2Zz4="
                }
            }
        );

        assert.equal(invalidAvatar.status, 422);

        const wrongPassword = await dat.request(
            "/api/profile",
            {
                method: "PATCH",
                body: {
                    name: "Must Not Persist",
                    currentPassword: "wrong",
                    newPassword: "Replacement9A"
                }
            }
        );

        assert.equal(wrongPassword.status, 422);
        assert.equal(
            errorOf(wrongPassword).code,
            "INVALID_CURRENT_PASSWORD"
        );

        const afterFailure = dataOf(
            await dat.request("/api/profile")
        ).profile;

        assert.equal(afterFailure.name, "Dat Pham");

        const updated = await dat.request(
            "/api/profile",
            {
                method: "PATCH",
                body: {
                    name: "Dat P.",
                    description:
                        "Updated by the current-user profile route.",
                    currentPassword:
                        "ConnectDemo!26",
                    newPassword:
                        "Replacement9A"
                }
            }
        );

        assert.equal(updated.status, 200);
        assert.equal(
            dataOf(updated).profile.name,
            "Dat P."
        );
        assertNoPasswordData(updated.payload);

        const jayProfile = dataOf(
            await jay.request("/api/profile")
        ).profile;

        assert.equal(jayProfile.name, "Jay Nguyen");

        await dat.request(
            "/api/session",
            { method: "DELETE" }
        );

        assert.equal(
            (await dat.login(
                "dat.pham",
                "ConnectDemo!26"
            )).status,
            401
        );

        assert.equal(
            (await dat.login(
                "dat.pham",
                "Replacement9A"
            )).status,
            201
        );
    }
);

test(
    "administration is role-protected and account status is enforced",
    async () => {
        const admin = new TestClient();
        const jay = new TestClient();

        await admin.login();
        await jay.login(
            "jay.nguyen",
            "StudentDemo!26"
        );

        const forbidden =
            await jay.request("/api/admin/users");

        assert.equal(forbidden.status, 403);
        assert.equal(
            errorOf(forbidden).code,
            "ADMIN_REQUIRED"
        );

        const list =
            await admin.request("/api/admin/users");

        assert.equal(list.status, 200);
        assert.equal(dataOf(list).users.length, 3);
        assert.ok(
            dataOf(list).users.every(
                (user) => /^S\d{7}$/.test(
                    user.studentId
                )
            )
        );
        assertNoPasswordData(list.payload);

        const selfLock = await admin.request(
            "/api/admin/users/user-dat/status",
            {
                method: "PATCH",
                body: {
                    status: "locked"
                }
            }
        );

        assert.equal(selfLock.status, 409);

        const invalidStatus = await admin.request(
            "/api/admin/users/user-jay/status",
            {
                method: "PATCH",
                body: {
                    status: "deleted"
                }
            }
        );

        assert.equal(invalidStatus.status, 422);

        const missingUser = await admin.request(
            "/api/admin/users/user-missing/status",
            {
                method: "PATCH",
                body: {
                    status: "locked"
                }
            }
        );

        assert.equal(missingUser.status, 404);
        assert.equal(
            errorOf(missingUser).code,
            "USER_NOT_FOUND"
        );

        const lockJay = await admin.request(
            "/api/admin/users/user-jay/status",
            {
                method: "PATCH",
                body: {
                    status: "locked"
                }
            }
        );

        assert.equal(lockJay.status, 200);
        assert.equal(
            dataOf(lockJay).user.status,
            "locked"
        );

        const lockedOperation =
            await jay.request("/api/wishlist");

        assert.equal(lockedOperation.status, 423);

        const unlockJay = await admin.request(
            "/api/admin/users/user-jay/status",
            {
                method: "PATCH",
                body: {
                    status: "active"
                }
            }
        );

        assert.equal(unlockJay.status, 200);

        const relogin = await jay.login(
            "jay.nguyen",
            "StudentDemo!26"
        );

        assert.equal(relogin.status, 201);
    }
);

test(
    "invalid JSON, unknown APIs, and production configuration fail safely",
    async () => {
        const client = new TestClient();

        const invalidJson = await client.request(
            "/api/session",
            {
                method: "POST",
                rawBody: "{not-json",
                headers: {
                    "Content-Type":
                        "application/json"
                }
            }
        );

        assert.equal(invalidJson.status, 400);
        assert.equal(
            errorOf(invalidJson).code,
            "INVALID_JSON"
        );
        assert.equal(
            invalidJson.headers.get(
                "cache-control"
            ),
            "no-store"
        );

        const oversizedJson = await client.request(
            "/api/profile",
            {
                method: "PATCH",
                rawBody: JSON.stringify({
                    avatarDataUrl:
                        "x".repeat(1_600_000)
                }),
                headers: {
                    "Content-Type":
                        "application/json"
                }
            }
        );

        assert.equal(oversizedJson.status, 413);
        assert.equal(
            errorOf(oversizedJson).code,
            "PAYLOAD_TOO_LARGE"
        );
        assert.equal(
            oversizedJson.headers.get(
                "cache-control"
            ),
            "no-store"
        );

        const missingRoute =
            await client.request(
                "/api/does-not-exist"
            );

        assert.equal(missingRoute.status, 404);
        assert.equal(
            errorOf(missingRoute).code,
            "API_ROUTE_NOT_FOUND"
        );

        const previousEnvironment =
            process.env.NODE_ENV;

        const previousSecret =
            process.env.SESSION_SECRET;

        try {
            process.env.NODE_ENV = "production";
            delete process.env.SESSION_SECRET;

            assert.throws(
                () => createApp(),
                /SESSION_SECRET is required/
            );
        } finally {
            if (previousEnvironment === undefined) {
                delete process.env.NODE_ENV;
            } else {
                process.env.NODE_ENV =
                    previousEnvironment;
            }

            if (previousSecret === undefined) {
                delete process.env.SESSION_SECRET;
            } else {
                process.env.SESSION_SECRET =
                    previousSecret;
            }
        }
    }
);

test(
    "resetData restores the documented in-memory seed",
    () => {
        resetData();

        assert.equal(dataStore.users.length, 3);
        assert.equal(dataStore.products.length, 5);
        assert.equal(dataStore.wishlist.length, 3);
        assert.equal(dataStore.cart.length, 1);
        assert.equal(dataStore.purchases.length, 2);

        assert.ok(
            dataStore.users.every(
                (user) =>
                    typeof user.passwordHash ===
                        "string" &&
                    user.passwordHash.startsWith(
                        "$2"
                    )
            )
        );
    }
);
