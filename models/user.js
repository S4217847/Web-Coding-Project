const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  studentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  passwordChangedAt: { type: Date, default: null },
  recoveryPasswordHash: { type: String, default: null },
  recoveryPasswordSetAt: { type: Date, default: null },
  recoveryFailedAttempts: { type: Number, default: 0, min: 0 },
  recoveryAttemptWindowStartedAt: { type: Date, default: null },
  recoveryBlockedUntil: { type: Date, default: null },
  description: { type: String, required: true },
  avatarUrl: { type: String, default: "/images/user_icon.png" },
  course: { type: String, default: "" },
  role: { type: String, default: "member" },
  status: { type: String, default: "active" },
  lastActiveAt: { type: Date, default: null },
  lockedAt: { type: Date, default: null },
  deactivatedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);

module.exports = { User };
