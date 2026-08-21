/*
    Shared HTTP boundary for every browser feature.
    Callers receive the API's data payload or one consistent ApiError;
    session cookies remain browser-managed and never enter page state.
*/

export class ApiError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = "ApiError";
        this.status = options.status || 0;
        this.code = options.code || "REQUEST_FAILED";
        this.fields = options.fields || {};
    }
}

export async function apiRequest(path, options = {}) {
    const requestOptions = {
        credentials: "same-origin",
        ...options,
        headers: {
            Accept: "application/json",
            ...(options.body
                ? { "Content-Type": "application/json" }
                : {}),
            ...(options.headers || {})
        }
    };

    let response;

    try {
        response = await fetch(path, requestOptions);
    } catch {
        throw new ApiError(
            "The server could not be reached. Check that it is running and try again.",
            { code: "NETWORK_ERROR" }
        );
    }

    const contentType =
        response.headers.get("content-type") || "";

    const payload = contentType.includes("application/json")
        ? await response.json().catch(() => ({}))
        : {};

    if (!response.ok) {
        const apiError = payload.error || {};

        throw new ApiError(
            apiError.message ||
                `Request failed (${response.status}).`,
            {
                status: response.status,
                code: apiError.code,
                fields: apiError.fields
            }
        );
    }

    return payload.data ?? payload;
}

/* Session lookup stays here so every authenticated page uses one contract. */

export function getSession() {
    return apiRequest("/api/session");
}
