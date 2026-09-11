/**
 * Idempotent sample-data seed for the integrated Assignment 3 database.
 * Existing records are preserved; missing demo records are inserted safely.
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const { connectDatabase } = require("../database");
const {
  User,
  Product,
  WishlistEntry,
  Purchase,
  Discussion,
  Reply,
  Review,
} = require("../models");
const { Blog, BlogComment } = require("../models/blog");
const { reviews: demoReviews } = require("../review-data");

const demoUsers = [
  {
    username: "dat.pham",
    studentId: "S4221230",
    name: "Dat Pham",
    email: "s4221230@rmit.edu.vn",
    password: "ConnectDemo!26",
    description: "RMIT Connect administrator and student community organiser.",
    course: "Bachelor of Business",
    role: "admin",
    status: "active",
    lastActiveAt: new Date("2026-08-19T11:05:00+07:00"),
  },
  {
    username: "jay.nguyen",
    studentId: "S4217847",
    name: "Jay Nguyen",
    email: "s4217847@rmit.edu.vn",
    password: "StudentDemo!26",
    description: "Student member interested in workshops and campus events.",
    course: "Master of Data Science",
    role: "member",
    status: "active",
    lastActiveAt: new Date("2026-08-19T10:42:00+07:00"),
  },
  {
    username: "kim.seung-uk",
    studentId: "S4028530",
    name: "Kim SeungUk",
    email: "s4028530@rmit.edu.vn",
    password: "LockedDemo!26",
    description: "Student member whose demonstration account is locked.",
    course: "Bachelor of Information Technology",
    role: "member",
    status: "locked",
    lastActiveAt: new Date("2026-08-19T10:30:00+07:00"),
    lockedAt: new Date("2026-08-20T09:00:00+07:00"),
  },
  {
    username: "inactive.demo",
    studentId: "S4999900",
    name: "Inactive Demo",
    email: "inactive.demo@rmit.edu.vn",
    password: "InactiveDemo!26",
    description: "Non-login sample used to demonstrate deactivated-account filtering.",
    course: "Bachelor of Information Technology",
    role: "member",
    status: "deactivated",
    lastActiveAt: new Date("2026-08-10T14:20:00+07:00"),
    deactivatedAt: new Date("2026-08-21T09:15:00+07:00"),
  },
  {
    username: "hoang.hieu.minh",
    studentId: "S4199268",
    name: "Hoang Hieu Minh",
    email: "s4199268@rmit.edu.vn",
    password: "BlogDemo!26",
    description: "Student member who is new.",
    course: "Bachelor of Information Technology",
    role: "member",
    status: "active",
    lastActiveAt: new Date("2026-08-19T10:30:00+07:00"),
    lockedAt: new Date("2026-08-20T09:00:00+07:00"),
  },
];

const demoProducts = [
  {
    slug: "peer-workshop",
    name: "Peer Coding Workshop Pass",
    category: "Workshop",
    description: "A Saturday peer-learning session for students who want help with HTML and CSS.",
    priceVnd: 30000,
    image: "/images/peer-workshop.jpg",
    imageAlt: "Students working together around laptops",
  },
  {
    slug: "drone-field-trip",
    name: "Drone Filming Field Trip",
    category: "Field Trip",
    description: "A supervised afternoon session covering safe drone setup and basic campus video shots.",
    priceVnd: 120000,
    image: "/images/connect-hoodie.jpg",
    imageAlt: "Student in a hoodie practising outdoor drone filming",
  },
  {
    slug: "music-night",
    name: "Student Music Night Ticket",
    category: "Event",
    description: "Entry to an evening of student bands, acoustic sets, and community performances.",
    priceVnd: 80000,
    image: "/images/design-market.jpg",
    imageAlt: "Audience members taking photos at a live music event",
  },
  {
    slug: "photo-walk",
    name: "Campus Photography Walk",
    category: "Club Activity",
    description: "A beginner-friendly photo walk through campus with equipment tips from the Photography Club.",
    priceVnd: 0,
    image: "/images/photo-walk.jpg",
    imageAlt: "Camera and lenses prepared for a photography activity",
  },
  {
    slug: "data-bootcamp",
    name: "Data Visualisation Bootcamp",
    category: "Short Course",
    description: "A practical evening session covering simple charts, dashboard planning, and presentation tips.",
    priceVnd: 95000,
    image: "/images/data-bootcamp.jpg",
    imageAlt: "Two students pointing at information on a laptop screen",
  },
];

async function ensureUsers() {
  const usersByStudentId = new Map();

  for (const input of demoUsers) {
    const { password, ...publicFields } = input;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.findOneAndUpdate(
      { studentId: input.studentId },
      {
        $setOnInsert: {
          ...publicFields,
          passwordHash,
          avatarUrl: "/images/user_icon.png",
        },
      },
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
    );
    usersByStudentId.set(user.studentId, user);
  }

  return usersByStudentId;
}

async function ensureProducts() {
  const productsBySlug = new Map();

  for (const input of demoProducts) {
    const product = await Product.findOneAndUpdate(
      { slug: input.slug },
      { $setOnInsert: { ...input, isActive: true } },
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
    );
    productsBySlug.set(product.slug, product);
  }

  return productsBySlug;
}

async function ensureWishlist(users, products) {
  const dat = users.get("S4221230");

  for (const slug of ["peer-workshop", "drone-field-trip", "photo-walk"]) {
    await WishlistEntry.updateOne(
      { userId: dat._id, productId: products.get(slug)._id },
      { $setOnInsert: { status: "saved", quantity: 1 } },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  await WishlistEntry.updateOne(
    { userId: dat._id, productId: products.get("music-night")._id },
    { $setOnInsert: { status: "cart", quantity: 1 } },
    { upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );

  const samples = [
    ["peer-workshop", "2026-07-24T04:30:00.000Z"],
    ["photo-walk", "2026-07-12T03:15:00.000Z"],
  ];

  for (const [slug, purchasedAt] of samples) {
    const product = products.get(slug);
    await Purchase.updateOne(
      { userId: dat._id, productId: product._id, purchasedAt: new Date(purchasedAt) },
      {
        $setOnInsert: {
          productName: product.name,
          unitPriceVnd: product.priceVnd,
          quantity: 1,
        },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }
}

async function ensureForum(users) {
  const dat = users.get("S4221230");
  const jay = users.get("S4217847");
  const kim = users.get("S4028530");
  const minh = users.get("S4199268");
  const discussionSamples = [
    {
      key: "html",
      title: "Where can I get help with HTML and CSS?",
      content: "I am new to web programming. Is there a beginner-friendly workshop where I can practice HTML and CSS with other students?",
      image: "/images/peer-workshop.jpg",
      authorId: kim._id,
      createdAt: new Date("2026-08-19T10:30:00+07:00"),
    },
    {
      key: "study",
      title: "Where is a quiet place to study on campus?",
      content: "I am new to RMIT and do not know the campus well. Is there a quiet study area with charging points?",
      image: "/images/RMIT_campus.png",
      authorId: dat._id,
      createdAt: new Date("2026-08-18T16:15:00+07:00"),
    },
    {
      key: "saigon",
      title: "Where can I see a good night view of Saigon?",
      content: "I am new to Ho Chi Minh City and want to explore the city this weekend. Can anyone recommend a safe place to see the Saigon skyline at night?",
      image: "/images/saigonview.jpg",
      authorId: jay._id,
      createdAt: new Date("2026-08-16T09:00:00+07:00"),
    },
  ];
  const discussions = new Map();

  for (const input of discussionSamples) {
    const { key, ...record } = input;
    const discussion = await Discussion.findOneAndUpdate(
      { title: record.title, authorId: record.authorId },
      { $setOnInsert: { ...record, updatedAt: record.createdAt } },
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true },
    );
    discussions.set(key, discussion);
  }

  const replySamples = [
    ["html", "Peer workshop", "The peer workshop is beginner-friendly. Student mentors can help you with basic HTML and CSS exercises.", "/images/peer-workshop.jpg", jay, "2026-08-19T10:42:00+07:00"],
    ["html", "Upcoming Events", "You can check the Upcoming Events area for the next session. Bring your laptop if you want to practice.", "/images/RMIT_campus.png", dat, "2026-08-19T11:05:00+07:00"],
    ["study", "Library study area", "The library has quiet study areas and charging points. It can get busy in the afternoon.", "/images/RMIT_campus.png", kim, "2026-08-18T16:28:00+07:00"],
    ["saigon", "Bach Dang Wharf", "The area near Bach Dang Wharf has a clear view of the skyline. It is also a nice place for an evening walk.", "/images/saigonview.jpg", dat, "2026-08-16T09:15:00+07:00"],
    ["saigon", "Landmark 81", "Landmark 81 has a high city view. Check the opening hours before you visit.", "/images/saigonview.jpg", kim, "2026-08-16T09:42:00+07:00"],
  ];

  for (const [discussionKey, title, content, image, author, dateText] of replySamples) {
    const discussionId = discussions.get(discussionKey)._id;
    const createdAt = new Date(dateText);
    await Reply.updateOne(
      { discussionId, title, authorId: author._id },
      { $setOnInsert: { content, image, createdAt, updatedAt: createdAt } },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }
}

async function ensureReviews(users) {
  const ownerStudentIds = {
    "user-kim": "S4028530",
    "user-dat": "S4221230",
    "user-jay": "S4217847",
    "user-minh": "S4199268",
  };

  for (const sample of demoReviews) {
    const owner = users.get(ownerStudentIds[sample.userId]);
    if (!owner) {
      throw new Error(`No MongoDB user exists for Review sample ${sample.id}.`);
    }

    const sampleDate = new Date(`${sample.createdAt}T00:00:00.000Z`);
    await Review.updateOne(
      { id: sample.id },
      {
        $setOnInsert: {
          userId: owner._id,
          courseCode: sample.courseCode,
          title: sample.title,
          description: sample.description,
          rating: sample.rating,
          reviewerName: owner.name,
          imageUrl: sample.imageUrl,
          createdAt: sampleDate,
          updatedAt: sampleDate,
        },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false },
    );
  }
}

// Fixed sample IDs prevent duplicates even if a sample title is later edited.
// Only missing records are inserted; edits and soft deletions are preserved.
async function ensureBlogs(users) {
  const blogSamples = [
    {
      id: "a3b100000000000000000001",
      studentId: "S4217847",
      title: "My first day at RMIT",
      category: "Student Life",
      tags: ["RMIT", "Orientation"],
      content: "My first day at RMIT was full of new experiences. Meeting classmates and exploring the campus helped me feel more confident about starting university.",
      date: "2026-08-16T03:00:00.000Z",
    },
    {
      id: "a3b100000000000000000002",
      studentId: "S4221230",
      title: "Preparing for a peer coding workshop",
      category: "Technology",
      tags: ["HTML", "CSS", "Workshop"],
      content: "Before joining a peer coding workshop, prepare a small HTML page and list the CSS problems you want to discuss. Bring your laptop and share your questions with student mentors.",
      date: "2026-08-18T03:00:00.000Z",
    },
    {
      id: "a3b100000000000000000003",
      studentId: "S4217847",
      title: "Building a weekly study routine",
      category: "Academic",
      tags: ["Study", "Planning"],
      content: "A weekly study routine helps me balance lectures and assignments. I reserve time for reading, coding practice, and reviewing feedback before planning the next week.",
      date: "2026-08-19T03:00:00.000Z",
    },
  ];

  for (const sample of blogSamples) {
    const owner = users.get(sample.studentId);
    if (!owner) {
      throw new Error(`No MongoDB user exists for Blog sample ${sample.id}.`);
    }
    const createdAt = new Date(sample.date);
    await Blog.updateOne(
      { _id: new mongoose.Types.ObjectId(sample.id) },
      {
        $setOnInsert: {
          title: sample.title,
          category: sample.category,
          tags: sample.tags,
          content: sample.content,
          image: "/images/image-for-blog.png",
          authorId: owner._id,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false },
    );
  }

  const commentSamples = [
    ["a3c100000000000000000001", blogSamples[0].id, "S4221230", "Welcome to RMIT! The campus tour is a useful way to meet other students.", "2026-08-16T04:00:00.000Z"],
    ["a3c100000000000000000002", blogSamples[1].id, "S4217847", "I will bring my CSS layout questions to the next workshop.", "2026-08-18T04:00:00.000Z"],
    ["a3c100000000000000000003", blogSamples[2].id, "S4221230", "Setting aside time to review feedback has helped my study routine too.", "2026-08-19T04:00:00.000Z"],
  ];

  for (const [id, blogId, studentId, content, dateText] of commentSamples) {
    const owner = users.get(studentId);
    if (!owner) {
      throw new Error(`No MongoDB user exists for Blog comment sample ${id}.`);
    }
    // Do not add missing sample comments to a blog that was soft-deleted.
    const blog = await Blog.findOne({
      _id: new mongoose.Types.ObjectId(blogId),
      deletedAt: null,
    }).select("_id");
    if (!blog) continue;

    const createdAt = new Date(dateText);
    await BlogComment.updateOne(
      { _id: new mongoose.Types.ObjectId(id) },
      {
        $setOnInsert: {
          blogId: blog._id,
          authorId: owner._id,
          content,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null,
        },
      },
      { upsert: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false },
    );
  }
}

async function seedDatabase({ connect = true } = {}) {
  if (connect) await connectDatabase();
  const users = await ensureUsers();
  const products = await ensureProducts();
  await ensureWishlist(users, products);
  await ensureForum(users);
  await ensureReviews(users);
  await ensureBlogs(users);
  console.log("MongoDB sample data is ready (safe to run again).");
}

if (require.main === module) {
  seedDatabase()
    .catch((error) => {
      console.error("Seed failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.connection.close();
    });
}

module.exports = {
  demoUsers,
  demoProducts,
  seedDatabase,
};
