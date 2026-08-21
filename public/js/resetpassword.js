const resetPasswordForm = document.getElementById("reset-password-form");
const newPasswordInput = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const newPasswordErrorText = document.getElementById(
  "new-password-error-text"
);
const confirmPasswordErrorText = document.getElementById(
  "confirm-password-error-text"
);

resetPasswordForm.noValidate = true;

function checkNewPassword() {
  const newPassword = newPasswordInput.value;

  if (newPassword.length < 8 || newPassword.length > 128) {
    newPasswordErrorText.textContent =
      "Password must contain 8 to 128 characters.";
    return false;
  }

  if (
    !/[a-z]/.test(newPassword) ||
    !/[A-Z]/.test(newPassword) ||
    !/\d/.test(newPassword)
  ) {
    newPasswordErrorText.textContent =
      "Password must include uppercase and lowercase letters and a number.";
    return false;
  }

  newPasswordErrorText.textContent = "";
  return true;
}

function checkConfirmPassword() {
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (confirmPassword === "") {
    confirmPasswordErrorText.textContent =
      "Please confirm your new password.";
    return false;
  }

  if (newPassword !== confirmPassword) {
    confirmPasswordErrorText.textContent = "Passwords do not match.";
    return false;
  }

  confirmPasswordErrorText.textContent = "";
  return true;
}

newPasswordInput.addEventListener("input", function () {
  checkNewPassword();
  checkConfirmPassword();
});

confirmPasswordInput.addEventListener("input", checkConfirmPassword);

resetPasswordForm.addEventListener("submit", function (event) {
  const newPasswordIsValid = checkNewPassword();
  const confirmPasswordIsValid = checkConfirmPassword();

  if (newPasswordIsValid === false || confirmPasswordIsValid === false) {
    event.preventDefault();
  }
});
