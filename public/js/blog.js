const BLOG_API_URL = "/api/blogs";
const BLOG_DRAFT_KEY = "rmit-connect-blog-draft";

let blogs = [];

document.addEventListener("DOMContentLoaded", initialisePage);

function initialisePage() {
  if (document.querySelector("#blog-list")) initialiseBlogListPage();
  if (document.querySelector("#blog-detail")) initialiseBlogDetailsPage();
}

// Blog list
function initialiseBlogListPage() {
  const form = document.querySelector("#create-blog-form");
  const searchInput = document.querySelector("#blog-search");
  const searchCategory = document.querySelector("#search-category");

  restoreDraft();
  form.addEventListener("submit", handleCreateBlog);
  form.addEventListener("input", handleFormInput);
  searchInput.addEventListener("input", handleSearch);
  searchCategory.addEventListener("change", handleSearch);
  loadBlogs();
}

async function loadBlogs() {
  setListStatus("Loading blogs...");
  try {
    const response = await fetch(BLOG_API_URL);
    const data = await readJsonResponse(response);
    if (!response.ok)
      throw new Error(data.error || "Unable to retrieve blogs.");
    blogs = data;
    renderBlogList(blogs);
  } catch (error) {
    console.error(error);
    setListStatus(error.message, true);
  }
}

function renderBlogList(blogList) {
  const container = document.querySelector("#blog-list");
  container.replaceChildren();
  if (blogList.length === 0) {
    setListStatus("No blogs found.");
    return;
  }
  setListStatus("");
  blogList.forEach((blog) => container.append(createBlogPreview(blog)));
}

function createBlogPreview(blog) {
  const article = createElement("article", "article");
  const image = createElement("img", "article-image");
  image.src = blog.image || "/images/image-for-blog.png";
  image.alt = `Image for ${blog.title}`;

  const preview = createElement("div", "article-preview");
  const heading = document.createElement("h2");
  const titleLink = document.createElement("a");
  titleLink.href = `/blogs/${encodeURIComponent(blog.id)}`;
  titleLink.textContent = blog.title;
  heading.append(titleLink);

  const author = createElement("span", "articleinfo-student");
  author.textContent = `${blog.authorName} - ${blog.authorSid}`;

  const date = createElement("time", "articleinfo-calendar");
  date.dateTime = blog.dateAdded;
  date.textContent = formatDate(blog.dateAdded);

  const tags = createElement("div", "tags");
  blog.tags.forEach((tag) => {
    const tagElement = document.createElement("p");
    tagElement.textContent = tag;
    tags.append(tagElement);
  });

  const summary = createElement("p", "preview-text");
  summary.textContent = createSummary(blog.content, 150);

  const readMore = createElement("a", "btn read-more");
  readMore.href = `/blogs/${encodeURIComponent(blog.id)}`;
  readMore.textContent = "Read more";

  preview.append(heading, author, date, tags, summary, readMore);
  article.append(image, preview);
  return article;
}

// Create blog and live validation
async function handleCreateBlog(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const blogData = await createBlogData(form);
  const errors = validateBlogForm(blogData);
  displayValidationErrors(errors);

  if (Object.keys(errors).length > 0) {
    setFormStatus("Please correct the highlighted fields.", true);
    return;
  }

  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  setFormStatus("Publishing blog...");

  try {
    const response = await fetch(BLOG_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(blogData),
    });
    const data = await readJsonResponse(response);
    if (!response.ok) {
      displayValidationErrors(data.errors || {});
      throw new Error(data.error || "The blog could not be published.");
    }

    blogs.unshift(data);
    renderBlogList(filterBlogs(blogs, getSearchKeyword(), getSearchCategory()));
    form.reset();
    localStorage.removeItem(BLOG_DRAFT_KEY);
    setFormStatus("Your blog was published successfully.", false, true);
  } catch (error) {
    console.error(error);
    setFormStatus(error.message, true);
  } finally {
    submitButton.disabled = false;
  }
}

async function createBlogData(form) {
  const formData = new FormData(form);
  const imageFile = formData.get("image");
  let image = "";
  if (imageFile instanceof File && imageFile.size > 0) {
    image = await fileToDataUrl(imageFile);
  }
  return {
    title: String(formData.get("title") || "").trim(),
    tags: normaliseTags(formData.get("tags")),
    content: String(formData.get("content") || "").trim(),
    image,
  };
}

function validateBlogForm(blogData) {
  const errors = {};
  const imageFile = document.querySelector("#imageUpload").files[0];
  if (blogData.title.length < 5)
    errors.title = "Title must contain at least 5 characters.";
  else if (blogData.title.length > 120)
    errors.title = "Title cannot exceed 120 characters.";
  if (blogData.content.length < 20)
    errors.content = "Content must contain at least 20 characters.";
  if (imageFile && !imageFile.type.startsWith("image/"))
    errors.image = "Please select an image file.";
  else if (imageFile && imageFile.size > MAX_IMAGE_SIZE)
    errors.image = "The image cannot exceed 4 MB.";
  return errors;
}

function handleFormInput() {
  saveDraft();
  const title = document.querySelector("#blog-title").value.trim();
  const content = document.querySelector("#blog-content").value.trim();
  displayValidationErrors(validateBlogForm({ title, content }));
}

function displayValidationErrors(errors) {
  document.querySelector("#blog-title-error").textContent = errors.title || "";
  document.querySelector("#blog-content-error").textContent =
    errors.content || "";
  document.querySelector("#blog-image-error").textContent = errors.image || "";
}

// Search blogs on the client
function handleSearch() {
  renderBlogList(filterBlogs(blogs, getSearchKeyword(), getSearchCategory()));
}

function filterBlogs(blogList, keyword, category) {
  const normalisedKeyword = normaliseText(keyword);
  if (!normalisedKeyword) return [...blogList];

  return blogList.filter((blog) => {
    const searchableValues = {
      name: blog.authorName,
      id: blog.authorSid,
      tags: blog.tags.join(" "),
      all: [
        blog.title,
        blog.authorName,
        blog.authorSid,
        blog.tags.join(" "),
        blog.content,
      ].join(" "),
    };
    return normaliseText(
      searchableValues[category] || searchableValues.all,
    ).includes(normalisedKeyword);
  });
}

// Blog details page
async function initialiseBlogDetailsPage() {
  const blogId = getBlogIdFromUrl();
  if (!blogId) {
    showBlogNotFound("No blog ID was provided.");
    return;
  }

  try {
    const response = await fetch(
      `${BLOG_API_URL}/${encodeURIComponent(blogId)}`,
    );
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || "Blog not found.");
    renderBlogDetails(data);
  } catch (error) {
    console.error(error);
    showBlogNotFound(error.message);
  }
}

function getBlogIdFromUrl() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  return pathParts[0] === "blogs" && pathParts.length > 1
    ? decodeURIComponent(pathParts[1])
    : new URLSearchParams(window.location.search).get("id");
}

function renderBlogDetails(blog) {
  const detail = document.querySelector("#blog-detail");
  const status = document.querySelector("#blog-detail-status");
  document.title = `${blog.title} | RMIT Connect`;
  document.querySelector("#blog-post-title").textContent = blog.title;
  document.querySelector("#blog-author").textContent =
    `${blog.authorName} - ${blog.authorSid}`;

  const date = document.querySelector("#blog-date");
  date.dateTime = blog.dateAdded;
  date.textContent = formatDate(blog.dateAdded);
  document.querySelector("#blog-detail-content").textContent = blog.content;

  const tags = document.querySelector("#blog-detail-tags");
  tags.replaceChildren();
  blog.tags.forEach((tag) => {
    const tagElement = document.createElement("p");
    tagElement.textContent = `#${tag}`;
    tags.append(tagElement);
  });

  const image = document.querySelector("#blog-detail-image");
  image.src = blog.image || "/images/image-for-blog.png";
  image.alt = `Image for ${blog.title}`;
  status.textContent = "";
  detail.hidden = false;
}

function showBlogNotFound(message) {
  const status = document.querySelector("#blog-detail-status");
  status.textContent = message;
  status.classList.add("is-error");
}

// Web Storage draft
function saveDraft() {
  const draft = {
    title: document.querySelector("#blog-title").value,
    tags: document.querySelector("#blog-tags").value,
    content: document.querySelector("#blog-content").value,
  };
  localStorage.setItem(BLOG_DRAFT_KEY, JSON.stringify(draft));
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(BLOG_DRAFT_KEY));
    if (!draft) return;
    document.querySelector("#blog-title").value = draft.title || "";
    document.querySelector("#blog-tags").value = draft.tags || "";
    document.querySelector("#blog-content").value = draft.content || "";
  } catch {
    localStorage.removeItem(BLOG_DRAFT_KEY);
  }
}

// Utilities
function createElement(tagName, className) {
  const element = document.createElement(tagName);
  element.className = className;
  return element;
}

function createSummary(content, maximumLength) {
  return content.length <= maximumLength
    ? content
    : `${content.slice(0, maximumLength).trim()}...`;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : new Intl.DateTimeFormat("en-AU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function normaliseTags(tags) {
  return [
    ...new Set(
      String(tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
}

function normaliseText(text) {
  return String(text || "")
    .trim()
    .toLocaleLowerCase();
}

function getSearchKeyword() {
  return document.querySelector("#blog-search").value;
}

function getSearchCategory() {
  return document.querySelector("#search-category").value;
}

function setListStatus(message, isError = false) {
  const status = document.querySelector("#blog-list-status");
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function setFormStatus(message, isError = false, isSuccess = false) {
  const status = document.querySelector("#blog-form-status");
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  status.classList.toggle("is-success", isSuccess);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () =>
      reject(new Error("Unable to read image.")),
    );
    reader.readAsDataURL(file);
  });
}

async function readJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : {};
}
