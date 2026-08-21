const BLOG_API = "/api/blogs";
const DEFAULT_BLOG_IMAGE = "/images/image-for-blog.png";
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const BLOG_CATEGORIES = ["Academic", "Events", "Student Life", "Technology", "Other"];
const SEARCH_FIELDS = ["all", "name", "id", "title", "content", "category", "tags"];

let blogs = [];
let currentUser = null;
let editingId = null;
let detailComments = [];

document.addEventListener("DOMContentLoaded", initialiseBlogPage);

async function initialiseBlogPage() {
  try {
    currentUser = await requestJson("/api/current-user");
  } catch {
    currentUser = null;
  }

  updateSessionLink();

  if (document.querySelector("#blog-list")) await setupBlogList();
  if (document.querySelector("#blog-detail")) await setupBlogDetails();
}

function updateSessionLink() {
  const link = document.querySelector(".globalSessionLink");
  if (!link) return;
  link.href = currentUser ? "/logout" : "/login.html";
  link.textContent = currentUser ? "Log out" : "Log in";
}

// Set up the searchable Blog list and create/edit form.
async function setupBlogList() {
  const form = document.querySelector("#create-blog-form");
  const searchForm = document.querySelector("#blog-search-form");
  const searchInput = document.querySelector("#blog-search");
  const searchField = document.querySelector("#search-category");
  const sortInput = document.querySelector("#blog-sort");

  restoreSearchFromUrl(searchInput, searchField);
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updateSearchUrl(searchInput.value, searchField.value);
    filterAndSort();
  });
  searchInput.addEventListener("input", filterAndSort);
  searchField.addEventListener("change", filterAndSort);
  sortInput.addEventListener("change", filterAndSort);

  if (!currentUser) {
    form.hidden = true;
    const prompt = document.createElement("p");
    prompt.className = "login-prompt";
    prompt.append("Want to publish a blog? ");
    const loginLink = textElement("a", "", "Log in");
    loginLink.href = "/login.html";
    prompt.append(loginLink, ".");
    form.before(prompt);
  } else {
    form.addEventListener("submit", saveBlog);
    form.addEventListener("input", validateAndSaveDraft);
    form.addEventListener("change", validateAndSaveDraft);
    document.querySelector("#cancel-edit").addEventListener("click", cancelEdit);
    restoreDraft(form);
  }

  try {
    blogs = await requestJson(BLOG_API);
    filterAndSort();

    const editId = new URLSearchParams(location.search).get("edit");
    if (editId) {
      startEdit(editId);
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete("edit");
      history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}`);
    }
  } catch (error) {
    setStatus(document.querySelector("#blog-list-status"), error.message, "error");
  }

  function validateAndSaveDraft() {
    saveDraft(form);
    showBlogErrors(validateBlogForm(form));
  }
}

function restoreSearchFromUrl(searchInput, searchField) {
  const params = new URLSearchParams(location.search);
  searchInput.value = params.get("q") || "";
  const field = params.get("field") || "all";
  searchField.value = SEARCH_FIELDS.includes(field) ? field : "all";
}

function updateSearchUrl(keyword, field) {
  const url = new URL(location.href);
  const query = keyword.trim();

  if (query) url.searchParams.set("q", query);
  else url.searchParams.delete("q");

  if (field && field !== "all") url.searchParams.set("field", field);
  else url.searchParams.delete("field");

  history.replaceState({}, "", `${url.pathname}${url.search}`);
}

function filterAndSort() {
  const searchInput = document.querySelector("#blog-search");
  const searchField = document.querySelector("#search-category");
  const sortInput = document.querySelector("#blog-sort");
  if (!searchInput || !searchField || !sortInput) return;

  const keyword = searchInput.value.trim().toLowerCase();
  const field = SEARCH_FIELDS.includes(searchField.value) ? searchField.value : "all";
  const sort = sortInput.value;

  const filtered = blogs.filter((blog) => {
    const tags = Array.isArray(blog.tags) ? blog.tags.join(" ") : "";
    const values = {
      title: String(blog.title || ""),
      name: String(blog.authorName || ""),
      id: String(blog.authorSid || ""),
      content: String(blog.content || ""),
      category: String(blog.category || ""),
      tags,
      all: `${blog.title || ""} ${blog.authorName || ""} ${blog.authorSid || ""} ${blog.content || ""} ${blog.category || ""} ${tags}`,
    };
    return values[field].toLowerCase().includes(keyword);
  });

  filtered.sort((a, b) => {
    if (sort === "oldest") return new Date(a.dateAdded) - new Date(b.dateAdded);
    if (sort === "title-az") return String(a.title).localeCompare(String(b.title));
    if (sort === "title-za") return String(b.title).localeCompare(String(a.title));
    return new Date(b.dateAdded) - new Date(a.dateAdded);
  });

  displayBlogs(filtered);
}

// Build cards with DOM methods so stored user text is never interpreted as HTML.
function displayBlogs(items) {
  const list = document.querySelector("#blog-list");
  const status = document.querySelector("#blog-list-status");
  list.replaceChildren();
  setStatus(status, items.length ? `${items.length} blog${items.length === 1 ? "" : "s"} found.` : "No blogs found.");

  items.forEach((blog) => {
    const article = document.createElement("article");
    article.className = "article";

    const image = document.createElement("img");
    image.className = "article-image";
    image.src = safeImageSource(blog.image);
    image.alt = `Image for ${String(blog.title || "blog post")}`;
    image.addEventListener("error", () => {
      image.src = DEFAULT_BLOG_IMAGE;
    }, { once: true });

    const preview = document.createElement("div");
    preview.className = "article-preview";

    const heading = document.createElement("h3");
    const titleLink = document.createElement("a");
    titleLink.href = `/blogs/${encodeURIComponent(blog.id)}`;
    titleLink.textContent = blog.title;
    heading.append(titleLink);

    const author = textElement("span", "articleinfo-student", `${blog.authorName} – ${blog.authorSid}`);
    const date = textElement("time", "articleinfo-calendar", formatDate(blog.dateAdded));
    date.dateTime = String(blog.dateAdded || "");

    const category = document.createElement("p");
    const categoryText = textElement("strong", "", blog.category);
    category.append(categoryText);

    const tags = document.createElement("div");
    tags.className = "tags";
    (Array.isArray(blog.tags) ? blog.tags : []).forEach((tag) => {
      tags.append(textElement("span", "tag", `#${tag}`));
    });

    const content = textElement("p", "preview-text", shorten(String(blog.content || "")));
    const readMore = textElement("a", "btn read-more", "Read more");
    readMore.href = `/blogs/${encodeURIComponent(blog.id)}`;

    preview.append(heading, author, date, category, tags, content, readMore);
    article.append(image, preview);
    list.append(article);
  });
}

// Create or update a Blog after client-side validation succeeds.
async function saveBlog(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.pending === "true") return;

  const errors = validateBlogForm(form);
  showBlogErrors(errors);
  if (Object.keys(errors).length) {
    setFormStatus("Please correct the highlighted fields.", "error");
    focusFirstInvalidField(errors);
    return;
  }

  const wasEditing = Boolean(editingId);
  const blogId = editingId;
  const oldBlog = blogs.find((blog) => blog.id === blogId);
  const file = form.elements.image.files[0];

  setFormPending(form, true, wasEditing ? "Updating..." : "Publishing...");
  setFormStatus(wasEditing ? "Updating blog..." : "Publishing blog...");

  try {
    const data = {
      title: form.elements.title.value.trim(),
      category: form.elements.category.value,
      tags: parseTags(form.elements.tags.value),
      content: form.elements.content.value.trim(),
      image: file ? await readImage(file) : oldBlog?.image || "",
    };

    const saved = await requestJson(blogId ? `${BLOG_API}/${encodeURIComponent(blogId)}` : BLOG_API, {
      method: blogId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (blogId) blogs = blogs.map((blog) => (blog.id === blogId ? saved : blog));
    else blogs.unshift(saved);

    clearCurrentDraft();
    setFormPending(form, false);
    editingId = null;
    resetBlogForm(form);
    filterAndSort();
    setFormStatus(wasEditing ? "Blog updated successfully." : "Blog published successfully.", "success");
  } catch (error) {
    showBlogErrors(error.data?.errors || {});
    setFormStatus(error.message, "error");
  } finally {
    setFormPending(form, false);
  }
}

function startEdit(id) {
  const blog = blogs.find((item) => item.id === id);
  const form = document.querySelector("#create-blog-form");

  if (!blog) {
    setFormStatus("The blog selected for editing was not found.", "error");
    return;
  }
  if (!currentUser || blog.authorId !== currentUser.id) {
    setFormStatus("You can edit only your own blogs.", "error");
    return;
  }

  editingId = id;
  form.elements.title.value = blog.title;
  form.elements.category.value = blog.category;
  form.elements.tags.value = Array.isArray(blog.tags) ? blog.tags.join(", ") : "";
  form.elements.content.value = blog.content;
  restoreDraft(form);
  showBlogErrors(validateBlogForm(form));
  form.querySelector(".articlebtn").textContent = "Update";
  document.querySelector("#cancel-edit").hidden = false;
  setFormStatus("Editing this blog. Its existing image will be kept unless you choose a new one.");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelEdit() {
  clearCurrentDraft();
  editingId = null;
  resetBlogForm(document.querySelector("#create-blog-form"));
  setFormStatus("Edit cancelled.");
}

async function deleteBlog(id) {
  if (!window.confirm("Delete this blog? This cannot be undone during this session.")) return;

  const actions = document.querySelector("#detail-actions");
  if (actions?.dataset.pending === "true") return;
  setActionPending(actions, true);
  setStatus(document.querySelector("#blog-detail-status"), "Deleting blog...");

  try {
    await requestJson(`${BLOG_API}/${encodeURIComponent(id)}`, { method: "DELETE" });
    location.assign("/blogs");
  } catch (error) {
    setStatus(document.querySelector("#blog-detail-status"), error.message, "error");
    setActionPending(actions, false);
  }
}

// Load a single Blog and enable comments for signed-in users.
async function setupBlogDetails() {
  const id = location.pathname.split("/").filter(Boolean).pop();
  const form = document.querySelector("#comment-form");
  const commentInput = form.elements.comment;

  form.action = `${BLOG_API}/${encodeURIComponent(id)}/comments`;
  if (!currentUser) {
    commentInput.disabled = true;
    form.querySelector('button[type="submit"]').disabled = true;
    setStatus(document.querySelector("#comment-status"), "Log in to post a comment.");
  } else {
    form.addEventListener("submit", (event) => addComment(event, id));
    commentInput.addEventListener("input", () => {
      showCommentError(validateComment(commentInput.value));
      setStatus(document.querySelector("#comment-status"), "");
    });
  }

  try {
    const blog = await requestJson(`${BLOG_API}/${encodeURIComponent(id)}`);
    document.title = `${blog.title} | RMIT Connect`;
    document.querySelector("#blog-post-title").textContent = blog.title;
    document.querySelector("#blog-author").textContent = `${blog.authorName} – ${blog.authorSid}`;

    const date = document.querySelector("#blog-date");
    date.textContent = formatDate(blog.dateAdded);
    date.dateTime = String(blog.dateAdded || "");

    document.querySelector("#blog-detail-category").textContent = blog.category;
    document.querySelector("#blog-detail-content").textContent = blog.content;

    const image = document.querySelector("#blog-detail-image");
    image.src = safeImageSource(blog.image);
    image.alt = `Image for ${String(blog.title || "blog post")}`;
    image.addEventListener("error", () => {
      image.src = DEFAULT_BLOG_IMAGE;
    }, { once: true });

    const tags = document.querySelector("#blog-detail-tags");
    tags.replaceChildren();
    (Array.isArray(blog.tags) ? blog.tags : []).forEach((tag) => {
      tags.append(textElement("span", "tag", `#${tag}`));
    });

    setStatus(document.querySelector("#blog-detail-status"), "");
    document.querySelector("#blog-detail").hidden = false;

    if (currentUser && blog.authorId === currentUser.id) {
      const actions = document.querySelector("#detail-actions");
      actions.hidden = false;
      document.querySelector("#detail-edit").addEventListener("click", () => {
        location.assign(`/blogs?edit=${encodeURIComponent(blog.id)}`);
      });
      document.querySelector("#detail-delete").addEventListener("click", () => deleteBlog(blog.id));
    }

    detailComments = Array.isArray(blog.comments) ? blog.comments : [];
    displayComments(detailComments);
  } catch (error) {
    setStatus(document.querySelector("#blog-detail-status"), error.message, "error");
    form.hidden = true;
  }
}

async function addComment(event, blogId) {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.pending === "true") return;

  const content = form.elements.comment.value.trim();
  const validationError = validateComment(content);
  showCommentError(validationError);
  if (validationError) {
    setStatus(document.querySelector("#comment-status"), "Please correct the comment.", "error");
    form.elements.comment.focus();
    return;
  }

  setFormPending(form, true, "Posting...");
  setStatus(document.querySelector("#comment-status"), "Posting comment...");

  try {
    const comment = await requestJson(`${BLOG_API}/${encodeURIComponent(blogId)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    detailComments.push(comment);
    displayComments(detailComments);
    form.reset();
    showCommentError("");
    setStatus(document.querySelector("#comment-status"), "Comment posted successfully.", "success");
  } catch (error) {
    showCommentError(error.data?.errors?.content || "");
    setStatus(document.querySelector("#comment-status"), error.message, "error");
  } finally {
    setFormPending(form, false);
  }
}

function displayComments(comments) {
  const list = document.querySelector("#comment-list");
  list.replaceChildren();

  if (!comments.length) {
    list.append(textElement("p", "empty-comments", "No comments yet. Be the first to respond."));
    return;
  }

  comments.forEach((comment) => {
    const article = document.createElement("article");
    article.className = "comment";

    const header = document.createElement("div");
    header.className = "comment-header";
    header.append(textElement("strong", "", `${comment.authorName} – ${comment.authorSid}`));

    const date = textElement("time", "", formatDate(comment.dateAdded));
    date.dateTime = String(comment.dateAdded || "");
    header.append(date);

    article.append(header, textElement("p", "", comment.content));
    list.append(article);
  });
}

// Apply the same validation rules used by the server.
function validateBlogForm(form) {
  const title = form.elements.title.value.trim();
  const category = form.elements.category.value;
  const tags = parseTags(form.elements.tags.value);
  const content = form.elements.content.value.trim();
  const image = form.elements.image.files[0];
  const errors = {};

  if (title.length < 5 || title.length > 120) {
    errors.title = "Title must contain between 5 and 120 characters.";
  }
  if (!BLOG_CATEGORIES.includes(category)) errors.category = "Choose a valid category.";
  if (tags.length < 1 || tags.length > 5 || tags.some((tag) => tag.length > 30)) {
    errors.tags = "Enter 1–5 tags; each tag can have up to 30 characters.";
  }
  if (content.length < 20 || content.length > 5000) {
    errors.content = "Content must contain between 20 and 5000 characters.";
  }
  if (image && (!IMAGE_TYPES.includes(image.type) || image.size > MAX_IMAGE_SIZE)) {
    errors.image = "Use PNG, JPEG, GIF, or WebP up to 4 MB.";
  }
  return errors;
}

function validateComment(value) {
  const length = value.trim().length;
  return length < 2 || length > 500
    ? "Comment must contain between 2 and 500 characters."
    : "";
}

function showBlogErrors(errors) {
  const fieldIds = {
    title: "blog-title",
    category: "blog-category",
    tags: "blog-tags",
    content: "blog-content",
    image: "imageUpload",
  };

  Object.entries(fieldIds).forEach(([name, fieldId]) => {
    const field = document.querySelector(`#${fieldId}`);
    const error = document.querySelector(`#blog-${name}-error`);
    const message = errors[name] || "";
    error.textContent = message;
    field.setAttribute("aria-invalid", message ? "true" : "false");
  });
}

function showCommentError(message) {
  const input = document.querySelector("#comment-text");
  document.querySelector("#comment-error").textContent = message;
  input.setAttribute("aria-invalid", message ? "true" : "false");
}

function focusFirstInvalidField(errors) {
  const first = Object.keys(errors)[0];
  const ids = {
    title: "blog-title",
    category: "blog-category",
    tags: "blog-tags",
    content: "blog-content",
    image: "imageUpload",
  };
  if (ids[first]) document.querySelector(`#${ids[first]}`).focus();
}

function parseTags(value) {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
}

// Keep create and edit drafts separate for each signed-in user.
function draftKey() {
  if (!currentUser) return null;
  return `blogDraft:${currentUser.id}:${editingId || "new"}`;
}

function saveDraft(form) {
  const key = draftKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      title: form.elements.title.value,
      category: form.elements.category.value,
      tags: form.elements.tags.value,
      content: form.elements.content.value,
    }));
  } catch {
    // Draft storage is optional; the form remains usable when storage is unavailable.
  }
}

function restoreDraft(form) {
  const key = draftKey();
  if (!key) return;
  try {
    const draft = JSON.parse(localStorage.getItem(key) || "null");
    if (!draft || typeof draft !== "object") return;
    ["title", "category", "tags", "content"].forEach((field) => {
      if (typeof draft[field] === "string") form.elements[field].value = draft[field];
    });
  } catch {
    // Ignore unavailable or malformed storage.
  }
}

function clearCurrentDraft() {
  const key = draftKey();
  try {
    if (key) localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
}

function resetBlogForm(form) {
  form.reset();
  form.querySelector(".articlebtn").textContent = "Post";
  document.querySelector("#cancel-edit").hidden = true;
  showBlogErrors({});
}

function setFormPending(form, pending, pendingLabel = "Working...") {
  form.dataset.pending = String(pending);
  const submit = form.querySelector('button[type="submit"]');
  if (!submit) return;

  if (pending) {
    submit.dataset.normalLabel = submit.textContent;
    submit.textContent = pendingLabel;
  } else if (submit.dataset.normalLabel) {
    submit.textContent = submit.dataset.normalLabel;
    delete submit.dataset.normalLabel;
  }
  submit.disabled = pending;
  submit.setAttribute("aria-busy", String(pending));
}

function setActionPending(container, pending) {
  if (!container) return;
  container.dataset.pending = String(pending);
  container.querySelectorAll("button").forEach((button) => {
    button.disabled = pending;
  });
  container.setAttribute("aria-busy", String(pending));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let data = null;
  const contentType = response.headers.get("content-type") || "";

  if (response.status !== 204 && contentType.includes("application/json")) {
    data = await response.json();
  }

  if (!response.ok) {
    const message = data?.error || (data?.errors ? "Please correct the highlighted fields." : `Request failed (${response.status}).`);
    const error = new Error(message);
    error.data = data;
    throw error;
  }
  return data;
}

function setFormStatus(message, type = "") {
  setStatus(document.querySelector("#blog-form-status"), message, type);
}

function setStatus(element, message, type = "") {
  if (!element) return;
  element.textContent = message;
  element.classList.remove("is-error", "is-success");
  if (type === "error") element.classList.add("is-error");
  if (type === "success") element.classList.add("is-success");
}

function textElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text ?? "";
  return element;
}

function shorten(text) {
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString("en-AU");
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

function safeImageSource(value) {
  if (typeof value !== "string") return DEFAULT_BLOG_IMAGE;
  if (/^\/images\/[\w.-]+$/i.test(value)) return value;
  if (/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value;
  return DEFAULT_BLOG_IMAGE;
}
