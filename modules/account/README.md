# RMIT Connect

RMIT Connect is a full-stack student-community prototype for COSC3060 Web
Programming Studio. It extends the Assessment 1 HTML/CSS pages with vanilla
browser JavaScript, a Node.js/Express API, authenticated sessions, server-side
validation, and an in-memory demonstration data store.

The implemented individual module is **Wishlist and Favourites**. The shared
account contribution covers sign-in, profile editing, and administration.

## Team responsibility register

This branch contains Dat's completed Assessment 2 slice. The remaining rows
record the Git identities and Assessment 1 ownership visible in the team
repository; each teammate must update their row with their full name and final
Assessment 2 files when the branches are merged.

| Team member / Git identity | Module or shared responsibility | Files and folders currently owned |
| --- | --- | --- |
| Pham Truong Dat (`S4221230`) | Wishlist and Favourites; shared Login, Edit Profile, and Administration | `public/wishlist.html`, `public/wishlist-add.html`, `public/login.html`, `public/editprofile.html`, `public/admin.html`, related `public/js/` and `public/css/` files, `server.js`, `src/`, `tests/`, and `docs/` in this branch |
| `S4028530` (full name to confirm) | Discussion plus account recovery/logout/deactivation work visible on the teammate branch | `discussion.html`, `discussion-detail.html`, and the teammate's recovery/logout/deactivation pages; final A2 paths to confirm at merge |
| `S4199268` / `VN-Shiro-39` (full name to confirm) | Blog module visible on the teammate branch | Blog HTML/CSS and its final A2 browser/server files; exact paths to confirm at merge |
| `S4217847` (full name to confirm) | Ratings and Reviews plus Register/Profile work visible on the teammate branch | `review/`, `loginregi/`, `profile/`, and their final A2 browser/server files; exact paths to confirm at merge |

The group representative should replace every “full name to confirm” note and
verify this table against the final merged tree before creating the submission
ZIP. This avoids claiming ownership of teammate code that is not yet present.

## Requirements and quick start

- Node.js 20 or newer
- npm 10 or newer

```powershell
npm install
npm start
```

Open <http://127.0.0.1:3000/login.html>.

For automatic server restarts during development:

```powershell
npm run dev
```

The default host is `127.0.0.1` and the default port is `3000`. They can be
changed with the `HOST` and `PORT` environment variables. Production mode also
requires a strong `SESSION_SECRET`:

```powershell
$env:NODE_ENV = "production"
$env:SESSION_SECRET = "replace-with-a-long-random-secret"
npm start
```

Do not commit a real session secret. The development fallback exists only for
local classroom demonstration.

## Demonstration accounts

| Account | Identity | Password | Access |
| --- | --- | --- | --- |
| Dat (administrator) | `dat.pham` or `s4221230@rmit.edu.vn` | `ConnectDemo!26` | Wishlist, profile, and administration |
| Jay (student) | `jay.nguyen` or `s4217847@rmit.edu.vn` | `StudentDemo!26` | Wishlist and profile; administration denied |
| Kim (locked student) | `kim.seung-uk` or `s4028530@rmit.edu.vn` | `LockedDemo!26` | Login denied while locked |

These are seeded demonstration credentials, not real accounts. Seed passwords
are hashed with `bcryptjs` and stored as one `passwordHash` string. Plain-text
passwords and password hashes are never returned by the API.

## Main behavior

- Login is maintained by an HTTP-only session cookie and survives refreshes.
- Browse Items retrieves the product collection once. Search, category filter,
  status filter, and sorting are performed in the browser and safe preferences
  may be restored from Web Storage.
- Wishlist creation, move-to-cart, mark-purchased, and removal are real API
  mutations. Ownership is always derived from the authenticated session.
- Profile changes are independently validated by the browser and server. Email
  addresses remain unique, and a password change requires the current password.
- Administration is role-protected. An administrator can lock and unlock other
  accounts but cannot lock their own active session.
- The user interface reports loading, empty, success, validation, and server
  error states without inserting untrusted HTML strings.

## API summary

All API responses use one of these envelopes:

```json
{ "success": true, "data": {} }
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Correct the highlighted fields.",
    "fields": {}
  }
}
```

| Method | Route | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | None | Server health check |
| `GET` | `/api/session` | None | Read current authentication state |
| `POST` | `/api/session` | None | Sign in with username/email and password |
| `DELETE` | `/api/session` | Session | Sign out and destroy the session |
| `GET` | `/api/products` | Session | Retrieve the complete product catalogue |
| `GET` | `/api/wishlist` | Session | Retrieve the current user's saved, cart, and purchase state |
| `POST` | `/api/wishlist` | Session | Save a product, rejecting duplicates |
| `PATCH` | `/api/wishlist/:productId` | Session | Move to cart or mark purchased |
| `DELETE` | `/api/wishlist/:productId` | Session | Remove a saved/cart item |
| `GET` | `/api/profile` | Session | Retrieve the current user's safe profile |
| `PATCH` | `/api/profile` | Session | Update allowed profile fields/password |
| `GET` | `/api/admin/users` | Administrator | Retrieve safe account summaries |
| `PATCH` | `/api/admin/users/:userId/status` | Administrator | Lock or activate another account |

Detailed payloads and status codes are documented in
[`docs/api-reference.md`](docs/api-reference.md).

The browser modules, server layers, session/ownership flow, CRUD paths, storage
boundaries, and Assessment 3 extension plan are explained in
[`docs/architecture.md`](docs/architecture.md).

## Verification

```powershell
npm test
npm run check
```

- `npm test` starts the app on an unused local port and exercises sessions,
  product retrieval, current-user ownership, Wishlist CRUD/transitions and
  counters, profile updates/passwords, administrator authorization, controlled
  errors, and seed resets.
- `npm run check` first checks static HTML, CSS, JavaScript, links, accessibility
  references, asset presence, browser/server contracts, and unsafe patterns;
  it then runs the API suite.

Before submission, also verify keyboard-only operation, visible focus, browser
console/network errors, and layouts around 375 px, 768 px, and desktop width.
A practical checklist is in
[`docs/verification.md`](docs/verification.md).

## Security decisions

- Session cookies are HTTP-only, `SameSite=Lax`, and secure in production.
- Protected routes obtain the user from the session; browser-supplied `userId`
  values never decide ownership.
- Locked status is checked on every protected request, not only during login.
- Server validation remains authoritative even when client validation succeeds.
- Profile updates use an explicit field allow-list to prevent role/status mass
  assignment.
- Password hashing and verification use `bcryptjs`. Each User stores one
  `passwordHash` string containing the bcrypt salt and hash.
- API responses are `no-store`, Express identification is disabled, and security
  headers restrict framing, content types, referrers, permissions, and content
  sources.
- Web Storage may contain non-sensitive filter choices, remembered identity, or
  profile text drafts. It must never contain passwords, hashes, session IDs, or
  authentication tokens.

## Deliberate limitations

- Application data and sessions are held in memory. Restarting the server resets
  the seed and signs users out. This is suitable only for the Assessment 2 local
  prototype.
- The default `express-session` MemoryStore is not suitable for deployment across
  processes or servers.
- Concurrent Wishlist transitions are not database transactions in this version.
- Avatar data is limited to small JPG/PNG Data URLs for the prototype; there is no
  production object-storage pipeline.
- There is no email delivery, password-recovery service, payment service, shopping
  checkout, rate limiter, or audit log.
- Assessment 3 should replace the arrays with MongoDB Atlas, add durable sessions,
  enforce database indexes, and use transactions for multi-collection changes.

The proposed persistent design and sample documents are in
[`docs/database-schema.md`](docs/database-schema.md).

## Project structure

```text
public/                 HTML, styles, browser JavaScript, and images
src/app.js              Express application, middleware, and API routes
src/data.js             In-memory seed and reset helper
src/passwords.js        Password hashing and verification
src/validation.js       Independent server-side validation
server.js               Configurable process entry point
tests/                  Static checks and API integration tests
docs/                   API, verification, and future database design
```

## AI use acknowledgement

OpenAI Codex assisted with implementation guidance, debugging, documentation,
and testing. Dat Pham developed, reviewed, understood, and verified the final
implementation.
