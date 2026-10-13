# Work plan

| Week | Delivery |
|---|---|
| 1 | Repo, ERD, API spec, SQLite schema and migrations (foreign keys enforced, cascade delete), seed data, incident CRUD, investigation-history endpoints with transactional status changes and defined status transitions (no auth yet), sample requests, tag `week-1` |
| 2 | Respond to mentor feedback, register/login (bcrypt + JWT), protected routes, replace the temporary body-supplied `created_by` / `author_id` with the JWT user, ownership and admin checks, one error format, issue log, tag `week-2` |
| 3 | Jest + Supertest suite, Swagger/README docs, rate limiting and CORS, index review, deploy on a host with a verified persistent disk, security notes, final package, tag `week-3` |

## Top 3 risks and mitigations

1. **Scope creep (dashboard).** Out of scope. Not started until the API is deployed.
2. **Auth/permissions bugs in Week 2.** Roles already exist in the schema, so Week 2 only adds checks. The temporary body-supplied user ids are removed in the same change, and tests assert a request cannot choose its own identity.
3. **SQLite data loss on a free host.** A seed script only creates initial data; it cannot restore records after a host wipes storage. Mitigation: verify persistent disk support on the chosen plan *before* deploying, mount it and point `DB_PATH` inside it, redeploy once to prove records survive. If no persistent disk is available, the deployment is labelled a disposable demo in the README. Checked options are listed in the README.
