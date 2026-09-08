import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
	after,
	before,
	test,
} from "node:test";

import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import {
	createMongoAccountRepository,
	RepositoryError,
} from "../src/mongo-repository.js";

import {
	createPasswordHash,
	verifyPassword,
} from "../src/passwords.js";

const require = createRequire(import.meta.url);

const {
	User,
	Product,
	WishlistEntry,
	Purchase,
	PasswordResetToken,
} = require("../../../models/index.js");

const models = {
	User,
	Product,
	WishlistEntry,
	Purchase,
	PasswordResetToken,
};

let replicaSet;
let repository;

before(async () => {
	replicaSet = await MongoMemoryReplSet.create({
		replSet: {
			count: 1,
			storageEngine: "wiredTiger",
		},
	});

	await mongoose.connect(
		replicaSet.getUri(),
		{ dbName: "rmit-connect-repository-test" },
	);

	/* Build unique indexes before testing duplicate-key behaviour. */
	await Promise.all([
        User.init(),
        Product.init(),
        WishlistEntry.init(),
        Purchase.init(),
    ]);

	repository = createMongoAccountRepository({ models });
});

after(async () => {
	if (mongoose.connection.readyState !== 0) {
		await mongoose.disconnect();
	}

	if (replicaSet) {
		await replicaSet.stop();
	}
});

test("the Account repository persists, retrieves, and protects a user", async () => {
	const passwordHash = createPasswordHash("StrongPass!26");

	const created = await repository.registerUser({
		username: "Dat.Pham",
		studentId: "s4221230",
		name: "Dat Pham",
		email: "DAT@RMIT.EDU.VN",
		passwordHash,
		description: "Student account",
		course: "Computer Science",

		/*
		 * These malicious privilege choices should be ignored by
		 * registerUser(), which always creates an active member.
		 */
		role: "admin",
		status: "locked",
	});

	assert.equal(created.username, "dat.pham");
	assert.equal(created.studentId, "S4221230");
	assert.equal(created.email, "dat@rmit.edu.vn");
	assert.equal(created.role, "member");
	assert.equal(created.status, "active");
	assert.equal(created.passwordHash, undefined);

	const ordinaryQuery = await User.findById(created.id).lean();
	assert.equal(ordinaryQuery.passwordHash, undefined);

	const loginRecord = await repository.findUserByIdentifier(
		"  DAT@RMIT.EDU.VN  ",
	);

	assert.equal(loginRecord.id, created.id);

	assert.equal(
		verifyPassword("StrongPass!26", loginRecord.passwordHash),
		true,
	);

	await assert.rejects(
		repository.registerUser({
			username: "another.student",
			studentId: "S4000001",
			name: "Another Student",
			email: "dat@rmit.edu.vn",
			passwordHash: createPasswordHash("AnotherPass!26"),
		}),
		(error) => {
			assert.equal(error instanceof RepositoryError, true);
			assert.equal(error.code, "EMAIL_IN_USE");
			assert.equal(error.status, 409);
			return true;
		},
	);

	const touched = await repository.touchUser(created.id, 0);

	assert.match(
		touched.lastActiveAt,
		/^\d{4}-\d{2}-\d{2}T/,
	);

	await User.updateOne(
		{ _id: created.id },
		{
			$set: { status: "locked" },
			$inc: { authVersion: 1 },
		},
	);

	assert.equal(
		await repository.touchUser(created.id, 0),
		null,
	);

	/*
	 * A new repository object can still retrieve the record. This proves
	 * the information was persisted rather than kept in repository memory.
	 */
	const restartedRepository =
		createMongoAccountRepository({ models });

	const persisted =
		await restartedRepository.findUserById(created.id);

	assert.equal(persisted.name, "Dat Pham");
	assert.equal(persisted.status, "locked");
});

test("the Wishlist repository provides owned CRUD and purchase history", async () => {
	const owner = await repository.registerUser({
		username: "wishlist.owner",
		studentId: "S4000101",
		name: "Wishlist Owner",
		email: "wishlist.owner@rmit.edu.vn",
		passwordHash: createPasswordHash("OwnerPass!26"),
	});

	const otherUser = await repository.registerUser({
		username: "other.member",
		studentId: "S4000102",
		name: "Other Member",
		email: "other.member@rmit.edu.vn",
		passwordHash: createPasswordHash("OtherPass!26"),
	});

	const [
		hoodie,
		bootcamp,
		photoWalk,
		archivedTour,
	] = await Product.create([
		{
			slug: "campus-hoodie",
			name: "Campus Hoodie",
			category: "Merchandise",
			description: "A comfortable hoodie carrying the RMIT Connect design.",
			priceVnd: 450000,
			image: "/images/rmit-hoodie.jpg",
			imageAlt: "Red RMIT campus hoodie",
			isActive: true,
		},
		{
			slug: "data-bootcamp",
			name: "Data Bootcamp",
			category: "Workshop",
			description: "A practical introductory data-analysis workshop.",
			priceVnd: 250000,
			image: "/images/data-bootcamp.jpg",
			imageAlt: "Students attending a data workshop",
			isActive: true,
		},
		{
			slug: "saigon-photo-walk",
			name: "Saigon Photo Walk",
			category: "Field Trip",
			description: "A guided photography walk through central Saigon.",
			priceVnd: 150000,
			image: "/images/saigonview.jpg",
			imageAlt: "Saigon skyline during a photo walk",
			isActive: true,
		},
		{
			slug: "archived-tour",
			name: "Archived Campus Tour",
			category: "Field Trip",
			description: "An older campus tour that is no longer available.",
			priceVnd: 100000,
			image: "/images/RMIT_campus.png",
			imageAlt: "RMIT campus buildings",
			isActive: false,
		},
	]);

	await WishlistEntry.create({
		userId: owner.id,
		productId: hoodie._id,
		status: "saved",
		quantity: 1,
	});

	await Purchase.create({
		userId: owner.id,
		productId: hoodie._id,
		productName: hoodie.name,
		unitPriceVnd: hoodie.priceVnd,
		quantity: 1,
		purchasedAt: new Date(),
	});

	const catalogue =
		await repository.listProductsForUser(
			owner.id,
			{ sort: "name-asc" },
		);

	assert.equal(catalogue.count, 3);

	assert.deepEqual(
		catalogue.products.map((product) => product.name),
		[
			"Campus Hoodie",
			"Data Bootcamp",
			"Saigon Photo Walk",
		],
	);

	const hoodieResult =
		catalogue.products.find(
			(product) =>
				product.id === "campus-hoodie",
		);

	assert.deepEqual(
		hoodieResult.stats,
		{
			wishlisted: 1,
			inCarts: 0,
			purchased: 1,
		},
	);

	assert.equal(hoodieResult.isWishlisted, true);

	const fieldTrips =
		await repository.listProductsForUser(
			owner.id,
			{ category: "field-trip" },
		);

	assert.deepEqual(
		fieldTrips.products.map((product) => product.id),
		["saigon-photo-walk"],
	);

	const added = await repository.addWishlistItem(
		owner.id,
		photoWalk.slug,
	);

	assert.equal(added.item.status, "saved");
	assert.equal(added.summary.saved, 2);

	await assert.rejects(
		repository.addWishlistItem(
			owner.id,
			photoWalk.slug,
		),
		(error) => {
			assert.equal(
				error.code,
				"DUPLICATE_WISHLIST_ITEM",
			);

			assert.equal(error.status, 409);
			return true;
		},
	);

	await assert.rejects(
		repository.moveToCart(
			otherUser.id,
			photoWalk.slug,
		),
		(error) => {
			assert.equal(
				error.code,
				"WISHLIST_ITEM_NOT_FOUND",
			);

			assert.equal(error.status, 404);
			return true;
		},
	);

	const moved = await repository.moveToCart(
		owner.id,
		photoWalk.slug,
	);

	assert.equal(moved.item.status, "cart");
	assert.equal(moved.summary.readyForCart, 1);

	const purchased = await repository.markPurchased(
		owner.id,
		photoWalk.slug,
	);

	assert.equal(
		purchased.purchase.productName,
		"Saigon Photo Walk",
	);

	assert.equal(
		purchased.purchase.unitPriceVnd,
		150000,
	);

	assert.equal(purchased.summary.readyForCart, 0);
	assert.equal(purchased.summary.purchased, 2);

	await Product.updateOne(
		{ _id: photoWalk._id },
		{
			$set: {
				name: "Renamed Photo Walk",
				priceVnd: 999999,
			},
		},
	);

	const wishlist =
		await repository.getWishlist(owner.id);

	const historicalPurchase =
		wishlist.purchases.find(
			(entry) =>
				entry.product.id ===
				"saigon-photo-walk",
		);

	assert.equal(
		historicalPurchase.product.name,
		"Saigon Photo Walk",
	);

	assert.equal(
		historicalPurchase.unitPriceVnd,
		150000,
	);

	await assert.rejects(
		repository.addWishlistItem(
			owner.id,
			archivedTour.slug,
		),
		(error) => {
			assert.equal(
				error.code,
				"PRODUCT_NOT_FOUND",
			);

			return true;
		},
	);

	const removed =
		await repository.removeWishlistItem(
			owner.id,
			hoodie.slug,
		);

	assert.equal(
		removed.removedProductId,
		"campus-hoodie",
	);

	assert.equal(removed.summary.saved, 0);

	/* Keep this variable intentionally used by the test data declaration. */
	assert.equal(bootcamp.isActive, true);
});
