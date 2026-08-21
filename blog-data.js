const blogs = [
  {
    id: "blog-001",
    title: "My first day at RMIT",
    category: "Student Life",
    tags: ["RMIT", "Orientation"],
    content: "My first day at RMIT was exciting and full of new experiences.",
    image: "/images/image-for-blog.png",
    authorId: "user-jay",
    authorName: "Jay Nguyen",
    authorSid: "S4217847",
    dateAdded: new Date().toISOString(),
    updatedAt: null,
    deleted: false,
    comments: [],
  },
];

module.exports = { blogs };
