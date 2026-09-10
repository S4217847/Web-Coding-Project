const editForm = document.getElementById("edit-form");
const editTitle = document.getElementById("edit-title");
const editContent = document.getElementById("edit-content");
const editTitleErrorText = document.getElementById("edit-title-error-text");
const editContentErrorText = document.getElementById(
  "edit-content-error-text"
);
const editProductSlug = document.getElementById("edit-product-slug");
const editProductSearch = document.getElementById("edit-product-search");
const editProductResults = document.querySelectorAll("#edit-product-results li");
const editProductResultMessage = document.getElementById(
  "edit-product-result-message",
);
const editSelectedProductText = document.getElementById(
  "edit-selected-product-text",
);
const chooseEditProductButton = document.getElementById("choose-edit-product");
const changeEditProductButton = document.getElementById("change-edit-product");
const clearEditProductButton = document.getElementById("clear-edit-product");
const cancelEditProductSearchButton = document.getElementById(
  "cancel-edit-product-search",
);
const editProductSearchPanel = document.getElementById(
  "edit-product-search-panel",
);
const maximumEditProductResults = 8;

editForm.noValidate = true;

function checkEditTitle() {
  const title = editTitle.value.trim();

  if (title === "") {
    editTitleErrorText.textContent = "Please enter a title.";
    return false;
  }

  if (title.length > 100) {
    editTitleErrorText.textContent =
      "The title must be 100 characters or less.";
    return false;
  }

  editTitleErrorText.textContent = "";
  return true;
}

function checkEditContent() {
  const content = editContent.value.trim();

  if (content === "") {
    editContentErrorText.textContent = "Please enter content.";
    return false;
  }

  if (content.length > 1000) {
    editContentErrorText.textContent =
      "The content must be 1000 characters or less.";
    return false;
  }

  editContentErrorText.textContent = "";
  return true;
}

editTitle.addEventListener("input", checkEditTitle);
editContent.addEventListener("input", checkEditContent);

if (editProductSearch) {
  let lastEditProductSearchButton = chooseEditProductButton;

  function closeEditProductSearch(moveFocus) {
    editProductSearchPanel.hidden = true;
    editProductSearch.value = "";
    chooseEditProductButton.setAttribute("aria-expanded", "false");
    changeEditProductButton.setAttribute("aria-expanded", "false");

    for (let i = 0; i < editProductResults.length; i += 1) {
      editProductResults[i].hidden = true;
    }

    editProductResultMessage.textContent =
      "Type at least 2 letters to find a course or activity.";

    if (moveFocus) lastEditProductSearchButton.focus();
  }

  function openEditProductSearch(button) {
    lastEditProductSearchButton = button;
    editProductSearchPanel.hidden = false;
    chooseEditProductButton.setAttribute("aria-expanded", "true");
    changeEditProductButton.setAttribute("aria-expanded", "true");
    editProductSearch.focus();
  }

  chooseEditProductButton.addEventListener("click", function () {
    openEditProductSearch(chooseEditProductButton);
  });

  changeEditProductButton.addEventListener("click", function () {
    openEditProductSearch(changeEditProductButton);
  });

  cancelEditProductSearchButton.addEventListener("click", function () {
    closeEditProductSearch(true);
  });

  editProductSearch.addEventListener("input", function () {
    const searchText = editProductSearch.value.trim().toLowerCase();

    if (searchText.length < 2) {
      for (let i = 0; i < editProductResults.length; i += 1) {
        editProductResults[i].hidden = true;
      }

      editProductResultMessage.textContent =
        "Type at least 2 letters to find a course or activity.";
      return;
    }

    let matchingCount = 0;

    for (let i = 0; i < editProductResults.length; i += 1) {
      const matches = editProductResults[i]
        .getAttribute("data-product-name")
        .includes(searchText);

      if (matches) matchingCount += 1;
      editProductResults[i].hidden =
        !matches || matchingCount > maximumEditProductResults;
    }

    if (matchingCount === 0) {
      editProductResultMessage.textContent =
        "No courses or activities match your search.";
    } else if (matchingCount > maximumEditProductResults) {
      const remainingCount = matchingCount - maximumEditProductResults;
      editProductResultMessage.textContent =
        remainingCount +
        " more " +
        (remainingCount === 1 ? "item matches" : "items match") +
        ". Narrow your search to see them.";
    } else {
      editProductResultMessage.textContent =
        matchingCount +
        (matchingCount === 1 ? " item found." : " items found.");
    }
  });

  for (let i = 0; i < editProductResults.length; i += 1) {
    const productButton = editProductResults[i].querySelector("button");

    productButton.addEventListener("click", function () {
      editProductSlug.value = productButton.getAttribute("data-product-slug");
      editSelectedProductText.textContent =
        "Your question is about: " +
        productButton.getAttribute("data-product-display-name");
      chooseEditProductButton.hidden = true;
      changeEditProductButton.hidden = false;
      clearEditProductButton.hidden = false;
      closeEditProductSearch(false);
      changeEditProductButton.focus();
    });
  }

  clearEditProductButton.addEventListener("click", function () {
    editProductSlug.value = "";
    editSelectedProductText.textContent =
      "No course or activity selected. You can still post.";
    chooseEditProductButton.hidden = false;
    changeEditProductButton.hidden = true;
    clearEditProductButton.hidden = true;
    closeEditProductSearch(false);
    chooseEditProductButton.focus();
  });
}

editForm.addEventListener("submit", function (event) {
  const editTitleIsValid = checkEditTitle();
  const editContentIsValid = checkEditContent();

  if (
    editTitleIsValid === false ||
    editContentIsValid === false
  ) {
    event.preventDefault();
  }
});
