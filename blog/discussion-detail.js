const discussionReplyForm = document.getElementById("reply-form");
const discussionReplyContent = document.getElementById("reply-content");
const replyErrorText = document.getElementById("reply-error-text");

discussionReplyForm.noValidate = true;

function checkDiscussionReply() {
  const replyText = discussionReplyContent.value.trim();

  if (replyText === "") {
    replyErrorText.textContent = "Please type a reply.";
    return false;
  }

  replyErrorText.textContent = "";
  return true;
}

discussionReplyContent.addEventListener("input", checkDiscussionReply);

discussionReplyForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const discussionReplyIsValid = checkDiscussionReply();

  if (discussionReplyIsValid === true) {
    alert("The reply is submitted.");
  }
});
