const reviews = [
  {
    id: 1,
    userId: "user-kim",
    courseCode: "COSC1076",
    title: "Best intro course I've taken",
    description:
      "Clear structure from week one, approachable tutors during pracs, and assignments that tested understanding rather than memorisation.",
    rating: 5,
    reviewerName: "Kim Tran",
    imageUrl: "/images/review-placeholder.jpg",
    createdAt: "2026-07-12",
  },
  {
    id: 2,
    userId: "user-dat",
    courseCode: "BUSM1228",
    title: "Good content, heavy workload",
    description:
      "Interesting material overall, but the group assignment weighting felt heavy compared to the individual components.",
    rating: 4,
    reviewerName: "Dat Pham",
    imageUrl: "/images/review-placeholder.jpg",
    createdAt: "2026-07-09",
  },
  {
    id: 3,
    userId: "user-jay",
    courseCode: "DSGN1234",
    title: "Would not recommend this elective",
    description:
      "Lectures felt disorganised and feedback on assignments took over three weeks to come back, which made it hard to improve.",
    rating: 2,
    reviewerName: "Jay Nguyen",
    imageUrl: "/images/review-placeholder.jpg",
    createdAt: "2026-07-03",
  },
  {
    id: 4,
    userId: "user-kim",
    courseCode: "MKTG1001",
    title: "A lot of group work but worth it",
    description:
      "Three group projects across the semester was a lot, but the final showcase made the effort feel worthwhile in the end.",
    rating: 4,
    reviewerName: "Kim Tran",
    imageUrl: "/images/review-placeholder.jpg",
    createdAt: "2026-06-28",
  },
  {
    id: 5,
    userId: "user-dat",
    courseCode: "INFT2003",
    title: "Great tutors, confusing LMS setup",
    description:
      "Tutors were genuinely helpful in consult hours, but it took weeks to figure out where readings and submission links actually were.",
    rating: 3,
    reviewerName: "Dat Pham",
    imageUrl: "/images/review-placeholder.jpg",
    createdAt: "2026-06-22",
  },
  {
    id: 6,
    userId: "user-jay",
    courseCode: "DSGN2077",
    title: "Best elective I have taken so far",
    description:
      "Small class size meant real discussion every week, and the final project let me build something for my own portfolio.",
    rating: 5,
    reviewerName: "Jay Nguyen",
    imageUrl: "/images/review-placeholder.jpg",
    createdAt: "2026-06-15",
  },
];

let nextReviewId = 7;

function getReviewId() {
  const id = nextReviewId;
  nextReviewId += 1;
  return id;
}

module.exports = { reviews, getReviewId };
