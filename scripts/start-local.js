/**
 * Starts the complete application against a temporary local MongoDB replica set.
 *
 * A replica set is used because the account/wishlist repository performs MongoDB
 * transactions. Data is seeded on every launch and is removed when this process
 * stops, which makes this command safe for demonstrations and local marking.
 */
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

let replicaSet = null;
let httpServer = null;
let startupPromise = null;
let shutdownPromise = null;
let shutdownRequested = false;

function getPort() {
  const rawPort = String(process.env.PORT || "3000").trim();
  const port = Number(rawPort);

  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port > 65535) {
    throw new Error("PORT must be a whole number from 0 to 65535.");
  }

  return port;
}

function closeHttpServer() {
  if (!httpServer) return Promise.resolve();

  return new Promise((resolve, reject) => {
    httpServer.close((error) => {
      httpServer = null;
      if (error) reject(error);
      else resolve();
    });

    // Do not wait for an idle browser keep-alive connection during shutdown.
    httpServer.closeIdleConnections?.();
  });
}

async function shutdown(reason, exitCode = 0) {
  if (shutdownPromise) return shutdownPromise;

  shutdownRequested = true;
  shutdownPromise = (async () => {
    console.log(`\nStopping the local demo (${reason})...`);
    const cleanupErrors = [];

    try {
      await closeHttpServer();
    } catch (error) {
      cleanupErrors.push(error);
    }

    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } catch (error) {
      cleanupErrors.push(error);
    }

    try {
      if (replicaSet) {
        await replicaSet.stop();
        replicaSet = null;
      }
    } catch (error) {
      cleanupErrors.push(error);
    }

    if (cleanupErrors.length > 0) {
      console.error("The demo stopped with cleanup errors:");
      cleanupErrors.forEach((error) => console.error(error));
      process.exitCode = 1;
      return;
    }

    process.exitCode = exitCode;
    console.log("Local demo stopped cleanly.");
  })();

  return shutdownPromise;
}

async function startLocalDemo() {
  const port = getPort();

  console.log("Starting a temporary local MongoDB replica set...");
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });

  if (shutdownRequested) return;

  /*
   * Set every application setting before loading database.js or index.js.
   * This command intentionally ignores an Atlas URI from .env so that it can
   * never modify the team's shared database.
   */
  process.env.MONGODB_URI = replicaSet.getUri();
  process.env.MONGODB_DB_NAME =
    process.env.LOCAL_MONGODB_DB_NAME || "rmit_connect_local";
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
  process.env.NODE_ENV = "development";

  const { connectDatabase } = require("../database");
  const { seedDatabase } = require("./seed");
  const { startServer } = require("../index");

  await connectDatabase();
  if (shutdownRequested) return;

  // The seed uses upserts, so rerunning it never creates duplicate demo data.
  await seedDatabase({ connect: false });
  if (shutdownRequested) return;

  /*
   * startServer() calls connectDatabase() as a safety measure. Because Mongoose
   * is already connected, connectDatabase() returns the existing connection
   * instead of opening a second one.
   */
  httpServer = await startServer(port);

  const address = httpServer.address();
  const activePort = typeof address === "object" ? address.port : port;
  console.log("Temporary sample data will be deleted when this command stops.");
  console.log(`Open http://localhost:${activePort} in your browser.`);
  console.log("Press Ctrl+C to stop the web server and local database.");
}

function handleSignal(signal) {
  if (shutdownRequested) {
    console.error("A second stop signal was received; exiting immediately.");
    process.exit(1);
  }

  shutdownRequested = true;

  // Wait for the current startup operation to settle before cleaning it up.
  void startupPromise
    .catch(() => {})
    .then(() => shutdown(signal));
}

process.on("SIGINT", () => handleSignal("SIGINT"));
process.on("SIGTERM", () => handleSignal("SIGTERM"));

startupPromise = startLocalDemo();
startupPromise.catch(async (error) => {
  console.error("Could not start the local demo:", error);
  await shutdown("startup failure", 1);
});
