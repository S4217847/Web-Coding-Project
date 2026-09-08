/* Read-only profile page backed by the authenticated MongoDB User record. */
import { apiRequest } from "./api.js";
import { initialiseShell } from "./shell.js";
import { byId, setMessage } from "./ui.js";

const view = byId("profileView");
const message = byId("profileViewMessage");
const avatar = byId("profileViewAvatar");
const name = byId("profileViewName");
const username = byId("profileViewUsername");
const email = byId("profileViewEmail");
const studentId = byId("profileViewStudentId");
const course = byId("profileViewCourse");
const role = byId("profileViewRole");
const status = byId("profileViewStatus");
const description = byId("profileViewDescription");

function label(value, fallback = "Not provided") {
    return typeof value === "string" && value.trim()
        ? value.trim()
        : fallback;
}

function renderProfile(profile) {
    avatar.src = profile.avatarUrl || "/images/user_icon.png";
    avatar.alt = `${label(profile.name, "User")} profile picture`;
    name.textContent = label(profile.name);
    username.textContent = `@${label(profile.username, "user")}`;
    email.textContent = label(profile.email);
    studentId.textContent = label(profile.studentId);
    course.textContent = label(profile.course);
    role.textContent = label(profile.role)
        .replace(/^./, (letter) => letter.toUpperCase());
    description.textContent = label(
        profile.description,
        "This student has not added a description yet."
    );

    const statusText = label(profile.status, "unknown");
    status.textContent = `${statusText
        .replace(/^./, (letter) => letter.toUpperCase())} account`;
    status.className =
        `statusBadge ${statusText === "active" ? "activeStatus" : "deactivatedStatus"}`;

    message.hidden = true;
    view.hidden = false;
}

avatar.addEventListener("error", () => {
    avatar.src = "/images/user_icon.png";
});

async function loadProfile() {
    const user = await initialiseShell({ requireLogin: true });
    if (!user) return;

    try {
        const data = await apiRequest("/api/profile");
        renderProfile(data.profile);
    } catch (error) {
        setMessage(
            message,
            error.message || "Your profile could not be loaded. Try again.",
            "error"
        );
    }
}

loadProfile().catch(() => {
    setMessage(message, "Your profile could not be loaded. Try again.", "error");
});
