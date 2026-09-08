require("dotenv").config();

const mongoose = require("mongoose");

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "MONGODB_URI is required. Copy .env.example to .env and add the authorized Atlas connection string.",
    );
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME || "rmit_connect",
    serverSelectionTimeoutMS: 10_000,
    autoIndex: true,
  });

  /* Ensure declared unique/query/TTL indexes exist before accepting requests. */
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );

  await mongoose.connection.db.admin().ping();
  console.log(
    `Connected to MongoDB database ${mongoose.connection.name}`,
  );

  return mongoose.connection;
}

module.exports = { connectDatabase };
