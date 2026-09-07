# Verification checklist

Use this checklist after a fresh `npm install`. A clean server restart restores
the documented seed before a demonstration.

## Automated checks

```powershell
npm test
npm run check
```

Expected result: every Node test passes and the static check reports five HTML
pages, eight browser modules, and five server modules. Investigate every failure;
do not hide or skip a test to obtain green output.

The integration suite binds an unused local port, so the normal development
server may remain on port 3000. It resets its own data before every test.

## Browser setup

1. Run `npm start` and open <http://127.0.0.1:3000/login.html>.
2. Open browser developer tools. Keep Console and Network visible.
3. Enable “Preserve log” only when following a redirect; otherwise clear old
   messages before each section.
4. Test at approximately 375 px, 768 px, and desktop width.

## Authentication

- Submit an empty form: field messages appear and focus reaches an invalid field.
- Enter a malformed email/username or wrong password: the page remains usable and
  displays the controlled server message.
- Kim's valid credentials produce the locked-account message.
- Dat's credentials sign in and redirect safely; refreshing preserves the session.
- Log out: the session is destroyed and a protected page redirects to login.
- Confirm Network responses never contain `password`, `hash`, or `salt`.

## Browse Items

- Confirm one `GET /api/products` retrieves all products.
- Search by name/description and try an invalidly long search.
- Change category, Wishlist status, and sort order; combine the controls.
- Refresh and confirm safe filter preferences restore from session storage.
- A no-match combination displays an empty state without a console error.
- Add Data Visualisation Bootcamp. The button becomes unavailable/already saved.
- A repeated add produces a controlled conflict and no duplicate card/count.
- Follow a deep link such as `wishlist-add.html#item-data-bootcamp`; the item is
  visibly identified and receives appropriate focus/scroll behavior.

## Wishlist and favourites

- Confirm saved, ready-for-cart, and purchased summaries match rendered lists.
- Move an item to cart; it changes group and counters update after the API reply.
- Mark items purchased from both Wishlist and cart states.
- Remove an item and confirm it disappears without affecting another item.
- Use Browse More and item links to return to the correct catalogue target.
- Exercise confirmation cancellation: no request or state change should occur.
- Remove/move enough items to reach an empty state and check that counters never
  become negative.
- Log in separately as Jay and verify Dat's items are not visible.

## Edit Profile

- Confirm the page loads the signed-in account rather than hard-coded Dat data.
- Test empty/one-character name, malformed email, and a description over 300
  characters. Client feedback should repair live; the server independently
  rejects equivalent invalid requests.
- Try Jay's email while signed in as Dat: the unique-email conflict is shown at
  the email field.
- Enter a new password without the current password, then with a wrong current
  password. No other changed field should persist after either failure.
- Save valid text changes and refresh to confirm server persistence.
- Save a valid password change, log out, and verify old credentials fail while
  the new password succeeds. Restart afterward to restore the seed password.
- If testing a profile image, accept only a JPG/PNG below the stated limit.
- Confirm text drafts may restore for the same account but never include password
  fields and never leak from Dat to Jay.

## Administration

- Dat sees three safe account records and accurate total/active/locked summaries.
- Search and status filtering work together without another server fetch.
- Attempt to lock Dat: the server rejects self-locking.
- Lock Jay. Jay's already-open authenticated page receives `423 ACCOUNT_LOCKED`
  on its next protected request.
- Unlock Jay and confirm a fresh Jay login succeeds.
- Sign in as Jay and visit/open the admin route: the UI blocks/redirects and a
  direct `GET /api/admin/users` receives `403 ADMIN_REQUIRED`.
- Confirm no administrative response contains password records.

## Accessibility and resilience

- Navigate every control using only Tab, Shift+Tab, Enter, Space, and arrow keys.
- Skip links move focus to `main-content`; focus indicators remain visible.
- Every input has an associated label and each validation message is referenced
  with `aria-describedby` where applicable.
- Status/error regions announce changes without moving focus unnecessarily.
- Images have useful alternatives or are correctly decorative.
- Resize/zoom to 200%; content remains readable without horizontal page overflow.
- Simulate Offline for an API request: loading controls recover and a retryable
  message appears instead of an unhandled promise rejection.
- Inspect Console: no errors, missing resources, mixed content, or accessibility
  warnings caused by the application.

## Final repository check

```powershell
git status --short
git diff --check
git diff --stat
```

- No `.env`, credentials, session files, logs, `node_modules`, or editor secrets
  are staged.
- `package-lock.json`, source, tests, documentation, and required images are staged.
- The report uses the supplied course template and includes the complete schema
  diagram, representative data, shared work, and every individual contribution.
- Every README responsibility row contains a teammate's full name, final module,
  and exact files/folders from the merged repository—no confirmation notes remain.
- AI-use acknowledgements are accurate and consistent with course requirements.
- Commit from the intended branch only after automated and manual checks pass.
