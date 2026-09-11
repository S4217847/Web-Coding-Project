const mongoose = require("mongoose");
const { Review } = require("../models/review");
const { Product } = require("../models/product");

async function relatedOptions() {
  const [reviews, products] = await Promise.all([
    Review.find().select("_id id title courseCode rating").sort({ courseCode: 1, title: 1 }).lean(),
    Product.find({ isActive: true }).select("_id slug name priceVnd").sort({ name: 1 }).lean(),
  ]);
  return {
    reviews: reviews.map(r => ({ id: String(r._id), label: `${r.courseCode} - ${r.title} (${r.rating}/5)` })),
    products: products.map(p => ({ id: String(p._id), label: p.name })),
  };
}

async function validateRelated(input, existing = {}) {
  const values = {};
  const errors = {};
  for (const [field, Model] of [["reviewId", Review], ["productId", Product]]) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    const id = input[field];
    if (id === null || id === "") { values[field] = null; continue; }
    if (typeof id !== "string" || !mongoose.isObjectIdOrHexString(id)) {
      errors[field] = "Choose a valid related item."; continue;
    }
    if (existing[field] && String(existing[field]) === id) { values[field] = id; continue; }
    const filter = { _id: id, ...(field === "productId" ? { isActive: true } : {}) };
    if (!await Model.exists(filter)) errors[field] = "This item is no longer available. Choose another or remove the link.";
    else values[field] = id;
  }
  return { values, errors };
}

async function relatedResponse(blog) {
  const [review, product] = await Promise.all([
    blog.reviewId ? Review.findById(blog.reviewId).select("id title courseCode rating").lean() : null,
    blog.productId ? Product.findOne({ _id: blog.productId, isActive: true }).select("slug name priceVnd image imageAlt").lean() : null,
  ]);
  return {
    reviewId: blog.reviewId ? String(blog.reviewId) : null,
    productId: blog.productId ? String(blog.productId) : null,
    relatedReview: review ? { title: review.title, courseCode: review.courseCode, rating: review.rating, href: `/reviews/${review.id}` } : null,
    relatedProduct: product ? { name: product.name, slug: product.slug, priceVnd: product.priceVnd, image: product.image, imageAlt: product.imageAlt } : null,
  };
}
module.exports = { relatedOptions, validateRelated, relatedResponse };
