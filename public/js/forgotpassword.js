const forgotPasswordForm = document.getElementById("forgot-password-form");
const forgotPasswordEmail = document.getElementById("reset-email");
const emailErrorText = document.getElementById("email-error-text");

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

forgotPasswordEmail.addEventListener("input", checkForgotPasswordEmail);

forgotPasswordForm.addEventListener("submit", function (event) {
  const emailIsValid = checkForgotPasswordEmail();

  if (emailIsValid === false) {
    event.preventDefault();
  }
});
