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
  "MongoDB deactivation persists and invalidates current and older sessions",
  { timeout: 60000 },
  async () => {
    assert.ok(
      process.env.MONGODB_TEST_URI,
      "MONGODB_TEST_URI is required for the isolated deactivation test.",
    );

    process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
    process.env.NODE_ENV = "test";
    process.env.SESSION_SECRET = "deactivation-review-test-secret";

    const mongoose = require("mongoose");
    const { User } = require("../models/user");
    const { startServer } = require("../index");
    const accountData = await import("../modules/account/src/data.js");
    const passwordTools = await import(
      "../modules/account/src/passwords.js"
    );

    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    const memberPassword = "ReviewMember!26";
    const adminPassword = "ReviewAdmin!26";
    const member = {
      id: "review-member-" + suffix,
      username: "review.member." + suffix,
      studentId: "RVW" + suffix.toUpperCase(),
      name: "Review Member",
      email: "review.member." + suffix + "@rmit.edu.vn",
      description: "Isolated Account Deactivation test member.",
      avatarUrl: "",
      role: "member",
      status: "active",
      lastActiveAt: null,
      passwordHash: passwordTools.createPasswordHash(memberPassword),
    };
    const admin = {
      id: "review-admin-" + suffix,
      username: "review.admin." + suffix,
      studentId: "ADM" + suffix.toUpperCase(),
      name: "Review Administrator",
      email: "review.admin." + suffix + "@rmit.edu.vn",
      description: "Isolated Account Deactivation test administrator.",
      avatarUrl: "",
      role: "admin",
      status: "active",
      lastActiveAt: null,
      passwordHash: passwordTools.createPasswordHash(adminPassword),
    };

    let server;
    let baseUrl = "";
    const createdUserIds = [];

    function addReviewUsersToMemory() {
      accountData.dataStore.users.push(
        { ...member, status: "active" },
        { ...admin, status: "active" },
      );
    }

    async function startReviewServer() {
      server = await startServer(0);
      const address = server.address();
      assert.equal(typeof address, "object");
      baseUrl = "http://127.0.0.1:" + address.port;
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

      for (const user of [member, admin]) {
        const databaseUser = new User({
          username: user.username,
          studentId: user.studentId,
          name: user.name,
          email: user.email,
          passwordHash: user.passwordHash,
          description: user.description,
          avatarUrl: "/images/user_icon.png",
          course: "Review test course",
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

      const browserA = new BrowserSession(() => baseUrl);
      const browserB = new BrowserSession(() => baseUrl);
      const browserC = new BrowserSession(() => baseUrl);
      const anonymousBrowser = new BrowserSession(() => baseUrl);
      const administrator = new BrowserSession(() => baseUrl);

      assert.equal(
        (await browserA.login(member.username, memberPassword)).status,
        201,
      );
      assert.equal(
        (await browserB.login(member.username, memberPassword)).status,
        201,
      );
      assert.equal(
        (await browserC.login(member.username, memberPassword)).status,
        201,
      );
      assert.equal(
        (await administrator.login(admin.username, adminPassword)).status,
        201,
      );

      assert.equal((await browserA.request("/api/profile")).status, 200);
      assert.equal((await browserA.request("/discussions")).status, 200);

      const withoutConfirmation = await browserA.request(
        "/deactivate-account",
        {
          method: "POST",
          form: {},
        },
      );
      assert.equal(withoutConfirmation.status, 200);
      assert.match(withoutConfirmation.payload, /Please confirm/);
      assert.equal(
        (await User.findOne({ studentId: member.studentId })).status,
        "active",
      );
      assert.equal(
        dataOf(await browserA.request("/api/session")).authenticated,
        true,
      );

      const anonymousDeactivation = await anonymousBrowser.request(
        "/deactivate-account",
        {
          method: "POST",
          form: { "deactivate-id-confirm": "confirmed" },
        },
      );
      assert.equal(anonymousDeactivation.status, 302);
      assert.equal(anonymousDeactivation.headers.get("location"), "/login.html");
      assert.equal(
        (await User.findOne({ studentId: member.studentId })).status,
        "active",
      );

      const administratorDeactivation = await administrator.request(
        "/deactivate-account",
        {
          method: "POST",
          form: { "deactivate-id-confirm": "confirmed" },
        },
      );
      assert.equal(administratorDeactivation.status, 409);
      assert.match(
        administratorDeactivation.payload,
        /Administrator accounts cannot be deactivated/,
      );

      const databaseAdministrator = await User.findOne({
        studentId: admin.studentId,
      });
      assert.equal(databaseAdministrator.status, "active");
      assert.equal(databaseAdministrator.lockedAt, null);
      assert.equal(databaseAdministrator.deactivatedAt, null);

      const administratorSessionAfterRejected =
        await administrator.request("/api/session");
      assert.equal(administratorSessionAfterRejected.status, 200);
      assert.equal(
        dataOf(administratorSessionAfterRejected).authenticated,
        true,
      );
      assert.equal(
        (await administrator.request("/api/admin/users")).status,
        200,
      );

      const originalFindOneAndUpdate = User.findOneAndUpdate;
      const originalConsoleError = console.error;
      let loggedWriteFailure = false;

      User.findOneAndUpdate = async function (filter, ...args) {
        if (
          filter.studentId === member.studentId &&
          filter.status === "active"
        ) {
          throw new Error("Intentional isolated deactivation write failure");
        }

        return originalFindOneAndUpdate.call(this, filter, ...args);
      };
      console.error = function (error) {
        if (
          error instanceof Error &&
          error.message === "Intentional isolated deactivation write failure"
        ) {
          loggedWriteFailure = true;
          return;
        }

        originalConsoleError(error);
      };

      let failedWrite;

      try {
        failedWrite = await browserA.request("/deactivate-account", {
          method: "POST",
          form: { "deactivate-id-confirm": "confirmed" },
        });
      } finally {
        User.findOneAndUpdate = originalFindOneAndUpdate;
        console.error = originalConsoleError;
      }

      assert.equal(loggedWriteFailure, true);
      assert.equal(failedWrite.status, 500);
      assert.doesNotMatch(failedWrite.payload, /Account Deactivated/);
      assert.match(failedWrite.payload, /Could not deactivate/);
      assert.equal(
        (await User.findOne({ studentId: member.studentId })).status,
        "active",
      );
      assert.equal(
        dataOf(await browserA.request("/api/session")).authenticated,
        true,
      );

      const deactivation = await browserA.request("/deactivate-account", {
        method: "POST",
        form: { "deactivate-id-confirm": "confirmed" },
      });
      assert.equal(deactivation.status, 200);
      assert.match(deactivation.payload, /Account Deactivated/);
      assert.match(
        deactivation.headers.get("set-cookie") || "",
        /rmit\.connect\.sid=;/,
      );

      let databaseMember = await User.findOne({
        studentId: member.studentId,
      });
      assert.equal(databaseMember.status, "locked");
      assert.ok(databaseMember.lockedAt);
      assert.ok(databaseMember.deactivatedAt);

      assert.equal(
        dataOf(await browserA.request("/api/session")).authenticated,
        false,
      );

      const blockedLogin = await new BrowserSession(() => baseUrl).login(
        member.username,
        memberPassword,
      );
      assert.equal(blockedLogin.status, 423);
      assert.equal(errorOf(blockedLogin).code, "ACCOUNT_LOCKED");

      const otherBrowserBlocked = await browserB.request("/api/profile");
      assert.equal(otherBrowserBlocked.status, 423);
      assert.equal(errorOf(otherBrowserBlocked).code, "ACCOUNT_LOCKED");

      const adminListLocked = await administrator.request("/api/admin/users");
      assert.equal(adminListLocked.status, 200);
      assert.equal(
        dataOf(adminListLocked).users.find(
          (user) => user.id === member.id,
        ).status,
        "locked",
      );

      const unlockAfterDeactivation = await administrator.request(
        "/api/admin/users/" + encodeURIComponent(member.id) + "/status",
        {
          method: "PATCH",
          json: { status: "active" },
        },
      );
      assert.equal(unlockAfterDeactivation.status, 200);
      assert.equal(dataOf(unlockAfterDeactivation).user.status, "active");

      databaseMember = await User.findOne({ studentId: member.studentId });
      assert.equal(databaseMember.status, "active");
      assert.ok(databaseMember.deactivatedAt);

      const oldSessionAfterUnlock = await browserC.request("/api/profile");
      assert.equal(oldSessionAfterUnlock.status, 401);
      assert.equal(errorOf(oldSessionAfterUnlock).code, "SESSION_INVALID");

      const afterDeactivationUnlock = new BrowserSession(() => baseUrl);
      assert.equal(
        (
          await afterDeactivationUnlock.login(
            member.username,
            memberPassword,
          )
        ).status,
        201,
      );
      assert.equal(
        (await afterDeactivationUnlock.request("/api/profile")).status,
        200,
      );

      const adminLock = await administrator.request(
        "/api/admin/users/" + encodeURIComponent(member.id) + "/status",
        {
          method: "PATCH",
          json: { status: "locked" },
        },
      );
      assert.equal(adminLock.status, 200);
      assert.equal(dataOf(adminLock).user.status, "locked");

      const adminUnlock = await administrator.request(
        "/api/admin/users/" + encodeURIComponent(member.id) + "/status",
        {
          method: "PATCH",
          json: { status: "active" },
        },
      );
      assert.equal(adminUnlock.status, 200);
      assert.equal(dataOf(adminUnlock).user.status, "active");

      const oldSessionAfterAdminUnlock =
        await afterDeactivationUnlock.request("/api/profile");
      assert.equal(oldSessionAfterAdminUnlock.status, 401);
      assert.equal(
        errorOf(oldSessionAfterAdminUnlock).code,
        "SESSION_INVALID",
      );

      const freshAfterAdminUnlock = new BrowserSession(() => baseUrl);
      assert.equal(
        (
          await freshAfterAdminUnlock.login(
            member.username,
            memberPassword,
          )
        ).status,
        201,
      );
      assert.equal(
        (await freshAfterAdminUnlock.request("/api/profile")).status,
        200,
      );

      const secondDeactivation = await freshAfterAdminUnlock.request(
        "/deactivate-account",
        {
          method: "POST",
          form: { "deactivate-id-confirm": "confirmed" },
        },
      );
      assert.equal(secondDeactivation.status, 200);

      await closeServer(server);
      server = null;
      await mongoose.disconnect();

      accountData.resetData();
      addReviewUsersToMemory();
      await startReviewServer();
      assert.equal(mongoose.connection.name, expectedTestDatabase);

      const blockedAfterRestart = await new BrowserSession(() => baseUrl).login(
        member.username,
        memberPassword,
      );
      assert.equal(blockedAfterRestart.status, 423);
      assert.equal(errorOf(blockedAfterRestart).code, "ACCOUNT_LOCKED");

      const adminAfterRestart = new BrowserSession(() => baseUrl);
      assert.equal(
        (await adminAfterRestart.login(admin.username, adminPassword)).status,
        201,
      );
      const restartAdminList = await adminAfterRestart.request(
        "/api/admin/users",
      );
      assert.equal(
        dataOf(restartAdminList).users.find(
          (user) => user.id === member.id,
        ).status,
        "locked",
      );

      const directSuccessPage = await anonymousBrowser.request(
        "/deactivated-success",
      );
      assert.equal(directSuccessPage.status, 302);
      assert.equal(directSuccessPage.headers.get("location"), "/login.html");
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
        (user) => user.id !== member.id && user.id !== admin.id,
      );

      await mongoose.disconnect();
    }
  },
);

