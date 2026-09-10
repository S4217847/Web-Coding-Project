# RMIT Connect - Assessment 3

RMIT Connect is an RMIT student-community web application developed for
COSC3060 Web Programming Studio. It builds on the team's Assessment 1 HTML/CSS
pages and Assessment 2 Express prototype with authenticated sessions,
server-side validation, CRUD workflows, image uploads, and MongoDB persistence.

Dat's latest supplied Assignment 3 work is integrated with the current server.
It stores the shared Account, Administration, Wishlist, catalogue,
purchase-history, and password-reset records in MongoDB. Kim's Forum stores its
Discussions, Replies, and Ratings and Reviews in MongoDB and shares the same
User records. The Blog module still uses its Assessment 2 in-memory store.

The active integration branch is `integrated-draft`. It should be tested through
the Node server; opening HTML files directly or using VS Code Live Server will
not run the EJS templates or APIs.

As of 8 September 2026, the scoped Dat/Kim integration and the identified Forum
and Reset Password fixes are complete in this working tree. All 47 automated
tests passed. This is not a claim that hosting, other modules' persistence, or
final submission preparation is complete. The latest changes have not been
committed or pushed.

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
- Access to the approved MongoDB Atlas database for normal Atlas mode
- A local `.env` file based on `.env.example` for normal Atlas mode

A MongoDB Atlas connection and `.env` configuration are needed for `npm start`.
Neither is needed for `npm run start:local`. The automated database tests also
use a temporary local test server. Store the Atlas connection string and session
secret only in the local `.env` file.
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
Atlas database. Press `Ctrl+C` to stop it; its temporary MongoDB records are
deleted. Images uploaded through the demo are local files and are not removed
by stopping the database. Do not delete existing team uploads during cleanup.

### Normal Atlas setup

Only for a new checkout without an existing `.env`, create the local file:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
```

```text
MONGODB_URI=mongodb+srv://APP_USER:APP_PASSWORD@CLUSTER_HOST/?retryWrites=true&w=majority
MONGODB_DB_NAME=rmit_connect
SESSION_SECRET=replace-with-at-least-32-random-characters
SHOW_DEMO_RESET_LINK=false
```

`rmit_connect` is the default database name. A different isolated database can
be selected with `MONGODB_DB_NAME`. The existing integration database is
`rmit_connect_a3_final`; keep that explicit value in the existing local `.env`
instead of changing databases during integration. Ask for Atlas access and credentials through
a private team channel; `.env.example` deliberately contains no working secret.

Prepare the controlled sample Users, Products, Wishlist entries, Purchases,
Discussions, Replies, and Reviews:

```powershell
node scripts/seed.js
```

The seed inserts missing sample records and does not deliberately replace
existing account details, passwords, or post content. It is still a database
write: timestamps can change, and samples whose identifying fields were
changed may be inserted again. The current integration database already has
sample data. Do not reseed it without checking the target and agreeing with
the team. Demo passwords are hashed before insertion; plaintext passwords are
not stored in MongoDB.

Start the application:

```powershell
npm start
```

Confirm that `Connected to MongoDB` appears before the local website address,
then open `http://localhost:3000`. Use `npm install` instead of `npm ci` only
when intentionally updating the dependency lockfile. Stop the server with
`Ctrl+C`.

After receiving updated server files, stop and restart an existing `npm start`
process, then refresh the browser. A running server does not automatically
reload those changes. Restarting `npm run start:local` also resets its temporary
database, so do not use that mode for records you need to keep.

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
| Deactivated-account testing | `inactive.demo` | `InactiveDemo!26` | Member, deactivated |

These accounts are provided only for demonstration and testing. Their passwords
are hashed with `bcryptjs` and stored as one `passwordHash` string. Plain-text
passwords and password hashes are never returned by the API or stored in Web
Storage. The browser's “Remember username” option stores only the login
identity.

Locked and deactivated accounts must not be able to log in. Use disposable
accounts for password-reset and deactivation tests so shared demo accounts
remain usable.

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
| Edit Discussion          | `/discussions/:id/edit`                  |
| Edit Reply               | `/discussions/:id/replies/:replyId/edit` |
| Blog                     | `/blogs`                                 |
| Blog detail              | `/blogs/:id`                             |
| Create Review            | `/reviews`                               |
| Browse Reviews           | `/reviews/browse`                        |
| Review detail/edit       | `/reviews/:id` and `/reviews/:id/edit`   |
| Wishlist and Favourites  | `/wishlist`                              |
| Browse Wishlist items    | `/wishlist/add`                          |
| Password assistance      | `/forgot-password` and `/reset-password` |
| Account deactivation     | `/deactivate-account`                    |
| Deactivation result      | `/deactivated-success`                  |
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
  draft restoration for each signed-in account. A draft is kept if submission
  fails and cleared only after the server saves the Discussion.
- **Blog:** dynamic posts and comments, owner-only editing/deletion, live
  validation, category filtering, full-text search, sorting, per-user drafts,
  and optional image data.
- **Ratings and Reviews:** MongoDB-backed review CRUD, signed-in reviewer
  identity, course-code and rating validation, search/filter/sort, per-user
  drafts, and optional image data.
- **Wishlist and Favourites:** MongoDB-backed product retrieval, client-side
  search/filter/sort, duplicate prevention, adding, cart transitions,
  purchasing, deletion, and per-user summary counts.
- **Shared account:** MongoDB-backed registration, `bcryptjs` password
  verification, signed session cookies, profile editing, password changes,
  account locking, logout, account deactivation, a one-time reset-token workflow, and
  administrator-only account management.

Public sign-in/registration/password-recovery endpoints are rate-limited.
Passwords are limited to bcrypt's 72 UTF-8-byte boundary, and password or
account-status changes invalidate older sessions through a stored
`authVersion` counter.

## Data model

The integrated MongoDB collections are `users`, `products`, `wishlistentries`,
`purchases`, `passwordresettokens`, `discussions`, `replies`, and `reviews`.
Relationships are stored as ObjectId references: Wishlist entries, Purchases,
Discussions, Replies, Reviews, and reset tokens point to their owning User;
Wishlist entries and Purchases point to a Product; and Replies point to a
Discussion.

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

At startup, the known legacy Blog sample owner labels are matched to existing
Users by the documented student IDs. The Review seed maps its known sample
owners to those same MongoDB User ObjectIds and does not overwrite existing
Review records.

Blog posts/comments remain in their existing in-memory store and reset when the
Node process restarts. Reviews persist in MongoDB. Local development sessions
also use Express MemoryStore and therefore end on restart. When
`NODE_ENV=production`, sessions are stored in MongoDB's `sessions` collection
through `connect-mongo`.

## Integration status and remaining work

### Completed in the current integration

- Dat's latest Account, Administration, Wishlist, shared User schema, and
  one-time reset-token implementation are connected to the existing Forum.
  Existing Blog/Review code and the shared page layout were preserved.
- The identified Forum draft-isolation, premature draft-deletion, image-type,
  and stale Reset-link problems were fixed. The latest local checks passed;
  see the Testing section for their scope.
- The selected Atlas database and existing User/Forum relationships were
  checked. Dat's missing sample data was added with approval. Atlas-backed
  browser checks covered Dat and Jay login/logout, account screens, Wishlist,
  Forum ownership controls, and administrator access restrictions.

### Separate follow-up work and current limits

- **Forum queries:** title/content filtering and newest/oldest sorting work in
  the browser. The server currently loads all active Discussions and their
  active Replies for the list. Database-side filtering/sorting and additional
  Forum compound indexes are not implemented yet.
- **Forum ownership and deletion:** edit/delete database updates include the
  author and active-record conditions. Replies under deleted Discussions are
  hidden, and Reply routes check that the parent Discussion is active.
  The parent check and Reply write are separate operations. Simultaneous
  Discussion deletion and Reply writes still need concurrency review.
- **Shared Account:** the integrated implementation uses Dat's MongoDB account
  and one-time reset-token workflow. Private reset-link delivery is not implemented.
- **Other modules:** migrate Blog data to MongoDB and test it through the
  shared application.
- **Deployment verification:** the database selection is preserved. The latest
  Forum/Reset fixes were tested with temporary local databases. Repeat the final
  end-to-end checks on the chosen hosted build and its configured Atlas database.
- **Atlas access:** confirm individual team access and database permissions.
  Keep development, test, and deployment configuration separate. Do not share
  personal Atlas logins or put connection credentials in the repository.

## Hosting status

- **Live website URL:** not available yet. Add the confirmed URL after deployment.
- **Planned provider:** Render. Repository access and the hosting plan still
  need to be confirmed with the team and repository owner.
- **Uploaded images:** Forum files use `public/uploads`; Profile avatars use
  `modules/account/public/uploads/avatars`.
  Durable storage must be configured and verified on the host. Saving image
  paths in MongoDB does not store the image files themselves.
- **Hosted verification:** test Login, all modules, uploads, password recovery,
  deactivation, and persistence after a server restart or redeployment.

## Testing

Run the complete release gate from the project root:

```powershell
npm run check
```

`npm test` runs all automated suites without the static check. Individual
stages can also be run separately:

```powershell
node tests/static-check.js
node --test tests/integration.test.js tests/forum-draft.test.js
npm --prefix modules/account test
npm run test:db
npm run test:repository
```

`npm run test:db` is the dedicated MongoDB Account/Wishlist integration suite.
The complete `npm run check` gate includes static checks, root integration
tests, Forum draft tests, the original Account regression suite, and database
tests. Database tests use isolated temporary MongoDB instances. They do not
read or alter the team Atlas database. A first run may need to download the
MongoDB test binary.

### Latest verification: 8 September 2026

`npm run check` passed on the current `integrated-draft` working tree after the
Forum and Reset Password fixes:

| Automated suite | Passed |
| --- | ---: |
| Root integration: `tests/integration.test.js` | 17 |
| Forum drafts: `tests/forum-draft.test.js` | 5 |
| Original Account regressions | 10 |
| MongoDB Account/Wishlist API | 13 |
| MongoDB repository | 2 |
| **Total** | **47** |

There were no failed or skipped tests. Static checks also passed for 26 active
pages, 36 browser JavaScript files, and 11 stylesheets. These results describe
the local working tree, not a submitted commit or a hosted release. Run the
command again on the exact commit used for submission.

The retained `tests/recovery-password-review.test.js` and
`tests/deactivation-review.test.js` describe the previous recovery-password and
locked-status deactivation flow. They are historical files, not current release
gates. Do not run them against the new integration. Current root and MongoDB
Account tests cover token reset and deactivation. The new root regressions also
check legacy sample ownership, denied Forum uploads, deleted-parent Replies,
locked or stale sessions, image signatures on all four Forum upload routes,
invalid Reset links, Logout clearing reset access, and the Deactivation
confirmation/last-administrator guards. The five draft tests cover account
separation, reloads, old unowned drafts, failed submissions, and successful
submission cleanup. This does not claim identical coverage of every old
flow-specific test.

After the fixes, browser checks confirmed that Dat's unfinished Forum post did
not appear for Jay and returned when Dat logged in again. Forgot Password
validation, the local reset-link screen, invalid Reset-link redirection,
Logout, and Deactivation confirmation/cancel behavior also passed. No browser
console errors or warnings were captured. Password changes and completed
deactivation were tested automatically using disposable accounts.

For the final hosted build, manual browser verification should include:

1. Login as Dat and visit every module through the header.
2. Exercise create/edit/delete and a forbidden cross-user operation.
3. Confirm live validation, account-specific drafts, and draft retention after
   rejected uploads.
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
- Discussion and Reply create/edit uploads accept JPEG and PNG files up to
  5 MB. The declared type must match the starting file signature. Invalid files
  are removed before a Forum document is saved. This is not full image decoding
  or a malware scan. Forum files are stored in `public/uploads`, while MongoDB
  stores only their public paths.
- Forum text drafts use account-specific `localStorage` keys. Old drafts with
  no account ID are ignored rather than assigned to the next person who logs in.
  Images are not stored in the draft. The server confirms a successful post
  before the browser clears that account's draft.
- Password-reset records contain a SHA-256 token digest, not the usable token,
  and expire after 20 minutes. No email-delivery service is implemented.
  Local development shows a demonstration reset link. A public deployment must
  keep `SHOW_DEMO_RESET_LINK=false`; a private delivery mechanism still needs
  to be implemented before real users can complete recovery. This is not a claim
  that the assessment waives email-delivery requirements.
- A malformed new Reset link clears earlier reset access from the current
  session. Logout also clears that session's reset access.
- Working Atlas credentials, session secrets, real-user plaintext passwords,
  usable reset tokens, and password hashes must never be committed or exposed
  by an API. The documented sample account values are non-secret test fixtures.

## AI acknowledgement

The original module declarations remain attributable to their named authors.
OpenAI Codex directly generated and edited the integration code, regression
tests, and this README in a validation copy on 8 September 2026. It also assisted
with debugging and automated/browser checks. These integration changes have not
yet been reviewed or verified by the team. Each member is responsible for
understanding and accurately declaring the work they submit.

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
- Check the declared image type against the file signature on all create/edit
  uploads and remove rejected files.
- Keep the existing image when editing without selecting a new file.
- Filter by the original Discussion title or by Discussion and active Reply content.
- Sort by the newest active Discussion or Reply, or by the oldest original Discussion.
- Save a new Discussion text draft separately for each account in `localStorage`.
- Keep the draft after a failed submission and clear it only after the server
  confirms that the Discussion was saved.
- Allow active logged-in authors to edit or delete only their own content.
- Open the compact post form from the Start a discussion button.
- Keep the Reply composer visible near the bottom of the Discussion detail page.
- Select a Reply image through the visible file input or the plus icon.
- Show `Post deleted successfully.` after a Discussion is deleted.
- Keep the Reply controls usable on narrow screens and show the correct
  Login or Logout link on Home and Sitemap for the current session.

**Password recovery features**

- The integrated version uses Dat's one-time Password Reset Token workflow.
- Forgot Password accepts the email and prepares a random token for an active
  account. MongoDB stores its SHA-256 digest and a 20-minute expiry.
- The local demonstration displays a reset link. Email delivery is not implemented.
- Reset Password validates and consumes the token, updates the password hash,
  and invalidates older sessions with `authVersion`.
- A malformed new Reset link cannot reuse an older link from the session.
- The old pre-set recovery password fields and Profile controls are no longer used.

**Logout and Account Deactivation features**

- Logout ends the shared session used by all modules, including reset access.
- Deactivation requires an active signed-in account and the confirmation
  checkbox. The current root form does not ask for the password again.
- MongoDB stores `status: "deactivated"` and `deactivatedAt`. The User is not deleted.
- Older sessions and future login attempts are rejected.
- The last active administrator cannot deactivate their account.
- Successful deactivation redirects to `/deactivated-success`.

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
- `modules/account/src/app.js` for shared Account application setup.
- `modules/account/src/mongo-routes.js` for MongoDB-backed Account routes.
- `modules/account/src/mongo-repository.js` for Account data operations and reset tokens.
- `models/password-reset-token.js` for the one-time reset-token schema.
- `modules/account/src/validation.js` for server-side password validation.
- `modules/account/public/editprofile.html`
- `modules/account/public/js/profile.js`
- `models/discussion.js`
- `models/reply.js`
- `scripts/seed.js`
- `index.js` for Forum and shared account route handlers.
- `forum-data.js` for the known legacy sample owner/student ID mapping only.
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
- `tests/forum-draft.test.js`
- `modules/account/tests/mongo-api.test.js`
- `modules/account/tests/mongo-repository-auth.test.js`

### AI assistance acknowledgement

OpenAI Codex previously suggested the pre-set recovery password idea. That
workflow has now been replaced by Dat's one-time reset-token implementation.

For this integration, OpenAI Codex generated and applied code in a validation
copy, manually reconciled the shared server, added the legacy-owner mapping,
added Forum upload cleanup guards and regression tests, and updated documentation.
This included direct code generation, not only guidance. Kim and the team must
review and understand the changes and declare the assistance under the course rules.

============================================================================

### Nguyen Dac Gia Hung (s4217847)

**Individual Module: Ratings and Reviews**

**Shared User Account contribution: Account Creation (Unfinished)**

**Ratings and Reviews Features**

- Create, view, edit and delete review posts
- Search, filter, and sort reviews in the browser
- Allow active logged-in users to edit or delete only their own ratings
- Store Reviews in MongoDB Atlas with ObjectId ownership links to shared Users.

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
