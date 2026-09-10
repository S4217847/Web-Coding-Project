const discussionPostForm = document.getElementById("post-form");
const discussionPostTitle = document.getElementById("post-title");
const discussionPostContent = document.getElementById("post-content");
const discussionPostImage = document.getElementById("post-image");
const discussionRelatedProduct = document.getElementById("product-slug");
const titleErrorText = document.getElementById("title-error-text");
const contentErrorText = document.getElementById("content-error-text");
const imageErrorText = document.getElementById("image-error-text");
const showPostFormButtons = document.querySelectorAll("[data-open-post-form]");
const browseProductSearch = document.getElementById("browse-product-search");
const browseProductResults = document.querySelectorAll(
  "#browse-product-results li",
);
const browseProductResultMessage = document.getElementById(
  "browse-product-result-message",
);
const postProductSearch = document.getElementById("post-product-search");
const postProductResults = document.querySelectorAll("#post-product-results li");
const postProductResultMessage = document.getElementById(
  "post-product-result-message",
);
const selectedProductText = document.getElementById("selected-product-text");
const choosePostProductButton = document.getElementById("choose-post-product");
const changePostProductButton = document.getElementById("change-post-product");
const clearPostProductButton = document.getElementById("clear-post-product");
const cancelPostProductSearchButton = document.getElementById(
  "cancel-post-product-search",
);
const postProductSearchPanel = document.getElementById(
  "post-product-search-panel",
);
const productDraftChoice = document.getElementById("product-draft-choice");
const keepDraftProductButton = document.getElementById("keep-draft-product");
const useContextProductButton = document.getElementById("use-context-product");
const maximumProductResults = 8;
discussionPostForm.noValidate = true;

// Keep each account's unfinished post separate in this browser.
const discussionUserId = discussionPostForm.getAttribute("data-user-id");
const discussionTitleKey = "discussionPostTitle:" + discussionUserId;
const discussionContentKey = "discussionPostContent:" + discussionUserId;
const discussionProductSlugKey = "discussionProductSlug:" + discussionUserId;

// Clear the draft only after the server has saved the discussion.
if (discussionPostForm.getAttribute("data-clear-draft") === "true") {
  localStorage.removeItem(discussionTitleKey);
  localStorage.removeItem(discussionContentKey);
  localStorage.removeItem(discussionProductSlugKey);
}

const savedPostTitle = localStorage.getItem(discussionTitleKey);
const savedPostContent = localStorage.getItem(discussionContentKey);
const savedProductSlug = localStorage.getItem(discussionProductSlugKey);
const savedDraftExists =
  savedPostTitle !== null ||
  savedPostContent !== null ||
  savedProductSlug !== null;

if (savedPostTitle !== null) {
  discussionPostTitle.value = savedPostTitle;
}

if (savedPostContent !== null) {
  discussionPostContent.value = savedPostContent;
}

function getProductButton(productSlug) {
  for (let i = 0; i < postProductResults.length; i += 1) {
    const button = postProductResults[i].querySelector("button");

    if (button.getAttribute("data-product-slug") === productSlug) {
      return button;
    }
  }

  return null;
}

function selectProduct(productSlug, productName, saveDraft) {
  discussionRelatedProduct.value = productSlug;

  if (productSlug === "") {
    selectedProductText.textContent =
      "No course or activity selected. You can still post.";
    choosePostProductButton.hidden = false;
    changePostProductButton.hidden = true;
    clearPostProductButton.hidden = true;
  } else {
    selectedProductText.textContent = "Your question is about: " + productName;
    choosePostProductButton.hidden = true;
    changePostProductButton.hidden = false;
    clearPostProductButton.hidden = false;
  }

  if (saveDraft) {
    localStorage.setItem(discussionProductSlugKey, productSlug);
  }
}

if (savedProductSlug !== null && savedProductSlug !== "") {
  const savedProductButton = getProductButton(savedProductSlug);

  if (savedProductButton) {
    selectProduct(
      savedProductSlug,
      savedProductButton.getAttribute("data-product-display-name"),
      false,
    );
  } else {
    selectProduct("", "", false);
    localStorage.removeItem(discussionProductSlugKey);
  }
} else {
  selectProduct("", "", false);
}

function updateProductSearch(searchInput, resultItems, resultMessage) {
  const searchText = searchInput.value.trim().toLowerCase();

  if (searchText.length < 2) {
    for (let i = 0; i < resultItems.length; i += 1) {
      resultItems[i].hidden = true;
    }

    resultMessage.textContent =
      "Type at least 2 letters to find a course or activity.";
    return;
  }

  let matchingCount = 0;

  for (let i = 0; i < resultItems.length; i += 1) {
    const productName = resultItems[i].getAttribute("data-product-name");
    const matches = productName.includes(searchText);

    if (matches) {
      matchingCount += 1;
    }

    resultItems[i].hidden = !matches || matchingCount > maximumProductResults;
  }

  if (matchingCount === 0) {
    resultMessage.textContent = "No courses or activities match your search.";
  } else if (matchingCount > maximumProductResults) {
    const remainingCount = matchingCount - maximumProductResults;
    resultMessage.textContent =
      remainingCount +
      " more " +
      (remainingCount === 1 ? "item matches" : "items match") +
      ". Narrow your search to see them.";
  } else {
    resultMessage.textContent =
      matchingCount + (matchingCount === 1 ? " item found." : " items found.");
  }
}

browseProductSearch.addEventListener("input", function () {
  updateProductSearch(
    browseProductSearch,
    browseProductResults,
    browseProductResultMessage,
  );
});

let lastProductSearchButton = choosePostProductButton;

function openPostProductSearch(button) {
  lastProductSearchButton = button;
  postProductSearchPanel.hidden = false;
  choosePostProductButton.setAttribute("aria-expanded", "true");
  changePostProductButton.setAttribute("aria-expanded", "true");
  postProductSearch.focus();
}

function closePostProductSearch(moveFocus) {
  postProductSearchPanel.hidden = true;
  postProductSearch.value = "";
  choosePostProductButton.setAttribute("aria-expanded", "false");
  changePostProductButton.setAttribute("aria-expanded", "false");
  updateProductSearch(
    postProductSearch,
    postProductResults,
    postProductResultMessage,
  );

  if (moveFocus) {
    lastProductSearchButton.focus();
  }
}

choosePostProductButton.addEventListener("click", function () {
  openPostProductSearch(choosePostProductButton);
});

changePostProductButton.addEventListener("click", function () {
  openPostProductSearch(changePostProductButton);
});

cancelPostProductSearchButton.addEventListener("click", function () {
  closePostProductSearch(true);
});

postProductSearch.addEventListener("input", function () {
  updateProductSearch(
    postProductSearch,
    postProductResults,
    postProductResultMessage,
  );
});

for (let i = 0; i < postProductResults.length; i += 1) {
  const productButton = postProductResults[i].querySelector("button");

  productButton.addEventListener("click", function () {
    selectProduct(
      productButton.getAttribute("data-product-slug"),
      productButton.getAttribute("data-product-display-name"),
      true,
    );
    closePostProductSearch(false);
    changePostProductButton.focus();
  });
}

clearPostProductButton.addEventListener("click", function () {
  selectProduct("", "", true);
  closePostProductSearch(false);
  choosePostProductButton.focus();
});

function showPostForm(contextProductSlug) {
  discussionPostForm.classList.remove("postbox-hidden");

  for (let i = 0; i < showPostFormButtons.length; i += 1) {
    showPostFormButtons[i].setAttribute("aria-expanded", "true");
  }

  if (!contextProductSlug) {
    productDraftChoice.hidden = true;
    discussionPostTitle.focus();
    return;
  }

  const contextProductButton = getProductButton(contextProductSlug);

  if (!contextProductButton) {
    discussionPostTitle.focus();
    return;
  }

  if (
    savedDraftExists &&
    discussionRelatedProduct.value !== contextProductSlug
  ) {
    productDraftChoice.hidden = false;
    useContextProductButton.textContent =
      "Use " + contextProductButton.getAttribute("data-product-display-name");
    useContextProductButton.setAttribute(
      "data-context-product-slug",
      contextProductSlug,
    );
    productDraftChoice.scrollIntoView({ block: "nearest" });
    return;
  }

  productDraftChoice.hidden = true;
  selectProduct(
    contextProductSlug,
    contextProductButton.getAttribute("data-product-display-name"),
    true,
  );
  discussionPostTitle.focus();
}

for (let i = 0; i < showPostFormButtons.length; i += 1) {
  showPostFormButtons[i].addEventListener("click", function () {
    const contextProductSlug =
      showPostFormButtons[i].getAttribute("data-context-product-slug") || "";
    showPostForm(contextProductSlug);
  });
}

keepDraftProductButton.addEventListener("click", function () {
  productDraftChoice.hidden = true;
  discussionPostTitle.focus();
});

useContextProductButton.addEventListener("click", function () {
  const contextProductSlug = useContextProductButton.getAttribute(
    "data-context-product-slug",
  );
  const contextProductButton = getProductButton(contextProductSlug);

  if (contextProductButton) {
    selectProduct(
      contextProductSlug,
      contextProductButton.getAttribute("data-product-display-name"),
      true,
    );
  }

  productDraftChoice.hidden = true;
  discussionPostTitle.focus();
});

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
  localStorage.setItem(discussionTitleKey, discussionPostTitle.value);
});

discussionPostContent.addEventListener("input", function () {
  checkDiscussionContent();
  localStorage.setItem(discussionContentKey, discussionPostContent.value);
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

const discussionFilterForm = document.getElementById("discussion-filter-form");

if (discussionFilterForm) {
  const discussionSearch = document.getElementById("search-discussion");
  const discussionFilterBy = document.getElementById("filterby");
  const discussionSortBy = document.getElementById("sortby");
  const discussionPosts = document.querySelectorAll(".discussion-post");
  const discussionPostList = document.getElementById("discussion-post-list");
  const noDiscussions = document.getElementById("no-discussions");

  function filterDiscussions() {
    const searchText = discussionSearch.value.trim().toLowerCase();
    const filterType = discussionFilterBy.value;
    let matchingCount = 0;

    for (let i = 0; i < discussionPosts.length; i += 1) {
      const searchAttribute =
        filterType === "title" ? "data-title-search" : "data-content-search";
      const postText = discussionPosts[i]
        .getAttribute(searchAttribute)
        .toLowerCase();
      const matches = postText.includes(searchText);

      discussionPosts[i].hidden = !matches;
      if (matches) matchingCount += 1;
    }

    noDiscussions.hidden = matchingCount !== 0;
  }

  function sortDiscussions() {
    const sortedPosts = [];

    for (let i = 0; i < discussionPosts.length; i += 1) {
      sortedPosts.push(discussionPosts[i]);
    }

    sortedPosts.sort(function (firstPost, secondPost) {
      let firstTime = Number(firstPost.getAttribute("data-latest-activity"));
      let secondTime = Number(secondPost.getAttribute("data-latest-activity"));

      if (discussionSortBy.value === "oldest") {
        firstTime = Number(firstPost.getAttribute("data-created-at"));
        secondTime = Number(secondPost.getAttribute("data-created-at"));
        return firstTime - secondTime;
      }

      return secondTime - firstTime;
    });

    for (let i = 0; i < sortedPosts.length; i += 1) {
      discussionPostList.appendChild(sortedPosts[i]);
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
}
