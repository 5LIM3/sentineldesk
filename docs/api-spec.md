# API spec

> **Week 1 identity is temporary.** `created_by` and `author_id` are sent in the request body because there is no authentication yet. They are a development stand-in, never trusted identity. Week 2 removes them and uses the JWT.

Error format everywhere: `{ "error": { "code": "...", "message": "...", "details": [...]? } }`. Stack traces and internals are never returned.

## Endpoints

| Method | Path | Purpose | Success | Errors | Week |
|---|---|---|---|---|---|
| GET | /health | Liveness check | 200 | | 1 |
| POST | /api/incidents | Create (`title`, `description`, `severity`, `created_by`*, `assigned_to?`). Starts as `open` | 201 | 400 | 1 |
| GET | /api/incidents | List; `?status=&severity=&assigned_to=&page=&limit=` (limit max 100) | 200 | 400 | 1 |
| GET | /api/incidents/:id | One incident | 200 | 400 bad ID, 404 | 1 |
| PATCH | /api/incidents/:id | Partial update of `title`, `description`, `severity`, `assigned_to`. **Not `status`** | 200 | 400, 404 | 1 |
| DELETE | /api/incidents/:id | Delete incident and, by cascade, its updates (admin only from Week 2) | 204 | 400, 404 | 1 |
| POST | /api/incidents/:id/updates | Add a note (`note`, `author_id`*) with optional `new_status`. One transaction | 201 | 400, 404, 409 | 1 |
| GET | /api/incidents/:id/updates | History, **oldest first**; `?page=&limit=` (default 50, max 100) | 200 | 400, 404 | 1 |
| POST | /api/auth/register | Sign up | 201 | 400, 409 | 2 |
| POST | /api/auth/login | Log in, returns JWT | 200 | 400, 401 | 2 |

\* Temporary Week 1 field, removed in Week 2 when the user comes from the JWT. Week 2 also adds 401/403 to the protected routes.

## Status changes

Status moves only through `POST /api/incidents/:id/updates` with `new_status`. The server reads the current status, checks the move against the allowed transitions (README, "Incident statuses"), then in **one transaction** inserts the history row and updates the incident. A rejected move changes nothing.

Request:

```json
{ "author_id": 2, "note": "Host isolated, imaging disk.", "new_status": "contained" }
```

Response `201` (note `previous_status` is filled in by the server):

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
| 400 | VALIDATION_ERROR | Body, query or `:id` fails Zod validation (`details` lists each field) |
| 400 | INVALID_REFERENCE | `created_by`, `assigned_to` or `author_id` is not an existing user |
| 400 | STATUS_VIA_UPDATES | `status` sent to PATCH; use the updates endpoint |
| 400 | INVALID_JSON | Body is not valid JSON |
| 404 | INCIDENT_NOT_FOUND / ROUTE_NOT_FOUND | Unknown incident or route |
| 409 | INVALID_STATUS_TRANSITION | Move not allowed from the current status (`details` has `from`, `to`, `allowed`) |
| 413 | PAYLOAD_TOO_LARGE | Body over 100 kB |
| 500 | INTERNAL_ERROR | Unexpected error; generic message only |

List response shape: `{ "data": [...], "pagination": { "page", "limit", "total", "totalPages" } }`
