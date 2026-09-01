// Sample data for MongoDB
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { connectDatabase } = require("../database");
const { User } = require("../models/user");
const { Discussion } = require("../models/discussion");
const { Reply } = require("../models/reply");

async function seedDatabase() {
  await connectDatabase();

  const existingUsers = await User.find({});
  const existingDiscussions = await Discussion.find({});
  const existingReplies = await Reply.find({});

  if (
    existingUsers.length > 0 ||
    existingDiscussions.length > 0 ||
    existingReplies.length > 0
  ) {
    console.log("Seed stopped: the database already contains data.");
    await mongoose.connection.close();
    return;
  }

  const datPasswordSalt = await bcrypt.genSalt();
  const datPasswordHash = await bcrypt.hash("ConnectDemo!26", datPasswordSalt);

  const jayPasswordSalt = await bcrypt.genSalt();
  const jayPasswordHash = await bcrypt.hash("StudentDemo!26", jayPasswordSalt);

  const kimPasswordSalt = await bcrypt.genSalt();
  const kimPasswordHash = await bcrypt.hash("LockedDemo!26", kimPasswordSalt);

  const datCreatedAt = new Date("2026-08-02T09:00:00");

  const datUser = new User({
    username: "dat.pham",
    studentId: "S4221230",
    name: "Dat Pham",
    email: "s4221230@rmit.edu.vn",
    passwordHash: datPasswordHash,
    description: "RMIT Connect administrator and student community organiser.",
    avatarUrl: "/images/user_icon.png",
    course: "Bachelor of Business",
    role: "admin",
    status: "active",
    lastActiveAt: new Date("2026-08-19T11:05:00+07:00"),
    createdAt: datCreatedAt,
    updatedAt: datCreatedAt,
  });

  const jayCreatedAt = new Date("2026-08-03T10:00:00");

  const jayUser = new User({
    username: "jay.nguyen",
    studentId: "S4217847",
    name: "Jay Nguyen",
    email: "s4217847@rmit.edu.vn",
    passwordHash: jayPasswordHash,
    description: "Student member interested in workshops and campus events.",
    avatarUrl: "/images/user_icon.png",
    course: "Master of Data Science",
    role: "member",
    status: "active",
    lastActiveAt: new Date("2026-08-19T10:42:00+07:00"),
    createdAt: jayCreatedAt,
    updatedAt: jayCreatedAt,
  });

  const kimCreatedAt = new Date("2026-08-01T08:00:00");

  const kimUser = new User({
    username: "kim.seung-uk",
    studentId: "S4028530",
    name: "Kim SeungUk",
    email: "s4028530@rmit.edu.vn",
    passwordHash: kimPasswordHash,
    description: "Student member whose demonstration account is locked.",
    avatarUrl: "/images/user_icon.png",
    course: "Bachelor of Information Technology",
    role: "member",
    status: "locked",
    lastActiveAt: new Date("2026-08-19T10:30:00+07:00"),
    lockedAt: new Date("2026-08-20T09:00:00+07:00"),
    createdAt: kimCreatedAt,
    updatedAt: kimCreatedAt,
  });

  const htmlHelpDiscussionCreatedAt = new Date("2026-08-19T10:30:00+07:00");

  const htmlHelpDiscussion = new Discussion({
    title: "Where can I get help with HTML and CSS?",
    content:
      "I am new to web programming. Is there a beginner-friendly workshop where I can practice HTML and CSS with other students?",
    image: "/images/peer-workshop.jpg",
    authorId: kimUser._id,
    createdAt: htmlHelpDiscussionCreatedAt,
    updatedAt: htmlHelpDiscussionCreatedAt,
  });

  const quietStudyDiscussionCreatedAt = new Date("2026-08-18T16:15:00+07:00");

  const quietStudyDiscussion = new Discussion({
    title: "Where is a quiet place to study on campus?",
    content:
      "I am new to RMIT and do not know the campus well. Is there a quiet study area with charging points?",
    image: "/images/RMIT_campus.png",
    authorId: datUser._id,
    createdAt: quietStudyDiscussionCreatedAt,
    updatedAt: quietStudyDiscussionCreatedAt,
  });

  const saigonViewDiscussionCreatedAt = new Date("2026-08-16T09:00:00+07:00");

  const saigonViewDiscussion = new Discussion({
    title: "Where can I see a good night view of Saigon?",
    content:
      "I am new to Ho Chi Minh City and want to explore the city this weekend. Can anyone recommend a safe place to see the Saigon skyline at night?",
    image: "/images/saigonview.jpg",
    authorId: jayUser._id,
    createdAt: saigonViewDiscussionCreatedAt,
    updatedAt: saigonViewDiscussionCreatedAt,
  });

  const peerWorkshopReplyCreatedAt = new Date("2026-08-19T10:42:00+07:00");

  const peerWorkshopReply = new Reply({
    title: "Peer workshop",
    content:
      "The peer workshop is beginner-friendly. Student mentors can help you with basic HTML and CSS exercises.",
    image: "/images/peer-workshop.jpg",
    authorId: jayUser._id,
    discussionId: htmlHelpDiscussion._id,
    createdAt: peerWorkshopReplyCreatedAt,
    updatedAt: peerWorkshopReplyCreatedAt,
  });

  const upcomingEventsReplyCreatedAt = new Date("2026-08-19T11:05:00+07:00");

  const upcomingEventsReply = new Reply({
    title: "Upcoming Events",
    content:
      "You can check the Upcoming Events area for the next session. Bring your laptop if you want to practice.",
    image: "/images/RMIT_campus.png",
    authorId: datUser._id,
    discussionId: htmlHelpDiscussion._id,
    createdAt: upcomingEventsReplyCreatedAt,
    updatedAt: upcomingEventsReplyCreatedAt,
  });

  const libraryStudyReplyCreatedAt = new Date("2026-08-18T16:28:00+07:00");

  const libraryStudyReply = new Reply({
    title: "Library study area",
    content:
      "The library has quiet study areas and charging points. It can get busy in the afternoon.",
    image: "/images/RMIT_campus.png",
    authorId: kimUser._id,
    discussionId: quietStudyDiscussion._id,
    createdAt: libraryStudyReplyCreatedAt,
    updatedAt: libraryStudyReplyCreatedAt,
  });

  const bachDangWharfReplyCreatedAt = new Date("2026-08-16T09:15:00+07:00");

  const bachDangWharfReply = new Reply({
    title: "Bach Dang Wharf",
    content:
      "The area near Bach Dang Wharf has a clear view of the skyline. It is also a nice place for an evening walk.",
    image: "/images/saigonview.jpg",
    authorId: datUser._id,
    discussionId: saigonViewDiscussion._id,
    createdAt: bachDangWharfReplyCreatedAt,
    updatedAt: bachDangWharfReplyCreatedAt,
  });

  const landmark81ReplyCreatedAt = new Date("2026-08-16T09:42:00+07:00");

  const landmark81Reply = new Reply({
    title: "Landmark 81",
    content:
      "Landmark 81 has a high city view. Check the opening hours before you visit.",
    image: "/images/saigonview.jpg",
    authorId: kimUser._id,
    discussionId: saigonViewDiscussion._id,
    createdAt: landmark81ReplyCreatedAt,
    updatedAt: landmark81ReplyCreatedAt,
  });

  await datUser.save();
  await jayUser.save();
  await kimUser.save();

  await htmlHelpDiscussion.save();
  await quietStudyDiscussion.save();
  await saigonViewDiscussion.save();

  await peerWorkshopReply.save();
  await upcomingEventsReply.save();
  await libraryStudyReply.save();
  await bachDangWharfReply.save();
  await landmark81Reply.save();

  console.log("Sample data added to MongoDB.");
  await mongoose.connection.close();
}

seedDatabase().catch(async function (error) {
  console.error("Seed failed:", error);
  await mongoose.connection.close();
  process.exitCode = 1;
});
