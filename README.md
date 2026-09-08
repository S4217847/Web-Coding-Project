# RMIT Connect - Assessment 3

RMIT Connect is an RMIT student-community web application developed for
COSC3060 Web Programming Studio. It builds on the team's Assessment 1 HTML/CSS
pages and Assessment 2 dynamic prototype. The current integration includes an
Express/Node.js server, shared authentication and sessions, server-side
validation, CRUD workflows, and image uploads. The Discussion Forum and part
of the shared Account module use MongoDB Atlas. Other module data still uses
in-memory stores, so Assessment 3 integration is not complete.

The active integration branch is `integrated-draft`. It should be tested through
the Node server; opening HTML files directly or using VS Code Live Server will
not run the EJS templates or APIs.

GitHub repository: [Web-Coding-Project](https://github.com/S4217847/Web-Coding-Project).

## Team responsibilities

| Student             | Student ID | Individual module       | Shared contributions                                                              |
| ------------------- | ---------- | ----------------------- | --------------------------------------------------------------------------------- |
| Kim SeungUk         | S4028530   | Discussion Forum        | Integration server, Forgot Password, Reset Password, Logout, Account Deactivation |
| Hoàng Hiểu Minh     | S4199268   | Blog                    | Reusable Blog API and shared-current-user adapter                                 |
| Nguyễn Đắc Gia Hưng | S4217847   | Ratings and Reviews     | Assessment 1 Profile/Registration foundations                                     |
| Phạm Trường Đạt     | S4221230   | Wishlist and Favourites | Login, Edit Profile, Administration, shared account API                           |

## Requirements

- Node.js 20.19.0 or newer, as required by the Mongoose version in `package-lock.json`
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
  validation, browser-side title and content filtering, newest and oldest
  sorting, and local draft restoration.
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
  profile editing, password changes, account locking, logout, recovery-password
  reset workflow, account deactivation, and administrator-only account management.

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

Shared Account persistence is partly implemented. Login reads the MongoDB
credentials and account status. Profile email, login password, recovery password,
and lock/deactivation changes are saved to the shared `users` collection.
Account routes still need a matching runtime user with the same `studentId`.
Other Profile edits, such as name, description, and avatar, remain in memory.
Restarting Node preserves MongoDB data but clears in-memory sessions and the
runtime data used by the remaining modules. This is not a full Account migration.

Blog posts and comments, Reviews, products, Wishlist entries, cart state, and
purchase history still use in-memory stores. Their MongoDB migration is not
implemented in this branch.

See [the database schema](modules/account/docs/database-schema.md) for the
implemented collections, shared User fields, relationships, and planned indexes.

## Integration status and remaining work

- **Forum queries:** title/content filtering and newest/oldest sorting work in
  the browser. The server currently loads all active Discussions and their
  active Replies for the list. Database-side filtering/sorting and additional
  Forum compound indexes are not implemented yet.
- **Forum ownership and deletion:** edit/delete database updates include the
  author and active-record conditions. Replies under deleted Discussions are
  hidden, and Reply routes check that the parent Discussion is active.
  The parent check and Reply write are separate operations. Simultaneous
  Discussion deletion and Reply writes still need concurrency review.
- **Shared Account:** registration is unfinished. Complete the remaining
  Account persistence and align shared changes with the Account module owner.
- **Other modules:** migrate Blog, Reviews, and Wishlist data to MongoDB and
  test them through the shared application.
- **Atlas access:** confirm individual team access and database permissions.
  Keep development, test, and deployment configuration separate. Do not share
  personal Atlas logins or put connection credentials in the repository.

## Hosting status

- **Live website URL:** not available yet. Add the confirmed URL after deployment.
- **Planned provider:** Render. Repository access and the hosting plan still
  need to be confirmed with the team and repository owner.
- **Uploaded images:** files currently use the local `public/uploads` directory.
  Durable storage must be configured and verified on the host. Saving image
  paths in MongoDB does not store the image files themselves.
- **Hosted verification:** test Login, all modules, uploads, password recovery,
  deactivation, and persistence after a server restart or redeployment.

## Testing

### Test setup and data safety

Install dependencies with `npm ci`. Add `MONGODB_TEST_URI` to the local `.env`
file and allow the test computer through Atlas Network Access:

```text
MONGODB_TEST_URI=your_authorized_connection_string_for_rmit_connect_a3_test
```

The database name in that connection string must be exactly
`rmit_connect_a3_test`. Use a dedicated, empty, disposable test database.
Never use a development or production database connection string for tests.

**Warning:** the root integration suite deletes all documents in the test
database's `users`, `discussions`, and `replies` collections before and after
running. It also removes the uploaded files it creates. Do not put work that
must be kept in this database. Do not run these suites in parallel or share the
same test database with another person's running tests.

Recovery and Deactivation tests create their own temporary Users and remove
only those User IDs. All three root suites select `MONGODB_TEST_URI` rather
than the development `MONGODB_URI`.

### Commands

Run the complete release gate from the project root. It runs static checks,
shared integration, Recovery, Deactivation, and Account tests in that order:

```powershell
npm run check
```

To run all four test suites without the static checks:

```powershell
npm test
```

Run an individual stage when checking a specific area:

| Command | Checks |
| --- | --- |
| `node tests/static-check.js` | Page, JavaScript, and CSS checks. |
| `node --test tests/integration.test.js` | 8 tests covering routes, shared sessions, security headers, controlled JSON errors, module workflows, validation, ownership, images, and legacy Review redirects. |
| `npm run test:recovery` | 1 end-to-end test covering Profile setup, current email, password rules, single-use Reset access, failed-attempt blocking, stale sessions, concurrent changes, database errors, and persistence. |
| `npm run test:deactivation` | 1 end-to-end test covering confirmation, password checks, deactivated/locked account restrictions, stale sessions, persistence, and controlled database errors. |
| `npm --prefix modules/account test` | 10 Account tests covering authentication, Wishlist, Profile, and Administration. |

The Recovery and Deactivation commands use `--require dotenv/config` to load
the local `.env` before checking `MONGODB_TEST_URI`. They use the existing
`dotenv` dependency and do not need a separate helper file. A successful full
run reports 20 tests in total across the four suites. `npm test` runs them
sequentially and stops if a suite fails.

### Manual browser checks

For password recovery, use a disposable active account:

1. Login, open Edit Profile, and set a recovery password after confirming the
   current login password.
2. Logout, open Forgot Password, and enter the current email and recovery password.
3. Set a different login password through Reset Password within 10 minutes.
4. Check that the new login password works and the old login password fails.
   The consumed recovery password must not grant Reset access again.
5. Set a new recovery password, restart Node, and confirm that it is still
   available through Forgot Password. Reset access granted before the restart
   must no longer work because it was stored in the old in-memory session.

Manual browser verification should include:

1. Login as Dat and visit every module through the header.
2. Exercise create/edit/delete and a forbidden cross-user operation.
3. Confirm live validation and draft restoration.
4. Test at approximately 375 px width and at 200% zoom.
5. Check the browser console for errors.

## Security and prototype boundaries

- Session cookies are HTTP-only and use `SameSite=Lax`.
- Production startup requires `SESSION_SECRET` in the environment.
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
- Select a Reply image through the visible file input or the plus icon.
- Show `Post deleted successfully.` after a Discussion is deleted.
- Keep the Reply controls usable on narrow screens and show the correct
  Login or Logout link on Home and Sitemap for the current session.

**Password recovery features**

- A logged-in user can set or replace a recovery password from Edit Profile
  after confirming the current login password.
- The recovery password is stored only as a bcrypt hash in MongoDB.
- `POST /forgot-password` checks the account's current email and pre-set
  recovery password. It does not send an email.
- Successful verification creates server-side Reset access for 10 minutes.
  The browser does not choose the target user ID.
- `POST /reset-password` changes the MongoDB login password and consumes the
  recovery password in one conditional database update.
- A password, recovery password, lock, or deactivation change made after
  verification invalidates the earlier Reset access.
- Five failed recovery checks start a 15-minute recovery-only block stored in
  MongoDB. This does not change the account's `status` or lock normal Login.
- New login passwords use 8–64 printable ASCII characters without spaces.
  Recovery passwords use 12–64. Both require uppercase and lowercase letters
  and a number, keeping new bcrypt inputs below 72 bytes.
- Users who did not set a recovery password, or who forgot it, cannot use this
  recovery flow. The application does not provide an identity-check bypass.
- Relevant User fields are `passwordHash`, `passwordChangedAt`,
  `recoveryPasswordHash`, `recoveryPasswordSetAt`,
  `recoveryFailedAttempts`, `recoveryAttemptWindowStartedAt`, and
  `recoveryBlockedUntil`. Plain-text passwords are not stored.

**Logout and Account Deactivation features**

- Logout ends the shared session used by all modules.
- An active member can confirm account deactivation. Administrator accounts
  cannot use this action.
- Deactivation saves `status: "locked"`, `lockedAt`, and `deactivatedAt` in
  MongoDB, then ends the current session. It does not delete the User document.
- Login and protected routes reject the inactive account and older sessions.
  Restarting Node does not undo the saved deactivation.
- The success view is rendered after a successful deactivation. Opening
  `/deactivated-success` directly redirects to Login.

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
- `PATCH /api/profile` for setting or changing the recovery password.
- `GET /logout`
- `GET/POST /deactivate-account`
- `GET /deactivated-success`

**Main files**

- `database.js` for the MongoDB connection.
- `upload.js` for JPEG and PNG upload validation.
- `models/user.js`
- `modules/account/src/app.js` for MongoDB-backed Login and Profile changes.
- `modules/account/src/validation.js` for server-side password validation.
- `modules/account/public/editprofile.html`
- `modules/account/public/js/profile.js`
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
- `tests/integration.test.js`
- `tests/recovery-password-review.test.js`
- `tests/deactivation-review.test.js`

### AI assistance acknowledgement

Password recovery idea:
OpenAI Codex suggested using a recovery password set in advance instead of an email reset link.

OpenAI Codex also helped update the recovery database documentation and test
commands. These review-branch updates still require team review before merging.

- **Review and code inspection:** Spelling and grammar review, code review, and comment suggestions.
- **Debugging assistance:** Help with interpreting error messages and providing conceptual debugging guidance.
- **Implementation support:** Suggestions for implementation ideas and code explanations.
- **README and translation assistance:** Help with organising and writing parts of the README.

============================================================================

### Nguyen Dac Gia Hung (s4217847)

**Individual Module: Ratings and Reviews**

**Shared User Account contribution: Account Creation (Unfinished)**

**Ratings and Reviews Features**

- Create, view, edit and delete review posts
- Search, filter, and sort reviews in the browser
- Allow active logged-in users to edit or delete only their own ratings
- Store Reviews in memory for now. MongoDB persistence is unfinished.

**Key Routes**

- `GET /reviews`
- `GET /reviews/browse`
- `GET /reviews/:id`
- `GET /reviews/:id/edit`
- `GET/POST /api/reviews`
- `GET/PUT/DELETE /api/reviews/:id`

**Main Files**

- `index.js`
- `review-data.js`
- `views/review.ejs`
- `views/review-detail.ejs`
- `views/review-edit.ejs`
- `views/review-browse.ejs`
- `public/css/review.css`
- `public/js/review.js`
- `tests/integration.test.js`

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
- Store Blog posts and comments in memory for now. MongoDB persistence is unfinished.

**Key routes**

- `GET /blogs`
- `GET /blogs/:id`
- `GET /api/current-user`
- `GET/POST /api/blogs`
- `GET/PUT/DELETE /api/blogs/:id`
- `POST /api/blogs/:id/comments`

**Main files**

- `index.js`
- `blog-data.js`
- `views/blog.ejs`
- `views/blog-details.ejs`
- `public/css/blog.css`
- `public/js/blog.js`
- `routes/blog-routes.js`
- `routes/register-blog-api.js`
- `tests/integration.test.js`

### AI assistance acknowledgement:
- Review and code inspection: HTML, CSS, and JavaScript review, including spelling, grammar, code structure, and comment suggestions.
- Debugging assistance: Help with interpreting errors, identifying routing and validation issues, and suggesting fixes.
- Implementation support: Suggestions and explanations for Blog CRUD operations, comments, search, filtering, sorting, user ownership, and Web Storage drafts.
- Testing assistance: Help with creating and reviewing API tests for validation, ownership, CRUD operations, comments, and missing records
