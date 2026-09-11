# API reference

Base path: `/api`. Request and response bodies are JSON unless stated otherwise.
Protected routes identify the user from the session cookie; a `userId` supplied
by the browser never grants ownership or administrator access.

## Response format

Successful response:

```json
{
  "success": true,
  "data": {}
}
```

Controlled error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Correct the highlighted fields.",
    "fields": {
      "email": "Enter a valid email address."
    }
  }
}
```

`error.fields` is present only when individual form controls need messages.

## Authentication and health

### `GET /health`

Returns `200` and `{ "status": "ok" }` inside the success envelope.

### `GET /session`

This route is intentionally public so a page can discover its state.

```json
{
  "authenticated": true,
  "user": {
    "id": "68b9c70b7e6b0e79a49e8201",
    "username": "dat.pham",
    "studentId": "S4221230",
    "name": "Dat Pham",
    "email": "s4221230@rmit.edu.vn",
    "role": "admin",
    "status": "active"
  }
}
```

Anonymous, locked, deactivated, or deleted-account sessions receive
`authenticated: false` and `user: null`; an invalid existing session is
destroyed rather than becoming valid again after a later status change.

### `POST /users`

Creates a normal member account; callers cannot choose `role` or `status`.

```json
{
  "username": "new.student",
  "studentId": "S4000002",
  "name": "New Student",
  "email": "new.student@rmit.edu.vn",
  "description": "Interested in student activities.",
  "password": "NewStudent9A",
  "confirmPassword": "NewStudent9A"
}
```

Returns `201` with a safe user. Values are normalized before MongoDB's unique
indexes are reached; duplicate username, student ID, or email returns a
field-specific `409`, and password hashes are never included in responses.
Passwords require at least 8 characters, uppercase/lowercase letters and a
number, and no more than 72 UTF-8 bytes.

### `POST /session`

```json
{
  "identity": "dat.pham",
  "password": "ConnectDemo!26"
}
```

`identity` accepts a username or email address. A successful login regenerates
the session and returns `201`. Relevant errors are:

- `422 VALIDATION_ERROR` for malformed or missing fields.
- `401 INVALID_CREDENTIALS` for an unknown identity or wrong password.
- `423 ACCOUNT_LOCKED` for a locked account.
- `403 ACCOUNT_DEACTIVATED` for a deactivated account.
- `429 RATE_LIMITED` after repeated unsuccessful attempts.

The wrong-credential response deliberately does not reveal whether the identity
or password was responsible.

### `DELETE /session`

Destroys the server session, clears the cookie, and returns `200` with
`authenticated: false`.

## Products

### `GET /products`

Requires an active session. Returns active products and a count. Each product
includes its public catalogue fields, relationship-derived statistics, and
`isWishlisted` for the current user.

Optional `search`, `category`, and `sort` parameters are applied by the MongoDB
repository. Text search covers name, description, and category. Sort values
include `most-wishlisted`, `purchased`, `price-asc`, `price-desc`, `name-asc`,
and `name-desc`; unknown/blank values fall back to name order. The browser also
performs immediate presentation filtering on the returned collection.

## Wishlist and favourites

All Wishlist routes require an active session and operate only on that account.

### `GET /wishlist`

Returns:

```json
{
  "wishlist": [],
  "cart": [],
  "items": [],
  "purchases": [],
  "summary": {
    "saved": 0,
    "readyForCart": 0,
    "purchased": 0
  }
}
```

`items` combines current Wishlist and cart entries for convenient rendering.
Purchased entries are returned separately, most recent first.

### `POST /wishlist`

```json
{
  "productId": "data-bootcamp"
}
```

Returns `201` with the created item and authoritative summary. Errors:

- `422 VALIDATION_ERROR` when `productId` is missing.
- `404 PRODUCT_NOT_FOUND` for an unknown product.
- `409 DUPLICATE_WISHLIST_ITEM` when the current user already has the product in
  their Wishlist or cart.

Extra browser-supplied ownership fields are not authoritative.

### `PATCH /wishlist/:productId`

Move a saved item into the cart:

```json
{ "action": "move-to-cart" }
```

Mark an item from either Wishlist or cart as purchased:

```json
{ "action": "mark-purchased" }
```

The server moves the current relation atomically, or removes it and creates an
immutable purchase-history record in a transaction. Counts are derived from
relationship records rather than stored counters. The route returns the new
item/purchase plus summary. Errors include `422 VALIDATION_ERROR`,
`404 WISHLIST_ITEM_NOT_FOUND`, and `409 ALREADY_IN_CART`.

### `DELETE /wishlist/:productId`

Removes the current user's Wishlist/cart relation and returns
`removedProductId` plus the new relationship-derived summary. A missing or
another user's relation returns
`404 WISHLIST_ITEM_NOT_FOUND`.

## Profile

### `GET /profile`

Requires an active session and returns `{ "profile": safeUser }`. The safe user
presenter excludes the `passwordHash` field.

### `PATCH /profile`

This is a partial update. Accepted fields are `name`, `email`, `description`,
`avatarUrl`, `avatarDataUrl`, `currentPassword`, and `newPassword`. Protected
fields such as `id`, `username`, `studentId`, `role`, and `status` are rejected.

Example text update:

```json
{
  "name": "Dat P.",
  "description": "Student community organiser."
}
```

Example password update:

```json
{
  "currentPassword": "ConnectDemo!26",
  "newPassword": "Replacement9A"
}
```

Profile rules:

- Name: 2–80 characters.
- Email: valid form, maximum 120 characters, unique without regard to case.
- Description: maximum 300 characters.
- New password: at least 8 characters, uppercase/lowercase letters and a
  number, and no more than 72 UTF-8 bytes; the current password is mandatory.
- Avatar: local `/images/`, HTTPS URL, or a genuine JPG/PNG Data URL smaller
  than 1 MB. Uploaded bytes are written under the module's ignored upload
  directory; MongoDB stores only the URL.

Errors include `422 VALIDATION_ERROR`, `409 EMAIL_IN_USE`, and
`422 INVALID_CURRENT_PASSWORD`. Validation and authorization complete before
the allowed user fields are applied.

## Administration

These routes require both an active session and `role: "admin"`.

### `GET /admin/users`

Accepts optional `search`, `status`, and `sort` query parameters. It returns
safe users plus summary counts (`total`, `active`, `locked`, `deactivated`, and
`administrators`). Text search covers public identity fields. User objects do
not contain `passwordHash`.

A signed-in non-administrator receives `403 ADMIN_REQUIRED`.

### `PATCH /admin/users/:userId/status`

```json
{ "status": "locked" }
```

The only accepted values are `active` and `locked`. Returns the updated safe user
and summary. Errors:

- `422 VALIDATION_ERROR` for an unsupported status or malformed body.
- `404 USER_NOT_FOUND` for an unknown account.
- `409 CANNOT_LOCK_SELF` when an administrator tries to lock their own account.

An already-authenticated user who becomes locked receives `423 ACCOUNT_LOCKED`
on their next protected request. Locking removes outstanding reset challenges;
unlocking permits a fresh login. A same-status update is a no-op and does not
invalidate the administrator's session.

Deactivated accounts remain visible for audit/history but cannot be reactivated
through this route.

## Password reset and deactivation page controllers

These are normal form routes rather than `/api` JSON routes. `POST
/forgot-password` creates one random, expiring reset challenge and stores only
its SHA-256 digest. The response does not reveal whether the email exists. In
local classroom mode it exposes a demonstration link; public deployment must
deliver the link through a private mail service. `POST /reset-password`
atomically consumes a valid challenge and changes the bcrypt password hash, so
expiry and replay are rejected. Password/status changes increment the User's
`authVersion`, so older signed-in sessions are rejected. `POST
/deactivate-account` requires the signed
in user plus an explicit confirmation checkbox, changes status to
`deactivated`, and destroys the session.
The last active administrator is protected from self-deactivation so the
installation cannot be left without an account-management path.

## Common errors

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_JSON` | Body is not valid JSON |
| `401` | `AUTH_REQUIRED` | No authenticated session |
| `401` | `SESSION_INVALID` | Session refers to a missing user |
| `403` | `ADMIN_REQUIRED` | Current account is not an administrator |
| `403` | `ACCOUNT_DEACTIVATED` / `ACCOUNT_UNAVAILABLE` | Account may no longer create a session |
| `404` | `API_ROUTE_NOT_FOUND` | Unknown `/api` route |
| `413` | `PAYLOAD_TOO_LARGE` | JSON body exceeds the 1.5 MB request limit |
| `422` | `VALIDATION_ERROR` | Request fields failed validation |
| `423` | `ACCOUNT_LOCKED` | Current account is locked |
| `429` | `RATE_LIMITED` | Too many requests to a protected public endpoint |
| `500` | `INTERNAL_ERROR` | Unexpected server error; details are not exposed |

All API responses include `Cache-Control: no-store`.
