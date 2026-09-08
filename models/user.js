const mongoose = require("mongoose");

const { Schema } = mongoose;

/*
 * One shared User collection is used by the Account, Administration, Blog,
 * Discussion Forum, Review, and Wishlist modules. Normalising identifiers
 * before storage prevents values such as DAT.PHAM and dat.pham becoming two
 * ordinary application accounts.
 */
const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 50,
      match: [
        /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/,
        "Username may contain letters, numbers, dots, underscores, and hyphens.",
      ],
    },
    studentId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [/^S\d{7}$/, "Student ID must use the format S1234567."],
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Email must be a valid email address.",
      ],
    },
    /*
     * Only a bcrypt hash is stored. select:false prevents an ordinary query
     * from exposing it; login code opts in with .select("+passwordHash").
     */
    passwordHash: {
      type: String,
      required: true,
      select: false,
      minlength: 59,
      maxlength: 255,
      match: [
        /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/,
        "Password must be stored as a bcrypt hash.",
      ],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    avatarUrl: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "/images/user_icon.png",
    },
    course: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    role: {
      type: String,
      required: true,
      enum: ["member", "admin"],
      default: "member",
    },
    status: {
      type: String,
      required: true,
      enum: ["active", "locked", "deactivated"],
      default: "active",
    },
    /* Incrementing this value revokes sessions created under an older version. */
    authVersion: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Authentication version must be a non-negative integer.",
      },
    },
    lastActiveAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
    deactivatedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: "users",
  },
);

/* Account lookups and the compound filter used by the administration table. */
userSchema.index({ username: 1 }, { unique: true });
userSchema.index({ studentId: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ status: 1, name: 1, username: 1 });
userSchema.index({ role: 1 });

/* Free-text administration search across the public identity fields. */
userSchema.index({
  name: "text",
  username: "text",
  studentId: "text",
  email: "text",
});

/* Keep credentials and Mongoose's version key out of accidental JSON output. */
userSchema.set("toJSON", {
  virtuals: true,
  transform(document, result) {
    delete result.passwordHash;
    delete result.__v;
    return result;
  },
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

module.exports = { User, userSchema };
