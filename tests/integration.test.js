const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const { Discussion } = require("../models/discussion");
const { Reply } = require("../models/reply");
const { connectDatabase } = require("../database");
const { seedDatabase } = require("../scripts/seed");

let server;
let baseUrl;
let mongoServer;
let startServer;

class BrowserSession {
  constructor() {
    this.cookie = "";
  }

  async request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (this.cookie) headers.set("Cookie", this.cookie);

    const response = await fetch(baseUrl + path, { ...options, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";", 1)[0];
    return response;
  }

  async login(identity, password) {
    const response = await this.request("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity, password }),
    });
    assert.equal(response.status, 201);
    return response.json();
  }
}

function jsonRequest(method, body, options = {}) {
  return {
    ...options,
    method,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: JSON.stringify(body),
  };
}

function addForumTestImage(form, fieldName) {
  const imageFile = fs.readFileSync(
    path.join(__dirname, "..", "public", "images", "peer-workshop.jpg")
  );

  form.append(
    fieldName,
    new Blob([imageFile], { type: "image/jpeg" }),
    "forum-test.jpg"
  );
}

function removeForumTestImage(imagePath) {
  if (!imagePath || !imagePath.startsWith("/uploads/")) return;

  const filePath = path.join(
    __dirname,
    "..",
    "public",
    "uploads",
    path.basename(imagePath)
  );

  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

before(async () => {
  mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  process.env.MONGODB_URI = mongoServer.getUri();
  process.env.MONGODB_DB_NAME = "rmit_connect_integration_test";
  process.env.SESSION_SECRET = "integration-test-session-secret-2026";

  /* index.js reads configuration when imported, after the test URI is ready. */
  ({ startServer } = require("../index"));
  await connectDatabase();
  await seedDatabase({ connect: false });
  server = await startServer(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

test("shared pages, compatibility routes, and security headers are available", async () => {
  const publicRoutes = [
    "/",
    "/sitemap",
    "/blogs",
    "/blogs/blog-001",
    "/reviews",
    "/reviews/browse",
    "/reviews/1",
    "/reviews/2/edit",
    "/wishlist",
    "/wishlist/add",
    "/login.html",
    "/register.html",
    "/profile.html",
    "/editprofile.html",
    "/admin.html",
    "/forgot-password",
  ];

  for (const route of publicRoutes) {
    const response = await fetch(baseUrl + route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-security-policy") || "", /default-src/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }

  const legacyRoutes = new Map([
    ["/review/review.html", "/reviews"],
    ["/review/review-browse.html", "/reviews/browse"],
    ["/review/review-detail.html?id=2", "/reviews/2"],
    ["/review/review-edit.html?id=2", "/reviews/2/edit"],
  ]);

  for (const [route, destination] of legacyRoutes) {
    const response = await fetch(baseUrl + route, { redirect: "manual" });
    assert.equal(response.status, 301, route);
    assert.equal(response.headers.get("location"), destination);
  }

  const apiResponse = await fetch(baseUrl + "/api/blogs");
  assert.equal(apiResponse.headers.get("cache-control"), "no-store");
});

test("a port collision fails cleanly instead of throwing from server.address()", async () => {
  const occupiedPort = Number(new URL(baseUrl).port);
  await assert.rejects(startServer(occupiedPort), (error) => error?.code === "EADDRINUSE");
});

test("malformed and oversized JSON return controlled API errors", async () => {
  const malformed = await fetch(baseUrl + "/api/blogs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{not valid json",
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, "INVALID_JSON");

  const malformedAccount = await fetch(baseUrl + "/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{also not valid json",
  });
  assert.equal(malformedAccount.status, 400);
  assert.equal(
    (await malformedAccount.json()).error.code,
    "INVALID_JSON",
  );

  const mixedCaseAccount = await fetch(baseUrl + "/API/SESSION", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{still not valid json",
  });
  assert.equal(mixedCaseAccount.status, 400);
  assert.equal(
    (await mixedCaseAccount.json()).error.code,
    "INVALID_JSON",
  );

  const oversizedAccount = await fetch(baseUrl + "/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: "x".repeat(1.6 * 1024 * 1024) }),
  });
  assert.equal(oversizedAccount.status, 413);
  assert.equal(
    (await oversizedAccount.json()).error.code,
    "PAYLOAD_TOO_LARGE",
  );

  const oversized = await fetch(baseUrl + "/api/blogs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: "x".repeat(6.1 * 1024 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).code, "PAYLOAD_TOO_LARGE");
});

test("one shared session authenticates every module and logout clears it", async () => {
  const dat = new BrowserSession();
  const login = await dat.login("dat.pham", "ConnectDemo!26");
  assert.match(login.data.user.id, /^[a-f\d]{24}$/i);

  for (const route of ["/api/current-user", "/api/products", "/api/wishlist", "/api/profile"] ) {
    const response = await dat.request(route);
    assert.equal(response.status, 200, route);
  }

  const forum = await dat.request("/discussions", { redirect: "manual" });
  assert.equal(forum.status, 200);
  assert.match(await forum.text(), /Discussion Forum/i);

  const logout = await dat.request("/logout");
  assert.equal(logout.status, 200);

  const state = await dat.request("/api/session");
  assert.equal((await state.json()).data.authenticated, false);
});

test("Blog supports validated, owned CRUD, comments, and documented image sizes", async () => {
  const dat = new BrowserSession();
  const login = await dat.login("dat.pham", "ConnectDemo!26");

  const unsupportedCategory = await dat.request(
    "/api/blogs",
    jsonRequest("POST", {
      title: "Invalid category example",
      category: "xx",
      tags: ["test"],
      content: "This otherwise valid Blog post must fail its category allowlist.",
      image: "",
    })
  );
  assert.equal(unsupportedCategory.status, 400);

  const mediumImage =
    "data:image/png;base64," + Buffer.alloc(160 * 1024).toString("base64");
  const createdResponse = await dat.request(
    "/api/blogs",
    jsonRequest("POST", {
      title: "Integrated Blog test",
      category: "Student Life",
      tags: ["integration", "test"],
      content: "This temporary post verifies Blog creation and image transport.",
      image: mediumImage,
    })
  );
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.authorId, login.data.user.id);
  assert.equal(created.image, mediumImage);

  const update = await dat.request(
    `/api/blogs/${created.id}`,
    jsonRequest("PUT", {
      title: "Updated integrated Blog test",
      category: "Student Life",
      tags: ["integration"],
      content: "This updated post verifies authenticated owner-only editing.",
      image: mediumImage,
    })
  );
  assert.equal(update.status, 200);

  const comment = await dat.request(
    `/api/blogs/${created.id}/comments`,
    jsonRequest("POST", { content: "A valid authenticated test comment." })
  );
  assert.equal(comment.status, 201);

  const foreignUpdate = await dat.request(
    "/api/blogs/blog-001",
    jsonRequest("PUT", {
      title: "Forbidden Blog update",
      category: "Campus Life",
      tags: ["test"],
      content: "Dat must not change a Blog post that belongs to Jay Nguyen.",
      image: "",
    })
  );
  assert.equal(foreignUpdate.status, 403);

  const remove = await dat.request(`/api/blogs/${created.id}`, { method: "DELETE" });
  assert.equal(remove.status, 204);
});

test("Reviews derive identity and support validated course, image, and owned CRUD", async () => {
  const dat = new BrowserSession();
  const jay = new BrowserSession();
  const datLogin = await dat.login("dat.pham", "ConnectDemo!26");
  await jay.login("jay.nguyen", "StudentDemo!26");

  const fractional = await dat.request(
    "/api/reviews",
    jsonRequest("POST", {
      courseCode: "COSC3060",
      title: "Fractional rating test",
      description: "This otherwise valid review must reject a fractional rating.",
      rating: 2.5,
    })
  );
  assert.equal(fractional.status, 400);

  const imageUrl =
    "data:image/png;base64," + Buffer.alloc(32 * 1024).toString("base64");
  const createdResponse = await dat.request(
    "/api/reviews",
    jsonRequest("POST", {
      courseCode: "COSC3060",
      title: "Integrated Review test",
      description: "This temporary review verifies secure identity and image handling.",
      rating: 5,
      reviewerName: "Attempted impersonation",
      imageUrl,
    })
  );
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.userId, datLogin.data.user.id);
  assert.equal(created.reviewerName, "Dat Pham");
  assert.equal(created.courseCode, "COSC3060");
  assert.equal(created.imageUrl, imageUrl);

  const updateResponse = await dat.request(
    `/api/reviews/${created.id}`,
    jsonRequest("PUT", {
      courseCode: "COSC3061",
      title: "Updated integrated Review test",
      description: "This updated review verifies owner-only editing and image retention.",
      rating: 4,
    })
  );
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.courseCode, "COSC3061");
  assert.equal(updated.imageUrl, imageUrl);

  const forbidden = await jay.request(
    `/api/reviews/${created.id}`,
    jsonRequest("PUT", {
      courseCode: "COSC3060",
      title: "Forbidden Review update",
      description: "Jay must not update a review that belongs to Dat Pham.",
      rating: 4,
    })
  );
  assert.equal(forbidden.status, 403);

  const remove = await dat.request(`/api/reviews/${created.id}`, { method: "DELETE" });
  assert.equal(remove.status, 204);
});

test("Forum returns meaningful status codes and preserves owned CRUD", async () => {
  const dat = new BrowserSession();
  const jay = new BrowserSession();
  await dat.login("dat.pham", "ConnectDemo!26");
  await jay.login("jay.nguyen", "StudentDemo!26");

  const testTime = Date.now();
  const title = `Integration forum ${testTime}`;
  const replyTitle = `Integration reply ${testTime}`;
  let discussion = null;
  let reply = null;
  let discussionId = null;
  let replyId = null;

  try {
    const invalidForm = new FormData();
    invalidForm.append("postTitle", "");
    invalidForm.append("postContent", "");

    const invalid = await dat.request("/discussions", {
      method: "POST",
      body: invalidForm,
      redirect: "manual",
    });
    assert.equal(invalid.status, 400);

    const discussionForm = new FormData();
    discussionForm.append("postTitle", title);
    discussionForm.append(
      "postContent",
      "This temporary discussion tests the integrated Forum workflow."
    );
    addForumTestImage(discussionForm, "postImage");

    const create = await dat.request("/discussions", {
      method: "POST",
      body: discussionForm,
      redirect: "manual",
    });
    assert.equal(create.status, 302);

    discussion = await Discussion.findOne({ title: title });
    if (discussion) discussionId = discussion._id;
    assert.ok(discussion);
    assert.match(discussion.image, /^\/uploads\//);

    const discussionImage = discussion.image;
    const updateDiscussionForm = new FormData();
    updateDiscussionForm.append("postTitle", title + " updated");
    updateDiscussionForm.append(
      "postContent",
      "This updated discussion tests MongoDB persistence and image retention."
    );

    const updateDiscussion = await dat.request(
      `/discussions/${discussion._id}/edit`,
      {
        method: "POST",
        body: updateDiscussionForm,
        redirect: "manual",
      }
    );
    assert.equal(updateDiscussion.status, 302);

    discussion = await Discussion.findById(discussion._id);
    assert.equal(discussion.title, title + " updated");
    assert.equal(discussion.image, discussionImage);

    const replyForm = new FormData();
    replyForm.append("replyTitle", replyTitle);
    replyForm.append(
      "replyContent",
      "This temporary reply tests MongoDB creation and image upload."
    );
    addForumTestImage(replyForm, "replyImage");

    const createReply = await dat.request(
      `/discussions/${discussion._id}/replies`,
      {
        method: "POST",
        body: replyForm,
        redirect: "manual",
      }
    );
    assert.equal(createReply.status, 302);

    reply = await Reply.findOne({
      title: replyTitle,
      discussionId: discussion._id,
    });
    if (reply) replyId = reply._id;
    assert.ok(reply);
    assert.match(reply.image, /^\/uploads\//);

    const replyImage = reply.image;
    const updateReplyForm = new FormData();
    updateReplyForm.append("replyTitle", replyTitle + " updated");
    updateReplyForm.append(
      "replyContent",
      "This updated reply tests MongoDB persistence and image retention."
    );

    const updateReply = await dat.request(
      `/discussions/${discussion._id}/replies/${reply._id}/edit`,
      {
        method: "POST",
        body: updateReplyForm,
        redirect: "manual",
      }
    );
    assert.equal(updateReply.status, 302);

    reply = await Reply.findById(reply._id);
    assert.equal(reply.title, replyTitle + " updated");
    assert.equal(reply.image, replyImage);

    const forbidden = await jay.request(`/discussions/${discussion._id}/edit`);
    assert.equal(forbidden.status, 403);

    const missing = await dat.request("/discussions/not-real");
    assert.equal(missing.status, 404);

    const deleteReply = await dat.request(
      `/discussions/${discussion._id}/replies/${reply._id}/delete`,
      { method: "POST", redirect: "manual" }
    );
    assert.equal(deleteReply.status, 302);

    reply = await Reply.findById(reply._id);
    assert.ok(reply.deletedAt);
    assert.ok(reply.deletedBy);

    const remove = await dat.request(`/discussions/${discussion._id}/delete`, {
      method: "POST",
      redirect: "manual",
    });
    assert.equal(remove.status, 302);

    discussion = await Discussion.findById(discussion._id);
    assert.ok(discussion.deletedAt);
    assert.ok(discussion.deletedBy);
    assert.equal(
      (await dat.request(`/discussions/${discussion._id}`)).status,
      404
    );
  } finally {
    if (!reply && replyId) {
      reply = await Reply.findById(replyId);
    }

    if (reply) {
      removeForumTestImage(reply.image);
    }

    if (replyId) {
      await Reply.deleteOne({ _id: replyId });
    }

    if (!discussion && discussionId) {
      discussion = await Discussion.findById(discussionId);
    }

    if (discussion) {
      removeForumTestImage(discussion.image);
    }

    if (discussionId) {
      await Discussion.deleteOne({ _id: discussionId });
    }
  }
});

test("Wishlist duplicate prevention and state transitions work through shared login", async () => {
  const dat = new BrowserSession();
  await dat.login("dat.pham", "ConnectDemo!26");

  const products = await dat.request("/api/products");
  assert.equal(products.status, 200);
  assert.equal((await products.json()).data.count, 5);

  const add = await dat.request(
    "/api/wishlist",
    jsonRequest("POST", { productId: "data-bootcamp" })
  );
  assert.equal(add.status, 201);

  const duplicate = await dat.request(
    "/api/wishlist",
    jsonRequest("POST", { productId: "data-bootcamp" })
  );
  assert.equal(duplicate.status, 409);

  const move = await dat.request(
    "/api/wishlist/data-bootcamp",
    jsonRequest("PATCH", { action: "move-to-cart" })
  );
  assert.equal(move.status, 200);

  const remove = await dat.request("/api/wishlist/data-bootcamp", {
    method: "DELETE",
  });
  assert.equal(remove.status, 200);
});

test("password reset and account deactivation persist through the root page controllers", async () => {
  const account = new BrowserSession();
  const oldPassword = "TemporaryPass9A";
  const newPassword = "ReplacementPass9B";

  const registration = await account.request(
    "/api/users",
    jsonRequest("POST", {
      username: "root.e2e",
      studentId: "S4999999",
      name: "Root Controller Test",
      email: "root.e2e@rmit.edu.vn",
      description: "Temporary account for reset and deactivation testing.",
      password: oldPassword,
      confirmPassword: oldPassword,
    }),
  );
  assert.equal(registration.status, 201);

  const dormantSession = new BrowserSession();
  await dormantSession.login("root.e2e", oldPassword);

  const malformedEmailShape = await account.request("/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "reset-email%5Bnested%5D=not-an-email",
  });
  assert.equal(malformedEmailShape.status, 200);
  assert.match(await malformedEmailShape.text(), /valid email address/i);

  const forgot = await account.request("/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "reset-email": "root.e2e@rmit.edu.vn" }),
  });
  assert.equal(forgot.status, 200);
  const forgotPage = await forgot.text();
  const resetToken = forgotPage.match(
    /\/reset-password\?token=([a-f0-9]{64})/i,
  )?.[1];
  assert.ok(resetToken, "local mode should expose one demonstration reset link");

  const resetPage = await account.request(
    `/reset-password?token=${resetToken}`,
  );
  assert.equal(resetPage.status, 200);

  const reset = await account.request("/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      "new-password": newPassword,
      "confirm-password": newPassword,
    }),
  });
  assert.equal(reset.status, 200);
  assert.match(await reset.text(), /Password Reset Complete/i);

  const revokedDormantSession = await dormantSession.request("/api/profile");
  assert.equal(revokedDormantSession.status, 401);
  assert.equal(
    (await revokedDormantSession.json()).error.code,
    "SESSION_INVALID",
  );

  const oldLogin = await new BrowserSession().request(
    "/api/session",
    jsonRequest("POST", { identity: "root.e2e", password: oldPassword }),
  );
  assert.equal(oldLogin.status, 401);

  const activeSession = new BrowserSession();
  await activeSession.login("root.e2e", newPassword);

  const anonymousDeactivatePage = await new BrowserSession().request(
    "/deactivate-account",
    { redirect: "manual" },
  );
  assert.equal(anonymousDeactivatePage.status, 302);
  assert.equal(
    anonymousDeactivatePage.headers.get("location"),
    "/login.html?returnTo=%2Fdeactivate-account",
  );

  const anonymousDeactivate = await new BrowserSession().request(
    "/deactivate-account",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({}),
      redirect: "manual",
    },
  );
  assert.equal(anonymousDeactivate.status, 302);
  assert.equal(
    anonymousDeactivate.headers.get("location"),
    "/login.html?returnTo=%2Fdeactivate-account",
  );

  const replay = new BrowserSession();
  assert.equal(
    (await replay.request(`/reset-password?token=${resetToken}`)).status,
    200,
  );
  const replayResult = await replay.request("/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      "new-password": "ReplayAttempt9C",
      "confirm-password": "ReplayAttempt9C",
    }),
  });
  assert.equal(replayResult.status, 400);
  assert.match(await replayResult.text(), /invalid or has expired/i);

  const deactivate = await activeSession.request("/deactivate-account", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ "deactivate-id-confirm": "confirmed" }),
    redirect: "manual",
  });
  assert.equal(deactivate.status, 302);
  assert.equal(deactivate.headers.get("location"), "/deactivated-success");

  const clearedSession = await activeSession.request("/api/session");
  assert.equal((await clearedSession.json()).data.authenticated, false);

  const deactivatedLogin = await new BrowserSession().request(
    "/api/session",
    jsonRequest("POST", { identity: "root.e2e", password: newPassword }),
  );
  assert.equal(deactivatedLogin.status, 403);
});
