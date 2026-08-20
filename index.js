const express = require("express");
const {
  users,
  discussions,
  replies,
  getDiscussionId,
  getReplyId,
} = require("./forum-data");
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

// Show all active discussions.
async function showDiscussions(request, response) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
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
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
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

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
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

// Gets a active test user until the shared login module is connected.
async function getCurrentUser() {
  for (let i = 0; i < users.length; i += 1) {
    if (users[i].accountStatus === "active") {
      return users[i];
    }
  }

  return null;
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

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
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

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
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

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
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

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
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

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
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

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
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

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    response.redirect("/deactivated-success");
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
  const emailFormat = /^[^\s@]+@rmit\.edu\.vn$/;

  if (email === "" || emailFormat.test(email) === false) {
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

  response.redirect("/deactivated-success");
}

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
