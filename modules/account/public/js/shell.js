/*
    Shared authenticated-page shell: current-user labels, logout controls,
    safe return-to redirects, and administrator access checks.
*/

import {
    apiRequest,
    getSession
} from "./api.js";

import {
    setMessage
} from "./ui.js";

export async function initialiseShell(
    options = {}
) {
    const requireLogin =
        options.requireLogin || false;

    const requireAdmin =
        options.requireAdmin || false;

    let user = null;
    let sessionError = null;

    try {
        const session = await getSession();
        user = session.user || null;
    } catch (error) {
        sessionError = error;
    }

    for (
        const label of
        document.querySelectorAll("[data-current-user]")
    ) {
        if (user) {
            label.textContent =
                `Signed in as ${
                    user.name ||
                    user.username ||
                    user.email
                }`;

            label.hidden = false;
        } else {
            label.hidden = true;
        }
    }

    /* Every data-logout control performs the same server-side session delete. */

    for (
        const button of
        document.querySelectorAll("[data-logout]")
    ) {
        button.hidden = !user;

        button.addEventListener("click", async () => {
            button.disabled = true;

            try {
                await apiRequest("/api/session", {
                    method: "DELETE"
                });

                window.location.assign("login.html");
            } catch (error) {
                button.disabled = false;

                const statusRegion =
                    document.querySelector(
                        ".notice[role='status'], .notice[role='alert']"
                    );

                setMessage(
                    statusRegion,
                    error.message ||
                        "Sign out failed. Check the server and try again.",
                    "error"
                );

                statusRegion?.scrollIntoView({
                    block: "nearest"
                });
            }
        });
    }

    /*
        A network outage is different from an anonymous session. Keep protected
        pages in place and explain the outage instead of redirecting in a loop.
    */
    if (sessionError && requireLogin) {
        const statusRegion =
            document.querySelector(
                ".notice[role='status'], .notice[role='alert']"
            );

        setMessage(
            statusRegion,
            sessionError.message ||
                "The session could not be checked. Confirm that the server is running.",
            "error"
        );

        return null;
    }

    if (requireLogin && !user) {
        const currentPage =
            location.pathname.split("/").pop() ||
            "wishlist-add.html";

        const currentDestination =
            `${currentPage}${
                location.search
            }${
                location.hash
            }`;

        const returnTo =
            encodeURIComponent(
                currentDestination
            );

        window.location.replace(
            `login.html?returnTo=${returnTo}`
        );

        return null;
    }

    if (
        requireAdmin &&
        user &&
        String(user.role).toLowerCase() !== "admin"
    ) {
        return {
            ...user,
            lacksAdminAccess: true
        };
    }

    return user;
}
