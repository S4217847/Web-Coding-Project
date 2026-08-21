const editForm = document.getElementById("edit-form");
const editTitle = document.getElementById("edit-title");
const editImage = document.getElementById("edit-image");
const editContent = document.getElementById("edit-content");
const editTitleErrorText = document.getElementById("edit-title-error-text");
const editImageErrorText = document.getElementById("edit-image-error-text");
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

function checkEditImage() {
  if (editImage.value === "") {
    editImageErrorText.textContent = "Please select an image.";
    return false;
  }

  editImageErrorText.textContent = "";
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
editImage.addEventListener("change", checkEditImage);
editContent.addEventListener("input", checkEditContent);

editForm.addEventListener("submit", function (event) {
  const editTitleIsValid = checkEditTitle();
  const editImageIsValid = checkEditImage();
  const editContentIsValid = checkEditContent();

  if (
    editTitleIsValid === false ||
    editImageIsValid === false ||
    editContentIsValid === false
  ) {
    event.preventDefault();
  }
});
