const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("node:fs/promises");
const path = require("node:path");
const { connectDatabase } = require("./database");
const { User } = require("./models/user");
const { Discussion } = require("./models/discussion");
const { Reply } = require("./models/reply");
const { upload } = require("./upload");
const { users } = require("./forum-data");
const { blogs } = require("./blog-data");
const { registerBlogApi } = require("./routes/register-blog-api");
const reviewData = require("./review-data");
let reviews = reviewData.reviews;
const getReviewId = reviewData.getReviewId;
let loginStore = null;
let createPasswordHash = null;
let verifyPassword = null;
const app = express();
let accountAppMounted = false;
const PASSWORD_RESET_ACCESS_MS = 10 * 60 * 1000;
const RECOVERY_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 5;
const ASCII_SECRET_PATTERN = /^[\x21-\x7e]+$/;
// Uses the PORT environment variable when provided. Otherwise, it uses port 3000.
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret =
  process.env.SESSION_SECRET || "local-demo-change-this-secret";

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
  const activeBlogs = [];

  for (let i = 0; i < blogs.length; i += 1) {
    if (blogs[i].deleted === false) {
      activeBlogs.push(blogs[i]);
    }
  }

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
  if (!uploadedFile) {
    return;
  }

  await fs.unlink(uploadedFile.path);
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

  const activeDiscussions = await Discussion.find({
    deletedAt: null,
  });

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

  for (let i = 0; i < activeDiscussions.length; i += 1) {
    let replyCount = 0;
    let titleSearchText = activeDiscussions[i].title;
    let contentSearchText = activeDiscussions[i].content;
    let latestActivityTime = activeDiscussions[i].createdAt.getTime();
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

    replyCounts.push(replyCount);
    authors.push(author);
    titleSearchTexts.push(titleSearchText);
    contentSearchTexts.push(contentSearchText);
    latestActivityTimes.push(latestActivityTime);
  }

  response.render("discussion", {
    pageTitle: "Discussion Forum",
    discussions: activeDiscussions,
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

  response.render("discussion-edit", {
    pageTitle: "Edit Discussion",
    discussion: discussion,
  });
}

function makeCurrentUser(loginUser) {
  const currentUser = {
    _id: loginUser.id,
    username: loginUser.name,
    studentId: loginUser.studentId,
    email: loginUser.email,
    description: loginUser.description,
    profileImage: loginUser.avatarUrl || "/images/user_icon.png",
    course: "RMIT student",
    accountStatus: loginUser.status,
  };

  for (let i = 0; i < users.length; i += 1) {
    if (users[i]._id === currentUser._id) {
      currentUser.course = users[i].course;
      users[i] = currentUser;
      return currentUser;
    }
  }

  users.push(currentUser);
  return currentUser;
}

function accountStateFromDatabaseUser(databaseUser) {
  if (!databaseUser) {
    return null;
  }

  return {
    username: databaseUser.username,
    studentId: databaseUser.studentId,
    email: databaseUser.email,
    passwordHash: databaseUser.passwordHash,
    status: databaseUser.status,
    lockedAt: databaseUser.lockedAt,
    deactivatedAt: databaseUser.deactivatedAt,
    passwordChangedAt: databaseUser.passwordChangedAt,
    recoveryPasswordHash: databaseUser.recoveryPasswordHash,
    recoveryConfigured: Boolean(
      databaseUser.recoveryPasswordHash,
    ),
  };
}

async function findDatabaseAccountState(studentId) {
  const databaseUser = await User.findOne({ studentId: studentId });
  return accountStateFromDatabaseUser(databaseUser);
}

async function findDatabaseAccountByIdentifier(identifier) {
  const databaseUser = await User.findOne({
    $or: [{ username: identifier }, { email: identifier }],
  });

  return accountStateFromDatabaseUser(databaseUser);
}

async function updateDatabaseProfile(
  studentId,
  accountUpdate,
  expectedPasswordHash,
  expectedRecoveryPasswordHash,
) {
  const accountFilter = {
    studentId: studentId,
    status: "active",
    passwordHash: expectedPasswordHash,
  };

  if (expectedRecoveryPasswordHash !== undefined) {
    accountFilter.recoveryPasswordHash =
      expectedRecoveryPasswordHash || null;
  }

  const databaseUser = await User.findOneAndUpdate(
    accountFilter,
    {
      $set: {
        ...accountUpdate,
        updatedAt: new Date(),
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  return accountStateFromDatabaseUser(databaseUser);
}

async function updateDatabaseAccountStatus(studentId, status) {
  const now = new Date();
  const update = {
    status: status,
    updatedAt: now,
  };

  if (status === "locked") {
    update.lockedAt = now;
  }

  /*
   * lockedAt and deactivatedAt remain as historical invalidation times after
   * an administrator unlocks an account. A new login is newer than these
   * values, while a session created before the lock stays invalid.
   */
  const databaseUser = await User.findOneAndUpdate(
    { studentId: studentId },
    { $set: update },
  );

  if (!databaseUser) {
    return null;
  }

  return findDatabaseAccountState(studentId);
}

async function deactivateDatabaseAccount(studentId) {
  const now = new Date();

  const databaseUser = await User.findOneAndUpdate(
    {
      studentId: studentId,
      status: "active",
    },
    {
      $set: {
        status: "locked",
        lockedAt: now,
        deactivatedAt: now,
        updatedAt: now,
      },
    },
  );

  if (!databaseUser) {
    return null;
  }

  return findDatabaseAccountState(studentId);
}

function isSessionNewerThanAccountBlocks(request, accountState) {
  const blockTimes = [
    accountState.lockedAt,
    accountState.deactivatedAt,
    accountState.passwordChangedAt,
  ]
    .filter((value) => value)
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (blockTimes.length === 0) {
    return true;
  }

  const authenticatedAt = new Date(
    request.session.authenticatedAt,
  ).getTime();

  return (
    Number.isFinite(authenticatedAt) &&
    authenticatedAt > Math.max(...blockTimes)
  );
}

// Gets the user stored in the shared Login session.
async function getCurrentUser(request) {
  if (!request.session || !request.session.userId || !loginStore) {
    return null;
  }

  let loginUser = null;

  for (let i = 0; i < loginStore.users.length; i += 1) {
    if (loginStore.users[i].id === request.session.userId) {
      loginUser = loginStore.users[i];
    }
  }

  if (!loginUser) {
    return null;
  }

  const accountState = await findDatabaseAccountState(loginUser.studentId);

  if (
    !accountState ||
    accountState.status !== "active" ||
    !isSessionNewerThanAccountBlocks(request, accountState)
  ) {
    request.session.destroy(() => {});
    return null;
  }

  loginUser.status = accountState.status;
  loginUser.email = accountState.email;
  loginUser.passwordHash = accountState.passwordHash;
  loginUser.passwordChangedAt = accountState.passwordChangedAt;
  loginUser.recoveryConfigured = accountState.recoveryConfigured;

  return makeCurrentUser(loginUser);
}

// Finds the MongoDB User used by the Discussion Forum.
async function getForumDatabaseUser(currentUser) {
  const matchingUsers = await User.find({
    studentId: currentUser.studentId,
    status: "active",
  });

  if (matchingUsers.length === 0) {
    return null;
  }

  return matchingUsers[0];
}

async function getBlogCurrentUser(request) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    return null;
  }

  return {
    id: currentUser._id,
    name: currentUser.username,
    sid: currentUser.studentId,
  };
}

// Save a new discussion post from the Discussion Forum form.
async function createDiscussion(request, response) {
  const postTitle = getTrimmedFormText(request.body.postTitle);
  const postContent = getTrimmedFormText(request.body.postContent);
  const postImage = request.file
    ? "/uploads/" + request.file.filename
    : null;

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
    redirectForumLogin(response);
    return;
  }

  const forumUser = await getForumDatabaseUser(currentUser);

  if (!forumUser) {
    response.status(403).send("Forum user not found.");
    return;
  }

  const now = new Date();

  const discussion = new Discussion({
    title: postTitle,
    content: postContent,
    image: postImage,
    authorId: forumUser._id,
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

  response.redirect("/discussions");
}

// Update the selected post.
async function updateDiscussion(request, response) {
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
    response.status(403).send("You can only edit your own discussion.");
    return;
  }

  const postTitle = getTrimmedFormText(request.body.postTitle);
  const postContent = getTrimmedFormText(request.body.postContent);
  let postImage = discussion.image;

  if (request.file) {
    postImage = "/uploads/" + request.file.filename;
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

  response.redirect("/discussions/" + discussion._id);
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
  response.redirect("/discussions");
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
  const replyImage = request.file
    ? "/uploads/" + request.file.filename
    : null;

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

  response.redirect("/discussions/" + discussion._id);
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
    response.status(403).send("You can only edit your own reply.");
    return;
  }

  let replyImage = reply.image;

  if (request.file) {
    replyImage = "/uploads/" + request.file.filename;
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

  const newReview = {
    id: getReviewId(),
    userId: currentUser._id,
    courseCode: courseCode,
    title: request.body.title.trim(),
    description: request.body.description.trim(),
    rating: Number(request.body.rating),
    reviewerName: currentUser.username,
    imageUrl: request.body.imageUrl || "/images/review-placeholder.jpg",
    createdAt: new Date().toISOString().slice(0, 10),
  };

  reviews.push(newReview);
  response.status(201).json(newReview);
}

async function updateReviewData(request, response) {
  let review = null;

  for (let i = 0; i < reviews.length; i += 1) {
    if (String(reviews[i].id) === request.params.id) {
      review = reviews[i];
    }
  }

  if (!review) {
    response.status(404).json({ error: "Review not found." });
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    response.status(401).json({ error: "You must log in first." });
    return;
  }

  if (review.userId !== currentUser._id) {
    response.status(403).json({
      error: "You can only edit your own reviews.",
    });
    return;
  }

  const errors = getReviewErrors(request.body);

  if (Object.keys(errors).length > 0) {
    response.status(400).json({ errors: errors });
    return;
  }

  review.title = request.body.title.trim();
  review.courseCode = request.body.courseCode.trim().toUpperCase();
  review.description = request.body.description.trim();
  review.rating = Number(request.body.rating);
  review.reviewerName = currentUser.username;

  if (request.body.imageUrl) {
    review.imageUrl = request.body.imageUrl;
  }

  response.json(review);
}

async function deleteReviewData(request, response) {
  let review = null;

  for (let i = 0; i < reviews.length; i += 1) {
    if (String(reviews[i].id) === request.params.id) {
      review = reviews[i];
    }
  }

  if (!review) {
    response.status(404).json({ error: "Review not found." });
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    response.status(401).json({ error: "You must log in first." });
    return;
  }

  if (review.userId !== currentUser._id) {
    response.status(403).json({
      error: "You can only delete your own reviews.",
    });
    return;
  }

  reviews = reviews.filter(function (item) {
    return String(item.id) !== request.params.id;
  });

  response.status(204).send();
}

function showReviewData(request, response) {
  response.json(reviews);
}

function showOneReviewData(request, response) {
  let review = null;

  for (let i = 0; i < reviews.length; i += 1) {
    if (String(reviews[i].id) === request.params.id) {
      review = reviews[i];
    }
  }

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

function newPasswordValidationError(password) {
  if (password.length < 8 || password.length > 64) {
    return "Password must contain 8 to 64 characters.";
  }

  if (!ASCII_SECRET_PATTERN.test(password)) {
    return "Password must use ASCII letters, numbers, or symbols without spaces.";
  }

  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return "Password must include uppercase and lowercase letters and a number.";
  }

  return "";
}

function recoveryPasswordValidationError(password) {
  if (password.length < 12 || password.length > 64) {
    return "Recovery password must contain 12 to 64 characters.";
  }

  if (!ASCII_SECRET_PATTERN.test(password)) {
    return "Recovery password must use ASCII letters, numbers, or symbols without spaces.";
  }

  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return "Recovery password must include uppercase and lowercase letters and a number.";
  }

  return "";
}

function renderForgotPassword(response, options = {}) {
  return response.status(options.status || 200).render("forgotpassword", {
    pageTitle: "Forgot Password",
    emailValue: options.emailValue || "",
    emailError: options.emailError || "",
    recoveryPasswordError: options.recoveryPasswordError || "",
    formError: options.formError || "",
    resetMessage: options.resetMessage || "",
  });
}

function resetSnapshotDate(value) {
  if (value === null) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function passwordResetAccountFilter(authorisation) {
  if (
    !authorisation ||
    typeof authorisation.studentId !== "string" ||
    typeof authorisation.email !== "string" ||
    typeof authorisation.passwordHash !== "string"
  ) {
    return null;
  }

  const recoveryPasswordSetAt = resetSnapshotDate(
    authorisation.recoveryPasswordSetAt,
  );
  const passwordChangedAt = resetSnapshotDate(
    authorisation.passwordChangedAt,
  );
  const lockedAt = resetSnapshotDate(authorisation.lockedAt);
  const deactivatedAt = resetSnapshotDate(authorisation.deactivatedAt);

  if (
    recoveryPasswordSetAt === undefined ||
    passwordChangedAt === undefined ||
    lockedAt === undefined ||
    deactivatedAt === undefined
  ) {
    return null;
  }

  return {
    studentId: authorisation.studentId,
    email: authorisation.email,
    status: "active",
    passwordHash: authorisation.passwordHash,
    passwordChangedAt: passwordChangedAt,
    recoveryPasswordHash: { $type: "string" },
    recoveryPasswordSetAt: recoveryPasswordSetAt,
    lockedAt: lockedAt,
    deactivatedAt: deactivatedAt,
  };
}

function getPasswordResetAuthorisation(request) {
  const authorisation = request.session.passwordResetAuthorisation;

  if (
    !authorisation ||
    !Number.isFinite(authorisation.expiresAt) ||
    authorisation.expiresAt <= Date.now() ||
    !passwordResetAccountFilter(authorisation)
  ) {
    delete request.session.passwordResetAuthorisation;
    return null;
  }

  return authorisation;
}

function recoveryAttemptIsBlocked(databaseUser, now) {
  const blockedUntil = databaseUser.recoveryBlockedUntil
    ? new Date(databaseUser.recoveryBlockedUntil).getTime()
    : 0;
  const windowStartedAt = databaseUser.recoveryAttemptWindowStartedAt
    ? new Date(databaseUser.recoveryAttemptWindowStartedAt).getTime()
    : 0;
  const windowIsCurrent =
    windowStartedAt > now.getTime() - RECOVERY_ATTEMPT_WINDOW_MS;

  return (
    blockedUntil > now.getTime() ||
    (windowIsCurrent && databaseUser.recoveryFailedAttempts >= MAX_RECOVERY_ATTEMPTS)
  );
}

async function refreshRecoveryAttemptWindow(databaseUser, now) {
  const expiredBefore = new Date(
    now.getTime() - RECOVERY_ATTEMPT_WINDOW_MS,
  );

  await User.updateOne(
    {
      _id: databaseUser._id,
      $and: [
        {
          $or: [
            { recoveryAttemptWindowStartedAt: null },
            { recoveryAttemptWindowStartedAt: { $lte: expiredBefore } },
          ],
        },
        {
          $or: [
            { recoveryBlockedUntil: null },
            { recoveryBlockedUntil: { $lte: now } },
          ],
        },
      ],
    },
    {
      $set: {
        recoveryFailedAttempts: 0,
        recoveryAttemptWindowStartedAt: now,
        recoveryBlockedUntil: null,
      },
    },
  );

  return User.findOne({ _id: databaseUser._id });
}

async function recordRecoveryFailure(databaseUser, now) {
  const expiredBefore = new Date(
    now.getTime() - RECOVERY_ATTEMPT_WINDOW_MS,
  );
  const updatedUser = await User.findOneAndUpdate(
    {
      _id: databaseUser._id,
      status: "active",
      recoveryAttemptWindowStartedAt: { $gt: expiredBefore },
      recoveryFailedAttempts: { $lt: MAX_RECOVERY_ATTEMPTS },
      $or: [
        { recoveryBlockedUntil: null },
        { recoveryBlockedUntil: { $lte: now } },
      ],
    },
    {
      $inc: { recoveryFailedAttempts: 1 },
      $set: { updatedAt: now },
    },
    { new: true },
  );

  if (
    updatedUser &&
    updatedUser.recoveryFailedAttempts >= MAX_RECOVERY_ATTEMPTS
  ) {
    await User.updateOne(
      {
        _id: updatedUser._id,
        recoveryAttemptWindowStartedAt:
          updatedUser.recoveryAttemptWindowStartedAt,
        recoveryFailedAttempts: { $gte: MAX_RECOVERY_ATTEMPTS },
      },
      {
        $set: {
          recoveryBlockedUntil: new Date(
            now.getTime() + RECOVERY_ATTEMPT_WINDOW_MS,
          ),
        },
      },
    );
  }
}

// Shows the recovery form without revealing whether an account exists.
function showForgotPassword(request, response) {
  const resetMessage =
    request.query.reset === "expired"
      ? "Your password reset access is missing, expired, or no longer valid."
      : "";

  return renderForgotPassword(response, { resetMessage: resetMessage });
}

// Only a current, server-stored recovery authorisation can open this page.
async function showResetPassword(request, response) {
  const authorisation = getPasswordResetAuthorisation(request);
  const accountFilter = passwordResetAccountFilter(authorisation);
  const databaseUser = accountFilter
    ? await User.findOne(accountFilter)
    : null;

  if (!databaseUser) {
    delete request.session.passwordResetAuthorisation;
    response.redirect("/forgot-password?reset=expired");
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

// Verifies the email and pre-set recovery password without sending email.
async function verifyRecoveryPassword(request, response, next) {
  delete request.session.passwordResetAuthorisation;

  const email = getTrimmedFormText(
    request.body["reset-email"],
  ).toLowerCase();
  const recoveryPassword =
    typeof request.body["recovery-password"] === "string"
      ? request.body["recovery-password"]
      : "";
  const emailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let emailError = "";

  if (email === "") {
    emailError = "Please enter your email address.";
  } else if (email.length > 120 || emailFormat.test(email) === false) {
    emailError = "Please enter a valid email address.";
  }
  const recoveryPasswordError = recoveryPasswordValidationError(
    recoveryPassword,
  );

  if (emailError || recoveryPasswordError) {
    renderForgotPassword(response, {
      status: 422,
      emailValue: email,
      emailError: emailError,
      recoveryPasswordError: recoveryPasswordError,
    });
    return;
  }

  const now = new Date();
  let databaseUser = await User.findOne({ email: email });

  if (databaseUser && databaseUser.status === "active") {
    databaseUser = await refreshRecoveryAttemptWindow(databaseUser, now);
  }

  const recoveryIsBlocked =
    !databaseUser ||
    databaseUser.status !== "active" ||
    recoveryAttemptIsBlocked(databaseUser, now);
  const recoveryPasswordMatches =
    !recoveryIsBlocked &&
    databaseUser.recoveryPasswordSetAt &&
    verifyPassword(
      recoveryPassword,
      databaseUser.recoveryPasswordHash,
    );

  if (!recoveryPasswordMatches) {
    if (
      databaseUser &&
      databaseUser.status === "active" &&
      !recoveryAttemptIsBlocked(databaseUser, now)
    ) {
      await recordRecoveryFailure(databaseUser, now);
    }

    renderForgotPassword(response, {
      status: 401,
      emailValue: email,
      formError:
        "Recovery could not be verified or is temporarily unavailable.",
    });
    return;
  }

  const confirmedUser = await User.findOneAndUpdate(
    {
      _id: databaseUser._id,
      status: "active",
      passwordHash: databaseUser.passwordHash,
      passwordChangedAt: databaseUser.passwordChangedAt || null,
      recoveryPasswordHash: databaseUser.recoveryPasswordHash,
      recoveryPasswordSetAt: databaseUser.recoveryPasswordSetAt,
      lockedAt: databaseUser.lockedAt || null,
      deactivatedAt: databaseUser.deactivatedAt || null,
      recoveryFailedAttempts: databaseUser.recoveryFailedAttempts,
      recoveryAttemptWindowStartedAt:
        databaseUser.recoveryAttemptWindowStartedAt || null,
      recoveryBlockedUntil: databaseUser.recoveryBlockedUntil || null,
    },
    {
      $set: {
        recoveryFailedAttempts: 0,
        recoveryAttemptWindowStartedAt: null,
        recoveryBlockedUntil: null,
        updatedAt: now,
      },
    },
    { new: true },
  );

  if (!confirmedUser) {
    renderForgotPassword(response, {
      status: 401,
      emailValue: email,
      formError:
        "Recovery could not be verified or is temporarily unavailable.",
    });
    return;
  }

  const sessionDate = (value) =>
    value ? new Date(value).toISOString() : null;

  request.session.passwordResetAuthorisation = {
    studentId: confirmedUser.studentId,
    email: confirmedUser.email,
    passwordHash: confirmedUser.passwordHash,
    passwordChangedAt: sessionDate(confirmedUser.passwordChangedAt),
    recoveryPasswordSetAt: sessionDate(
      confirmedUser.recoveryPasswordSetAt,
    ),
    lockedAt: sessionDate(confirmedUser.lockedAt),
    deactivatedAt: sessionDate(confirmedUser.deactivatedAt),
    expiresAt: Date.now() + PASSWORD_RESET_ACCESS_MS,
  };

  request.session.save((error) => {
    if (error) {
      next(error);
      return;
    }

    response.redirect("/reset-password");
  });
}

// Atomically changes the password only while the approved account is unchanged.
async function resetPassword(request, response) {
  const authorisation = getPasswordResetAuthorisation(request);
  const accountFilter = passwordResetAccountFilter(authorisation);

  if (!accountFilter) {
    response.redirect("/forgot-password?reset=expired");
    return;
  }

  const newPassword =
    typeof request.body["new-password"] === "string"
      ? request.body["new-password"]
      : "";
  const confirmPassword =
    typeof request.body["confirm-password"] === "string"
      ? request.body["confirm-password"]
      : "";
  let newPasswordError = newPasswordValidationError(newPassword);
  let confirmPasswordError = "";

  if (confirmPassword === "") {
    confirmPasswordError = "Please confirm your new password.";
  } else if (confirmPassword !== newPassword) {
    confirmPasswordError = "Passwords do not match.";
  }

  const databaseUser = await User.findOne(accountFilter);

  if (!databaseUser) {
    delete request.session.passwordResetAuthorisation;
    response.redirect("/forgot-password?reset=expired");
    return;
  }

  if (
    !newPasswordError &&
    verifyPassword(newPassword, databaseUser.recoveryPasswordHash)
  ) {
    newPasswordError =
      "Choose a login password that is different from the recovery password.";
  }

  if (newPasswordError || confirmPasswordError) {
    response.status(422).render("resetpassword", {
      pageTitle: "Reset Password",
      resetComplete: false,
      newPasswordError: newPasswordError,
      confirmPasswordError: confirmPasswordError,
    });
    return;
  }

  const newPasswordHash = createPasswordHash(newPassword);
  const changedAt = new Date();
  const updatedUser = await User.findOneAndUpdate(
    {
      ...accountFilter,
      recoveryPasswordHash: databaseUser.recoveryPasswordHash,
    },
    {
      $set: {
        passwordHash: newPasswordHash,
        passwordChangedAt: changedAt,
        recoveryFailedAttempts: 0,
        recoveryAttemptWindowStartedAt: null,
        recoveryBlockedUntil: null,
        updatedAt: changedAt,
      },
      $unset: {
        recoveryPasswordHash: 1,
        recoveryPasswordSetAt: 1,
      },
    },
    { new: true },
  );

  if (!updatedUser) {
    delete request.session.passwordResetAuthorisation;
    response.redirect("/forgot-password?reset=expired");
    return;
  }

  delete request.session.passwordResetAuthorisation;
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
    response.redirect("/login.html");
    return;
  }

  response.render("deactivate-id", {
    pageTitle: "Deactivate Account",
    deactivateError: "",
  });
}

// The success view is shown only by a completed deactivation POST request.
function showDeactivatedSuccess(request, response) {
  response.redirect("/login.html");
}

// Checks confirmation, saves the inactive state, and then ends the session.
async function deactivateAccount(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    response.redirect("/login.html");
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

  let loginUser = null;

  for (let i = 0; i < loginStore.users.length; i += 1) {
    if (loginStore.users[i].id === currentUser._id) {
      loginUser = loginStore.users[i];
    }
  }

  if (!loginUser) {
    response.render("deactivate-id", {
      pageTitle: "Deactivate Account",
      deactivateError: "Current user not found.",
    });
    return;
  }

  if (loginUser.role === "admin") {
    response.status(409).render("deactivate-id", {
      pageTitle: "Deactivate Account",
      deactivateError:
        "Administrator accounts cannot be deactivated. Use a member account instead.",
    });
    return;
  }

  let accountState;

  try {
    accountState = await deactivateDatabaseAccount(currentUser.studentId);
  } catch (error) {
    console.error(error);
    response.status(500).render("deactivate-id", {
      pageTitle: "Deactivate Account",
      deactivateError: "Could not deactivate the account. Please try again.",
    });
    return;
  }

  if (!accountState) {
    response.status(409).render("deactivate-id", {
      pageTitle: "Deactivate Account",
      deactivateError: "This account is not available for deactivation.",
    });
    return;
  }

  loginUser.status = accountState.status;

  request.session.destroy(function (error) {
    if (error) {
      response.status(500).send("Could not deactivate the account.");
      return;
    }

    response.clearCookie("rmit.connect.sid", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
    });

    response.render("deactivated-success", {
      pageTitle: "Account Deactivated",
    });
  });
}

registerBlogApi(app, {
  blogs: blogs,
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
  createDiscussion,
);
app.post(
  "/discussions/:id/edit",
  requireForumLogin,
  upload.single("postImage"),
  updateDiscussion,
);
app.post(
  "/discussions/:id/replies",
  requireForumLogin,
  upload.single("replyImage"),
  createReply,
);
app.post(
  "/discussions/:id/replies/:replyId/edit",
  requireForumLogin,
  upload.single("replyImage"),
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
app.post("/forgot-password", verifyRecoveryPassword);
app.post("/reset-password", resetPassword);
app.get("/logout", showLogout);
app.get("/deactivate-account", showDeactivateAccount);
app.post("/deactivate-account", deactivateAccount);
app.get("/deactivated-success", showDeactivatedSuccess);

function handleRootError(error, request, response, _next) {
  const isApiRequest = request.path.startsWith("/api/");

  if (
    error instanceof multer.MulterError ||
    error.message === "Only JPEG and PNG images are allowed."
  ) {
    response.status(400).type("text").send(error.message);
    return;
  }

  if (error?.type === "entity.too.large" || error?.status === 413) {
    const message = "Request body is larger than the 6 MB limit.";
    return isApiRequest
      ? response.status(413).json({ error: message, code: "PAYLOAD_TOO_LARGE" })
      : response.status(413).type("text").send(message);
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    const message = "Request body contains invalid JSON.";
    return isApiRequest
      ? response.status(400).json({ error: message, code: "INVALID_JSON" })
      : response.status(400).type("text").send(message);
  }

  console.error(error);
  const message = "Something went wrong on the server.";
  return isApiRequest
    ? response.status(500).json({ error: message, code: "INTERNAL_ERROR" })
    : response.status(500).type("text").send(message);
}

// Mount Dat's shared account application exactly once for tests and production.
async function prepareApp() {
  if (accountAppMounted) return app;

  const { dataStore } = await import("./modules/account/src/data.js");
  const passwordModule = await import("./modules/account/src/passwords.js");
  const { createApp } = await import("./modules/account/src/app.js");

  loginStore = dataStore;
  createPasswordHash = passwordModule.createPasswordHash;
  verifyPassword = passwordModule.verifyPassword;
  app.use(
    createApp({
      sessionSecret: sessionSecret,
      accountStatusStore: {
        findByStudentId: findDatabaseAccountState,
        findByIdentifier: findDatabaseAccountByIdentifier,
        updateProfile: updateDatabaseProfile,
        updateStatus: updateDatabaseAccountStatus,
      },
    }),
  );
  app.use(handleRootError);
  accountAppMounted = true;

  return app;
}

// Starts the local Express server after all routes are prepared.
async function startServer(listenPort = port) {
  await connectDatabase();
  await prepareApp();

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

module.exports = { app, prepareApp, startServer };
