# RMIT Connect — Assessment 3

RMIT Connect is an RMIT student-community web application developed for
COSC3060 Web Programming Studio. It builds on the team's Assessment 1 HTML/CSS
pages and Assessment 2 Express prototype with authenticated sessions,
server-side validation, CRUD workflows, image uploads, and MongoDB persistence.

Persistence is being integrated by module. Dat's Assignment 3 work stores the
shared Account, Administration, Wishlist, catalogue, purchase-history, and
password-reset records in MongoDB. Kim's Discussion Forum also stores its
Discussions and Replies in MongoDB and shares the same User records. The Blog
and Ratings and Reviews modules still use their Assessment 2 in-memory stores;
this README does not claim that those teammate modules are MongoDB-backed.

The active integration branch is `integrated-draft`. It should be tested through
the Node server; opening HTML files directly or using VS Code Live Server will
not run the EJS templates or APIs.

- Source repository: <https://github.com/S4217847/Web-Coding-Project>
- Live website: pending the team's hosting decision. Replace this line with the
  final public URL and smoke-test it against Atlas before submission.

## Team responsibilities

| Student             | Student ID | Individual module       | Shared contributions                                                              |
| ------------------- | ---------- | ----------------------- | --------------------------------------------------------------------------------- |
| Kim SeungUk         | S4028530   | Discussion Forum        | Integration server, Forgot Password, Reset Password, Logout, Account Deactivation |
| Hoàng Hiểu Minh     | S4199268   | Blog                    | Reusable Blog API and shared-current-user adapter                                 |
| Nguyễn Đắc Gia Hưng | S4217847   | Ratings and Reviews     | Assessment 1 Profile/Registration foundations                                     |
| Phạm Trường Đạt     | S4221230   | Wishlist and Favourites | Login, Registration, Edit Profile, Administration, shared account API             |

## Requirements

- Node.js 20.19.0 or newer
- npm, included with Node.js
- A modern browser such as Chrome, Edge, or Firefox
- Access to the approved MongoDB Atlas database
- A local `.env` file based on `.env.example`

A MongoDB Atlas connection is required when running the application normally.
The automated database tests use a temporary local test server instead. Store
the Atlas connection string and session secret only in the local `.env` file.
Do not commit those values to GitHub or share them publicly.

## Installation

From the extracted or cloned project root containing `package.json`, install
the project dependencies:

```powershell
npm ci
```

### Quick local demonstration (no Atlas account)

To run the complete application against a private disposable database:

```powershell
npm run start:local
```

The first run downloads a MongoDB test binary and may take several minutes.
When startup finishes, open `http://localhost:3000`. The command creates an
isolated replica set, prepares the sample data, and never contacts the team's
Atlas database. Press `Ctrl+C` to stop it; its temporary records are deleted.

### Normal Atlas setup

Copy the documented template, then edit the new local file:

```powershell
Copy-Item .env.example .env
```

```text
MONGODB_URI=mongodb+srv://APP_USER:APP_PASSWORD@CLUSTER_HOST/?retryWrites=true&w=majority
MONGODB_DB_NAME=rmit_connect
SESSION_SECRET=replace-with-at-least-32-random-characters
SHOW_DEMO_RESET_LINK=false
```

`rmit_connect` is the default database name. A different isolated database can
be selected with `MONGODB_DB_NAME`. Ask for Atlas access and credentials through
a private team channel; `.env.example` deliberately contains no working secret.

Prepare the controlled sample Users, Products, Wishlist entries, Purchases,
Discussions, and Replies:

```powershell
node scripts/seed.js
```

The seed is idempotent: it inserts missing records by stable identities and
preserves existing user-written records, so it is safe to run again. Demo
passwords are hashed before insertion; plaintext passwords are not stored in
MongoDB.

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
| Register                 | `/register.html`                         |
| Profile                  | `/profile.html`                          |
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
| Registration   | `POST /api/users`                                                                      |
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
- **Wishlist and Favourites:** MongoDB-backed product retrieval, client-side
  search/filter/sort, duplicate prevention, adding, cart transitions,
  purchasing, deletion, and per-user summary counts.
- **Shared account:** MongoDB-backed registration, `bcryptjs` password
  verification, signed session cookies, profile editing, password changes,
  account locking, logout, a one-time reset-token workflow, and
  administrator-only account management.

Public sign-in/registration/password-recovery endpoints are rate-limited.
Passwords are limited to bcrypt's 72 UTF-8-byte boundary, and password or
account-status changes invalidate older sessions through a stored
`authVersion` counter.

## Data model

The integrated MongoDB collections are `users`, `products`, `wishlistentries`,
`purchases`, `passwordresettokens`, `discussions`, and `replies`. Relationships
are stored as ObjectId references: Wishlist entries, Purchases, Discussions,
Replies, and reset tokens point to their owning User; Wishlist entries and
Purchases point to a Product; and Replies point to a Discussion.

Indexes express both correctness rules and common query paths. Username,
student ID, email, and product slug are unique. A compound unique index on
`wishlistentries(userId, productId)` prevents duplicate live Wishlist/cart
entries. Status/date indexes support the Wishlist and Administration screens,
text indexes support product and user search, and the reset-token expiry index
lets MongoDB remove expired token records automatically. Purchases remain
append-only history and snapshot the item name and price at purchase time.

Dat's Account and Wishlist routes read and write these shared MongoDB records.
Forum authorship now uses the same User ObjectId rather than a second account
store. Forum soft-deleted Discussions and Replies remain in MongoDB with
deletion metadata but are excluded from normal pages. Avatar and Forum image
files are still stored on local disk; MongoDB stores their public paths.

Blog posts/comments and Ratings and Reviews remain in their existing in-memory
stores and reset when the Node process restarts. Local development sessions also
use Express MemoryStore and therefore end on restart. When `NODE_ENV=production`,
sessions are stored in MongoDB's `sessions` collection through `connect-mongo`.

## Testing

Run the complete release gate from the project root:

```powershell
npm run check
```

Or run its stages separately:

```powershell
npm test
npm run test:db
node tests/static-check.js
npm --prefix modules/account test
```

`npm run test:db` is the dedicated MongoDB Account/Wishlist integration suite.
The complete `npm run check` gate includes static checks, root integration
tests, the original Account regression suite, and database tests. Automated
tests use an isolated temporary MongoDB instance and do not read or alter the
team Atlas database. Do not quote a pass count in reports until the command has
been run on the exact submitted commit.

Manual browser verification should include:

1. Login as Dat and visit every module through the header.
2. Exercise create/edit/delete and a forbidden cross-user operation.
3. Confirm live validation and draft restoration.
4. Test at approximately 375 px width and at 200% zoom.
5. Check the browser console for errors.

## Security and prototype boundaries

- Session cookies are HTTP-only and use `SameSite=Lax`.
- A non-default `SESSION_SECRET` is required in production mode.
- Local development uses MemoryStore; production mode uses the MongoDB-backed
  `sessions` collection. Neither mode stores credentials in the browser cookie.
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
- Password-reset records contain a SHA-256 token digest, not the usable token,
  and expire after 20 minutes. Because the assessment has no email provider,
  local development shows a demonstration reset link. A public deployment must
  keep `SHOW_DEMO_RESET_LINK=false` and deliver the link privately.
- Working Atlas credentials, session secrets, real-user plaintext passwords,
  usable reset tokens, and password hashes must never be committed or exposed
  by an API. The documented sample account values are non-secret test fixtures.

## AI acknowledgement

This README was generated with assistance from OpenAI Codex and verified by
Dat Pham. Teammate-authored declarations below remain each teammate's own
responsibility.

OpenAI Codex assisted with implementation guidance. Dat Pham wrote and verified
the implementation.

### Pham Truong Dat (S4221230)

**Individual module:** Wishlist and Favourites

**Shared User Account contribution:** Login, Registration, Edit Profile, and
Administration

**Assignment 3 MongoDB scope:**

- Persistent Users, Products, Wishlist/cart entries, Purchases, and one-time
  Password Reset Tokens.
- Session-derived ownership and administrator authorization for all protected
  Account and Wishlist operations.
- Idempotent sample-data seeding, schema validation, unique/query/text/TTL
  indexes, safe public-user projections, and duplicate-key error handling.
- MongoDB integration for the existing Login, Register, Profile,
  Administration, Wishlist, catalogue, purchase, and reset workflows.

The Discussion Forum's MongoDB implementation belongs to Kim. Dat's shared User
work lets the Forum refer to the same User ObjectIds. The Blog and Ratings and
Reviews persistence work is outside Dat's Assignment 3 scope.

============================================================================

### SeungUk Kim (s4028530)

**Individual Module: Discussion Forum**

**Shared User Account contribution: Forgot Password, Reset Password, Logout, Account Deactivation.**

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
- `models/user.js` and `modules/account/src/mongo-repository.js` for the shared
  MongoDB account identity used by Account, Administration, Wishlist, and Forum.
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

**Individual Module: Ratings and Reviews**

**Shared User Account contribution: Assessment 1 Account Creation foundation**

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
- `views/review-browse.ejs`

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
