# Project Documentation

## TODO
- batch endpoints
- error rollback
- hash validation

## Monorepo layout
- `packages/api`: Express API (Google OAuth, sync, user data)
- `pages/popup`: Chrome extension popup (React + Vite)
- `packages/shared`: Shared types and utilities (`@extension/shared`)
- Additional internal packages: HMR, env, i18n, ui, etc.

## OAuth flow (Google)
1. Popup requests `GET /api/auth/google` to obtain the Google authorization URL.
2. Popup opens a Chrome popup window to the auth URL.
3. Backend handles `GET /api/auth/callback` and responds with an HTML success page that embeds the JWT and email in the URL fragment.
4. Popup polls the window’s tabs; when it detects the callback URL, it reads the fragment (`#jwt=...&email=...`), persists the token to `chrome.storage.local`, and closes the window.
5. JWT is used for authenticated API requests.

Notes
- This approach avoids a second token-exchange call from the popup and prevents `invalid_grant` errors (auth codes are single-use).
- The popup includes persistent in-app debug logging stored in `chrome.storage.local`.

## Popup scope (current)
- ICS link input and display.
- Preferences button (placeholder; full UI deferred).
- Manual sync section with progress and report display.
- Authentication state and debug log viewer.

## Shared types
All cross-surface types live in `packages/shared` and are imported as `@extension/shared`.
- `lib/types/canvas.ts`: Canvas-related types
- `lib/types/preferences.ts`: `SyncPreferences`, `DEFAULT_PREFERENCES`
- `lib/types/sync-reports.ts`: `SyncReport`, `TaskSyncReport`, `CentralSyncReport`
- `lib/types/index.ts`: re-exports with `.js` extensions for NodeNext compatibility

## API surface (current)
- `GET /api/auth/google` – Generate Google OAuth URL
- `GET /api/auth/callback` – OAuth callback (HTML success/error; success sets `#jwt` fragment)
- `GET /api/user/ics-url` – Get user’s ICS URL
- `PUT /api/user/ics-url` – Set or update ICS URL
- `DELETE /api/user/ics-url` – Remove ICS URL
- `GET /api/user/preferences` – Get sync preferences
- `PUT /api/user/preferences` – Update sync preferences
- `GET /api/user/canvas-metadata` – Fetch Canvas metadata (for future prefs UI)
- `POST /api/sync` – Perform centralized sync and return `CentralSyncReport`

## Data and sync model
- ICS parsing and classification happen on the backend.
- Event types are simplified to two reliable categories based on Canvas UID:
  - `assignment`
  - `event`
- Sync returns a `CentralSyncReport` describing created/updated/deleted entities.

## Storage and state
- Popup stores `token`, `userEmail`, `debugLogs`, and small UI state in `chrome.storage.local`.
- Backend persists user records, preferences, and any sync metadata via Prisma/PostgreSQL.

## Development
- Frontend uses Vite; environment variables are inlined at build time. After editing `.env`, rebuild the popup.
- HMR tooling can be started with the workspace scripts; ensure the HMR port is available.
- For local OAuth, set `GOOGLE_REDIRECT_URI` to `http://localhost:3001/api/auth/callback` and configure the OAuth client accordingly.

## Error handling
- Popup shows user-friendly errors and writes persistent debug logs to aid OAuth troubleshooting.
- Backend returns structured JSON for API clients; the OAuth callback returns HTML with status and fragment data.

## Pending work
- Finish preferences UI (auto-sync, color coding, task organization, auto-archive).
- Clean up legacy CRUD endpoints and code paths no longer used.
- Implement/verify token refresh handling.
- Error handling and rollback during sync.
- Tests for sync logic, preference validation, and ICS parsing.
- Optimize for large ICS feeds.
- Remove `api/src/types` directory remnants (types now live in `@extension/shared`).

## Quick reference
- Frontend API base: `VITE_API_URL` (e.g., `http://localhost:3001/api`)
- OAuth endpoints: `/api/auth/google`, `/api/auth/callback`
- User endpoints: `/api/user/ics-url`, `/api/user/preferences`, `/api/user/canvas-metadata`
- Sync endpoint: `/api/sync`
