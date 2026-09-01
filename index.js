const express = require("express");
const session = require("express-session");
const multer = require("multer");
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
const app = express();
let accountAppMounted = false;
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

function showHome(request, response) {
  response.render("index", { pageTitle: "RMIT Connect" });
}

async function showSitemap(request, response) {
  const activeDiscussions = await Discussion.find({
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
    discussions: activeDiscussions,
    blogs: activeBlogs,
    reviews: reviews,
  });
}

function redirectForumLogin(response) {
  response.redirect("/login.html?returnTo=discussions");
}

// Show all active discussions.
async function showDiscussions(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  const discussionMessage = request.session.discussionMessage || "";
  request.session.discussionMessage = "";

  const activeDiscussions = await Discussion.find({
    deletedAt: null,
  });

  const activeReplies = await Reply.find({
    deletedAt: null,
  });

  const forumUsers = await User.find({});

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

  const activeDiscussions = await Discussion.find({
    deletedAt: null,
  });

  let discussion = null;

  for (let i = 0; i < activeDiscussions.length; i += 1) {
    if (String(activeDiscussions[i]._id) === request.params.id) {
      discussion = activeDiscussions[i];
    }
  }

  if (!discussion) {
    response.status(404).send("Discussion not found.");
    return;
  }

  const forumUsers = await User.find({});
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
  const activeReplies = await Reply.find({
    deletedAt: null,
  });
  const discussionReplies = [];
  const replyAuthors = [];
  const isMyReply = [];

  for (let i = 0; i < activeReplies.length; i += 1) {
    if (
      String(activeReplies[i].discussionId) === String(discussion._id)
    ) {
      let replyAuthor = {
        username: "Unknown user",
        profileImage: "/images/user_icon.png",
        course: "",
      };

      for (let j = 0; j < forumUsers.length; j += 1) {
        if (
          String(forumUsers[j]._id) === String(activeReplies[i].authorId)
        ) {
          replyAuthor = {
            username: forumUsers[j].name,
            profileImage:
              forumUsers[j].avatarUrl || "/images/user_icon.png",
            course: forumUsers[j].course,
          };
        }
      }

      discussionReplies.push(activeReplies[i]);
      replyAuthors.push(replyAuthor);
      isMyReply.push(
        String(activeReplies[i].authorId) === String(forumUser._id),
      );
    }
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

  const activeDiscussions = await Discussion.find({
    deletedAt: null,
  });

  let discussion = null;

  for (let i = 0; i < activeDiscussions.length; i += 1) {
    if (String(activeDiscussions[i]._id) === request.params.id) {
      discussion = activeDiscussions[i];
    }
  }

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

  if (!loginUser || loginUser.status !== "active") {
    return null;
  }

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
  const postTitle = (request.body.postTitle || "").trim();
  const postContent = (request.body.postContent || "").trim();
  const postImage = request.file
    ? "/uploads/" + request.file.filename
    : null;

  if (postTitle === "" || postTitle.length > 100) {
    response
      .status(400)
      .send("Please enter a title with 100 characters or less.");
    return;
  }

  if (postContent === "" || postContent.length > 1000) {
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

  const activeDiscussions = await Discussion.find({
    deletedAt: null,
  });

  let discussion = null;

  for (let i = 0; i < activeDiscussions.length; i += 1) {
    if (String(activeDiscussions[i]._id) === request.params.id) {
      discussion = activeDiscussions[i];
    }
  }

  if (!discussion) {
    response.status(404).send("Discussion not found.");
    return;
  }

  if (String(discussion.authorId) !== String(forumUser._id)) {
    response.status(403).send("You can only edit your own discussion.");
    return;
  }

  const postTitle = (request.body.postTitle || "").trim();
  const postContent = (request.body.postContent || "").trim();
  let postImage = discussion.image;

  if (request.file) {
    postImage = "/uploads/" + request.file.filename;
  }

  if (postTitle === "" || postTitle.length > 100) {
    response
      .status(400)
      .send("Please enter a title with 100 characters or less.");
    return;
  }

  if (postContent === "" || postContent.length > 1000) {
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

  await Discussion.updateOne(
    { _id: discussion._id },
    {
      title: postTitle,
      content: postContent,
      image: postImage,
      updatedAt: now,
    },
  );

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

  const activeDiscussions = await Discussion.find({
    deletedAt: null,
  });

  let discussion = null;

  for (let i = 0; i < activeDiscussions.length; i += 1) {
    if (String(activeDiscussions[i]._id) === request.params.id) {
      discussion = activeDiscussions[i];
    }
  }

  if (!discussion) {
    response.status(404).send("Discussion not found.");
    return;
  }

  if (String(discussion.authorId) !== String(forumUser._id)) {
    response.status(403).send("You can only delete your own discussion.");
    return;
  }

  const now = new Date();

  await Discussion.updateOne(
    { _id: discussion._id },
    {
      deletedAt: now,
      deletedBy: forumUser._id,
      updatedAt: now,
    },
  );

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

  const activeReplies = await Reply.find({
    deletedAt: null,
  });

  let reply = null;

  for (let i = 0; i < activeReplies.length; i += 1) {
    if (
      String(activeReplies[i]._id) === request.params.replyId &&
      String(activeReplies[i].discussionId) === request.params.id
    ) {
      reply = activeReplies[i];
    }
  }

  if (!reply) {
    response.status(404).send("Reply not found.");
    return;
  }

  if (String(reply.authorId) !== String(forumUser._id)) {
    response.status(403).send("You can only edit your own reply.");
    return;
  }

  const activeDiscussions = await Discussion.find({
    deletedAt: null,
  });

  let discussion = null;

  for (let i = 0; i < activeDiscussions.length; i += 1) {
    if (String(activeDiscussions[i]._id) === request.params.id) {
      discussion = activeDiscussions[i];
    }
  }

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
  const replyTitle = (request.body.replyTitle || "").trim();
  const replyContent = (request.body.replyContent || "").trim();
  const replyImage = request.file
    ? "/uploads/" + request.file.filename
    : null;

  if (replyTitle === "" || replyTitle.length > 100) {
    response
      .status(400)
      .send("Please enter a reply title with 100 characters or less.");
    return;
  }

  if (replyContent === "" || replyContent.length > 1000) {
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

  const activeDiscussions = await Discussion.find({
    deletedAt: null,
  });

  let discussion = null;

  for (let i = 0; i < activeDiscussions.length; i += 1) {
    if (String(activeDiscussions[i]._id) === request.params.id) {
      discussion = activeDiscussions[i];
    }
  }

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
  const replyTitle = (request.body.replyTitle || "").trim();
  const replyContent = (request.body.replyContent || "").trim();

  if (replyTitle === "" || replyTitle.length > 100) {
    response
      .status(400)
      .send("Please enter a reply title with 100 characters or less.");
    return;
  }

  if (replyContent === "" || replyContent.length > 1000) {
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

  const activeReplies = await Reply.find({
    deletedAt: null,
  });

  let reply = null;

  for (let i = 0; i < activeReplies.length; i += 1) {
    if (
      String(activeReplies[i]._id) === request.params.replyId &&
      String(activeReplies[i].discussionId) === request.params.id
    ) {
      reply = activeReplies[i];
    }
  }

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

  await Reply.updateOne(
    { _id: reply._id },
    {
      title: replyTitle,
      content: replyContent,
      image: replyImage,
      updatedAt: now,
    },
  );

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

  const activeReplies = await Reply.find({
    deletedAt: null,
  });

  let reply = null;

  for (let i = 0; i < activeReplies.length; i += 1) {
    if (
      String(activeReplies[i]._id) === request.params.replyId &&
      String(activeReplies[i].discussionId) === request.params.id
    ) {
      reply = activeReplies[i];
    }
  }

  if (!reply) {
    response.status(404).send("Reply not found.");
    return;
  }

  if (String(reply.authorId) !== String(forumUser._id)) {
    response.status(403).send("You can only delete your own reply.");
    return;
  }

  const now = new Date();

  await Reply.updateOne(
    { _id: reply._id },
    {
      deletedAt: now,
      deletedBy: forumUser._id,
      updatedAt: now,
    },
  );

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

// Shows the page where a student enters an RMIT email address.
function showForgotPassword(request, response) {
  response.render("forgotpassword", {
    pageTitle: "Forgot Password",
    emailError: "",
  });
}

// Shows the page where a student chooses a new password.
function showResetPassword(request, response) {
  if (!request.session || !request.session.resetUserId) {
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

// Checks the email on the server before showing the reset form.
function sendResetLink(request, response) {
  const email = (request.body["reset-email"] || "").trim().toLowerCase();
  const emailFormat = /^[^\s@]+@rmit\.edu\.vn$/;

  if (email === "" || emailFormat.test(email) === false) {
    response.render("forgotpassword", {
      pageTitle: "Forgot Password",
      emailError: "Please enter a valid RMIT email address.",
    });

    return;
  }

  let loginUser = null;

  for (let i = 0; i < loginStore.users.length; i += 1) {
    if (loginStore.users[i].email.toLowerCase() === email) {
      loginUser = loginStore.users[i];
    }
  }

  if (!loginUser || loginUser.status !== "active") {
    response.render("forgotpassword", {
      pageTitle: "Forgot Password",
      emailError: "No active account was found with this email address.",
    });
    return;
  }

  request.session.resetUserId = loginUser.id;
  response.redirect("/reset-password");
}

// Checks and saves the new password for the reset account.
function resetPassword(request, response) {
  const newPassword =
    typeof request.body["new-password"] === "string"
      ? request.body["new-password"]
      : "";
  const confirmPassword =
    typeof request.body["confirm-password"] === "string"
      ? request.body["confirm-password"]
      : "";

  if (!request.session || !request.session.resetUserId) {
    response.redirect("/forgot-password");
    return;
  }

  let loginUser = null;

  for (let i = 0; i < loginStore.users.length; i += 1) {
    if (loginStore.users[i].id === request.session.resetUserId) {
      loginUser = loginStore.users[i];
    }
  }

  if (!loginUser || loginUser.status !== "active") {
    request.session.resetUserId = null;
    response.redirect("/forgot-password");
    return;
  }

  let newPasswordError = "";
  let confirmPasswordError = "";

  if (newPassword.length < 8 || newPassword.length > 128) {
    newPasswordError = "Password must contain 8 to 128 characters.";
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

  loginUser.passwordHash = createPasswordHash(newPassword);
  request.session.resetUserId = null;

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

// Shows the message after an account is deactivated.
function showDeactivatedSuccess(request, response) {
  response.render("deactivated-success", {
    pageTitle: "Account Deactivated",
  });
}

// Checks the confirmation checkbox and updates the current user's account status.
async function deactivateAccount(request, response) {
  const accountConfirm = request.body["deactivate-id-confirm"];

  if (accountConfirm !== "confirmed") {
    response.render("deactivate-id", {
      pageTitle: "Deactivate Account",
      deactivateError: "Please confirm that you understand this action.",
    });
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    response.render("deactivate-id", {
      pageTitle: "Deactivate Account",
      deactivateError: "Current user not found.",
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

  loginUser.status = "locked";

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

    response.redirect("/deactivated-success");
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
app.post("/discussions", upload.single("postImage"), createDiscussion);
app.post(
  "/discussions/:id/edit",
  upload.single("postImage"),
  updateDiscussion,
);
app.post(
  "/discussions/:id/replies",
  upload.single("replyImage"),
  createReply,
);
app.post(
  "/discussions/:id/replies/:replyId/edit",
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
app.post("/forgot-password", sendResetLink);
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
  app.use(createApp({ sessionSecret }));
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
