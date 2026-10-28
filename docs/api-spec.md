# API spec

Error format everywhere: `{ "error": { "code": "...", "message": "...", "details": [...]? } }`. Stack traces and internals are never returned.

## Authentication

- `POST /api/auth/register` and `POST /api/auth/login` are public (with `/health`). Every other route needs `Authorization: Bearer <token>`.
- Passwords: 8 to 72 bytes, stored only as a bcrypt hash. The hash is never returned by any endpoint.
- Token: JWT signed with HS256, expires after 1 hour by default (`JWT_EXPIRES_IN`). The user is re-read from the database on every request, so a deleted user's token stops working and the role used is always the current one.
- Everyone who registers is an `analyst`. The `admin` role cannot be requested through the API (it is created by the seed script).
- The creator of an incident and the author of an update are **the logged-in user**. Sending `created_by` or `author_id` is rejected with 400.
- `401` means "not logged in" (missing, malformed, invalid or expired token). `403` means "logged in, not allowed".

## Cross-origin and rate limits

- Browsers may call the API only from origins listed in `CORS_ORIGINS` (none by default).
- `POST /api/auth/login` (failed attempts) and `POST /api/auth/register` (all attempts) are limited per IP address (10 per 15 minutes by default), then return `429`.
- A machine-readable version of this spec is in `docs/openapi.yaml`.

## Who may do what

| Action | Allowed |
|---|---|
| Read incidents, lists and history | Any logged-in user |
| Create an incident | Any logged-in user |
| Update an incident (PATCH) or add an update (POST .../updates) | Admin, the incident's creator, or the analyst it is assigned to |
| Claim an unassigned incident | Any analyst may PATCH `{ "assigned_to": <their own id> }` on an incident nobody is assigned to (and nothing else) |
| Delete an incident | Admin only |

## Endpoints

| Method | Path | Purpose | Success | Errors |
|---|---|---|---|---|
| GET | /health | Liveness check (public) | 200 | |
| POST | /api/auth/register | Sign up (`name`, `email`, `password`). Creates an analyst | 201 | 400, 409 |
| POST | /api/auth/login | Log in (`email`, `password`). Returns a token | 200 | 400, 401 |
| GET | /api/auth/me | The logged-in user | 200 | 401 |
| POST | /api/incidents | Create (`title`, `description`, `severity`, `assigned_to?`). Starts as `open` | 201 | 400, 401 |
| GET | /api/incidents | List; `?status=&severity=&assigned_to=&page=&limit=` (limit max 100) | 200 | 400, 401 |
| GET | /api/incidents/:id | One incident | 200 | 400 bad ID, 401, 404 |
| PATCH | /api/incidents/:id | Partial update of `title`, `description`, `severity`, `assigned_to`. **Not `status`** | 200 | 400, 401, 403, 404 |
| DELETE | /api/incidents/:id | Delete incident and, by cascade, its updates. Admin only | 204 | 400, 401, 403, 404 |
| POST | /api/incidents/:id/updates | Add a note (`note`) with optional `new_status`. One transaction | 201 | 400, 401, 403, 404, 409 |
| GET | /api/incidents/:id/updates | History, **oldest first**; `?page=&limit=` (default 50, max 100) | 200 | 400, 401, 404 |

## Examples

Log in:

```json
POST /api/auth/login
{ "email": "tunde@example.com", "password": "Password123!" }
```

Response `200`:

```json
{ "token": "<jwt>", "token_type": "Bearer", "expires_in": "1h",
  "user": { "id": 2, "name": "Tunde Analyst", "email": "tunde@example.com", "role": "analyst" } }
```

## Status changes

Status moves only through `POST /api/incidents/:id/updates` with `new_status`. The server reads the current status, checks the move against the allowed transitions (README, "Incident statuses"), then in **one transaction** inserts the history row and updates the incident. A rejected move changes nothing.

Request (the author is the logged-in user, not a field):

```json
{ "note": "Host isolated, imaging disk.", "new_status": "contained" }
```

Response `201` (`author_id` and `previous_status` are filled in by the server):

```json
{
  "id": 7, "incident_id": 3, "author_id": 2,
  "note": "Host isolated, imaging disk.",
  "previous_status": "investigating", "new_status": "contained",
  "created_at": "2026-10-12T13:00:00.000Z"
}
```

A note-only update omits `new_status`; both status fields come back `null`.

## History order

`GET /api/incidents/:id/updates` returns `{ "data": [...], "pagination": {...} }` ordered oldest first (`ORDER BY id ASC`), so the first entry is the start of the investigation and the last is the most recent action.

## Error codes

| HTTP | code | When |
|---|---|---|
| 400 | VALIDATION_ERROR | Body, query or `:id` fails Zod validation (`details` lists each field). Includes unexpected fields such as `created_by`, `author_id` or `role` |
| 400 | INVALID_REFERENCE | `assigned_to` is not an existing user |
| 400 | STATUS_VIA_UPDATES | `status` sent to PATCH; use the updates endpoint |
| 400 | INVALID_JSON | Body is not valid JSON |
| 401 | UNAUTHENTICATED | No `Authorization: Bearer <token>` header |
| 401 | INVALID_TOKEN | Token is malformed, badly signed or belongs to a user that no longer exists |
| 401 | TOKEN_EXPIRED | Token has expired; log in again |
| 401 | INVALID_CREDENTIALS | Wrong email or password (same answer for both, so accounts cannot be guessed) |
| 403 | FORBIDDEN | Logged in but not allowed (see "Who may do what") |
| 404 | INCIDENT_NOT_FOUND / ROUTE_NOT_FOUND | Unknown incident or route |
| 409 | EMAIL_TAKEN | An account with that email exists (any letter case) |
| 409 | INVALID_STATUS_TRANSITION | Move not allowed from the current status (`details` has `from`, `to`, `allowed`) |
| 413 | PAYLOAD_TOO_LARGE | Body over 100 kB |
| 429 | TOO_MANY_REQUESTS | Too many failed logins (or sign-ups) from one IP address in the window. A `Retry-After` header says how long to wait |
| 500 | INTERNAL_ERROR | Unexpected error; generic message only |

List response shape: `{ "data": [...], "pagination": { "page", "limit", "total", "totalPages" } }`
