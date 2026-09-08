const mongoose = require("mongoose");

const { Schema } = mongoose;

/*
 * Purchases are history, so the same user may buy the same product repeatedly.
 * The name and price are snapshots that preserve the original receipt.
 */
const purchaseSchema = new Schema(
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
		productName: {
			type: String,
			required: true,
			trim: true,
			minlength: 2,
			maxlength: 120,
		},
		unitPriceVnd: {
			type: Number,
			required: true,
			min: 0,
			max: 1_000_000_000,
			validate: {
				validator: Number.isSafeInteger,
				message: "Purchase price must be a whole number of VND.",
			},
		},
		quantity: {
			type: Number,
			required: true,
			min: 1,
			max: 99,
			default: 1,
			validate: {
				validator: Number.isSafeInteger,
				message: "Purchase quantity must be a whole number.",
			},
		},
		purchasedAt: {
			type: Date,
			required: true,
			default: Date.now,
		},
	},
	{
		timestamps: {
			createdAt: true,
			updatedAt: false,
		},
		collection: "purchases",
	},
);

purchaseSchema.index({
	userId: 1,
	purchasedAt: -1,
});

purchaseSchema.index({
	productId: 1,
	purchasedAt: -1,
});

purchaseSchema.set("toJSON", {
	virtuals: true,

	transform(document, result) {
		delete result.__v;
		return result;
	},
});

const Purchase =
	mongoose.models.Purchase ||
	mongoose.model(
		"Purchase",
		purchaseSchema,
	);

module.exports = {
	Purchase,
	purchaseSchema,
};