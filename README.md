# RMIT Connect — Assessment 3

RMIT Connect is an RMIT student-community web application developed for
COSC3060 Web Programming Studio. The final application builds on the team's
Assessment 1 HTML/CSS pages and Assessment 2 dynamic prototype with an
Express/Node.js server, shared user authentication and sessions, server-side
validation, CRUD workflows, image uploads, and persistent data stored in
MongoDB Atlas.

The active integration branch is `integrated-draft`. It should be tested through
the Node server; opening HTML files directly or using VS Code Live Server will
not run the EJS templates or APIs.

## Team responsibilities

| Student             | Student ID | Individual module       | Shared contributions                                                              |
| ------------------- | ---------- | ----------------------- | --------------------------------------------------------------------------------- |
| Kim SeungUk         | S4028530   | Discussion Forum        | Integration server, Forgot Password, Reset Password, Logout, Account Deactivation |
| Hoàng Hiểu Minh     | S4199268   | Blog                    | Reusable Blog API and shared-current-user adapter                                 |
| Nguyễn Đắc Gia Hưng | S4217847   | Ratings and Reviews     | Assessment 1 Profile/Registration foundations                                     |
| Phạm Trường Đạt     | S4221230   | Wishlist and Favourites | Login, Edit Profile, Administration, shared account API                           |

## Requirements

- Node.js 20 or newer
- npm, included with Node.js
- A modern browser such as Chrome, Edge, or Firefox
- Access to the approved MongoDB Atlas database
- A local `.env` file containing `MONGODB_URI` and `SESSION_SECRET`

A MongoDB Atlas connection is required for persistent application data. Store
the MongoDB connection string and session secret only in the local `.env` file.
Do not commit these values to GitHub or share them publicly.

## Installation

From the extracted or cloned project root containing `package.json`, install
the project dependencies:

```powershell
npm ci
```

Create a local `.env` file in the project root:

```text
MONGODB_URI=your_authorized_mongodb_connection_string
SESSION_SECRET=your_local_session_secret
```

Ask for the authorized values through a private team channel. Do not commit the
real values to GitHub.

To add the controlled sample Users, Discussions, and Replies to a new empty
database, run:

```powershell
node scripts/seed.js
```

Run the seed script only when preparing an empty database. It stops without
adding data if any target collection already contains documents.

Start the application:

```powershell
npm start
```

Confirm that `Connected to MongoDB` appears before the local website address,
then open `http://localhost:3000`. Use `npm install` instead of `npm ci` only
when intentionally updating the dependency lockfile. Stop the server with
`Ctrl+C`.

If port 3000 is already occupied in PowerShell:

```powershell
$env:PORT = 3001
npm start
```

Then visit `http://localhost:3001`.

## Demo accounts

| Purpose              | Username        | Password         | Role/status           |
| -------------------- | --------------- | ---------------- | --------------------- |
| Main demonstration   | `dat.pham`      | `ConnectDemo!26` | Administrator, active |
| Ownership testing    | `jay.nguyen`    | `StudentDemo!26` | Member, active        |
| Locked-login testing | `kim.seung-uk`  | `LockedDemo!26`  | Member, locked        |

These accounts are provided only for demonstration and testing. Their passwords
are hashed with `bcryptjs` and stored as one `passwordHash` string. Plain-text
passwords and password hashes are never returned by the API or stored in Web
Storage. The browser's “Remember username” option stores only the login
identity.

## Routes

### Pages

| Page                     | Route                                    |
| ------------------------ | ---------------------------------------- |
| Home and dynamic sitemap | `/` and `/sitemap`                       |
| Login                    | `/login.html`                            |
| Edit Profile             | `/editprofile.html`                      |
| Administration           | `/admin.html`                            |
| Discussion Forum         | `/discussions`                           |
| Discussion detail        | `/discussions/:id`                       |
| Blog                     | `/blogs`                                 |
| Blog detail              | `/blogs/:id`                             |
| Create Review            | `/reviews`                               |
| Browse Reviews           | `/reviews/browse`                        |
| Review detail/edit       | `/reviews/:id` and `/reviews/:id/edit`   |
| Wishlist and Favourites  | `/wishlist`                              |
| Browse Wishlist items    | `/wishlist/add`                          |
| Password assistance      | `/forgot-password` and `/reset-password` |
| Account deactivation     | `/deactivate-account`                    |
| Logout                   | `/logout`                                |

The Review pages are dynamic EJS templates in `views/`, rather than duplicated
static `.html` files. Compatibility redirects preserve the old Assessment 1
addresses such as `/review/review-detail.html?id=2`.

### Main APIs

| Resource       | Methods and routes                                                                     |
| -------------- | -------------------------------------------------------------------------------------- |
| Session        | `GET/POST/DELETE /api/session`                                                         |
| Products       | `GET /api/products`                                                                    |
| Wishlist       | `GET/POST /api/wishlist`, `PATCH/DELETE /api/wishlist/:productId`                      |
| Profile        | `GET/PATCH /api/profile`                                                               |
| Administration | `GET /api/admin/users`, `PATCH /api/admin/users/:userId/status`                        |
| Blog           | `GET/POST /api/blogs`, `GET/PUT/DELETE /api/blogs/:id`, `POST /api/blogs/:id/comments` |
| Reviews        | `GET/POST /api/reviews`, `GET/PUT/DELETE /api/reviews/:id`                             |

Discussion and Reply mutations use normal HTML form routes under
`/discussions`. The server derives every owner from the signed-in session; it
does not accept a client-selected user ID as authority.

## Module behaviour

- **Discussion Forum:** MongoDB-backed Discussions and Replies, author-only
  editing and soft deletion, required JPEG and PNG image uploads, live form
  validation, title and content filtering, newest and oldest sorting, and local
  draft restoration.
- **Blog:** dynamic posts and comments, owner-only editing/deletion, live
  validation, category filtering, full-text search, sorting, per-user drafts,
  and optional image data.
- **Ratings and Reviews:** dynamic review CRUD, signed-in reviewer identity,
  course-code and rating validation, search/filter/sort, per-user drafts, and
  optional image data.
- **Wishlist and Favourites:** product retrieval, client-side
  search/filter/sort, duplicate prevention, adding, cart transitions,
  purchasing, deletion, and per-user summary counts.
- **Shared account:** `bcryptjs` password verification, signed session cookies,
  profile editing, password changes, account locking, logout, reset workflow,
  and administrator-only account management.

## Data model

The Discussion Forum stores Users, Discussions, and Replies in MongoDB Atlas.
`Discussion.authorId`, `Reply.authorId`, and `Reply.discussionId` use MongoDB
ObjectId values to represent authorship and relationships. Uploaded image files
are stored in `public/uploads`, while MongoDB stores their public paths.

Forum sample data is provided by `scripts/seed.js`. The script adds 3 Users,
3 Discussions, and 5 Replies only when all three target collections are empty.
Soft-deleted Discussions and Replies remain in MongoDB with `deletedAt` and
`deletedBy` values but are excluded from public Forum pages.

The current Forum routes match the logged-in Account session to the MongoDB User
through `studentId`. Creating, editing, or deleting a Discussion or Reply updates
that User's `lastActiveAt` and `updatedAt` values. The dynamic Sitemap reads
active Discussion records from MongoDB.

Shared Account functions and some other team modules currently continue using
their existing runtime data stores. Restarting Node does not remove MongoDB
Discussion Forum data, but it resets in-memory sessions and module data.

## Testing

Run the complete release gate from the project root:

```powershell
npm run check
```

Or run its stages separately:

```powershell
npm test
node tests/static-check.js
npm --prefix modules/account test
```

The root integration suite checks installation-facing routes, shared sessions,
security headers, controlled JSON errors, Blog/Review/Forum/Wishlist workflows,
validation, ownership, images, and legacy Review redirects. The nested account
suite checks authentication, Wishlist, Profile, and Administration in greater
detail.

Forum integration tests require the configured MongoDB connection, Atlas
Network Access, and the seeded Dat and Jay User documents. The tests create
temporary Discussions, Replies, and uploaded image files, then remove them
after the checks finish. The latest verified result is 8 shared integration
tests and 10 Account tests passed.

Manual browser verification should include:

1. Login as Dat and visit every module through the header.
2. Exercise create/edit/delete and a forbidden cross-user operation.
3. Confirm live validation and draft restoration.
4. Test at approximately 375 px width and at 200% zoom.
5. Check the browser console for errors.

## Security and prototype boundaries

- Session cookies are HTTP-only and use `SameSite=Lax`.
- A non-default `SESSION_SECRET` is required in production mode.
- API responses are marked `Cache-Control: no-store`.
- Common browser security headers are applied before module routes.
- Server validation is authoritative; browser validation provides immediate
  feedback but is never trusted alone.
- User-generated output is escaped or constructed through safe DOM APIs.
- Blog and Review image payloads are limited to supported image types and a
  maximum decoded size of 4 MB.
- New Discussion and Reply uploads accept JPEG and PNG files up to 5 MB.
  Uploaded Forum files are stored in `public/uploads`, while MongoDB stores
  only their public paths.

## AI acknowledgement

This README was generated with assistance from OpenAI Codex and verified by
Dat Pham. Dat Pham accepts responsibility for checking its accuracy before the
team submits the project.

OpenAI Codex also assisted with the `integrated-draft` repair through
implementation guidance, debugging, documentation, and testing. Each team
member remains responsible for reviewing and understanding the work they submit
and for accurately declaring their own AI use under the course requirements.

============================================================================

### SeungUk Kim (s4028530)

**Individual Module: Discussion Forum**

**Shared User Account contribution: Forgot Pasword, Reset Password, Logout, Account Deactivation.**

**Discussion Forum features**

- Create, view, edit, and soft delete Discussions in MongoDB.
- Create, edit, and soft delete Replies in MongoDB.
- Upload required JPEG and PNG images for new Discussions and Replies.
- Keep the existing image when editing without selecting a new file.
- Filter by the original Discussion title or by Discussion and active Reply content.
- Sort by the newest active Discussion or Reply, or by the oldest original Discussion.
- Save a new Discussion draft using `localStorage`.
- Allow active logged-in authors to edit or delete only their own content.
- Open the compact post form from the Start a discussion button.
- Keep the Reply composer visible near the bottom of the Discussion detail page.
- Open the hidden Reply image input through the plus icon.
- Show `Post deleted successfully.` after a Discussion is deleted.

**Key routes**

- `GET/POST /discussions`
- `GET /discussions/:id`
- `GET/POST /discussions/:id/edit`
- `POST /discussions/:id/delete`
- `POST /discussions/:id/replies`
- `GET/POST /discussions/:id/replies/:replyId/edit`
- `POST /discussions/:id/replies/:replyId/delete`
- `GET/POST /forgot-password`
- `GET/POST /reset-password`
- `GET /logout`
- `GET/POST /deactivate-account`
- `GET /deactivated-success`

**Main files**

- `database.js` for the MongoDB connection.
- `upload.js` for JPEG and PNG upload validation.
- `models/user.js`
- `models/discussion.js`
- `models/reply.js`
- `scripts/seed.js`
- `index.js` for Forum and shared account route handlers.
- `forum-data.js` for the temporary in-memory Account user adapter only.
- `views/discussion.ejs`
- `views/discussion-detail.ejs`
- `views/discussion-edit.ejs`
- `views/reply-edit.ejs`
- `views/forgotpassword.ejs`
- `views/resetpassword.ejs`
- `views/logout.ejs`
- `views/deactivate-id.ejs`
- `views/deactivated-success.ejs`
- `public/css/discussion.css`
- `public/js/discussion.js`
- `public/js/discussion-detail.js`
- `public/js/edit-form.js`
- `public/js/forgotpassword.js`
- `public/js/resetpassword.js`
- `public/js/deactivate.js`
- `public/images/icons/plus.png`
- `public/uploads/.gitkeep`

### AI assistance acknowledgement

- **Review and code inspection:** Spelling and grammar review, code review, and comment suggestions.
- **Debugging assistance:** Help with interpreting error messages and providing conceptual debugging guidance.
- **Implementation support:** Suggestions for implementation ideas and code explanations.
- **README and translation assistance:** Help with organising and writing parts of the README.

============================================================================

### Nguyen Dac Gia Hung (s4217847)

**Indiviual Module: Ratings and Review**

**Shared User Account contribution: Account Creation (Unfinished)**

**Ratings and Reviews Features**
- Create, view, edit and delete review posts
- Search and filter reviews in the browser 
- Allow active logged-in users to edit or delete only their own ratings

**Key Routes**
- `POST /reviews`
- `GET /reviews/:id`
- `GET /reviews/:id/edit`
- `POST /reviews/:id/edit`
- `POST /reviews/:id/delete`

**Main Files**
- `index.js`
- `review-data.js`
- `views/review.ejs`
- `views/review-detail.ejs`
- `views/review-edit.ejs`
- `views/reviews-browse.ejs`

### AI assistance acknowledgement

- **Review and code inspection:** Spelling and grammar review, code review, and comment suggestions.
- **Debugging assistance:** Help with interpreting error messages and providing conceptual debugging guidance.
- **Implementation support:** Suggestions for implementation ideas and code explanations.
- **README and translation assistance:** Help with organising and writing parts of the README.

============================================================================

### Hoang Hieu Minh (S4199268)

**Individual Module: Blog**

**Blog module features**
- Create, view blog list and blog post
- Edit and delete blogs (For author)
- Comment on a blog
- Search, filter, and sort posts on the blog list page
- Save and restore a blog draft using Web Storage

**Key routes**
- GET /blogs
- GET /blogs/:id
- GET /api/current-user
- GET /api/blogs
- POST /api/blogs
- GET /api/blogs/:id
- PUT /api/blogs/:id
- DELETE /api/blogs/:id
- POST /api/blogs/:id/comments

**Main files**
- Blog/blog.html
- Blog/blog_details.html
- Blog/styles.css
- Blog/blog.js
- routes/blog-routes.js
- routes/register-blog-api.js
- test/blog-api.test.js
- dev-server.js

### AI assistance acknowledgement:
- Review and code inspection: HTML, CSS, and JavaScript review, including spelling, grammar, code structure, and comment suggestions.
- Debugging assistance: Help with interpreting errors, identifying routing and validation issues, and suggesting fixes.
- Implementation support: Suggestions and explanations for Blog CRUD operations, comments, search, filtering, sorting, user ownership, and Web Storage drafts.
- Testing assistance: Help with creating and reviewing API tests for validation, ownership, CRUD operations, comments, and missing records
