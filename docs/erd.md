# ERD

```mermaid
erDiagram
    USERS ||--o{ INCIDENTS : "creates (created_by)"
    USERS |o--o{ INCIDENTS : "assigned to (assigned_to)"
    USERS ||--o{ INCIDENT_UPDATES : "writes (author_id)"
    INCIDENTS ||--o{ INCIDENT_UPDATES : has
    USERS {
        int id PK
        text name
        text email UK
        text password_hash
        text role "analyst|admin"
        text created_at
    }
    INCIDENTS {
        int id PK
        text title
        text description
        text severity "low|medium|high|critical"
        text status "open|investigating|contained|resolved|closed"
        int created_by FK
        int assigned_to FK "nullable"
        text created_at
        text updated_at
    }
    INCIDENT_UPDATES {
        int id PK
        int incident_id FK
        int author_id FK
        text note
        text previous_status "nullable, set with new_status"
        text new_status "nullable, set with previous_status"
        text created_at
    }
```

One user creates many incidents. One incident has many updates. An incident may be unassigned (`assigned_to` is NULL).

## Design decisions

- **SQLite:** zero setup, easy test database, enough for the data size. Persistence on a host is a separate concern, see the README section "Hosting and data persistence".
- **Status changes keep both sides.** An update row stores `previous_status` and `new_status`, so the history reads as "investigating -> contained", not just "contained". Both columns are NULL for a note-only update and both are set for a status change (CHECK constraint), and they can never be equal.
- **One transaction.** Posting an update with `new_status` inserts the history row and changes `incidents.status` together (`BEGIN IMMEDIATE`). Either both are saved or neither. `previous_status` is read inside the same transaction, so it is always the status that was really replaced.
- **Status is only changed through updates.** `PATCH /api/incidents/:id` cannot set `status`. Result: an incident's status always equals the `new_status` of its latest status-changing update (or `open` if it has none). The allowed moves are defined in the README.
- **Delete cascades.** `incident_updates.incident_id` is `ON DELETE CASCADE`, so deleting an incident removes its history. SQLite only enforces foreign keys when asked, per connection, so `openDb()` runs `PRAGMA foreign_keys = ON` and reads it back; the app refuses to start if it is not on.
- **Authors are protected.** `created_by` and `author_id` are `ON DELETE RESTRICT`, so a user who wrote history cannot be deleted out from under it. `assigned_to` is `ON DELETE SET NULL`.
- **Enums are enforced twice:** Zod at the API edge and CHECK constraints in the database.
- **Identity comes from the token (Week 2).** `created_by` and `author_id` are set from the verified JWT, never from the request body, so nobody can write history or create incidents in someone else's name. They were a documented temporary stand-in in Week 1.
- **Passwords:** only a bcrypt hash is stored in `users.password_hash`. It is never returned by the API. Emails are stored lowercase, so the UNIQUE constraint also stops case variants.
- **Roles:** `users.role` is `analyst` or `admin`. Registration always creates an analyst; admin is created by the seed script. Permissions are checked per route (see the API spec, "Who may do what").
