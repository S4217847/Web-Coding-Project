const deactivateForm = document.getElementById("deactivate-form");
const deactivateConfirm = document.getElementById("deactivate-id-confirm");
const deactivateErrorText = document.getElementById("deactivate-error-text");

deactivateForm.noValidate = true;

function checkDeactivateConfirm() {
  if (deactivateConfirm.checked === false) {
    deactivateErrorText.textContent =
      "Please confirm that you understand this action.";

    return false;
  }

  deactivateErrorText.textContent = "";

  return true;
}

deactivateConfirm.addEventListener("change", checkDeactivateConfirm);

deactivateForm.addEventListener("submit", function (event) {
  const deactivateIsValid = checkDeactivateConfirm();

  if (deactivateIsValid === false) {
    event.preventDefault();
  }
});
