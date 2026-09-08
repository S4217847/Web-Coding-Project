import {
    apiRequest,
    ApiError
} from "./api.js";

import {
    byId,
    clearFieldErrors,
    setBusy,
    setMessage,
    showServerFieldErrors
} from "./ui.js";

const form = byId("registerForm");
const message = byId("registerMessage");
const submitButton = byId("registerSubmit");
const inputs = [...form.elements].filter(
    (control) => control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement
);

function utf8ByteLength(value) {
    return new TextEncoder().encode(value).length;
}

function fieldMessage(input) {
    const value = input.value.trim();

    if (input.required && value === "") {
        return "This field is required.";
    }

    if (input.name === "username" && !/^(?=.{3,50}$)[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])$/.test(value)) {
        return "Use 3–50 letters, numbers, dots, underscores, or hyphens; begin and end with a letter or number.";
    }

    if (input.name === "studentId" && !/^s\d{7}$/i.test(value)) {
        return "Enter an RMIT student ID such as S4221230.";
    }

    if (input.name === "name" && (value.length < 2 || value.length > 80)) {
        return "Name must contain 2 to 80 characters.";
    }

    if (input.name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return "Enter a valid email address.";
    }

    if (input.name === "password") {
        if (input.value.length < 8 || utf8ByteLength(input.value) > 72) {
            return "Password must contain at least 8 characters and no more than 72 UTF-8 bytes.";
        }

        if (!/[a-z]/.test(input.value) || !/[A-Z]/.test(input.value) || !/\d/.test(input.value)) {
            return "Password must include uppercase and lowercase letters and a number.";
        }
    }

    if (input.name === "confirmPassword" && input.value !== byId("registerPassword").value) {
        return "Enter the same password again.";
    }

    return input.validationMessage;
}

function validateField(input) {
    const error = form.querySelector(`[data-error-for="${input.name}"]`);
    const problem = fieldMessage(input);

    if (problem) {
        input.setAttribute("aria-invalid", "true");
    } else {
        input.removeAttribute("aria-invalid");
    }

    if (error) {
        error.textContent = problem;
        error.hidden = !problem;
    }

    return !problem;
}

for (const input of inputs) {
    input.addEventListener("blur", () => validateField(input));
    input.addEventListener("input", () => {
        if (input.getAttribute("aria-invalid") === "true") {
            validateField(input);
        }

        if (input.name === "password") {
            const confirmation = byId("registerConfirmPassword");
            if (confirmation.value) validateField(confirmation);
        }
    });
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFieldErrors(form);

    if (!inputs.map(validateField).every(Boolean)) {
        setMessage(message, "Please correct the highlighted fields.", "error");
        form.querySelector("[aria-invalid='true']")?.focus();
        return;
    }

    const payload = Object.fromEntries(new FormData(form).entries());
    setBusy(submitButton, true, "Creating…");

    try {
        await apiRequest("/api/users", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        form.reset();
        setMessage(message, "Account created. You can now log in.", "success");
        window.setTimeout(() => window.location.assign("/login.html?registered=1"), 700);
    } catch (error) {
        if (error instanceof ApiError) {
            showServerFieldErrors(form, error.fields || {});
        }

        setMessage(message, error.message || "Your account could not be created.", "error");
        form.querySelector("[aria-invalid='true']")?.focus();
    } finally {
        setBusy(submitButton, false);
    }
});
