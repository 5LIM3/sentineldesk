# Issue log

Problems found while building, the options considered and what was done. Newest entries last.

| # | Week | Issue | Options considered | Decision / fix |
|---|---|---|---|---|
| 1 | 1 | `npm install` failed on Windows: `better-sqlite3` tried to compile with node-gyp and no Windows SDK was installed | Install the Visual Studio Windows SDK; switch to Node's built-in SQLite; skip the compile step | The package ships a prebuilt Windows binary, so `npm install --ignore-scripts` is enough. Added to the README |
| 2 | 1 | First `git push` was rejected because the GitHub repo had been created with a README | Merge the unrelated histories; delete and recreate the repo; force push | The remote held only the auto-generated README, so a force push on that empty remote was safe |
| 3 | 1 | In the demo, the "not allowed transition" request returned 201 instead of 409 | Change the rules; change the demo order | Rules are right: `investigating -> resolved` is allowed. Run the 409 request before the status change and reseed before each run |
| 4 | 1 | The `week-1` tag pointed at an older commit than the final one | Leave it; move the tag | Checked with `git rev-parse` and `git ls-remote`, moved the tag before submitting, verified it on GitHub |
| 5 | 1 | The shared Google Drive folder contained project files including `.env` | Leave it; delete only `.env` | Deleted all code files (the code lives on GitHub) and uploaded the PDFs only; checked the sharing settings |
| 6 | 2 | Where should the JWT secret come from? A default in the code would be public with the repo | Hard-coded default; random secret per start; required environment variable | Required `JWT_SECRET` (32+ characters). The server refuses to start without it. `.env.example` explains how to generate one |
| 7 | 2 | The native `bcrypt` package would hit the same node-gyp problem as issue 1 on Windows | `bcrypt` (native); `argon2` (native); `bcryptjs` (pure JavaScript) | Used `bcryptjs`: same bcrypt algorithm, installs everywhere with no compiler |
| 8 | 2 | bcrypt silently ignores everything after 72 bytes of a password | Truncate; hash first with SHA-256; reject long passwords | Reject passwords over 72 bytes with a 400, so users are never misled |
| 9 | 2 | Login could reveal which emails have accounts (different error, faster response for unknown emails) | Specific errors; one generic error | One `401 INVALID_CREDENTIALS` for both cases, and a dummy hash comparison for unknown emails |
| 10 | 2 | A token could carry a stale or forged role | Trust the role inside the token; read the user from the database on each request | The user and role are read from the database every request, and the token algorithm is pinned to HS256 |
| 11 | 2 | With ownership checks, an unassigned incident had nobody allowed to work on it | Let any analyst edit anything; admin must assign everything; allow a claim | Added a narrow claim rule: an analyst may assign an unassigned incident to themselves, and nothing else in that request |
| 12 | 2 | Registration could be used to ask for the admin role | Accept a role field and check it; ignore it; reject it | The registration schema is strict, so a `role` field is rejected with 400. Admin comes only from the seed script |
