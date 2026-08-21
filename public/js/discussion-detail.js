const discussionReplyForm = document.getElementById("reply-form");
const discussionReplyTitle = document.getElementById("reply-title");
const discussionReplyImage = document.getElementById("reply-image");
const discussionReplyContent = document.getElementById("reply-content");
const replyErrorText = document.getElementById("reply-error-text");
const replyTitleErrorText = document.getElementById("reply-title-error-text");
const replyImageErrorText = document.getElementById("reply-image-error-text");

discussionReplyForm.noValidate = true;

function checkDiscussionReplyTitle() {
  const replyTitle = discussionReplyTitle.value.trim();

  if (replyTitle === "") {
    replyTitleErrorText.textContent = "Please enter a reply title.";
    return false;
  }

  if (replyTitle.length > 100) {
    replyTitleErrorText.textContent =
      "The reply title must be 100 characters or less.";
    return false;
  }

  replyTitleErrorText.textContent = "";
  return true;
}

function checkDiscussionReplyImage() {
  const replyImage = discussionReplyImage.value;

  if (replyImage === "") {
    replyImageErrorText.textContent = "Please select a reply image.";
    return false;
  }

  replyImageErrorText.textContent = "";
  return true;
}

function checkDiscussionReply() {
  const replyText = discussionReplyContent.value.trim();

  if (replyText === "") {
    replyErrorText.textContent = "Please enter a reply.";
    return false;
  }

  if (replyText.length > 1000) {
    replyErrorText.textContent =
      "The reply content must be 1000 characters or less.";
    return false;
  }

  replyErrorText.textContent = "";
  return true;
}

discussionReplyContent.addEventListener("input", checkDiscussionReply);
discussionReplyTitle.addEventListener("input", checkDiscussionReplyTitle);
discussionReplyImage.addEventListener("input", checkDiscussionReplyImage);

discussionReplyForm.addEventListener("submit", function (event) {
  const discussionReplyTitleIsValid = checkDiscussionReplyTitle();
  const discussionReplyImageIsValid = checkDiscussionReplyImage();
  const discussionReplyContentIsValid = checkDiscussionReply();

  if (
    discussionReplyTitleIsValid === false ||
    discussionReplyImageIsValid === false ||
    discussionReplyContentIsValid === false
  ) {
    event.preventDefault();
  }
});
