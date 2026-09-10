const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const { Discussion } = require("../models/discussion");
const { Reply } = require("../models/reply");
const { User } = require("../models/user");
const { Product } = require("../models/product");
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
  process.env.NODE_ENV = "test";
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

  for (const route of ["/", "/sitemap"]) {
    const response = await dat.request(route);
    assert.equal(response.status, 200, route);
    assert.match(
      await response.text(),
      /class="globalSessionLink" href="\/login.html">Log in<\/a>/,
      route,
    );
  }

  const login = await dat.login("dat.pham", "ConnectDemo!26");
  assert.match(login.data.user.id, /^[a-f\d]{24}$/i);

  for (const route of ["/", "/sitemap"]) {
    const response = await dat.request(route);
    assert.equal(response.status, 200, route);
    assert.match(
      await response.text(),
      /class="globalSessionLink" href="\/logout">Log out<\/a>/,
      route,
    );
  }

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

  for (const route of ["/", "/sitemap"]) {
    const response = await dat.request(route);
    assert.equal(response.status, 200, route);
    assert.match(
      await response.text(),
      /class="globalSessionLink" href="\/login.html">Log in<\/a>/,
      route,
    );
  }
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

test("Forum preserves unavailable Product links and rejects invalid choices", async () => {
  const dat = new BrowserSession();
  await dat.login("dat.pham", "ConnectDemo!26");

  const testTime = Date.now();
  const productSlug = "forum-product-link-" + testTime;
  const discussionTitle = "Forum Product relationship " + testTime;
  const uploadsDirectory = path.join(__dirname, "..", "public", "uploads");
  const beforeFiles = fs.readdirSync(uploadsDirectory).sort();
  let discussion = null;

  const product = await Product.create({
    slug: productSlug,
    name: "Temporary Forum Course",
    category: "course",
    description: "A temporary Product used only by the Forum integration test.",
    priceVnd: 100000,
    image: "/images/peer-workshop.jpg",
    imageAlt: "Temporary Forum course",
    isActive: true,
  });
  const emptyProduct = await Product.create({
    slug: productSlug + "-empty",
    name: "Temporary Product Without Questions",
    category: "course",
    description: "A temporary Product used to test the empty question list.",
    priceVnd: 100000,
    image: "/images/peer-workshop.jpg",
    imageAlt: "Temporary Product without questions",
    isActive: true,
  });

  try {
    const emptyList = await dat.request(
      "/discussions?product=" + emptyProduct.slug,
    );
    const emptyListHtml = await emptyList.text();
    assert.equal(emptyList.status, 200);
    assert.ok(
      emptyListHtml.includes(
        "No questions about " + emptyProduct.name + " yet",
      ),
    );
    assert.ok(emptyListHtml.includes("Ask the first question"));

    const createForm = new FormData();
    createForm.append("postTitle", discussionTitle);
    createForm.append(
      "postContent",
      "This temporary discussion checks the Product relationship.",
    );
    createForm.append("productSlug", product.slug);
    addForumTestImage(createForm, "postImage");

    const createResponse = await dat.request("/discussions", {
      method: "POST",
      body: createForm,
      redirect: "manual",
    });
    assert.equal(createResponse.status, 302);
    assert.equal(
      createResponse.headers.get("location"),
      "/discussions?product=" + product.slug,
    );

    discussion = await Discussion.findOne({ title: discussionTitle });
    assert.ok(discussion);
    assert.equal(String(discussion.productId), String(product._id));

    const linkedDetail = await dat.request("/discussions/" + discussion._id);
    const linkedDetailHtml = await linkedDetail.text();
    assert.equal(linkedDetail.status, 200);
    assert.ok(linkedDetailHtml.includes(product.name));
    assert.ok(
      linkedDetailHtml.includes("/wishlist/add#item-" + product.slug),
    );
    assert.ok(
      linkedDetailHtml.includes("/discussions?product=" + product.slug),
    );
    assert.ok(linkedDetailHtml.includes(product.description));

    const linkedList = await dat.request(
      "/discussions?product=" + product.slug,
    );
    const linkedListHtml = await linkedList.text();
    assert.equal(linkedList.status, 200);
    assert.ok(linkedListHtml.includes("Questions about " + product.name));
    assert.ok(linkedListHtml.includes(discussionTitle));
    assert.ok(
      linkedListHtml.includes("Find questions about a course or activity"),
    );
    assert.ok(linkedListHtml.includes("Search courses or activities"));
    assert.ok(linkedListHtml.includes("Category: " + product.category));
    assert.match(
      linkedListHtml,
      /id="post-product-search-panel" class="product-search-panel" hidden/,
    );

    await Product.updateOne(
      { _id: product._id },
      { $set: { isActive: false } },
    );

    const inactiveEdit = await dat.request(
      "/discussions/" + discussion._id + "/edit",
    );
    const inactiveEditHtml = await inactiveEdit.text();
    assert.equal(inactiveEdit.status, 200);
    assert.match(
      inactiveEditHtml,
      /value="__keep-existing-product__"/,
    );
    assert.match(inactiveEditHtml, /unavailable, connection kept/);
    assert.match(inactiveEditHtml, /What is your question about\? \(optional\)/);
    assert.match(inactiveEditHtml, /Your question is about:/);
    assert.match(
      inactiveEditHtml,
      /id="edit-product-search-panel" class="product-search-panel" hidden/,
    );

    const keepInactiveForm = new FormData();
    keepInactiveForm.append("postTitle", discussionTitle + " inactive");
    keepInactiveForm.append(
      "postContent",
      "Editing the title must keep the unavailable Product relationship.",
    );
    keepInactiveForm.append(
      "productSlug",
      "__keep-existing-product__",
    );
    const keepInactiveResponse = await dat.request(
      "/discussions/" + discussion._id + "/edit",
      { method: "POST", body: keepInactiveForm, redirect: "manual" },
    );
    assert.equal(keepInactiveResponse.status, 302);

    discussion = await Discussion.findById(discussion._id);
    assert.equal(String(discussion.productId), String(product._id));

    const inactiveDetail = await dat.request(
      "/discussions/" + discussion._id,
    );
    assert.equal(
      (await inactiveDetail.text()).includes(
        "/wishlist/add#item-" + product.slug,
      ),
      false,
    );

    await Product.deleteOne({ _id: product._id });

    const deletedEdit = await dat.request(
      "/discussions/" + discussion._id + "/edit",
    );
    const deletedEditHtml = await deletedEdit.text();
    assert.equal(deletedEdit.status, 200);
    assert.match(
      deletedEditHtml,
      /value="__keep-existing-product__"/,
    );
    assert.match(deletedEditHtml, /Current product/);

    const keepDeletedForm = new FormData();
    keepDeletedForm.append("postTitle", discussionTitle + " deleted");
    keepDeletedForm.append(
      "postContent",
      "Editing must also preserve a relationship whose Product was deleted.",
    );
    keepDeletedForm.append(
      "productSlug",
      "__keep-existing-product__",
    );
    const keepDeletedResponse = await dat.request(
      "/discussions/" + discussion._id + "/edit",
      { method: "POST", body: keepDeletedForm, redirect: "manual" },
    );
    assert.equal(keepDeletedResponse.status, 302);

    discussion = await Discussion.findById(discussion._id);
    assert.equal(String(discussion.productId), String(product._id));

    const generalForm = new FormData();
    generalForm.append("postTitle", discussionTitle + " general");
    generalForm.append(
      "postContent",
      "Selecting General discussion must remove the Product relationship.",
    );
    generalForm.append("productSlug", "");
    const generalResponse = await dat.request(
      "/discussions/" + discussion._id + "/edit",
      { method: "POST", body: generalForm, redirect: "manual" },
    );
    assert.equal(generalResponse.status, 302);

    discussion = await Discussion.findById(discussion._id);
    assert.equal(discussion.productId, null);

    const invalidKeepForm = new FormData();
    invalidKeepForm.append("postTitle", discussionTitle + " invalid keep");
    invalidKeepForm.append(
      "postContent",
      "A post without a Product must reject the special keep value.",
    );
    invalidKeepForm.append(
      "productSlug",
      "__keep-existing-product__",
    );
    const invalidKeepResponse = await dat.request(
      "/discussions/" + discussion._id + "/edit",
      { method: "POST", body: invalidKeepForm, redirect: "manual" },
    );
    assert.equal(invalidKeepResponse.status, 400);

    discussion = await Discussion.findById(discussion._id);
    assert.equal(discussion.title, discussionTitle + " general");
    assert.equal(discussion.productId, null);

    const repeatedProductForm = new FormData();
    repeatedProductForm.append("postTitle", discussionTitle + " repeated");
    repeatedProductForm.append(
      "postContent",
      "Repeated Product values must be rejected instead of unlinking the post.",
    );
    repeatedProductForm.append("productSlug", "peer-workshop");
    repeatedProductForm.append("productSlug", "data-bootcamp");
    const repeatedProductResponse = await dat.request(
      "/discussions/" + discussion._id + "/edit",
      { method: "POST", body: repeatedProductForm, redirect: "manual" },
    );
    assert.equal(repeatedProductResponse.status, 400);

    discussion = await Discussion.findById(discussion._id);
    assert.equal(discussion.title, discussionTitle + " general");
    assert.equal(discussion.productId, null);
  } finally {
    if (discussion) {
      removeForumTestImage(discussion.image);
      await Discussion.deleteOne({ _id: discussion._id });
    }

    await Product.deleteOne({ _id: product._id });
    await Product.deleteOne({ _id: emptyProduct._id });
  }

  assert.deepEqual(fs.readdirSync(uploadsDirectory).sort(), beforeFiles);
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

test("legacy Blog and Review samples retain their original MongoDB owners", async () => {
  const dat = new BrowserSession();
  const jay = new BrowserSession();
  const datLogin = await dat.login("dat.pham", "ConnectDemo!26");
  const jayLogin = await jay.login("jay.nguyen", "StudentDemo!26");
  const kim = await User.findOne({ studentId: "S4028530" });
  const sampleSource = fs.readFileSync(path.join(__dirname, "..", "review-data.js"), "utf8");

  const blogResponse = await jay.request("/api/blogs/blog-001");
  assert.equal(blogResponse.status, 200);
  const blog = await blogResponse.json();
  assert.equal(blog.authorId, jayLogin.data.user.id);
  assert.equal(blog.authorSid, "S4217847");

  const blogUpdate = {
    title: blog.title,
    category: blog.category,
    tags: blog.tags,
    content: blog.content,
    image: blog.image,
  };
  assert.equal(
    (await dat.request("/api/blogs/blog-001", jsonRequest("PUT", blogUpdate))).status,
    403,
  );
  assert.equal(
    (await jay.request("/api/blogs/blog-001", jsonRequest("PUT", blogUpdate))).status,
    200,
  );

  const reviewResponse = await dat.request("/api/reviews");
  assert.equal(reviewResponse.status, 200);
  const reviews = await reviewResponse.json();
  const expectedOwners = [
    String(kim._id),
    datLogin.data.user.id,
    jayLogin.data.user.id,
    String(kim._id),
    datLogin.data.user.id,
    jayLogin.data.user.id,
  ];

  for (let i = 0; i < expectedOwners.length; i += 1) {
    const review = reviews.find((item) => item.id === i + 1);
    assert.ok(review);
    assert.equal(review.userId, expectedOwners[i]);
  }

  const datReview = reviews.find((review) => review.id === 2);
  const reviewUpdate = {
    title: datReview.title,
    description: datReview.description,
    courseCode: datReview.courseCode,
    rating: datReview.rating,
  };
  assert.equal(
    (await jay.request("/api/reviews/2", jsonRequest("PUT", reviewUpdate))).status,
    403,
  );
  assert.equal(
    (await dat.request("/api/reviews/2", jsonRequest("PUT", reviewUpdate))).status,
    200,
  );
  assert.equal(
    (await jay.request("/api/reviews/2", { method: "DELETE" })).status,
    403,
  );

  // The compatibility step changes runtime samples, never their source files.
  assert.equal(
    fs.readFileSync(path.join(__dirname, "..", "review-data.js"), "utf8"),
    sampleSource,
  );
  assert.match(sampleSource, /userId: "user-dat"/);
});

test("Forum rejects anonymous and invalid uploads without leaving files", async () => {
  const uploadsDirectory = path.join(__dirname, "..", "public", "uploads");
  const beforeFiles = fs.readdirSync(uploadsDirectory).sort();
  const anonymous = new BrowserSession();
  const anonymousForm = new FormData();
  anonymousForm.append("postTitle", "Anonymous upload must not be saved");
  anonymousForm.append("postContent", "This request must be stopped before an image is saved.");
  addForumTestImage(anonymousForm, "postImage");

  const anonymousResponse = await anonymous.request("/discussions", {
    method: "POST",
    body: anonymousForm,
    redirect: "manual",
  });
  assert.equal(anonymousResponse.status, 302);
  assert.match(anonymousResponse.headers.get("location"), /^\/login\.html/);
  assert.deepEqual(fs.readdirSync(uploadsDirectory).sort(), beforeFiles);

  const dat = new BrowserSession();
  await dat.login("dat.pham", "ConnectDemo!26");
  const invalidForm = new FormData();
  invalidForm.append("postTitle", "");
  invalidForm.append("postContent", "");
  addForumTestImage(invalidForm, "postImage");
  const invalidResponse = await dat.request("/discussions", {
    method: "POST",
    body: invalidForm,
    redirect: "manual",
  });
  assert.equal(invalidResponse.status, 400);
  assert.deepEqual(fs.readdirSync(uploadsDirectory).sort(), beforeFiles);

  const invalidType = new FormData();
  invalidType.append("postTitle", "Text is not a Forum image");
  invalidType.append("postContent", "The server must reject this unsupported upload.");
  invalidType.append("postImage", new Blob(["not an image"], { type: "text/plain" }), "upload.txt");
  const invalidTypeResponse = await dat.request("/discussions", {
    method: "POST",
    body: invalidType,
    redirect: "manual",
  });
  assert.equal(invalidTypeResponse.status, 400);
  assert.deepEqual(fs.readdirSync(uploadsDirectory).sort(), beforeFiles);
});

test("Forum preserves ownership and rejects replies below a deleted Discussion", async () => {
  const dat = new BrowserSession();
  const jay = new BrowserSession();
  await dat.login("dat.pham", "ConnectDemo!26");
  await jay.login("jay.nguyen", "StudentDemo!26");
  const uploadsDirectory = path.join(__dirname, "..", "public", "uploads");
  const beforeFiles = fs.readdirSync(uploadsDirectory).sort();
  const title = "Forum integration guard " + Date.now();
  let discussion;
  let reply;
  const createdImages = new Set();

  try {
    const form = new FormData();
    form.append("postTitle", title);
    form.append("postContent", "An owned Discussion used only by the integration guard test.");
    addForumTestImage(form, "postImage");
    assert.equal((await dat.request("/discussions", {
      method: "POST", body: form, redirect: "manual",
    })).status, 302);
    discussion = await Discussion.findOne({ title });
    assert.ok(discussion);
    createdImages.add(discussion.image);
    const ownedFiles = fs.readdirSync(uploadsDirectory).sort();

    const forbiddenForm = new FormData();
    forbiddenForm.append("postTitle", "Another member must not replace this title");
    forbiddenForm.append("postContent", "Another member must not replace this content.");
    addForumTestImage(forbiddenForm, "postImage");
    assert.equal((await jay.request("/discussions/" + discussion._id + "/edit", {
      method: "POST", body: forbiddenForm, redirect: "manual",
    })).status, 403);
    assert.deepEqual(fs.readdirSync(uploadsDirectory).sort(), ownedFiles);
    assert.equal((await Discussion.findById(discussion._id)).title, title);
    assert.equal((await jay.request("/discussions/" + discussion._id + "/delete", {
      method: "POST", redirect: "manual",
    })).status, 403);

    const replyForm = new FormData();
    replyForm.append("replyTitle", "Reply beneath " + title);
    replyForm.append("replyContent", "This reply must be hidden when its parent is deleted.");
    addForumTestImage(replyForm, "replyImage");
    assert.equal((await dat.request("/discussions/" + discussion._id + "/replies", {
      method: "POST", body: replyForm, redirect: "manual",
    })).status, 302);
    reply = await Reply.findOne({ discussionId: discussion._id });
    assert.ok(reply);
    createdImages.add(reply.image);
    const detail = await dat.request("/discussions/" + discussion._id);
    assert.match(await detail.text(), new RegExp('id="reply-' + reply._id + '"'));

    assert.equal((await dat.request("/discussions/" + discussion._id + "/delete", {
      method: "POST", redirect: "manual",
    })).status, 302);
    assert.ok((await Discussion.findById(discussion._id)).deletedAt);
    const replyBase = "/discussions/" + discussion._id + "/replies/" + reply._id;
    assert.equal((await dat.request(replyBase + "/edit", { redirect: "manual" })).status, 404);
    assert.equal((await dat.request(replyBase + "/delete", {
      method: "POST", redirect: "manual",
    })).status, 404);

    const afterDeleteFiles = fs.readdirSync(uploadsDirectory).sort();
    for (const route of ["/discussions/" + discussion._id + "/replies", replyBase + "/edit"]) {
      const rejectedReply = new FormData();
      rejectedReply.append("replyTitle", "A deleted parent must stay closed");
      rejectedReply.append("replyContent", "No new or edited Reply is allowed below a deleted Discussion.");
      addForumTestImage(rejectedReply, "replyImage");
      assert.equal((await dat.request(route, {
        method: "POST", body: rejectedReply, redirect: "manual",
      })).status, 404);
      assert.deepEqual(fs.readdirSync(uploadsDirectory).sort(), afterDeleteFiles);
    }

    const retainedReply = await Reply.findById(reply._id);
    assert.ok(retainedReply);
    assert.equal(retainedReply.deletedAt, null);
    const list = await dat.request("/discussions");
    assert.equal((await list.text()).includes(title), false);
  } finally {
    for (const imagePath of createdImages) removeForumTestImage(imagePath);
    if (reply) await Reply.deleteOne({ _id: reply._id });
    if (discussion) await Discussion.deleteOne({ _id: discussion._id });
  }

  assert.deepEqual(fs.readdirSync(uploadsDirectory).sort(), beforeFiles);
});

test("Forum checks image bytes on every create and edit upload route", async () => {
  const dat = new BrowserSession();
  const login = await dat.login("dat.pham", "ConnectDemo!26");
  const uploadsDirectory = path.join(__dirname, "..", "public", "uploads");
  const beforeFiles = fs.readdirSync(uploadsDirectory).sort();
  const marker = "Image signature test " + Date.now();
  const createdImages = new Set();
  const pngImage = fs.readFileSync(path.join(__dirname, "..", "public", "images", "user_icon.png"));
  let discussion;
  let reply;

  try {
    const form = new FormData();
    form.append("postTitle", marker);
    form.append("postContent", "A genuine PNG must still be accepted.");
    form.append("postImage", new Blob([pngImage], { type: "image/png" }), "valid.png");
    const created = await dat.request("/discussions", {
      method: "POST", body: form, redirect: "manual",
    });
    discussion = await Discussion.findOne({ title: marker });
    if (discussion) createdImages.add(discussion.image);
    assert.equal(created.status, 302);
    assert.ok(discussion);
    const successfulPage = await dat.request("/discussions");
    const successfulHtml = await successfulPage.text();
    assert.ok(successfulHtml.includes('data-user-id="' + login.data.user.id + '"'));
    assert.match(successfulHtml, /data-clear-draft="true"/);
    assert.match(await (await dat.request("/discussions")).text(), /data-clear-draft="false"/);

    const replyForm = new FormData();
    replyForm.append("replyTitle", marker + " reply");
    replyForm.append("replyContent", "A genuine JPEG must still be accepted.");
    addForumTestImage(replyForm, "replyImage");
    const createdReply = await dat.request("/discussions/" + discussion._id + "/replies", {
      method: "POST", body: replyForm, redirect: "manual",
    });
    reply = await Reply.findOne({ discussionId: discussion._id });
    if (reply) createdImages.add(reply.image);
    assert.equal(createdReply.status, 302);
    assert.ok(reply);
    const validFiles = fs.readdirSync(uploadsDirectory).sort();
    const discussionBefore = (await Discussion.findById(discussion._id)).toObject();
    const replyBefore = (await Reply.findById(reply._id)).toObject();
    const routes = [
      ["/discussions", "post"],
      ["/discussions/" + discussion._id + "/edit", "post"],
      ["/discussions/" + discussion._id + "/replies", "reply"],
      ["/discussions/" + discussion._id + "/replies/" + reply._id + "/edit", "reply"],
    ];
    const invalidImages = [
      ["image/jpeg", Buffer.from("Plain text is not a JPEG.")],
      ["image/png", Buffer.from("Plain text is not a PNG.")],
      ["image/jpeg", pngImage],
      ["image/png", Buffer.from([0x89, 0x50])],
    ];

    for (const [route, prefix] of routes) {
      for (const [type, bytes] of invalidImages) {
        const invalid = new FormData();
        invalid.append(prefix + "Title", marker + " rejected");
        invalid.append(prefix + "Content", "This rejected upload must not change the database.");
        invalid.append(prefix + "Image", new Blob([bytes], { type }), "invalid-image.jpg");
        const rejected = await dat.request(route, {
          method: "POST", body: invalid, redirect: "manual",
        });
        assert.equal(rejected.status, 400, route + " / " + type);
        assert.match(await rejected.text(), /JPEG and PNG images/i);
        assert.deepEqual(fs.readdirSync(uploadsDirectory).sort(), validFiles);
        assert.deepEqual((await Discussion.findById(discussion._id)).toObject(), discussionBefore);
        assert.deepEqual((await Reply.findById(reply._id)).toObject(), replyBefore);
        assert.equal(await Discussion.countDocuments({ title: marker + " rejected" }), 0);
        assert.equal(await Reply.countDocuments({ title: marker + " rejected" }), 0);
      }
    }
  } finally {
    // Clean only documents and uploads created by this test, including a failed assertion.
    const testDiscussions = await Discussion.find({ title: { $in: [marker, marker + " rejected"] } });
    if (discussion && !testDiscussions.some((item) => String(item._id) === String(discussion._id))) {
      const edited = await Discussion.findById(discussion._id);
      if (edited) testDiscussions.push(edited);
    }
    for (const item of testDiscussions) {
      createdImages.add(item.image);
      const testReplies = await Reply.find({ discussionId: item._id });
      for (const testReply of testReplies) createdImages.add(testReply.image);
      await Reply.deleteMany({ discussionId: item._id });
      await Discussion.deleteOne({ _id: item._id });
    }
    for (const imagePath of createdImages) removeForumTestImage(imagePath);
  }
  assert.deepEqual(fs.readdirSync(uploadsDirectory).sort(), beforeFiles);
});

test("a malformed new reset link cannot reuse the previous session token", async () => {
  for (const query of ["token=invalid", "token=", "token%5B%5D=invalid"]) {
    const account = new BrowserSession();
    assert.equal((await account.request("/reset-password?token=" + "a".repeat(64))).status, 200);
    const invalid = await account.request("/reset-password?" + query, { redirect: "manual" });
    assert.equal(invalid.status, 302, query);
    assert.equal(invalid.headers.get("location"), "/forgot-password");
    const retry = await account.request("/reset-password", { redirect: "manual" });
    assert.equal(retry.status, 302);
  }
});

test("Logout also clears password-reset access from the shared session", async () => {
  const dat = new BrowserSession();
  await dat.login("dat.pham", "ConnectDemo!26");
  await dat.request("/reset-password?token=" + "b".repeat(64));
  assert.equal((await dat.request("/logout")).status, 200);
  const reset = await dat.request("/reset-password", { redirect: "manual" });
  assert.equal(reset.status, 302);
  assert.equal(reset.headers.get("location"), "/forgot-password");
  assert.equal((await dat.request("/api/profile")).status, 401);
  assert.equal((await dat.request("/discussions", { redirect: "manual" })).status, 302);
});

test("root Deactivation requires confirmation and preserves the last active admin", async () => {
  const dat = new BrowserSession();
  const login = await dat.login("dat.pham", "ConnectDemo!26");
  const missingConfirmation = await dat.request("/deactivate-account", {
    method: "POST", body: new URLSearchParams({}),
  });
  assert.equal(missingConfirmation.status, 200);
  assert.match(await missingConfirmation.text(), /Please confirm that you understand/i);
  const lastAdmin = await dat.request("/deactivate-account", {
    method: "POST", body: new URLSearchParams({ "deactivate-id-confirm": "confirmed" }),
    redirect: "manual",
  });
  assert.equal(lastAdmin.status, 409);
  assert.equal((await User.findById(login.data.user.id)).status, "active");
  assert.equal((await dat.request("/api/profile")).status, 200);
});

test("locked and outdated Account sessions cannot upload to the Forum", async () => {
  const admin = new BrowserSession();
  await admin.login("dat.pham", "ConnectDemo!26");
  const account = new BrowserSession();
  const registration = await account.request("/api/users", jsonRequest("POST", {
    username: "forum.guard",
    studentId: "S4899901",
    name: "Forum Guard",
    email: "forum.guard@example.org",
    password: "ForumGuard!26",
    confirmPassword: "ForumGuard!26",
  }));
  assert.equal(registration.status, 201);
  const user = (await registration.json()).data.user;
  const lockedSession = new BrowserSession();
  await lockedSession.login("forum.guard", "ForumGuard!26");
  const uploadsDirectory = path.join(__dirname, "..", "public", "uploads");
  const beforeFiles = fs.readdirSync(uploadsDirectory).sort();

  const lock = await admin.request("/api/admin/users/" + user.id + "/status",
    jsonRequest("PATCH", { status: "locked" }));
  assert.equal(lock.status, 200);

  async function assertUploadDenied(client) {
    const form = new FormData();
    form.append("postTitle", "Inactive session must not create a post");
    form.append("postContent", "This request must be rejected before an upload is saved.");
    addForumTestImage(form, "postImage");
    const response = await client.request("/discussions", {
      method: "POST", body: form, redirect: "manual",
    });
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location"), /^\/login\.html/);
    assert.deepEqual(fs.readdirSync(uploadsDirectory).sort(), beforeFiles);
  }
  await assertUploadDenied(lockedSession);

  const unlock = await admin.request("/api/admin/users/" + user.id + "/status",
    jsonRequest("PATCH", { status: "active" }));
  assert.equal(unlock.status, 200);
  const oldSession = new BrowserSession();
  const currentSession = new BrowserSession();
  await oldSession.login("forum.guard", "ForumGuard!26");
  await currentSession.login("forum.guard", "ForumGuard!26");
  const changePassword = await currentSession.request("/api/profile", jsonRequest("PATCH", {
    currentPassword: "ForumGuard!26",
    newPassword: "ForumChanged!26",
  }));
  assert.equal(changePassword.status, 200);
  await assertUploadDenied(oldSession);
  assert.equal((await currentSession.request("/discussions")).status, 200);
});
