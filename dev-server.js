const express = require("express");
const path = require("path");
const { registerBlogApi } = require("./routes/register-blog-api");

const app = express();
const PORT = process.env.PORT || 3000;

const users = [
  { id: "user-001", name: "Hoang Hieu Minh", sid: "s4199268" },
  { id: "user-002", name: "Kim Nguyen", sid: "s4000002" }
];

const blogs = [{
  id: "blog-001",
  title: "My first day at RMIT",
  category: "Student Life",
  tags: ["RMIT", "Orientation"],
  content: "My first day at RMIT was exciting and full of new experiences.",
  image: "/images/image-for-blog.png",
  authorId: "user-001",
  authorName: "Hoang Hieu Minh",
  authorSid: "s4199268",
  dateAdded: new Date().toISOString(),
  updatedAt: null,
  deleted: false,
  comments: []
}];

app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "Blog")));
app.use("/images", express.static(path.join(__dirname, "images")));

// Standalone adapter. Remove this when the shared account middleware supplies
// request.user or request.session.user.
app.use((request, response, next) => {
  const requestedUser = request.get("x-user-id");
  request.user = requestedUser === "anonymous"
    ? undefined
    : users.find((user) => user.id === requestedUser) || users[0];
  next();
});

registerBlogApi(app, {
  blogs,
  getCurrentUser: async (request) => request.user || request.session?.user
});

app.get("/blogs", (request, response) => {
  response.sendFile(path.join(__dirname, "Blog", "blog.html"));
});

app.get("/blogs/:id", (request, response) => {
  response.sendFile(path.join(__dirname, "Blog", "blog_details.html"));
});

app.use("/api", (request, response) => {
  response.status(404).json({ error: "API route not found." });
});

app.use((error, request, response, next) => {
  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return response.status(400).json({ error: "Request body contains invalid JSON." });
  }
  console.error(error);
  response.status(500).json({ error: "Internal server error." });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Blog development server running at http://localhost:${PORT}`));
}

module.exports = { app, blogs };
