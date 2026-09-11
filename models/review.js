const mongoose = require("mongoose");

const { Schema } = mongoose;

/* `id` preserves the existing numeric Review URLs; userId owns the Review. */
const reviewSchema = new Schema(
  {
    id: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: "Review ID must be a positive whole number." },
    },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    courseCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{4}\d{4}$/, "Course code must use four letters followed by four digits."],
    },
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 100 },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 1000 },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: "Rating must be a whole number between 1 and 5." },
    },
    reviewerName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
      maxlength: 6_000_000,
      default: "/images/review-placeholder.jpg",
    },
  },
  { timestamps: true, collection: "reviews" },
);

reviewSchema.index({ id: 1 }, { unique: true });
reviewSchema.index({ userId: 1, createdAt: -1 });
reviewSchema.index({ courseCode: 1, createdAt: -1 });
reviewSchema.index({ rating: -1, createdAt: -1 });
reviewSchema.index({ courseCode: "text", title: "text", description: "text", reviewerName: "text" });

reviewSchema.set("toJSON", {
  virtuals: true,
  transform(_document, result) {
    delete result.__v;
    return result;
  },
});

const Review = mongoose.models.Review || mongoose.model("Review", reviewSchema);

module.exports = { Review, reviewSchema };
