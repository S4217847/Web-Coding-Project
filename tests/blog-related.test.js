const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
  const reviewId = "a3b200000000000000000001";
  const productId = "a3b200000000000000000002";
  const reviews = [{ _id: reviewId, id: 17, title: "A useful course", courseCode: "COSC1076", rating: 4 }];
  const products = [{ _id: productId, slug: "peer-workshop", name: "Workshop", priceVnd: 30000, isActive: true }];
  function model(rows) {
    const matches = filter => rows.filter(row => Object.entries(filter).every(([key, value]) => String(row[key]) === String(value)));
    const query = value => ({ select() { return this; }, sort() { return this; }, async lean() { return value; } });
    return { find: filter => query(matches(filter || {})), findOne: filter => query(matches(filter)[0] || null), findById: id => query(matches({ _id: id })[0] || null), exists: async filter => matches(filter)[0] || null };
  }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../routes/blog-related.js"), "utf8"), {
    module, require(name) {
      if (name === "mongoose") return { isObjectIdOrHexString: id => /^[a-f0-9]{24}$/i.test(id) };
      if (name === "../models/review") return { Review: model(reviews) };
      if (name === "../models/product") return { Product: model(products) };
      throw new Error(name);
    },
  });
  return { ...module.exports, reviewId, productId, reviews, products };
}

test("options include Review ObjectIds and only active products", async () => {
  const f = fixture();
  const options = await f.relatedOptions();
  assert.equal(options.reviews[0].id, f.reviewId);
  assert.equal(options.products[0].id, f.productId);
  f.products[0].isActive = false;
  assert.equal((await f.relatedOptions()).products.length, 0);
});

test("new links reject malformed, missing and inactive targets", async () => {
  const f = fixture();
  assert.ok((await f.validateRelated({ reviewId: "bad" })).errors.reviewId);
  assert.ok((await f.validateRelated({ reviewId: "ffffffffffffffffffffffff" })).errors.reviewId);
  f.products[0].isActive = false;
  assert.ok((await f.validateRelated({ productId: f.productId })).errors.productId);
});

test("valid links save; omitted links are preserved and null clears", async () => {
  const f = fixture();
  const result = await f.validateRelated({ reviewId: f.reviewId, productId: f.productId });
  assert.equal(Object.keys(result.errors).length, 0);
  assert.equal(result.values.reviewId, f.reviewId);
  assert.equal(Object.keys((await f.validateRelated({}, { reviewId: f.reviewId })).values).length, 0);
  assert.equal((await f.validateRelated({ reviewId: null })).values.reviewId, null);
  f.products[0].isActive = false;
  assert.equal(Object.keys((await f.validateRelated({ productId: f.productId }, { productId: f.productId })).errors).length, 0);
});

test("detail uses numeric Review URL and product slug; deleted targets degrade safely", async () => {
  const f = fixture();
  const blog = { reviewId: f.reviewId, productId: f.productId };
  const detail = await f.relatedResponse(blog);
  assert.equal(detail.relatedReview.href, "/reviews/17");
  assert.equal(detail.relatedProduct.slug, "peer-workshop");
  f.reviews.length = 0;
  f.products[0].isActive = false;
  const unavailable = await f.relatedResponse(blog);
  assert.equal(unavailable.relatedReview, null);
  assert.equal(unavailable.relatedProduct, null);
  assert.equal(unavailable.reviewId, f.reviewId);
});
