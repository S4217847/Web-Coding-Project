const test = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../dev-server");
const { normaliseUser } = require("../routes/blog-routes");

test("normalises the shared in-memory account user shape", () => {
  const user = normaliseUser({
    id: "user-001",
    username: "Minh",
    studentId: "s4199268"
  });
  assert.deepEqual(user, {
    id: "user-001",
    name: "Minh",
    sid: "s4199268"
  });
});

test("Blog API retrieval, validation, ownership, CRUD, and comments", async (t) => {
  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  let blogId;

  async function api(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options);
    const data = response.status === 204 ? null : await response.json();
    return { response, data };
  }

  await t.test("retrieves blogs and missing records", async () => {
    const list = await api("/api/blogs");
    assert.equal(list.response.status, 200);
    assert.ok(Array.isArray(list.data));

    const missing = await api("/api/blogs/missing");
    assert.equal(missing.response.status, 404);
  });

  await t.test("rejects malformed JSON and invalid blog data", async () => {
    const malformed = await api("/api/blogs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{bad json"
    });
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.data.error, "Request body contains invalid JSON.");

    const wrongContentType = await api("/api/blogs", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not json"
    });
    assert.equal(wrongContentType.response.status, 400);

    const invalid = await api("/api/blogs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Bad", content: "short", category: "", tags: [] })
    });
    assert.equal(invalid.response.status, 400);
    assert.ok(invalid.data.errors.title);
    assert.ok(invalid.data.errors.category);
    assert.ok(invalid.data.errors.tags);
  });

  await t.test("requires a logged-in user and derives the author", async () => {
    const body = JSON.stringify({
      title: "A valid test blog",
      category: "Academic",
      tags: ["Testing"],
      content: "This is long enough to be valid blog content.",
      image: ""
    });
    const anonymous = await api("/api/blogs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "anonymous" },
      body
    });
    assert.equal(anonymous.response.status, 401);

    const created = await api("/api/blogs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "user-001" },
      body
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.authorId, "user-001");
    blogId = created.data.id;
  });

  await t.test("enforces ownership when editing", async () => {
    const update = JSON.stringify({
      title: "Updated valid test blog",
      category: "Technology",
      tags: ["Testing", "Updated"],
      content: "The owner has updated this sufficiently long blog content.",
      image: ""
    });
    const forbidden = await api(`/api/blogs/${blogId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-user-id": "user-002" },
      body: update
    });
    assert.equal(forbidden.response.status, 403);

    const allowed = await api(`/api/blogs/${blogId}`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-user-id": "user-001" },
      body: update
    });
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.data.category, "Technology");
  });

  await t.test("validates and creates comments for the current user", async () => {
    const invalid = await api(`/api/blogs/${blogId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "user-002" },
      body: JSON.stringify({ content: "" })
    });
    assert.equal(invalid.response.status, 400);

    const created = await api(`/api/blogs/${blogId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": "user-002" },
      body: JSON.stringify({ content: "A useful test comment." })
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.data.authorId, "user-002");

    const detail = await api(`/api/blogs/${blogId}`);
    assert.equal(detail.data.comments.length, 1);
    assert.equal(detail.data.comments[0].content, "A useful test comment.");
  });

  await t.test("enforces ownership and soft deletes", async () => {
    const forbidden = await api(`/api/blogs/${blogId}`, {
      method: "DELETE",
      headers: { "x-user-id": "user-002" }
    });
    assert.equal(forbidden.response.status, 403);

    const removed = await api(`/api/blogs/${blogId}`, {
      method: "DELETE",
      headers: { "x-user-id": "user-001" }
    });
    assert.equal(removed.response.status, 204);

    const missing = await api(`/api/blogs/${blogId}`);
    assert.equal(missing.response.status, 404);
  });

  server.close();
});
