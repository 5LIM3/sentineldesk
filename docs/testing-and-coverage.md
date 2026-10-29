# Testing and coverage note (Task 3.1)

## How to run

```bash
npm test                 # all tests, one command
npm run test:coverage    # same, plus a coverage report
```

Jest + Supertest. Every test builds its own in-memory SQLite database with the real migrations, so tests
never touch `data/` and never need a `.env` file. Nothing is shared between tests.

## Result

**108 tests in 5 files, all passing on both machines used.** Coverage, measured on each:

| Measure | Linux, Node 22 | Windows, Node 24 |
|---|---|---|
| Statements | 98.73% (701 of 710) | 98.73% (701 of 710) |
| Branches | 94.63% (141 of 149) | 94.59% (140 of 148) |
| Functions | 100% (24 of 24) | 100% (23 of 23) |

The two reports differ by one branch and one function. Coverage counts come from the V8 engine, and the exact
number of branches and functions it reports varies slightly between Node versions and platforms. The tests and
the code are the same, and the results (108 passing) are identical.

## What is tested

| File | Tests | What it checks |
|---|---|---|
| `tests/incidents.test.ts` | 40 | CRUD and status codes; validation errors in the standard format; filters and pagination; status changes recorded with previous and new status; invalid moves return 409 and save nothing; history oldest first; all 25 status moves (5 x 5) against the documented table |
| `tests/integrity.test.ts` | 5 | Foreign keys on for every connection; deleting an incident deletes its updates and only its own; authors of history cannot be deleted; orphan rows rejected by the database |
| `tests/auth.test.ts` | 19 | Register (hash stored, never returned, duplicates in any letter case, weak or oversized passwords, no role escalation); login (same 401 for wrong password and unknown email); no, malformed, forged, unsigned, expired and unknown-user tokens; a forged admin claim is ignored |
| `tests/permissions.test.ts` | 11 | Creator and author come from the token, never the body; creator, assignee and admin may change an incident and other analysts get 403; claiming an unassigned incident (and what a claim may not do); delete is admin only; reads are open to any logged-in user |
| `tests/security.test.ts` | 33 | Security headers; CORS allow list and preflight; rate limiting on login and sign-up (including Retry-After, and that successful logins are not counted); proxy IP handling; SQL-looking input; oversized body (413) and bad JSON (400); the sort index is used; pagination caps; configuration refuses a missing JWT secret, `*` in CORS and bad limits; a database failure returns a generic 500 |

Failure cases covered: **400, 401, 403, 404, 409, 413, 429 and 500**.

## What is not covered, and why

**Excluded from the coverage report:** `src/server.ts`, `src/migrate.ts` and `src/seed.ts`. They only start the
server, run migrations or insert demo data. They were checked by running them (including from a fresh clone
and against the compiled production build), not by the test suite.

**Lines the tests do not reach (about 1% of statements):**

- The check in `openDb()` that fails if SQLite cannot enable foreign keys. It cannot be triggered with a
  supported SQLite build.
- The `catch` in sign-up for two people registering the same email at the same instant. Reproducing the race
  reliably would need artificial timing. The email check and the database UNIQUE constraint both exist.
- A branch for a token whose payload is plain text instead of JSON. Tokens we sign are always objects.

**Not tested at all:**

- Behaviour in real browsers. CORS is tested at the HTTP header level only.
- Load or concurrency. The index benchmark in `docs/security-and-performance.md` is a one-off measurement, not a test.
- A deployed server, a file-based database on a host, or more than one server instance (the rate limiter keeps
  its counters in memory, per instance).
- Token revocation and logout (not implemented).
- Password hashing speed: tests use a low bcrypt cost (4) to stay fast; the real default is 10.

## How far to trust the numbers

Coverage shows which lines ran, not that they are correct. To check that the tests can actually fail, key
rules were broken on purpose and the suite was re-run each time: removing the admin-only delete, removing the
ownership check, allowing every CORS origin, removing the login rate limit, counting successful logins, removing
the security headers and removing the list index each made tests fail. The Windows machine used for development
also passes all tests.

## Dependency advisories (`npm audit`)

Checked with `npm audit` (everything) and `npm audit --omit=dev` (what actually runs in production):

- **Production dependencies** had 2 advisories, both inside Express's own dependencies: `body-parser` (high,
  denial of service through extra bytes after a compressed request body) and `qs` (moderate, in `qs.stringify`,
  which this API does not use). Fixed with `npm audit fix`, which only updated the lockfile (`body-parser`
  2.3.0 to 2.4.0, `qs` 6.16.0 to 6.17.1) without changing any code or version ranges. The production audit now
  reports **0 vulnerabilities** and all 108 tests still pass.
- **5 low-severity advisories remain**, all in the Jest test tooling (`jest` and its parts, through
  `deepmerge`). They are development tools only and are not installed in production. The only offered fix is
  `npm audit fix --force`, which would install a breaking Jest version, so it was deliberately not run.
- New advisories appear over time, so these results are a snapshot. Run both audits again before deploying.

