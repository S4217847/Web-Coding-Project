const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { test } = require("node:test");

const expectedTestDatabase = "rmit_connect_a3_test";

class BrowserSession {
  constructor(getBaseUrl) {
    this.getBaseUrl = getBaseUrl;
    this.cookie = "";
  }

  async request(
    route,
    { method = "GET", json, form, headers = {} } = {},
  ) {
    const requestHeaders = { ...headers };
    let body;

    if (json !== undefined) {
      requestHeaders["Content-Type"] = "application/json";
      body = JSON.stringify(json);
    }

    if (form !== undefined) {
      requestHeaders["Content-Type"] =
        "application/x-www-form-urlencoded";
      body = new URLSearchParams(form).toString();
    }

    if (this.cookie) {
      requestHeaders.Cookie = this.cookie;
    }

    const response = await fetch(this.getBaseUrl() + route, {
      method: method,
      headers: requestHeaders,
      body: body,
      redirect: "manual",
    });
    const setCookie = response.headers.get("set-cookie");

    if (setCookie) {
      this.cookie = setCookie.split(";", 1)[0];
    }

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    return {
      status: response.status,
      headers: response.headers,
      payload: payload,
    };
  }

  login(identity, password) {
    return this.request("/api/session", {
      method: "POST",
      json: {
        identity: identity,
        password: password,
      },
    });
  }

  verifyRecovery(email, recoveryPassword) {
    return this.request("/forgot-password", {
      method: "POST",
      form: {
        "reset-email": email,
        "recovery-password": recoveryPassword,
      },
    });
  }

  resetPassword(newPassword, confirmPassword = newPassword) {
    return this.request("/reset-password", {
      method: "POST",
      form: {
        "new-password": newPassword,
        "confirm-password": confirmPassword,
      },
    });
  }
}

function dataOf(result) {
  assert.equal(result.payload.success, true);
  return result.payload.data;
}

function errorOf(result) {
  assert.equal(result.payload.success, false);
  return result.payload.error;
}

function closeServer(server) {
  if (!server || !server.listening) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test(
  "MongoDB recovery passwords are verified, limited, consumed, and persistent",
  { timeout: 90000 },
  async () => {
    assert.ok(
      process.env.MONGODB_TEST_URI,
      "MONGODB_TEST_URI is required for the isolated recovery test.",
    );

    process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "recovery-review-test-session-secret";

    const mongoose = require("mongoose");
    const { User } = require("../models/user");
    const { startServer } = require("../index");
    const accountData = await import("../modules/account/src/data.js");
    const passwordTools = await import(
      "../modules/account/src/passwords.js"
    );

    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const makeSecret = (label) => label + suffix + "aA9!";
    const memberPassword = makeSecret("M");
    const profilePassword = makeSecret("P");
    const databasePassword = makeSecret("D");
    const finalPassword = makeSecret("F");
    const recoveryPassword = makeSecret("Recovery");
    const changedRecoveryPassword = makeSecret("ChangedRecovery");
    const wrongRecoveryPassword = makeSecret("WrongRecovery");
    const legacyPassword = makeSecret("Legacy") + "x".repeat(70);
    const legacyRecoveryPassword = makeSecret("LegacyRecovery");
    const originalEmail = "recovery." + suffix + "@rmit.edu.vn";
    const changedEmail = "recovered." + suffix + "@example.com";
    const member = {
      id: "recovery-member-" + suffix,
      username: "recovery.member." + suffix,
      studentId: "RCV" + suffix.toUpperCase(),
      name: "Recovery Review Member",
      email: originalEmail,
      description: "Isolated recovery password test member.",
      avatarUrl: "",
      role: "member",
      status: "active",
      lastActiveAt: null,
      passwordHash: passwordTools.createPasswordHash(memberPassword),
    };
    const legacyMember = {
      id: "legacy-recovery-member-" + suffix,
      username: "legacy.recovery." + suffix,
      studentId: "LGC" + suffix.toUpperCase(),
      name: "Legacy Recovery Review Member",
      email: "legacy.recovery." + suffix + "@rmit.edu.vn",
      description: "Existing password compatibility test member.",
      avatarUrl: "",
      role: "member",
      status: "active",
      lastActiveAt: null,
      passwordHash: passwordTools.createPasswordHash(legacyPassword),
    };

    let server;
    let baseUrl = "";
    const createdUserIds = [];

    function addReviewUsersToMemory() {
      accountData.dataStore.users.push(
        { ...member, status: "active" },
        { ...legacyMember, status: "active" },
      );
    }

    async function startReviewServer() {
      server = await startServer(0);
      const address = server.address();
      assert.equal(typeof address, "object");
      baseUrl = "http://127.0.0.1:" + address.port;
    }

    async function createDatabaseUser(user) {
      const databaseUser = new User({
        username: user.username,
        studentId: user.studentId,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        description: user.description,
        avatarUrl: "/images/user_icon.png",
        course: "Recovery review test course",
        role: user.role,
        status: "active",
        lastActiveAt: null,
        lockedAt: null,
        deactivatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await databaseUser.save();
      createdUserIds.push(databaseUser._id);
    }

    try {
      accountData.resetData();
      addReviewUsersToMemory();
      await startReviewServer();

      assert.equal(
        mongoose.connection.name,
        expectedTestDatabase,
        "Refusing to create test data outside the approved test database.",
      );

      await createDatabaseUser(member);
      await createDatabaseUser(legacyMember);

      const anonymous = new BrowserSession(() => baseUrl);
      const directResetPage = await anonymous.request("/reset-password");
      assert.equal(directResetPage.status, 302);
      assert.equal(
        directResetPage.headers.get("location"),
        "/forgot-password?reset=expired",
      );

      const directReset = await anonymous.resetPassword(finalPassword);
      assert.equal(directReset.status, 302);
      assert.equal(
        directReset.headers.get("location"),
        "/forgot-password?reset=expired",
      );

      const anonymousProfile = await anonymous.request("/api/profile", {
        method: "PATCH",
        json: {
          currentPassword: memberPassword,
          recoveryPassword: recoveryPassword,
          confirmRecoveryPassword: recoveryPassword,
        },
      });
      assert.equal(anonymousProfile.status, 401);

      const memberBrowser = new BrowserSession(() => baseUrl);
      assert.equal(
        (await memberBrowser.login(member.username, memberPassword)).status,
        201,
      );

      const wrongCurrentPassword = await memberBrowser.request(
        "/api/profile",
        {
          method: "PATCH",
          json: {
            currentPassword: profilePassword,
            recoveryPassword: recoveryPassword,
            confirmRecoveryPassword: recoveryPassword,
          },
        },
      );
      assert.equal(wrongCurrentPassword.status, 422);
      assert.equal(
        errorOf(wrongCurrentPassword).code,
        "INVALID_CURRENT_PASSWORD",
      );

      const mismatchedRecovery = await memberBrowser.request(
        "/api/profile",
        {
          method: "PATCH",
          json: {
            currentPassword: memberPassword,
            recoveryPassword: recoveryPassword,
            confirmRecoveryPassword: changedRecoveryPassword,
          },
        },
      );
      assert.equal(mismatchedRecovery.status, 422);
      assert.ok(
        errorOf(mismatchedRecovery).fields.confirmRecoveryPassword,
      );

      const invalidRecovery = await memberBrowser.request("/api/profile", {
        method: "PATCH",
        json: {
          currentPassword: memberPassword,
          recoveryPassword: recoveryPassword + " space",
          confirmRecoveryPassword: recoveryPassword + " space",
        },
      });
      assert.equal(invalidRecovery.status, 422);

      const sameAsLogin = await memberBrowser.request("/api/profile", {
        method: "PATCH",
        json: {
          currentPassword: memberPassword,
          recoveryPassword: memberPassword,
          confirmRecoveryPassword: memberPassword,
        },
      });
      assert.equal(sameAsLogin.status, 422);
      assert.equal(errorOf(sameAsLogin).code, "RECOVERY_PASSWORD_REUSED");

      const setRecovery = await memberBrowser.request("/api/profile", {
        method: "PATCH",
        json: {
          email: changedEmail,
          currentPassword: memberPassword,
          recoveryPassword: recoveryPassword,
          confirmRecoveryPassword: recoveryPassword,
        },
      });
      assert.equal(setRecovery.status, 200);
      assert.equal(
        dataOf(setRecovery).profile.recoveryConfigured,
        true,
      );
      assert.equal(
        Object.hasOwn(
          dataOf(setRecovery).profile,
          "recoveryPasswordHash",
        ),
        false,
      );

      let databaseMember = await User.findOne({
        studentId: member.studentId,
      });
      assert.equal(databaseMember.email, changedEmail);
      assert.ok(databaseMember.recoveryPasswordHash.startsWith("$2"));
      assert.notEqual(databaseMember.recoveryPasswordHash, recoveryPassword);
      assert.ok(databaseMember.recoveryPasswordSetAt);

      assert.equal(
        (
          await new BrowserSession(() => baseUrl).verifyRecovery(
            originalEmail,
            recoveryPassword,
          )
        ).status,
        401,
      );
      assert.equal(
        (
          await new BrowserSession(() => baseUrl).verifyRecovery(
            "not-a-complete-email",
            recoveryPassword,
          )
        ).status,
        422,
      );
      assert.equal(
        (
          await new BrowserSession(() => baseUrl).verifyRecovery(
            "a".repeat(110) + "@example.com",
            recoveryPassword,
          )
        ).status,
        422,
      );

      assert.equal(
        (await new BrowserSession(() => baseUrl).login(
          originalEmail,
          memberPassword,
        )).status,
        401,
      );
      assert.equal(
        (await new BrowserSession(() => baseUrl).login(
          changedEmail,
          memberPassword,
        )).status,
        201,
      );

      const invalidNewPassword = await memberBrowser.request(
        "/api/profile",
        {
          method: "PATCH",
          json: {
            currentPassword: memberPassword,
            newPassword: "x".repeat(65) + "Aa9!",
          },
        },
      );
      assert.equal(invalidNewPassword.status, 422);

      const memoryMember = accountData.dataStore.users.find(
        (user) => user.studentId === member.studentId,
      );
      const databasePasswordHashBeforeReuse = databaseMember.passwordHash;
      const databaseRecoveryHashBeforeReuse =
        databaseMember.recoveryPasswordHash;
      const memoryPasswordHashBeforeReuse = memoryMember.passwordHash;

      const reuseStoredRecovery = await memberBrowser.request(
        "/api/profile",
        {
          method: "PATCH",
          json: {
            currentPassword: memberPassword,
            newPassword: recoveryPassword,
          },
        },
      );
      assert.equal(reuseStoredRecovery.status, 422);
      assert.equal(
        errorOf(reuseStoredRecovery).code,
        "LOGIN_PASSWORD_REUSES_RECOVERY",
      );

      databaseMember = await User.findOne({ studentId: member.studentId });
      assert.equal(
        databaseMember.passwordHash,
        databasePasswordHashBeforeReuse,
      );
      assert.equal(
        databaseMember.recoveryPasswordHash,
        databaseRecoveryHashBeforeReuse,
      );
      assert.equal(memoryMember.passwordHash, memoryPasswordHashBeforeReuse);

      const changeProfilePassword = await memberBrowser.request(
        "/api/profile",
        {
          method: "PATCH",
          json: {
            currentPassword: memberPassword,
            newPassword: profilePassword,
          },
        },
      );
      assert.equal(changeProfilePassword.status, 200);
      databaseMember = await User.findOne({ studentId: member.studentId });
      assert.equal(
        passwordTools.verifyPassword(
          profilePassword,
          databaseMember.passwordHash,
        ),
        true,
      );
      assert.ok(databaseMember.passwordChangedAt);

      const simultaneousPasswordBefore = databaseMember.passwordHash;
      const simultaneousRecoveryBefore = databaseMember.recoveryPasswordHash;
      const simultaneousBrowser = new BrowserSession(() => baseUrl);
      assert.equal(
        (await simultaneousBrowser.login(changedEmail, profilePassword)).status,
        201,
      );
      const simultaneousDuplicate = await simultaneousBrowser.request(
        "/api/profile",
        {
          method: "PATCH",
          json: {
            currentPassword: profilePassword,
            newPassword: changedRecoveryPassword,
            recoveryPassword: changedRecoveryPassword,
            confirmRecoveryPassword: changedRecoveryPassword,
          },
        },
      );
      assert.equal(simultaneousDuplicate.status, 422);
      assert.equal(
        errorOf(simultaneousDuplicate).code,
        "RECOVERY_PASSWORD_REUSED",
      );
      databaseMember = await User.findOne({ studentId: member.studentId });
      assert.equal(databaseMember.passwordHash, simultaneousPasswordBefore);
      assert.equal(
        databaseMember.recoveryPasswordHash,
        simultaneousRecoveryBefore,
      );
      assert.equal(memoryMember.passwordHash, simultaneousPasswordBefore);

      assert.equal(
        (
          await new BrowserSession(() => baseUrl).verifyRecovery(
            changedEmail,
            recoveryPassword,
          )
        ).status,
        302,
      );

      assert.equal(
        (await new BrowserSession(() => baseUrl).login(
          changedEmail,
          memberPassword,
        )).status,
        401,
      );
      assert.equal(
        (await new BrowserSession(() => baseUrl).login(
          changedEmail,
          profilePassword,
        )).status,
        201,
      );

      const legacyBrowser = new BrowserSession(() => baseUrl);
      assert.equal(
        (
          await legacyBrowser.login(
            legacyMember.username,
            legacyPassword,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await legacyBrowser.request("/api/profile", {
            method: "PATCH",
            json: {
              currentPassword: legacyPassword,
              recoveryPassword: legacyRecoveryPassword,
              confirmRecoveryPassword: legacyRecoveryPassword,
            },
          })
        ).status,
        200,
      );

      assert.equal(
        (
          await new BrowserSession(() => baseUrl).verifyRecovery(
            legacyMember.email,
            legacyRecoveryPassword,
          )
        ).status,
        302,
      );

      const concurrentFailures = await Promise.all(
        Array.from({ length: 10 }, () =>
          new BrowserSession(() => baseUrl).verifyRecovery(
            changedEmail,
            wrongRecoveryPassword,
          ),
        ),
      );
      assert.deepEqual(
        concurrentFailures.map((result) => result.status),
        Array(10).fill(401),
      );

      databaseMember = await User.findOne({ studentId: member.studentId });
      assert.equal(databaseMember.status, "active");
      assert.equal(databaseMember.recoveryFailedAttempts, 5);
      assert.ok(databaseMember.recoveryBlockedUntil > new Date());

      assert.equal(
        (
          await new BrowserSession(() => baseUrl).verifyRecovery(
            changedEmail,
            recoveryPassword,
          )
        ).status,
        401,
      );

      const boundaryStart = new Date(Date.now() - 14 * 60 * 1000);
      await User.updateOne(
        { _id: databaseMember._id },
        {
          $set: {
            recoveryFailedAttempts: 4,
            recoveryAttemptWindowStartedAt: boundaryStart,
            recoveryBlockedUntil: null,
          },
        },
      );

      assert.equal(
        (
          await new BrowserSession(() => baseUrl).verifyRecovery(
            changedEmail,
            wrongRecoveryPassword,
          )
        ).status,
        401,
      );

      databaseMember = await User.findOne({ studentId: member.studentId });
      assert.equal(databaseMember.recoveryFailedAttempts, 5);
      const boundaryBlockedUntil = databaseMember.recoveryBlockedUntil;
      assert.ok(boundaryBlockedUntil > new Date());

      await User.updateOne(
        { _id: databaseMember._id },
        {
          $set: {
            recoveryAttemptWindowStartedAt: new Date(
              Date.now() - 16 * 60 * 1000,
            ),
          },
        },
      );

      assert.equal(
        (
          await new BrowserSession(() => baseUrl).verifyRecovery(
            changedEmail,
            recoveryPassword,
          )
        ).status,
        401,
      );

      databaseMember = await User.findOne({ studentId: member.studentId });
      assert.equal(databaseMember.recoveryFailedAttempts, 5);
      assert.equal(
        databaseMember.recoveryBlockedUntil.getTime(),
        boundaryBlockedUntil.getTime(),
      );

      const expiredWindow = new Date(Date.now() - 30 * 60 * 1000);
      await User.updateOne(
        { _id: databaseMember._id },
        {
          $set: {
            recoveryAttemptWindowStartedAt: expiredWindow,
            recoveryBlockedUntil: new Date(Date.now() - 1),
          },
        },
      );

      const expiryBrowser = new BrowserSession(() => baseUrl);
      assert.equal(
        (
          await expiryBrowser.verifyRecovery(
            changedEmail,
            recoveryPassword,
          )
        ).status,
        302,
      );

      const realDateNow = Date.now;

      try {
        Date.now = () => realDateNow() + 11 * 60 * 1000;
        const expiredReset = await expiryBrowser.request("/reset-password");
        assert.equal(expiredReset.status, 302);
        assert.equal(
          expiredReset.headers.get("location"),
          "/forgot-password?reset=expired",
        );
      } finally {
        Date.now = realDateNow;
      }

      const lockBrowser = new BrowserSession(() => baseUrl);
      assert.equal(
        (
          await lockBrowser.verifyRecovery(
            changedEmail,
            recoveryPassword,
          )
        ).status,
        302,
      );
      const lockedAt = new Date();
      await User.updateOne(
        { studentId: member.studentId },
        { $set: { status: "locked", lockedAt: lockedAt } },
      );
      assert.equal((await lockBrowser.resetPassword(finalPassword)).status, 302);
      await User.updateOne(
        { studentId: member.studentId },
        { $set: { status: "active" } },
      );

      const passwordChangeBrowser = new BrowserSession(() => baseUrl);
      assert.equal(
        (
          await passwordChangeBrowser.verifyRecovery(
            changedEmail,
            recoveryPassword,
          )
        ).status,
        302,
      );
      const directPasswordChangedAt = new Date();
      await User.updateOne(
        { studentId: member.studentId },
        {
          $set: {
            passwordHash:
              passwordTools.createPasswordHash(databasePassword),
            passwordChangedAt: directPasswordChangedAt,
          },
        },
      );
      assert.equal(
        (await passwordChangeBrowser.resetPassword(finalPassword)).status,
        302,
      );

      const recoveryChangeBrowser = new BrowserSession(() => baseUrl);
      assert.equal(
        (
          await recoveryChangeBrowser.verifyRecovery(
            changedEmail,
            recoveryPassword,
          )
        ).status,
        302,
      );
      await User.updateOne(
        { studentId: member.studentId },
        {
          $set: {
            recoveryPasswordHash:
              passwordTools.createPasswordHash(changedRecoveryPassword),
            recoveryPasswordSetAt: new Date(),
          },
        },
      );
      assert.equal(
        (await recoveryChangeBrowser.resetPassword(finalPassword)).status,
        302,
      );

      const resetBrowser = new BrowserSession(() => baseUrl);
      assert.equal(
        (
          await resetBrowser.verifyRecovery(
            changedEmail,
            changedRecoveryPassword,
          )
        ).status,
        302,
      );
      assert.equal(
        (
          await resetBrowser.resetPassword(
            finalPassword,
            databasePassword,
          )
        ).status,
        422,
      );
      assert.equal(
        (await resetBrowser.resetPassword(changedRecoveryPassword)).status,
        422,
      );

      databaseMember = await User.findOne({ studentId: member.studentId });
      const passwordBeforeFailure = databaseMember.passwordHash;
      const recoveryBeforeFailure = databaseMember.recoveryPasswordHash;
      const originalFindOneAndUpdate = User.findOneAndUpdate;
      const originalConsoleError = console.error;

      User.findOneAndUpdate = async function (filter, update, ...args) {
        if (update?.$unset?.recoveryPasswordHash) {
          throw new Error("Intentional isolated recovery write failure");
        }

        return originalFindOneAndUpdate.call(this, filter, update, ...args);
      };
      console.error = function (error) {
        if (
          error instanceof Error &&
          error.message === "Intentional isolated recovery write failure"
        ) {
          return;
        }

        originalConsoleError(error);
      };

      let failedReset;

      try {
        failedReset = await resetBrowser.resetPassword(finalPassword);
      } finally {
        User.findOneAndUpdate = originalFindOneAndUpdate;
        console.error = originalConsoleError;
      }

      assert.equal(failedReset.status, 500);
      databaseMember = await User.findOne({ studentId: member.studentId });
      assert.equal(databaseMember.passwordHash, passwordBeforeFailure);
      assert.equal(databaseMember.recoveryPasswordHash, recoveryBeforeFailure);

      const oldSession = new BrowserSession(() => baseUrl);
      assert.equal(
        (await oldSession.login(changedEmail, databasePassword)).status,
        201,
      );

      const duplicateResults = await Promise.all([
        resetBrowser.resetPassword(finalPassword),
        resetBrowser.resetPassword(finalPassword),
      ]);
      assert.deepEqual(
        duplicateResults.map((result) => result.status).sort(),
        [200, 302],
      );

      databaseMember = await User.findOne({ studentId: member.studentId });
      assert.equal(
        passwordTools.verifyPassword(
          finalPassword,
          databaseMember.passwordHash,
        ),
        true,
      );
      assert.equal(databaseMember.recoveryPasswordHash == null, true);
      assert.equal(databaseMember.recoveryPasswordSetAt == null, true);

      const invalidOldSession = await oldSession.request("/api/profile");
      assert.equal(invalidOldSession.status, 401);
      assert.equal(errorOf(invalidOldSession).code, "SESSION_INVALID");

      assert.equal(
        (await new BrowserSession(() => baseUrl).login(
          changedEmail,
          databasePassword,
        )).status,
        401,
      );
      assert.equal(
        (await new BrowserSession(() => baseUrl).login(
          changedEmail,
          finalPassword,
        )).status,
        201,
      );
      assert.equal(
        (
          await new BrowserSession(() => baseUrl).verifyRecovery(
            changedEmail,
            changedRecoveryPassword,
          )
        ).status,
        401,
      );

      await closeServer(server);
      server = null;
      await mongoose.disconnect();

      accountData.resetData();
      addReviewUsersToMemory();
      await startReviewServer();
      assert.equal(mongoose.connection.name, expectedTestDatabase);
      assert.equal(
        (await new BrowserSession(() => baseUrl).login(
          changedEmail,
          finalPassword,
        )).status,
        201,
      );
    } finally {
      await closeServer(server);

      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_TEST_URI);
      }

      assert.equal(
        mongoose.connection.name,
        expectedTestDatabase,
        "Refusing to clean up outside the approved test database.",
      );

      for (const userId of createdUserIds) {
        await User.deleteOne({ _id: userId });
      }

      accountData.dataStore.users = accountData.dataStore.users.filter(
        (user) => user.id !== member.id && user.id !== legacyMember.id,
      );

      await mongoose.disconnect();
    }
  },
);
