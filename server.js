
const express = require("express");
const path = require("path");
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

let reviews = [
  {
    id: 1,
    userId: "1",
    courseCode: "COSC1076",
    title: "Best intro course I've taken",
    description: "Clear structure from week one, approachable tutors during pracs, and assignments that tested understanding rather than memorisation.",
    rating: 5,
    reviewerName: "Hung",
    imageUrl: "/review/images/review-placeholder.jpg",
    createdAt: "2026-07-12"
  },
  {
    id: 2,
    userId: "2",
    courseCode: "BUSM1228",
    title: "Good content, heavy workload",
    description: "Interesting material overall, but the group assignment weighting felt heavy compared to the individual components.",
    rating: 4,
    reviewerName: "Kim",
    imageUrl: "/review/images/review-placeholder.jpg",
    createdAt: "2026-07-09"
  },
  {
    id: 3,
    userId: "3",
    courseCode: "DSGN1234",
    title: "Would not recommend this elective",
    description: "Lectures felt disorganised and feedback on assignments took over three weeks to come back, which made it hard to improve.",
    rating: 2,
    reviewerName: "Dat",
    imageUrl: "/review/images/review-placeholder.jpg",
    createdAt: "2026-07-03"
  },
  {
    id: 4,
    userId: "1",
    courseCode: "MKTG1001",
    title: "A lot of group work but worth it",
    description: "Three group projects across the semester was a lot, but the final showcase made the effort feel worthwhile in the end.",
    rating: 4,
    reviewerName: "Priya",
    imageUrl: "/review/images/review-placeholder.jpg",
    createdAt: "2026-06-28"
  },
  {
    id: 5,
    userId: "2",
    courseCode: "INFT2003",
    title: "Great tutors, confusing LMS setup",
    description: "Tutors were genuinely helpful in consult hours, but it took weeks to figure out where readings and submission links actually were.",
    rating: 3,
    reviewerName: "Marcus",
    imageUrl: "/review/images/review-placeholder.jpg",
    createdAt: "2026-06-22"
  },
  {
    id: 6,
    userId: "3",
    courseCode: "DSGN2077",
    title: "Best elective I have taken so far",
    description: "Small class size meant real discussion every week, and the final project let me build something for my own portfolio.",
    rating: 5,
    reviewerName: "Sarah",
    imageUrl: "/review/images/review-placeholder.jpg",
    createdAt: "2026-06-15"
  }
];

let nextId = 7;

function getLoggedInUserId(req) {
  return "1";
}
function validateReviewBody(body) {
  const errors = {};

  if (!body.title || body.title.trim().length < 5) {
    errors.title = "Title is required and must be at least 5 characters.";
  }
  if (!body.description || body.description.trim().length < 20) {
    errors.description = "Description is required and must be at least 20 characters.";
  }
  const rating = Number(body.rating);
  if (!rating || rating < 1 || rating > 5) {
    errors.rating = "Rating must be a number between 1 and 5.";
  }
  if (!body.reviewerName || body.reviewerName.trim().length < 2) {
    errors.reviewerName = "Reviewer name is required.";
  }

  return errors;
}
app.get("/reviews", (req, res) => {
  res.json(reviews);
});
app.get("/reviews/:id", (req, res) => {
  const review = reviews.find(r => String(r.id) === req.params.id);
  if (!review) {
    return res.status(404).json({ error: "Review not found." });
  }
  res.json(review);
});
app.post("/reviews", (req, res) => {
  const errors = validateReviewBody(req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  const newReview = {
    id: nextId++,
    userId: getLoggedInUserId(req),
    courseCode: req.body.courseCode || "",
    title: req.body.title.trim(),
    description: req.body.description.trim(),
    rating: Number(req.body.rating),
    reviewerName: req.body.reviewerName.trim(),
    imageUrl: "/review/images/review-placeholder.jpg",
    createdAt: new Date().toISOString().slice(0, 10)
  };

  reviews.push(newReview);
  res.status(201).json(newReview);
});

app.put("/reviews/:id", (req, res) => {
  const review = reviews.find(r => String(r.id) === req.params.id);
  if (!review) {
    return res.status(404).json({ error: "Review not found." });
  }
  if (String(review.userId) !== String(getLoggedInUserId(req))) {
    return res.status(403).json({ error: "You can only edit your own reviews." });
  }

  const errors = validateReviewBody(req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  review.title = req.body.title.trim();
  review.description = req.body.description.trim();
  review.rating = Number(req.body.rating);
  review.reviewerName = req.body.reviewerName.trim();

  res.json(review);
});

app.delete("/reviews/:id", (req, res) => {
  const review = reviews.find(r => String(r.id) === req.params.id);
  if (!review) {
    return res.status(404).json({ error: "Review not found." });
  }
  if (String(review.userId) !== String(getLoggedInUserId(req))) {
    return res.status(403).json({ error: "You can only delete your own reviews." });
  }

  reviews = reviews.filter(r => String(r.id) !== req.params.id);
  res.status(204).send();
});

app.listen(PORT, () => {
  console.log("Server running at http://localhost:" + PORT);
});
