const forgotPasswordForm = document.getElementById("forgot-password-form");
const forgotPasswordEmail = document.getElementById("reset-email");
const emailErrorText = document.getElementById("email-error-text");
const recoveryPasswordInput = document.getElementById("recovery-password");
const recoveryPasswordErrorText = document.getElementById(
  "recovery-password-error-text"
);
const asciiSecretPattern = /^[\x21-\x7e]+$/;

forgotPasswordForm.noValidate = true;

function checkForgotPasswordEmail() {
  const email = forgotPasswordEmail.value.trim().toLowerCase();
  const emailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (email === "") {
    emailErrorText.textContent = "Please enter your email address.";

    return false;
  }

  if (email.length > 120 || !emailFormat.test(email)) {
    emailErrorText.textContent = "Please enter a valid email address.";

    return false;
  }

  emailErrorText.textContent = "";

  return true;
}

function checkRecoveryPassword() {
  const recoveryPassword = recoveryPasswordInput.value;

  if (recoveryPassword.length < 12 || recoveryPassword.length > 64) {
    recoveryPasswordErrorText.textContent =
      "Recovery password must contain 12 to 64 characters.";
    return false;
  }

  if (!asciiSecretPattern.test(recoveryPassword)) {
    recoveryPasswordErrorText.textContent =
      "Recovery password must use ASCII letters, numbers, or symbols without spaces.";
    return false;
  }

  if (
    !/[a-z]/.test(recoveryPassword) ||
    !/[A-Z]/.test(recoveryPassword) ||
    !/\d/.test(recoveryPassword)
  ) {
    recoveryPasswordErrorText.textContent =
      "Recovery password must include uppercase and lowercase letters and a number.";
    return false;
  }

  recoveryPasswordErrorText.textContent = "";
  return true;
}

forgotPasswordEmail.addEventListener("input", checkForgotPasswordEmail);
recoveryPasswordInput.addEventListener("input", checkRecoveryPassword);

forgotPasswordForm.addEventListener("submit", function (event) {
  const emailIsValid = checkForgotPasswordEmail();
  const recoveryPasswordIsValid = checkRecoveryPassword();

  if (emailIsValid === false || recoveryPasswordIsValid === false) {
    event.preventDefault();
  }
});
