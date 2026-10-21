# SentinelDesk API

Security incident management API for SOC teams. BuildLab Cohort 4, Backend Development track.

**Problem:** incidents get lost between shifts. SentinelDesk keeps one record of each incident: who owns it, what was investigated and what changed.

**Stack:** Node.js, Express, TypeScript, SQLite (better-sqlite3), Zod, bcrypt (bcryptjs), JWT, Jest + Supertest.

> **Authentication (Week 2).** Register or log in to get a JWT, then send `Authorization: Bearer <token>` on every incident route. The creator and author of records are the logged-in user, never fields in the request body. Analysts can change only incidents they created or are assigned to, and only admins can delete. Use dummy data only.

## Run it (clean machine, Node.js 22 or later)

```bash
git clone https://github.com/5LIM3/sentineldesk.git && cd sentineldesk
npm install
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # prints a secret
# open .env and paste it after JWT_SECRET=   (the server will not start without it)
npm run seed      # runs migrations, adds dummy data (only if the database is empty)
npm run dev       # http://localhost:3000
```

On Windows, if `npm install` fails with a node-gyp error, run `npm install --ignore-scripts`.

Production build: `npm run build && npm start`. Type check: `npm run typecheck`.

## Tests

```bash
npm test
```

Jest + Supertest, each test on a fresh in-memory database (no `.env` needed). Covered:

- **Integrity:** foreign keys on for every connection, `ON DELETE CASCADE` (deleting an incident deletes its updates), `RESTRICT` on users who authored history.
- **CRUD and rules:** status codes, validation errors, status transitions, all-or-nothing status changes, history order.
- **Authentication:** register (hashing, duplicate and invalid input, no role escalation), login (same error for wrong password and unknown email), missing, malformed, forged, expired and unknown-user tokens, `401` on every protected route.
- **Authorisation:** identity comes from the token, creator / assignee / admin may change an incident while other analysts get `403`, claiming an unassigned incident, delete is admin only.

## Endpoints

| Method | Path | Access | Success |
|---|---|---|---|
| GET | `/health` | public | 200 |
| POST | `/api/auth/register` | public | 201 |
| POST | `/api/auth/login` | public | 200 |
| GET | `/api/auth/me` | logged in | 200 |
| POST | `/api/incidents` | logged in | 201 |
| GET | `/api/incidents` (filters: `status`, `severity`, `assigned_to`; `page`, `limit`) | logged in | 200 |
| GET | `/api/incidents/:id` | logged in | 200 |
| PATCH | `/api/incidents/:id` (title, description, severity, assigned_to; not status) | admin, creator or assignee | 200 |
| DELETE | `/api/incidents/:id` (also deletes its updates) | admin only | 204 |
| POST | `/api/incidents/:id/updates` (note, optional `new_status`) | admin, creator or assignee | 201 |
| GET | `/api/incidents/:id/updates` (oldest first) | logged in | 200 |

Errors: `400` validation or bad id, `401` not logged in or bad token, `403` not allowed, `404` not found, `409` duplicate email or invalid status move. Full details in [`docs/api-spec.md`](docs/api-spec.md).

An analyst may also **claim** an unassigned incident by sending `PATCH { "assigned_to": <own id> }`. Nothing else can be changed in that request.

## Sample requests

[`requests.http`](requests.http) (VS Code REST Client) or the curl examples below.

```bash
# log in (demo account from the seed data) and keep the token
curl -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"tunde@example.com","password":"Password123!"}'

# use it on every other request
curl "http://localhost:3000/api/incidents?severity=high" -H "Authorization: Bearer <token>"

curl -X POST http://localhost:3000/api/incidents -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
  -d '{"title":"Suspicious DNS tunnelling","description":"High volume TXT queries","severity":"high"}'

# change status through the history (records previous and new status; the author is the logged-in user)
curl -X POST http://localhost:3000/api/incidents/1/updates -H "Authorization: Bearer <token>" -H 'Content-Type: application/json' \
  -d '{"note":"Host isolated, imaging disk.","new_status":"contained"}'

curl "http://localhost:3000/api/incidents/1/updates" -H "Authorization: Bearer <token>"
```

## Seed data

`npm run seed` creates 3 dummy users, 4 incidents and 6 updates. It does nothing if the database already has users. To start over, stop the server, delete the files in `data/` that end in `.db`, `.db-shm` or `.db-wal`, and run `npm run seed` again.

| Id | Name | Email | Role |
|---|---|---|---|
| 1 | Ada Admin | ada@example.com | admin |
| 2 | Tunde Analyst | tunde@example.com | analyst |
| 3 | Chioma Analyst | chioma@example.com | analyst |

All three share the dummy password `Password123!`. It exists only so the API can be tried out locally; it is not a real credential and must never be used for anything real. New accounts made with `POST /api/auth/register` are always analysts.

## Incident statuses

| Status | Meaning |
|---|---|
| `open` | Reported, not yet picked up. Every new incident starts here. |
| `investigating` | An analyst is actively working it. |
| `contained` | The threat is stopped from spreading, root cause still being worked. |
| `resolved` | Fixed and verified; waiting for final sign-off. |
| `closed` | Finished. **Terminal**: no further status changes. |

Allowed moves (anything else returns `409 INVALID_STATUS_TRANSITION`, and a move to the same status is also rejected):

| From | Can move to |
|---|---|
| `open` | `investigating`, `closed` (e.g. false alarm) |
| `investigating` | `contained`, `resolved`, `closed` |
| `contained` | `investigating` (re-opened analysis), `resolved` |
| `resolved` | `closed`, `investigating` (fix did not hold) |
| `closed` | none |

The table lives in code at `src/status.ts`, so each rule can be tested. Status changes only through `POST /api/incidents/:id/updates` with `new_status`; `PATCH` rejects `status`. Each change stores `previous_status` and `new_status`, and the history row and the incident's new status are saved in one transaction.

## Data rules

- Foreign keys are enforced on **every** connection: `openDb()` in `src/db.ts` runs `PRAGMA foreign_keys = ON`, reads it back, and refuses to start if it is off. The server, migration and seed scripts all use it.
- Deleting an incident cascades to its updates (`ON DELETE CASCADE`). Users who authored history cannot be deleted (`RESTRICT`).
- History is returned oldest first.

## Security notes

- Passwords are stored only as bcrypt hashes (`bcryptjs`, a pure JavaScript implementation, so it installs on Windows without a compiler). Passwords over 72 bytes are rejected because bcrypt ignores everything past that.
- There is no default JWT secret. `JWT_SECRET` must be set in `.env` (at least 32 characters) or the server refuses to start. `.env` is git-ignored; only `.env.example` is committed.
- Tokens use HS256 with the algorithm pinned on verification, expire after 1 hour, and the user and role are re-read from the database on every request.
- Wrong password and unknown email return the same `401`, and the unknown-email path still does a hash comparison, so accounts cannot be guessed from the response or its timing.
- The admin role cannot be requested through the API. Unknown fields (for example `role`, `created_by`, `author_id`) are rejected.

## Hosting and data persistence

SQLite is a file. If the host wipes the file system, the data is gone. **The seed script is not a safeguard**: it only creates initial demo data when the database is empty, and it cannot bring back records people created after seeding. Persistence needs a persistent disk or volume, mounted and used as the database location (`DB_PATH` must point inside it).

Provider notes from their docs (not yet tested; re-check and test persistence before deploying, plans change):

| Host | Persistent storage |
|---|---|
| Render | Disks attach to **paid** services only. Without one the file system is lost on every redeploy or restart. A disk limits the service to one instance and brings a few seconds of downtime per deploy. |
| Fly.io | Volumes cost $0.15/GB/month; the pricing page lists no free compute tier. |
| Railway | Volumes exist on Free and Trial (0.5 GB default). The docs I read do not say what happens to volume data when a trial ends, so confirm before relying on it. |

Decision rule before deploying: pick a host, confirm the disk is available on the plan, mount it, set `DB_PATH` inside it, create a record, redeploy, and confirm the record survived. If no persistent disk can be had, the deployed instance is labelled a **disposable demo** here and a run guide is the primary deliverable. Free hosts also sleep when idle, so the first request after a pause can be slow.

## Known limitations (Week 2)

- **No rate limiting and no CORS policy yet** (planned for Week 3), so login can currently be tried repeatedly.
- **Tokens cannot be revoked before they expire.** There is no logout or refresh token; they simply expire after 1 hour.
- **No user management API.** Roles cannot be changed through the API, and an admin account only comes from the seed script.
- **Not deployed.** Run it locally using the steps above.
- **SQLite needs a persistent disk** when hosted (see Hosting above).

## Status

| Task | Where |
|---|---|
| Idea one-pager, work plan, ERD, API spec | [`docs/`](docs) |
| Schema, migrations, seed data | `src/db.ts`, `src/seed.ts` |
| Incident CRUD, validation | `src/routes/incidents.ts`, `src/validation.ts` |
| Investigation history, transactional status changes | `POST` / `GET /api/incidents/:id/updates` |
| Authentication (register, login, JWT) | `src/auth.ts`, `src/routes/auth.ts` |
| Authorisation (roles, ownership, admin-only delete) | `src/auth.ts`, `src/routes/incidents.ts` |
| Automated tests | `tests/` |
| Issue log | [`docs/issue-log.md`](docs/issue-log.md) |
| Swagger docs, full coverage note, rate limiting, CORS, deploy | Week 3 |

## Notes
- All data is dummy.
- Errors always use `{ "error": { "code", "message" } }`; stack traces are never sent to clients.
