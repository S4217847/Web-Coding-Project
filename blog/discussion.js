const discussionPostForm = document.getElementById("post-form");
const discussionPostTitle = document.getElementById("post-title");
const discussionPostContent = document.getElementById("post-content");
const titleErrorText = document.getElementById("title-error-text");
const contentErrorText = document.getElementById("content-error-text");
const savedDiscussionTitle = localStorage.getItem("discussionTitle");
const savedDiscussionContent = localStorage.getItem("discussionContent");
const discussionFilterForm = document.getElementById("discussion-filter-form");
const discussionSearch = document.getElementById("search-discussion");
const discussionSortBy = document.getElementById("sortby");
const discussionFilterBy = document.getElementById("filterby");
const discussionPost = document.querySelectorAll(".discussion-post");
const discussionList = document.querySelector(".discussion-list");

discussionPostForm.noValidate = true;

if (savedDiscussionTitle !== null) {
  discussionPostTitle.value = savedDiscussionTitle;
}

if (savedDiscussionContent !== null) {
  discussionPostContent.value = savedDiscussionContent;
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

  contentErrorText.textContent = "";
  return true;
}

discussionPostTitle.addEventListener("input", function () {
  checkDiscussionTitle();
  localStorage.setItem("discussionTitle", discussionPostTitle.value);
});

discussionPostContent.addEventListener("input", function () {
  checkDiscussionContent();
  localStorage.setItem("discussionContent", discussionPostContent.value);
});

discussionPostForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const discussionTitleIsValid = checkDiscussionTitle();
  const discussionContentIsValid = checkDiscussionContent();

  if (discussionTitleIsValid === true && discussionContentIsValid === true) {
    alert("The post is submitted.");
  }
});

discussionFilterForm.addEventListener("submit", function (event) {
  event.preventDefault();

  const searchText = discussionSearch.value.trim().toLowerCase();
  const filterType = discussionFilterBy.value;
  const sortType = discussionSortBy.value;

  for (let i = 0; i < discussionPost.length; i++) {
    let postText = "";

    if (filterType === "title") {
      postText = discussionPost[i]
        .querySelector("h2")
        .textContent.toLowerCase();
    } else {
      postText = discussionPost[i]
        .querySelector(".post-content")
        .textContent.toLowerCase();
    }

    if (postText.includes(searchText)) {
      discussionPost[i].style.display = "";
    } else {
      discussionPost[i].style.display = "none";
    }
  }

  if (sortType === "oldest") {
    for (let i = discussionPost.length - 1; i >= 0; i--) {
      discussionList.appendChild(discussionPost[i]);
    }
  } else {
    for (let i = 0; i < discussionPost.length; i++) {
      discussionList.appendChild(discussionPost[i]);
    }
  }
});
