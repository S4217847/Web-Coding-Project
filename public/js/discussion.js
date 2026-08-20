const discussionPostForm = document.getElementById("post-form");
const discussionPostTitle = document.getElementById("post-title");
const discussionPostContent = document.getElementById("post-content");
const discussionPostImage = document.getElementById("post-image");
const titleErrorText = document.getElementById("title-error-text");
const contentErrorText = document.getElementById("content-error-text");
const imageErrorText = document.getElementById("image-error-text");
discussionPostForm.noValidate = true;

function checkDiscussionTitle() {
  const title = discussionPostTitle.value.trim();

  if (title === "") {
    titleErrorText.textContent = "Please type a post title.";
    return false;
  }

  if (title.length > 100) {
    titleErrorText.textContent = "The title must be 100 characters or less.";
    return false;
  }

  titleErrorText.textContent = "";
  return true;
}

function checkDiscussionContent() {
  const content = discussionPostContent.value.trim();

  if (content === "") {
    contentErrorText.textContent = "Please type the post content.";
    return false;
  }

  if (content.length > 1000) {
    contentErrorText.textContent =
      "The content must be 1000 characters or less.";
    return false;
  }

  contentErrorText.textContent = "";
  return true;
}

function checkDiscussionImage() {
  if (discussionPostImage.value === "") {
    imageErrorText.textContent = "Please select a post image.";
    return false;
  }

  imageErrorText.textContent = "";
  return true;
}

discussionPostTitle.addEventListener("input", function () {
  checkDiscussionTitle();
});

discussionPostContent.addEventListener("input", function () {
  checkDiscussionContent();
});

discussionPostImage.addEventListener("change", function () {
  checkDiscussionImage();
});

discussionPostForm.addEventListener("submit", function (event) {
  const discussionTitleIsValid = checkDiscussionTitle();
  const discussionContentIsValid = checkDiscussionContent();
  const discussionImageIsValid = checkDiscussionImage();

  if (
    discussionTitleIsValid === false ||
    discussionContentIsValid === false ||
    discussionImageIsValid === false
  ) {
    event.preventDefault();
    return;
  }
});
