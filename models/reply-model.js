const mongoose = require("mongoose");

// Shared field names: authorId stores the User _id and createdAt stores the creation time.
// Defines the fields saved for one reply under a Discussion post.
const replySchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  image: {
    // Stores the image file name or path selected for the reply.
    type: String,
    required: true,
  },
  authorId: {
    // Links this reply to the User who created it.
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  discussionId: {
    // Links this reply to the Discussion post it belongs to.
    type: mongoose.Schema.Types.ObjectId,
    ref: "Discussion",
    required: true,
  },
  createdAt: {
    // Adds the current time automatically when a reply is created.
    type: Date,
    default: Date.now,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
});

// Creates the Reply model used to read and save replies.
const Reply = mongoose.model("Reply", replySchema);

module.exports = { Reply };
