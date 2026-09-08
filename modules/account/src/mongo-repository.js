/**
 * MongoDB persistence for the shared Account module.
 *
 * Routes deal with HTTP requests and sessions. This repository deals with
 * database queries and converts Mongoose records into plain client objects.
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
	"updatedAt",
];

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

/** A predictable error format that Express routes can later turn into JSON. */
export class RepositoryError extends Error {
	constructor(
		code,
		message,
		{
			status = 500,
			fields,
			cause,
		} = {},
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
	const {
		User,
		Product,
		WishlistEntry,
		Purchase,
		PasswordResetToken,
	} = require("../../../models/index.js");

	return {
		User,
		Product,
		WishlistEntry,
		Purchase,
		PasswordResetToken,
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
		id: stringId(user._id ?? user.id),
	};

	for (const field of PUBLIC_USER_FIELDS) {
		if (field.endsWith("At")) {
			output[field] = dateString(user[field]);
		} else if (user[field] !== undefined) {
			output[field] = user[field];
		}
	}

	/* Assessment 2's profile client still checks this transport-only field. */
	output.avatarDataUrl = "";

	return output;
}

function internalUser(record) {
	const output = publicUser(record);
	const source = plainRecord(record);

	if (output && source?.passwordHash) {
		output.passwordHash = source.passwordHash;
	}

	if (output) {
		output.authVersion = source?.authVersion ?? 0;
	}

	return output;
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
				detail?.message ?? "This value is invalid.",
			],
		),
	);
}

function duplicateFields(error) {
	const keys = Object.keys(
		error.keyPattern ?? error.keyValue ?? {},
	);

	if (keys.length > 0) {
		return keys;
	}

	const match = cleanString(error.message).match(
		/index:\s+([^\s]+)\s+dup key/i,
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
                    cause: error,
                },
            );
        }

		const duplicates = {
			username: [
				"USERNAME_IN_USE",
				"That username is already registered.",
			],
			email: [
				"EMAIL_IN_USE",
				"That email address is already registered.",
			],
			studentId: [
				"STUDENT_ID_IN_USE",
				"That student ID is already registered.",
			],
		};

		const [code, message] =
			duplicates[field] ?? [
				"DUPLICATE_RECORD",
				"A record with these details already exists.",
			];

		return new RepositoryError(
			code,
			message,
			{
				status: 409,
				fields: field
					? { [field]: message }
					: undefined,
				cause: error,
			},
		);
	}

	if (error?.name === "ValidationError") {
		return new RepositoryError(
			"VALIDATION_ERROR",
			"Correct the highlighted fields.",
			{
				status: 422,
				fields: validationFields(error),
				cause: error,
			},
		);
	}

	if (error?.name === "CastError") {
		return new RepositoryError(
			"INVALID_REFERENCE",
			"The requested record identifier is invalid.",
			{
				status: 422,
				cause: error,
			},
		);
	}

	return new RepositoryError(
		"DATABASE_ERROR",
		"The database operation could not be completed.",
		{
			status: 500,
			cause: error,
		},
	);
}

/**
 * Tests may inject models. The real application loads the shared root models.
 */
export function createMongoAccountRepository(options = {}) {
	const models = options.models ?? loadDefaultModels();

    const {
        User,
        Product,
        WishlistEntry,
        Purchase,
        PasswordResetToken,
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
                    },
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
				{ status: 404 },
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
						{ email: value },
					],
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
		 * Change the timestamp only if the user is still active and their
		 * password/status version has not changed since authentication.
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
						authVersion: versionFilter,
					},
					{
						$set: {
							lastActiveAt: new Date(),
							authVersion: version,
						},
					},
					{
						returnDocument: "after",
						runValidators: true,
					},
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

	async function registerUser(values) {
		/* Public registration may never choose its own role or account status. */
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
			status: "active",
		};

		try {
			const user = await User.create(record);
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
        registerUser,
    };
}