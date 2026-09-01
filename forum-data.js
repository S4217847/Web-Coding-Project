// Sample data for A2. (Discussion Forum)

const users = [
  {
    _id: "user-kim",
    username: "Kim Tran",
    studentId: "S4028530",
    email: "s4028530@rmit.edu.vn",
    description: "Student member whose demonstration account is locked.",
    profileImage: "/images/user_icon.png",
    course: "Bachelor of Information Technology",
    accountStatus: "locked",
    createdAt: new Date("2026-08-01T08:00:00"),
  },
  {
    _id: "user-dat",
    username: "Dat Pham",
    studentId: "S4221230",
    email: "s4221230@rmit.edu.vn",
    description: "RMIT Connect administrator and student community organiser.",
    profileImage: "/images/user_icon.png",
    course: "Bachelor of Business",
    accountStatus: "active",
    createdAt: new Date("2026-08-02T09:00:00"),
  },
  {
    _id: "user-jay",
    username: "Jay Nguyen",
    studentId: "S4217847",
    email: "s4217847@rmit.edu.vn",
    description: "Student member interested in workshops and campus events.",
    profileImage: "/images/user_icon.png",
    course: "Master of Data Science",
    accountStatus: "active",
    createdAt: new Date("2026-08-03T10:00:00"),
  },
];

const discussions = [
  {
    _id: "discussion-1",
    title: "Where can I get help with HTML and CSS?",
    content:
      "I am new to web programming. Is there a beginner-friendly workshop where I can practice HTML and CSS with other students?",
    image: "/images/peer-workshop.jpg",
    authorId: "user-kim",
    createdAt: new Date("2026-08-19T10:30:00"),
    deletedAt: null,
    deletedBy: null,
  },
  {
    _id: "discussion-2",
    title: "Where is a quiet place to study on campus?",
    content:
      "I am new to RMIT and do not know the campus well. Is there a quiet study area with charging points?",
    image: "/images/RMIT_campus.png",
    authorId: "user-dat",
    createdAt: new Date("2026-08-18T16:15:00"),
    deletedAt: null,
    deletedBy: null,
  },
  {
    _id: "discussion-3",
    title: "Where can I see a good night view of Saigon?",
    content:
      "I am new to Ho Chi Minh City and want to explore the city this weekend. Can anyone recommend a safe place to see the Saigon skyline at night?",
    image: "/images/saigonview.jpg",
    authorId: "user-jay",
    createdAt: new Date("2026-08-16T09:00:00"),
    deletedAt: null,
    deletedBy: null,
  },
];

const replies = [
  {
    _id: "reply-1",
    title: "Peer workshop",
    content:
      "The peer workshop is beginner-friendly. Student mentors can help you with basic HTML and CSS exercises.",
    image: "/images/peer-workshop.jpg",
    authorId: "user-jay",
    discussionId: "discussion-1",
    createdAt: new Date("2026-08-19T10:42:00"),
    deletedAt: null,
    deletedBy: null,
  },
  {
    _id: "reply-2",
    title: "Upcoming Events",
    content:
      "You can check the Upcoming Events area for the next session. Bring your laptop if you want to practice.",
    image: "/images/RMIT_campus.png",
    authorId: "user-kim",
    discussionId: "discussion-1",
    createdAt: new Date("2026-08-19T11:05:00"),
    deletedAt: null,
    deletedBy: null,
  },
  {
    _id: "reply-3",
    title: "Library study area",
    content:
      "The library has quiet study areas and charging points. It can get busy in the afternoon.",
    image: "/images/RMIT_campus.png",
    authorId: "user-kim",
    discussionId: "discussion-2",
    createdAt: new Date("2026-08-18T16:28:00"),
    deletedAt: null,
    deletedBy: null,
  },
  {
    _id: "reply-4",
    title: "Bach Dang Wharf",
    content:
      "The area near Bach Dang Wharf has a clear view of the skyline. It is also a nice place for an evening walk.",
    image: "/images/saigonview.jpg",
    authorId: "user-dat",
    discussionId: "discussion-3",
    createdAt: new Date("2026-08-16T09:15:00"),
    deletedAt: null,
    deletedBy: null,
  },
  {
    _id: "reply-5",
    title: "Landmark 81",
    content:
      "Landmark 81 has a high city view. Check the opening hours before you visit.",
    image: "/images/saigonview.jpg",
    authorId: "user-kim",
    discussionId: "discussion-3",
    createdAt: new Date("2026-08-16T09:42:00"),
    deletedAt: null,
    deletedBy: null,
  },
];

let nextDiscussionId = 4;
let nextReplyId = 6;

function getDiscussionId() {
  const id = "discussion-" + nextDiscussionId;
  nextDiscussionId += 1;
  return id;
}

function getReplyId() {
  const id = "reply-" + nextReplyId;
  nextReplyId += 1;
  return id;
}

module.exports = {
  users,
  discussions,
  replies,
  getDiscussionId,
  getReplyId,
};
