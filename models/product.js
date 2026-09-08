const mongoose = require("mongoose");

const { Schema } = mongoose;

const productSchema = new Schema(
	{
		slug: {
			type: String,
			required: true,
			trim: true,
			lowercase: true,
			minlength: 2,
			maxlength: 80,
			match: [
				/^[a-z0-9]+(?:-[a-z0-9]+)*$/,
				"Product slug may contain lowercase words separated by hyphens.",
			],
		},
		name: {
			type: String,
			required: true,
			trim: true,
			minlength: 2,
			maxlength: 120,
		},
		category: {
			type: String,
			required: true,
			trim: true,
			minlength: 2,
			maxlength: 60,
		},
		description: {
			type: String,
			required: true,
			trim: true,
			minlength: 10,
			maxlength: 1000,
		},

		priceVnd: {
			type: Number,
			required: true,
			min: 0,
			max: 1_000_000_000,
			validate: {
				validator: Number.isSafeInteger,
				message: "Product price must be a whole number of VND.",
			},
		},
		image: {
			type: String,
			required: true,
			trim: true,
			maxlength: 500,
		},
		imageAlt: {
			type: String,
			required: true,
			trim: true,
			minlength: 3,
			maxlength: 200,
		},
		isActive: {
			type: Boolean,
			required: true,
			default: true,
		},
	},
	{
		timestamps: true,
		collection: "products",
	},
);

productSchema.index(
	{ slug: 1 },
	{ unique: true },
);

productSchema.index({
	isActive: 1,
	category: 1,
	name: 1,
});

productSchema.index({
	isActive: 1,
	priceVnd: 1,
});

productSchema.index({
	name: "text",
	category: "text",
	description: "text",
});

productSchema.set("toJSON", {
	virtuals: true,

	transform(document, result) {
		delete result.__v;
		return result;
	},
});

const Product =
	mongoose.models.Product ||
	mongoose.model("Product", productSchema);

module.exports = {
	Product,
	productSchema,
};
