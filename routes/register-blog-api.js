const { createBlogRouter, normaliseUser } = require("./blog-routes");

function registerBlogApi(app, { getCurrentUser }) {
  if (!app || typeof getCurrentUser !== "function") {
    throw new TypeError("registerBlogApi requires app and getCurrentUser.");
  }

  app.get("/api/current-user", async (request, response, next) => {
    try {
      const user = normaliseUser(await getCurrentUser(request));
      if (!user) {
        return response.status(401).json({ error: "You must log in first." });
      }
      response.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.use("/api/blogs", createBlogRouter({ getCurrentUser }));
}

module.exports = { registerBlogApi };