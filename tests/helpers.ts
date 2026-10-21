import bcrypt from "bcryptjs";
import { signToken } from "../src/auth";
import { createApp } from "../src/app";
import type { AppConfig } from "../src/config";
import type { DB } from "../src/db";
import { migrate, openDb } from "../src/db";

export const PASSWORD = "Password123!"; // dummy test password

export const testConfig: AppConfig = {
  jwtSecret: "test-secret-for-jest-only-".repeat(2),
  jwtExpiresIn: "1h",
  bcryptRounds: 4, // fastest allowed: tests do not need slow hashing
};

/**
 * A fresh in-memory database (own connection, own data) with 4 dummy users:
 * id 1 admin, id 2 analyst A, id 3 analyst B, id 4 analyst C (an outsider in permission tests).
 * `t.admin`, `t.a`, `t.b`, `t.c` are ready-made Authorization headers: `.set(t.a)`.
 */
export function makeTestApp() {
  jest.spyOn(console, "log").mockImplementation(() => undefined); // silence "Applied migration"
  const db: DB = openDb(":memory:");
  migrate(db);

  const hash = bcrypt.hashSync(PASSWORD, testConfig.bcryptRounds);
  const insert = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
  insert.run("Test Admin", "admin@test.example", hash, "admin");
  insert.run("Test Analyst A", "a@test.example", hash, "analyst");
  insert.run("Test Analyst B", "b@test.example", hash, "analyst");
  insert.run("Test Analyst C", "c@test.example", hash, "analyst");

  const header = (id: number, role: "admin" | "analyst") => ({
    Authorization: `Bearer ${signToken({ id, role }, testConfig)}`,
  });
  const t = {
    admin: header(1, "admin"),
    a: header(2, "analyst"),
    b: header(3, "analyst"),
    c: header(4, "analyst"),
  };
  return { db, app: createApp(db, testConfig), t };
}

export const newIncident = (overrides: Record<string, unknown> = {}) => ({
  title: "Suspicious login burst",
  description: "Many failed logins from one IP range.",
  severity: "high",
  ...overrides,
});
