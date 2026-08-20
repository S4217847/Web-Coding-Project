const API = "/api/blogs";
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

let blogs = [];
let currentUser = null;
let editingId = null;
let detailComments = [];

document.addEventListener("DOMContentLoaded", async () => {
  try {
    currentUser = await requestJson("/api/current-user");
  } catch {
    currentUser = null;
  }
  if (document.querySelector("#blog-list")) setupBlogList();
  if (document.querySelector("#blog-detail")) setupBlogDetails();
});

// LIST, SEARCH, SORT
async function setupBlogList() {
  const form = document.querySelector("#create-blog-form");
  if (!currentUser) {
    form.hidden = true;
    document.querySelector("#blog-list-status").textContent = "Log in to create a blog.";
  }
  form.addEventListener("submit", saveBlog);
  form.addEventListener("input", () => {
    saveDraft(form);
    showErrors(validateForm(form));
  });
  document.querySelector("#cancel-edit").addEventListener("click", cancelEdit);
  document.querySelector("#blog-search").addEventListener("input", filterAndSort);
  document.querySelector("#search-category").addEventListener("change", filterAndSort);
  document.querySelector("#blog-sort").addEventListener("change", filterAndSort);

  restoreDraft(form);
  try {
    blogs = await requestJson(API);
    filterAndSort();
    const editId = new URLSearchParams(location.search).get("edit");
    if (editId) {
      startEdit(editId);
      history.replaceState({}, "", "/blogs");
    }
  } catch (error) {
    document.querySelector("#blog-list-status").textContent = error.message;
  }
}

function filterAndSort() {
  const keyword = document.querySelector("#blog-search").value.trim().toLowerCase();
  const field = document.querySelector("#search-category").value;
  const sort = document.querySelector("#blog-sort").value;

  const filtered = blogs.filter((blog) => {
    const values = {
      title: blog.title,
      name: blog.authorName,
      id: blog.authorSid,
      content: blog.content,
      category: blog.category,
      tags: blog.tags.join(" "),
      all: `${blog.title} ${blog.authorName} ${blog.authorSid} ${blog.content} ${blog.category} ${blog.tags.join(" ")}`
    };
    return values[field].toLowerCase().includes(keyword);
  });

  filtered.sort((a, b) => {
    if (sort === "oldest") return new Date(a.dateAdded) - new Date(b.dateAdded);
    if (sort === "title-az") return a.title.localeCompare(b.title);
    if (sort === "title-za") return b.title.localeCompare(a.title);
    return new Date(b.dateAdded) - new Date(a.dateAdded);
  });
  displayBlogs(filtered);
}

function displayBlogs(items) {
  const list = document.querySelector("#blog-list");
  document.querySelector("#blog-list-status").textContent = items.length ? "" : "No blogs found.";

  list.innerHTML = items.map((blog) => {
    return `
      <article class="article">
        <img class="article-image" src="${escapeHtml(blog.image)}" alt="Image for ${escapeHtml(blog.title)}">
        <div class="article-preview">
          <h2><a href="/blogs/${encodeURIComponent(blog.id)}">${escapeHtml(blog.title)}</a></h2>
          <span class="articleinfo-student">${escapeHtml(blog.authorName)} - ${escapeHtml(blog.authorSid)}</span>
          <time class="articleinfo-calendar" datetime="${escapeHtml(blog.dateAdded)}">${formatDate(blog.dateAdded)}</time>
          <p><strong>${escapeHtml(blog.category)}</strong></p>
          <div class="tags">${blog.tags.map((tag) => `<p>${escapeHtml(tag)}</p>`).join("")}</div>
          <p class="preview-text">${escapeHtml(shorten(blog.content))}</p>
          <a class="btn read-more" href="/blogs/${encodeURIComponent(blog.id)}">Read more</a>
        </div>
      </article>
    `;
  }).join("");
}

// CREATE, UPDATE, DELETE
async function saveBlog(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errors = validateForm(form);
  showErrors(errors);
  if (Object.keys(errors).length) return;

  const oldBlog = blogs.find((blog) => blog.id === editingId);
  const file = form.elements.image.files[0];
  const data = {
    title: form.elements.title.value.trim(),
    category: form.elements.category.value,
    tags: form.elements.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    content: form.elements.content.value.trim(),
    image: file ? await readImage(file) : oldBlog?.image || ""
  };

  try {
    const saved = await requestJson(editingId ? `${API}/${editingId}` : API, {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (editingId) {
      blogs = blogs.map((blog) => blog.id === editingId ? saved : blog);
    } else {
      blogs.unshift(saved);
    }
    resetForm(form);
    filterAndSort();
    setFormStatus(editingId ? "Blog updated successfully." : "Blog published successfully.");
    editingId = null;
  } catch (error) {
    showErrors(error.data?.errors || {});
    setFormStatus(error.message);
  }
}

function startEdit(id) {
  const blog = blogs.find((item) => item.id === id);
  if (!blog || blog.authorId !== currentUser?.id) return;
  const form = document.querySelector("#create-blog-form");
  editingId = id;
  form.elements.title.value = blog.title;
  form.elements.category.value = blog.category;
  form.elements.tags.value = blog.tags.join(", ");
  form.elements.content.value = blog.content;
  form.querySelector(".articlebtn").textContent = "Update";
  document.querySelector("#cancel-edit").hidden = false;
  form.scrollIntoView({ behavior: "smooth" });
}

function cancelEdit() {
  editingId = null;
  resetForm(document.querySelector("#create-blog-form"));
  setFormStatus("");
}

async function deleteBlog(id) {
  if (!confirm("Delete this blog?")) return;
  try {
    await requestJson(`${API}/${id}`, { method: "DELETE" });
    if (document.querySelector("#blog-list")) {
      blogs = blogs.filter((blog) => blog.id !== id);
      filterAndSort();
    } else {
      location.href = "/blogs";
    }
  } catch (error) {
    const status = document.querySelector("#blog-list-status") ||
      document.querySelector("#blog-detail-status");
    status.textContent = error.message;
  }
}

// DETAILS AND COMMENTS
async function setupBlogDetails() {
  const id = location.pathname.split("/").filter(Boolean).pop();
  const form = document.querySelector("#comment-form");
  if (!currentUser) form.hidden = true;
  form.addEventListener("submit", (event) => addComment(event, id));

  try {
    const blog = await requestJson(`${API}/${encodeURIComponent(id)}`);
    document.title = `${blog.title} | RMIT Connect`;
    document.querySelector("#blog-post-title").textContent = blog.title;
    document.querySelector("#blog-author").textContent = `${blog.authorName} - ${blog.authorSid}`;
    document.querySelector("#blog-date").textContent = formatDate(blog.dateAdded);
    document.querySelector("#blog-detail-category").textContent = blog.category;
    document.querySelector("#blog-detail-content").textContent = blog.content;
    document.querySelector("#blog-detail-image").src = blog.image;
    document.querySelector("#blog-detail-image").alt = `Image for ${blog.title}`;
    document.querySelector("#blog-detail-tags").innerHTML =
      blog.tags.map((tag) => `<p>#${escapeHtml(tag)}</p>`).join("");
    document.querySelector("#blog-detail-status").textContent = "";
    document.querySelector("#blog-detail").hidden = false;
    if (currentUser && blog.authorId === currentUser.id) {
      const actions = document.querySelector("#detail-actions");
      actions.hidden = false;
      document.querySelector("#detail-edit").addEventListener("click", () => {
        location.href = `/blogs?edit=${encodeURIComponent(blog.id)}`;
      });
      document.querySelector("#detail-delete").addEventListener("click", () => {
        deleteBlog(blog.id);
      });
    }
    detailComments = blog.comments;
    displayComments(detailComments);
  } catch (error) {
    document.querySelector("#blog-detail-status").textContent = error.message;
    form.hidden = true;
  }
}

async function addComment(event, blogId) {
  event.preventDefault();
  const form = event.currentTarget;
  const content = form.elements.comment.value.trim();
  const errorElement = document.querySelector("#comment-error");

  errorElement.textContent = content.length < 2 || content.length > 500
    ? "Comment must contain between 2 and 500 characters."
    : "";
  if (errorElement.textContent) return;

  try {
    const comment = await requestJson(`${API}/${blogId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    detailComments.push(comment);
    displayComments(detailComments);
    form.reset();
    document.querySelector("#comment-status").textContent = "Comment posted.";
  } catch (error) {
    document.querySelector("#comment-status").textContent = error.message;
  }
}

function displayComments(comments) {
  const list = document.querySelector("#comment-list");
  list.innerHTML = comments.length ? comments.map((comment) => `
    <article class="comment">
      <div class="comment-header">
        <strong>${escapeHtml(comment.authorName)} - ${escapeHtml(comment.authorSid)}</strong>
        <time datetime="${escapeHtml(comment.dateAdded)}">${formatDate(comment.dateAdded)}</time>
      </div>
      <p>${escapeHtml(comment.content)}</p>
    </article>
  `).join("") : "<p>No comments yet.</p>";
}

// VALIDATION AND WEB STORAGE
function validateForm(form) {
  const title = form.elements.title.value.trim();
  const category = form.elements.category.value;
  const tags = form.elements.tags.value.split(",").map((tag) => tag.trim()).filter(Boolean);
  const content = form.elements.content.value.trim();
  const image = form.elements.image.files[0];
  const errors = {};

  if (title.length < 5 || title.length > 120) errors.title = "Title must contain between 5 and 120 characters.";
  if (!category) errors.category = "Choose a category.";
  if (tags.length < 1 || tags.length > 5 || tags.some((tag) => tag.length > 30)) {
    errors.tags = "Enter 1 to 5 tags; each tag can have up to 30 characters.";
  }
  if (content.length < 20 || content.length > 5000) errors.content = "Content must contain between 20 and 5000 characters.";
  if (image && (!IMAGE_TYPES.includes(image.type) || image.size > MAX_IMAGE_SIZE)) {
    errors.image = "Use PNG, JPEG, GIF, or WebP up to 4 MB.";
  }
  return errors;
}

function showErrors(errors) {
  ["title", "category", "tags", "content", "image"].forEach((field) => {
    document.querySelector(`#blog-${field}-error`).textContent = errors[field] || "";
  });
}

function draftKey() {
  return currentUser ? `blogDraft:${currentUser.id}` : null;
}

function saveDraft(form) {
  const key = draftKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      title: form.elements.title.value,
      category: form.elements.category.value,
      tags: form.elements.tags.value,
      content: form.elements.content.value
    }));
  } catch {
    // The page remains usable when storage is disabled or full.
  }
}

function restoreDraft(form) {
  const key = draftKey();
  if (!key) return;
  try {
    const draft = JSON.parse(localStorage.getItem(key) || "null");
    if (!draft) return;
    ["title", "category", "tags", "content"].forEach((field) => {
      form.elements[field].value = draft[field] || "";
    });
  } catch {
    // Ignore unavailable or malformed storage.
  }
}

function resetForm(form) {
  form.reset();
  form.querySelector(".articlebtn").textContent = "Post";
  document.querySelector("#cancel-edit").hidden = true;
  const key = draftKey();
  try {
    if (key) localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage.
  }
  showErrors({});
}

// SMALL HELPERS
async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const error = new Error(data?.error || "Request failed.");
    error.data = data;
    throw error;
  }
  return data;
}

function setFormStatus(message) {
  document.querySelector("#blog-form-status").textContent = message;
}

function shorten(text) {
  return text.length > 150 ? `${text.slice(0, 150)}...` : text;
}

function formatDate(value) {
  return new Date(value).toLocaleString("en-AU");
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value = "") {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}
