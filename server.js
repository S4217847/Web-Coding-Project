const express = require("express");
const path = require("path");
const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "Work")));

let blogs = [
  {
    id: "blog-001",
    title: "My first day at RMIT",
    authorId: "user-001",
    authorName: "Hoang Hieu Minh",
    authorSid: "s4199268",
    dateAdded: new Date().toISOString(),
    tags: ["RMIT", "Student life"],
    content: "Full content of the blog...",
    image: "/images/image-for-blog.png",
    comments: []
  }
];

function showBlogList(request, response) {
  response.sendFile(path.join(__dirname, "Work", "blog.html"));
}

function showBlogDetails(request, response) {
  response.sendFile(
    path.join(__dirname, "Work", "blog_details.html")
  );
}

app.get("/", showBlogList);
app.get("/blogs", showBlogList);
app.get("/blogs/:id", showBlogDetails);

app.get("/api/blogs", function getBlogs(request, response) {
  response.json(blogs);
});

app.get("/api/blogs/:id", function getBlogById(request, response) {
  const blog = blogs.find((item) => item.id === request.params.id);

  if (!blog) {
    return response.status(404).json({ error: "Blog not found." });
  }

  response.json(blog);
});

app.post("/api/blogs", function createBlog(request, response) {
  const validation = validateBlogInput(request.body);

  if (!validation.isValid) {
    return response.status(400).json({ errors: validation.errors });
  }

  const newBlog = {
    id: `blog-${Date.now()}`,
    title: request.body.title.trim(),
    authorId: "user-001",
    authorName: "Hoang Hieu Minh",
    authorSid: "s4199268",
    dateAdded: new Date().toISOString(),
    tags: normaliseTags(request.body.tags),
    content: request.body.content.trim(),
    image: request.body.image || "/images/image-for-blog.png",
    comments: []
  };

  blogs.unshift(newBlog);
  response.status(201).json(newBlog);
});

function validateBlogInput(input) {
  const errors = {};

  if (typeof input.title !== "string" || input.title.trim().length < 5) {
    errors.title = "Title must contain at least 5 characters.";
  } else if (input.title.trim().length > 120) {
    errors.title = "Title cannot exceed 120 characters.";
  }

  if (typeof input.content !== "string" || input.content.trim().length < 20) {
    errors.content = "Content must contain at least 20 characters.";
  }

  if (input.image && typeof input.image !== "string") {
    errors.image = "The selected image is invalid.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

function normaliseTags(tags) {
  const tagList = Array.isArray(tags) ? tags : String(tags || "").split(",");

  return [...new Set(tagList.map((tag) => tag.trim()).filter(Boolean))];
}

function startServer() {
  console.log(`Blog module running at http://localhost:${PORT}`);
}

app.listen(PORT, startServer);
