# Security and performance notes (Task 3.2)

## Security

| Area | What is done | Where |
|---|---|---|
| Secrets | Only in environment variables. No default JWT secret: the server refuses to start without `JWT_SECRET` (32+ characters). `.env` is git-ignored; `.env.example` has no values | `src/config.ts`, `.gitignore` |
| Passwords | bcrypt (`bcryptjs`), cost 10. 8 to 72 bytes (bcrypt ignores the rest, so longer is rejected). Hash is never returned or logged | `src/routes/auth.ts`, `src/validation.ts` |
| Login | Same `401` for wrong password and unknown email, with a dummy hash comparison so timing does not reveal accounts | `src/routes/auth.ts` |
| Tokens | JWT, HS256 only (algorithm pinned on verify), 1 hour expiry. The user and role are re-read from the database on every request, so a deleted user or changed role takes effect immediately | `src/auth.ts` |
| Authorisation | Creator, assignee or admin may change an incident; delete is admin only; creator and author come from the token. Admin cannot be requested through the API | `src/routes/incidents.ts` |
| Input validation and sanitisation | Every body, query and path parameter goes through Zod. Unknown fields are rejected, text is trimmed, lengths and enums are enforced, ids must be positive integers | `src/validation.ts` |
| SQL injection | All queries use bound parameters; user input is never concatenated into SQL. Filter values must match an enum or integer. Covered by tests | `src/routes/` |
| Cross-site scripting | The API returns JSON only, with `X-Content-Type-Options: nosniff`. Text is stored as given, so any client that shows it must escape it | `helmet` |
| CORS | Deliberate allow list: `CORS_ORIGINS` holds exact origins. Empty by default, which sends no CORS headers. `*` and non-origin values are refused at startup | `src/app.ts`, `src/config.ts` |
| Rate limiting | Login: failed attempts only. Sign-up: every attempt. Default 10 per 15 minutes per IP, then `429` with `Retry-After`. Set `TRUST_PROXY=1` on a host so each client has its own counter | `src/routes/auth.ts` |
| Security headers | `helmet` defaults (HSTS, nosniff, frame and referrer protections). `X-Powered-By` removed | `src/app.ts` |
| Errors | One format, generic message for unexpected errors, no stack traces. Request body capped at 100 kB | `src/errors.ts` |
| Data integrity | Foreign keys enforced on every connection; cascade delete of history; status changes and history saved in one transaction | `src/db.ts` |

### Remaining risks

- **Rate limiting is per server instance and in memory.** It resets when the server restarts, and several
  instances would each count separately. Users behind one shared IP address share one counter.
- **No logout or token revocation.** A stolen token works until it expires (1 hour).
- **No account lockout, password reset, email verification or multi-factor sign-in.**
- **Team-wide read access** is deliberate (shift handover) but means any logged-in user sees every incident.
- **Not deployed**, so HTTPS and hosting settings are untested. Serve it over HTTPS in production.
- **Dependencies:** `npm audit` reports moderate advisories in Jest's dev tooling only; none in production packages.
  Re-check before deploying.

## Performance

- **Pagination everywhere.** Lists take `page` and `limit`. Incident lists default to 20, history to 50,
  both capped at 100. A bigger `limit` is rejected, not silently cut.
- **Indexes** match how the data is read:

| Index | Serves |
|---|---|
| `idx_incidents_status`, `idx_incidents_severity`, `idx_incidents_assigned_to` | the `status`, `severity` and `assigned_to` filters |
| `idx_incidents_created_at (created_at DESC, id DESC)` | the newest-first order of the incident list |
| `idx_updates_incident (incident_id, id)` | loading one incident's history in order |
| primary keys and the unique `email` index | lookups by id and login |

- **SQLite** runs in WAL mode, queries use prepared statements, and the body size is capped.

### Measured effect of the list index

One-off benchmark: 100,000 incidents in an in-memory SQLite database, Node 22, average of 200 runs
for a page of 20.

| Query | Without the index | With the index |
|---|---|---|
| Newest 20 incidents | 40.7 ms (full scan and sort) | 0.03 ms (reads in index order) |
| Newest 20 with `status=open` | 13.0 ms | 11.9 ms (little change) |

Plan before: `SCAN incidents / USE TEMP B-TREE FOR ORDER BY`. Plan after: `SCAN incidents USING INDEX idx_incidents_created_at`.

Limits of this measurement: synthetic data spread evenly across statuses, in memory rather than on a disk,
one machine. It shows the direction and rough size of the gain, not production numbers.

**Honest finding:** the new index does not help filtered lists much. A composite index such as
`(status, created_at DESC, id DESC)` would, and is the next step if filtered lists become slow.
Deep pages use `OFFSET`, which slows as the page number grows; for very large data a cursor-based page would be better.
