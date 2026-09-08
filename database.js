require("dotenv").config();

const mongoose = require("mongoose");

/*
 * Loading the central model file registers every schema before MongoDB creates
 * their unique, query, text-search, and expiry indexes.
 */
require("./models");

async function connectDatabase() {
	const uri =
		process.env.MONGODB_URI;

	if (!uri) {
		throw new Error(
			"MONGODB_URI is required. Copy .env.example to .env and add the authorized Atlas connection string.",
		);
	}

	if (
		mongoose.connection.readyState === 1
	) {
		return mongoose.connection;
	}

	await mongoose.connect(
		uri,
		{
			dbName:
				process.env.MONGODB_DB_NAME ||
				"rmit_connect",

			serverSelectionTimeoutMS:
				10_000,

			autoIndex: true,
		},
	);

	/*
	 * Wait for all declared indexes before the server begins accepting
	 * requests. Startup therefore exposes invalid indexes immediately.
	 */
	await Promise.all(
		Object.values(
			mongoose.models,
		).map(
			(model) =>
				model.init(),
		),
	);

	await mongoose.connection
		.db
		.admin()
		.ping();

	console.log(
		`Connected to MongoDB database ${mongoose.connection.name}`,
	);

	return mongoose.connection;
}

module.exports = {
	connectDatabase,
};
