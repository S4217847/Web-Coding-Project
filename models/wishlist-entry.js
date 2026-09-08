const mongoose = require("mongoose");

const { Schema } = mongoose;

/*
 * One WishlistEntry connects one User with one Product.
 * Its status records whether the item is saved or in the cart.
 */
const wishlistEntrySchema = new Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		productId: {
			type: Schema.Types.ObjectId,
			ref: "Product",
			required: true,
		},
		status: {
			type: String,
			required: true,
			enum: ["saved", "cart"],
			default: "saved",
		},
		quantity: {
			type: Number,
			required: true,
			min: 1,
			max: 99,
			default: 1,
			validate: {
				validator: Number.isSafeInteger,
				message: "Wishlist quantity must be a whole number.",
			},
		},
	},
	{
		timestamps: true,
		collection: "wishlistentries",
	},
);

wishlistEntrySchema.index(
	{
		userId: 1,
		productId: 1,
	},
	{
		unique: true,
	},
);

wishlistEntrySchema.index({
	userId: 1,
	status: 1,
	updatedAt: -1,
});

wishlistEntrySchema.index({
	productId: 1,
	status: 1,
});

wishlistEntrySchema.set("toJSON", {
	virtuals: true,

	transform(document, result) {
		delete result.__v;
		return result;
	},
});

const WishlistEntry =
	mongoose.models.WishlistEntry ||
	mongoose.model(
		"WishlistEntry",
		wishlistEntrySchema,
	);

module.exports = {
	WishlistEntry,
	wishlistEntrySchema,
};
