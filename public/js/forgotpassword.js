// Gets the form, email input, and error area from the page.
const forgotPasswordForm = document.getElementById("forgot-password-form");
const forgotPasswordEmail = document.getElementById("reset-email");
const emailErrorText = document.getElementById("email-error-text");

// Uses the custom error message instead of the browser message.
forgotPasswordForm.noValidate = true;

// Checks whether the email is an RMIT email address.
function checkForgotPasswordEmail() {
  const email = forgotPasswordEmail.value.trim().toLowerCase();
  const emailFormat = /^[^\s@]+@rmit\.edu\.vn$/;

  if (email === "") {
    emailErrorText.textContent = "Please enter your RMIT email address.";

    return false;
  }

  if (!emailFormat.test(email)) {
    emailErrorText.textContent = "Please enter a valid RMIT email address.";

    return false;
  }

  emailErrorText.textContent = "";

  return true;
}

// Checks the email while the student types.
forgotPasswordEmail.addEventListener("input", checkForgotPasswordEmail);

// Stops the form only when the email is not valid.
forgotPasswordForm.addEventListener("submit", function (event) {
  const emailIsValid = checkForgotPasswordEmail();

  if (emailIsValid === false) {
    event.preventDefault();
  }
});
