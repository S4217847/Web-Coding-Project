const express = require("express");
const mongoose = require("mongoose");
const { Blog, BlogComment } = require("../models/blog");

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const DEFAULT_IMAGE = "/images/image-for-blog.png";
const BLOG_CATEGORIES = ["Academic", "Events", "Student Life", "Technology", "Other"];
const AUTHOR_FIELDS = "name studentId";

function createBlogRouter({ getCurrentUser }) {
  const router = express.Router();

  const requireUser = asyncRoute (
    async (request, response, next) => {
      const user = await getCurrentUser(request);
      request.currentUser = normaliseUser(user);

      if (!request.currentUser) {
        return response.status(401).json({ error: "You must be logged in to perform this action." });
      }
      next();
    }
  );

  router.param("id", (request, response, next, id) => {
    if (!mongoose.isObjectIdOrHexString(id)) {
      return response.status(400).json({ error: "Invalid blog ID." });
    }
    next();
  });

  router.get("/", asyncRoute(async (request, response) => {
    const blog = await Blog.find({ deletedAt: null }).populate("authorId", AUTHOR_FIELDS).sort({ createdAt: -1 });
    response.json(blog.map((item) => toBlogResponse(item)));
  }));

  router.get("/:id", asyncRoute(async (request, response) => {
    const blog = await Blog.findOne({ _id: request.params.id, deletedAt: null }).populate("authorId", AUTHOR_FIELDS);
    if (!blog) {
      return response.status(404).json({ error: "Blog not found." });
    }
    const comments = await BlogComment.find({ blogId: blog._id, deletedAt: null }).populate("authorId", AUTHOR_FIELDS).sort({ createdAt: 1 });
    response.json(toBlogResponse(blog, comments));
  }));

  router.post("/", requireUser, asyncRoute(async (request, response) => {
    const errors = validateBlog(request.body ?? {});
    if (Object.keys(errors).length) {
      return response.status(400).json({ errors });
    }

    const blog = await Blog.create({
      ...cleanBlogInput(request.body), authorId: request.currentUser.id,
    });
    await blog.populate("authorId", AUTHOR_FIELDS);
    response.status(201).json(toBlogResponse(blog));
  }));

  router.put("/:id", requireUser, asyncRoute(async (request, response) => {
    const existingBlog = await Blog.findById(request.params.id);
    if (!existingBlog || existingBlog.deletedAt) {
      return response.status(404).json({ error: "Blog not found." });
    }
    if (existingBlog.authorId.toString() !== request.currentUser.id) {
      return response.status(403).json({ error: "You can edit only your own blogs." });
    }

    const errors = validateBlog(request.body ?? {});
    if (Object.keys(errors).length) {
      return response.status(400).json({ errors });
    }
    const blog = await Blog.findOneAndUpdate(
      { _id: request.params.id, authorId: request.currentUser.id, deletedAt: null },
      { $set: cleanBlogInput(request.body) },
      { returnDocument: "after", runValidators: true }
    ).populate("authorId", AUTHOR_FIELDS);
    if (!blog) {
      return response.status(404).json({ error: "Blog not found." });
    }
    response.json(toBlogResponse(blog));
  }));

  router.delete("/:id", requireUser, asyncRoute(async (request, response) => {
    const existingBlog = await Blog.findById(request.params.id);
    if (!existingBlog || existingBlog.deletedAt) {
      return response.status(404).json({ error: "Blog not found." });
    }
    if (existingBlog.authorId.toString() !== request.currentUser.id) {
      return response.status(403).json({ error: "You can delete only your own blogs." });
    }
    const result = await Blog.findOneAndUpdate(
      { _id: request.params.id, authorId: request.currentUser.id, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { returnDocument: "after", runValidators: true }
    );
    if (!result) {
      return response.status(404).json({ error: "Blog is no longer available." });
    }
    response.status(204).end();
  }));

  router.post("/:id/comments", requireUser, asyncRoute(async (request, response) => {
    const blog = await Blog.findById(request.params.id);
    if (!blog || blog.deletedAt) {
      return response.status(404).json({ error: "Blog not found." });
    }

    const content = typeof request.body?.content === "string" ? request.body.content.trim() : "";
    if (content.length < 2 || content.length > 500) {
      return response.status(400).json({
        errors: { content: "Comment must contain between 2 and 500 characters." }
      });
    }

    const comment = await BlogComment.create({
      blogId: blog.id,
      authorId: request.currentUser.id,
      content
    });
    await comment.populate("authorId", AUTHOR_FIELDS);
    response.status(201).json(toCommentResponse(comment));
  }));

  router.use((error, request, response, next) => {
    if (error.name === "ValidationError") {
      const errors = {};
      for (const field in error.errors) {
        errors[field] = error.errors[field].message;
      }
      response.status(400).json({ errors });
    } else {
      next(error);
    }
  });

  return router;
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

function toCommentResponse(comment) {
  const author = comment.authorId

  return {
    id: String(comment.id),
    authorId: author ? String(author._id) : null,
    authorName: author?.name || "Unknown user",
    authorSid: author?.studentId || "",
    content: String(comment.content),
    dateAdded: new Date(comment.createdAt).toISOString(),
    updatedAt: new Date(comment.updatedAt).toISOString()
  };
}

function toBlogResponse(blog, comments = []) {
  const author = blog.authorId
  
  return {
    id: String(blog.id),
    title: String(blog.title),
    category: String(blog.category),
    tags: blog.tags.map((tag) => String(tag)),
    content: String(blog.content),
    image: String(blog.image),

    authorId: author ? String(author._id) : null,
    authorName: author?.name || "Unknown user",
    authorSid: author?.studentId || "",

    dateAdded: new Date(blog.createdAt).toISOString(),
    updatedAt: new Date(blog.updatedAt).toISOString(),
    deleted: blog.deletedAt !== null,
    comments: comments.map(toCommentResponse)
  };
}

function asyncRoute(handler) {
  return (request, response, next) => {
    return Promise.resolve(handler(request, response, next)).catch(next);
  };
}

module.exports = { createBlogRouter, normaliseUser, MAX_IMAGE_SIZE, BLOG_CATEGORIES, AUTHOR_FIELDS };
