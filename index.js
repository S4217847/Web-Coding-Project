const express = require("express");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const multer = require("multer");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { rateLimit } = require("express-rate-limit");
const { connectDatabase } = require("./database");
const { User } = require("./models/user");
const { Discussion } = require("./models/discussion");
const { Reply } = require("./models/reply");
const { Review } = require("./models/review");
const { Product } = require("./models/product");
const { upload, validateForumImage, forumImageDataUrl } = require("./upload");
const { Blog } = require("./models/blog");
const { registerBlogApi } = require("./routes/register-blog-api");
let accountRepository = null;
const app = express();
let accountAppMounted = false;
// Uses the PORT environment variable when provided. Otherwise, it uses port 3000.
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret =
  process.env.SESSION_SECRET || "local-demo-change-this-secret";
const accountApiPath =
  /^\/api\/(?:users|session|products|wishlist|profile|admin)(?:\/|$)/i;
const keepExistingProductValue = "__keep-existing-product__";
const keepExistingReviewValue = "__keep-existing-review__";
const passwordHelpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler(request, response) {
    if (request.path === "/forgot-password") {
      response.status(429).render("forgotpassword", {
        pageTitle: "Forgot Password",
        emailError: "Too many requests. Please wait before trying again.",
        resetMessage: "",
        resetLink: "",
      });
      return;
    }

    response.status(429).render("resetpassword", {
      pageTitle: "Reset Password",
      resetComplete: false,
      newPasswordError: "Too many requests. Please wait before trying again.",
      confirmPasswordError: "",
    });
  },
});

/* Production sessions use Atlas too; local tests keep Express's MemoryStore. */
const sessionStore =
  isProduction && process.env.MONGODB_URI
    ? MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        dbName: process.env.MONGODB_DB_NAME || "rmit_connect",
        collectionName: "sessions",
        touchAfter: 15 * 60,
        crypto: { secret: sessionSecret },
      })
    : undefined;

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required when NODE_ENV is production.");
}

// Sets EJS as the file type used to build the page on the server.
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.disable("x-powered-by");

if (isProduction) {
  app.set("trust proxy", 1);
}

// Apply one security policy before any team module registers routes.
app.use((_request, response, next) => {
  response.set({
    "Content-Security-Policy":
      "default-src 'self'; " +
      "img-src 'self' data: https:; " +
      "script-src 'self'; " +
      "style-src 'self'; " +
      "connect-src 'self'; " +
      "object-src 'none'; " +
      "base-uri 'self'; " +
      "frame-ancestors 'none'; " +
      "form-action 'self'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  });
  next();
});

// API responses may contain account data and must never be cached.
app.use("/api", (_request, response, next) => {
  response.set("Cache-Control", "no-store");
  next();
});

/* Password-recovery pages can contain a short-lived local demonstration URL. */
app.use(
  ["/forgot-password", "/reset-password"],
  (_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  },
);

/*
 * Account/Profile images are limited to 1 MiB, so their JSON transport does
 * not need the larger Blog/Review allowance. Parsing these routes first also
 * enforces the limit for chunked requests without a Content-Length header.
 */
const accountJsonParser = express.json({ limit: "1.5mb", strict: true });
app.use((request, response, next) => {
  if (!accountApiPath.test(request.path)) return next();
  return accountJsonParser(request, response, next);
});

/*
 * Base64 expands a 4 MB image to roughly 5.4 MB. A 6 MB JSON limit therefore
 * supports the documented Blog and Review image ceiling without accepting
 * unbounded request bodies.
 */
app.use(express.json({ limit: "6mb", strict: true }));
app.use(
  session({
    name: "rmit.connect.sid",
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    ...(sessionStore ? { store: sessionStore } : {}),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 2 * 60 * 60 * 1000,
    },
  }),
);
// Reads values sent from normal HTML forms.
app.use(express.urlencoded({ extended: true, limit: "256kb" }));
// Makes files inside public available to the browser, such as CSS and JavaScript.
app.use(express.static(path.join(__dirname, "public")));

async function showHome(request, response) {
  const currentUser = await getCurrentUser(request);

  response.render("index", {
    pageTitle: "RMIT Connect",
    sessionAction: currentUser ? "logout" : "login",
  });
}

async function showSitemap(request, response) {
  const currentUser = await getCurrentUser(request);
  const activeDiscussions = await Discussion.find({
    deletedAt: null,
  });

  const activeDiscussionIds = [];

  for (let i = 0; i < activeDiscussions.length; i += 1) {
    activeDiscussionIds.push(activeDiscussions[i]._id);
  }

  const activeReplies = await Reply.find({
    discussionId: { $in: activeDiscussionIds },
    deletedAt: null,
  });
  const reviews = await Review.find().sort({ createdAt: -1 });
  const databaseBlogs = await Blog.find({ deletedAt: null })
    .select("_id title")
    .sort({ createdAt: -1 })
    .lean();
  const activeBlogs = databaseBlogs.map((blog) => ({
    id: String(blog._id),
    title: blog.title,
  }));

  response.render("sitemap", {
    pageTitle: "Site Map",
    sessionAction: currentUser ? "logout" : "login",
    discussions: activeDiscussions,
    replies: activeReplies,
    blogs: activeBlogs,
    reviews: reviews,
  });
}

function redirectForumLogin(response) {
  response.redirect("/login.html?returnTo=discussions");
}

function getTrimmedFormText(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function removeUploadedForumImage(uploadedFile) {
  if (uploadedFile?.path) {
    await fs.unlink(uploadedFile.path);
  }
}

function redirectAfterForumMutation(response, location) {
  // Vercel preserves POST for its serverless redirect path, so explicitly
  // switch to GET there. Existing local browser behaviour remains unchanged.
  response.redirect(process.env.VERCEL === "1" ? 303 : 302, location);
}

async function requireForumLogin(request, response, next) {
  try {
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      redirectForumLogin(response);
      return;
    }

    const forumUser = await getForumDatabaseUser(currentUser);

    if (!forumUser) {
      response.status(403).send("Forum user not found.");
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

function isValidDatabaseId(databaseId) {
  return (
    typeof databaseId === "string" && /^[0-9a-f]{24}$/i.test(databaseId)
  );
}

async function findActiveProduct(productSlug) {
  const normalisedProductSlug = String(productSlug || "")
    .trim()
    .toLowerCase();

  if (
    !normalisedProductSlug ||
    normalisedProductSlug.length > 80 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalisedProductSlug)
  ) {
    return null;
  }

  return Product.findOne({
    slug: normalisedProductSlug,
    isActive: true,
  });
}

async function findReviewByDatabaseId(reviewId) {
  if (!isValidDatabaseId(reviewId)) {
    return null;
  }

  return Review.findById(reviewId).select("_id id courseCode title");
}

async function findActiveDiscussion(discussionId) {
  if (!isValidDatabaseId(discussionId)) {
    return null;
  }

  const discussion = await Discussion.findById(discussionId);

  if (!discussion || discussion.deletedAt !== null) {
    return null;
  }

  return discussion;
}

async function findActiveReply(replyId, discussionId) {
  if (!isValidDatabaseId(replyId)) {
    return null;
  }

  const reply = await Reply.findById(replyId);

  if (
    !reply ||
    reply.deletedAt !== null ||
    String(reply.discussionId) !== String(discussionId)
  ) {
    return null;
  }

  return reply;
}

// Show all active discussions.
async function showDiscussions(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  const forumUser = await getForumDatabaseUser(currentUser);

  if (!forumUser) {
    response.status(403).send("Forum user not found.");
    return;
  }

  const discussionMessage = request.session.discussionMessage || "";
  request.session.discussionMessage = "";
  const clearDiscussionDraft = request.session.clearDiscussionDraft === true;
  request.session.clearDiscussionDraft = false;

  const activeProducts = await Product.find({
    isActive: true,
  }).sort({ name: 1 });

  const availableReviews = await Review.find()
    .select("_id id courseCode title")
    .sort({ courseCode: 1, title: 1 });

  const requestedProductSlug = request.query.product;
  let selectedProduct = null;
  let productFilterMessage = "";

  if (requestedProductSlug !== undefined) {
    if (typeof requestedProductSlug === "string") {
      selectedProduct = await findActiveProduct(requestedProductSlug);
    }

    if (!selectedProduct) {
      productFilterMessage =
        "That related item is unavailable. Showing all discussions.";
    }
  }

  const discussionQuery = {
    deletedAt: null,
  };

  if (selectedProduct) {
    discussionQuery.productId = selectedProduct._id;
  }

  const activeDiscussions = await Discussion.find(discussionQuery);

  const discussionIds = [];
  const discussionAuthorIds = [];

  for (let i = 0; i < activeDiscussions.length; i += 1) {
    discussionIds.push(activeDiscussions[i]._id);
    discussionAuthorIds.push(activeDiscussions[i].authorId);
  }

  const activeReplies = await Reply.find({
    discussionId: { $in: discussionIds },
    deletedAt: null,
  });

  const forumUsers = await User.find({
    _id: { $in: discussionAuthorIds },
  });

  const replyCounts = [];
  const authors = [];
  const titleSearchTexts = [];
  const contentSearchTexts = [];
  const latestActivityTimes = [];
  const relatedProducts = [];

  for (let i = 0; i < activeDiscussions.length; i += 1) {
    let replyCount = 0;
    let titleSearchText = activeDiscussions[i].title;
    let contentSearchText = activeDiscussions[i].content;
    let latestActivityTime = activeDiscussions[i].createdAt.getTime();
    let relatedProduct = null;
    let author = {
      username: "Unknown user",
      profileImage: "/images/user_icon.png",
      course: "",
    };

    for (let j = 0; j < activeReplies.length; j += 1) {
      if (
        String(activeReplies[j].discussionId) ===
        String(activeDiscussions[i]._id)
      ) {
        replyCount += 1;
        contentSearchText += " " + activeReplies[j].content;

        if (activeReplies[j].createdAt.getTime() > latestActivityTime) {
          latestActivityTime = activeReplies[j].createdAt.getTime();
        }
      }
    }

    for (let j = 0; j < forumUsers.length; j += 1) {
      if (
        String(forumUsers[j]._id) ===
        String(activeDiscussions[i].authorId)
      ) {
        author = {
          username: forumUsers[j].name,
          profileImage:
            forumUsers[j].avatarUrl || "/images/user_icon.png",
          course: forumUsers[j].course,
        };
      }
    }

    for (let j = 0; j < activeProducts.length; j += 1) {
      if (
        activeDiscussions[i].productId &&
        String(activeProducts[j]._id) ===
          String(activeDiscussions[i].productId)
      ) {
        relatedProduct = activeProducts[j];
      }
    }

    replyCounts.push(replyCount);
    authors.push(author);
    titleSearchTexts.push(titleSearchText);
    contentSearchTexts.push(contentSearchText);
    latestActivityTimes.push(latestActivityTime);
    relatedProducts.push(relatedProduct);
  }

  response.render("discussion", {
    pageTitle: "Discussion Forum",
    currentUserId: String(forumUser._id),
    clearDiscussionDraft: clearDiscussionDraft,
    discussions: activeDiscussions,
    products: activeProducts,
    reviews: availableReviews,
    selectedProduct: selectedProduct,
    productFilterMessage: productFilterMessage,
    relatedProducts: relatedProducts,
    replyCounts: replyCounts,
    authors: authors,
    titleSearchTexts: titleSearchTexts,
    contentSearchTexts: contentSearchTexts,
    latestActivityTimes: latestActivityTimes,
    discussionMessage: discussionMessage,
  });
}

async function showDiscussionDetail(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  const forumUser = await getForumDatabaseUser(currentUser);

  if (!forumUser) {
    response.status(403).send("Forum user not found.");
    return;
  }

  const discussion = await findActiveDiscussion(request.params.id);

  if (!discussion) {
    response.status(404).send("Discussion not found.");
    return;
  }

  let relatedProduct = null;

  if (discussion.productId) {
    relatedProduct = await Product.findOne({
      _id: discussion.productId,
      isActive: true,
    });
  }

  let relatedReview = null;

  if (discussion.reviewId) {
    relatedReview = await Review.findById(discussion.reviewId).select(
      "_id id courseCode title",
    );
  }

  const discussionReplies = await Reply.find({
    discussionId: discussion._id,
    deletedAt: null,
  });

  const forumUserIds = [discussion.authorId];

  for (let i = 0; i < discussionReplies.length; i += 1) {
    forumUserIds.push(discussionReplies[i].authorId);
  }

  const forumUsers = await User.find({
    _id: { $in: forumUserIds },
  });

  let author = {
    username: "Unknown user",
    profileImage: "/images/user_icon.png",
    course: "",
  };

  for (let i = 0; i < forumUsers.length; i += 1) {
    if (String(forumUsers[i]._id) === String(discussion.authorId)) {
      author = {
        username: forumUsers[i].name,
        profileImage: forumUsers[i].avatarUrl || "/images/user_icon.png",
        course: forumUsers[i].course,
      };
    }
  }

  const isAuthor = String(discussion.authorId) === String(forumUser._id);
  const replyAuthors = [];
  const isMyReply = [];

  for (let i = 0; i < discussionReplies.length; i += 1) {
    let replyAuthor = {
      username: "Unknown user",
      profileImage: "/images/user_icon.png",
      course: "",
    };

    for (let j = 0; j < forumUsers.length; j += 1) {
      if (
        String(forumUsers[j]._id) === String(discussionReplies[i].authorId)
      ) {
        replyAuthor = {
          username: forumUsers[j].name,
          profileImage: forumUsers[j].avatarUrl || "/images/user_icon.png",
          course: forumUsers[j].course,
        };
      }
    }

    replyAuthors.push(replyAuthor);
    isMyReply.push(
      String(discussionReplies[i].authorId) === String(forumUser._id),
    );
  }

  response.render("discussion-detail", {
    pageTitle: "Discussion Details",
    discussion: discussion,
    relatedProduct: relatedProduct,
    relatedReview: relatedReview,
    hasRelatedReviewReference: Boolean(discussion.reviewId),
    author: author,
    isAuthor: isAuthor,
    replies: discussionReplies,
    replyAuthors: replyAuthors,
    isMyReply: isMyReply,
  });
}

// Show the edit page only to the author.
async function showEditDiscussion(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  const forumUser = await getForumDatabaseUser(currentUser);

  if (!forumUser) {
    response.status(403).send("Forum user not found.");
    return;
  }

  const discussion = await findActiveDiscussion(request.params.id);

  if (!discussion) {
    response.status(404).send("Discussion not found.");
    return;
  }

  if (String(discussion.authorId) !== String(forumUser._id)) {
    response.status(403).send("You can only edit your own post.");
    return;
  }

  const activeProducts = await Product.find({
    isActive: true,
  }).sort({ name: 1 });

  const availableReviews = await Review.find()
    .select("_id id courseCode title")
    .sort({ courseCode: 1, title: 1 });

  let currentRelatedProduct = null;

  if (discussion.productId) {
    currentRelatedProduct = await Product.findById(discussion.productId);
  }

  let currentRelatedReview = null;

  if (discussion.reviewId) {
    currentRelatedReview = await Review.findById(discussion.reviewId).select(
      "_id id courseCode title",
    );
  }

  response.render("discussion-edit", {
    pageTitle: "Edit Discussion",
    discussion: discussion,
    products: activeProducts,
    reviews: availableReviews,
    currentRelatedProduct: currentRelatedProduct,
    currentRelatedReview: currentRelatedReview,
    keepExistingProductValue: keepExistingProductValue,
    keepExistingReviewValue: keepExistingReviewValue,
  });
}

function makeCurrentUser(loginUser) {
  return {
    _id: loginUser.id,
    username: loginUser.name,
    studentId: loginUser.studentId,
    email: loginUser.email,
    description: loginUser.description,
    profileImage: loginUser.avatarUrl || "/images/user_icon.png",
    course: loginUser.course || "RMIT student",
    accountStatus: loginUser.status,
  };
}

// Resolves the shared Login session through the single MongoDB User source.
async function getCurrentUser(request) {
  if (!request.session || !request.session.userId || !accountRepository) {
    return null;
  }

  const loginUser = await accountRepository.findUserById(
    request.session.userId,
  );

  if (
    !loginUser ||
    loginUser.status !== "active" ||
    request.session.authVersion !== (loginUser.authVersion ?? 0)
  ) {
    await new Promise((resolve) => {
      request.session.destroy(() => resolve());
    });
    return null;
  }

  return makeCurrentUser(loginUser);
}

// Finds the MongoDB User used by the Discussion Forum.
async function getForumDatabaseUser(currentUser) {
  return User.findOne({
    _id: currentUser._id,
    status: "active",
  });
}

// Adapt the authenticated MongoDB account to the Blog API response.
async function getBlogCurrentUser(request) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    return null;
  }

  return {
    id: String(currentUser._id),
    name: currentUser.username,
    sid: currentUser.studentId,
  };
}

// Save a new discussion post from the Discussion Forum form.
async function createDiscussion(request, response) {
  const postTitle = getTrimmedFormText(request.body.postTitle);
  const postContent = getTrimmedFormText(request.body.postContent);
  const postImage = forumImageDataUrl(request.file);

  if (postTitle === "" || postTitle.length > 100) {
    await removeUploadedForumImage(request.file);

    response
      .status(400)
      .send("Please enter a title with 100 characters or less.");
    return;
  }

  if (postContent === "" || postContent.length > 1000) {
    await removeUploadedForumImage(request.file);

    response
      .status(400)
      .send("Please enter content with 1000 characters or less.");
    return;
  }

  if (!postImage) {
    response.status(400).send("Please upload a post image.");
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    await removeUploadedForumImage(request.file);

    redirectForumLogin(response);
    return;
  }

  const forumUser = await getForumDatabaseUser(currentUser);

  if (!forumUser) {
    await removeUploadedForumImage(request.file);

    response.status(403).send("Forum user not found.");
    return;
  }

  const productSlugValue = request.body.productSlug;

  if (
    productSlugValue !== undefined &&
    typeof productSlugValue !== "string"
  ) {
    await removeUploadedForumImage(request.file);

    response.status(400).send("Please select a valid related product.");
    return;
  }

  const productSlug = getTrimmedFormText(productSlugValue);
  let relatedProduct = null;

  if (productSlug !== "") {
    relatedProduct = await findActiveProduct(productSlug);

    if (!relatedProduct) {
      await removeUploadedForumImage(request.file);

      response.status(400).send("Please select a valid related product.");
      return;
    }
  }

  const reviewIdValue = request.body.reviewId;

  if (reviewIdValue !== undefined && typeof reviewIdValue !== "string") {
    await removeUploadedForumImage(request.file);

    response.status(400).send("Please select a valid related review.");
    return;
  }

  const reviewId = getTrimmedFormText(reviewIdValue);
  let relatedReview = null;

  if (reviewId !== "") {
    relatedReview = await findReviewByDatabaseId(reviewId);

    if (!relatedReview) {
      await removeUploadedForumImage(request.file);

      response.status(400).send("Please select a valid related review.");
      return;
    }
  }

  const now = new Date();

  const discussion = new Discussion({
    title: postTitle,
    content: postContent,
    image: postImage,
    authorId: forumUser._id,
    productId: relatedProduct ? relatedProduct._id : null,
    reviewId: relatedReview ? relatedReview._id : null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedBy: null,
  });

  await discussion.save();

  await User.updateOne(
    { _id: forumUser._id },
    {
      lastActiveAt: now,
      updatedAt: now,
    },
  );

  request.session.clearDiscussionDraft = true;
  redirectAfterForumMutation(
    response,
    relatedProduct
      ? "/discussions?product=" + encodeURIComponent(relatedProduct.slug)
      : "/discussions",
  );
}

// Update the selected post.
async function updateDiscussion(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    await removeUploadedForumImage(request.file);

    redirectForumLogin(response);
    return;
  }

  const forumUser = await getForumDatabaseUser(currentUser);

  if (!forumUser) {
    await removeUploadedForumImage(request.file);

    response.status(403).send("Forum user not found.");
    return;
  }

  const discussion = await findActiveDiscussion(request.params.id);

  if (!discussion) {
    await removeUploadedForumImage(request.file);

    response.status(404).send("Discussion not found.");
    return;
  }

  if (String(discussion.authorId) !== String(forumUser._id)) {
    await removeUploadedForumImage(request.file);

    response.status(403).send("You can only edit your own discussion.");
    return;
  }

  const postTitle = getTrimmedFormText(request.body.postTitle);
  const postContent = getTrimmedFormText(request.body.postContent);
  let postImage = discussion.image;

  if (request.file) {
    postImage = forumImageDataUrl(request.file);
  }

  if (postTitle === "" || postTitle.length > 100) {
    await removeUploadedForumImage(request.file);

    response
      .status(400)
      .send("Please enter a title with 100 characters or less.");
    return;
  }

  if (postContent === "" || postContent.length > 1000) {
    await removeUploadedForumImage(request.file);

    response
      .status(400)
      .send("Please enter content with 1000 characters or less.");
    return;
  }

  if (!postImage) {
    response.status(400).send("Please upload a post image.");
    return;
  }

  const productSlugValue = request.body.productSlug;

  if (
    productSlugValue !== undefined &&
    typeof productSlugValue !== "string"
  ) {
    await removeUploadedForumImage(request.file);

    response.status(400).send("Please select a valid related product.");
    return;
  }

  const productSlug = getTrimmedFormText(productSlugValue);
  let relatedProductId = null;

  if (productSlug === keepExistingProductValue) {
    if (!discussion.productId) {
      await removeUploadedForumImage(request.file);

      response.status(400).send("Please select a valid related product.");
      return;
    }

    relatedProductId = discussion.productId;
  } else if (productSlug !== "") {
    const relatedProduct = await findActiveProduct(productSlug);

    if (!relatedProduct) {
      await removeUploadedForumImage(request.file);

      response.status(400).send("Please select a valid related product.");
      return;
    }

    relatedProductId = relatedProduct._id;
  }

  const reviewIdValue = request.body.reviewId;

  if (reviewIdValue !== undefined && typeof reviewIdValue !== "string") {
    await removeUploadedForumImage(request.file);

    response.status(400).send("Please select a valid related review.");
    return;
  }

  const reviewId = getTrimmedFormText(reviewIdValue);
  let relatedReviewId = null;

  if (reviewId === keepExistingReviewValue) {
    if (!discussion.reviewId) {
      await removeUploadedForumImage(request.file);

      response.status(400).send("Please select a valid related review.");
      return;
    }

    relatedReviewId = discussion.reviewId;
  } else if (reviewId !== "") {
    const relatedReview = await findReviewByDatabaseId(reviewId);

    if (!relatedReview) {
      await removeUploadedForumImage(request.file);

      response.status(400).send("Please select a valid related review.");
      return;
    }

    relatedReviewId = relatedReview._id;
  }

  const now = new Date();

  const discussionUpdate = await Discussion.updateOne(
    {
      _id: discussion._id,
      authorId: forumUser._id,
      deletedAt: null,
    },
    {
      title: postTitle,
      content: postContent,
      image: postImage,
      productId: relatedProductId,
      reviewId: relatedReviewId,
      updatedAt: now,
    },
  );

  if (discussionUpdate.matchedCount === 0) {
    await removeUploadedForumImage(request.file);

    response.status(404).send("Discussion not found.");
    return;
  }

  await User.updateOne(
    { _id: forumUser._id },
    {
      lastActiveAt: now,
      updatedAt: now,
    },
  );

  redirectAfterForumMutation(response, "/discussions/" + discussion._id);
}

// Soft delete the selected discussion post
async function deleteDiscussion(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  const forumUser = await getForumDatabaseUser(currentUser);

  if (!forumUser) {
    response.status(403).send("Forum user not found.");
    return;
  }

  const discussion = await findActiveDiscussion(request.params.id);

  if (!discussion) {
    response.status(404).send("Discussion not found.");
    return;
  }

  if (String(discussion.authorId) !== String(forumUser._id)) {
    response.status(403).send("You can only delete your own discussion.");
    return;
  }

  const now = new Date();

  const discussionUpdate = await Discussion.updateOne(
    {
      _id: discussion._id,
      authorId: forumUser._id,
      deletedAt: null,
    },
    {
      deletedAt: now,
      deletedBy: forumUser._id,
      updatedAt: now,
    },
  );

  if (discussionUpdate.matchedCount === 0) {
    response.status(404).send("Discussion not found.");
    return;
  }

  await User.updateOne(
    { _id: forumUser._id },
    {
      lastActiveAt: now,
      updatedAt: now,
    },
  );

  request.session.discussionMessage = "Post deleted successfully.";
  redirectAfterForumMutation(response, "/discussions");
}

// Show the edit page for a reply written by the current user.
async function showEditReply(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  const forumUser = await getForumDatabaseUser(currentUser);

  if (!forumUser) {
    response.status(403).send("Forum user not found.");
    return;
  }

  const reply = await findActiveReply(
    request.params.replyId,
    request.params.id,
  );

  if (!reply) {
    response.status(404).send("Reply not found.");
    return;
  }

  if (String(reply.authorId) !== String(forumUser._id)) {
    response.status(403).send("You can only edit your own reply.");
    return;
  }

  const discussion = await findActiveDiscussion(request.params.id);

  if (!discussion) {
    response.status(404).send("Discussion not found.");
    return;
  }

  response.render("reply-edit", {
    pageTitle: "Edit reply",
    discussion: discussion,
    reply: reply,
  });
}

// Save new reply for the selected discussion post
async function createReply(request, response) {
  const replyTitle = getTrimmedFormText(request.body.replyTitle);
  const replyContent = getTrimmedFormText(request.body.replyContent);
  const replyImage = forumImageDataUrl(request.file);

  if (replyTitle === "" || replyTitle.length > 100) {
    await removeUploadedForumImage(request.file);

    response
      .status(400)
      .send("Please enter a reply title with 100 characters or less.");
    return;
  }

  if (replyContent === "" || replyContent.length > 1000) {
    await removeUploadedForumImage(request.file);

    response
      .status(400)
      .send("Please enter reply content with 1000 characters or less.");
    return;
  }

  if (!replyImage) {
    response.status(400).send("Please upload a reply image.");
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    await removeUploadedForumImage(request.file);

    redirectForumLogin(response);
    return;
  }

  const forumUser = await getForumDatabaseUser(currentUser);

  if (!forumUser) {
    await removeUploadedForumImage(request.file);

    response.status(403).send("Forum user not found.");
    return;
  }

  const discussion = await findActiveDiscussion(request.params.id);

  if (!discussion) {
    await removeUploadedForumImage(request.file);

    response.status(404).send("Discussion not found.");
    return;
  }

  const now = new Date();

  const reply = new Reply({
    title: replyTitle,
    content: replyContent,
    image: replyImage,
    authorId: forumUser._id,
    discussionId: discussion._id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedBy: null,
  });

  await reply.save();

  // Save the user's last activity time
  await User.updateOne(
    { _id: forumUser._id },
    {
      lastActiveAt: now,
      updatedAt: now,
    },
  );

  redirectAfterForumMutation(response, "/discussions/" + discussion._id);
}

// Save changes to a reply written by the current user.
async function updateReply(request, response) {
  const replyTitle = getTrimmedFormText(request.body.replyTitle);
  const replyContent = getTrimmedFormText(request.body.replyContent);

  if (replyTitle === "" || replyTitle.length > 100) {
    await removeUploadedForumImage(request.file);

    response
      .status(400)
      .send("Please enter a reply title with 100 characters or less.");
    return;
  }

  if (replyContent === "" || replyContent.length > 1000) {
    await removeUploadedForumImage(request.file);

    response
      .status(400)
      .send("Please enter reply content with 1000 characters or less.");
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    await removeUploadedForumImage(request.file);

    redirectForumLogin(response);
    return;
  }

  const forumUser = await getForumDatabaseUser(currentUser);

  if (!forumUser) {
    await removeUploadedForumImage(request.file);

    response.status(403).send("Forum user not found.");
    return;
  }

  const discussion = await findActiveDiscussion(request.params.id);

  if (!discussion) {
    await removeUploadedForumImage(request.file);

    response.status(404).send("Discussion not found.");
    return;
  }

  const reply = await findActiveReply(
    request.params.replyId,
    discussion._id,
  );

  if (!reply) {
    await removeUploadedForumImage(request.file);

    response.status(404).send("Reply not found.");
    return;
  }

  if (String(reply.authorId) !== String(forumUser._id)) {
    await removeUploadedForumImage(request.file);

    response.status(403).send("You can only edit your own reply.");
    return;
  }

  let replyImage = reply.image;

  if (request.file) {
    replyImage = forumImageDataUrl(request.file);
  }

  if (!replyImage) {
    response.status(400).send("Please upload a reply image.");
    return;
  }

  const now = new Date();

  const replyUpdate = await Reply.updateOne(
    {
      _id: reply._id,
      discussionId: discussion._id,
      authorId: forumUser._id,
      deletedAt: null,
    },
    {
      title: replyTitle,
      content: replyContent,
      image: replyImage,
      updatedAt: now,
    },
  );

  if (replyUpdate.matchedCount === 0) {
    await removeUploadedForumImage(request.file);

    response.status(404).send("Reply not found.");
    return;
  }

  // Save the user's last activity time
  await User.updateOne(
    { _id: forumUser._id },
    {
      lastActiveAt: now,
      updatedAt: now,
    },
  );

  redirectAfterForumMutation(response, "/discussions/" + request.params.id);
}

// Soft delete a reply written by the current user.
async function deleteReply(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  const forumUser = await getForumDatabaseUser(currentUser);

  if (!forumUser) {
    response.status(403).send("Forum user not found.");
    return;
  }

  const discussion = await findActiveDiscussion(request.params.id);

  if (!discussion) {
    response.status(404).send("Discussion not found.");
    return;
  }

  const reply = await findActiveReply(
    request.params.replyId,
    discussion._id,
  );

  if (!reply) {
    response.status(404).send("Reply not found.");
    return;
  }

  if (String(reply.authorId) !== String(forumUser._id)) {
    response.status(403).send("You can only delete your own reply.");
    return;
  }

  const now = new Date();

  const replyUpdate = await Reply.updateOne(
    {
      _id: reply._id,
      discussionId: discussion._id,
      authorId: forumUser._id,
      deletedAt: null,
    },
    {
      deletedAt: now,
      deletedBy: forumUser._id,
      updatedAt: now,
    },
  );

  if (replyUpdate.matchedCount === 0) {
    response.status(404).send("Reply not found.");
    return;
  }

  // Save the user's last activity time
  await User.updateOne(
    { _id: forumUser._id },
    {
      lastActiveAt: now,
      updatedAt: now,
    },
  );

  response.redirect("/discussions/" + request.params.id);
}

function showBlogs(request, response) {
  response.render("blog", { pageTitle: "Blogs" });
}

function showBlogDetails(request, response) {
  response.render("blog-details", { pageTitle: "Blog Details" });
}

const maxReviewImageBytes = 4 * 1024 * 1024;
const reviewImagePattern =
  /^data:image\/(png|jpeg|gif|webp);base64,([a-z0-9+/]+={0,2})$/i;

function isValidReviewImage(imageUrl) {
  if (imageUrl === undefined || imageUrl === null || imageUrl === "")
    return true;
  if (imageUrl === "/images/review-placeholder.jpg") return true;
  if (typeof imageUrl !== "string") return false;

  const match = imageUrl.match(reviewImagePattern);
  if (!match) return false;

  const padding = (match[2].match(/=*$/) || [""])[0].length;
  const byteLength = Math.floor((match[2].length * 3) / 4) - padding;
  return byteLength <= maxReviewImageBytes;
}

function getReviewErrors(data) {
  const errors = {};
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { form: "Request body must be a JSON object." };
  }

  const courseCode =
    typeof data.courseCode === "string"
      ? data.courseCode.trim().toUpperCase()
      : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const description =
    typeof data.description === "string" ? data.description.trim() : "";
  const rating = Number(data.rating);

  if (!/^[A-Z]{4}\d{4}$/.test(courseCode)) {
    errors.courseCode =
      "Course code must use four letters followed by four digits.";
  }

  if (title.length < 5 || title.length > 100) {
    errors.title = "Title must be between 5 and 100 characters.";
  }

  if (description.length < 20 || description.length > 1000) {
    errors.description = "Description must be between 20 and 1000 characters.";
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = "Rating must be a whole number between 1 and 5.";
  }

  if (!isValidReviewImage(data.imageUrl)) {
    errors.imageUrl =
      "Choose a PNG, JPEG, GIF, or WebP image no larger than 4 MB.";
  }

  return errors;
}

async function createReviewData(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    response.status(401).json({ error: "You must log in first." });
    return;
  }

  const errors = getReviewErrors(request.body);

  if (Object.keys(errors).length > 0) {
    response.status(400).json({ errors: errors });
    return;
  }

  const courseCode =
    typeof request.body.courseCode === "string"
      ? request.body.courseCode.trim().toUpperCase()
      : "";

  const lastReview = await Review.findOne()
    .sort({ id: -1 })
    .select({ id: 1 })
    .lean();
  const newReview = await Review.create({
    id: (lastReview?.id || 0) + 1,
    userId: currentUser._id,
    courseCode: courseCode,
    title: request.body.title.trim(),
    description: request.body.description.trim(),
    rating: Number(request.body.rating),
    reviewerName: currentUser.username,
    imageUrl: request.body.imageUrl || "/images/review-placeholder.jpg",
  });

  response.status(201).json(newReview);
}

async function updateReviewData(request, response) {
  const reviewId = Number(request.params.id);
  if (!Number.isSafeInteger(reviewId) || reviewId < 1) {
    response.status(404).json({ error: "Review not found." });
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    response.status(401).json({ error: "You must log in first." });
    return;
  }

  const errors = getReviewErrors(request.body);

  if (Object.keys(errors).length > 0) {
    response.status(400).json({ errors: errors });
    return;
  }

  const update = {
    title: request.body.title.trim(),
    courseCode: request.body.courseCode.trim().toUpperCase(),
    description: request.body.description.trim(),
    rating: Number(request.body.rating),
    reviewerName: currentUser.username,
  };
  if (request.body.imageUrl) update.imageUrl = request.body.imageUrl;

  const review = await Review.findOneAndUpdate(
    { id: reviewId, userId: currentUser._id },
    { $set: update },
    { returnDocument: "after", runValidators: true },
  );

  if (!review) {
    const exists = await Review.exists({ id: reviewId });
    response.status(exists ? 403 : 404).json({
      error: exists ? "You can only edit your own reviews." : "Review not found.",
    });
    return;
  }

  response.json(review);
}

async function deleteReviewData(request, response) {
  const reviewId = Number(request.params.id);
  if (!Number.isSafeInteger(reviewId) || reviewId < 1) {
    response.status(404).json({ error: "Review not found." });
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    response.status(401).json({ error: "You must log in first." });
    return;
  }

  const deleted = await Review.deleteOne({ id: reviewId, userId: currentUser._id });
  if (deleted.deletedCount === 0) {
    const exists = await Review.exists({ id: reviewId });
    response.status(exists ? 403 : 404).json({
      error: exists ? "You can only delete your own reviews." : "Review not found.",
    });
    return;
  }

  response.status(204).send();
}

async function showReviewData(request, response) {
  const reviews = await Review.find().sort({ createdAt: -1 });
  response.json(reviews);
}

async function showOneReviewData(request, response) {
  const reviewId = Number(request.params.id);
  const review = Number.isSafeInteger(reviewId)
    ? await Review.findOne({ id: reviewId })
    : null;

  if (!review) {
    response.status(404).json({ error: "Review not found." });
    return;
  }

  response.json(review);
}

function showReviews(request, response) {
  response.render("review", { pageTitle: "Reviews" });
}

function showReviewBrowse(request, response) {
  response.render("review-browse", { pageTitle: "Browse Courses" });
}

function showReviewDetail(request, response) {
  response.render("review-detail", { pageTitle: "Review Details" });
}

function showReviewEdit(request, response) {
  response.render("review-edit", { pageTitle: "Review Edit" });
}

function showWishlist(request, response) {
  response.render("wishlist", { pageTitle: "Wishlist and Favorites" });
}

function showWishlistAdd(request, response) {
  response.render("wishlist-add", { pageTitle: "Browes Items" });
}

function showForgotPassword(request, response) {
  response.render("forgotpassword", {
    pageTitle: "Forgot Password",
    emailError: "",
    resetMessage: "",
    resetLink: "",
  });
}

// Shows the page where a student chooses a new password.
function showResetPassword(request, response) {
  const suppliedToken =
    typeof request.query.token === "string" ? request.query.token : "";

  if (Object.keys(request.query).length > 0) {
    request.session.resetToken = /^[a-f0-9]{64}$/i.test(suppliedToken)
      ? suppliedToken.toLowerCase()
      : null;
  }

  if (!request.session || !request.session.resetToken) {
    response.redirect("/forgot-password");
    return;
  }

  response.render("resetpassword", {
    pageTitle: "Reset Password",
    resetComplete: false,
    newPasswordError: "",
    confirmPasswordError: "",
  });
}

// Shows the logout result page.
function showLogout(request, response) {
  request.session.destroy(function (error) {
    if (error) {
      response.status(500).send("Could not log out. Please try again.");
      return;
    }

    response.clearCookie("rmit.connect.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
    });

    response.render("logout", { pageTitle: "Logged Out" });
  });
}

// Prepares a one-time reset token for an active account.
async function sendResetLink(request, response) {
  const submittedEmail = request.body["reset-email"];
  const email =
    typeof submittedEmail === "string"
      ? submittedEmail.trim().toLowerCase()
      : "";
  const emailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (
    email === "" ||
    email.length > 120 ||
    emailFormat.test(email) === false
  ) {
    response.render("forgotpassword", {
      pageTitle: "Forgot Password",
      emailError: "Please enter a valid email address.",
      resetMessage: "",
      resetLink: "",
    });

    return;
  }

  let resetLink = "";
  const loginUser = await accountRepository.findUserByIdentifier(email);

  if (loginUser?.status === "active") {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    await accountRepository.createResetToken(loginUser.id, {
      tokenHash,
      expiresAt: new Date(Date.now() + 20 * 60 * 1000),
    });

    /*
     * This build shows the link locally. Email delivery is not implemented.
     * A deployed build needs a private delivery method for this URL through
     * the team's private mail service and leave SHOW_DEMO_RESET_LINK unset.
     */
    if (!isProduction || process.env.SHOW_DEMO_RESET_LINK === "true") {
      resetLink = `/reset-password?token=${rawToken}`;
    }
  }

  response.render("forgotpassword", {
    pageTitle: "Forgot Password",
    emailError: "",
    resetMessage:
      "If an active account matches that email, a reset link has been prepared.",
    resetLink,
  });
}

// Checks and saves the new password for the reset account.
async function resetPassword(request, response) {
  const newPassword =
    typeof request.body["new-password"] === "string"
      ? request.body["new-password"]
      : "";
  const confirmPassword =
    typeof request.body["confirm-password"] === "string"
      ? request.body["confirm-password"]
      : "";

  if (!request.session || !request.session.resetToken) {
    response.redirect("/forgot-password");
    return;
  }

  let newPasswordError = "";
  let confirmPasswordError = "";

  if (
    newPassword.length < 8 ||
    Buffer.byteLength(newPassword, "utf8") > 72
  ) {
    newPasswordError =
      "Password must contain at least 8 characters and no more than 72 UTF-8 bytes.";
  } else if (
    !/[a-z]/.test(newPassword) ||
    !/[A-Z]/.test(newPassword) ||
    !/\d/.test(newPassword)
  ) {
    newPasswordError =
      "Password must include uppercase and lowercase letters and a number.";
  }

  if (confirmPassword === "") {
    confirmPasswordError = "Please confirm your new password.";
  } else if (newPassword !== confirmPassword) {
    confirmPasswordError = "Passwords do not match.";
  }

  if (newPasswordError !== "" || confirmPasswordError !== "") {
    response.render("resetpassword", {
      pageTitle: "Reset Password",
      resetComplete: false,
      newPasswordError: newPasswordError,
      confirmPasswordError: confirmPasswordError,
    });
    return;
  }

  const tokenHash = crypto
    .createHash("sha256")
    .update(request.session.resetToken)
    .digest("hex");

  try {
    await accountRepository.consumeResetToken({
      tokenHash,
      newPasswordHash: await bcrypt.hash(newPassword, 10),
    });
  } catch (error) {
    request.session.resetToken = null;
    response.status(error.statusCode || 400).render("resetpassword", {
      pageTitle: "Reset Password",
      resetComplete: false,
      newPasswordError: error.message,
      confirmPasswordError: "",
    });
    return;
  }

  request.session.resetToken = null;

  response.render("resetpassword", {
    pageTitle: "Password Reset Complete",
    resetComplete: true,
    newPasswordError: "",
    confirmPasswordError: "",
  });
}

// Shows the account deactivation form for the current user.
async function showDeactivateAccount(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    response.redirect(
      "/login.html?returnTo=%2Fdeactivate-account",
    );
    return;
  }

  response.render("deactivate-id", {
    pageTitle: "Deactivate Account",
    deactivateError: "",
  });
}

// Shows the message after an account is deactivated.
function showDeactivatedSuccess(request, response) {
  response.render("deactivated-success", {
    pageTitle: "Account Deactivated",
  });
}

// Checks the confirmation checkbox and updates the current user's account status.
async function deactivateAccount(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    response.redirect(
      "/login.html?returnTo=%2Fdeactivate-account",
    );
    return;
  }

  const accountConfirm = request.body["deactivate-id-confirm"];

  if (accountConfirm !== "confirmed") {
    response.render("deactivate-id", {
      pageTitle: "Deactivate Account",
      deactivateError: "Please confirm that you understand this action.",
    });
    return;
  }

  try {
    await accountRepository.deactivateUser(currentUser._id);
  } catch (error) {
    if (error?.code === "LAST_ACTIVE_ADMIN") {
      response.status(409).render("deactivate-id", {
        pageTitle: "Deactivate Account",
        deactivateError: error.message,
      });
      return;
    }

    throw error;
  }

  request.session.destroy(function (error) {
    if (error) {
      /* The database change already committed; auth checks still reject it. */
      console.error("Could not destroy the deactivated account session.", error);
    }

    response.clearCookie("rmit.connect.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
    });

    response.redirect("/deactivated-success");
  });
}

registerBlogApi(app, {
  getCurrentUser: getBlogCurrentUser,
});

// GET routes show a page when the user opens its URL in the browser.
app.get("/", showHome);
app.get("/sitemap", showSitemap);
app.get("/discussions", showDiscussions);
app.get("/discussions/:id/edit", showEditDiscussion);
app.get("/discussions/:id/replies/:replyId/edit", showEditReply);
app.get("/discussions/:id", showDiscussionDetail);
app.post(
  "/discussions",
  requireForumLogin,
  upload.single("postImage"),
  validateForumImage,
  createDiscussion,
);
app.post(
  "/discussions/:id/edit",
  requireForumLogin,
  upload.single("postImage"),
  validateForumImage,
  updateDiscussion,
);
app.post(
  "/discussions/:id/replies",
  requireForumLogin,
  upload.single("replyImage"),
  validateForumImage,
  createReply,
);
app.post(
  "/discussions/:id/replies/:replyId/edit",
  requireForumLogin,
  upload.single("replyImage"),
  validateForumImage,
  updateReply,
);
app.post("/discussions/:id/replies/:replyId/delete", deleteReply);
app.post("/discussions/:id/delete", deleteDiscussion);
app.get("/blogs", showBlogs);
app.get("/blogs/:id", showBlogDetails);
app.get("/api/reviews", showReviewData);
app.get("/api/reviews/:id", showOneReviewData);
app.post("/api/reviews", createReviewData);
app.put("/api/reviews/:id", updateReviewData);
app.delete("/api/reviews/:id", deleteReviewData);
app.get("/reviews", showReviews);
app.get("/reviews/browse", showReviewBrowse);
app.get("/reviews/:id/edit", showReviewEdit);
app.get("/reviews/:id", showReviewDetail);

// Preserve Assessment 1 bookmarks while serving the dynamic EJS Review pages.
app.get(["/review.html", "/review/review.html"], (_request, response) => {
  response.redirect(301, "/reviews");
});
app.get(
  ["/review-browse.html", "/review/review-browse.html"],
  (_request, response) => {
    response.redirect(301, "/reviews/browse");
  },
);
app.get(
  ["/review-detail.html", "/review/review-detail.html"],
  (request, response) => {
    const id = String(request.query.id || "").trim();
    response.redirect(
      301,
      /^\d+$/.test(id) ? `/reviews/${id}` : "/reviews/browse",
    );
  },
);
app.get(
  ["/review-edit.html", "/review/review-edit.html"],
  (request, response) => {
    const id = String(request.query.id || "").trim();
    response.redirect(
      301,
      /^\d+$/.test(id) ? `/reviews/${id}/edit` : "/reviews/browse",
    );
  },
);
app.get("/wishlist", showWishlist);
app.get("/wishlist/add", showWishlistAdd);
app.get("/wishlist.html", (request, response) => {
  response.redirect("/wishlist");
});
app.get("/wishlist-add.html", (request, response) => {
  response.redirect("/wishlist/add");
});
app.get("/wishlist/login.html", (request, response) => {
  response.redirect("/login.html?returnTo=wishlist-add.html");
});

// Shared User Account routes.
app.get("/forgot-password", showForgotPassword);
app.get("/reset-password", showResetPassword);
app.post("/forgot-password", passwordHelpLimiter, sendResetLink);
app.post("/reset-password", passwordHelpLimiter, resetPassword);
app.get("/logout", showLogout);
app.get("/deactivate-account", showDeactivateAccount);
app.post("/deactivate-account", deactivateAccount);
app.get("/deactivated-success", showDeactivatedSuccess);

function handleRootError(error, request, response, _next) {
  const isApiRequest = /^\/api(?:\/|$)/i.test(request.path);
  const isAccountApiRequest = accountApiPath.test(request.path);

  function sendApiError(status, code, message) {
    if (isAccountApiRequest) {
      return response.status(status).json({
        success: false,
        error: { code, message },
      });
    }

    return response.status(status).json({ error: message, code });
  }

  if (
    error instanceof multer.MulterError ||
    error.message === "Only JPEG and PNG images are allowed."
  ) {
    response.status(400).type("text").send(error.message);
    return;
  }

  if (error?.type === "entity.too.large" || error?.status === 413) {
    const message = isAccountApiRequest
      ? "Request body is larger than the 1.5 MB limit."
      : "Request body is larger than the 6 MB limit.";
    return isApiRequest
      ? sendApiError(413, "PAYLOAD_TOO_LARGE", message)
      : response.status(413).type("text").send(message);
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    const message = "Request body contains invalid JSON.";
    return isApiRequest
      ? sendApiError(400, "INVALID_JSON", message)
      : response.status(400).type("text").send(message);
  }

  console.error(error);
  const message = "Something went wrong on the server.";
  return isApiRequest
    ? sendApiError(500, "INTERNAL_ERROR", message)
    : response.status(500).type("text").send(message);
}

// Mount Dat's shared account application exactly once for tests and production.
async function prepareApp() {
  if (accountAppMounted) return app;

  const { createApp } = await import("./modules/account/src/app.js");
  const { createMongoAccountRepository } = await import(
    "./modules/account/src/mongo-repository.js"
  );

  accountRepository = createMongoAccountRepository();
  app.use(
    createApp({
      sessionSecret,
      repository: accountRepository,
      useExistingSession: true,
    }),
  );
  app.use(handleRootError);
  accountAppMounted = true;

  return app;
}

// Starts the local Express server after all routes are prepared.
async function startServer(listenPort = port) {
  // Prepare all shared models before the database checks their indexes.
  await prepareApp();
  await connectDatabase();

  return new Promise((resolve, reject) => {
    let settled = false;

    const rejectOnce = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    // Express 5 passes listen errors to this callback instead of guaranteeing
    // that a callback means the socket is ready.
    const server = app.listen(listenPort, (error) => {
      if (error) {
        rejectOnce(error);
        return;
      }

      const address = server.address();
      if (!address) {
        rejectOnce(
          new Error("The HTTP server did not acquire a listening address."),
        );
        return;
      }

      const activePort =
        typeof address === "object" ? address.port : listenPort;
      settled = true;
      console.log(`RMIT Connect is running on http://localhost:${activePort}`);
      resolve(server);
    });

    server.once("error", rejectOnce);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${port} is already in use. Stop that server or choose another PORT.`,
      );
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  });
}

/*
 * Vercel invokes the module's default CommonJS export as the serverless
 * function.  Export a request handler (rather than an object) and retain the
 * named helpers as properties so the local server and test suite keep their
 * existing API.
 */
async function vercelHandler(request, response) {
  await prepareApp();
  await connectDatabase();
  return app(request, response);
}

module.exports = vercelHandler;
module.exports.app = app;
module.exports.prepareApp = prepareApp;
module.exports.startServer = startServer;
