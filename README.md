# SentinelDesk API

Security incident management API for SOC teams. BuildLab Cohort 4, Backend Development track.

**Problem:** incidents get lost between shifts. SentinelDesk keeps one record of each incident: who owns it, what was investigated and what changed.

**Stack:** Node.js, Express, TypeScript, SQLite (better-sqlite3), Zod, Jest + Supertest. Week 2 adds bcrypt + JWT auth.

> **Week 1 has no authentication.** `created_by` (incidents) and `author_id` (updates) are sent in the request body as a **temporary development stand-in**. They are only checked for "this user exists" and are never a trusted identity: anyone can send any user id. Week 2 removes both fields and reads the user from the verified JWT. Use dummy data only and do not expose this build publicly.

## Run it (clean machine, Node.js 22 or later)

```bash
git clone https://github.com/5LIM3/sentineldesk.git && cd sentineldesk
npm install
cp .env.example .env
npm run seed      # runs migrations, adds dummy data (only if the database is empty)
npm run dev       # http://localhost:3000
```

On Windows, if `npm install` fails with a node-gyp error, run `npm install --ignore-scripts`.

Production build: `npm run build && npm start`. Type check: `npm run typecheck`.

## Tests

```bash
npm test
```

Jest + Supertest, each test on a fresh in-memory database. Covered: foreign keys on for every connection, `ON DELETE CASCADE` (deleting an incident deletes its updates), `RESTRICT` on users who authored history, CRUD and status codes, validation errors, status rules, all-or-nothing status changes and history order. Authentication and authorisation tests arrive with auth in Week 2.

## Endpoints

| Method | Path | Success |
|---|---|---|
| GET | `/health` | 200 |
| POST | `/api/incidents` | 201 |
| GET | `/api/incidents` (filters: `status`, `severity`, `assigned_to`; `page`, `limit`) | 200 |
| GET | `/api/incidents/:id` | 200 |
| PATCH | `/api/incidents/:id` (title, description, severity, assigned_to; not status) | 200 |
| DELETE | `/api/incidents/:id` (also deletes its updates) | 204 |
| POST | `/api/incidents/:id/updates` (note, optional `new_status`) | 201 |
| GET | `/api/incidents/:id/updates` (oldest first) | 200 |

Errors: `400` validation or bad id, `404` not found, `409` invalid status move. Full details in [`docs/api-spec.md`](docs/api-spec.md).

## Sample requests

[`requests.http`](requests.http) (VS Code REST Client) or the curl examples below.

```bash
curl "http://localhost:3000/api/incidents?severity=high"

curl -X POST http://localhost:3000/api/incidents -H 'Content-Type: application/json' \
  -d '{"title":"Suspicious DNS tunnelling","description":"High volume TXT queries","severity":"high","created_by":2}'

# change status through the history (records previous and new status)
curl -X POST http://localhost:3000/api/incidents/2/updates -H 'Content-Type: application/json' \
  -d '{"author_id":3,"note":"Picked up, checking the link in a sandbox.","new_status":"investigating"}'

curl "http://localhost:3000/api/incidents/2/updates"
```

## Seed data

`npm run seed` creates 3 dummy users (id 1 Ada Admin, id 2 Tunde Analyst, id 3 Chioma Analyst), 4 incidents and 6 updates. It does nothing if the database already has users. To start over, stop the server, delete the files in `data/` that end in `.db`, `.db-shm` or `.db-wal`, and run `npm run seed` again.

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

## Hosting and data persistence

SQLite is a file. If the host wipes the file system, the data is gone. **The seed script is not a safeguard**: it only creates initial demo data when the database is empty, and it cannot bring back records people created after seeding. Persistence needs a persistent disk or volume, mounted and used as the database location (`DB_PATH` must point inside it).

Provider notes from their docs (not yet tested; re-check and test persistence before deploying, plans change):

| Host | Persistent storage |
|---|---|
| Render | Disks attach to **paid** services only. Without one the file system is lost on every redeploy or restart. A disk limits the service to one instance and brings a few seconds of downtime per deploy. |
| Fly.io | Volumes cost $0.15/GB/month; the pricing page lists no free compute tier. |
| Railway | Volumes exist on Free and Trial (0.5 GB default). The docs I read do not say what happens to volume data when a trial ends, so confirm before relying on it. |

Decision rule before deploying: pick a host, confirm the disk is available on the plan, mount it, set `DB_PATH` inside it, create a record, redeploy, and confirm the record survived. If no persistent disk can be had, the deployed instance is labelled a **disposable demo** here and a run guide is the primary deliverable. Free hosts also sleep when idle, so the first request after a pause can be slow.

## Known limitations (Week 1)

- **No authentication.** `created_by` and `author_id` come from the request body and are not a trusted identity. Do not expose this build publicly.
- **No roles enforced.** The `admin` and `analyst` roles exist in the data, but any caller can create, change or delete incidents.
- **No rate limiting and no CORS policy** yet.
- **Not deployed.** Run it locally using the steps above.
- **SQLite needs a persistent disk** when hosted (see Hosting above).
- Users cannot be created through the API yet; the seed script provides the dummy users.

## Week 1 status

| Task | Where |
|---|---|
| Idea one-pager, work plan, ERD, API spec | [`docs/`](docs) |
| Schema, migrations, seed data | `src/db.ts`, `src/seed.ts` |
| Incident CRUD, validation | `src/routes/incidents.ts`, `src/validation.ts` |
| Investigation history, transactional status changes | `POST` / `GET /api/incidents/:id/updates` |
| Automated tests | `tests/` |
| Auth, roles, replacing temporary user ids | Week 2 |
| Swagger docs, full coverage note, rate limiting, deploy | Week 3 |

## Notes
- All data is dummy. Seed users have an unusable placeholder password hash until bcrypt lands in Week 2.
- Errors always use `{ "error": { "code", "message" } }`; stack traces are never sent to clients.
