const { createBlogRouter, normaliseUser } = require("./blog-routes");

/**
 * Mounts Blog API routes on the team's existing Express app.
 * This module deliberately does not create an app or call app.listen().
 */
function registerBlogApi(app, { blogs, getCurrentUser }) {
  if (!app || !Array.isArray(blogs) || typeof getCurrentUser !== "function") {
    throw new TypeError("registerBlogApi requires app, blogs, and getCurrentUser.");
  }

  app.get("/api/current-user", async (request, response, next) => {
    try {
      const user = normaliseUser(await getCurrentUser(request));
      if (!user) return response.status(401).json({ error: "You must log in first." });
      response.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/blogs", createBlogRouter({ blogs, getCurrentUser }));
}

module.exports = { registerBlogApi };
