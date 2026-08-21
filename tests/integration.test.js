const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const { discussions, replies } = require("../forum-data");
const { startServer } = require("../index");

let server;
let baseUrl;

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

before(async () => {
  server = await startServer(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
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
  assert.equal(login.data.user.id, "user-dat");

  for (const route of ["/api/current-user", "/api/products", "/api/wishlist", "/api/profile"] ) {
    const response = await dat.request(route);
    assert.equal(response.status, 200, route);
  }

  const forum = await dat.request("/discussions");
  assert.equal(forum.status, 200);

  const logout = await dat.request("/logout");
  assert.equal(logout.status, 200);

  const state = await dat.request("/api/session");
  assert.equal((await state.json()).data.authenticated, false);
});

test("Blog supports validated, owned CRUD, comments, and documented image sizes", async () => {
  const dat = new BrowserSession();
  await dat.login("dat.pham", "ConnectDemo!26");

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
  assert.equal(created.authorId, "user-dat");
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
  await dat.login("dat.pham", "ConnectDemo!26");
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
  assert.equal(created.userId, "user-dat");
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
  await dat.login("dat.pham", "ConnectDemo!26");

  const invalid = await dat.request("/discussions", {
    method: "POST",
    body: new URLSearchParams({ postTitle: "", postContent: "", postImage: "" }),
    redirect: "manual",
  });
  assert.equal(invalid.status, 400);

  const title = `Integration forum ${Date.now()}`;
  const create = await dat.request("/discussions", {
    method: "POST",
    body: new URLSearchParams({
      postTitle: title,
      postContent: "This temporary discussion verifies the integrated Forum workflow.",
      postImage: "/images/peer-workshop.jpg",
    }),
    redirect: "manual",
  });
  assert.equal(create.status, 302);
  const discussion = discussions.find((item) => item.title === title);
  assert.ok(discussion);

  const replyTitle = `Integration reply ${Date.now()}`;
  const createReply = await dat.request(`/discussions/${discussion._id}/replies`, {
    method: "POST",
    body: new URLSearchParams({
      replyTitle,
      replyContent: "This temporary reply verifies creation and normalized image paths.",
      replyImage: "peer-workshop.jpg",
    }),
    redirect: "manual",
  });
  assert.equal(createReply.status, 302);
  const reply = replies.find((item) => item.title === replyTitle);
  assert.equal(reply.image, "/images/peer-workshop.jpg");

  const forbidden = await dat.request("/discussions/discussion-3/edit");
  assert.equal(forbidden.status, 403);
  const missing = await dat.request("/discussions/not-real");
  assert.equal(missing.status, 404);

  const deleteReply = await dat.request(
    `/discussions/${discussion._id}/replies/${reply._id}/delete`,
    { method: "POST", redirect: "manual" }
  );
  assert.equal(deleteReply.status, 302);

  const remove = await dat.request(`/discussions/${discussion._id}/delete`, {
    method: "POST",
    redirect: "manual",
  });
  assert.equal(remove.status, 302);
  assert.equal((await dat.request(`/discussions/${discussion._id}`)).status, 404);
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
