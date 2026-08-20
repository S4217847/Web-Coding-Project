const mongoose = require("mongoose");

// Define the fields saved for one RMIT Connect user

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  studentId: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  shortDescription: {
    type: String,
  },
  profileImage: {
    type: String,
  },
  course: {
    type: String,
  },
  accountStatus: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Use the name User because authorId refer to this model

const User = mongoose.model("User", userSchema);

module.exports = { User };
