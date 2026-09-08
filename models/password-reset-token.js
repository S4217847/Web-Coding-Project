const mongoose = require("mongoose");

const { Schema } = mongoose;

/*
 * A password-reset link contains a secret random token. MongoDB stores only
 * its SHA-256 hash, so a database leak does not expose a usable reset link.
 */
const passwordResetTokenSchema = new Schema(
	{
		userId: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
		tokenHash: {
			type: String,
			required: true,
			select: false,
			match: [
				/^[a-f0-9]{64}$/,
				"Reset token hash must be a SHA-256 digest.",
			],
		},
		expiresAt: {
			type: Date,
			required: true,
		},
		usedAt: {
			type: Date,
			default: null,
		},
	},
	{
		timestamps: {
			createdAt: true,
			updatedAt: false,
		},
		collection: "passwordresettokens",
	},
);

passwordResetTokenSchema.index(
	{
		userId: 1,
	},
	{
		unique: true,
	},
);

passwordResetTokenSchema.index(
	{
		tokenHash: 1,
	},
	{
		unique: true,
	},
);

passwordResetTokenSchema.index(
	{
		expiresAt: 1,
	},
	{
		expireAfterSeconds: 0,
	},
);

passwordResetTokenSchema.set("toJSON", {
	virtuals: true,

	transform(document, result) {
		delete result.tokenHash;
		delete result.__v;
		return result;
	},
});

const PasswordResetToken =
	mongoose.models.PasswordResetToken ||
	mongoose.model(
		"PasswordResetToken",
		passwordResetTokenSchema,
	);

module.exports = {
	PasswordResetToken,
	passwordResetTokenSchema,
};