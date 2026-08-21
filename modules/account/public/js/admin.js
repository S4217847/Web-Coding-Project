/*
    Administration controller: role-gated account reads, client-only filters,
    safe table rendering, and server-authoritative lock/unlock mutations.
*/

import {
    apiRequest
} from "./api.js";

import {
    byId,
    createElement,
    setMessage
} from "./ui.js";

import {
    initialiseShell
} from "./shell.js";

const FILTER_KEY =
    "rmitConnect.adminFilters";

const form =
    byId("accountFilter");

const searchInput =
    byId("accountSearch");

const statusSelect =
    byId("statusFilter");

const resetButton =
    byId("resetAccountFilters");

const content =
    byId("adminContent");

const table =
    byId("accountTable");

const tableBody =
    byId("accountTableBody");

const emptyState =
    byId("adminEmptyState");

const resultCount =
    byId("adminResultCount");

const pageMessage =
    byId("adminMessage");

const totalSummary =
    byId("summaryTotalUsers");

const activeSummary =
    byId("summaryActiveUsers");

const lockedSummary =
    byId("summaryLockedUsers");

let users = [];
let currentUser = null;

/*
    User records live only in memory. sessionStorage contains filter preferences,
    which are useful across navigation but never security-sensitive.
*/

function optionExists(select, value) {
    return [...select.options].some(
        (option) =>
            option.value === value
    );
}

function restoreFilters() {
    try {
        const storedValue =
            sessionStorage.getItem(
                FILTER_KEY
            );

        const filters =
            storedValue
                ? JSON.parse(storedValue)
                : {};

        searchInput.value =
            typeof filters.search === "string"
                ? filters.search.slice(0, 80)
                : "";

        statusSelect.value =
            optionExists(
                statusSelect,
                filters.status
            )
                ? filters.status
                : "all";
    } catch {
        try {
            sessionStorage.removeItem(
                FILTER_KEY
            );
        } catch {
            // Filtering still works without storage.
        }
    }
}

function saveFilters() {
    try {
        sessionStorage.setItem(
            FILTER_KEY,
            JSON.stringify({
                search:
                    searchInput.value,

                status:
                    statusSelect.value
            })
        );
    } catch {
        // Filtering still works without storage.
    }
}

/* Normalisation keeps the page tolerant of small API naming changes. */

function normaliseUser(user) {
    return {
        ...user,

        id:
            user.id ??
            user.userId ??
            user.username,

        username:
            user.username ??
            user.name ??
            "Unknown user",

        studentId:
            user.studentId ??
            user.studentID ??
            "—",

        email:
            user.email ??
            "",

        role:
            String(
                user.role ?? "member"
            ).toLowerCase(),

        status:
            String(
                user.status ?? "active"
            ).toLowerCase(),

        lastActive:
            user.lastActive ??
            user.lastActiveAt ??
            null
    };
}

function isCurrentUser(user) {
    return (
        String(user.id) ===
            String(currentUser?.id) ||

        (
            user.username &&
            user.username ===
                currentUser?.username
        ) ||

        (
            user.email &&
            user.email ===
                currentUser?.email
        )
    );
}

function formatRole(role) {
    return role === "admin"
        ? "Administrator"
        : "Member";
}

function formatDate(value) {
    if (!value) {
        return "Not recorded";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return new Intl.DateTimeFormat(
        "en-AU",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    ).format(date);
}

/* Account rows are rebuilt safely with textContent through createElement(). */

function makeCell(text) {
    return createElement(
        "td",
        { text }
    );
}

function makeRow(user) {
    const row = createElement(
        "tr",
        {
            attributes: {
                "data-testid":
                    `user-row-${user.id}`
            }
        }
    );

    const identityCell =
        createElement("td");

    identityCell.append(
        createElement(
            "strong",
            { text: user.username }
        )
    );

    if (user.email) {
        identityCell.append(
            createElement(
                "span",
                {
                    className:
                        "tableEmail",

                    text: user.email
                }
            )
        );
    }

    const statusCell =
        createElement("td");

    statusCell.append(
        createElement(
            "span",
            {
                className:
                    `statusBadge ${
                        user.status === "locked"
                            ? "lockedStatus"
                            : "activeStatus"
                    }`,

                text:
                    user.status === "locked"
                        ? "Locked"
                        : "Active"
            }
        )
    );

    const actionCell =
        createElement("td");

    if (isCurrentUser(user)) {
        actionCell.append(
            createElement(
                "span",
                {
                    className:
                        "currentUserLabel",

                    text: "Current user"
                }
            )
        );
    } else {
        const action =
            user.status === "locked"
                ? "Unlock"
                : "Lock";

        const button = createElement(
            "button",
            {
                className:
                    user.status === "locked"
                        ? "unlockButton"
                        : "lockButton",

                text: action,

                attributes: {
                    type: "button",

                    "aria-label":
                        `${action} ${user.username}'s account`,

                    "data-testid":
                        `${action.toLowerCase()}-user-${user.id}`
                }
            }
        );

        button.addEventListener(
            "click",
            () =>
                changeStatus(
                    user,
                    button
                )
        );

        actionCell.append(button);
    }

    row.append(
        identityCell,
        makeCell(user.studentId),
        makeCell(formatRole(user.role)),
        statusCell,
        makeCell(
            formatDate(user.lastActive)
        ),
        actionCell
    );

    return row;
}

function visibleUsers() {
    const search =
        searchInput.value
            .trim()
            .toLowerCase();

    const status =
        statusSelect.value;

    return users.filter(
        (user) => {
            const searchable =
                `${user.username} ${
                    user.name ?? ""
                } ${user.studentId} ${
                    user.email
                } ${user.role}`
                    .toLowerCase();

            return (
                searchable.includes(search) &&
                (
                    status === "all" ||
                    user.status === status
                )
            );
        }
    );
}

function renderUsers() {
    saveFilters();

    const visible =
        visibleUsers();

    tableBody.replaceChildren();
    table.hidden = visible.length === 0;
    emptyState.hidden = visible.length !== 0;

    if (visible.length > 0) {
        tableBody.append(
            ...visible.map(makeRow)
        );
    }

    resultCount.textContent =
        `${visible.length} of ${users.length} ${
            users.length === 1
                ? "account"
                : "accounts"
        } shown`;
}

function updateSummary(summary = {}) {
    const total =
        summary.total ??
        users.length;

    const active =
        summary.active ??
        users.filter(
            (user) =>
                user.status === "active"
        ).length;

    const locked =
        summary.locked ??
        users.filter(
            (user) =>
                user.status === "locked"
        ).length;

    totalSummary.textContent = total;
    activeSummary.textContent = active;
    lockedSummary.textContent = locked;
}

/* PATCH requests change status; the server enforces roles and self-lock rules. */

async function changeStatus(user, button) {
    const newStatus =
        user.status === "locked"
            ? "active"
            : "locked";

    const action =
        newStatus === "locked"
            ? "lock"
            : "unlock";

    const actionLabel =
        `${action[0].toUpperCase()}${
            action.slice(1)
        }`;

    if (
        !window.confirm(
            `${actionLabel} ${user.username}'s account?`
        )
    ) {
        setMessage(
            pageMessage,
            `No changes were made to ${user.username}.`,
            "info"
        );

        return;
    }

    const row =
        button.closest("tr");

    const originalText =
        button.textContent;

    button.disabled = true;
    button.textContent = "Updating…";
    button.setAttribute(
        "aria-busy",
        "true"
    );

    row?.setAttribute(
        "aria-busy",
        "true"
    );

    setMessage(
        pageMessage,
        `Updating ${user.username}…`,
        "info"
    );

    try {
        const data =
            await apiRequest(
                `/api/admin/users/${
                    encodeURIComponent(user.id)
                }/status`,
                {
                    method: "PATCH",

                    body:
                        JSON.stringify({
                            status: newStatus
                        })
                }
            );

        const updated =
            normaliseUser(
                data.user || {
                    ...user,
                    status: newStatus
                }
            );

        users = users.map(
            (candidate) =>
                String(candidate.id) ===
                    String(user.id)
                    ? updated
                    : candidate
        );

        updateSummary(data.summary);
        renderUsers();

        setMessage(
            pageMessage,
            `${user.username} is now ${newStatus}.`,
            "success"
        );
    } catch (error) {
        setMessage(
            pageMessage,

            error.message ||
                `The account could not be ${action}ed.`,

            "error"
        );
    } finally {
        if (row?.isConnected) {
            row.removeAttribute(
                "aria-busy"
            );
        }

        if (button.isConnected) {
            button.disabled = false;
            button.textContent =
                originalText;

            button.removeAttribute(
                "aria-busy"
            );
        }
    }
}

/* Filter events operate on the in-memory snapshot and make no extra API reads. */

form.addEventListener(
    "submit",
    (event) => {
        event.preventDefault();
        renderUsers();
    }
);

searchInput.addEventListener(
    "input",
    renderUsers
);

statusSelect.addEventListener(
    "change",
    renderUsers
);

resetButton.addEventListener(
    "click",
    () => {
        form.reset();

        try {
            sessionStorage.removeItem(
                FILTER_KEY
            );
        } catch {
            // Filtering still works without storage.
        }

        renderUsers();
        searchInput.focus();
    }
);

async function initialisePage() {
    currentUser =
        await initialiseShell({
            requireLogin: true,
            requireAdmin: true
        });

    if (!currentUser) {
        return;
    }

    if (currentUser.lacksAdminAccess) {
        content.hidden = true;

        setMessage(
            pageMessage,
            "Administrator access is required to view user accounts.",
            "error"
        );

        return;
    }

    restoreFilters();

    try {
        const data =
            await apiRequest(
                "/api/admin/users"
            );

        users =
            (data.users || [])
                .map(normaliseUser);

        updateSummary(data.summary);
        renderUsers();
    } catch (error) {
        content.hidden = true;

        setMessage(
            pageMessage,

            error.message ||
                "User accounts could not be loaded.",

            "error"
        );
    } finally {
        content.setAttribute(
            "aria-busy",
            "false"
        );
    }
}

initialisePage();
