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

module.exports = {
  users,
};
