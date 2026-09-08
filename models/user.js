const mongoose = require("mongoose");

const { Schema } = mongoose;

/*
 * One shared User collection supports Account, Administration, Forum,
 * Blog, Review, and Wishlist functionality.
 */
const userSchema = new Schema(
	{
		username: {
			type: String,
			required: true,
			trim: true,
			lowercase: true,
			minlength: 3,
			maxlength: 50,
			match: [
				/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/,
				"Username may contain letters, numbers, dots, underscores, and hyphens.",
			],
		},
		studentId: {
			type: String,
			required: true,
			trim: true,
			uppercase: true,
			match: [
				/^S\d{7}$/,
				"Student ID must use the format S1234567.",
			],
		},
		name: {
			type: String,
			required: true,
			trim: true,
			minlength: 2,
			maxlength: 80,
		},
		email: {
			type: String,
			required: true,
			trim: true,
			lowercase: true,
			maxlength: 120,
			match: [
				/^[^\s@]+@[^\s@]+\.[^\s@]+$/,
				"Email must be a valid email address.",
			],
		},

		/*
		 * Only a bcrypt hash is stored. select:false keeps it out of
		 * ordinary queries; login code must request it explicitly.
		 */
		passwordHash: {
			type: String,
			required: true,
			select: false,
			minlength: 60,
			maxlength: 60,
			match: [
				/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/,
				"Password must be stored as a bcrypt hash.",
			],
		},
		description: {
			type: String,
			trim: true,
			maxlength: 300,
			default: "",
		},
		avatarUrl: {
			type: String,
			trim: true,
			maxlength: 500,
			default: "/images/user_icon.png",
		},
		course: {
			type: String,
			trim: true,
			maxlength: 120,
			default: "",
		},
		role: {
			type: String,
			required: true,
			enum: ["member", "admin"],
			default: "member",
		},
		status: {
			type: String,
			required: true,
			enum: [
				"active",
				"locked",
				"deactivated",
			],
			default: "active",
		},

		/*
		 * Increasing authVersion will later invalidate sessions that were
		 * created before a password or account-status change.
		 */
		authVersion: {
			type: Number,
			required: true,
			min: 0,
			default: 0,
			validate: {
				validator: Number.isSafeInteger,
				message: "Authentication version must be a non-negative integer.",
			},
		},
		lastActiveAt: {
			type: Date,
			default: null,
		},
		lockedAt: {
			type: Date,
			default: null,
		},
		deactivatedAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: true,
		collection: "users",
	},
);

/* Fast unique account lookups. */
userSchema.index(
	{ username: 1 },
	{ unique: true },
);

userSchema.index(
	{ studentId: 1 },
	{ unique: true },
);

userSchema.index(
	{ email: 1 },
	{ unique: true },
);

/* Administration filtering and sorting. */
userSchema.index({
	status: 1,
	name: 1,
	username: 1,
});

userSchema.index({
	role: 1,
});

/* Administration text search. */
userSchema.index({
	name: "text",
	username: "text",
	studentId: "text",
	email: "text",
});

userSchema.set("toJSON", {
	virtuals: true,

	transform(document, result) {
		delete result.passwordHash;
		delete result.__v;
		return result;
	},
});

const User =
	mongoose.models.User ||
	mongoose.model(
		"User",
		userSchema,
	);

module.exports = {
	User,
	userSchema,
};
