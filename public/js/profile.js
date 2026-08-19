/*
    Edit Profile controller: authenticated profile reads/updates, safe per-user
    text drafts, live validation, avatar preview, and accessible save/reset states.
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
    showFieldError,
    showServerFieldErrors
} from "./ui.js";

import {
    initialiseShell
} from "./shell.js";

const DRAFT_KEY_PREFIX =
    "rmitConnect.profileDraft";

const MAX_AVATAR_BYTES =
    1024 * 1024;

const ACCEPTED_AVATAR_TYPES = new Set([
    "image/jpeg",
    "image/png"
]);

const EMAIL_PATTERN =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const form = byId("profileForm");
const nameInput = byId("profileName");
const emailInput = byId("profileEmail");
const descriptionInput =
    byId("profileDescription");
const currentPasswordInput =
    byId("currentPassword");
const newPasswordInput =
    byId("profilePassword");
const confirmPasswordInput =
    byId("confirmPassword");
const avatarInput =
    byId("profilePicture");

const avatarPreview =
    byId("avatarPreview");
const previewName = byId("previewName");
const previewEmail = byId("previewEmail");
const profileStatus = byId("profileStatus");
const descriptionCount =
    byId("descriptionCount");
const formMessage = byId("profileMessage");
const draftStatus = byId("draftStatus");
const submitButton = byId("profileSubmit");
const resetButton = byId("profileReset");

const textInputs = [
    nameInput,
    emailInput,
    descriptionInput
];

const passwordInputs = [
    currentPasswordInput,
    newPasswordInput,
    confirmPasswordInput
];

/*
    The API response is the saved source of truth. Pending passwords and avatar
    data stay in memory only; localStorage is restricted to three text fields.
*/

let savedProfile = null;
let draftKey = "";
let selectedAvatarDataUrl = "";
let avatarErrorMessage = "";
let avatarReadToken = 0;
let avatarIsLoading = false;
let isSaving = false;

const touchedFields = new Set();

/*
    Drafts are deliberately restricted to non-sensitive text.
    Passwords and image data never enter browser storage.
*/
function removeDraft() {
    if (!draftKey) {
        return;
    }

    try {
        localStorage.removeItem(draftKey);
    } catch {
        // The page remains usable when storage is unavailable.
    }
}

function readDraft() {
    if (!draftKey) {
        return null;
    }

    try {
        const rawDraft =
            localStorage.getItem(draftKey);

        if (!rawDraft) {
            return null;
        }

        const parsedDraft =
            JSON.parse(rawDraft);

        const validDraft =
            parsedDraft !== null &&
            typeof parsedDraft === "object" &&
            !Array.isArray(parsedDraft) &&
            typeof parsedDraft.name === "string" &&
            typeof parsedDraft.email === "string" &&
            typeof parsedDraft.description === "string" &&
            parsedDraft.name.length <= 500 &&
            parsedDraft.email.length <= 500 &&
            parsedDraft.description.length <= 5000;

        if (!validDraft) {
            removeDraft();
            return null;
        }

        return {
            name: parsedDraft.name,
            email: parsedDraft.email,
            description:
                parsedDraft.description
        };
    } catch {
        removeDraft();
        return null;
    }
}

function textMatchesSavedProfile() {
    if (!savedProfile) {
        return false;
    }

    return (
        nameInput.value ===
            (savedProfile.name || "") &&
        emailInput.value ===
            (savedProfile.email || "") &&
        descriptionInput.value ===
            (savedProfile.description || "")
    );
}

function saveDraft() {
    if (!draftKey) {
        return;
    }

    if (textMatchesSavedProfile()) {
        removeDraft();
        draftStatus.textContent = "";
        draftStatus.hidden = true;
        return;
    }

    const draft = {
        name: nameInput.value,
        email: emailInput.value,
        description: descriptionInput.value
    };

    try {
        localStorage.setItem(
            draftKey,
            JSON.stringify(draft)
        );

        draftStatus.textContent =
            "Text draft saved in this browser. Passwords and pictures are not included.";
        draftStatus.hidden = false;
    } catch {
        draftStatus.textContent =
            "Draft saving is unavailable in this browser.";
        draftStatus.hidden = false;
    }
}

function passwordChangeRequested() {
    return passwordInputs.some(
        (input) => input.value !== ""
    );
}

/* Client rules mirror backend limits while keeping server validation authoritative. */

const validators = {
    name(value) {
        const cleanValue = value.trim();

        if (!cleanValue) {
            return "Enter your full name.";
        }

        if (
            cleanValue.length < 2 ||
            cleanValue.length > 80
        ) {
            return "Use between 2 and 80 characters.";
        }

        return "";
    },

    email(value) {
        const cleanValue = value.trim();

        if (!cleanValue) {
            return "Enter your email address.";
        }

        if (
            cleanValue.length > 120 ||
            !EMAIL_PATTERN.test(cleanValue)
        ) {
            return "Enter a complete email address.";
        }

        return "";
    },

    description(value) {
        if (value.length > 300) {
            return "Keep your description to 300 characters or fewer.";
        }

        return "";
    },

    currentPassword(value) {
        if (!passwordChangeRequested()) {
            return "";
        }

        if (!value) {
            return "Enter your current password before choosing a new one.";
        }

        if (value.length > 200) {
            return "The current password is too long.";
        }

        return "";
    },

    newPassword(value) {
        if (!passwordChangeRequested()) {
            return "";
        }

        if (!value) {
            return "Enter a new password.";
        }

        if (
            value.length < 8 ||
            value.length > 128
        ) {
            return "Use between 8 and 128 characters.";
        }

        if (
            !/[a-z]/.test(value) ||
            !/[A-Z]/.test(value) ||
            !/\d/.test(value)
        ) {
            return "Include an uppercase letter, a lowercase letter, and a number.";
        }

        return "";
    },

    confirmPassword(value) {
        if (!passwordChangeRequested()) {
            return "";
        }

        if (!value) {
            return "Confirm your new password.";
        }

        if (value !== newPasswordInput.value) {
            return "Enter the same new password again.";
        }

        return "";
    }
};

const fieldValidators = new Map([
    [nameInput, validators.name],
    [emailInput, validators.email],
    [descriptionInput, validators.description],
    [currentPasswordInput,
        validators.currentPassword],
    [newPasswordInput,
        validators.newPassword],
    [confirmPasswordInput,
        validators.confirmPassword]
]);

function validateField(input) {
    const validator =
        fieldValidators.get(input);

    if (!validator) {
        return true;
    }

    const message =
        validator(input.value);

    const error = form.querySelector(
        `[data-error-for="${input.name}"]`
    );

    if (message) {
        input.setAttribute(
            "aria-invalid",
            "true"
        );
    } else {
        input.removeAttribute(
            "aria-invalid"
        );
    }

    if (error) {
        error.textContent = message;
        error.hidden = !message;
    }

    return !message;
}

function validateAllFields() {
    const results = [];

    for (
        const input of
        fieldValidators.keys()
    ) {
        touchedFields.add(input.name);
        results.push(validateField(input));
    }

    if (avatarErrorMessage) {
        showFieldError(
            form,
            "avatar",
            avatarErrorMessage
        );
        results.push(false);
    }

    return results.every(Boolean);
}

/* Live summary and avatar rendering use textContent and style properties only. */

function updateDescriptionCount() {
    descriptionCount.textContent =
        `${descriptionInput.value.length} / 300 characters`;
}

function initialsFor(name) {
    const initials = name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    return initials || "RC";
}

function savedAvatarSource() {
    if (!savedProfile) {
        return "";
    }

    return (
        savedProfile.avatarDataUrl ||
        savedProfile.avatarUrl ||
        ""
    );
}

function updatePreview() {
    const cleanName = nameInput.value.trim();
    const cleanEmail = emailInput.value.trim();

    previewName.textContent =
        cleanName || "Your name";

    previewEmail.textContent =
        cleanEmail || "Your email";

    const avatarSource =
        selectedAvatarDataUrl ||
        savedAvatarSource();

    if (avatarSource) {
        avatarPreview.style.backgroundImage =
            `url(${JSON.stringify(avatarSource)})`;
        avatarPreview.textContent = "";
        avatarPreview.classList.add(
            "avatarPreview--image"
        );
    } else {
        avatarPreview.style.backgroundImage = "";
        avatarPreview.textContent =
            initialsFor(cleanName);
        avatarPreview.classList.remove(
            "avatarPreview--image"
        );
    }

    avatarPreview.setAttribute(
        "aria-label",
        cleanName
            ? `Profile picture preview for ${cleanName}`
            : "Profile picture preview"
    );

    updateDescriptionCount();
}

function updateProfileStatus(profile) {
    const status = String(
        profile.status || "active"
    ).toLowerCase();

    const role = String(
        profile.role || "student"
    ).toLowerCase();

    const statusLabel =
        status.charAt(0).toUpperCase() +
        status.slice(1);

    const roleLabel =
        role === "admin"
            ? "administrator"
            : "student";

    profileStatus.textContent =
        `${statusLabel} ${roleLabel} account`;
}

function updateHeaderIdentity(profile) {
    const identity =
        profile.name ||
        profile.username ||
        profile.email ||
        "current user";

    for (
        const label of
        document.querySelectorAll(
            "[data-current-user]"
        )
    ) {
        label.textContent =
            `Signed in as ${identity}`;
        label.hidden = false;
    }
}

function updateActionState() {
    if (isSaving) {
        return;
    }

    submitButton.disabled = avatarIsLoading;
    resetButton.disabled = avatarIsLoading;

    if (avatarIsLoading) {
        submitButton.setAttribute(
            "aria-busy",
            "true"
        );
        avatarInput.setAttribute(
            "aria-busy",
            "true"
        );
    } else {
        submitButton.removeAttribute(
            "aria-busy"
        );
        avatarInput.removeAttribute(
            "aria-busy"
        );
    }
}

function clearAvatarError() {
    avatarErrorMessage = "";

    const error = form.querySelector(
        '[data-error-for="avatar"]'
    );

    avatarInput.removeAttribute(
        "aria-invalid"
    );

    if (error) {
        error.textContent = "";
        error.hidden = true;
    }
}

function setAvatarError(message) {
    avatarErrorMessage = message;

    showFieldError(
        form,
        "avatar",
        message
    );
}

function populateForm(
    profile,
    { useDraft = true } = {}
) {
    const draft = useDraft
        ? readDraft()
        : null;

    const values = draft
        ? { ...profile, ...draft }
        : profile;

    nameInput.value = values.name || "";
    emailInput.value = values.email || "";
    descriptionInput.value =
        values.description || "";

    avatarReadToken += 1;
    avatarIsLoading = false;
    selectedAvatarDataUrl = "";
    avatarInput.value = "";

    currentPasswordInput.value = "";
    newPasswordInput.value = "";
    confirmPasswordInput.value = "";

    avatarErrorMessage = "";
    touchedFields.clear();
    clearFieldErrors(form);

    updatePreview();
    updateProfileStatus(profile);
    updateActionState();

    if (draft) {
        draftStatus.textContent =
            "Restored your unsaved text draft. Passwords and pictures were not stored.";
        draftStatus.hidden = false;
    } else {
        draftStatus.textContent = "";
        draftStatus.hidden = true;
    }
}

function clearPageMessage() {
    setMessage(formMessage);
}

/* Text/password events save safe drafts and revalidate fields after interaction. */

for (const input of textInputs) {
    input.addEventListener("blur", () => {
        touchedFields.add(input.name);
        validateField(input);
    });

    input.addEventListener("input", () => {
        if (
            touchedFields.has(input.name) ||
            input.getAttribute(
                "aria-invalid"
            ) === "true"
        ) {
            validateField(input);
        }

        saveDraft();
        updatePreview();
        clearPageMessage();
    });
}

for (const input of passwordInputs) {
    input.addEventListener("blur", () => {
        touchedFields.add(input.name);
        validateField(input);
    });

    input.addEventListener("input", () => {
        if (
            touchedFields.has(input.name) ||
            input.getAttribute(
                "aria-invalid"
            ) === "true"
        ) {
            validateField(input);
        }

        for (const relatedInput of passwordInputs) {
            if (
                relatedInput !== input &&
                (
                    touchedFields.has(
                        relatedInput.name
                    ) ||
                    relatedInput.getAttribute(
                        "aria-invalid"
                    ) === "true"
                )
            ) {
                validateField(relatedInput);
            }
        }

        if (!passwordChangeRequested()) {
            for (
                const relatedInput of
                passwordInputs
            ) {
                validateField(relatedInput);
            }
        }

        clearPageMessage();
    });
}

/* FileReader previews a validated image without storing it in localStorage. */

avatarInput.addEventListener(
    "change",
    () => {
        const token = ++avatarReadToken;
        const [file] = avatarInput.files;

        clearAvatarError();
        clearPageMessage();

        if (!file) {
            selectedAvatarDataUrl = "";
            updatePreview();
            return;
        }

        if (
            !ACCEPTED_AVATAR_TYPES.has(
                file.type
            )
        ) {
            avatarInput.value = "";
            selectedAvatarDataUrl = "";
            setAvatarError(
                "Choose a JPG or PNG image."
            );
            setMessage(
                formMessage,
                "The selected profile picture could not be used.",
                "error"
            );
            updatePreview();
            return;
        }

        if (file.size > MAX_AVATAR_BYTES) {
            avatarInput.value = "";
            selectedAvatarDataUrl = "";
            setAvatarError(
                "Choose an image smaller than 1 MB."
            );
            setMessage(
                formMessage,
                "The selected profile picture is too large.",
                "error"
            );
            updatePreview();
            return;
        }

        avatarIsLoading = true;
        updateActionState();
        setMessage(
            formMessage,
            "Reading your profile picture…",
            "info"
        );

        const reader = new FileReader();

        reader.addEventListener(
            "load",
            () => {
                if (token !== avatarReadToken) {
                    return;
                }

                const result =
                    typeof reader.result === "string"
                        ? reader.result
                        : "";

                if (
                    !result.startsWith(
                        `data:${file.type};base64,`
                    )
                ) {
                    avatarInput.value = "";
                    selectedAvatarDataUrl = "";
                    setAvatarError(
                        "The selected image could not be read."
                    );
                    setMessage(
                        formMessage,
                        "The selected profile picture could not be read.",
                        "error"
                    );
                    updatePreview();
                    return;
                }

                selectedAvatarDataUrl = result;
                updatePreview();
                setMessage(
                    formMessage,
                    "Profile picture ready. Save changes to keep it.",
                    "info"
                );
            }
        );

        reader.addEventListener(
            "error",
            () => {
                if (token !== avatarReadToken) {
                    return;
                }

                avatarInput.value = "";
                selectedAvatarDataUrl = "";
                setAvatarError(
                    "The selected image could not be read."
                );
                setMessage(
                    formMessage,
                    "The selected profile picture could not be read.",
                    "error"
                );
                updatePreview();
            }
        );

        reader.addEventListener(
            "loadend",
            () => {
                if (token !== avatarReadToken) {
                    return;
                }

                avatarIsLoading = false;
                updateActionState();
            }
        );

        reader.readAsDataURL(file);
    }
);

function serverFieldsForForm(fields = {}) {
    const visibleFields = {};

    for (
        const [fieldName, message] of
        Object.entries(fields)
    ) {
        if (fieldName === "form") {
            continue;
        }

        const visibleName =
            fieldName === "avatarDataUrl" ||
            fieldName === "avatarUrl"
                ? "avatar"
                : fieldName;

        visibleFields[visibleName] = message;
    }

    return visibleFields;
}

function firstMessage(value) {
    if (Array.isArray(value)) {
        return value[0] || "";
    }

    return typeof value === "string"
        ? value
        : "";
}

function redirectToLogin() {
    const destination =
        `editprofile.html${location.search}${location.hash}`;

    window.location.replace(
        `login.html?returnTo=${encodeURIComponent(destination)}`
    );
}

/* PATCH commits validated profile fields; confirmation values never reach the API. */

form.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        if (isSaving) {
            return;
        }

        if (avatarIsLoading) {
            setMessage(
                formMessage,
                "Wait for the profile picture to finish loading.",
                "info"
            );
            avatarInput.focus();
            return;
        }

        clearFieldErrors(form);
        clearPageMessage();

        const isValid = validateAllFields();

        if (!isValid) {
            setMessage(
                formMessage,
                "Please correct the highlighted fields.",
                "error"
            );

            form.querySelector(
                "[aria-invalid='true']"
            )?.focus();
            return;
        }

        const payload = {
            name: nameInput.value.trim(),
            email: emailInput.value.trim(),
            description:
                descriptionInput.value.trim()
        };

        if (passwordChangeRequested()) {
            payload.currentPassword =
                currentPasswordInput.value;
            payload.newPassword =
                newPasswordInput.value;
        }

        if (selectedAvatarDataUrl) {
            payload.avatarDataUrl =
                selectedAvatarDataUrl;
        }

        isSaving = true;
        setBusy(
            submitButton,
            true,
            "Saving…"
        );
        resetButton.disabled = true;
        avatarInput.disabled = true;

        try {
            const data = await apiRequest(
                "/api/profile",
                {
                    method: "PATCH",
                    body: JSON.stringify(payload)
                }
            );

            savedProfile =
                data.profile || {
                    ...savedProfile,
                    ...payload
                };

            removeDraft();
            populateForm(
                savedProfile,
                { useDraft: false }
            );
            updateHeaderIdentity(savedProfile);

            setMessage(
                formMessage,
                "✓ Changes saved.",
                "success"
            );
        } catch (error) {
            if (
                error instanceof ApiError &&
                error.status === 401
            ) {
                redirectToLogin();
                return;
            }

            if (error instanceof ApiError) {
                const visibleFields =
                    serverFieldsForForm(
                        error.fields
                    );

                showServerFieldErrors(
                    form,
                    visibleFields
                );

                if (visibleFields.avatar) {
                    avatarErrorMessage =
                        firstMessage(
                            visibleFields.avatar
                        );
                }
            }

            const formDetail =
                error instanceof ApiError
                    ? firstMessage(
                        error.fields?.form
                    )
                    : "";

            setMessage(
                formMessage,
                formDetail ||
                    error.message ||
                    "Your changes could not be saved.",
                "error"
            );

            form.querySelector(
                "[aria-invalid='true']"
            )?.focus();
        } finally {
            isSaving = false;
            setBusy(submitButton, false);
            resetButton.disabled = false;
            avatarInput.disabled = false;
            updateActionState();
        }
    }
);

/* Reset discards the local draft and restores the last server-saved snapshot. */

resetButton.addEventListener(
    "click",
    () => {
        if (!savedProfile || isSaving) {
            return;
        }

        avatarReadToken += 1;
        avatarIsLoading = false;
        removeDraft();

        populateForm(
            savedProfile,
            { useDraft: false }
        );

        setMessage(
            formMessage,
            "Unsaved changes were reset.",
            "info"
        );

        nameInput.focus();
    }
);

/* Authenticate first, then GET the current user's profile and scoped draft. */

async function initialisePage() {
    setMessage(
        formMessage,
        "Loading your profile…",
        "info"
    );

    const user = await initialiseShell({
        requireLogin: true
    });

    if (!user) {
        return;
    }

    const userIdentity =
        user.id ||
        user.username ||
        user.email;

    draftKey =
        `${DRAFT_KEY_PREFIX}.${encodeURIComponent(String(userIdentity))}`;

    try {
        const data = await apiRequest(
            "/api/profile"
        );

        const profile =
            data.profile || data;

        if (
            !profile ||
            typeof profile !== "object"
        ) {
            throw new Error(
                "The server returned an invalid profile."
            );
        }

        savedProfile = profile;
        populateForm(savedProfile);
        updateHeaderIdentity(savedProfile);

        form.hidden = false;
        clearPageMessage();
    } catch (error) {
        if (
            error instanceof ApiError &&
            error.status === 401
        ) {
            redirectToLogin();
            return;
        }

        form.hidden = true;
        setMessage(
            formMessage,
            error.message ||
                "Your profile could not be loaded.",
            "error"
        );
    }
}

initialisePage();
