/**
 * Request-boundary validation and normalisation.
 *
 * Validators do not mutate application state. They return cleaned values plus
 * field-keyed errors so routes can reject the complete request before changing
 * data and clients can associate messages with the correct controls.
 */
const EMAIL_PATTERN =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USERNAME_PATTERN =
    /^[a-zA-Z0-9._-]{3,50}$/;

export function isPlainObject(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
}

export function cleanText(value) {
    return typeof value === "string"
        ? value.trim()
        : "";
}

export function validateLogin(body) {
    const identifier =
        cleanText(body?.identity);

    const password =
        typeof body?.password === "string"
            ? body.password
            : "";

    const details = {};

    if (!identifier) {
        details.identity =
            "Enter a username or email address.";
    } else if (identifier.length > 100) {
        details.identity =
            "The username or email is too long.";
    } else if (
        identifier.includes("@") &&
        !EMAIL_PATTERN.test(identifier)
    ) {
        details.identity =
            "Enter a complete email address.";
    } else if (
        !identifier.includes("@") &&
        !USERNAME_PATTERN.test(identifier)
    ) {
        details.identity =
            "Use 3–50 letters, numbers, dots, underscores, or hyphens.";
    }

    if (!password) {
        details.password =
            "Enter a password.";
    } else if (password.length > 200) {
        details.password =
            "The password is too long.";
    }

    return {
        identifier,
        password,
        details
    };
}

export function validateProfilePatch(body) {
    const values = {};
    const details = {};

    /*
        This allowlist is a security boundary, not just form validation. It keeps
        protected fields such as role, status, username, and student ID out of a
        mass-assignment update even if a caller constructs their own JSON body.
    */
    const allowedFields = new Set([
        "name",
        "email",
        "description",
        "avatarUrl",
        "avatarDataUrl",
        "currentPassword",
        "newPassword"
    ]);

    const suppliedFields =
        Object.keys(body ?? {});

    const unknownFields =
        suppliedFields.filter(
            (field) =>
                !allowedFields.has(field)
        );

    if (unknownFields.length > 0) {
        details.form =
            `Unsupported field(s): ${unknownFields.join(", ")}.`;
    }

    if (Object.hasOwn(body, "name")) {
        values.name =
            cleanText(body.name);

        if (
            values.name.length < 2 ||
            values.name.length > 80
        ) {
            details.name =
                "Name must contain 2 to 80 characters.";
        }
    }

    if (Object.hasOwn(body, "email")) {
        values.email =
            cleanText(body.email)
                .toLowerCase();

        if (
            !EMAIL_PATTERN.test(values.email) ||
            values.email.length > 120
        ) {
            details.email =
                "Enter a valid email address.";
        }
    }

    if (Object.hasOwn(body, "description")) {
        values.description =
            cleanText(body.description);

        if (values.description.length > 300) {
            details.description =
                "Description must not exceed 300 characters.";
        }
    }

    if (Object.hasOwn(body, "avatarUrl")) {
        values.avatarUrl =
            cleanText(body.avatarUrl);

        const allowedUrl =
            values.avatarUrl === "" ||
            values.avatarUrl.startsWith("/images/") ||
            /^https:\/\//i.test(values.avatarUrl);

        if (
            values.avatarUrl.length > 500 ||
            !allowedUrl
        ) {
            details.avatarUrl =
                "Use an HTTPS image URL, a local /images/ path, or leave this empty.";
        }
    }

    if (Object.hasOwn(body, "avatarDataUrl")) {
        values.avatarDataUrl =
            cleanText(body.avatarDataUrl);

        /*
            FileReader produces a data URL. We accept only small
            JPG and PNG data URLs—not arbitrary executable content.
        */
        const supportedImage =
            /^data:image\/(?:jpeg|png);base64,[a-z0-9+/=\r\n]+$/i
                .test(values.avatarDataUrl);

        if (
            !supportedImage ||
            values.avatarDataUrl.length > 1_400_000
        ) {
            details.avatarDataUrl =
                "Choose a JPG or PNG image smaller than 1 MB.";
        }
    }

    const hasCurrentPassword =
        Object.hasOwn(body, "currentPassword");

    const hasNewPassword =
        Object.hasOwn(body, "newPassword");

    if (hasCurrentPassword || hasNewPassword) {
        values.currentPassword =
            typeof body.currentPassword === "string"
                ? body.currentPassword
                : "";

        values.newPassword =
            typeof body.newPassword === "string"
                ? body.newPassword
                : "";

        if (!values.currentPassword) {
            details.currentPassword =
                "Enter the current password before choosing a new one.";
        } else if (
            values.currentPassword.length > 200
        ) {
            details.currentPassword =
                "The current password is too long.";
        }

        if (
            values.newPassword.length < 8 ||
            values.newPassword.length > 128
        ) {
            details.newPassword =
                "New password must contain 8 to 128 characters.";
        } else if (
            !/[a-z]/.test(values.newPassword) ||
            !/[A-Z]/.test(values.newPassword) ||
            !/\d/.test(values.newPassword)
        ) {
            details.newPassword =
                "New password must include uppercase and lowercase letters and a number.";
        }
    }

    if (suppliedFields.length === 0) {
        details.form =
            "Provide at least one profile field to update.";
    }

    return {
        values,
        details
    };
}

export function hasValidationErrors(details) {
    return Object.keys(details).length > 0;
}
