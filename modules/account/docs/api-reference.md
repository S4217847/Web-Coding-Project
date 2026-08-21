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
    "id": "user-dat",
    "username": "dat.pham",
    "studentId": "S4221230",
    "name": "Dat Pham",
    "email": "s4221230@rmit.edu.vn",
    "role": "admin",
    "status": "active"
  }
}
```

Anonymous or locked sessions receive `authenticated: false` and `user: null`.

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

The wrong-credential response deliberately does not reveal whether the identity
or password was responsible.

### `DELETE /session`

Destroys the server session, clears the cookie, and returns `200` with
`authenticated: false`.

## Products

### `GET /products`

Requires an active session. Returns the complete five-product collection and a
count. Each product includes its public catalogue fields, statistics, and
`isWishlisted` for the current user.

Query parameters are intentionally ignored. Assessment filtering and sorting
are performed on the retrieved collection in browser JavaScript.

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

The server moves/removes the relation, adjusts product counters, and returns the
new item/purchase plus summary. Errors include `422 VALIDATION_ERROR`,
`404 WISHLIST_ITEM_NOT_FOUND`, and `409 ALREADY_IN_CART`.

### `DELETE /wishlist/:productId`

Removes the current user's Wishlist/cart relation and decrements the appropriate
counter without allowing a negative value. Returns `removedProductId` and the
new summary. A missing or another user's relation returns
`404 WISHLIST_ITEM_NOT_FOUND`.

## Profile

### `GET /profile`

Requires an active session and returns `{ "profile": safeUser }`. The safe user
presenter excludes the password record, hash, and salt.

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
- New password: 8–128 characters with uppercase, lowercase, and a number; the
  current password is mandatory.
- Avatar: local `/images/`, HTTPS URL, or a bounded JPG/PNG Data URL where used.

Errors include `422 VALIDATION_ERROR`, `409 EMAIL_IN_USE`, and
`422 INVALID_CURRENT_PASSWORD`. Validation and authorization complete before
the allowed user fields are applied.

## Administration

These routes require both an active session and `role: "admin"`.

### `GET /admin/users`

Returns users sorted by display name plus summary counts (`total`, `active`,
`locked`, and `administrators`). User objects pass through the same safe
presenter and contain no password records.

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
on their next protected request. Unlocking permits a fresh login.

## Common errors

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_JSON` | Body is not valid JSON |
| `401` | `AUTH_REQUIRED` | No authenticated session |
| `401` | `SESSION_INVALID` | Session refers to a missing user |
| `403` | `ADMIN_REQUIRED` | Current account is not an administrator |
| `404` | `API_ROUTE_NOT_FOUND` | Unknown `/api` route |
| `413` | `PAYLOAD_TOO_LARGE` | JSON body exceeds the 1.5 MB request limit |
| `422` | `VALIDATION_ERROR` | Request fields failed validation |
| `423` | `ACCOUNT_LOCKED` | Current account is locked |
| `500` | `INTERNAL_ERROR` | Unexpected server error; details are not exposed |

All API responses include `Cache-Control: no-store`.
