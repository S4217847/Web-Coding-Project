/**
 * MongoDB persistence for the shared Account and Wishlist module.
 *
 * Routes remain responsible for HTTP concerns (request validation, sessions,
 * and response status codes). This repository owns database queries, turns
 * Mongoose documents into stable client objects, and makes every personal-data
 * query include the authenticated user's id.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const PUBLIC_USER_FIELDS = [
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

const PROFILE_FIELDS = new Set([
    "name",
    "email",
    "description",
    "avatarUrl",
    "passwordHash"
]);

const PRODUCT_SORTS = {
    "name-asc": { name: 1, slug: 1 },
    name: { name: 1, slug: 1 },
    "name-desc": { name: -1, slug: 1 },
    "price-asc": { priceVnd: 1, name: 1 },
    "price-low": { priceVnd: 1, name: 1 },
    "price-desc": { priceVnd: -1, name: 1 },
    "price-high": { priceVnd: -1, name: 1 },
    newest: { createdAt: -1, name: 1 },
    "most-wishlisted": {
        computedWishlisted: -1,
        name: 1
    },
    popular: {
        computedWishlisted: -1,
        name: 1
    },
    purchased: {
        computedPurchased: -1,
        name: 1
    }
};

/** A predictable error contract that the Express adapter can map to JSON. */
export class RepositoryError extends Error {
    constructor(
        code,
        message,
        {
            status = 500,
            fields,
            cause
        } = {}
    ) {
        super(message, cause ? { cause } : undefined);

        this.name = "RepositoryError";
        this.code = code;
        this.status = status;
        this.statusCode = status;

        if (fields && Object.keys(fields).length > 0) {
            this.fields = fields;
        }
    }
}

function loadDefaultModels() {
    const { User } =
        require("../../../models/user.js");

    const { Product } =
        require("../../../models/product.js");

    const { WishlistEntry } =
        require("../../../models/wishlist-entry.js");

    const { Purchase } =
        require("../../../models/purchase.js");

    const { PasswordResetToken } =
        require("../../../models/password-reset-token.js");

    return {
        User,
        Product,
        WishlistEntry,
        Purchase,
        PasswordResetToken
    };
}

function cleanString(value) {
    return typeof value === "string"
        ? value.trim()
        : "";
}

function dateString(value) {
    if (!value) {
        return null;
    }

    const date = value instanceof Date
        ? value
        : new Date(value);

    return Number.isNaN(date.getTime())
        ? null
        : date.toISOString();
}

function plainRecord(value) {
    if (!value) {
        return value;
    }

    return typeof value.toObject === "function"
        ? value.toObject({ virtuals: false })
        : value;
}

function stringId(value) {
    if (value === null || value === undefined) {
        return "";
    }

    if (value._id) {
        return String(value._id);
    }

    return String(value);
}

function castId(Model, value) {
    try {
        return Model.schema.path("_id").cast(value);
    } catch {
        return null;
    }
}

function publicUser(record) {
    const user = plainRecord(record);

    if (!user) {
        return null;
    }

    const output = {
        id: stringId(user._id ?? user.id)
    };

    for (const field of PUBLIC_USER_FIELDS) {
        if (field.endsWith("At")) {
            output[field] = dateString(user[field]);
        } else if (user[field] !== undefined) {
            output[field] = user[field];
        }
    }

    /* A2 clients still check this transport-only property. */
    output.avatarDataUrl = "";

    return output;
}

function internalUser(record) {
    const user = publicUser(record);
    const source = plainRecord(record);

    if (user && source?.passwordHash) {
        user.passwordHash = source.passwordHash;
    }

    if (user) {
        user.authVersion = source?.authVersion ?? 0;
    }

    return user;
}

function productFromAggregation(record) {
    if (!record) {
        return null;
    }

    const wishlisted = Number(
        record.computedWishlisted ?? 0
    );

    const inCarts = Number(
        record.computedInCarts ?? 0
    );

    const purchased = Number(
        record.computedPurchased ?? 0
    );

    return {
        id: record.slug,
        slug: record.slug,
        name: record.name,
        category: record.category,
        description: record.description,
        priceVnd: record.priceVnd,
        price: record.priceVnd,
        image: record.image,
        imageAlt: record.imageAlt,
        isActive: record.isActive,
        stats: {
            wishlisted,
            inCarts,
            purchased
        },
        wishlisted,
        inCarts,
        purchased,
        isWishlisted: Boolean(record.isWishlisted),
        createdAt: dateString(record.createdAt),
        updatedAt: dateString(record.updatedAt)
    };
}

function wishlistItem(record, product) {
    const item = plainRecord(record);

    return {
        id: stringId(item._id ?? item.id),
        status: item.status,
        quantity: item.quantity ?? 1,
        createdAt: dateString(item.createdAt),
        updatedAt: dateString(item.updatedAt),
        product
    };
}

function purchaseItem(record, product) {
    const purchase = plainRecord(record);
    const historicalProduct = product
        ? {
            ...product,
            name: purchase.productName,
            priceVnd: purchase.unitPriceVnd,
            price: purchase.unitPriceVnd
        }
        : product;

    return {
        id: stringId(purchase._id ?? purchase.id),
        productName: purchase.productName,
        quantity: purchase.quantity ?? 1,
        unitPriceVnd:
            purchase.unitPriceVnd ??
            product?.priceVnd ??
            0,
        purchasedAt: dateString(purchase.purchasedAt),
        product: historicalProduct
    };
}

function summaryFromCounts(saved, cart, purchased) {
    const totalSaved = saved + cart;

    return {
        saved: totalSaved,
        wishlist: totalSaved,
        savedItems: totalSaved,
        cart,
        readyForCart: cart,
        purchased
    };
}

function validationFields(error) {
    return Object.fromEntries(
        Object.entries(error.errors ?? {}).map(
            ([field, detail]) => [
                field,
                detail?.message ?? "This value is invalid."
            ]
        )
    );
}

function duplicateFields(error) {
    const keys = Object.keys(
        error.keyPattern ?? error.keyValue ?? {}
    );

    if (keys.length > 0) {
        return keys;
    }

    const match = cleanString(error.message).match(
        /index:\s+([^\s]+)\s+dup key/i
    );

    return match?.[1]
        ?.split("_")
        .filter((part) => !/^\d+$/.test(part)) ?? [];
}

function translateDatabaseError(error) {
    if (error instanceof RepositoryError) {
        return error;
    }

    if (error?.code === 11000) {
        const fields = duplicateFields(error);
        const field = fields[0] ?? "";

        if (
            fields.includes("userId") &&
            fields.includes("productId")
        ) {
            return new RepositoryError(
                "DUPLICATE_WISHLIST_ITEM",
                "This item is already in your wishlist.",
                {
                    status: 409,
                    cause: error
                }
            );
        }

        const duplicates = {
            username: [
                "USERNAME_IN_USE",
                "That username is already registered."
            ],
            email: [
                "EMAIL_IN_USE",
                "That email address is already registered."
            ],
            studentId: [
                "STUDENT_ID_IN_USE",
                "That student ID is already registered."
            ],
            tokenHash: [
                "RESET_TOKEN_CONFLICT",
                "Please request a new password reset link."
            ],
            userId: [
                "RESET_TOKEN_CONFLICT",
                "Please request a new password reset link."
            ]
        };

        const [code, message] =
            duplicates[field] ?? [
                "DUPLICATE_RECORD",
                "A record with these details already exists."
            ];

        return new RepositoryError(
            code,
            message,
            {
                status: 409,
                fields: field
                    ? { [field]: message }
                    : undefined,
                cause: error
            }
        );
    }

    if (error?.name === "ValidationError") {
        return new RepositoryError(
            "VALIDATION_ERROR",
            "Correct the highlighted fields.",
            {
                status: 422,
                fields: validationFields(error),
                cause: error
            }
        );
    }

    if (error?.name === "CastError") {
        return new RepositoryError(
            "INVALID_REFERENCE",
            "The requested record identifier is invalid.",
            {
                status: 422,
                cause: error
            }
        );
    }

    return new RepositoryError(
        "DATABASE_ERROR",
        "The database operation could not be completed.",
        {
            status: 500,
            cause: error
        }
    );
}

/**
 * Create the production repository. Tests may inject models and a transaction
 * runner, while production loads the shared Mongoose models by default.
 */
export function createMongoAccountRepository(options = {}) {
    const models = options.models ?? loadDefaultModels();

    const {
        User,
        Product,
        WishlistEntry,
        Purchase,
        PasswordResetToken
    } = models;

    const transactionRunner =
        options.runInTransaction ??
        (async (work) => {
            const session =
                await User.db.startSession();

            try {
                let result;

                await session.withTransaction(
                    async () => {
                        result = await work(session);
                    }
                );

                return result;
            } finally {
                await session.endSession();
            }
        });

    function querySession(query, session) {
        return session
            ? query.session(session)
            : query;
    }

    function validOwnerId(userId) {
        const id = castId(User, userId);

        if (!id) {
            throw new RepositoryError(
                "USER_NOT_FOUND",
                "The requested user does not exist.",
                { status: 404 }
            );
        }

        return id;
    }

    async function productRecord(productId, options = {}) {
        const slug = cleanString(productId).toLowerCase();
        const objectId = castId(Product, productId);
        const choices = [];

        if (slug) {
            choices.push({ slug });
        }

        if (objectId) {
            choices.push({ _id: objectId });
        }

        if (choices.length === 0) {
            return null;
        }

        const identity = choices.length === 1
            ? choices[0]
            : { $or: choices };

        const filter = options.activeOnly
            ? { $and: [identity, { isActive: true }] }
            : identity;

        let query = Product.findOne(filter).lean();
        query = querySession(query, options.session);

        return query;
    }

    function cataloguePipeline(
        userId,
        {
            search = "",
            category = "",
            sort = "",
            includeInactive = false,
            productIds = null
        } = {}
    ) {
        const match = {};

        if (!includeInactive) {
            match.isActive = true;
        }

        if (Array.isArray(productIds)) {
            match._id = { $in: productIds };
        }

        const cleanedSearch = cleanString(search).slice(0, 100);

        if (cleanedSearch) {
            /* Product's text index searches name, category, and description. */
            match.$text = { $search: cleanedSearch };
        }

        const cleanedCategory = cleanString(category);

        if (
            cleanedCategory &&
            cleanedCategory.toLowerCase() !== "all"
        ) {
            /* Browser option field-trip maps to the indexed value Field Trip. */
            match.category = cleanedCategory
                .replace(/-/g, " ")
                .split(/\s+/)
                .filter(Boolean)
                .map(
                    (word) =>
                        word.charAt(0).toUpperCase() +
                        word.slice(1).toLowerCase()
                )
                .join(" ");
        }

        const ownerId = castId(User, userId);

        const ownerMatch = ownerId
            ? {
                $and: [
                    { $eq: ["$$item.userId", ownerId] },
                    {
                        $in: [
                            "$$item.status",
                            ["saved", "cart"]
                        ]
                    }
                ]
            }
            : false;

        const sortOrder = cleanedSearch && !cleanString(sort)
            ? { searchScore: -1, name: 1 }
            : (
                PRODUCT_SORTS[sort] ??
                PRODUCT_SORTS["name-asc"]
            );

        const pipeline = [
            { $match: match },
            {
                $lookup: {
                    from: WishlistEntry.collection.name,
                    localField: "_id",
                    foreignField: "productId",
                    as: "_wishlistItems"
                }
            },
            {
                $lookup: {
                    from: Purchase.collection.name,
                    localField: "_id",
                    foreignField: "productId",
                    as: "_purchases"
                }
            },
            {
                $set: {
                    computedWishlisted: {
                        $size: {
                            $filter: {
                                input: "$_wishlistItems",
                                as: "item",
                                cond: {
                                    $eq: ["$$item.status", "saved"]
                                }
                            }
                        }
                    },
                    computedInCarts: {
                        $size: {
                            $filter: {
                                input: "$_wishlistItems",
                                as: "item",
                                cond: {
                                    $eq: ["$$item.status", "cart"]
                                }
                            }
                        }
                    },
                    computedPurchased: {
                        $size: "$_purchases"
                    },
                    isWishlisted: {
                        $gt: [
                            {
                                $size: {
                                    $filter: {
                                        input: "$_wishlistItems",
                                        as: "item",
                                        cond: ownerMatch
                                    }
                                }
                            },
                            0
                        ]
                    }
                }
            },
            {
                $project: {
                    _wishlistItems: 0,
                    _purchases: 0,
                    __v: 0
                }
            },
            { $sort: sortOrder }
        ];

        if (cleanedSearch) {
            pipeline.splice(1, 0, {
                $set: {
                    searchScore: { $meta: "textScore" }
                }
            });
        }

        return pipeline;
    }

    async function productsWithStats(
        userId,
        queryOptions = {}
    ) {
        const records = await Product.aggregate(
            cataloguePipeline(userId, queryOptions)
        ).exec();

        return records.map(productFromAggregation);
    }

    async function wishlistSummary(userId) {
        const ownerId = validOwnerId(userId);

        const [saved, cart, purchased] =
            await Promise.all([
                WishlistEntry.countDocuments({
                    userId: ownerId,
                    status: "saved"
                }),
                WishlistEntry.countDocuments({
                    userId: ownerId,
                    status: "cart"
                }),
                Purchase.countDocuments({
                    userId: ownerId
                })
            ]);

        return summaryFromCounts(saved, cart, purchased);
    }

    async function adminSummary() {
        const [total, active, locked, deactivated, administrators] =
            await Promise.all([
                User.countDocuments({}),
                User.countDocuments({ status: "active" }),
                User.countDocuments({ status: "locked" }),
                User.countDocuments({ status: "deactivated" }),
                User.countDocuments({ role: "admin" })
            ]);

        return {
            total,
            active,
            locked,
            deactivated,
            administrators
        };
    }

    async function productSnapshot(userId, productId) {
        const record = await productRecord(productId);

        if (!record) {
            return null;
        }

        const [product] = await productsWithStats(
            userId,
            {
                includeInactive: true,
                productIds: [record._id]
            }
        );

        return product ?? null;
    }

    async function findUserById(id) {
        const userId = castId(User, id);

        if (!userId) {
            return null;
        }

        try {
            const user = await User
                .findById(userId)
                .select("+passwordHash")
                .lean();

            return internalUser(user);
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function findUserByIdentifier(identifier) {
        const value = cleanString(identifier).toLowerCase();

        if (!value) {
            return null;
        }

        try {
            const user = await User
                .findOne({
                    $or: [
                        { username: value },
                        { email: value }
                    ]
                })
                .select("+passwordHash")
                .lean();

            return internalUser(user);
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function touchUser(id, expectedAuthVersion = 0) {
        const userId = validOwnerId(id);
        const version =
            Number.isSafeInteger(expectedAuthVersion) &&
            expectedAuthVersion >= 0
                ? expectedAuthVersion
                : 0;

        /*
         * The password was verified against this authentication version. Do
         * not establish a new session if a password/status change committed
         * between verification and this atomic update. Older Atlas records may
         * not have authVersion yet, so a missing value is equivalent to zero.
         */
        const versionFilter = version === 0
            ? { $in: [0, null] }
            : version;

        try {
            const user = await User
                .findOneAndUpdate(
                    {
                        _id: userId,
                        status: "active",
                        authVersion: versionFilter
                    },
                    {
                        $set: {
                            lastActiveAt: new Date(),
                            authVersion: version
                        }
                    },
                    {
                        returnDocument: "after",
                        runValidators: true
                    }
                )
                .select("+passwordHash")
                .lean();

            return internalUser(user);
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function findProduct(productId, userId = null) {
        try {
            return await productSnapshot(userId, productId);
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function listProductsForUser(
        userId,
        queryOptions = {}
    ) {
        validOwnerId(userId);

        try {
            const products = await productsWithStats(
                userId,
                queryOptions
            );

            return {
                products,
                count: products.length
            };
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function addWishlistItem(userId, productId) {
        const ownerId = validOwnerId(userId);

        try {
            const product = await productRecord(
                productId,
                { activeOnly: true }
            );

            if (!product) {
                throw new RepositoryError(
                    "PRODUCT_NOT_FOUND",
                    "The requested product does not exist.",
                    { status: 404 }
                );
            }

            const created = await WishlistEntry.create({
                userId: ownerId,
                productId: product._id,
                status: "saved",
                quantity: 1
            });

            const [decoratedProduct, summary] =
                await Promise.all([
                    productSnapshot(userId, product.slug),
                    wishlistSummary(userId)
                ]);

            return {
                item: wishlistItem(
                    created,
                    decoratedProduct
                ),
                summary
            };
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function getWishlist(userId) {
        const ownerId = validOwnerId(userId);

        try {
            const [wishlistItems, cartItems, purchases] = await Promise.all([
                WishlistEntry
                    .find({ userId: ownerId, status: "saved" })
                    .sort({ updatedAt: -1 })
                    .lean(),
                WishlistEntry
                    .find({ userId: ownerId, status: "cart" })
                    .sort({ updatedAt: -1 })
                    .lean(),
                Purchase
                    .find({ userId: ownerId })
                    .sort({ purchasedAt: -1 })
                    .lean()
            ]);

            const liveItems = [
                ...wishlistItems,
                ...cartItems
            ];

            const productIds = [
                ...liveItems.map((item) => item.productId),
                ...purchases.map((item) => item.productId)
            ];

            const products = productIds.length > 0
                ? await productsWithStats(userId, {
                    includeInactive: true,
                    productIds
                })
                : [];

            const productsById = new Map(
                products.map(
                    (product) => [
                        product.slug,
                        product
                    ]
                )
            );

            const databaseProducts = productIds.length > 0
                ? await Product
                    .find({ _id: { $in: productIds } })
                    .select("_id slug")
                    .lean()
                : [];

            const slugByObjectId = new Map(
                databaseProducts.map(
                    (product) => [
                        stringId(product._id),
                        product.slug
                    ]
                )
            );

            const productForReference = (reference) => {
                const slug = slugByObjectId.get(
                    stringId(reference)
                );

                return productsById.get(slug) ?? null;
            };

            const decoratedLiveItems = liveItems
                .map((item) => ({
                    source: item,
                    product:
                        productForReference(item.productId)
                }))
                .filter((item) => item.product);

            const wishlist = decoratedLiveItems
                .filter(({ source }) => source.status === "saved")
                .map(({ source, product }) =>
                    wishlistItem(source, product)
                );

            const cart = decoratedLiveItems
                .filter(({ source }) => source.status === "cart")
                .map(({ source, product }) =>
                    wishlistItem(source, product)
                );

            const purchaseHistory = purchases.map((purchase) => {
                const product =
                    productForReference(purchase.productId) ??
                    {
                        id: stringId(purchase.productId),
                        slug: stringId(purchase.productId),
                        name: purchase.productName,
                        category: "Archived item",
                        description:
                            "This product is no longer in the catalogue.",
                        priceVnd: purchase.unitPriceVnd,
                        price: purchase.unitPriceVnd,
                        image: "",
                        imageAlt: "",
                        stats: {
                            wishlisted: 0,
                            inCarts: 0,
                            purchased: 0
                        },
                        wishlisted: 0,
                        inCarts: 0,
                        purchased: 0,
                        isWishlisted: false
                    };

                return purchaseItem(purchase, product);
            });

            return {
                wishlist,
                cart,
                items: [...wishlist, ...cart],
                purchases: purchaseHistory,
                summary: summaryFromCounts(
                    wishlist.length,
                    cart.length,
                    purchaseHistory.length
                )
            };
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function moveToCart(userId, productId) {
        const ownerId = validOwnerId(userId);

        try {
            const product = await productRecord(productId);

            if (!product) {
                throw new RepositoryError(
                    "WISHLIST_ITEM_NOT_FOUND",
                    "This item is not in your wishlist.",
                    { status: 404 }
                );
            }

            const updated = await WishlistEntry
                .findOneAndUpdate(
                    {
                        userId: ownerId,
                        productId: product._id,
                        status: "saved"
                    },
                    {
                        $set: {
                            status: "cart",
                            quantity: 1
                        }
                    },
                    {
                        returnDocument: "after",
                        runValidators: true
                    }
                )
                .lean();

            if (!updated) {
                const alreadyInCart =
                    await WishlistEntry.exists({
                        userId: ownerId,
                        productId: product._id,
                        status: "cart"
                    });

                if (alreadyInCart) {
                    throw new RepositoryError(
                        "ALREADY_IN_CART",
                        "This item is already ready for cart.",
                        { status: 409 }
                    );
                }

                throw new RepositoryError(
                    "WISHLIST_ITEM_NOT_FOUND",
                    "This item is not in your wishlist.",
                    { status: 404 }
                );
            }

            const [decoratedProduct, summary] =
                await Promise.all([
                    productSnapshot(userId, product.slug),
                    wishlistSummary(userId)
                ]);

            return {
                item: wishlistItem(
                    updated,
                    decoratedProduct
                ),
                summary
            };
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function markPurchased(userId, productId) {
        const ownerId = validOwnerId(userId);

        try {
            const product = await productRecord(productId);

            if (!product) {
                throw new RepositoryError(
                    "WISHLIST_ITEM_NOT_FOUND",
                    "This item is not in your wishlist.",
                    { status: 404 }
                );
            }

            const purchase = await transactionRunner(
                async (session) => {
                    let removeQuery =
                        WishlistEntry.findOneAndDelete({
                            userId: ownerId,
                            productId: product._id
                        });

                    removeQuery = querySession(
                        removeQuery,
                        session
                    );

                    const removed = await removeQuery.lean();

                    if (!removed) {
                        throw new RepositoryError(
                            "WISHLIST_ITEM_NOT_FOUND",
                            "This item is not in your wishlist.",
                            { status: 404 }
                        );
                    }

                    const purchaseValues = {
                        userId: ownerId,
                        productId: product._id,
                        productName: product.name,
                        unitPriceVnd: product.priceVnd,
                        quantity: removed.quantity ?? 1,
                        purchasedAt: new Date()
                    };

                    if (!session) {
                        return Purchase.create(purchaseValues);
                    }

                    const [created] = await Purchase.create(
                        [purchaseValues],
                        { session }
                    );

                    return created;
                }
            );

            const [decoratedProduct, summary] =
                await Promise.all([
                    productSnapshot(userId, product.slug),
                    wishlistSummary(userId)
                ]);

            return {
                purchase: purchaseItem(
                    purchase,
                    decoratedProduct
                ),
                summary
            };
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function removeWishlistItem(userId, productId) {
        const ownerId = validOwnerId(userId);

        try {
            const product = await productRecord(productId);

            if (!product) {
                throw new RepositoryError(
                    "WISHLIST_ITEM_NOT_FOUND",
                    "This item is not in your wishlist.",
                    { status: 404 }
                );
            }

            const removed = await WishlistEntry
                .findOneAndDelete({
                    userId: ownerId,
                    productId: product._id
                })
                .lean();

            if (!removed) {
                throw new RepositoryError(
                    "WISHLIST_ITEM_NOT_FOUND",
                    "This item is not in your wishlist.",
                    { status: 404 }
                );
            }

            return {
                removedProductId: product.slug,
                summary: await wishlistSummary(userId)
            };
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function updateUserProfile(
        userId,
        values = {},
        expectedAuthVersion = 0
    ) {
        const ownerId = validOwnerId(userId);
        const update = {};
        const version =
            Number.isSafeInteger(expectedAuthVersion) &&
            expectedAuthVersion >= 0
                ? expectedAuthVersion
                : 0;
        const versionFilter = version === 0
            ? { $in: [0, null] }
            : version;

        for (const [field, value] of Object.entries(values)) {
            if (PROFILE_FIELDS.has(field)) {
                update[field] = value;
            }
        }

        if (values.newPasswordHash) {
            update.passwordHash = values.newPasswordHash;
        }

        /* Base64 is accepted only as upload input; it never enters MongoDB. */
        delete update.avatarDataUrl;

        if (Object.keys(update).length === 0) {
            throw new RepositoryError(
                "VALIDATION_ERROR",
                "Provide at least one profile field to update.",
                {
                    status: 422,
                    fields: {
                        form:
                            "Provide at least one profile field to update."
                    }
                }
            );
        }

        try {
            const applyProfileUpdate = async (session) => {
                let updateQuery = User.findOneAndUpdate(
                    {
                        _id: ownerId,
                        status: "active",
                        authVersion: versionFilter
                    },
                    {
                        $set: update,
                        ...(update.passwordHash
                            ? { $inc: { authVersion: 1 } }
                            : {})
                    },
                    {
                        returnDocument: "after",
                        runValidators: true
                    }
                );

                updateQuery = querySession(
                    updateQuery,
                    session
                );

                const updatedUser = await updateQuery.lean();

                if (
                    updatedUser &&
                    update.passwordHash
                ) {
                    let resetTokenQuery =
                        PasswordResetToken.deleteMany({
                            userId: ownerId
                        });

                    resetTokenQuery = querySession(
                        resetTokenQuery,
                        session
                    );

                    await resetTokenQuery;
                }

                return updatedUser;
            };

            /* Password changes and reset-token invalidation commit together. */
            const user = update.passwordHash
                ? await transactionRunner(applyProfileUpdate)
                : await applyProfileUpdate(null);

            if (!user) {
                throw new RepositoryError(
                    "SESSION_INVALID",
                    "This session is no longer valid. Sign in again.",
                    { status: 401 }
                );
            }

            return {
                profile: publicUser(user),
                authVersion: user.authVersion ?? 0
            };
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function listPublicUsers(
        {
            search = "",
            status = "all",
            sort = ""
        } = {}
    ) {
        const filter = {};
        const cleanedStatus = cleanString(status).toLowerCase();

        if (["active", "locked", "deactivated"].includes(cleanedStatus)) {
            filter.status = cleanedStatus;
        }

        const cleanedSearch = cleanString(search).slice(0, 100);

        if (cleanedSearch) {
            /* User's text index covers all public identity fields. */
            filter.$text = { $search: cleanedSearch };
        }

        const sortOptions = {
            name: { name: 1, username: 1 },
            "name-desc": { name: -1, username: 1 },
            "last-active": { lastActiveAt: -1, name: 1 },
            newest: { createdAt: -1, name: 1 }
        };

        try {
            let userQuery = User.find(filter);

            if (cleanedSearch && !cleanString(sort)) {
                userQuery = userQuery.sort({
                    searchScore: {
                        $meta: "textScore"
                    },
                    name: 1
                });
            } else {
                userQuery = userQuery.sort(
                    sortOptions[sort] ??
                    sortOptions.name
                );
            }

            const [records, summary] = await Promise.all([
                userQuery.lean(),
                adminSummary()
            ]);

            return {
                users: records.map(publicUser),
                summary
            };
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function setUserStatus(actorId, targetId, status) {
        const administratorId = validOwnerId(actorId);
        const userId = validOwnerId(targetId);
        const nextStatus = cleanString(status).toLowerCase();

        if (!["active", "locked"].includes(nextStatus)) {
            throw new RepositoryError(
                "VALIDATION_ERROR",
                "Choose a valid account status.",
                {
                    status: 422,
                    fields: {
                        status:
                            "Status must be active or locked."
                    }
                }
            );
        }

        if (
            String(administratorId) === String(userId) &&
            nextStatus === "locked"
        ) {
            throw new RepositoryError(
                "CANNOT_LOCK_SELF",
                "You cannot lock your own administrator account.",
                { status: 409 }
            );
        }

        try {
            const administrator = await User.exists({
                _id: administratorId,
                role: "admin",
                status: "active"
            });

            if (!administrator) {
                throw new RepositoryError(
                    "ADMIN_REQUIRED",
                    "Administrator access is required.",
                    { status: 403 }
                );
            }

            const changeStatus = async (session) => {
                let currentQuery = User.findOne({
                    _id: userId,
                    status: { $ne: "deactivated" }
                });

                currentQuery = querySession(currentQuery, session);
                const currentUser = await currentQuery.lean();

                if (!currentUser) {
                    return null;
                }

                /* Repeating the current status is a safe, session-preserving no-op. */
                if (currentUser.status === nextStatus) {
                    return currentUser;
                }

                const now = new Date();
                let updateQuery = User.findOneAndUpdate(
                    {
                        _id: userId,
                        status: currentUser.status
                    },
                    {
                        $set: {
                            status: nextStatus,
                            lockedAt:
                                nextStatus === "locked"
                                    ? now
                                    : null
                        },
                        $inc: { authVersion: 1 }
                    },
                    {
                        returnDocument: "after",
                        runValidators: true
                    }
                );

                updateQuery = querySession(updateQuery, session);
                const updatedUser = await updateQuery.lean();

                if (!updatedUser) {
                    throw new RepositoryError(
                        "ACCOUNT_STATUS_CONFLICT",
                        "The account status changed during this request. Refresh and try again.",
                        { status: 409 }
                    );
                }

                if (nextStatus === "locked") {
                    let resetTokenQuery = PasswordResetToken.deleteMany({
                        userId
                    });

                    resetTokenQuery = querySession(resetTokenQuery, session);
                    await resetTokenQuery;
                }

                return updatedUser;
            };

            const user = await transactionRunner(changeStatus);

            if (!user) {
                throw new RepositoryError(
                    "USER_NOT_FOUND",
                    "The requested user does not exist.",
                    { status: 404 }
                );
            }

            return {
                user: publicUser(user),
                summary: await adminSummary()
            };
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function registerUser(values) {
        /* Never let a public registration request choose privileges or status. */
        const record = {
            username: values.username,
            studentId: values.studentId,
            name: values.name,
            email: values.email,
            passwordHash: values.passwordHash,
            description: values.description ?? "",
            avatarUrl: values.avatarUrl ?? "/images/user_icon.png",
            course: values.course ?? "",
            role: "member",
            status: "active"
        };

        try {
            const user = await User.create(record);
            return publicUser(user);
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function createResetToken(
        userId,
        { tokenHash, expiresAt }
    ) {
        const ownerId = validOwnerId(userId);

        try {
            const ownerExists = await User.exists({
                _id: ownerId,
                status: "active"
            });

            if (!ownerExists) {
                throw new RepositoryError(
                    "USER_NOT_FOUND",
                    "The requested user does not exist.",
                    { status: 404 }
                );
            }

            const token = await PasswordResetToken
                .findOneAndUpdate(
                    { userId: ownerId },
                    {
                        $set: {
                            tokenHash,
                            expiresAt,
                            usedAt: null
                        }
                    },
                    {
                        returnDocument: "after",
                        upsert: true,
                        runValidators: true,
                        setDefaultsOnInsert: true
                    }
                )
                .lean();

            return {
                id: stringId(token._id),
                userId: stringId(token.userId),
                expiresAt: dateString(token.expiresAt),
                usedAt: dateString(token.usedAt)
            };
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function consumeResetToken(
        {
            tokenHash,
            newPasswordHash,
            now = new Date()
        }
    ) {
        try {
            const user = await transactionRunner(
                async (session) => {
                    let claimQuery =
                        PasswordResetToken.findOneAndUpdate(
                            {
                                tokenHash,
                                usedAt: null,
                                expiresAt: { $gt: now }
                            },
                            { $set: { usedAt: now } },
                            { returnDocument: "after" }
                        );

                    claimQuery = querySession(
                        claimQuery,
                        session
                    );

                    const claim = await claimQuery.lean();

                    if (!claim) {
                        throw new RepositoryError(
                            "RESET_TOKEN_INVALID",
                            "This password reset link is invalid or has expired.",
                            { status: 400 }
                        );
                    }

                    let updateQuery = User.findOneAndUpdate(
                        {
                            _id: claim.userId,
                            status: "active"
                        },
                        {
                            $set: {
                                passwordHash: newPasswordHash
                            },
                            $inc: { authVersion: 1 }
                        },
                        {
                            returnDocument: "after",
                            runValidators: true
                        }
                    );

                    updateQuery = querySession(
                        updateQuery,
                        session
                    );

                    const updatedUser =
                        await updateQuery.lean();

                    if (!updatedUser) {
                        throw new RepositoryError(
                            "RESET_TOKEN_INVALID",
                            "This password reset link is invalid or has expired.",
                            { status: 400 }
                        );
                    }

                    return updatedUser;
                }
            );

            return publicUser(user);
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    async function deactivateUser(userId) {
        const ownerId = validOwnerId(userId);

        try {
            const existingUser = await User
                .findById(ownerId)
                .select("role status")
                .lean();

            if (!existingUser || existingUser.status === "deactivated") {
                throw new RepositoryError(
                    "USER_NOT_FOUND",
                    "The requested user does not exist or is already deactivated.",
                    { status: 404 }
                );
            }

            if (existingUser.role === "admin") {
                const anotherActiveAdministrator = await User.exists({
                    _id: { $ne: ownerId },
                    role: "admin",
                    status: "active"
                });

                if (!anotherActiveAdministrator) {
                    throw new RepositoryError(
                        "LAST_ACTIVE_ADMIN",
                        "Assign another active administrator before deactivating this account.",
                        { status: 409 }
                    );
                }
            }

            const deactivate = async (session) => {
                let updateQuery = User.findOneAndUpdate(
                    {
                        _id: ownerId,
                        status: { $ne: "deactivated" }
                    },
                    {
                        $set: {
                            status: "deactivated",
                            deactivatedAt: new Date(),
                            lockedAt: null
                        },
                        $inc: { authVersion: 1 }
                    },
                    {
                        returnDocument: "after",
                        runValidators: true
                    }
                );

                updateQuery = querySession(updateQuery, session);
                const updatedUser = await updateQuery.lean();

                if (updatedUser) {
                    let resetTokenQuery = PasswordResetToken.deleteMany({
                        userId: ownerId
                    });

                    resetTokenQuery = querySession(resetTokenQuery, session);
                    await resetTokenQuery;
                }

                return updatedUser;
            };

            const user = await transactionRunner(deactivate);

            if (!user) {
                throw new RepositoryError(
                    "USER_NOT_FOUND",
                    "The requested user does not exist or is already deactivated.",
                    { status: 404 }
                );
            }

            return publicUser(user);
        } catch (error) {
            throw translateDatabaseError(error);
        }
    }

    return {
        findUserById,
        findUserByIdentifier,
        touchUser,
        findProduct,
        listProducts: listProductsForUser,
        listProductsForUser,
        addWishlistItem,
        getWishlist,
        moveToCart,
        markPurchased,
        removeWishlistItem,
        updateUserProfile,
        listPublicUsers,
        setUserStatus,
        registerUser,
        createResetToken,
        consumeResetToken,
        deactivateUser
    };
}
