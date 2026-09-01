const discussionPostForm = document.getElementById("post-form");
const discussionPostTitle = document.getElementById("post-title");
const discussionPostContent = document.getElementById("post-content");
const discussionPostImage = document.getElementById("post-image");
const titleErrorText = document.getElementById("title-error-text");
const contentErrorText = document.getElementById("content-error-text");
const imageErrorText = document.getElementById("image-error-text");
const showPostFormButton = document.getElementById("show-post-form-button");
discussionPostForm.noValidate = true;

showPostFormButton.addEventListener("click", function () {
  discussionPostForm.classList.toggle("postbox-hidden");

  if (discussionPostForm.classList.contains("postbox-hidden")) {
    showPostFormButton.setAttribute("aria-expanded", "false");
  } else {
    showPostFormButton.setAttribute("aria-expanded", "true");
  }
});

const savedPostTitle = localStorage.getItem("discussionPostTitle");
const savedPostContent = localStorage.getItem("discussionPostContent");

if (savedPostTitle !== null) {
  discussionPostTitle.value = savedPostTitle;
}

if (savedPostContent !== null) {
  discussionPostContent.value = savedPostContent;
}

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
    imageErrorText.textContent = "Please upload a post image.";
    return false;
  }

  imageErrorText.textContent = "";
  return true;
}

discussionPostTitle.addEventListener("input", function () {
  checkDiscussionTitle();
  localStorage.setItem("discussionPostTitle", discussionPostTitle.value);
});

discussionPostContent.addEventListener("input", function () {
  checkDiscussionContent();
  localStorage.setItem("discussionPostContent", discussionPostContent.value);
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

  localStorage.removeItem("discussionPostTitle");
  localStorage.removeItem("discussionPostContent");
});

const discussionFilterForm = document.getElementById("discussion-filter-form");
const discussionSearch = document.getElementById("search-discussion");
const discussionFilterBy = document.getElementById("filterby");
const discussionSortBy = document.getElementById("sortby");
const discussionPosts = document.querySelectorAll(".discussion-post");
const discussionList = document.querySelector(".discussion-list");
const noDiscussions = document.getElementById("no-discussions");

function filterDiscussions() {
  const searchText = discussionSearch.value.trim().toLowerCase();
  const filterType = discussionFilterBy.value;
  let matchingCount = 0;

  for (let i = 0; i < discussionPosts.length; i += 1) {
    let postText = "";

    if (filterType === "title") {
      postText = discussionPosts[i]
        .getAttribute("data-title-search")
        .toLowerCase();
    } else {
      postText = discussionPosts[i]
        .getAttribute("data-content-search")
        .toLowerCase();
    }

    if (postText.includes(searchText)) {
      discussionPosts[i].style.display = "";
      matchingCount += 1;
    } else {
      discussionPosts[i].style.display = "none";
    }
  }

  if (matchingCount === 0) {
    noDiscussions.hidden = false;
  } else {
    noDiscussions.hidden = true;
  }
}

function sortDiscussions() {
  const sortedPosts = [];

  for (let i = 0; i < discussionPosts.length; i += 1) {
    sortedPosts.push(discussionPosts[i]);
  }

  sortedPosts.sort(function (firstPost, secondPost) {
    let firstTime = Number(
      firstPost.getAttribute("data-latest-activity"),
    );
    let secondTime = Number(
      secondPost.getAttribute("data-latest-activity"),
    );

    if (discussionSortBy.value === "oldest") {
      firstTime = Number(firstPost.getAttribute("data-created-at"));
      secondTime = Number(secondPost.getAttribute("data-created-at"));
      return firstTime - secondTime;
    }

    return secondTime - firstTime;
  });

  for (let i = 0; i < sortedPosts.length; i += 1) {
    discussionList.appendChild(sortedPosts[i]);
  }
}

function updateDiscussionList() {
  filterDiscussions();
  sortDiscussions();
}

discussionFilterForm.addEventListener("submit", function (event) {
  event.preventDefault();
  updateDiscussionList();
});

updateDiscussionList();
