import request from "supertest";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db";
import { makeTestApp, newIncident, PASSWORD } from "./helpers";

afterEach(() => jest.restoreAllMocks());

const ORIGIN = "https://app.example.com";

describe("security headers", () => {
  test("responses carry hardening headers and do not advertise Express", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/health").expect(200);
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });
});

describe("CORS", () => {
  test("by default no origin is allowed: no CORS headers are sent", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/health").set("Origin", "https://evil.example").expect(200);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("a listed origin is allowed, an unlisted one is not", async () => {
    const { app } = makeTestApp({ corsOrigins: [ORIGIN] });
    const ok = await request(app).get("/health").set("Origin", ORIGIN).expect(200);
    expect(ok.headers["access-control-allow-origin"]).toBe(ORIGIN);
    const other = await request(app).get("/health").set("Origin", "https://evil.example").expect(200);
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("a preflight request from a listed origin is answered with the allowed methods and headers", async () => {
    const { app } = makeTestApp({ corsOrigins: [ORIGIN] });
    const res = await request(app)
      .options("/api/incidents")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "authorization,content-type")
      .expect(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
    expect(res.headers["access-control-allow-headers"]).toMatch(/authorization/i);
  });

  test("a preflight request from an unlisted origin gets no permission", async () => {
    const { app } = makeTestApp({ corsOrigins: [ORIGIN] });
    const res = await request(app)
      .options("/api/incidents")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "POST");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test.each(["*", "https://app.example.com/", "app.example.com", "https://app.example.com/path", "null"])(
    "loadConfig refuses CORS_ORIGINS=%s",
    (bad) => {
      expect(() => loadConfig({ JWT_SECRET: "x".repeat(32), CORS_ORIGINS: bad })).toThrow(/CORS_ORIGINS/);
    }
  );

  test("loadConfig accepts a list of exact origins", () => {
    const cfg = loadConfig({ JWT_SECRET: "x".repeat(32), CORS_ORIGINS: `${ORIGIN}, http://localhost:5173` });
    expect(cfg.corsOrigins).toEqual([ORIGIN, "http://localhost:5173"]);
  });
});

describe("rate limiting on auth routes", () => {
  const wrong = { email: "a@test.example", password: "wrong-password" };

  test("repeated failed logins are blocked with 429 and a Retry-After header", async () => {
    const { app } = makeTestApp({ authRateLimit: { windowMs: 60_000, max: 3 } });
    for (let i = 0; i < 3; i++) await request(app).post("/api/auth/login").send(wrong).expect(401);
    const blocked = await request(app).post("/api/auth/login").send(wrong).expect(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  test("once blocked, even the correct password is refused until the window passes", async () => {
    const { app } = makeTestApp({ authRateLimit: { windowMs: 60_000, max: 2 } });
    for (let i = 0; i < 2; i++) await request(app).post("/api/auth/login").send(wrong).expect(401);
    await request(app).post("/api/auth/login").send({ email: "a@test.example", password: PASSWORD }).expect(429);
  });

  test("successful logins are not counted, so normal use is never blocked", async () => {
    const { app } = makeTestApp({ authRateLimit: { windowMs: 60_000, max: 2 } });
    for (let i = 0; i < 6; i++) {
      await request(app).post("/api/auth/login").send({ email: "a@test.example", password: PASSWORD }).expect(200);
    }
  });

  test("sign-up is limited too (every attempt counts)", async () => {
    const { app } = makeTestApp({ authRateLimit: { windowMs: 60_000, max: 2 } });
    for (let i = 0; i < 2; i++) {
      await request(app).post("/api/auth/register").send({ name: "N", email: `n${i}@test.example`, password: PASSWORD }).expect(201);
    }
    const res = await request(app).post("/api/auth/register").send({ name: "N", email: "n9@test.example", password: PASSWORD }).expect(429);
    expect(res.body.error.code).toBe("TOO_MANY_REQUESTS");
  });

  test("other routes are not rate limited by the auth limiter", async () => {
    const { app, t } = makeTestApp({ authRateLimit: { windowMs: 60_000, max: 1 } });
    for (let i = 0; i < 5; i++) await request(app).get("/api/incidents").set(t.a).expect(200);
  });

  test.each([
    ["AUTH_RATE_LIMIT_MAX", "0"],
    ["AUTH_RATE_LIMIT_MAX", "abc"],
    ["AUTH_RATE_LIMIT_WINDOW_MINUTES", "0"],
    ["TRUST_PROXY", "-1"],
  ])("loadConfig refuses %s=%s", (name, value) => {
    expect(() => loadConfig({ JWT_SECRET: "x".repeat(32), [name]: value })).toThrow(name);
  });
});

describe("input handling (injection and oversized input)", () => {
  test("SQL-looking text is stored as plain text and does not break anything", async () => {
    const { app, db, t } = makeTestApp();
    const evil = "'); DROP TABLE incidents; --";
    const created = await request(app).post("/api/incidents").set(t.a).send(newIncident({ title: evil })).expect(201);
    expect(created.body.title).toBe(evil);
    const list = await request(app).get("/api/incidents").set(t.a).expect(200);
    expect(list.body.data[0].title).toBe(evil);
    expect((db.prepare("SELECT COUNT(*) AS n FROM incidents").get() as { n: number }).n).toBe(1);
  });

  test("SQL-looking filter values are rejected by validation, never reach the query", async () => {
    const { app, t } = makeTestApp();
    await request(app).get("/api/incidents").query({ status: "open' OR '1'='1" }).set(t.a).expect(400);
    await request(app).get("/api/incidents/1%20OR%201=1").set(t.a).expect(400);
  });

  test("a body over 100 kB is refused with 413", async () => {
    const { app, t } = makeTestApp();
    const res = await request(app).post("/api/incidents").set(t.a).send({ title: "x".repeat(150_000) }).expect(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  test("malformed JSON is 400 INVALID_JSON", async () => {
    const { app, t } = makeTestApp();
    const res = await request(app).post("/api/incidents").set(t.a).set("Content-Type", "application/json").send("{bad").expect(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
});

describe("performance basics", () => {
  test("the newest-first list order is served by an index", () => {
    const { db } = makeTestApp();
    const plan = db
      .prepare("EXPLAIN QUERY PLAN SELECT * FROM incidents ORDER BY created_at DESC, id DESC LIMIT 20")
      .all() as { detail: string }[];
    expect(plan.map((r) => r.detail).join(" ")).toContain("idx_incidents_created_at");
  });

  test("every filtered column has an index", () => {
    const { db } = makeTestApp();
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(["idx_incidents_status", "idx_incidents_severity", "idx_incidents_assigned_to", "idx_updates_incident", "idx_incidents_created_at"])
    );
  });

  test("lists are paginated and the page size is capped", async () => {
    const { app, t } = makeTestApp();
    for (let i = 0; i < 3; i++) await request(app).post("/api/incidents").set(t.a).send(newIncident({ title: `Incident ${i}` })).expect(201);
    const res = await request(app).get("/api/incidents?limit=2&page=2").set(t.a).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    await request(app).get("/api/incidents?limit=101").set(t.a).expect(400);
  });

  test("the migration is recorded and re-running it changes nothing", () => {
    const db = openDb(":memory:");
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    const { migrate } = require("../src/db");
    migrate(db);
    migrate(db);
    expect((db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number }).n).toBe(2);
  });
});

describe("configuration and failure handling", () => {
  test.each([[undefined], [""], ["too-short"]])("loadConfig refuses JWT_SECRET=%p (no default secret)", (secret) => {
    expect(() => loadConfig({ JWT_SECRET: secret })).toThrow(/JWT_SECRET/);
  });

  test("behind a proxy (TRUST_PROXY=1) each client IP gets its own rate-limit counter", async () => {
    const { app } = makeTestApp({ trustProxy: 1, authRateLimit: { windowMs: 60_000, max: 2 } });
    const wrong = { email: "a@test.example", password: "wrong-password" };
    for (let i = 0; i < 2; i++) {
      await request(app).post("/api/auth/login").set("X-Forwarded-For", "203.0.113.5").send(wrong).expect(401);
    }
    await request(app).post("/api/auth/login").set("X-Forwarded-For", "203.0.113.5").send(wrong).expect(429);
    // a different client behind the same proxy is not affected
    await request(app).post("/api/auth/login").set("X-Forwarded-For", "203.0.113.9").send(wrong).expect(401);
  });

  test("an unexpected server error returns a generic 500 and leaks nothing", async () => {
    const { app, db, t } = makeTestApp();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    db.close(); // simulate the database going away
    const res = await request(app).get("/api/incidents").set(t.a).expect(500);
    expect(res.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
  });
});
