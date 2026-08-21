const express = require("express");

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const DEFAULT_IMAGE = "/images/image-for-blog.png";
const BLOG_CATEGORIES = ["Academic", "Events", "Student Life", "Technology", "Other"];

function createBlogRouter({ blogs, getCurrentUser }) {
  const router = express.Router();

  async function requireUser(request, response, next) {
    try {
      const user = await getCurrentUser(request);
      request.currentUser = normaliseUser(user);
      if (!request.currentUser) {
        return response.status(401).json({ error: "You must log in first." });
      }
      next();
    } catch (error) {
      next(error);
    }
  }

  router.get("/", (request, response) => {
    response.json(blogs.filter((blog) => !blog.deleted));
  });

  router.get("/:id", (request, response) => {
    const blog = findPublicBlog(blogs, request.params.id);
    if (!blog) return response.status(404).json({ error: "Blog not found." });
    response.json(blog);
  });

  router.post("/", requireUser, (request, response) => {
    const errors = validateBlog(request.body);
    if (Object.keys(errors).length) return response.status(400).json({ errors });

    const blog = {
      id: `blog-${Date.now()}`,
      ...cleanBlogInput(request.body),
      authorId: request.currentUser.id,
      authorName: request.currentUser.name,
      authorSid: request.currentUser.sid,
      dateAdded: new Date().toISOString(),
      updatedAt: null,
      deleted: false,
      comments: []
    };
    blogs.unshift(blog);
    response.status(201).json(blog);
  });

  router.put("/:id", requireUser, (request, response) => {
    const blog = findPublicBlog(blogs, request.params.id);
    if (!blog) return response.status(404).json({ error: "Blog not found." });
    if (blog.authorId !== request.currentUser.id) {
      return response.status(403).json({ error: "You can edit only your own blogs." });
    }

    const errors = validateBlog(request.body);
    if (Object.keys(errors).length) return response.status(400).json({ errors });
    Object.assign(blog, cleanBlogInput(request.body), { updatedAt: new Date().toISOString() });
    response.json(blog);
  });

  router.delete("/:id", requireUser, (request, response) => {
    const blog = findPublicBlog(blogs, request.params.id);
    if (!blog) return response.status(404).json({ error: "Blog not found." });
    if (blog.authorId !== request.currentUser.id) {
      return response.status(403).json({ error: "You can delete only your own blogs." });
    }
    blog.deleted = true;
    blog.deletedAt = new Date().toISOString();
    response.status(204).end();
  });

  router.post("/:id/comments", requireUser, (request, response) => {
    const blog = findPublicBlog(blogs, request.params.id);
    if (!blog) return response.status(404).json({ error: "Blog not found." });

    const content = typeof request.body?.content === "string" ? request.body.content.trim() : "";
    if (content.length < 2 || content.length > 500) {
      return response.status(400).json({
        errors: { content: "Comment must contain between 2 and 500 characters." }
      });
    }

    const comment = {
      id: `comment-${Date.now()}`,
      authorId: request.currentUser.id,
      authorName: request.currentUser.name,
      authorSid: request.currentUser.sid,
      content,
      dateAdded: new Date().toISOString()
    };
    blog.comments.push(comment);
    response.status(201).json(comment);
  });

  return router;
}

function findPublicBlog(blogs, id) {
  return blogs.find((blog) => blog.id === id && !blog.deleted);
}

function normaliseUser(user) {
  if (!user) return null;
  const id = user.id;
  const name = user.name || user.username;
  const sid = user.sid || user.studentId;
  if (!id || !name || !sid) return null;
  return { id: String(id), name: String(name), sid: String(sid) };
}

function cleanBlogInput(input) {
  return {
    title: input.title.trim(),
    category: input.category.trim(),
    tags: [...new Set(input.tags.map((tag) => String(tag).trim()).filter(Boolean))],
    content: input.content.trim(),
    image: input.image || DEFAULT_IMAGE
  };
}

function validateBlog(input = {}) {
  const errors = {};
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const tagsAreStrings = Array.isArray(input.tags) && input.tags.every((tag) => typeof tag === "string");
  const tags = tagsAreStrings
    ? [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))]
    : [];

  if (title.length < 5 || title.length > 120) errors.title = "Title must contain between 5 and 120 characters.";
  if (content.length < 20 || content.length > 5000) errors.content = "Content must contain between 20 and 5000 characters.";
  if (!BLOG_CATEGORIES.includes(category)) errors.category = "Choose a valid category.";
  if (!tagsAreStrings || tags.length < 1 || tags.length > 5 || tags.some((tag) => tag.length > 30)) {
    errors.tags = "Enter between 1 and 5 tags; each tag can have up to 30 characters.";
  }
  if (!isValidImage(input.image)) errors.image = "Image must be a PNG, JPEG, GIF, or WebP and no larger than 4 MB.";
  return errors;
}

function isValidImage(image = "") {
  if (image === "") return true;
  if (typeof image !== "string") return false;
  if (/^\/images\/[\w.-]+$/i.test(image)) return true;
  const match = image.match(/^data:image\/(png|jpeg|gif|webp);base64,([a-z0-9+/=]+)$/i);
  return Boolean(match) && Math.ceil(match[2].length * 0.75) <= MAX_IMAGE_SIZE;
}

module.exports = { createBlogRouter, normaliseUser, MAX_IMAGE_SIZE, BLOG_CATEGORIES };
