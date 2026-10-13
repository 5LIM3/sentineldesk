import type { DB } from "../src/db";
import { migrate, openDb } from "../src/db";
import { createApp } from "../src/app";

/** A fresh in-memory database (own connection, own data) with 3 dummy users: ids 1 admin, 2 and 3 analysts. */
export function makeTestApp(): { db: DB; app: ReturnType<typeof createApp> } {
  jest.spyOn(console, "log").mockImplementation(() => undefined); // silence "Applied migration"
  const db = openDb(":memory:");
  migrate(db);
  const insert = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
  insert.run("Test Admin", "admin@test.example", "!placeholder", "admin");
  insert.run("Test Analyst A", "a@test.example", "!placeholder", "analyst");
  insert.run("Test Analyst B", "b@test.example", "!placeholder", "analyst");
  return { db, app: createApp(db) };
}

export const newIncident = (overrides: Record<string, unknown> = {}) => ({
  title: "Suspicious login burst",
  description: "Many failed logins from one IP range.",
  severity: "high",
  created_by: 2,
  ...overrides,
});
