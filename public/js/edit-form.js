const editForm = document.getElementById("edit-form");
const editTitle = document.getElementById("edit-title");
const editContent = document.getElementById("edit-content");
const editTitleErrorText = document.getElementById("edit-title-error-text");
const editContentErrorText = document.getElementById(
  "edit-content-error-text"
);

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
