# Account, Administration, and Wishlist - Assignment 3

This directory contains Dat Pham's **Wishlist and Favourites** module and the
shared **Login, Registration, Edit Profile, and Administration** contribution.
For Assignment 3, the integrated root server uses MongoDB for these workflows.

Run the application from the repository root. Running `modules/account/server.js`
directly starts only the retained Assignment 2 in-memory fixture and is intended
for regression tests, not for the integrated Assignment 3 demonstration.

## Integrated storage scope

Dat's Assignment 3 implementation persists these areas in MongoDB:

- account registration, login lookups, profile changes, password hashes,
  account roles, and account statuses;
- the product catalogue;
- each user's saved and cart-stage Wishlist entries;
- append-only purchase history used by Favourites;
- one-time password-reset token records.

Kim's Discussion Forum separately persists Discussions and Replies and uses the
same User documents for authorship. Blog posts/comments and Ratings and Reviews
still use their Assignment 2 in-memory stores. Local avatar and Forum image
files remain on disk, with only their public paths stored in MongoDB.

## Requirements and setup

- Node.js 20.19.0 or newer
- npm
- an authorized MongoDB Atlas connection for normal application use

From the repository root:

```powershell
npm ci
```

For a private disposable demo that does not require Atlas, run:

```powershell
npm run start:local
```

The first run may spend several minutes downloading a MongoDB test binary.
Open <http://localhost:3000>, then press `Ctrl+C` when finished; the temporary
database is deleted. For the normal Atlas-backed setup, continue with:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
```

Edit `.env` locally:

```text
MONGODB_URI=mongodb+srv://APP_USER:APP_PASSWORD@CLUSTER_HOST/?retryWrites=true&w=majority
MONGODB_DB_NAME=rmit_connect
SESSION_SECRET=replace-with-at-least-32-random-characters
SHOW_DEMO_RESET_LINK=false
```

`rmit_connect` is the default database name. `MONGODB_DB_NAME` may select a
different isolated development database. Preserve `rmit_connect_a3_final`
for the existing integration checkout. Obtain real Atlas values through a
private team channel. Never commit `.env`, working database credentials, a real
session secret, real-user plaintext passwords, password hashes, or usable reset
tokens. The documented sample account values are non-secret test fixtures.

Prepare the sample records and start the integrated server:

```powershell
node scripts/seed.js
npm start
```

The seed is idempotent. It upserts records by stable user, product, and sample
content identities, adds anything missing, preserves unrelated records, and
does not delete data. Re-running it does not reset an existing demo user's
password. Confirm the startup message shows the intended database name, then open
<http://localhost:3000/login.html>.

## Demonstration accounts

| Purpose | Identity | Password | Access |
| --- | --- | --- | --- |
| Administrator | `dat.pham` or `s4221230@rmit.edu.vn` | `ConnectDemo!26` | Account, Wishlist, and Administration |
| Member/ownership check | `jay.nguyen` or `s4217847@rmit.edu.vn` | `StudentDemo!26` | Account and Wishlist; Administration denied |
| Locked-account check | `kim.seung-uk` or `s4028530@rmit.edu.vn` | `LockedDemo!26` | Login denied while locked |

These are classroom demonstration values only. The seed hashes each password
with `bcryptjs`; MongoDB stores `passwordHash`, never the plaintext value. APIs
omit the hash, and the “Remember username” option stores only the identity.

## Pages and API routes

| Page | Route |
| --- | --- |
| Login | `/login.html` |
| Register | `/register.html` |
| Profile | `/profile.html` |
| Edit Profile | `/editprofile.html` |
| Administration | `/admin.html` |
| Wishlist and Favourites | `/wishlist` |
| Browse Items | `/wishlist/add` |

All JSON responses use either `{ "success": true, "data": ... }` or a
controlled `{ "success": false, "error": ... }` envelope.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Report the MongoDB-backed API status |
| `POST` | `/api/users` | Public | Register a validated member account |
| `GET` | `/api/session` | Public | Read current authentication state |
| `POST` | `/api/session` | Public | Authenticate and regenerate the session |
| `DELETE` | `/api/session` | Session | Destroy the current session |
| `GET` | `/api/products` | Session | Retrieve the active catalogue |
| `GET` | `/api/wishlist` | Session | Retrieve saved, cart, purchase, and summary state |
| `POST` | `/api/wishlist` | Session | Save one product, rejecting duplicates |
| `PATCH` | `/api/wishlist/:productId` | Session | Move to cart or mark purchased |
| `DELETE` | `/api/wishlist/:productId` | Session | Remove the current user's live entry |
| `GET` | `/api/profile` | Session | Retrieve the current user's safe profile |
| `PATCH` | `/api/profile` | Session | Update allow-listed profile/password fields |
| `GET` | `/api/admin/users` | Administrator | Search, filter, and sort safe user summaries |
| `PATCH` | `/api/admin/users/:userId/status` | Administrator | Lock or reactivate another account |

Registration never accepts a client-selected role or status: new accounts are
always active members. Protected operations derive ownership from the signed-in
session rather than trusting a browser-supplied user ID.

## Persistent collections and relationships

| Collection | Important relationships and purpose |
| --- | --- |
| `users` | Shared account identity; referenced by all owner-specific records |
| `products` | Catalogue source identified by a stable unique slug |
| `wishlistentries` | References one User and one Product; status is `saved` or `cart` |
| `purchases` | References User/Product and snapshots name, price, quantity, and purchase time |
| `passwordresettokens` | References one User and stores a SHA-256 token digest plus expiry |
| `discussions` | Forum-owned collection referencing its author User |
| `replies` | Forum-owned collection referencing an author User and parent Discussion |

Indexes are part of the design rather than optional optimisation:

- unique User indexes prevent duplicate username, student ID, and email;
- a unique Product slug gives URLs and seed operations one stable identity;
- the unique `(userId, productId)` Wishlist index enforces one live entry per
  user/product across saved and cart states, including concurrent requests;
- compound status/date indexes support user-scoped list and summary queries;
- text indexes support Administration and catalogue search;
- Purchase user/date and product/date indexes support recent history;
- the Password Reset Token expiry index removes expired documents, while unique
  user and token-digest indexes prevent ambiguous active reset records.

Purchase records are deliberately separate from live Wishlist entries so a user
may buy the same product more than once. They snapshot item name and unit price,
so later catalogue edits do not rewrite purchase history.

## Sessions and password-reset boundary

The browser cookie contains a signed session identifier, not the password or
User document. The server keeps the authenticated MongoDB User ObjectId and
non-secret `authVersion` in session state. Password and account-status changes
increment that version, revoking older sessions. Cookies are HTTP-only,
`SameSite=Lax`, expire after two hours, and are secure in production.

- Local development and automated tests use Express MemoryStore; sessions end
  when the Node process restarts.
- Production mode uses `connect-mongo` and the `sessions` collection, so session
  state can survive a process restart. Production also requires an explicit
  `SESSION_SECRET`.

The password-reset workflow is a classroom demonstration, not an email service.
It gives the same response whether an email exists, creates a cryptographically
random 20-minute token for an active account, and stores only its SHA-256 digest.
The token is one-time-use; successfully changing the password consumes it.
Locking or deactivating an account removes any outstanding reset challenge.
Public account/password endpoints are rate-limited, and accepted passwords are
bounded to 72 UTF-8 bytes so bcrypt cannot silently truncate them.

In local development the page displays the demonstration reset link. In a
public deployment, keep `SHOW_DEMO_RESET_LINK=false`. A private link-delivery
mechanism still needs to be implemented. The project does not implement email
delivery or claim that the assignment waives it.

## Verification

Run these commands from the repository root:

```powershell
npm run check
npm test
npm run test:db
npm --prefix modules/account test
```

- `npm run check` is the full release gate: static checks, root integration,
  retained Account regression tests, and MongoDB integration tests.
- `npm run test:db` exercises the Mongo-backed registration, session, Account,
  Administration, Wishlist, purchase, validation, authorization, and persistence
  paths against an isolated temporary MongoDB server. It does not touch Atlas.
- `npm --prefix modules/account test` retains the fast Assignment 2 in-memory
  regression suite, proving that the HTTP contracts remain compatible.

Also test Dat and Jay in a browser, attempt a forbidden non-admin action, restart
the server to confirm application data persists while a development session
expires, inspect browser console/network errors, and verify keyboard/focus and
approximately 375 px, 768 px, desktop, and 200% zoom layouts.

## Relevant files

```text
modules/account/public/           Account and Wishlist HTML/CSS/browser JS
modules/account/src/mongo-routes.js
                                  Mongo-aware HTTP/session adapter
modules/account/src/mongo-repository.js
                                  Database queries and domain mutations
modules/account/src/validation.js Independent server validation
models/user.js                    Shared account schema and indexes
models/product.js                 Catalogue schema and indexes
models/wishlist-entry.js          Live Wishlist/cart relationship
models/purchase.js                Append-only purchase history
models/password-reset-token.js    Hashed, expiring reset records
database.js                       Environment-based Mongoose connection
scripts/seed.js                   Idempotent integrated sample-data seed
tests/                            Root static/integration tests
modules/account/tests/            Account regression and MongoDB tests
```

`modules/account/src/data.js` remains only as an injected in-memory fixture for
the original regression tests. The integrated application injects
`createMongoAccountRepository()` instead.

## AI use acknowledgement

OpenAI Codex assisted with implementation guidance. Dat Pham wrote and verified
the implementation.

Integration note, 8 September 2026: OpenAI Codex directly generated and edited
the combined server, integration tests, and documentation in a validation copy.
The statement above describes Dat's original module declaration, not a claim
that Dat has verified these later integration changes.
