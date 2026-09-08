/*
 * Central exports keep repository, route, and seed imports short
 * and consistent.
 */
const { User } =
	require("./user");

const { Discussion } =
	require("./discussion");

const { Reply } =
	require("./reply");

const { Product } =
	require("./product");

const { WishlistEntry } =
	require("./wishlist-entry");

const { Purchase } =
	require("./purchase");

const { PasswordResetToken } =
	require("./password-reset-token");

module.exports = {
	User,
	Discussion,
	Reply,
	Product,
	WishlistEntry,
	Purchase,
	PasswordResetToken,
};
