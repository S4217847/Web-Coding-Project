const express = require("express");
// Loads the Atlas connection string from the local .env file.
require("dotenv").config();
// Uses the MongoDB connection function from models/dbconnect.js.
const { dbconnect } = require("./models/dbconnect");
// Use the models that describe data saved in Mongo DB.
const { User } = require("./models/user-model");
const { Discussion } = require("./models/discussion-model");
const { Reply } = require("./models/reply-model");
// Creates the Express application used for all website routes.
const app = express();
// Uses the port from .env when it exists. Otherwise, it uses port 3000.
const port = process.env.PORT || 3000;

// Sets EJS as the file type used to build the page on the server.
app.set("view engine", "ejs");
// Reads values sent from normal HTML forms.
app.use(express.urlencoded({ extended: true }));
// Makes files inside public available to the browser, such as CSS and JavaScript.
app.use(express.static("public"));

function showHome(request, response) {
  response.render("index", { pageTitle: "RMIT Connect" });
}

// Get Discussion posts from MongoDB and search them when needed.
async function showDiscussions(request, response) {
  // Temporarily require an active test user until Login is connected.
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
    return;
  }

  // Read the search values sent from the URL.
  const searchText = request.query.search || "";
  const filterType = request.query.filterby || "title";
  const sortType = request.query.sortby || "newest";

  let sortOrder = -1;
  if (sortType === "oldest") {
    sortOrder = 1;
  }

  // Get every Discussion document from MongoDB
  let discussions = await Discussion.find({ deletedAt: null }).sort({
    createdAt: sortOrder,
  });

  // Search only when the user entered a keyword
  if (searchText !== "") {
    const foundDiscussions = [];

    for (let i = 0; i < discussions.length; i += 1) {
      let textToCheck = discussions[i].title;

      if (filterType === "content") {
        textToCheck = discussions[i].content;
      }

      if (textToCheck.toLowerCase().includes(searchText.toLowerCase())) {
        foundDiscussions.push(discussions[i]);
      }
    }

    discussions = foundDiscussions;
  }

  const replyCounts = [];
  const authors = [];

  for (let i = 0; i < discussions.length; i += 1) {
    const discussionReplies = await Reply.find({
      discussionId: discussions[i]._id,
      deletedAt: null,
    });

    replyCounts.push(discussionReplies.length);
    const author = await User.findById(discussions[i].authorId);
    authors.push(author);
  }

  response.render("discussion", {
    pageTitle: "Discussion Forum",
    discussions: discussions,
    replyCounts: replyCounts,
    authors: authors,
    searchText: searchText,
    filterType: filterType,
    sortType: sortType,
  });
}

async function showDiscussionDetail(request, response) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
    return;
  }

  // Use the ID in /discussions/:id to find the selected post.
  const discussion = await Discussion.findById(request.params.id);

  // Do not show a post that was soft-deleted.
  if (!discussion || discussion.deletedAt !== null) {
    response.send("Discussion not found");
    return;
  }

  // Find the User document linked by this post's authorId.
  const author = await User.findById(discussion.authorId);
  const isAuthor =
    currentUser !== null &&
    discussion.authorId.toString() === currentUser._id.toString();

  const replies = await Reply.find({
    discussionId: discussion._id,
    deletedAt: null,
  });

  const replyAuthors = [];
  const isMyReply = [];

  for (let i = 0; i < replies.length; i += 1) {
    const replyAuthor = await User.findById(replies[i].authorId);
    replyAuthors.push(replyAuthor);
    isMyReply.push(
      currentUser !== null &&
        replies[i].authorId.toString() === currentUser._id.toString(),
    );
  }

  response.render("discussion-detail", {
    pageTitle: "Discussion Details",
    discussion: discussion,
    author: author,
    isAuthor: isAuthor,
    replies: replies,
    replyAuthors: replyAuthors,
    isMyReply: isMyReply,
  });
}

// Show the edit page only to the author.
async function showEditDiscussion(request, response) {
  const discussion = await Discussion.findById(request.params.id);

  if (!discussion || discussion.deletedAt !== null) {
    response.send("Discussion not found");
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
    return;
  }

  if (discussion.authorId.toString() !== currentUser._id.toString()) {
    response.send("You can only edit your own post.");
    return;
  }

  response.render("discussion-edit", {
    pageTitle: "Edit Discussion",
    discussion: discussion,
  });
}

// Gets one active test User until the shared Login module is connected.
async function getCurrentUser() {
  const currentUser = await User.findOne({ accountStatus: "active" });
  return currentUser;
}

// Save a new discussion post from the Discussion Forum form

async function createDiscussion(request, response) {
  const postTitle = request.body.postTitle.trim();
  const postContent = request.body.postContent.trim();
  const postImage = request.body.postImage;

  const allowedImages = [
    "/images/peer-workshop.jpg",
    "/images/RMIT_campus.png",
    "/images/saigonview.jpg",
  ];

  if (postTitle === "" || postTitle.length > 100) {
    response.send("Please enter a title with 100 character or less.");
    return;
  }

  if (postContent === "" || postContent.length > 1000) {
    response.send("Please enter content with 1000 character or less.");
    return;
  }

  if (allowedImages.includes(postImage) === false) {
    response.send("Please a post Image");
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
    return;
  }

  const discussion = new Discussion({
    title: postTitle,
    content: postContent,
    image: postImage,
    authorId: currentUser._id,
  });

  await discussion.save();
  response.redirect("/discussions");
}

// Update the selected post
async function updateDiscussion(request, response) {
  const discussion = await Discussion.findById(request.params.id);

  if (!discussion || discussion.deletedAt !== null) {
    response.send("Discussion not found.");
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
    return;
  }

  if (discussion.authorId.toString() !== currentUser._id.toString()) {
    response.send("You can only edit your own discussion.");
    return;
  }

  const postTitle = (request.body.postTitle || "").trim();
  const postContent = (request.body.postContent || "").trim();
  const postImage = request.body.postImage;

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

  await discussion.save();
  response.redirect("/discussions/" + discussion._id);
}

// Soft delete the selected discussion post.
async function deleteDiscussion(request, response) {
  const discussion = await Discussion.findById(request.params.id);

  if (!discussion || discussion.deletedAt !== null) {
    response.send("Discussion not found.");
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
    return;
  }

  if (discussion.authorId.toString() !== currentUser._id.toString()) {
    response.send("You can only delete your own discussion.");
    return;
  }

  discussion.deletedAt = new Date();
  discussion.deletedBy = currentUser._id;

  await discussion.save();
  response.redirect("/discussions");
}

// Show the edit page for a reply written by the current user.
async function showEditReply(request, response) {
  const reply = await Reply.findById(request.params.replyId);

  if (
    !reply ||
    reply.deletedAt !== null ||
    reply.discussionId.toString() !== request.params.id
  ) {
    response.send("Reply not found.");
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
    return;
  }

  if (reply.authorId.toString() !== currentUser._id.toString()) {
    response.send("You can only edit your own reply.");
    return;
  }

  const discussion = await Discussion.findById(request.params.id);

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
  const replyTitle = request.body.replyTitle.trim();
  const replyContent = request.body.replyContent.trim();
  const replyImage = request.body.replyImage;

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

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
    return;
  }

  const reply = new Reply({
    title: replyTitle,
    content: replyContent,
    image: "/images/" + replyImage,
    authorId: currentUser._id,
    discussionId: request.params.id,
  });

  await reply.save();
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

  const reply = await Reply.findById(request.params.replyId);

  if (
    !reply ||
    reply.deletedAt !== null ||
    reply.discussionId.toString() !== request.params.id
  ) {
    response.send("Reply not found.");
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
    return;
  }

  if (reply.authorId.toString() !== currentUser._id.toString()) {
    response.send("You can only edit your own reply.");
    return;
  }

  reply.title = replyTitle;
  reply.content = replyContent;
  reply.image = replyImage;

  await reply.save();
  response.redirect("/discussions/" + request.params.id);
}

// Soft delete a reply written by the current user.
async function deleteReply(request, response) {
  const reply = await Reply.findById(request.params.replyId);

  if (!reply || reply.deletedAt !== null) {
    response.send("Reply not found.");
    return;
  }

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
    return;
  }

  if (reply.authorId.toString() !== currentUser._id.toString()) {
    response.send("You can only delete your own reply.");
    return;
  }

  reply.deletedAt = new Date();
  reply.deletedBy = currentUser._id;

  await reply.save();
  response.redirect("/discussions/" + request.params.id);
}

function showBlogs(request, response) {
  response.render("blog", { pageTitle: "Blogs" });
}

function showBlogDetails(request, response) {
  response.render("blog-details", { pageTitle: "Blog Details" });
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

// Shows the message after a password reset link is requested.
function showResetPassword(request, response) {
  response.render("resetpassword", { pageTitle: "Reset Password" });
}

// Shows the logout result page.
function showLogout(request, response) {
  response.render("logout", { pageTitle: "Logged Out" });
}

// Checks the email on the server before showing the reset message.
function sendResetLink(request, response) {
  const email = (request.body["reset-email"] || "").trim().toLowerCase();

  if (email === "" || email.includes("@rmit.edu.vn") === false) {
    response.render("forgotpassword", {
      pageTitle: "Forgot Password",
      emailError: "Please enter a valid RMIT email address.",
    });

    return;
  }

  response.redirect("/reset-password");
}

// Shows the account deactivation form.
function showDeactivateAccount(request, response) {
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

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.render("deactivate-id", {
      pageTitle: "Deactivate Account",
      deactivateError: "Current user not found.",
    });
    return;
  }

  if (currentUser.accountStatus === "deactivated") {
    response.render("deactivate-id", {
      pageTitle: "Deactivate Account",
      deactivateError: "This account is already deactivated.",
    });
    return;
  }

  currentUser.accountStatus = "deactivated";
  await currentUser.save();

  response.redirect("/deactivated-success");
}

// Connect to MongoDB before the application starts its routes and server.
(async () => {
  const databaseConnected = await dbconnect(process.env.MONGODB_URI);

  if (databaseConnected === false) {
    return;
  }

  console.log("Connected to database.");

  // GET routes show a page when the user opens its URL in the browser.
  app.get("/", showHome);
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
  app.get("/reviews", showReviews);
  app.get("/reviews/browse", showReviewBrowse);
  app.get("/reviews/:id/edit", showReviewEdit);
  app.get("/reviews/:id", showReviewDetail);
  app.get("/wishlist", showWishlist);
  app.get("/wishlist/add", showWishlistAdd);

  // Shared User Account routes.
  app.get("/forgot-password", showForgotPassword);
  app.get("/reset-password", showResetPassword);
  app.post("/forgot-password", sendResetLink);
  app.get("/logout", showLogout);
  app.get("/deactivate-account", showDeactivateAccount);
  app.post("/deactivate-account", deactivateAccount);
  app.get("/deactivated-success", showDeactivatedSuccess);

  // Starts the local Express server after all routes are prepared.
  app.listen(port, () => {
    console.log("RMIT Connect is running on http://localhost:" + port);
  });
})();
