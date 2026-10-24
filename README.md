# SentinelDesk API

Security incident management API for SOC teams - A REST API for SOC teams to track security incidents ownership,investigation notes, and status-change history. Built for the BuildLab Cohort 4 Backend Development track.

**Problem:** incidents can lose context during shift handovers.
SentinelDesk keeps the incident record, owner, investigation updates,
and status history together.

## Stack

Node.js, Express, TypeScript, SQLite (`better-sqlite3`), Zod,
`bcryptjs`, JWT, Jest, and Supertest.

> **Authentication (Week 2).** Register or log in to get a JWT, then send `Authorization: Bearer <token>` on every incident route. The creator and author of records are the logged-in user, never fields in the request body. Analysts can change only incidents they created or are assigned to, and only admins can delete. Use dummy data only.

## Status

-   **Implemented:** incident CRUD, JWT authentication, authorization,
    validation, investigation history, status-transition rules, seed
    data, and automated tests.
-   **Local verification reported:** 75 tests passed across 4 Jest
    suites; `npm run typecheck` and `npm run build` completed
    successfully.
-   **Not deployed:** use the local setup below to evaluate the API.
-   **Planned for Week 3:** rate limiting, CORS configuration, expanded
    API documentation, and deployment.

## Run locally

Prerequisites: Node.js 22 or later and npm.

``` bash
git clone https://github.com/5LIM3/sentineldesk.git
cd sentineldesk
npm install
```

Copy `.env.example` to `.env`.

**PowerShell**

``` powershell
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**macOS/Linux**

``` bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the generated value into `JWT_SECRET` in `.env`. The secret must be
at least 32 characters. Never commit `.env` or share its contents.

Then run:

``` bash
npm run seed
npm run dev
```

The API runs at `http://localhost:3000` by default. Check `GET /health`.

Build and type-check:

``` bash
npm run typecheck
npm run build
npm start
```

Run `npm start` after building. Use `npm run dev` for development.

**Windows installation note:** if `npm install` fails, inspect the full
error and Node.js/npm versions first. Do not use
`npm install --ignore-scripts` as a generic fix: dependencies may need
install-time scripts to prepare native modules. After any workaround,
verify that `npm run seed` and the server start successfully.

## Tests

``` bash
npm test
```

The reported local result is **75 passing tests across 4 suites**. The
suite uses Jest and Supertest with a fresh in-memory database for each
test. Coverage includes:

-   **Database integrity:** foreign-key enforcement, cascade deletion of
    incident updates, and restrictions on deleting users who authored
    history.
-   **Incident workflow:** CRUD behaviour, validation, status
    transitions, history ordering, and atomic status/history changes.
-   **Authentication:** registration, password hashing,
    duplicate/invalid input, login failures, and missing, malformed,
    forged, expired, or invalid-user tokens.
-   **Authorization:** identity from the token, creator/assignee/admin
    permissions, claiming an unassigned incident, and admin-only
    deletion.

Test coverage is useful evidence, not a guarantee that every possible
security issue has been eliminated.

## API endpoints

All endpoints except `GET /health`, `POST /api/auth/register`, and
`POST /api/auth/login` require a valid bearer token.

  ------------------------------------------------------------------------------------
  Method            Path                           Access            Success
  ----------------- ------------------------------ ----------------- -----------------
  GET               `/health`                      Public            `200`

  POST              `/api/auth/register`           Public            `201`

  POST              `/api/auth/login`              Public            `200`

  GET               `/api/auth/me`                 Authenticated     `200`

  POST              `/api/incidents`               Authenticated     `201`

  GET               `/api/incidents`               Authenticated;    `200`
                                                   filters and       
                                                   pagination        

  GET               `/api/incidents/:id`           Authenticated     `200`

  PATCH             `/api/incidents/:id`           Admin, creator,   `200`
                                                   or assignee,      
                                                   subject to update 
                                                   rules             

  DELETE            `/api/incidents/:id`           Admin only        `204`

  POST              `/api/incidents/:id/updates`   Admin, creator,   `201`
                                                   or assignee       

  GET               `/api/incidents/:id/updates`   Authenticated     `200`
  ------------------------------------------------------------------------------------

Incident list filters: `status`, `severity`, and `assigned_to`;
pagination parameters: `page` and `limit`. `PATCH /api/incidents/:id`
cannot change status directly. Submit status changes through
`POST /api/incidents/:id/updates` so they are recorded in the history.

See [`docs/api-spec.md`](docs/api-spec.md) for details and
[`requests.http`](requests.http) for sample requests (VS Code REST
Client).

### Error format

Errors use a consistent structure:

``` json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation"
  }
}
```

Common codes: `400` invalid input or ID; `401` missing/invalid
authentication; `403` not permitted; `404` not found; `409` conflict
such as duplicate email or invalid status transition.

## Example workflow

1.  Register or log in to receive a JWT.
2.  Send it in `Authorization: Bearer <token>`.
3.  Create an incident, assign an analyst, and add investigation notes.
4.  Submit status changes through the updates endpoint.
5.  Retrieve the update history to review what changed and who recorded
    it.

``` bash
curl -X POST http://localhost:3000/api/incidents \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Suspicious DNS tunnelling","description":"High volume TXT queries","severity":"high"}'
```

``` bash
curl -X POST http://localhost:3000/api/incidents/1/updates \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"note":"Host isolated; disk imaging started.","new_status":"contained"}'
```

Replace `<token>` with a real local login token and `1` with an incident
ID that exists in your database.

## Demo seed data

`npm run seed` adds demo data only when the database is empty: three
dummy users, four incidents, and six updates.

  ID   Name             Email                  Role
  ---- ---------------- ---------------------- -----------
  1    Ada Admin        `ada@example.com`      `admin`
  2    Tunde Analyst    `tunde@example.com`    `analyst`
  3    Chioma Analyst   `chioma@example.com`   `analyst`

All seed accounts use `Password123!`. This is a local demo credential
only; never use it for real accounts. Public registration always creates
an `analyst`; clients cannot self-register as admins.

To reset the local demo database, stop the server and remove the
database files in `data/` (including matching `-shm` and `-wal` files),
then run `npm run seed`. This deletes local data, so preserve anything
you need first.

## Incident statuses

  -----------------------------------------------------------------------
  Status                              Meaning
  ----------------------------------- -----------------------------------
  `open`                              Reported and not yet picked up

  `investigating`                     An analyst is actively
                                      investigating

  `contained`                         The threat is stopped from
                                      spreading; root-cause work may
                                      continue

  `resolved`                          Fixed and verified; awaiting final
                                      sign-off

  `closed`                            Finished; terminal status
  -----------------------------------------------------------------------

  From              Allowed next statuses
  ----------------- -----------------------------------
  `open`            `investigating`, `closed`
  `investigating`   `contained`, `resolved`, `closed`
  `contained`       `investigating`, `resolved`
  `resolved`        `closed`, `investigating`
  `closed`          None

Invalid and same-status transitions return
`409 INVALID_STATUS_TRANSITION`. Status changes are submitted through
the updates endpoint; the incident status and history record are saved
in one transaction.

## Data integrity

-   Foreign-key enforcement is enabled and checked when database
    connections are opened.
-   Deleting an incident cascades to its updates.
-   Users who authored history cannot be deleted while that history
    references them.
-   Update history is returned oldest first.

## Security decisions and limitations

-   Passwords are stored as bcrypt hashes using `bcryptjs`.
-   `JWT_SECRET` is required; there is no default secret.
-   Tokens use HS256, are verified with the expected algorithm, and
    expire after one hour.
-   The authenticated user and current role are re-read from the
    database on each request.
-   Unknown request fields, including privileged fields such as `role`
    and `created_by`, are rejected.
-   Unknown-email and incorrect-password login failures return the same
    status and error.
-   There is no logout endpoint or token-revocation list. A stolen token
    can be used until expiry, unless current database checks invalidate
    the user.
-   **Team-wide read access:** any authenticated user can read all
    incidents and their histories. This is intentional for shared SOC
    shift handovers; per-incident confidentiality is not implemented.
-   **Rate limiting and CORS:** not implemented yet; planned for Week 3.
-   **User administration:** there is no API for changing roles. The
    admin account is created by the seed script.
-   **Deployment:** not currently deployed.

## SQLite and deployment

SQLite stores data in a file. If a host clears or replaces its file
system, records can be lost. Seeding only creates initial demo data in
an empty database; it does not restore later records.

Before deploying, verify that the selected host and plan support
persistent storage, set `DB_PATH` inside the mounted volume, create a
record, redeploy, and confirm that the record survives. If persistent
storage is unavailable, describe the deployment as a disposable demo and
keep the local run guide as the dependable evaluation path. Verify
current provider documentation before choosing a host because plans and
storage policies change.

## Project documentation

-   [`docs/`](docs) --- planning and technical documents
-   [`docs/api-spec.md`](docs/api-spec.md) --- endpoint specification
-   [`docs/issue-log.md`](docs/issue-log.md) --- issue log
-   [`requests.http`](requests.http) --- sample requests

## Known limitations (Week 2)

- **Team-wide read access.** Any logged-in user can read every incident and its history. This is deliberate: a small SOC team needs shared visibility for shift handover. There is no per-incident confidentiality. If one were needed (for example an HR or insider-threat case), the next step would be a `confidential` flag limiting reads to the creator, assignee and admins.
- **No rate limiting and no CORS policy yet** (planned for Week 3), so login can currently be tried repeatedly.
- **Tokens cannot be revoked before they expire.** There is no logout or refresh token; they simply expire after 1 hour.
- **No user management API.** Roles cannot be changed through the API, and an admin account only comes from the seed script.
- **Not deployed.** Run it locally using the steps above.
- **SQLite needs a persistent disk** when hosted (see Hosting above).

## Notes
- All data is dummy.
- Errors always use `{ "error": { "code", "message" } }`; stack traces are never sent to clients.
