const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

function showHome(request, response) {
  response.render("index", { pageTitle: "RMIT Connect" });
}

app.get("/", showHome);

function startServer() {
  console.log("RMIT Connect is running on http://localhost:" + port);
}

app.listen(port, startServer);
