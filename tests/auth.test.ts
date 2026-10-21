import jwt from "jsonwebtoken";
import request from "supertest";
import { signToken } from "../src/auth";
import { makeTestApp, PASSWORD, testConfig } from "./helpers";

afterEach(() => jest.restoreAllMocks());

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

describe("register", () => {
  test("creates an analyst, never returns the password hash, and stores a bcrypt hash", async () => {
    const { app, db } = makeTestApp();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "New Person", email: "  New.Person@Test.Example ", password: "a-good-password" })
      .expect(201);
    expect(res.body).toMatchObject({ name: "New Person", email: "new.person@test.example", role: "analyst" });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(res.body.id) as { password_hash: string };
    expect(row.password_hash).toMatch(/^\$2[aby]\$/); // a bcrypt hash
    expect(row.password_hash).not.toContain("a-good-password");
  });

  test("duplicate email is 409, whatever the letter case", async () => {
    const { app } = makeTestApp();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Copy", email: "A@TEST.EXAMPLE", password: "a-good-password" })
      .expect(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  test.each([
    ["password too short", { name: "X", email: "x@test.example", password: "short" }],
    ["password over 72 bytes", { name: "X", email: "x@test.example", password: "p".repeat(73) }],
    ["invalid email", { name: "X", email: "not-an-email", password: "a-good-password" }],
    ["missing name", { email: "x@test.example", password: "a-good-password" }],
    ["trying to choose the admin role", { name: "X", email: "x@test.example", password: "a-good-password", role: "admin" }],
  ])("%s is rejected with 400", async (_label, body) => {
    const { app, db } = makeTestApp();
    const before = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;
    const res = await request(app).post("/api/auth/register").send(body).expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n).toBe(before);
  });
});

describe("login", () => {
  test("returns a token that works, and never the password hash", async () => {
    const { app } = makeTestApp();
    const res = await request(app).post("/api/auth/login").send({ email: "a@test.example", password: PASSWORD }).expect(200);
    expect(res.body).toMatchObject({ token_type: "Bearer", user: { id: 2, role: "analyst" } });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    const me = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${res.body.token}`).expect(200);
    expect(me.body).toMatchObject({ id: 2, email: "a@test.example" });
  });

  test("wrong password and unknown email give the same 401 (no account enumeration)", async () => {
    const { app } = makeTestApp();
    const wrong = await request(app).post("/api/auth/login").send({ email: "a@test.example", password: "wrong-password" }).expect(401);
    const unknown = await request(app).post("/api/auth/login").send({ email: "nobody@test.example", password: PASSWORD }).expect(401);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(unknown.body).toEqual(wrong.body);
  });

  test("missing fields are 400", async () => {
    const { app } = makeTestApp();
    await request(app).post("/api/auth/login").send({ email: "a@test.example" }).expect(400);
  });
});

describe("protected routes", () => {
  test("/health stays public", async () => {
    const { app } = makeTestApp();
    await request(app).get("/health").expect(200);
  });

  test("no token is 401 UNAUTHENTICATED on every incident route", async () => {
    const { app } = makeTestApp();
    for (const call of [
      () => request(app).get("/api/incidents"),
      () => request(app).post("/api/incidents").send({}),
      () => request(app).get("/api/incidents/1"),
      () => request(app).patch("/api/incidents/1").send({}),
      () => request(app).delete("/api/incidents/1"),
      () => request(app).post("/api/incidents/1/updates").send({}),
      () => request(app).get("/api/incidents/1/updates"),
      () => request(app).get("/api/auth/me"),
    ]) {
      const res = await call().expect(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("a header that is not 'Bearer <token>' is 401 UNAUTHENTICATED", async () => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/incidents").set("Authorization", "Basic abc").expect(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  test.each([
    ["garbage token", () => ({ Authorization: "Bearer not.a.token" })],
    ["token signed with another secret", () => ({ Authorization: `Bearer ${jwt.sign({ role: "admin" }, "some-other-secret-of-sufficient-length", { subject: "1", algorithm: "HS256" })}` })],
    ["unsigned token (alg none)", () => ({ Authorization: `Bearer ${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "1", role: "admin" })}.` })],
    ["token for a user that does not exist", () => ({ Authorization: `Bearer ${signToken({ id: 999, role: "admin" }, testConfig)}` })],
  ])("%s is 401 INVALID_TOKEN", async (_label, headers) => {
    const { app } = makeTestApp();
    const res = await request(app).get("/api/incidents").set(headers()).expect(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  test("an expired token is 401 TOKEN_EXPIRED", async () => {
    const { app } = makeTestApp();
    const expired = jwt.sign({ role: "analyst", exp: Math.floor(Date.now() / 1000) - 60 }, testConfig.jwtSecret, {
      subject: "2",
      algorithm: "HS256",
    });
    const res = await request(app).get("/api/incidents").set("Authorization", `Bearer ${expired}`).expect(401);
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });

  test("the role comes from the database, not the token (a forged admin claim does nothing)", async () => {
    const { app } = makeTestApp();
    const forged = jwt.sign({ role: "admin" }, testConfig.jwtSecret, { subject: "2", algorithm: "HS256" }); // user 2 is an analyst
    const created = (await request(app).post("/api/incidents").set("Authorization", `Bearer ${forged}`).send({ title: "Mine", description: "d", severity: "low" }).expect(201)).body;
    await request(app).delete(`/api/incidents/${created.id}`).set("Authorization", `Bearer ${forged}`).expect(403);
  });
});
