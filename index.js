const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

function showHome(request, response) {
  response.render("index", { pageTitle: "RMIT Connect" });
}

function showDiscussions(request, response) {
  response.render("discussion", { pageTitle: "Discussion Forum" });
}

function showDiscussionDetail(request, response) {
  response.render("discussion-detail", {
    pageTitle: "Discussion Details",
  });
}

app.get("/", showHome);
app.get("/discussions", showDiscussions);
app.get("/discussions/:id", showDiscussionDetail);

function startServer() {
  console.log("RMIT Connect is running on http://localhost:" + port);
}

app.listen(port, startServer);
