const express = require("express");
const session = require("express-session");
const {
  users,
  discussions,
  replies,
  getDiscussionId,
  getReplyId,
} = require("./forum-data");
const { blogs } = require("./blog-data");
const { registerBlogApi } = require("./routes/register-blog-api");
const reviewData = require("./review-data");
let reviews = reviewData.reviews;
const getReviewId = reviewData.getReviewId;
let loginStore = null;
let createPasswordRecord = null;
const app = express();
// Uses the PORT environment variable when provided. Otherwise, it uses port 3000.
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const sessionSecret =
  process.env.SESSION_SECRET || "local-demo-change-this-secret";

// Sets EJS as the file type used to build the page on the server.
app.set("view engine", "ejs");

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(express.json());
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
  })
);
// Reads values sent from normal HTML forms.
app.use(express.urlencoded({ extended: true }));
// Makes files inside public available to the browser, such as CSS and JavaScript.
app.use(express.static("public"));

function showHome(request, response) {
  response.render("index", { pageTitle: "RMIT Connect" });
}

function showSitemap(request, response) {
  const activeDiscussions = [];
  const activeBlogs = [];

  for (let i = 0; i < discussions.length; i += 1) {
    if (discussions[i].deletedAt === null) {
      activeDiscussions.push(discussions[i]);
    }
  }

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

  const activeDiscussions = [];

  for (let i = 0; i < discussions.length; i += 1) {
    if (discussions[i].deletedAt === null) {
      activeDiscussions.push(discussions[i]);
    }
  }

  const replyCounts = [];
  const authors = [];

  for (let i = 0; i < activeDiscussions.length; i += 1) {
    let replyCount = 0;
    let author = null;

    for (let j = 0; j < replies.length; j += 1) {
      if (
        replies[j].discussionId === activeDiscussions[i]._id &&
        replies[j].deletedAt === null
      ) {
        replyCount += 1;
      }
    }

    for (let j = 0; j < users.length; j += 1) {
      if (users[j]._id === activeDiscussions[i].authorId) {
        author = users[j];
      }
    }

    replyCounts.push(replyCount);
    authors.push(author);
  }

  response.render("discussion", {
    pageTitle: "Discussion Forum",
    discussions: activeDiscussions,
    replyCounts: replyCounts,
    authors: authors,
  });
}

async function showDiscussionDetail(request, response) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  let discussion = null;

  for (let i = 0; i < discussions.length; i += 1) {
    if (discussions[i]._id === request.params.id) {
      discussion = discussions[i];
    }
  }

  if (!discussion || discussion.deletedAt !== null) {
    response.send("Discussion not found");
    return;
  }

  let author = null;

  for (let i = 0; i < users.length; i += 1) {
    if (users[i]._id === discussion.authorId) {
      author = users[i];
    }
  }

  const isAuthor = discussion.authorId === currentUser._id;
  const discussionReplies = [];
  const replyAuthors = [];
  const isMyReply = [];

  for (let i = 0; i < replies.length; i += 1) {
    if (
      replies[i].discussionId === discussion._id &&
      replies[i].deletedAt === null
    ) {
      let replyAuthor = null;

      for (let j = 0; j < users.length; j += 1) {
        if (users[j]._id === replies[i].authorId) {
          replyAuthor = users[j];
        }
      }

      discussionReplies.push(replies[i]);
      replyAuthors.push(replyAuthor);
      isMyReply.push(replies[i].authorId === currentUser._id);
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
  let discussion = null;

  for (let i = 0; i < discussions.length; i += 1) {
    if (discussions[i]._id === request.params.id) {
      discussion = discussions[i];
    }
  }

  if (!discussion || discussion.deletedAt !== null) {
    response.send("Discussion not found");
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  if (discussion.authorId !== currentUser._id) {
    response.send("You can only edit your own post.");
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
  const postImage = request.body.postImage || "";

  const allowedImages = [
    "/images/peer-workshop.jpg",
    "/images/RMIT_campus.png",
    "/images/saigonview.jpg",
  ];

  if (postTitle === "" || postTitle.length > 100) {
    response.send("Please enter a title with 100 characters or less.");
    return;
  }

  if (postContent === "" || postContent.length > 1000) {
    response.send("Please enter content with 1000 characters or less.");
    return;
  }

  if (allowedImages.includes(postImage) === false) {
    response.send("Please select a post image.");
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  const now = new Date();

  const discussion = {
    _id: getDiscussionId(),
    title: postTitle,
    content: postContent,
    image: postImage,
    authorId: currentUser._id,
    createdAt: now,
    deletedAt: null,
    deletedBy: null,
  };

  discussions.push(discussion);
  response.redirect("/discussions");
}

// Update the selected post.
async function updateDiscussion(request, response) {
  let discussion = null;

  for (let i = 0; i < discussions.length; i += 1) {
    if (discussions[i]._id === request.params.id) {
      discussion = discussions[i];
    }
  }

  if (!discussion || discussion.deletedAt !== null) {
    response.send("Discussion not found.");
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  if (discussion.authorId !== currentUser._id) {
    response.send("You can only edit your own discussion.");
    return;
  }

  const postTitle = (request.body.postTitle || "").trim();
  const postContent = (request.body.postContent || "").trim();
  const postImage = request.body.postImage || "";

  const allowedImages = [
    "/images/peer-workshop.jpg",
    "/images/RMIT_campus.png",
    "/images/saigonview.jpg",
  ];

  if (postTitle === "" || postTitle.length > 100) {
    response.send("Please enter a title with 100 characters or less.");
    return;
  }

  if (postContent === "" || postContent.length > 1000) {
    response.send("Please enter content with 1000 characters or less.");
    return;
  }

  if (allowedImages.includes(postImage) === false) {
    response.send("Please select a post image.");
    return;
  }

  discussion.title = postTitle;
  discussion.content = postContent;
  discussion.image = postImage;

  response.redirect("/discussions/" + discussion._id);
}

// Soft delete the selected discussion post.
async function deleteDiscussion(request, response) {
  let discussion = null;

  for (let i = 0; i < discussions.length; i += 1) {
    if (discussions[i]._id === request.params.id) {
      discussion = discussions[i];
    }
  }

  if (!discussion || discussion.deletedAt !== null) {
    response.send("Discussion not found.");
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  if (discussion.authorId !== currentUser._id) {
    response.send("You can only delete your own discussion.");
    return;
  }

  discussion.deletedAt = new Date();
  discussion.deletedBy = currentUser._id;

  response.redirect("/discussions");
}

// Show the edit page for a reply written by the current user.
async function showEditReply(request, response) {
  let reply = null;

  for (let i = 0; i < replies.length; i += 1) {
    if (replies[i]._id === request.params.replyId) {
      reply = replies[i];
    }
  }

  if (
    !reply ||
    reply.deletedAt !== null ||
    reply.discussionId !== request.params.id
  ) {
    response.send("Reply not found.");
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  if (reply.authorId !== currentUser._id) {
    response.send("You can only edit your own reply.");
    return;
  }

  let discussion = null;

  for (let i = 0; i < discussions.length; i += 1) {
    if (discussions[i]._id === request.params.id) {
      discussion = discussions[i];
    }
  }

  if (!discussion || discussion.deletedAt !== null) {
    response.send("Discussion not found.");
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
  const replyImage = request.body.replyImage || "";

  const allowedImages = [
    "peer-workshop.jpg",
    "RMIT_campus.png",
    "saigonview.jpg",
  ];

  if (replyTitle === "" || replyTitle.length > 100) {
    response.send("Please enter a reply title with 100 characters or less.");
    return;
  }

  if (replyContent === "" || replyContent.length > 1000) {
    response.send("Please enter reply content with 1000 characters or less.");
    return;
  }

  if (allowedImages.includes(replyImage) === false) {
    response.send("Please select a reply image.");
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  let discussion = null;

  for (let i = 0; i < discussions.length; i += 1) {
    if (discussions[i]._id === request.params.id) {
      discussion = discussions[i];
    }
  }

  if (!discussion || discussion.deletedAt !== null) {
    response.send("Discussion not found.");
    return;
  }

  const reply = {
    _id: getReplyId(),
    title: replyTitle,
    content: replyContent,
    image: "/images/" + replyImage,
    authorId: currentUser._id,
    discussionId: request.params.id,
    createdAt: new Date(),
    deletedAt: null,
    deletedBy: null,
  };

  replies.push(reply);
  response.redirect("/discussions/" + request.params.id);
}

// Save changes to a reply written by the current user.
async function updateReply(request, response) {
  const replyTitle = (request.body.replyTitle || "").trim();
  const replyContent = (request.body.replyContent || "").trim();
  const replyImage = request.body.replyImage || "";

  const allowedImages = [
    "/images/peer-workshop.jpg",
    "/images/RMIT_campus.png",
    "/images/saigonview.jpg",
  ];

  if (replyTitle === "" || replyTitle.length > 100) {
    response.send("Please enter a reply title with 100 characters or less.");
    return;
  }

  if (replyContent === "" || replyContent.length > 1000) {
    response.send("Please enter reply content with 1000 characters or less.");
    return;
  }

  if (allowedImages.includes(replyImage) === false) {
    response.send("Please select a reply image.");
    return;
  }

  let reply = null;

  for (let i = 0; i < replies.length; i += 1) {
    if (replies[i]._id === request.params.replyId) {
      reply = replies[i];
    }
  }

  if (
    !reply ||
    reply.deletedAt !== null ||
    reply.discussionId !== request.params.id
  ) {
    response.send("Reply not found.");
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  if (reply.authorId !== currentUser._id) {
    response.send("You can only edit your own reply.");
    return;
  }

  reply.title = replyTitle;
  reply.content = replyContent;
  reply.image = replyImage;

  response.redirect("/discussions/" + request.params.id);
}

// Soft delete a reply written by the current user.
async function deleteReply(request, response) {
  let reply = null;

  for (let i = 0; i < replies.length; i += 1) {
    if (replies[i]._id === request.params.replyId) {
      reply = replies[i];
    }
  }

  if (
    !reply ||
    reply.deletedAt !== null ||
    reply.discussionId !== request.params.id
  ) {
    response.send("Reply not found.");
    return;
  }

  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    redirectForumLogin(response);
    return;
  }

  if (reply.authorId !== currentUser._id) {
    response.send("You can only delete your own reply.");
    return;
  }

  reply.deletedAt = new Date();
  reply.deletedBy = currentUser._id;

  response.redirect("/discussions/" + request.params.id);
}

function showBlogs(request, response) {
  response.render("blog", { pageTitle: "Blogs" });
}

function showBlogDetails(request, response) {
  response.render("blog-details", { pageTitle: "Blog Details" });
}

function getReviewErrors(data) {
  const errors = {};
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const description =
    typeof data.description === "string" ? data.description.trim() : "";
  const reviewerName =
    typeof data.reviewerName === "string" ? data.reviewerName.trim() : "";
  const rating = Number(data.rating);

  if (title.length < 5 || title.length > 100) {
    errors.title = "Title must be between 5 and 100 characters.";
  }

  if (description.length < 20 || description.length > 1000) {
    errors.description = "Description must be between 20 and 1000 characters.";
  }

  if (!rating || rating < 1 || rating > 5) {
    errors.rating = "Rating must be a number between 1 and 5.";
  }

  if (reviewerName.length < 2 || reviewerName.length > 50) {
    errors.reviewerName = "Reviewer name must be between 2 and 50 characters.";
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
      ? request.body.courseCode.trim()
      : "";

  const newReview = {
    id: getReviewId(),
    userId: currentUser._id,
    courseCode: courseCode,
    title: request.body.title.trim(),
    description: request.body.description.trim(),
    rating: Number(request.body.rating),
    reviewerName: request.body.reviewerName.trim(),
    imageUrl: "/images/review-placeholder.jpg",
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
  review.description = request.body.description.trim();
  review.rating = Number(request.body.rating);
  review.reviewerName = request.body.reviewerName.trim();

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

  loginUser.password = createPasswordRecord(newPassword);
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
app.post("/discussions", createDiscussion);
app.post("/discussions/:id/edit", updateDiscussion);
app.post("/discussions/:id/replies", createReply);
app.post("/discussions/:id/replies/:replyId/edit", updateReply);
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

// Starts the local Express server after all routes are prepared.
async function startServer() {
  const { dataStore } = await import(
    "./modules/account/src/data.js"
  );
  const passwordModule = await import(
    "./modules/account/src/passwords.js"
  );
  const { createApp } = await import(
    "./modules/account/src/app.js"
  );

  loginStore = dataStore;
  createPasswordRecord = passwordModule.createPasswordRecord;
  app.use(createApp());

  app.listen(port, () => {
    console.log("RMIT Connect is running on http://localhost:" + port);
  });
}

startServer();
