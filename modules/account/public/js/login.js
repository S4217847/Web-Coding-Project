/*
    Login page controller: client validation, optional remembered identity,
    session creation, and a same-origin post-login destination.
*/

import {
    ApiError,
    apiRequest
} from "./api.js";

import {
    byId,
    clearFieldErrors,
    setBusy,
    setMessage,
    showServerFieldErrors
} from "./ui.js";

import { initialiseShell } from "./shell.js";

const REMEMBERED_IDENTITY_KEY =
    "rmitConnect.rememberedIdentity";

const form = byId("loginForm");
const identityInput = byId("loginIdentity");
const passwordInput = byId("loginPassword");
const rememberInput = byId("rememberAccount");
const formMessage = byId("loginMessage");
const submitButton = byId("loginSubmit");

/* Redirect targets are allow-listed to prevent an open-redirect vulnerability. */

function safeReturnDestination(
    rawValue
) {
    const fallback =
        "wishlist-add.html";

    if (!rawValue) {
        return fallback;
    }

    const allowedPages = new Set([
        "wishlist-add.html",
        "wishlist.html",
        "editprofile.html",
        "admin.html",
        "discussions"
    ]);

    try {
        const url =
            new URL(
                rawValue,
                location.href
            );

        const page =
            url.pathname
                .split("/")
                .pop();

        if (
            url.origin !==
                location.origin ||
            !allowedPages.has(page)
        ) {
            return fallback;
        }

        return `${
            page
        }${
            url.search
        }${
            url.hash
        }`;
    } catch {
        return fallback;
    }
}

/* Remember-me stores only the account identifier; authentication stays server-side. */

function readRememberedIdentity() {
    try {
        return localStorage.getItem(
            REMEMBERED_IDENTITY_KEY
        );
    } catch {
        return null;
    }
}

function updateRememberedIdentity(identity) {
    try {
        if (identity) {
            localStorage.setItem(
                REMEMBERED_IDENTITY_KEY,
                identity
            );
        } else {
            localStorage.removeItem(
                REMEMBERED_IDENTITY_KEY
            );
        }
    } catch {
        // Login still works when storage is unavailable.
    }
}

/* Client validation provides immediate feedback; the server validates again. */

function validateIdentity() {
    const identity = identityInput.value.trim();

    if (!identity) {
        return "Enter your username or RMIT email address.";
    }

    if (identity.length > 100) {
        return "The username or email is too long.";
    }

    if (identity.includes("@")) {
        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        return emailPattern.test(identity)
            ? ""
            : "Enter a complete email address.";
    }

    const usernamePattern =
        /^[a-zA-Z0-9._-]{3,50}$/;

    return usernamePattern.test(identity)
        ? ""
        : "Use 3–50 letters, numbers, dots, underscores, or hyphens.";
}

function validatePassword() {
    if (!passwordInput.value) {
        return "Enter your password.";
    }

    if (passwordInput.value.length > 200) {
        return "The password is too long.";
    }

    return "";
}

function validateField(input, validator) {
    const message = validator();

    const error = form.querySelector(
        `[data-error-for="${input.name}"]`
    );

    if (message) {
        input.setAttribute("aria-invalid", "true");
    } else {
        input.removeAttribute("aria-invalid");
    }

    error.textContent = message;
    error.hidden = !message;

    return !message;
}

identityInput.addEventListener("blur", () => {
    validateField(identityInput, validateIdentity);
});

passwordInput.addEventListener("blur", () => {
    validateField(passwordInput, validatePassword);
});

/* Revalidate invalid fields as the user corrects them. */

for (const input of [identityInput, passwordInput]) {
    input.addEventListener("input", () => {
        if (
            input.getAttribute("aria-invalid") === "true"
        ) {
            const validator =
                input === identityInput
                    ? validateIdentity
                    : validatePassword;

            validateField(input, validator);
        }

        setMessage(formMessage);
    });
}

/* POST creates the authenticated session; passwords are never persisted here. */

form.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        clearFieldErrors(form);
        setMessage(formMessage);

        const identityValid = validateField(
            identityInput,
            validateIdentity
        );

        const passwordValid = validateField(
            passwordInput,
            validatePassword
        );

        if (!identityValid || !passwordValid) {
            setMessage(
                formMessage,
                "Please correct the highlighted fields.",
                "error"
            );

            form
                .querySelector("[aria-invalid='true']")
                ?.focus();

            return;
        }

        setBusy(
            submitButton,
            true,
            "Logging in…"
        );

        try {
            await apiRequest("/api/session", {
                method: "POST",
                body: JSON.stringify({
                    identity:
                        identityInput.value.trim(),
                    password:
                        passwordInput.value
                })
            });

            updateRememberedIdentity(
                rememberInput.checked
                    ? identityInput.value.trim()
                    : ""
            );

            passwordInput.value = "";

            setMessage(
                formMessage,
                "Login successful. Opening RMIT Connect…",
                "success"
            );

            const requestedDestination =
                new URLSearchParams(
                    location.search
                ).get("returnTo");

            const destination =
                safeReturnDestination(
                    requestedDestination
                );

            window.location.assign(
                destination
            );
        } catch (error) {
            if (error instanceof ApiError) {
                showServerFieldErrors(
                    form,
                    error.fields
                );

                const message =
                    error.status === 423
                        ? "This account is locked. Please contact an administrator."
                        : error.message;

                setMessage(
                    formMessage,
                    message,
                    "error"
                );
            } else {
                setMessage(
                    formMessage,
                    "An unexpected error occurred. Please try again.",
                    "error"
                );
            }

            passwordInput.value = "";

            const firstInvalid =
                form.querySelector(
                    "[aria-invalid='true']"
                );

            (firstInvalid || passwordInput).focus();
        } finally {
            setBusy(submitButton, false);
        }
    }
);

/* Restore only the non-sensitive identity preference, then initialise the shell. */

const rememberedIdentity =
    readRememberedIdentity();

if (rememberedIdentity) {
    identityInput.value = rememberedIdentity;
    rememberInput.checked = true;
    passwordInput.focus();
}

initialiseShell()
    .then((user) => {
        if (user) {
            setMessage(
                formMessage,
                `You are already signed in as ${
                    user.name || user.username
                }.`,
                "info"
            );
        }
    })
    .catch(() => {});
