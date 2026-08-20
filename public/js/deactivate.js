// Gets the form, checkbox, and error area from the page.
const deactivateForm = document.getElementById("deactivate-form");
const deactivateConfirm = document.getElementById("deactivate-id-confirm");
const deactivateErrorText = document.getElementById("deactivate-error-text");

// Uses the custom error message instead of the browser message.
deactivateForm.noValidate = true;

// Checks whether the student selected the confirmation checkbox.
function checkDeactivateConfirm() {
  if (deactivateConfirm.checked === false) {
    deactivateErrorText.textContent =
      "Please confirm that you understand this action.";

    return false;
  }

  deactivateErrorText.textContent = "";

  return true;
}

// Checks the checkbox again when its value changes.
deactivateConfirm.addEventListener("change", checkDeactivateConfirm);

// Stops the form only when the checkbox is not selected.
deactivateForm.addEventListener("submit", function (event) {
  const deactivateIsValid = checkDeactivateConfirm();

  if (deactivateIsValid === false) {
    event.preventDefault();
  }
});
