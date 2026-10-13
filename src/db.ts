import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const STATUSES = ["open", "investigating", "contained", "resolved", "closed"] as const;
export const ROLES = ["analyst", "admin"] as const;

/**
 * The ONLY place a database connection is created (server, migrate, seed all call this).
 *
 * SQLite does not enforce foreign keys unless asked, and the setting is per connection,
 * so it is switched on here and then read back. If it is not on, we refuse to start
 * rather than run with ON DELETE CASCADE silently doing nothing.
 */
export function openDb(dbPath: string): DB {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  if (db.pragma("foreign_keys", { simple: true }) !== 1) {
    db.close();
    throw new Error("SQLite foreign key enforcement could not be enabled");
  }
  return db;
}

const STATUS_LIST_SQL = STATUSES.map((s) => `'${s}'`).join(",");

const migrations: { id: number; name: string; sql: string }[] = [
  {
    id: 1,
    name: "init",
    sql: `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('analyst','admin')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );

      -- Users are never hard-deleted while they own history: created_by / author_id are RESTRICT
      -- so the audit trail cannot lose its authors. A removed assignee just unassigns the incident.
      CREATE TABLE incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (${STATUS_LIST_SQL})),
        created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_incidents_status ON incidents(status);
      CREATE INDEX idx_incidents_severity ON incidents(severity);
      CREATE INDEX idx_incidents_assigned_to ON incidents(assigned_to);

      -- previous_status and new_status are both NULL (note only) or both set (a real status change).
      CREATE TABLE incident_updates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
        author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        note TEXT NOT NULL,
        previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN (${STATUS_LIST_SQL})),
        new_status TEXT CHECK (new_status IS NULL OR new_status IN (${STATUS_LIST_SQL})),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        CHECK ((previous_status IS NULL) = (new_status IS NULL)),
        CHECK (previous_status IS NULL OR previous_status <> new_status)
      );
      CREATE INDEX idx_updates_incident ON incident_updates(incident_id, id);
    `,
  },
];

export function migrate(db: DB): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
  const applied = new Set(
    (db.prepare("SELECT id FROM schema_migrations").all() as { id: number }[]).map((r) => r.id)
  );
  for (const m of migrations) {
    if (applied.has(m.id)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (id, name) VALUES (?, ?)").run(m.id, m.name);
    })();
    console.log(`Applied migration ${m.id}_${m.name}`);
  }
}
