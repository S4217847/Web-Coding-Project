const mongoose = require("mongoose");

// Shared field names: authorId stores the User _id and createdAt stores the creation time.
// Defines the fields saved for one Discussion Forum post.
const discussionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  image: {
    // Stores the image file name or path for the post.
    type: String,
    required: true,
  },
  authorId: {
    // Links this post to the User who created it.
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  // Record a delete without removing the post from the database (soft delete)
  deletedAt: {
    type: Date,
    default: null,
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  createdAt: {
    // Adds the current time automatically when a post is created.
    type: Date,
    default: Date.now,
  },
});

// Creates the Discussion model used to read and save Discussion Forum posts.
const Discussion = mongoose.model("Discussion", discussionSchema);

module.exports = { Discussion };
